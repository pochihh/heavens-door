import {splitCardSource} from '../card-source';
import {remapFilePath} from '../path-remap';
import {moveCardLinks} from '../card-links';
import {replaceViewSource,viewBlockRanges} from '../view-block';
import { ui } from '../text/ui';
import type { Board, Bridge, Card, Checkpoint, Mutation, Preferences, Snapshot, Deletion, TagField, TagValue } from '../shared';
import { UndoHistory } from './history';

function layout(board: Board) {
  return JSON.stringify([board.name,board.inbox,board.showMentions,board.mentionStyle,board.canvasColor,board.gridColor,
    board.cards.map(p => [p.id,p.cardId,p.x,p.y,p.width,p.height,p.folder,p.collapsed??false,p.autoHeight??true,p.object,p.fillColor,p.strokeColor,p.strokeWidth,p.strokeStyle]),
    board.edges]);
}

interface State {
  snapshot: Snapshot | null;
  draft: {card:Card;body:string;dirty:boolean;source?:string} | null;
  status: string;
  error: string;
  checkpoints: Checkpoint[];
  revision: number;
}
export class Session {
  state: State = {snapshot:null,draft:null,status:ui.status.ready,error:'',checkpoints:[],revision:0};
  fileClipboard:{root:string;path:string;cut:boolean}|null=null;
  viewTabs=new Map<string,string>();
  viewScrolls=new Map<string,{left:number;top:number}>();
  tagExpansion=new Map<string,{active?:string;last?:string}>();
  undoHistory = new UndoHistory();
  private newCards=new Set<string>();
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private preferencesTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPreferences: Partial<Preferences> = {};
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private checkpointTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(readonly bridge: Bridge) {}
  // Registered outside the React tree so renderer errors cannot strand Quit/Reload.
  connectWindow() {
    return this.bridge.onClosing(action => {
      void this.run(async () => { await this.flush(); this.bridge.finishClosing(action); })
        .catch(() => this.bridge.cancelClosing(action));
    });
  }
  resume() {
    return this.run(async () => {
      this.update({status:ui.status.openingWorkspace});
      const snapshot=await this.bridge.currentWorkspace();
      this.update({snapshot,status:ui.status.savedLocally});
    });
  }
  dispose() { clearTimeout(this.saveTimer); clearTimeout(this.checkpointTimer);clearTimeout(this.preferencesTimer);this.pendingPreferences={};this.newCards.clear(); }
  hasPendingPreferences(key:keyof Preferences){return key in this.pendingPreferences;}
  schedulePreferences(patch:Partial<Preferences>,root:string){
    if(root!==this.state.snapshot?.root)return;
    const navigation={...this.pendingPreferences.navigation};
    for(const [id,value] of Object.entries(patch.navigation??{})){const key=id as keyof typeof navigation;navigation[key]={...navigation[key],...value};}
    this.pendingPreferences={...this.pendingPreferences,...patch,navigation:Object.keys(navigation).length?navigation:undefined};
    if(!this.pendingPreferences.navigation)delete this.pendingPreferences.navigation;
    clearTimeout(this.preferencesTimer);
    this.preferencesTimer=setTimeout(()=>{void this.run(()=>this.flushPreferences()).catch(()=>undefined);},250);
  }
  async flushPreferences(){
    clearTimeout(this.preferencesTimer);
    if(!Object.keys(this.pendingPreferences).length)return;
    const patch=this.pendingPreferences;this.pendingPreferences={};
    if(patch.navigation){const navigation={...this.state.snapshot?.preferences?.navigation};for(const [id,value] of Object.entries(patch.navigation)){const key=id as keyof typeof navigation;navigation[key]={...navigation[key],...value};}patch.navigation=navigation;}
    try{const snapshot=await this.bridge.request<Snapshot>({kind:'preferences',patch});this.update({snapshot});}
    catch(error){
      const pending=this.pendingPreferences;this.pendingPreferences={...patch,...pending};
      if(patch.navigation||pending.navigation){
        const navigation={...patch.navigation};
        for(const [id,value] of Object.entries(pending.navigation??{})){const key=id as keyof typeof navigation;navigation[key]={...navigation[key],...value};}
        this.pendingPreferences.navigation=navigation;
      }
      throw error;
    }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getState = () => this.state;
  update(patch: Partial<State>) {
    this.state={...this.state,...patch,revision:this.state.revision+1};
    for (const listener of this.listeners) listener();
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue=next.catch(error => this.update({error:String(error),status:ui.status.needsAttention}));
    return next;
  }
  async open(demo: boolean,registeredRoot?:string) {
    return this.run(async () => {
      await this.flush();
      this.update({status:ui.status.openingWorkspace,error:''});
      const snapshot = await (registeredRoot ? this.bridge.openWorkspace(registeredRoot) : demo ? this.bridge.demo() : this.bridge.chooseWorkspace());
      if (snapshot) { this.dispose(); this.viewTabs.clear(); this.viewScrolls.clear(); this.undoHistory.clear(); this.update({snapshot,draft:null,checkpoints:[]}); }
      this.update({status:ui.status.savedLocally});
    });
  }
  private accept(result: Mutation,label: string,group=false) {
    this.undoHistory.record(label,result.edits,group,Date.now(),result.move);
    const draft=this.state.draft,info=result.snapshot.cards.find(c=>c.id===draft?.card.id);
    this.update({snapshot:result.snapshot,...(draft&&info&&info.path!==draft.card.path?{draft:{...draft,card:{...draft.card,...info}}}:{}),status:ui.status.savedLocally,error:''});
    clearTimeout(this.checkpointTimer);
    if (result.snapshot.historyAvailable) this.checkpointTimer=setTimeout(() => { void this.checkpoint(ui.history.automaticCheckpoint).catch(() => undefined); },5*60*1000);
  }
  private acceptCard(card:Card){
    const draft=this.state.draft;if(draft?.card.id!==card.id)return;
    if(draft.source!==undefined){
      // A concurrent header edit must conflict rather than overwrite newer metadata.
      if(splitCardSource(draft.source).header!==(draft.card.header??''))return;
      this.update({draft:{...draft,card,source:(card.header??'')+draft.body}});
    }else this.update({draft:{...draft,card}});
  }
  editAction(body:string,label:string){
    this.edit(body);
    return this.run(()=>this.flush(label));
  }
  edit(body: string) {
    const draft=this.state.draft;
    if (!draft || body === draft.body) return;
    this.update({draft:{...draft,body,source:draft.source===undefined?undefined:splitCardSource(draft.source).header+body,dirty:true},status:ui.status.editing});
    clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(() => { void this.run(() => this.flush(undefined,false)).catch(() => undefined); },600);
  }
  editSource(source:string){
    const draft=this.state.draft;if(!draft||source===(draft.source??(draft.card.header??'')+draft.body))return;
    this.update({draft:{...draft,body:splitCardSource(source).body,source,dirty:true},status:ui.status.editing});
    clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>{void this.run(()=>this.flush(undefined,false)).catch(()=>undefined);},600);
  }
  async flush(label?:string,finalizeTitle=true) {
    await this.flushPreferences();
    clearTimeout(this.saveTimer);
    while (this.state.draft?.dirty) {
      const draft=this.state.draft;
      this.update({status:ui.status.saving});
      const result=await this.bridge.request<Mutation&{card?:Card}>({kind:'saveCard',path:draft.card.path,body:draft.body,expected:draft.card.revision,...(draft.source===undefined?{}:{source:draft.source})});
      this.accept(result,label??ui.history.edit(draft.card.path),!label);
      const info=result.snapshot.cards.find(c => c.id === draft.card.id)!;
      const saved=draft.source===undefined?{header:draft.card.header,body:draft.body}:splitCardSource(draft.source);
      const card=result.card??{...info,...saved},current=this.state.draft!,dirty=current.body!==draft.body||current.source!==draft.source;
      this.update({draft:{card,body:current.body,...(dirty&&current.source!==undefined?{source:current.source}:{}),dirty}});
    }
    const draft=this.state.draft,card=draft?.card,info=card&&this.state.snapshot?.cards.find(c=>c.id===card.id);
    if(finalizeTitle&&draft&&card&&info&&this.newCards.has(card.id)&&info.title?.trim()&&!draft.dirty){
        const stem=Array.from(info.title.trim()).slice(0,50).join('').replace(/[<>:"/\\|?*]/g,' ').split('').filter(c=>c.charCodeAt(0)>=32).join('').replace(/^[. ]+|[. ]+$/g,'').slice(0,100).trim();
        if(stem&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)){
          const folder=card.path.slice(0,card.path.lastIndexOf('/')+1),names=new Set(this.state.snapshot!.cards.filter(c=>c.id!==card.id).map(c=>c.path.toLocaleLowerCase()));let name=stem,i=0;
          while(names.has((folder+name+'.md').toLocaleLowerCase()))name=stem+'_'+ ++i;
          const renamed=await this.bridge.request<Mutation>({kind:'renameCard',path:card.path,stem:name,expected:card.revision});this.accept(renamed,ui.history.edit(draft.card.path),true);this.newCards.delete(card.id);
        }
    }
  }
  select(path: string | null) {
    const id=this.state.snapshot?.cards.find(c=>c.path===path)?.id;
    return this.run(async () => {
      if(id)path=this.state.snapshot?.cards.find(c=>c.id===id)?.path??path;
      if (path && path === this.state.draft?.card.path) return;
      const card=path ? await this.bridge.request<Card>({kind:'card',path}) : null;
      // Keep accepting edits to the old card while the next card loads, then flush them.
      await this.flush();
      this.update({draft:card ? {card,body:card.body,dirty:false} : null});
    });
  }
  refresh() {
    return this.run(async () => {
      const snapshot=await this.bridge.request<Snapshot>({kind:'snapshot'});
      this.update({snapshot});
      const draft=this.state.draft;
      if (!draft) return;
      const info=snapshot.cards.find(c => c.id === draft.card.id);
      if(draft.dirty){if(info&&info.path!==draft.card.path)this.update({draft:{...draft,card:{...draft.card,path:info.path,name:info.name}}});return;}
      if (!info) { this.update({draft:null}); return; }
      if (info.revision !== draft.card.revision || info.path !== draft.card.path) {
        const card=await this.bridge.request<Card>({kind:'card',path:info.path});
        if (!this.state.draft?.dirty) this.update({draft:{card,body:card.body,dirty:false}});
      }
    });
  }
  templatePlan(template:string){return this.run(async()=>{await this.flush();return this.bridge.request<import('../templates').TemplatePlan>({kind:'templatePlan',template});});}
  ensureSystemGuide(id:import('../features').SystemEntry){return this.run(async()=>{
    await this.flushPreferences();const result=await this.bridge.request<Mutation&{path:string}>({kind:'ensureSystemGuide',id});this.update({snapshot:result.snapshot});return result.path;
  });}
  createFromTemplate(template:string,folder:string,stem:string,inputs:import('../templates').TemplateValues={}){return this.run(async()=>{
    await this.flush();await this.flushPreferences();
    const result=await this.bridge.request<Mutation>({kind:'createFromTemplate',template,folder,stem,inputs});this.accept(result,ui.journal.createdFromTemplate);
    return result.snapshot.cards.find(c=>result.edits.some(e=>e.path===c.path&&e.before===null))!;
  });}
  fileOperation(operation:import('../shared').FileOperation,label:string){return this.run(async()=>{
    await this.flush();await this.flushPreferences();
    return this.applyFileOperation(operation,label);
  });}
  private async applyFileOperation(operation:import('../shared').FileOperation,label:string){
    const result=await this.bridge.request<import('../shared').FileMutation>({kind:'fileOperation',operation});
    this.undoHistory.record(label,[],false,Date.now(),undefined,result.inverse);this.update({snapshot:result.snapshot,error:'',status:ui.status.savedLocally});
    const draft=this.state.draft,info=result.snapshot.cards.find(c=>c.id===draft?.card.id);if(draft){if(info){const card=await this.bridge.request<Card>({kind:'card',path:info.path}),current=this.state.draft;if(current?.card.id===draft.card.id)this.update({draft:{card,body:current.dirty&&operation.action==='move'?moveCardLinks(current.body,current.card.path,card.path,path=>remapFilePath(path,operation.path,result.path)):current.dirty?current.body:card.body,dirty:current.dirty}});}else if(draft.dirty)throw new Error(ui.errors.externalEdit(draft.card.path));else this.update({draft:null});}
    return result.path;
  }
  deleteBoard(folder:string,confirm:(names:string[])=>boolean|Promise<boolean>){return this.run(async()=>{
    await this.flush();const expected=await this.bridge.request<string>({kind:'prepareBoardTrash',folder});
    if(!await confirm([folder]))return false;
    await this.flush();await this.applyFileOperation({action:'trash',path:folder,expected},ui.whiteboard.delete);return true;
  });}
  restoreTrash(path:string,expected:string){return this.run(async()=>{await this.flush();const result=await this.bridge.request<Mutation>({kind:'restoreTrash',path,expected});this.accept(result,'Restore card');return result.snapshot.cards.find(c=>result.edits.some(e=>e.path===c.path&&e.before===null))!;});}
  trashCard(path:string,expected:string){return this.run(async()=>{await this.flush();const result=await this.bridge.request<Mutation>({kind:'trashCard',path,expected});this.accept(result,'Move card to Trash');if(this.state.draft?.card.path===path){if(this.state.draft.dirty)throw new Error(ui.errors.externalEdit(path));this.update({draft:null});}});}
  createTemplate(period?:import('../journal').JournalPeriod){return this.run(async()=>{
    await this.flush();await this.flushPreferences();const result=await this.bridge.request<Mutation>({kind:'createTemplate',period});this.accept(result,ui.journal.createTemplate);
    return result.snapshot.cards.find(c=>result.edits.some(e=>e.path===c.path&&e.before===null))!;
  });}
  openJournal(date:string,period:import('../journal').JournalPeriod,inputs:import('../templates').TemplateValues={}){return this.run(async()=>{
    await this.flush();await this.flushPreferences();const result=await this.bridge.request<Mutation&{path:string}>({kind:'openJournal',date,period,inputs});
    if(result.edits.length)this.accept(result,ui.journal.createJournal);
    return this.bridge.request<Card>({kind:'card',path:result.path});
  });}
  create(folder: string,stem: string,x:number,y:number,place=true) {
    return this.run(async () => {
      await this.flush();
      const result=await this.bridge.request<Mutation>({kind:'create',folder,stem,x,y,place});
      this.accept(result,ui.history.createCard);
      const path=result.edits.find(e => e.path.endsWith('.md'))!.path;
      const card=await this.bridge.request<Card>({kind:'card',path});
      this.newCards.add(card.id);this.update({draft:{card,body:card.body,dirty:false}});
    });
  }
  extractAssetNote(path:string,expected:string,note:string,folder:string,x:number,y:number){return this.run(async()=>{
    const before=this.state.snapshot?.cards.find(c=>c.path===path);if(before?.revision!==expected)throw new Error(ui.errors.externalEdit(path));
    await this.flush();
    const asset=this.state.snapshot?.cards.find(c=>c.id===before.id),board=this.state.snapshot?.boards.find(b=>b.folder===folder);
    if(!asset||!board)throw new Error(ui.errors.whiteboardMissing);
    const result=await this.bridge.request<Mutation>({kind:'extractAssetNote',path:asset.path,expected:asset.revision,note,folder,boardExpected:board.revision,x,y});this.accept(result,'Move asset note to card');
    if(this.state.draft?.card.id===asset.id){const card=await this.bridge.request<Card>({kind:'card',path:asset.path});this.update({draft:{card,body:card.body,dirty:false}});}
    return result.snapshot.cards.find(c=>result.edits.some(e=>e.before===null&&e.path===c.path))!;
  });}
  createSlipboxCard(name:string,placement?:{folder:string;x:number;y:number}){return this.run(async()=>{
    await this.flush();await this.flushPreferences();
    const board=placement&&this.state.snapshot?.boards.find(b=>b.folder===placement.folder);if(placement&&!board)throw new Error(ui.errors.whiteboardMissing);
    const result=await this.bridge.request<Mutation>({kind:'createSlipboxCard',name,board:placement?{...placement,expected:board!.revision}:undefined});this.accept(result,ui.history.createCard);
    return result.snapshot.cards.find(c=>result.edits.some(e=>e.before===null&&e.path===c.path))!;
  });}
  createViewCard(owner:import('../shared').ViewCardMove['owner'],view:string,choice:number,column?:string,date?:import('../shared').TagValue){
    return this.run(async()=>{
      const before=this.state.snapshot?.cards.find(c=>c.path===owner.path)??this.state.snapshot?.tags?.find(t=>t.path===owner.path);
      if(before?.revision!==owner.expected)throw new Error(ui.errors.externalEdit(owner.path));
      await this.flush();
      const current=this.state.snapshot?.cards.find(c=>c.path===owner.path)??this.state.snapshot?.tags?.find(t=>t.path===owner.path);
      const result=await this.bridge.request<Mutation>({kind:'createViewCard',owner:{...owner,expected:current!.revision},view,choice,column,date});
      this.accept(result,ui.history.createCard);
      const created=result.edits.find(e=>e.before===null&&e.path.endsWith('.md'))!;
      const card=result.snapshot.cards.find(c=>c.path===created.path)!;this.newCards.add(card.id);return card;
    });
  }
  moveSelection(source:string,ids:string[],folder:string,x:number,y:number,base:Board){return this.run(async()=>{
    const origin=this.state.snapshot?.boards.find(b=>b.folder===source);
    if(!origin||layout(origin)!==layout(base))throw new Error(ui.errors.whiteboardChanged(origin?.path??source));
    await this.flush();await this.flushPreferences();
    const current=this.state.snapshot!,board=current.boards.find(b=>b.folder===source),destination=current.boards.find(b=>b.folder===folder);
    if(!board||!destination)throw new Error(ui.errors.whiteboardMissing);
    if(layout(board)!==layout(base))throw new Error(ui.errors.whiteboardChanged(board.path));
    const result=await this.bridge.request<import('../shared').TransferMutation>({kind:'moveSelection',source,expected:board.revision,ids,destination:folder,destinationExpected:destination.revision,x,y});
    this.undoHistory.record(ui.history.moveCards,[],false,Date.now(),undefined,undefined,result.inverse);this.update({snapshot:result.snapshot,error:''});
    const active=this.state.draft?.card,updated=active&&result.snapshot.cards.find(c=>c.id===active.id);
    if(active&&updated&&(active.path!==updated.path||active.revision!==updated.revision)){
      const card=await this.bridge.request<Card>({kind:'card',path:updated.path}),draft=this.state.draft,moves=result.inverse.moves;
      if(draft?.card.id===active.id)this.update({draft:{card,body:draft.dirty?moveCardLinks(draft.body,active.path,card.path,path=>{const move=moves.find(m=>path===m.to||path.startsWith(m.to+'/'));return move?remapFilePath(path,move.to,move.from):path;}):card.body,dirty:draft.dirty}});
    }
  });}
  placeCard(id:string,folder:string,x:number,y:number,mode:'move'|'reference'|'move-reference',source?:string,placement?:string){
    return this.run(async()=>{
      await this.flush();
      const card=this.state.snapshot?.cards.find(c=>c.id===id),board=this.state.snapshot?.boards.find(b=>b.folder===folder);
      if(!card||!board)throw new Error(ui.errors.fileMissing);
      const result=await this.bridge.request<Mutation>({kind:'placeCard',id,expected:card.revision,board:folder,boardExpected:board.revision,x,y,mode,source,placement});
      this.accept(result,mode!=='reference'?ui.views.moveCard:ui.views.addReference);
      const active=this.state.draft?.card,updated=active&&result.snapshot.cards.find(c=>c.id===active.id),moved=result.snapshot.cards.find(c=>c.id===id)!;
      if(active&&updated&&(active.path!==updated.path||active.revision!==updated.revision)){
        const next=await this.bridge.request<Card>({kind:'card',path:updated.path}),draft=this.state.draft;
        if(draft?.card.id===active.id)this.update({draft:{card:next,body:draft.dirty?moveCardLinks(draft.body,draft.card.path,next.path,path=>path===card.path?moved.path:path):next.body,dirty:draft.dirty}});
      }
    });
  }
  importReadingFiles(){return this.run(async()=>{await this.flush();const {imports:results,errors}=await this.bridge.chooseReadingFiles();if(errors.length)this.update({error:errors.join('\n')});for(const result of results)this.accept(result,'Import reading material');return results.map(r=>r.snapshot.cards.find(c=>c.path===r.path)!);});}
  importReading(value:import('../shared').ReadingImport|string){return this.run(async()=>{await this.flush();const result=typeof value==='string'?await this.bridge.capturePage(value):await this.bridge.importReading(value);this.accept(result,'Import reading material');return result.snapshot.cards.find(c=>c.path===result.path)!;});}
  updateReading(path:string,value:import('../reading').ReadingProgress){return this.run(async()=>{await this.flush();const info=this.state.snapshot?.cards.find(c=>c.path===path);if(!info)throw new Error('Card is missing.');const result=await this.bridge.request<Mutation>({kind:'readingProgress',path,expected:info.revision,value});this.accept(result,'Reading progress');this.acceptCard(await this.bridge.request<Card>({kind:'card',path}));});}
  saveFeeds(source:string,expected:string|null){return this.run(async()=>{await this.flush();this.accept(await this.bridge.request<Mutation>({kind:'saveReadingFeeds',source,expected}),'Edit feeds');});}
  createTag(tag:string) {
    return this.run(async()=>{await this.flush();const result=await this.bridge.request<Mutation>({kind:'createTag',tag});this.accept(result,ui.tags.newTag);return result.snapshot.tags!.find(t=>t.tag===tag)!;});
  }
  saveViewBlock(path:string,expected:string,index:number,source:string,next:string|null,duplicate=false){return this.run(async()=>{
    if(this.state.snapshot?.cards.find(c=>c.path===path)?.revision!==expected)throw new Error(ui.errors.externalEdit(path));
    await this.flush();
    const draft=this.state.draft;
    if(draft?.card.path===path){this.edit(replaceViewSource(draft.body,index,source,next,duplicate));await this.flush(ui.views.options);return;}
    const card=await this.bridge.request<Card>({kind:'card',path});
    if(card.revision!==this.state.snapshot?.cards.find(c=>c.path===path)?.revision)throw new Error(ui.errors.externalEdit(path));
    const body=replaceViewSource(card.body,index,source,next,duplicate);
    if(body!==card.body)this.accept(await this.bridge.request<Mutation>({kind:'saveCard',path,body,expected:card.revision}),ui.views.options);
  });}
  saveTagBody(path:string,expected:string,body:string){return this.run(async()=>{await this.flush();this.accept(await this.bridge.request<Mutation>({kind:'saveTagBody',path,expected,body}),ui.tags.save);});}
  saveTag(path:string,expected:string,fields:TagField[],inherits:string[],createParent?:string,propertiesCollapsed?:boolean) {
    return this.run(async()=>{await this.flush();const result=await this.bridge.request<Mutation>({kind:'saveTag',path,expected,fields,inherits,createParent,propertiesCollapsed});this.accept(result,ui.tags.save);return result.snapshot.tags!.find(t=>t.path===path)!;});
  }
  renameTagProperty(path:string,expected:string,key:string,name:string){return this.run(async()=>{await this.flush();this.accept(await this.bridge.request<Mutation>({kind:'renameTagProperty',path,expected,key,name}),ui.tags.renameProperty);});}
  setCardTag(path:string,expected:string,tag:string,add:boolean,create=false) {return this.tagEdit(path,expected,next=>({kind:'setCardTag',path,expected:next,tag,add,create}),add?ui.tags.add:ui.tags.remove);}
  reorderCardTags(path:string,expected:string,tags:string[]){return this.tagEdit(path,expected,next=>({kind:'reorderCardTags',path,expected:next,tags}),ui.tags.reorderTags);}
  reorderTagProperties(path:string,expected:string,tag:string,keys:string[]){return this.tagEdit(path,expected,next=>({kind:'reorderTagProperties',path,expected:next,tag,keys}),ui.tags.reorder);}
  addTagProperty(path:string,expected:string,tag:string,tagExpected:string,field:TagField,value:TagValue){return this.tagEdit(path,expected,next=>({kind:'addTagProperty',path,expected:next,tag,tagExpected,field,value}),ui.tags.addField);}
  moveViewCard(move:import('../shared').ViewCardMove){return this.run(async()=>{
    const info=(path:string)=>this.state.snapshot?.cards.find(c=>c.path===path)??this.state.snapshot?.tags?.find(t=>t.path===path);
    for(const item of [move.owner,move.card])if(info(item.path)?.revision!==item.expected)throw new Error(ui.errors.externalEdit(item.path));
    await this.flush();
    const result=await this.bridge.request<Mutation>({kind:'moveViewCard',move:{...move,owner:{...move.owner,expected:info(move.owner.path)!.revision},card:{...move.card,expected:info(move.card.path)!.revision}}});
    this.accept(result,ui.views.reorder);
    const draft=this.state.draft;
    if(draft){const card=info(draft.card.path);if(card){let body=draft.body;
      if(draft.card.path===move.owner.path){const after=result.edits.find(e=>e.path===move.owner.path)!.after!,next=viewBlockRanges(after)[move.owner.block].source;body=replaceViewSource(body,move.owner.block,move.owner.source,next);}
      this.update({draft:{...draft,body,card:{...draft.card,...card,body:draft.dirty?draft.card.body:body}}});
    }}
    return result;
  });}
  setViewProperty(path:string,expected:string,key:string,value:TagValue){return this.tagEdit(path,expected,next=>({kind:'setViewProperty',path,expected:next,key,value}),ui.tags.properties);}
  setTagProperty(path:string,expected:string,tag:string,key:string,value:TagValue) {return this.tagEdit(path,expected,next=>({kind:'setTagProperty',path,expected:next,tag,key,value}),ui.tags.properties);}
  private tagEdit(path:string,expected:string,request:(next:string)=>Extract<import('../shared').Request,{kind:'setViewProperty'|'addTagProperty'|'setCardTag'|'setTagProperty'|'reorderTagProperties'|'reorderCardTags'}>,label:string) {
    return this.run(async()=>{
      if(this.state.snapshot?.cards.find(c=>c.path===path)?.revision!==expected)throw new Error(ui.errors.externalEdit(path));
      await this.flush();
      const next=this.state.snapshot!.cards.find(c=>c.path===path)!.revision;
      const result=await this.bridge.request<Mutation>(request(next));this.accept(result,label);
      const draft=this.state.draft,info=result.snapshot.cards.find(c=>c.path===path);
      if(draft?.card.path===path&&info){const card=await this.bridge.request<Card>({kind:'card',path});this.acceptCard(card);}
    });
  }
  renameBoard(folder:string,name:string) {
    return this.run(async()=>{
      await this.flush();
      const board=this.state.snapshot?.boards.find(b=>b.folder===folder);
      if(!board)throw new Error(ui.errors.whiteboardMissing);
      const result=await this.bridge.request<Mutation>({kind:'renameBoard',folder,name,expected:board.revision});
      this.accept(result,ui.history.rename(folder));
      const info=result.snapshot.cards.find(c=>c.id===this.state.draft?.card.id);
      if(info){
        const card=await this.bridge.request<Card>({kind:'card',path:info.path}),draft=this.state.draft;
        if(draft?.card.id===info.id)this.update({draft:draft.dirty?{...draft,card:{...draft.card,path:info.path,name:info.name}}:{card,body:card.body,dirty:false}});
      }
    });
  }
  renameCard(id:string,stem:string) {
    this.newCards.delete(id);
    return this.run(async()=>{
      await this.flush();
      const card=this.state.snapshot?.cards.find(c=>c.id===id);
      if(!card)throw new Error(ui.errors.cardMissing);
      const result=await this.bridge.request<Mutation>({kind:'renameCard',path:card.path,stem,expected:card.revision});
      this.accept(result,ui.history.rename(card.path));
      const draft=this.state.draft,info=result.snapshot.cards.find(c=>c.id===draft?.card.id);
      if(draft&&info&&!draft.dirty&&result.edits.some(e=>e.path===draft.card.path||e.path===info.path)){
        const current=await this.bridge.request<Card>({kind:'card',path:info.path});
        if(this.state.draft?.card.id===info.id&&!this.state.draft.dirty)this.update({draft:{card:current,body:current.body,dirty:false}});
      }
    });
  }
  board(board: Board,label: string,base = this.state.snapshot?.boards.find(b => b.path === board.path)) {
    return this.run(async () => {
      await this.flush();
      const current=this.state.snapshot?.boards.find(b => b.path === board.path);
      // Earlier local saves may have advanced the revision since this gesture began.
      // Only advance it when the starting layout still matches; disk writes retain their hash check.
      if (!base || !current || layout(base) !== layout(current)) {
        throw new Error(ui.errors.whiteboardChanged(board.path));
      }
      const result=await this.bridge.request<Mutation>({kind:'saveBoard',board,expected:current.revision});
      this.accept(result,label);
    });
  }
  fillCards(ids:string[],color:string|undefined,board?:Board,base?:Board) {
    return this.run(async()=>{
      await this.flush();
      const snapshot=this.state.snapshot!,cards=[...new Set(ids)].map(id=>{
        const card=snapshot.cards.find(c=>c.id===id);if(!card)throw new Error(ui.errors.cardMissing);
        return {path:card.path,expected:card.revision};
      });
      const current=board&&snapshot.boards.find(b=>b.path===board.path);
      if(board&&(!base||!current||layout(base)!==layout(current)))throw new Error(ui.errors.whiteboardChanged(board.path));
      const result=await this.bridge.request<Mutation>({kind:'setFill',cards,color:color??null,board:board&&current?{value:board,expected:current.revision}:undefined});
      this.accept(result,ui.history.colorSelection);
      const draft=this.state.draft,info=result.snapshot.cards.find(c=>c.id===draft?.card.id);
      if(draft&&info){const card=await this.bridge.request<Card>({kind:'card',path:info.path});this.acceptCard(card);}
    });
  }
  deleteSelection(board:Board,placements:string[],edges:string[],confirm:(names:string[],boards?:boolean)=>boolean|Promise<boolean>):Promise<boolean> {
    const folders=board.cards.filter(p=>p.folder&&placements.includes(p.id)).map(p=>p.folder!).sort((a,b)=>a.length-b.length);
    if(folders.length)return (async()=>{
      for(const folder of folders){if(!this.state.snapshot?.boards.some(b=>b.folder===folder))continue;if(!await this.deleteBoard(folder,names=>confirm(names,true)))return false;}
      const current=this.state.snapshot?.boards.find(b=>b.path===board.path),remaining=placements.filter(id=>current?.cards.some(p=>p.id===id&&!p.folder));
      if(current&&(remaining.length||edges.length))return this.deleteSelection(current,remaining,edges,confirm);return true;
    })();
    return this.run(async()=>{
      await this.flush();
      const current=this.state.snapshot?.boards.find(b=>b.path===board.path);
      if(!current||layout(board)!==layout(current))throw new Error(ui.errors.whiteboardChanged(board.path));
      // Finish editing before preparing the exact, revision-checked files for confirmation.
      if(board.cards.some(p=>placements.includes(p.id)&&p.cardId===this.state.draft?.card.id))this.update({draft:null});
      const deletion=await this.bridge.request<Deletion>({kind:'prepareDeletion',path:board.path,placements,edges,expected:current.revision});
      if(!deletion.changes.length||deletion.nonEmpty.length&&!await confirm(deletion.changes.filter(change=>change.content===null).map(change=>change.path)))return false;
      const result=await this.bridge.request<Mutation>({kind:'write',changes:deletion.changes});
      this.accept(result,ui.history.deleteSelection);
      return true;
    });
  }
  undo(redo=false) {
    return this.run(async () => {
      await this.flush();
      await this.undoHistory.travel(redo,async changes => {
        const result=await this.bridge.request<Mutation>({kind:'write',changes});
        this.update({snapshot:result.snapshot,status:redo ? ui.status.redone : ui.status.undone,error:''});
      },async move=>{
        const board=this.state.snapshot?.boards.find(b=>b.folder===move.from);
        if(!board)throw new Error(ui.errors.renameWhiteboardMissing);
        const result=await this.bridge.request<Mutation>({kind:'renameBoard',folder:move.from,name:move.to.split(/[\\/]/).at(-1)!,expected:board.revision});
        this.update({snapshot:result.snapshot,status:redo?ui.status.redone:ui.status.undone,error:''});
      },async operation=>{const result=await this.bridge.request<import('../shared').FileMutation>({kind:'fileOperation',operation});this.update({snapshot:result.snapshot,status:redo?ui.status.redone:ui.status.undone,error:''});return result.inverse;},async operation=>{const result=await this.bridge.request<import('../shared').TransferMutation>({kind:'transfer',operation});this.update({snapshot:result.snapshot,status:redo?ui.status.redone:ui.status.undone,error:''});return result.inverse;});
      const info=this.state.snapshot?.cards.find(c=>c.id===this.state.draft?.card.id);
      if (info) {
        const card=await this.bridge.request<Card>({kind:'card',path:info.path});
        this.update({draft:{card,body:card.body,dirty:false}});
      } else this.update({draft:null});
    });
  }
  checkpoint(label:string=ui.history.savedCheckpoint) {
    return this.run(async () => {
      await this.flush();
      const checkpoints=await this.bridge.request<Checkpoint[]>({kind:'checkpoint',label});
      this.update({checkpoints,status:ui.status.checkpointSaved,error:''});
    });
  }
  history(limit=200) {
    return this.run(async () => {
      const checkpoints=await this.bridge.request<Checkpoint[]>({kind:'history',limit});
      this.update({checkpoints});
    });
  }
  restore(id: string,source?:string) {
    return this.run(async () => {
      await this.flush();
      this.update({status:ui.status.changingHistory});
      const snapshot=await this.bridge.request<Snapshot>(source?{kind:'applyCheckpoint',source,target:id}:{kind:'restore',id});
      const checkpoints=await this.bridge.request<Checkpoint[]>({kind:'history'});
      this.undoHistory.clear();
      this.update({snapshot,checkpoints,draft:null,status:ui.status.workspaceRestoredLaterCheckpointsKept,error:''});
    });
  }
  // Keep a conflicted draft recoverable without automatically replacing someone else's file.
  copyDraft() { return navigator.clipboard.writeText(this.state.draft?.source??this.state.draft?.body??''); }
  reloadDraft() {
    return this.run(async () => {
      if (!this.state.draft) return;
      const card=await this.bridge.request<Card>({kind:'card',path:this.state.draft.card.path});
      this.update({draft:{card,body:card.body,dirty:false},status:ui.status.loadedFromDisk,error:''});
    });
  }
}
