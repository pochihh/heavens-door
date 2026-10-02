import {compileView} from './view-query';
import {viewPropertyTargets,viewDisplayFields,parseViewBlock,writeViewBlock,replaceViewSource,viewBlockRanges,orderedCardIds,moveCardId,fieldKeys,validateView} from '../view-block';
import {viewText} from '../text/views';
import {readTag,editTag,editCardTag,editTagProperty,reorderTagProperties,reorderCardTags,remapTagReferences} from './tags';
import {validTag,tagsFrom,validateFields,validateTagValue,resolveTag,validReferencePath} from '../tags';
import type {TagField,TagValue,TagSearchResult,WorkspaceSearchResult} from '../shared';
import { isHexColor } from '../colors';
import { ui } from '../text/ui';
import { promises as fs } from 'node:fs';
import { join, resolve, relative, basename, dirname, sep, extname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { isScalar } from 'yaml';
import { marked } from 'marked';
import { defaultPreferences, readPreferences, writePreferences } from './preferences';
import { remapPath, remapFilePath, remapPreferences } from '../path-remap';
import { History } from './history';
import { TextSearch, searchExcerpt, searchDocument, searchHighlights, searchProperties } from './search';
import { readCard, editCard, readBoard, writeBoard, emptyBoard, revision, newNote, splitNote, validateEdgeStyle } from './format';
import { COLLAPSED_CARD_HEIGHT, placementHeight, edgeStyle } from '../shared';
import type { Board, CardInfo, Snapshot, Write, Mutation, Preferences, TagInfo, TagResult, EdgeStyle, Deletion, CardQuery, CardResult } from '../shared';

const isTrash=(path:string)=>/^\.heavens-door\/trash\/[a-f0-9-]{36}\.md$/.test(path);

function validateStem(stem:string) {
    if (!stem.trim() || Buffer.byteLength(stem+'.md')>255 || stem.startsWith('.') || /[<>:"/\\|?*]/.test(stem) || [...stem].some(c => c.charCodeAt(0)<32) || /[. ]$/.test(stem) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) throw new Error(ui.errors.invalidFilename);
}

export class Workspace {
  readonly history: History;
  private db: DatabaseSync;
  private search=new TextSearch();
  private searchPreviews=new Map<string,ReturnType<typeof searchDocument>>();
  private folders = new Set<string>(['']);
  private tags = new Map<string,TagInfo>();
  private preferences = defaultPreferences();
  private lastEdgeStyle:EdgeStyle|undefined;
  private viewOrderTails=new Map<string,Map<string,string[]>>();
  private boards = new Map<string, Board>();
  private issues = new Map<string, string>();
  private scanning = false;
  private renamePending=false;
  // ponytail: retain rename notifications until worker exit; add window acknowledgements if this grows large.
  private pathMoves:{from:string;to:string}[]=[];
  constructor(readonly root: string, readonly cache: string) {
    this.db = new DatabaseSync(join(cache,'index.sqlite'));
    if (this.db.prepare('PRAGMA user_version').get()?.user_version !== 7) {
      this.db.exec('DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS search; DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS properties; PRAGMA user_version=7;');
    }
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cards(path TEXT PRIMARY KEY,id TEXT,name TEXT,body TEXT,revision TEXT,legacy INTEGER,frontmatter TEXT,title TEXT,folder TEXT,titleMarkdown TEXT,searchText TEXT);
      CREATE INDEX IF NOT EXISTS cards_folder ON cards(folder);
      CREATE INDEX IF NOT EXISTS card_identity ON cards(id);
      CREATE TABLE IF NOT EXISTS properties(path TEXT,field TEXT,value TEXT,PRIMARY KEY(path,field));
      CREATE INDEX IF NOT EXISTS property_value ON properties(field,value,path);
      CREATE TABLE IF NOT EXISTS links(source TEXT,target TEXT);
      CREATE INDEX IF NOT EXISTS backlinks ON links(target);
      CREATE INDEX IF NOT EXISTS outgoing_links ON links(source);
      CREATE TABLE IF NOT EXISTS ui_cache(key TEXT PRIMARY KEY,value TEXT);`);
    this.history = new History(root,this.db);
    for(const row of this.db.prepare('SELECT path,name,title,body,frontmatter FROM cards').all()){const card=row as unknown as import('../shared').Card;this.search.update({...card,metadata:searchProperties(JSON.parse(String(row.frontmatter)))});}
    try {
      const row=this.db.prepare("SELECT value FROM ui_cache WHERE key='edge-style'").get();
      if(row){const style=JSON.parse(String(row.value));validateEdgeStyle(style);this.lastEdgeStyle=edgeStyle(style);}
    } catch { /* A damaged optional UI cache falls back to the default edge style. */ }
  }
  static async open(root: string, cache: string) {
    const actual = await fs.realpath(root);
    await fs.mkdir(cache,{recursive:true});
    const workspace = new Workspace(actual,cache);
    try {
      await workspace.recover();
      await workspace.history.initialize();
      await workspace.scan();
      if (workspace.history.available && !(await workspace.history.list()).length) await workspace.history.checkpoint(ui.history.workspaceOpened);
      return workspace;
    } catch(error) { workspace.close(); throw error; }
  }
  close() { this.db.close(); }
  assertReady(){if(this.renamePending)throw new Error(ui.errors.interruptedRename);}
  private async path(path: string) {
    if (!path || isAbsolute(path) || path.includes('\0') || (!isTrash(path)&&path.split(/[\\/]/).some(p => p === '..' || p.startsWith('.')))) throw new Error(ui.errors.invalidWorkspacePath);
    const target = resolve(this.root,path);
    if (!target.startsWith(this.root + sep)) throw new Error(ui.errors.pathLeavesWorkspace);
    let current = this.root;
    for (const part of relative(this.root,target).split(sep)) {
      current = join(current,part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(ui.errors.symbolicLinksAreNotSupported); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return target;
  }
  async read(path: string) { return fs.readFile(await this.path(path),'utf8'); }
  async card(path: string) { return readCard(path,await this.read(path)); }
  async asset(path: string) { return this.path(path); }
  async prepareDeletion(path:string,placements:string[],edges:string[],expected:string):Promise<Deletion> {
    this.assertReady();
    const board=readBoard(path,await this.read(path));
    if(board.revision!==expected)throw new Error(ui.errors.externalEdit(path));
    const selected=board.cards.filter(p=>!p.folder&&placements.includes(p.id));
    const ids=new Set(selected.map(p=>p.cardId));
    const changes:Write[]=[],nonEmpty:string[]=[];
    for(const card of this.snapshot().cards.filter(c=>ids.has(c.id))){
      const raw=await this.read(card.path),{front,body}=splitNote(raw);
      if(readCard(card.path,raw).id!==card.id)throw new Error(ui.errors.externalEdit(card.path));
      // The empty title placeholder is never stored; a blank H1 is editor scaffolding.
      if(body.replace(/^\s*#(?:[ \t]+#*)?\s*$/,'').trim()||Object.keys(front.toJSON()??{}).some(key=>!['card-id','card-color'].includes(key)))nonEmpty.push(card.path);
      changes.push({path:'.heavens-door/trash/'+randomUUID()+'.md',content:raw,expected:null},
        {path:card.path,content:null,expected:revision(raw)});
    }
    const removed=new Set(board.cards.filter(p=>!p.folder&&ids.has(p.cardId)).map(p=>p.id));
    const next={...board,cards:board.cards.filter(p=>!removed.has(p.id)),edges:board.edges.filter(e=>!edges.includes(e.id)&&!removed.has(e.from)&&!removed.has(e.to))};
    if(removed.size||next.edges.length!==board.edges.length)changes.push({path,content:writeBoard(next),expected});
    return {changes,nonEmpty};
  }
  private async raw(path: string): Promise<string | null> { try { return await this.read(path); } catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
  private async atomic(path: string, content: string | null) {
    const target = await this.path(path);
    if (content === null) { await fs.unlink(target).catch(e => { if (e.code !== 'ENOENT') throw e; }); return; }
    const temporary = target + '.' + randomUUID() + '.tmp';
    const handle = await fs.open(temporary,'wx');
    try { await handle.writeFile(content,'utf8'); await handle.sync(); } finally { await handle.close(); }
    try { await fs.rename(temporary,target); } finally { await fs.unlink(temporary).catch(() => undefined); }
  }
  private async recover() {
    await this.recoverBoardRename();
    const file = join(this.cache,'transaction.json');
    let journal: { path: string; before: string | null; after: string | null }[];
    try { journal = JSON.parse(await fs.readFile(file,'utf8')); } catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    for (const item of journal) {
      const current = await this.raw(item.path);
      if (current !== item.before && current !== item.after) throw new Error(ui.errors.recoveryNeedsAttention(item.path,file));
    }
    for (const item of journal) await this.atomic(item.path,item.before);
    await fs.unlink(file);
  }
  async write(changes: Write[]): Promise<Mutation> {
    this.assertReady();
    if (!changes.length || new Set(changes.map(c => c.path)).size !== changes.length) throw new Error(ui.errors.invalidEdit);
    changes=this.automaticPlacements(changes);
    const journal = [];
    for (const change of changes) {
      if (!['.md','.whiteboard','.tag'].includes(extname(change.path)) || (change.content !== null && typeof change.content !== 'string')) throw new Error(ui.errors.unsupportedFileEdit);
      const before = await this.raw(change.path);
      if ((before === null ? null : revision(before)) !== change.expected) throw new Error(ui.errors.externalEdit(change.path));
      if (change.content !== null) {
        if(change.path.endsWith('.tag'))readTag(change.path,change.content);else if (change.path.endsWith('.md')) readCard(change.path,change.content); else readBoard(change.path,change.content);
      }
      journal.push({ path: change.path, before, after: change.content });
    }
    for(const change of changes)if(isTrash(change.path)&&change.content!==null)await fs.mkdir(dirname(await this.path(change.path)),{recursive:true});
    const journalFile = join(this.cache,'transaction.json');
    const handle = await fs.open(journalFile,'wx');
    try { await handle.writeFile(JSON.stringify(journal)); await handle.sync(); } finally { await handle.close(); }
    try {
      for (const item of journal) {
        if (await this.raw(item.path) !== item.before) throw new Error(ui.errors.concurrentEdit(item.path));
        if (item.before === null && item.after !== null) await fs.writeFile(await this.path(item.path),item.after,{flag:'wx'});
        else await this.atomic(item.path,item.after);
      }
      await fs.unlink(journalFile);
    } catch(e) { await this.recover().catch(() => undefined); throw e; }
    for (const change of changes) await this.refresh(change.path,false);
    return {snapshot:this.snapshot(),edits:journal};
  }
  async scan() {
    this.preferences=await readPreferences(this.root);
    const unseen=new Set((this.db.prepare('SELECT path FROM cards').all() as {path:string}[]).map(row => row.path));
    for(const path of this.tags.keys())this.search.remove(path);
    this.boards.clear(); this.issues.clear(); this.folders=new Set(['']); this.tags.clear();
    const walk = async (folder: string) => {
      for (const entry of await fs.readdir(join(this.root,folder),{withFileTypes:true})) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
        const path = join(folder,entry.name);
        if (entry.isDirectory()) { this.folders.add(path); await walk(path); }
        else if (entry.isFile() && ['.md','.whiteboard','.tag'].includes(extname(path))) { unseen.delete(path); await this.refresh(path); }
      }
    };
    // One index transaction avoids a disk sync for each of ten thousand notes.
    this.scanning=true; this.db.exec('BEGIN');
    try {
      await walk('');
      for (const path of unseen) this.removeIndex(path);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.scanning=false; }
    const mother=basename(this.root)+'.whiteboard';
    if(await this.raw(mother)===null)await this.write([{path:mother,content:writeBoard(emptyBoard(mother)),expected:null}]);
    await this.reconcile();
    return this.snapshot();
  }
  private removeIndex(path: string) {
    this.search.remove(path);this.searchPreviews.delete(path);
    this.db.prepare('DELETE FROM properties WHERE path=?').run(path);
    this.db.prepare('DELETE FROM cards WHERE path=?').run(path);
    this.db.prepare('DELETE FROM links WHERE source=?').run(path);
  }
  async refresh(path: string,reconcile=true) {
    if(isTrash(path))return;
    if (!['.md','.whiteboard','.tag'].includes(extname(path))) return;
    this.issues.delete(path);
    this.boards.delete(path); this.tags.delete(path);if(path.endsWith('.tag'))this.search.remove(path);
    try {
      const raw = await this.raw(path);
      if (raw === null) { this.removeIndex(path); return; }
      let folder=dirname(path);
      while (folder !== '.') { this.folders.add(folder); folder=dirname(folder); }
      if (path.endsWith('.tag')) {
        const tag=readTag(path,raw);this.tags.set(path,tag);this.search.update({path,name:tag.tag,title:tag.tag,body:''});
        return;
      }
      if (path.endsWith('.whiteboard')) { this.boards.set(path,readBoard(path,raw)); return; }
      const cached=this.db.prepare('SELECT revision FROM cards WHERE path=?').get(path);
      // Verify content hashes rather than trusting timestamps or file sizes.
      if (cached?.revision === revision(raw)) return;
      const card = readCard(path,raw);
      if (!this.scanning) this.db.exec('BEGIN');
      try {
        this.removeIndex(path);
        this.db.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(card.path,card.id,card.name,card.body,card.revision,Number(card.legacy),JSON.stringify(splitNote(raw).front.toJSON() ?? {}),card.title??'',dirname(path)==='.'?'':dirname(path),card.titleMarkdown??'',searchDocument(card.body).text);
        for(const [field,value] of Object.entries(splitNote(raw).front.toJSON()??{}))this.db.prepare('INSERT INTO properties VALUES(?,?,?)').run(card.path,field,JSON.stringify(value));
        for(const value of Object.values(splitNote(raw).front.toJSON()??{}).flat())if(typeof value==='string'){const target=/^card:[\w-]{1,128}$/.test(value)?value.slice(5):validReferencePath(value)?'file:'+value:null;if(target)this.db.prepare('INSERT INTO links VALUES(?,?)').run(path,target);}
        this.search.update({...card,metadata:searchProperties(splitNote(raw).front.toJSON()??{})});
        marked.walkTokens(marked.lexer(card.body), token => {
          if (token.type === 'link' && token.href.startsWith('card:')) this.db.prepare('INSERT INTO links VALUES(?,?)').run(path,token.href.slice(5));
        });
        if (!this.scanning) this.db.exec('COMMIT');
      } catch(e) { if (!this.scanning) this.db.exec('ROLLBACK'); throw e; }
    } catch(e) { this.removeIndex(path); this.issues.set(path,`${path}: ${String(e)}`); }
    finally {if(reconcile&&!this.scanning)await this.reconcile([path]);}
  }
  snapshot(): Snapshot {
    // ponytail: full metadata snapshots; switch to deltas if IPC dominates large-vault saves.
    // Bodies are fetched only for visible cards; a large vault never becomes one giant UI document.
    const cards = this.db.prepare(`SELECT path,id,name,title,titleMarkdown,revision,legacy,json_quote(json_extract(frontmatter,'$.tags')) AS tagData,json_extract(frontmatter,'$."card-color"') AS fillColor,json_type(frontmatter,'$."card-color"') AS colorType FROM cards ORDER BY path`).all() as unknown as (CardInfo&{colorType:string|null;tagData:string})[];
    const duplicates = this.db.prepare('SELECT id FROM cards GROUP BY id HAVING count(*)>1').all();
    return { lastEdgeStyle:this.lastEdgeStyle,pathMoves:[...this.pathMoves],root:this.root, name:basename(this.root), cards:cards.map(({colorType,fillColor,tagData,...c}) => ({...c,tags:tagsFrom(JSON.parse(tagData)),legacy:!!c.legacy,...(colorType!==null?{fillColor}: {})})), boards:this.allBoards(), issues:[...this.issues.values(),...duplicates.map(c => ui.errors.duplicateCardId(String(c.id)))], historyAvailable:this.history.available, folders:[...this.folders].sort(), tags:[...this.tags.values()], preferences:this.preferences };
  }

  private allBoards() {
    const boards=[...this.boards.values()].filter(b=>this.boardPath(b.folder)===b.path);
    if(!boards.some(b=>!b.folder))boards.unshift(emptyBoard(basename(this.root)+'.whiteboard'));
    const boardFolders=new Set(boards.map(b=>b.folder)),childrenByFolder=new Map<string,string[]>();
    for(const folder of boardFolders){
      if(!folder)continue;
      let ancestor=dirname(folder)==='.'?'':dirname(folder);
      while(ancestor&&!boardFolders.has(ancestor))ancestor=dirname(ancestor)==='.'?'':dirname(ancestor);
      const children=childrenByFolder.get(ancestor)??[];children.push(folder);childrenByFolder.set(ancestor,children);
    }
    return boards.map(board => {
      const children=childrenByFolder.get(board.folder)??[];
      const cards=board.folder?[...board.cards]:board.cards.filter(p=>p.folder);
      for (const folder of children) if (!cards.some(p => p.folder === folder)) {
        const i=board.folder?cards.length:cards.filter(p=>p.folder).length;
        cards.push({id:'folder-'+Buffer.from(folder).toString('hex'),folder,cardId:'',x:60+(i%4)*380,y:60+Math.floor(i/4)*220,width:320,height:160});
      }
      const ids=new Set(cards.map(p=>p.id));
      return {...board,name:board.folder ? basename(board.folder) : basename(this.root),cards,edges:board.edges.filter(e=>ids.has(e.from)&&ids.has(e.to))};
    });
  }
  private boardPath(folder:string) {return join(folder,(folder?basename(folder):basename(this.root))+'.whiteboard');}
  private automaticPlacements(changes:Write[],folders?:Set<string>):Write[] {
    const result=changes.map(change=>({...change}));
    const affected=folders??new Set(changes.length?changes.map(c=>dirname(c.path)==='.'?'':dirname(c.path)):[...this.boards.values()].map(b=>b.folder));
    let displayed:Map<string,Board>|undefined;
    for(const folder of affected){
      if(!folder)continue; // The mother board contains sub-whiteboards only.
      const path=this.boardPath(folder),explicit=result.find(c=>c.path===path);
      if(explicit?.content===null)continue;
      const board=explicit?readBoard(path,explicit.content!):this.boards.get(path);
      if(!board)continue;
      const local=new Map((this.db.prepare('SELECT path,id FROM cards WHERE folder=? ORDER BY path').all(folder) as {path:string;id:string}[]).map(c=>[c.path,c]));
      for(const change of changes)if(change.path.endsWith('.md')&&dirname(change.path)===folder){
        if(change.content===null)local.delete(change.path);else{const card=readCard(change.path,change.content);local.set(change.path,card);}
      }
      const placed=new Set(board.cards.map(p=>p.cardId)),missing=[...local.values()].filter(c=>!placed.has(c.id));
      if(!missing.length)continue;
      displayed??=new Map(this.allBoards().map(b=>[b.folder,b]));
      const occupied=[...board.cards,...(displayed.get(folder)?.cards.filter(p=>p.folder&&!board.cards.some(existing=>existing.folder===p.folder))??[])];
      const inbox=board.inbox??{x:Math.max(0,...occupied.map(p=>p.x+p.width))+80,y:60};
      let y=Math.max(inbox.y,...occupied.filter(p=>p.x<inbox.x+340&&p.x+p.width>inbox.x).map(p=>p.y+placementHeight(p)+12));
      const next={...board,inbox,cards:occupied};
      for(const card of missing){
        if(placed.has(card.id))continue;
        next.cards.push({id:randomUUID(),cardId:card.id,x:inbox.x,y,width:340,height:280,collapsed:true});
        placed.add(card.id);y+=COLLAPSED_CARD_HEIGHT+12;
      }
      const write={path,content:writeBoard(next),expected:board.revision||null};
      if(explicit)explicit.content=write.content;else result.push(write);
    }
    return result;
  }
  async reconcile(paths?:string[]) {
    const folders=paths?new Set(paths.filter(p=>p.endsWith('.md')||p.endsWith('.whiteboard')).map(p=>dirname(p)==='.'?'':dirname(p))):undefined;
    const additions=this.automaticPlacements([],folders);
    if(additions.length)await this.write(additions);
  }
  async setPreferences(patch: Partial<Preferences>) {
    this.assertReady();
    this.preferences=await writePreferences(this.root,this.preferences,patch);
    return this.snapshot();
  }
  async createFolder(parent: string, name: string, position?:{x:number;y:number}) {
    if(position!==undefined&&(!position||!Number.isFinite(position.x)||!Number.isFinite(position.y)))throw new Error(ui.errors.invalidWhiteboardPosition);
    const container=position?this.allBoards().find(b=>b.folder===parent):undefined;
    if(position&&!container)throw new Error(ui.errors.parentWhiteboardMissing);
    if (!name || name.startsWith('.') || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || [...name].some(c => c.charCodeAt(0)<32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error(ui.errors.invalidFolderName);
    if (parent) await fs.access(await this.path(parent));
    const path=join(parent,name);
    await fs.mkdir(await this.path(path));
    this.folders.add(path);
    const board=emptyBoard(join(path,name+'.whiteboard'));
    const changes:Write[]=[{path:board.path,content:writeBoard(board),expected:null}];
    if(container&&position){
      container.cards.push({id:randomUUID(),cardId:'',folder:path,x:position.x,y:position.y,width:320,height:160});
      changes.push({path:container.path,content:writeBoard(container),expected:container.revision||null});
    }
    return this.write(changes);
  }
  tagCards(tag:string,text='',offset=0):TagResult[] {
    return this.queryCards({tag,tagChildren:true,text,limit:200,offset,sort:'name'}).map(({properties,...card})=>({card,properties}));
  }
  cardProperties(path:string) {
    const row=this.db.prepare('SELECT revision,frontmatter FROM cards WHERE path=?').get(path);
    if(!row)throw new Error(ui.errors.fileMissing);
    return {revision:String(row.revision),properties:JSON.parse(String(row.frontmatter))};
  }
  async createTag(tag:string) {return this.write([await this.newTagChange(tag)]);}
  private async newTagChange(tag:string) {
    if(!validTag(tag))throw new Error(ui.tags.invalidTag);
    tag.split('/').forEach(validateStem);
    if([...this.tags.values()].some(t=>t.tag===tag))throw new Error(ui.tags.duplicate(tag));
    const path='tags/'+tag+'.tag';await fs.mkdir(dirname(await this.path(path)),{recursive:true});
    return {path,content:`---\ntag: ${JSON.stringify(tag)}\nfields: []\ninherits: []\n---\n`,expected:null};
  }
  async saveTag(path:string,expected:string,fields:TagField[],inherits:string[],createParent?:string,propertiesCollapsed?:boolean) {
    if(!path.endsWith('.tag')||!Array.isArray(inherits)||createParent!==undefined&&(!validTag(createParent)||!inherits.includes(createParent)))throw new Error(ui.tags.invalidTag);
    const content=editTag(await this.read(path),fields,inherits,propertiesCollapsed),current=readTag(path,content);
    if(createParent===current.tag)throw new Error(ui.tags.cycle(current.tag));
    const parent=createParent?await this.newTagChange(createParent):undefined;
    return this.write([...(parent?[parent]:[]),{path,content,expected}]);
  }
  async renameTagProperty(path:string,expected:string,key:string,name:string) {
    if(!path.endsWith('.tag'))throw new Error(ui.tags.invalidTag);
    for(const file of this.issues.keys())if(/\.(md|tag)$/.test(file))throw new Error(ui.errors.renameRefresh(file));
    validateFields([{key:name,type:'text'}]);
    const raw=await this.read(path),definition=readTag(path,raw),tags=[...this.tags.values()];
    if(definition.revision!==expected)throw new Error(ui.errors.externalEdit(path));
    const warnings=resolveTag(tags,definition.tag).warnings;if(warnings.length)throw new Error(warnings.join('\n'));
    if(!definition.fields.some(field=>field.key===key))throw new Error(ui.tags.missingField(key));
    if(name===key&&!definition.fields.find(field=>field.key===key)!.label)return {snapshot:this.snapshot(),edits:[]};
    const oldKey=definition.tag+'/'+key,newKey=definition.tag+'/'+name,changes:Write[]=[];
    for(const tag of tags){
      const resolved=resolveTag(tags,tag.tag),owns=resolved.fields.some(field=>field.propertyKey===oldKey);
      if(name!==key&&owns&&resolved.fields.some(field=>field.key===name&&field.propertyKey!==oldKey))throw new Error(ui.tags.propertyNameConflict(name));
      const inherited=resolveTag(tags.map(item=>item===tag?{...item,fields:[],overrides:[]}:item),tag.tag).fields.some(field=>field.propertyKey===oldKey);
      if(tag.path!==path&&(!inherited||!tag.overrides.some(field=>field.key===key)))continue;
      const before=await this.read(tag.path);if(revision(before)!==tag.revision)throw new Error(ui.errors.externalEdit(tag.path));
      const {front,body}=splitNote(before);
      if(tag.path===path){const index=tag.fields.findIndex(field=>field.key===key);front.setIn(['fields',index,'key'],name);front.deleteIn(['fields',index,'label']);}
      if(inherited)tag.overrides.forEach((field,index)=>{if(field.key===key){front.setIn(['overrides',index,'key'],name);front.deleteIn(['overrides',index,'label']);}});
      changes.push({path:tag.path,content:`---\n${front.toString()}---\n${body}`,expected:tag.revision});
    }
    if(name!==key)for(const row of this.db.prepare('SELECT path,revision FROM cards').all()){
      const cardPath=String(row.path),before=await this.read(cardPath),{front,body}=splitNote(before);if(!front.has(oldKey))continue;
      if(revision(before)!==row.revision)throw new Error(ui.errors.externalEdit(cardPath));
      if(front.has(newKey))throw new Error(ui.tags.propertyNameConflict(name));
      const map=front.contents as import('yaml').YAMLMap,pair=map.items.find(pair=>String(pair.key)===oldKey)!;if(isScalar(pair.key))pair.key.value=newKey;else pair.key=front.createNode(newKey);
      changes.push({path:cardPath,content:`---\n${front.toString()}---\n${body}`,expected:String(row.revision)});
    }
    return this.write(changes);
  }
  async setCardTag(path:string,expected:string,tag:string,add:boolean,create=false) {
    if(!path.endsWith('.md')||typeof add!=='boolean'||typeof create!=='boolean'||create&&!add)throw new Error(ui.tags.invalidTag);
    const definition=create?await this.newTagChange(tag):undefined,tags=[...this.tags.values()];
    if(definition)tags.push(readTag(definition.path,definition.content));
    return this.write([...(definition?[definition]:[]),{path,content:editCardTag(await this.read(path),path,tags,tag,add),expected}]);
  }
  async reorderCardTags(path:string,expected:string,tags:string[]){
    if(!path.endsWith('.md'))throw new Error(ui.tags.invalidTag);
    return this.write([{path,content:reorderCardTags(await this.read(path),path,tags),expected}]);
  }
  async reorderTagProperties(path:string,expected:string,tag:string,keys:string[]){
    if(!path.endsWith('.md'))throw new Error(ui.tags.invalidTag);
    return this.write([{path,content:reorderTagProperties(await this.read(path),path,[...this.tags.values()],tag,keys),expected}]);
  }
  async addTagProperty(path:string,expected:string,tag:string,tagExpected:string,field:TagField,value:TagValue) {
    if(!path.endsWith('.md')||!validTag(tag)||typeof tagExpected!=='string')throw new Error(ui.tags.invalidTag);
    validateFields([field]);
    const tags=[...this.tags.values()],resolved=resolveTag(tags,tag),definition=tags.find(t=>t.tag===tag);
    if(!definition||resolved.warnings.length)throw new Error(resolved.warnings.join('\n')||ui.tags.missing(tag));
    if(resolved.fields.some(f=>f.key===field.key))throw new Error(ui.tags.invalidFields);
    const optional={...field,optional:true};delete optional.default;
    const raw=await this.read(definition.path),current=readTag(definition.path,raw),content=editTag(raw,[...current.fields,optional],current.inherits);
    const nextTags=tags.map(t=>t.path===definition.path?readTag(t.path,content):t);
    const cardRaw=await this.read(path);if(splitNote(cardRaw).front.has(tag+'/'+field.key))throw new Error(ui.tags.invalidFields);
    const card=editTagProperty(cardRaw,path,nextTags,tag,tag+'/'+field.key,value);
    return this.write([{path:definition.path,content,expected:tagExpected},{path,content:card,expected}]);
  }
  private viewPropertyContent(raw:string,path:string,key:string,value:TagValue){
    if(!path.endsWith('.md')||typeof key!=='string'||!key||key.length>256)throw new Error(ui.errors.invalidQuery);
    const {front,body}=splitNote(raw),stored=front.toJSON()?.tags;
    if(stored!==undefined&&stored!==null&&!(validTag(stored)||Array.isArray(stored)&&stored.every(validTag)))throw new Error(ui.tags.invalidStoredTags);
    const targets=viewPropertyTargets(key,[...this.tags.values()],front.toJSON()??{},this.preferences.query,true);
    for(const {field} of targets)validateTagValue(field,value);
    front.set('tags',[...new Set([...tagsFrom(front.toJSON()?.tags),...targets.map(t=>t.tag)])]);
    for(const property of new Set(targets.map(t=>t.field.propertyKey)))front.set(property,value);
    front.set('card-id',readCard(path,raw).id);
    return '---\n'+front.toString()+'---\n'+body;
  }
  async setViewProperty(path:string,expected:string,key:string,value:TagValue){
    return this.write([{path,expected,content:this.viewPropertyContent(await this.read(path),path,key,value)}]);
  }
  async setTagProperty(path:string,expected:string,tag:string,key:string,value:TagValue) {
    if(!path.endsWith('.md'))throw new Error(ui.tags.invalidTag);
    return this.write([{path,content:editTagProperty(await this.read(path),path,[...this.tags.values()],tag,key,value),expected}]);
  }
  async migrateRoot() {
    const cards=this.snapshot().cards.filter(c => dirname(c.path) === '.');
    if (!cards.length) return this.snapshot();
    const layouts=[...this.boards.values()].filter(b=>!b.folder&&b.cards.some(p=>!p.folder));
    if(layouts.length>1)throw new Error(ui.errors.multipleRootBoards);
    const source=layouts[0];
    const moving=new Set(cards.map(c => c.path));
    // Refuse a migration whose path-dependent syntax this importer cannot preserve.
    for (const row of this.db.prepare('SELECT path,body FROM cards').all()) {
      const path=String(row.path),body=String(row.body);
      marked.walkTokens(marked.lexer(body),token=>{
        if (moving.has(path) && (token.type==='html' || token.type==='text' && /\[\[|!\[\[/.test(token.raw))) throw new Error(ui.errors.migrationMarkup(path));
        if (!moving.has(path) && (token.type==='link' || token.type==='image') && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(token.href)) {
          const target=relative(this.root,resolve(this.root,dirname(path),decodeURIComponent(token.href.split(/[?#]/)[0])));
          if (moving.has(target)) throw new Error(ui.errors.migrationPathLink(target,path));
        }
      });
    }
    if (this.history.available) await this.history.checkpoint(ui.history.beforeRootCardsMigration);
    const names=new Set((await fs.readdir(this.root)).map(name => name.toLowerCase()));
    let folder='Notes', suffix=0;
    while (names.has(folder.toLowerCase())) folder='Notes_'+(++suffix);
    await fs.mkdir(join(this.root,folder));
    const changes: Write[]=[];
    for (const info of cards) {
      const raw=await this.read(info.path), card=readCard(info.path,raw);
      let body=card.body;
      const rewrite=(href: string) => {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return href;
        const target=href.replace(/^\.\//,'').split(/[?#]/)[0];
        return moving.has(decodeURIComponent(target)) ? href : '../'+href;
      };
      const tokens=marked.lexer(body);
      marked.walkTokens(tokens,token => {
        if ((token.type === 'image' || token.type === 'link') && token.raw.includes('](')) {
          const next=rewrite(token.href);
          if (next !== token.href) body=body.replace(token.raw,token.raw.replace(']('+token.href,']('+next).replace('](<'+token.href+'>','](<'+next+'>'));
        }
      });
      body=body.replace(/^( {0,3}\[[^\]\n]+\]:\s*)<?([^\s>]+)>?/gm,(_all,lead,href) => lead+'<'+rewrite(href)+'>');
      changes.push({path:join(folder,info.path),content:editCard(raw,card,body),expected:null},{path:info.path,content:null,expected:info.revision});
    }
    const path=join(folder,folder+'.whiteboard'),board=source?{...source,path,folder,name:folder,cards:source.cards.filter(p=>!p.folder)}:emptyBoard(path);
    const placements=new Set(board.cards.map(p=>p.id));
    board.edges=board.edges.filter(e=>placements.has(e.from)&&placements.has(e.to));
    changes.push({path,content:writeBoard(board),expected:null});
    if(source){
      const remaining=source.cards.filter(p=>p.folder),ids=new Set(remaining.map(p=>p.id));
      // Keep the mother board and its sub-whiteboard positions; retire an old mismatched file only when empty.
      const content=source.path===this.boardPath('')||remaining.length?writeBoard({...source,cards:remaining,edges:source.edges.filter(e=>ids.has(e.from)&&ids.has(e.to))}):null;
      changes.push({path:source.path,content,expected:source.revision});
    }
    const remap=(value:string)=>moving.has(value)?join(folder,value):value,tags=[...this.tags.values()];
    for(const change of changes)if(change.content!==null&&change.path.endsWith('.md'))change.content=remapTagReferences(change.content,change.path,tags,remap);
    for(const info of [...this.snapshot().cards,...tags]){if(moving.has(info.path))continue;const before=await this.read(info.path),after=remapTagReferences(before,info.path,tags,remap);if(after!==before)changes.push({path:info.path,content:after,expected:info.revision});}
    const originals=await Promise.all(changes.filter(c=>c.expected!==null).map(async c=>({path:c.path,content:await this.read(c.path)})));
    await fs.writeFile(join(this.cache,'migration-'+randomUUID()+'.json'),JSON.stringify({folder,originals},null,2),{flag:'wx'});
    await this.write(changes);
    await this.scan();
    if (this.history.available) await this.history.checkpoint(ui.history.moveRootCards(folder));
    return this.snapshot();
  }

  async create(folder: string, stem: string, x: number, y: number,place=true) {
    validateStem(stem);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(ui.errors.invalidPosition);
    if (folder) await fs.access(await this.path(folder));
    const directory = folder ? await this.path(folder) : this.root;
    const names = new Set((await fs.readdir(directory)).map(n => n.toLocaleLowerCase()));
    let filename = stem + '.md', i = 0;
    while (names.has(filename.toLocaleLowerCase())) filename = `${stem}_${++i}.md`;
    const path = join(folder,filename), raw = newNote(), card = readCard(path,raw);
    if(!place)return this.write([{path,content:raw,expected:null}]);
    const boardPath=this.boardPath(folder);
    const board=structuredClone(this.boards.get(boardPath)??emptyBoard(boardPath));
    board.cards.push({id:randomUUID(),cardId:card.id,x,y,width:340,height:280});
    return this.write([{path,content:raw,expected:null},{path:board.path,content:writeBoard(board),expected:board.revision || null}]);
  }
  private async recoverBoardRename() {
    const file=join(this.cache,'board-rename.json');
    let journal:{from:string;to:string;edits:{path:string;before:string;after:string}[];preferences:Preferences;nextPreferences:Preferences};
    try{journal=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
    const exists=async(path:string)=>{try{await fs.lstat(await this.path(path));return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}};
    const oldExists=await exists(journal.from),newExists=await exists(journal.to);
    if(oldExists===newExists)throw new Error(ui.errors.renameRecoveryPaths);
    const folder=newExists?journal.to:journal.from,oldBoard=join(folder,basename(journal.from)+'.whiteboard'),newBoard=join(folder,basename(journal.to)+'.whiteboard');
    const boardRenamed=await exists(newBoard);
    const both=boardRenamed&&await exists(oldBoard);
    if(both){const a=await fs.stat(await this.path(oldBoard)),b=await fs.stat(await this.path(newBoard));if(a.dev!==b.dev||a.ino!==b.ino)throw new Error(ui.errors.renameRecoveryMetadata);}
    const actual=(path:string)=>path===this.boardPath(journal.from)?(boardRenamed&&!both?newBoard:oldBoard):newExists?remapPath(path,journal.from,journal.to):path;
    const preferences=await readPreferences(this.root);
    if(JSON.stringify(preferences)!==JSON.stringify(journal.preferences)&&JSON.stringify(preferences)!==JSON.stringify(journal.nextPreferences))throw new Error(ui.errors.renameRecoverySettings);
    for(const edit of journal.edits){const raw=await this.read(actual(edit.path));if(raw!==edit.before&&raw!==edit.after)throw new Error(ui.errors.renameRecoveryChange(edit.path));}
    for(const edit of journal.edits)await this.atomic(actual(edit.path),edit.before);
    if(both)await fs.unlink(await this.path(newBoard));
    else if(boardRenamed)await fs.rename(await this.path(newBoard),await this.path(oldBoard));
    if(newExists)await fs.rename(await this.path(journal.to),await this.path(journal.from));
    this.preferences=await writePreferences(this.root,preferences,journal.preferences);
    await fs.unlink(file);this.renamePending=false;
  }
  async renameBoard(folder:string,name:string,expected:string):Promise<Mutation> {
    this.assertReady();
    validateStem(name);
    if(!folder)throw new Error(ui.errors.rootRename);
    const from=join(folder),to=join(dirname(from),name),boardPath=this.boardPath(from),board=this.boards.get(boardPath);
    if(!board||board.revision!==expected||revision(await this.read(boardPath))!==expected)throw new Error(ui.errors.renameChanged);
    if(from===to)return {snapshot:this.snapshot(),edits:[]};
    if(Buffer.byteLength(name+'.whiteboard')>255)throw new Error(ui.errors.longWhiteboardName);
    const target=await this.path(to),source=await this.path(from);
    if((await fs.readdir(dirname(source))).some(n=>n.toLowerCase()===name.toLowerCase()))throw new Error(ui.errors.folderNameConflict);
    if((await fs.readdir(source)).some(n=>n.toLowerCase()===(name+'.whiteboard').toLowerCase()))throw new Error(ui.errors.metadataNameConflict);
    const known=new Set([...this.boards.keys(),...(this.db.prepare('SELECT path FROM cards').all() as {path:string}[]).map(c=>c.path)]);
    const checkIndexed=async(folder:string):Promise<void>=>{for(const entry of await fs.readdir(await this.path(folder),{withFileTypes:true})){
      if(entry.name.startsWith('.')||entry.name==='node_modules'||entry.isSymbolicLink())continue;
      const path=join(folder,entry.name);
      if(entry.isDirectory())await checkIndexed(path);
      else if(/\.(md|whiteboard)$/.test(entry.name)&&!known.has(path))throw new Error(ui.errors.renameIndexing(path));
    }};
    await checkIndexed(from);
    const edits:{path:string;before:string;after:string}[]=[];
    // ponytail: rename scans note links; add a path-link index if large-workspace renames become slow.
    for(const row of this.db.prepare('SELECT path,revision FROM cards').all()){
      const path=String(row.path),before=await this.read(path);
      if(revision(before)!==row.revision)throw new Error(ui.errors.renameRefresh(path));
      const card=readCard(path,before),nextPath=remapPath(path,from,to);
      const rewrite=(href:string)=>{
        if(/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href))return href;
        const [link]=href.split(/[?#]/),tail=href.slice(link.length);
        let decoded:string;try{decoded=decodeURIComponent(link);}catch{return href;}
        const target=relative(this.root,resolve(this.root,dirname(path),decoded)),mapped=remapFilePath(target,from,to);
        const next=relative(dirname(nextPath),mapped).split(sep).map(encodeURIComponent).join('/');
        return next===relative(dirname(path),target).split(sep).map(encodeURIComponent).join('/')?href:next+tail;
      };
      let body=card.body;
      marked.walkTokens(marked.lexer(body),token=>{if((token.type==='image'||token.type==='link')&&token.raw.includes('](')){const next=rewrite(token.href);if(next!==token.href)body=body.replace(token.raw,token.raw.replace(']('+token.href,']('+next).replace('](<'+token.href+'>','](<'+next+'>'));}});
      body=body.replace(/^( {0,3}\[[^\]\n]+\]:\s*)<?([^\s>]+)>?/gm,(all,lead,href)=>{const next=rewrite(href);return next===href?all:lead+'<'+next+'>';});
      const after=remapTagReferences(body!==card.body||nextPath!==path&&card.legacy?editCard(before,card,body):before,path,[...this.tags.values()],value=>remapFilePath(value,from,to));
      if(after!==before)edits.push({path,before,after});
    }
    for(const tag of this.tags.values()){
      const before=await this.read(tag.path);if(revision(before)!==tag.revision)throw new Error(ui.errors.renameRefresh(tag.path));
      const after=remapTagReferences(before,tag.path,[...this.tags.values()],value=>remapFilePath(value,from,to));if(after!==before)edits.push({path:tag.path,before,after});
    }
    for(const b of this.boards.values()){
      const before=await this.read(b.path);if(revision(before)!==b.revision)throw new Error(ui.errors.renameRefresh(b.path));
      const cards=b.cards.map(p=>p.folder?{...p,folder:remapPath(p.folder,from,to)}:p);
      if(b.path===boardPath||cards.some((p,i)=>p.folder!==b.cards[i].folder))edits.push({path:b.path,before,after:writeBoard({...b,name:b.path===boardPath?name:b.name,cards})});
    }
    const preferences=await readPreferences(this.root),nextPreferences=remapPreferences(preferences,from,to);
    const journalFile=join(this.cache,'board-rename.json'),handle=await fs.open(journalFile,'wx');
    this.renamePending=true;
    try{await handle.writeFile(JSON.stringify({from,to,edits,preferences,nextPreferences}));await handle.sync();}finally{await handle.close();}
    try{
      for(const edit of edits){if(await this.read(edit.path)!==edit.before)throw new Error(ui.errors.concurrentChange(edit.path));await this.atomic(edit.path,edit.after);}
      // link fails if the destination appeared externally; rename would overwrite it.
      await fs.link(await this.path(boardPath),await this.path(join(from,name+'.whiteboard')));
      await fs.unlink(await this.path(boardPath));
      try{await fs.lstat(target);throw new Error(ui.errors.renameDestinationAppeared);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(JSON.stringify(await readPreferences(this.root))!==JSON.stringify(preferences))throw new Error(ui.errors.renameSettingsChanged);
      await fs.rename(source,target);
      this.preferences=await writePreferences(this.root,preferences,nextPreferences);
      await fs.unlink(journalFile);this.renamePending=false;
    }catch(e){await this.recoverBoardRename().catch(()=>undefined);throw e;}
    this.pathMoves.push({from,to});
    await this.scan();
    return {snapshot:this.snapshot(),edits:[],move:{from,to}};
  }
  async renameCard(path:string,stem:string,expected:string):Promise<Mutation> {
    validateStem(stem);
    if(extname(path)!=='.md')throw new Error(ui.errors.onlyMarkdownCardsCanBeRenamedHere);
    const raw=await this.read(path),card=readCard(path,raw),next=join(dirname(path),stem+'.md');
    if(card.revision!==expected)throw new Error(ui.errors.renameConflict(path));
    if(next===path)return {snapshot:this.snapshot(),edits:[]};
    const names=await fs.readdir(dirname(await this.path(path)));
    if(names.some(name=>name.toLocaleLowerCase()===(stem+'.md').toLocaleLowerCase()))throw new Error(ui.errors.fileNameConflict);
    // Reuse the journaled transaction so rename is recoverable and one undo action.
    // Persist a legacy card's existing provisional identity before its path changes.
    const remap=(value:string)=>value===path?next:value,tags=[...this.tags.values()];
    const changes:Write[]=[{path,content:null,expected},{path:next,content:remapTagReferences(editCard(raw,card,card.body),path,tags,remap),expected:null}];
    for(const info of [...this.snapshot().cards,...tags]){if(info.path===path)continue;const before=await this.read(info.path),after=remapTagReferences(before,info.path,tags,remap);if(after!==before)changes.push({path:info.path,content:after,expected:info.revision});}
    return this.write(changes);
  }
  async saveCard(path: string, body: string, expected: string) {
    const raw = await this.read(path), card = readCard(path,raw);
    if (card.revision !== expected) throw new Error(ui.errors.draftConflict(path));
    return this.write([{path,content:editCard(raw,card,body),expected}]);
  }
  async setFill(cards:{path:string;expected:string}[],color:string|null,board?:{value:Board;expected:string}) {
    if(color!==null&&!isHexColor(color))throw new Error(ui.errors.invalidCardColor);
    const before=board&&this.boards.get(board.value.path),changes:Write[]=[];
    for(const {path,expected} of cards){
      const raw=await this.read(path),card=readCard(path,raw);
      if(card.revision!==expected)throw new Error(ui.errors.externalEdit(path));
      if(card.fillColor===color)continue;
      const {front,body}=splitNote(raw);front.set('card-id',card.id);front.set('card-color',color);
      changes.push({path,expected,content:`---\n${front.toString()}---\n${body}`});
    }
    if(board)changes.push({path:board.value.path,expected:board.expected,content:writeBoard(board.value)});
    const result=changes.length?await this.write(changes):{snapshot:this.snapshot(),edits:[]};
    if(board)this.rememberEdgeStyle(board.value,before);
    result.snapshot.lastEdgeStyle=this.lastEdgeStyle;
    return result;
  }
  private rememberEdgeStyle(board:Board,before:Board|undefined) {
    const previous=new Map(before?.edges.map(e=>[e.id,e]));
    // For a multi-edit, the last changed edge in board order supplies the full style.
    const edited=board.edges.findLast(e=>previous.has(e.id)&&JSON.stringify(edgeStyle(e))!==JSON.stringify(edgeStyle(previous.get(e.id)!)));
    if(!edited)return;
    this.lastEdgeStyle=edgeStyle(edited);
    try { this.db.prepare("INSERT OR REPLACE INTO ui_cache(key,value) VALUES('edge-style',?)").run(JSON.stringify(this.lastEdgeStyle)); }
    catch { /* Cache failure must not turn a successful document save into an error. */ }
  }
  async saveBoard(board: Board, expected: string) {
    const before=this.boards.get(board.path);
    const result=await this.write([{path:board.path,content:writeBoard(board),expected:expected || null}]);
    this.rememberEdgeStyle(board,before);result.snapshot.lastEdgeStyle=this.lastEdgeStyle;
    return result;
  }
  boardMentions(path:string) {
    const board=this.boards.get(path);if(!board)return [];
    const ids=[...new Set(board.cards.filter(p=>!p.folder).map(p=>p.cardId))];
    return this.db.prepare(`SELECT DISTINCT c.id AS "from", target.id AS "to"
      FROM json_each(?) selected JOIN cards c ON c.id=selected.value JOIN links l ON l.source=c.path JOIN cards target ON l.target=target.id OR (substr(l.target,1,5)='file:' AND target.path=substr(l.target,6))
      WHERE target.id IN (SELECT value FROM json_each(?)) AND c.id<>target.id`).all(JSON.stringify(ids),JSON.stringify(ids));
  }
  query(text: string) {
    if (text.startsWith('backlinks:')) return this.db.prepare("SELECT DISTINCT source AS path FROM links WHERE target=? OR target='file:'||(SELECT path FROM cards WHERE id=?)").all(text.slice(10),text.slice(10));
    return this.queryCards({text}).map(({path})=>({path}));
  }
  queryTags(text:string,exclude:string[]=[],limit=20):TagSearchResult[] {
    if(typeof text!=='string'||text.length>2048||!Array.isArray(exclude)||exclude.length>20000||exclude.some(t=>!validTag(t))||!Number.isInteger(limit)||limit<1||limit>100)throw new Error(ui.errors.invalidQuery);
    const excluded=new Set(exclude),allowed=new Set([...this.tags.values()].filter(tag=>!excluded.has(tag.tag)).map(tag=>tag.path));
    return this.search.search(text,allowed).slice(0,limit).map(hit=>{
      const tag=this.tags.get(hit.path)!,name='#'+tag.tag;
      return {kind:'tag',path:tag.path,name,tag:tag.tag,revision:tag.revision,snippet:'',score:hit.score,terms:hit.terms,highlights:{name:searchHighlights(name,hit.terms),path:searchHighlights(tag.path,hit.terms),snippet:[]}};
    });
  }
  searchWorkspace(text:string):WorkspaceSearchResult[] {
    return [...this.queryCards({text,limit:100}),...this.queryTags(text,[],100)].sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,100);
  }
  private kanbanColumns(source:string,id:string){
    const tags=[...this.tags.values()],plan=compileView(source,id,tags),view=plan.view;
    const fields=viewDisplayFields(view.groupBy?[view.groupBy]:[],tags,this.preferences.query),group=fields.length===1?fields[0]:undefined;
    if(view.type!=='kanban'||!group?.definition||!['status','select'].includes(group.type))throw new Error(ui.errors.invalidQuery);
    // Read IDs and indexed metadata only; bodies and previews never enter the ordering pass.
    const rows=this.db.prepare('SELECT c.id,c.path,c.frontmatter FROM cards c WHERE '+plan.where+' ORDER BY '+plan.order).all(...plan.args);
    const columns=new Map<string,string[]>(),keysByTags=new Map<string,string[]>();
    for(const row of rows){
      const props=JSON.parse(String(row.frontmatter)),signature=JSON.stringify(props.tags??[]);
      let keys=keysByTags.get(signature);
      if(!keys){const targets=viewPropertyTargets(group.keys[0],tags,props,this.preferences.query);keys=targets.length?[...new Set(targets.map(t=>t.field.propertyKey))]:group.keys;keysByTags.set(signature,keys);}
      const values=[...new Set(keys.map(key=>props[key]).filter(v=>typeof v==='string'&&v))];if(!values.length)values.push('');
      for(const value of values){if(!columns.has(value))columns.set(value,[]);columns.get(value)!.push(String(row.id));}
    }
    const block=parseViewBlock(source),cacheKey=JSON.stringify([block.query,view.id,view.filter,view.groupBy,view.sort,this.preferences.query]);
    const previous=this.viewOrderTails.get(cacheKey),manual=typeof view.sort!=='object',tails=new Map<string,string[]>();
    for(const [value,ids] of columns){const tail=orderedCardIds([],ids,previous?.get(value));tails.set(value,tail);if(manual)columns.set(value,orderedCardIds(view.order&&Object.hasOwn(view.order,value)?view.order[value]:[],tail));}
    this.viewOrderTails.delete(cacheKey);this.viewOrderTails.set(cacheKey,tails);
    if(this.viewOrderTails.size>20)this.viewOrderTails.delete(this.viewOrderTails.keys().next().value!);
    return {columns,total:rows.length,view,group};
  }
  viewCards(source:string,view:string,offset=0):import('../shared').ViewResults {
    if(typeof source!=='string'||typeof view!=='string'||!Number.isInteger(offset)||offset<0||offset>100000)throw new Error(ui.errors.invalidQuery);
    const plan=compileView(source,view,[...this.tags.values()]);
    let rows:Record<string,unknown>[],total:number,columns:import('../shared').ViewResults['columns'],nextOffset:number|undefined;
    if(plan.view.type==='kanban'&&plan.view.groupBy){
      const result=this.kanbanColumns(source,view);total=result.total;
      columns=[...result.columns].map(([value,ids])=>({value,ids:ids.slice(offset,offset+100),total:ids.length}));
      const ids=[...new Set(columns.flatMap(c=>c.ids))];
      rows=this.db.prepare('SELECT c.path,c.id,c.name,c.title,c.titleMarkdown,c.revision,c.legacy,c.frontmatter FROM cards c JOIN json_each(?) ids ON c.id=ids.value').all(JSON.stringify(ids));
      if(columns.some(c=>c.total>offset+100))nextOffset=offset+100;
    }else{
      total=Number(this.db.prepare('SELECT count(*) AS count FROM cards c WHERE '+plan.where).get(...plan.whereArgs)!.count);
      rows=this.db.prepare('SELECT c.path,c.id,c.name,c.title,c.titleMarkdown,c.revision,c.legacy,c.frontmatter FROM cards c WHERE '+plan.where+' ORDER BY '+plan.order+' LIMIT 100 OFFSET ?').all(...plan.args,offset);
      if(offset+rows.length<total)nextOffset=offset+rows.length;
    }
    return {total,...(columns?{columns}:{}),...(nextOffset!==undefined?{nextOffset}:{}),rows:rows.map(row=>{const {frontmatter,...card}=row,properties=JSON.parse(String(frontmatter));return {card:{...card,legacy:!!card.legacy,...(properties['card-color']!==undefined?{fillColor:properties['card-color']}: {})} as unknown as CardInfo,properties};})};
  }
  async moveViewCard(move:import('../shared').ViewCardMove){
    if(!move||typeof move!=='object'||!move.owner||!move.card||typeof move.owner.path!=='string'||!['.md','.tag'].includes(extname(move.owner.path))||typeof move.card.path!=='string'||!move.card.path.endsWith('.md')||typeof move.owner.expected!=='string'||typeof move.card.expected!=='string'||typeof move.owner.source!=='string'||typeof move.view!=='string'||!Number.isInteger(move.owner.block)||move.owner.block< -1||[move.from,move.to].some(v=>typeof v!=='string'||v.length>2048)||[move.before,move.after].some(v=>v!==undefined&&(typeof v!=='string'||!v||v.length>256)))throw new Error(ui.errors.invalidQuery);
    const raw=await this.read(move.owner.path),cardRaw=move.owner.path===move.card.path?raw:await this.read(move.card.path);
    if(revision(raw)!==move.owner.expected)throw new Error(ui.errors.externalEdit(move.owner.path));
    if(revision(cardRaw)!==move.card.expected)throw new Error(ui.errors.externalEdit(move.card.path));
    const card=readCard(move.card.path,cardRaw),block=parseViewBlock(move.owner.source),data=this.kanbanColumns(move.owner.source,move.view),view=block.views.find(v=>v.id===move.view)!;
    if(!data.columns.get(move.from)?.includes(card.id))throw new Error(viewText.errors.viewChanged);
    const target=data.columns.get(move.to)??[];
    if([move.before,move.after].some(id=>id!==undefined&&(id===card.id||!target.includes(id))))throw new Error(viewText.errors.viewChanged);
    const moved=move.from!==move.to;
    const content=moved?this.viewPropertyContent(cardRaw,card.path,fieldKeys(view.groupBy!)[0],move.to||null):cardRaw;
    if(typeof view.sort!=='object'){
      const saved=view.order&&Object.hasOwn(view.order,move.to)?view.order[move.to]:[];
      view.order=Object.fromEntries([...Object.entries(view.order??{}).map(([value,ids])=>[value,ids.filter(id=>id!==card.id)]),[move.to,moveCardId(saved,target,card.id,move.before,move.after)]]);
    }
    validateView(view,[...this.tags.values()]);const next=writeViewBlock(move.owner.source,block);parseViewBlock(next);
    const ownerContent=move.owner.path===card.path?content:raw,{header,body}=splitNote(ownerContent);
    let nextBody:string;
    if(move.owner.block===-1){if(!move.owner.path.endsWith('.tag')||viewBlockRanges(body).length)throw new Error(viewText.errors.viewChanged);nextBody=body+'\n\n```view-block\n'+next+'```\n';}
    else nextBody=replaceViewSource(body,move.owner.block,move.owner.source,next);
    const changes:Write[]=[{path:move.owner.path,expected:move.owner.expected,content:header+nextBody}];
    if(moved&&move.owner.path!==card.path)changes.push({path:card.path,expected:move.card.expected,content});
    return this.write(changes);
  }
  async saveTagBody(path:string,expected:string,body:string){
    if(!path.endsWith('.tag')||typeof body!=='string'||body.length>1000000)throw new Error(ui.tags.invalidTag);
    const {header}=splitNote(await this.read(path));return this.write([{path,expected,content:header+body}]);
  }
  queryCards(query:CardQuery):CardResult[] {
    if(!query||typeof query!=='object'||Array.isArray(query))throw new Error(ui.errors.invalidQuery);
    const {text='',folder,tag,backlinksTo,properties=[],sort,direction='asc',limit=100,offset=0}=query;
    if(typeof text!=='string'||text.length>2048||[folder,tag,backlinksTo].some(v=>v!==undefined&&(typeof v!=='string'||v.length>2048))||
      !Array.isArray(properties)||properties.length>20||!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>100000||
      sort!==undefined&&!['name','title','path'].includes(sort)||!['asc','desc'].includes(direction)||query.recursive!==undefined&&typeof query.recursive!=='boolean'||query.tagChildren!==undefined&&typeof query.tagChildren!=='boolean')throw new Error(ui.errors.invalidQuery);
    const where:string[]=[],args:(string|number|null)[]=[];
    if(folder!==undefined){const path=folder.replaceAll('\\','/').replace(/\/$/,'');
      if(query.recursive){where.push("(c.folder=? OR substr(c.folder,1,length(?))=?)");const prefix=path?path+'/':'';args.push(path,prefix,prefix);}
      else {where.push('c.folder=?');args.push(path);}
    }
    if(backlinksTo!==undefined){where.push("c.path IN (SELECT source FROM links WHERE target=? OR target='file:'||(SELECT path FROM cards WHERE id=?))");args.push(backlinksTo,backlinksTo);}
    if(tag!==undefined&&query.tagChildren){where.push("c.path IN (SELECT p.path FROM properties p,json_each(p.value) v WHERE p.field='tags' AND v.type='text' AND (v.value=? OR substr(v.value,1,length(?))=?))");args.push(tag,tag+'/',tag+'/');}
    const filters=[...properties,...(tag!==undefined&&!query.tagChildren?[{field:'tags',op:'contains' as const,value:tag}]:[])];
    for(const filter of filters){
      if(!filter||typeof filter.field!=='string'||filter.field.length>256||!['eq','contains','exists','gt','gte','lt','lte'].includes(filter.op)||
        filter.op!=='exists'&&(filter.value===undefined||!['string','number','boolean'].includes(typeof filter.value)&&filter.value!==null)||
        typeof filter.value==='string'&&filter.value.length>2048||typeof filter.value==='number'&&!Number.isFinite(filter.value))throw new Error(ui.errors.invalidQuery);
      let match='';args.push(filter.field);
      if(filter.op==='eq'){match=' AND p.value=?';args.push(JSON.stringify(filter.value));}
      else if(filter.op==='contains'){match=" AND EXISTS (SELECT 1 FROM json_each(p.value) v WHERE v.type=? AND v.value IS ?)";
        args.push(filter.value===null?'null':typeof filter.value==='boolean'?String(filter.value):typeof filter.value==='number'?Number.isInteger(filter.value)?'integer':'real':'text',typeof filter.value==='boolean'?Number(filter.value):filter.value!);}
      else if(filter.op!=='exists'){
        if(typeof filter.value!=='number')throw new Error(ui.errors.invalidQuery);
        const op={gt:'>',gte:'>=',lt:'<',lte:'<='}[filter.op];match=` AND json_type(p.value) IN ('integer','real') AND json_extract(p.value,'$') ${op} ?`;args.push(filter.value);
      }
      where.push(`c.path IN (SELECT p.path FROM properties p WHERE p.field=?${match})`);
    }
    const condition=where.length?' WHERE '+where.join(' AND '):'';
    let ranking=new Map<string,{score:number;terms:string[]}>();
    if(text.trim()){
      const allowed=where.length?new Set((this.db.prepare('SELECT c.path FROM cards c'+condition).all(...args) as {path:string}[]).map(c=>c.path)):undefined;
      ranking=new Map(this.search.search(text,allowed).map(hit=>[hit.path,hit]));
      if(!ranking.size)return [];

    }
    const joinRank=ranking.size?' JOIN json_each(?) hit ON c.path=hit.value':'';
    const ordering=sort?`c.${sort} COLLATE NOCASE ${direction},c.path`:ranking.size?'CAST(hit.key AS INTEGER)':'c.path';
    const rows=this.db.prepare('SELECT c.* FROM cards c'+joinRank+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY '+ordering+' LIMIT ? OFFSET ?')
      .all(...(ranking.size?[JSON.stringify([...ranking.keys()])]:[]),...args,limit,offset);
    return rows.map(row=>{
      const {body,frontmatter,folder:_,...card}=row;void _;
      const path=String(row.path),rank=ranking.get(path),terms=rank?.terms??[];
      let preview=this.searchPreviews.get(path);
      if(!preview){preview=searchDocument(String(body));this.searchPreviews.set(path,preview);
        // ponytail: cache the last 200 result previews; persist derived previews if profiling warrants it.
        if(this.searchPreviews.size>200)this.searchPreviews.delete(this.searchPreviews.keys().next().value!);
      }
      const properties=JSON.parse(String(frontmatter)),metadata=searchProperties(properties);
      const snippet=searchExcerpt(preview.text+(metadata?'\n'+metadata:''),terms);
      return {...card,legacy:!!card.legacy,...(properties['card-color']!==undefined?{fillColor:properties['card-color']}: {}),properties,snippet,score:rank?.score??0,terms,previewImage:preview.image,
        highlights:{name:searchHighlights(String(row.name),terms),path:searchHighlights(path,terms),snippet:searchHighlights(snippet,terms)}};
    }) as unknown as CardResult[];
  }
}
