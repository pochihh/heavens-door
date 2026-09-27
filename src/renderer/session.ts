import type { Board, Bridge, Card, Checkpoint, Mutation, Preferences, Snapshot } from '../shared';
import { UndoHistory } from './history';

function layout(board: Board) {
  return JSON.stringify([board.name,board.inbox,
    board.cards.map(p => [p.id,p.cardId,p.x,p.y,p.width,p.height,p.folder,p.collapsed??false,p.autoHeight??true]),
    board.edges.map(e => [e.id,e.from,e.to])]);
}

interface State {
  snapshot: Snapshot | null;
  draft: {card:Card;body:string;dirty:boolean} | null;
  status: string;
  error: string;
  checkpoints: Checkpoint[];
  revision: number;
}
export class Session {
  state: State = {snapshot:null,draft:null,status:'Ready',error:'',checkpoints:[],revision:0};
  undoHistory = new UndoHistory();
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
      const snapshot=await this.bridge.currentWorkspace();
      if (snapshot) this.update({snapshot,status:'Saved locally'});
    });
  }
  dispose() { clearTimeout(this.saveTimer); clearTimeout(this.checkpointTimer);clearTimeout(this.preferencesTimer);this.pendingPreferences={}; }
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
    this.queue=next.catch(error => this.update({error:String(error),status:'Needs attention'}));
    return next;
  }
  async open(demo: boolean,registeredRoot?:string) {
    return this.run(async () => {
      await this.flush();
      this.update({status:'Opening workspace…',error:''});
      const snapshot = await (registeredRoot ? this.bridge.openWorkspace(registeredRoot) : demo ? this.bridge.demo() : this.bridge.chooseWorkspace());
      if (snapshot) { this.dispose(); this.undoHistory.clear(); this.update({snapshot,draft:null,checkpoints:[]}); }
      this.update({status:'Saved locally'});
    });
  }
  private accept(result: Mutation,label: string,group=false) {
    this.undoHistory.record(label,result.edits,group,Date.now(),result.move);
    this.update({snapshot:result.snapshot,status:'Saved locally',error:''});
    clearTimeout(this.checkpointTimer);
    if (result.snapshot.historyAvailable) this.checkpointTimer=setTimeout(() => { void this.checkpoint('Automatic checkpoint').catch(() => undefined); },5*60*1000);
  }
  edit(body: string) {
    const draft=this.state.draft;
    if (!draft || body === draft.body) return;
    this.update({draft:{...draft,body,dirty:true},status:'Editing…'});
    clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(() => { void this.run(() => this.flush()).catch(() => undefined); },600);
  }
  async flush() {
    await this.flushPreferences();
    clearTimeout(this.saveTimer);
    while (this.state.draft?.dirty) {
      const draft=this.state.draft;
      this.update({status:'Saving…'});
      const result=await this.bridge.request<Mutation>({kind:'saveCard',path:draft.card.path,body:draft.body,expected:draft.card.revision});
      this.accept(result,`Edit ${draft.card.path}`,true);
      const info=result.snapshot.cards.find(c => c.path === draft.card.path)!;
      const card={...info,body:draft.body};
      const current=this.state.draft!;
      this.update({draft:{card,body:current.body,dirty:current.body !== draft.body}});
    }
  }
  select(path: string | null) {
    return this.run(async () => {
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
  create(folder: string,stem: string,x:number,y:number,place=true) {
    return this.run(async () => {
      await this.flush();
      const result=await this.bridge.request<Mutation>({kind:'create',folder,stem,x,y,place});
      this.accept(result,'Create card');
      const path=result.edits.find(e => e.path.endsWith('.md'))!.path;
      const card=await this.bridge.request<Card>({kind:'card',path});
      this.update({draft:{card,body:card.body,dirty:false}});
    });
  }
  renameBoard(folder:string,name:string) {
    return this.run(async()=>{
      await this.flush();
      const board=this.state.snapshot?.boards.find(b=>b.folder===folder);
      if(!board)throw new Error('This whiteboard is no longer in the workspace');
      const result=await this.bridge.request<Mutation>({kind:'renameBoard',folder,name,expected:board.revision});
      this.accept(result,`Rename ${folder}`);
      const info=result.snapshot.cards.find(c=>c.id===this.state.draft?.card.id);
      if(info){
        const card=await this.bridge.request<Card>({kind:'card',path:info.path}),draft=this.state.draft;
        if(draft?.card.id===info.id)this.update({draft:draft.dirty?{...draft,card:{...draft.card,path:info.path,name:info.name}}:{card,body:card.body,dirty:false}});
      }
    });
  }
  renameCard(id:string,stem:string) {
    return this.run(async()=>{
      await this.flush();
      const card=this.state.snapshot?.cards.find(c=>c.id===id);
      if(!card)throw new Error('This card is no longer in the workspace');
      const result=await this.bridge.request<Mutation>({kind:'renameCard',path:card.path,stem,expected:card.revision});
      this.accept(result,`Rename ${card.path}`);
      const draft=this.state.draft,info=result.snapshot.cards.find(c=>c.id===id);
      if(draft?.card.id===id&&info)this.update({draft:{...draft,card:{...draft.card,...info}}});
    });
  }
  board(board: Board,label: string,base = this.state.snapshot?.boards.find(b => b.path === board.path)) {
    return this.run(async () => {
      await this.flush();
      const current=this.state.snapshot?.boards.find(b => b.path === board.path);
      // Earlier local saves may have advanced the revision since this gesture began.
      // Only advance it when the starting layout still matches; disk writes retain their hash check.
      if (!base || !current || layout(base) !== layout(current)) {
        throw new Error(`The whiteboard changed while you were editing ${board.path}. Your move has not overwritten those changes.`);
      }
      const result=await this.bridge.request<Mutation>({kind:'saveBoard',board,expected:current.revision});
      this.accept(result,label);
    });
  }
  undo(redo=false) {
    return this.run(async () => {
      await this.flush();
      await this.undoHistory.travel(redo,async changes => {
        const result=await this.bridge.request<Mutation>({kind:'write',changes});
        this.update({snapshot:result.snapshot,status:redo ? 'Redone' : 'Undone',error:''});
      },async move=>{
        const board=this.state.snapshot?.boards.find(b=>b.folder===move.from);
        if(!board)throw new Error('The whiteboard to rename is missing');
        const result=await this.bridge.request<Mutation>({kind:'renameBoard',folder:move.from,name:move.to.split(/[\\/]/).at(-1)!,expected:board.revision});
        this.update({snapshot:result.snapshot,status:redo?'Redone':'Undone',error:''});
      });
      const info=this.state.snapshot?.cards.find(c=>c.id===this.state.draft?.card.id);
      if (info) {
        const card=await this.bridge.request<Card>({kind:'card',path:info.path});
        this.update({draft:{card,body:card.body,dirty:false}});
      } else this.update({draft:null});
    });
  }
  checkpoint(label='Saved checkpoint') {
    return this.run(async () => {
      await this.flush();
      const checkpoints=await this.bridge.request<Checkpoint[]>({kind:'checkpoint',label});
      this.update({checkpoints,status:'Checkpoint saved',error:''});
    });
  }
  history() {
    return this.run(async () => {
      const checkpoints=await this.bridge.request<Checkpoint[]>({kind:'history'});
      this.update({checkpoints});
    });
  }
  restore(id: string) {
    return this.run(async () => {
      await this.flush();
      const snapshot=await this.bridge.request<Snapshot>({kind:'restore',id});
      const checkpoints=await this.bridge.request<Checkpoint[]>({kind:'history'});
      this.undoHistory.clear();
      this.update({snapshot,checkpoints,draft:null,status:'Workspace restored · later checkpoints kept',error:''});
    });
  }
  // Keep a conflicted draft recoverable without automatically replacing someone else's file.
  copyDraft() { return navigator.clipboard.writeText(this.state.draft?.body ?? ''); }
  reloadDraft() {
    return this.run(async () => {
      if (!this.state.draft) return;
      const card=await this.bridge.request<Card>({kind:'card',path:this.state.draft.card.path});
      this.update({draft:{card,body:card.body,dirty:false},status:'Loaded from disk',error:''});
    });
  }
}
