import {operateFile,fileTrashEntries,fileStamp,editablePath,vacant,availableFilePath} from './files';
import {systemFolder,systemPath} from '../features';
import {DEFAULT_JOURNAL,DEFAULT_TEMPLATES,validNotePath,validJournalDay,journalWeek,journalDays,journalPath,journalToday,type JournalEntry,type JournalPeriod} from '../journal';
import {wallTime,DEFAULT_DATE_DISPLAY} from '../dates';
import {loadTemplate} from './templates';
import type {TemplateValues} from '../templates';
import {systemGuideBody,systemGuidePath} from '../system-guides';
import type {SystemEntry} from '../features';
import {moveCardLinks,rewriteHtmlLinks} from '../card-links';
import {cardFill} from '../colors';
import type {GraphNode,GraphLink,WorkspaceGraph} from '../graph';
import {isSystemGuide} from '../system-guides';
import {referenceHref,referencePath,referenceResolver} from '../document-links';
import {compileView} from './view-query';
import {viewPropertyTargets,viewDisplayFields,parseViewBlock,writeViewBlock,replaceViewSource,viewBlockRanges,orderedCardIds,moveCardId,fieldKeys,validateView,viewCreationChoices,resolveField} from '../view-block';
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
import { DEFAULT_CARD_FOLDER, COLLAPSED_CARD_HEIGHT, DEFAULT_WHITEBOARD_NAME, placementHeight, edgeStyle } from '../shared';
import type { Board, CardInfo, Snapshot, Write, Mutation, Preferences, TagInfo, TagResult, EdgeStyle, Deletion, CardQuery, CardResult } from '../shared';

const archiveName=/^[a-f0-9-]{36}\.(md|json)$/;
const isTrash=(path:string)=>archiveName.test(basename(path));
const isTrashNote=(path:string)=>isTrash(path)&&path.endsWith('.md');
function trashWrites(folder:string,path:string,raw:string,expected:string):Write[]{const archived=folder+'/'+randomUUID();return [{path:archived+'.md',content:raw,expected:null},{path:archived+'.json',content:JSON.stringify({path,deleted:new Date().toISOString()},null,2)+'\n',expected:null},{path,content:null,expected}];}

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
    if (this.db.prepare('PRAGMA user_version').get()?.user_version !== 8) {
      this.db.exec('DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS search; DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS properties; PRAGMA user_version=8;');
    }
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cards(path TEXT PRIMARY KEY,id TEXT,name TEXT,body TEXT,revision TEXT,legacy INTEGER,frontmatter TEXT,title TEXT,folder TEXT,titleMarkdown TEXT,searchText TEXT);
      CREATE INDEX IF NOT EXISTS cards_folder ON cards(folder);
      CREATE INDEX IF NOT EXISTS card_identity ON cards(id);
      CREATE INDEX IF NOT EXISTS journal_identity ON cards(json_extract(frontmatter,'$.journal.date'),json_extract(frontmatter,'$.journal.period'));
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
      await workspace.recoverFileMove();
      await workspace.recoverTransfer();
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
    if (!path || isAbsolute(path) || path.includes('\0') || (!(path==='.heavens-door/trash'||path===systemGuidePath('trash',this.preferences)&&path.startsWith('.heavens-door/trash/')||isTrash(path)&&dirname(path)==='.heavens-door/trash')&&path.split(/[\\/]/).some(p => p === '..' || p.startsWith('.')))) throw new Error(ui.errors.invalidWorkspacePath);
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
      changes.push(...trashWrites(systemPath('trash',this.preferences),card.path,raw,revision(raw)));
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
      if ((!validNotePath(change.path)&&!(change.path===systemGuidePath('trash',this.preferences)&&change.path.startsWith('.heavens-door/trash/')||isTrash(change.path)&&dirname(change.path)==='.heavens-door/trash')) || (change.content !== null && typeof change.content !== 'string')) throw new Error(ui.errors.unsupportedFileEdit);
      const before = await this.raw(change.path);
      if ((before === null ? null : revision(before)) !== change.expected) throw new Error(ui.errors.externalEdit(change.path));
      if (change.content !== null) {
        if(isTrash(change.path)&&change.path.endsWith('.json')&&(dirname(change.path)===systemPath('trash',this.preferences)||dirname(change.path)==='.heavens-door/trash'||changes.some(c=>c.path===change.path.slice(0,-5)+'.md'))){const meta=JSON.parse(change.content);if(!meta||!validNotePath(meta.path)||!meta.path.endsWith('.md')||!Number.isFinite(Date.parse(meta.deleted)))throw new Error(ui.errors.invalidEdit);await this.path(meta.path);}
        else if(change.path.endsWith('.tag'))readTag(change.path,change.content);else if (change.path.endsWith('.md')) readCard(change.path,change.content); else if(change.path.endsWith('.whiteboard'))readBoard(change.path,change.content);
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
    const created=journal.filter(e=>e.before===null&&e.after!==null&&e.path.endsWith('.md')&&!isTrash(e.path)).map(e=>readCard(e.path,e.after!));
    for(const edit of journal)if(edit.after===null&&edit.before!==null&&edit.path.endsWith('.md')&&!isTrash(edit.path)){const previous=readCard(edit.path,edit.before),next=created.find(c=>c.id===previous.id);if(next)this.pathMoves.push({from:edit.path,to:next.path});}
    return {snapshot:this.snapshot(),edits:journal};
  }
  async scan() {
    this.preferences=await readPreferences(this.root);
    const unseen=new Set((this.db.prepare('SELECT path FROM cards').all() as {path:string}[]).map(row => row.path));
    for(const path of [...this.tags.keys(),...this.boards.keys()])this.search.remove(path);
    this.boards.clear(); this.issues.clear(); this.folders=new Set(['']); this.tags.clear();
    const walk = async (folder: string) => {
      for (const entry of await fs.readdir(join(this.root,folder),{withFileTypes:true})) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
        const path = join(folder,entry.name);
        if(entry.isDirectory()&&/^[a-f0-9-]{36}\.trash$/.test(entry.name)&&await this.raw(join(folder,entry.name.slice(0,-6)+'.json'))!==null)continue;
        if (entry.isDirectory()) { this.folders.add(path); await walk(path); }
        else if (entry.isFile() && ['.md','.whiteboard','.tag'].includes(extname(path))) { unseen.delete(path); await this.refresh(path); }
      }
    };
    // One index transaction avoids a disk sync for each of ten thousand notes.
    this.scanning=true; this.db.exec('BEGIN');
    try {
      await walk('');
      const guide=systemGuidePath('trash',this.preferences);if(guide.startsWith('.heavens-door/trash/')&&await this.raw(guide)!==null){unseen.delete(guide);await this.refresh(guide);}
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
    if(path.startsWith(systemPath('trash',this.preferences)+'/')&&path.split('/').some(part=>/^[a-f0-9-]{36}\.trash$/.test(part)))return;
    if(isTrashNote(path)&&(dirname(path)===systemPath('trash',this.preferences)||await this.raw(path.slice(0,-3)+'.json')!==null)){this.removeIndex(path);return;}
    if (!['.md','.whiteboard','.tag'].includes(extname(path))) return;
    this.issues.delete(path);
    this.boards.delete(path); this.tags.delete(path);if(!path.endsWith('.md'))this.search.remove(path);
    try {
      const raw = await this.raw(path);
      if (raw === null) { this.removeIndex(path); return; }
      let folder=dirname(path);
      while (folder !== '.') { this.folders.add(folder); folder=dirname(folder); }
      if (path.endsWith('.tag')) {
        const tag=readTag(path,raw);this.tags.set(path,tag);this.search.update({path,name:tag.tag,title:tag.tag,body:''});
        return;
      }
      if (path.endsWith('.whiteboard')) { const board=readBoard(path,raw);this.boards.set(path,board);this.search.update({path,name:board.name,title:board.name,body:board.folder});return; }
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
          if(token.type!=='link')return;
          const target=token.href.startsWith('card:')?token.href.slice(5):token.href.startsWith('wiki:')?token.href:referencePath(path,token.href);
          if(target)this.db.prepare('INSERT INTO links VALUES(?,?)').run(path,token.href.startsWith('card:')||token.href.startsWith('wiki:')?target:'file:'+target);
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
    const boards=[...this.boards.values()].filter(b=>this.boardPath(b.folder)===b.path&&!systemFolder(b.folder,this.preferences));
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
      const cards=(board.folder?[...board.cards]:board.cards.filter(p=>p.folder)).filter(p=>!p.folder||children.includes(p.folder));
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
      if(!folder||systemFolder(folder,this.preferences))continue; // Special folders do not intake cards onto a board.
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
  async trashEntries():Promise<import('../shared').TrashEntry[]> {
    const archive=systemPath('trash',this.preferences),folder=join(this.root,archive);
    let files:string[];try{await this.path(archive+'/00000000-0000-0000-0000-000000000000.md');files=await fs.readdir(folder);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
    const entries=await Promise.all(files.filter(name=>isTrashNote(archive+'/'+name)).map(async name=>{
      const path=archive+'/'+name,raw=await this.read(path),metaRaw=await this.raw(path.slice(0,-3)+'.json'),meta=metaRaw?JSON.parse(metaRaw):undefined,card=readCard(typeof meta?.path==='string'?meta.path:path,raw);
      const info={id:card.id,path,name:card.name,title:card.title,titleMarkdown:card.titleMarkdown,revision:card.revision,legacy:card.legacy,tags:card.tags,fillColor:card.fillColor};return {...info,originalPath:typeof meta?.path==='string'?meta.path:undefined,deleted:Number.isFinite(Date.parse(meta?.deleted))?Date.parse(meta.deleted):(await fs.stat(await this.path(path))).mtimeMs};
    }));return [...entries,...await fileTrashEntries(this.root,archive)].sort((a,b)=>b.deleted-a.deleted);
  }
  async trashCard(path:string,expected:string){
    if(!validNotePath(path)||!path.endsWith('.md'))throw new Error(ui.errors.invalidWorkspacePath);
    const raw=await this.read(path),card=readCard(path,raw);if(card.revision!==expected)throw new Error(ui.errors.externalEdit(path));
    const changes:Write[]=trashWrites(systemPath('trash',this.preferences),path,raw,expected);
    for(const board of this.boards.values()){const removed=new Set(board.cards.filter(p=>p.cardId===card.id).map(p=>p.id));if(removed.size)changes.push({path:board.path,content:writeBoard({...board,cards:board.cards.filter(p=>!removed.has(p.id)),edges:board.edges.filter(e=>!removed.has(e.from)&&!removed.has(e.to))}),expected:board.revision});}
    return this.write(changes);
  }
  async restoreTrash(path:string,expected:string){
    if(!isTrashNote(path))throw new Error(ui.errors.invalidWorkspacePath);
    const raw=await this.read(path);if(revision(raw)!==expected)throw new Error(ui.errors.externalEdit(path));
    const metaPath=path.slice(0,-3)+'.json',metaRaw=await this.raw(metaPath),meta=metaRaw?JSON.parse(metaRaw):undefined;
    let destination=typeof meta?.path==='string'?meta.path:join(this.preferences.cardFolder??DEFAULT_CARD_FOLDER,'Restored card.md');
    if(!validNotePath(destination)||!destination.endsWith('.md'))throw new Error(ui.errors.invalidWorkspacePath);
    await this.path(destination);const stem=destination.slice(0,-3);let suffix=1;
    while(await this.raw(destination)!==null)destination=stem+' '+(++suffix)+'.md';
    await fs.mkdir(dirname(await this.path(destination)),{recursive:true});
    return this.write([{path:destination,content:raw,expected:null},{path,content:null,expected},...(metaRaw?[{path:metaPath,content:null,expected:revision(metaRaw)}]:[])]);
  }
  async setPreferences(patch: Partial<Preferences>) {
    this.assertReady();
    this.preferences=await writePreferences(this.root,this.preferences,patch);
    return this.snapshot();
  }
  async createFolder(parent: string, name?: string, position?:{x:number;y:number}) {
    if(position!==undefined&&(!position||!Number.isFinite(position.x)||!Number.isFinite(position.y)))throw new Error(ui.errors.invalidWhiteboardPosition);
    const container=position?this.allBoards().find(b=>b.folder===parent):undefined;
    if(position&&!container)throw new Error(ui.errors.parentWhiteboardMissing);
    const automatic=name===undefined;
    name??=this.preferences.whiteboardName??DEFAULT_WHITEBOARD_NAME;
    if (!name || name.startsWith('.') || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || [...name].some(c => c.charCodeAt(0)<32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error(ui.errors.invalidFolderName);
    const directory=parent?await this.path(parent):this.root,names=new Set((await fs.readdir(directory)).map(n=>n.toLocaleLowerCase())),stem=name;
    let suffix=1,path:string;
    while(true){
      if(automatic&&names.has(name.toLocaleLowerCase())){name=stem+' '+(++suffix);continue;}
      if(Buffer.byteLength(name+'.whiteboard')>255)throw new Error(ui.errors.longWhiteboardName);
      path=join(parent,name);
      try{await fs.mkdir(await this.path(path));break;}catch(error){if(!automatic||(error as NodeJS.ErrnoException).code!=='EEXIST')throw error;names.add(name.toLocaleLowerCase());}
    }
    this.folders.add(path);
    const board=emptyBoard(join(path,name+'.whiteboard'));
    const changes:Write[]=[{path:board.path,content:writeBoard(board),expected:null}];
    if(container&&position){
      container.cards.push({id:randomUUID(),cardId:'',folder:path,x:position.x,y:position.y,width:320,height:160});
      changes.push({path:container.path,content:writeBoard(container),expected:container.revision||null});
    }
    return this.write(changes);
  }
  async ensureFolder(path:string){
    if(!validNotePath(path)&&path!=='.heavens-door/trash')throw new Error(ui.errors.invalidWorkspacePath);
    await fs.mkdir(await this.path(path),{recursive:true});if(!path.startsWith('.'))this.folders.add(path);return this.snapshot();
  }
  async createEntry(folder:string,name:string,type:'file'|'folder'){
    if(!['file','folder'].includes(type))throw new Error(ui.errors.invalidRequestValue);
    validateStem(name);if(folder&&!validNotePath(folder))throw new Error(ui.errors.invalidWorkspacePath);
    if(type==='file'&&!extname(name))name+='.md';
    const directory=folder?await this.path(folder):this.root;await fs.mkdir(directory,{recursive:true});
    if((await fs.readdir(directory)).some(n=>n.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error(ui.errors.invalidFilename);
    const path=join(folder,name);
    if(type==='folder'){await fs.mkdir(await this.path(path));this.folders.add(path);return {snapshot:this.snapshot(),edits:[],path};}
    const content=name.endsWith('.md')?newNote():name.endsWith('.whiteboard')?writeBoard(emptyBoard(path)):name.endsWith('.tag')?`---\ntag: ${JSON.stringify(basename(name,'.tag'))}\nfields: []\ninherits: []\n---\n`:'';
    return {...await this.write([{path,content,expected:null}]),path};
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
    const path=systemPath('tags',this.preferences)+'/'+tag+'.tag';await fs.mkdir(dirname(await this.path(path)),{recursive:true});
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

  async createViewCard(owner:import('../shared').ViewCardMove['owner'],id:string,choice:number,column?:string,date?:TagValue){
    if(!owner||typeof owner.path!=='string'||typeof id!=='string'||!['.md','.tag'].includes(extname(owner.path))||typeof owner.expected!=='string'||!Number.isInteger(owner.block)||owner.block< -1||typeof owner.source!=='string'||!Number.isInteger(choice)||choice<0||column!==undefined&&typeof column!=='string')throw new Error(ui.errors.invalidQuery);
    const current=await this.read(owner.path);
    if(revision(current)!==owner.expected)throw new Error(ui.errors.externalEdit(owner.path));
    if(owner.block===-1){if(!owner.path.endsWith('.tag')||viewBlockRanges(splitNote(current).body).length)throw new Error(viewText.errors.viewChanged);}
    else replaceViewSource(splitNote(current).body,owner.block,owner.source,owner.source);
    const tags=[...this.tags.values()],plan=compileView(owner.source,id,tags),block=parseViewBlock(owner.source),rules=viewCreationChoices(block,plan.view)[choice];
    if(!rules)throw new Error(viewText.errors.invalidCondition);
    let folder:string|undefined,exactFolder:string|undefined,title='',stem=this.preferences.stem;
    const attached=new Set<string>(),values=new Map<string,TagValue>();
    for(const rule of rules){
      const key=fieldKeys(rule.field)[0],value=rule.value;
      if(key==='tags'){if(typeof value==='string')attached.add(value);continue;}
      if(key==='file.folder'){
        const next=String(value).replace(/\/$/,'');
        if(rule.op==='eq'){if(exactFolder!==undefined&&exactFolder!==next)throw new Error(viewText.errors.invalidCondition);exactFolder=next;}
        if(folder!==undefined&&folder&&next&&folder!==next&&!folder.startsWith(next+'/')&&!next.startsWith(folder+'/'))throw new Error(viewText.errors.invalidCondition);
        if(folder===undefined||next.length>folder.length)folder=next;
      }else if(key==='file.title')title=String(value);
      else if(key==='file.name')stem=String(value).replace(/\.md$/,'');
      else if(!key.startsWith('file.')){if(values.has(key)&&values.get(key)!==value)throw new Error(viewText.errors.invalidCondition);values.set(key,value as TagValue);}
    }
    if(exactFolder!==undefined&&folder!==exactFolder)throw new Error(viewText.errors.invalidCondition);
    const contextKey=column!==undefined?fieldKeys(plan.view.groupBy??[])[0]:date!==undefined?fieldKeys(plan.view.dateBy??[])[0]:undefined;
    if(column!==undefined&&plan.view.type!=='kanban'||date!==undefined&&plan.view.type!=='timeline'||(column!==undefined||date!==undefined)&&!contextKey)throw new Error(ui.errors.invalidQuery);
    for(const key of [...values.keys(),...(contextKey?[contextKey]:[])]){
      const field=resolveField(key,tags);if(!field.definition)throw new Error(viewText.errors.chooseProperty);
      if(![...attached].some(tag=>resolveTag(tags,tag).fields.some(f=>f.propertyKey===key)))attached.add(key.slice(0,-field.definition.key.length-1));
    }
    const path=await this.newCardPath(folder??this.preferences.cardFolder??DEFAULT_CARD_FOLDER,stem);
    let raw=newNote();for(const tag of attached)raw=editCardTag(raw,path,tags,tag,true);
    for(const [key,value] of values){const field=resolveField(key,tags).definition!;validateTagValue(field,value);const {front,body}=splitNote(raw);front.set(key,value);raw='---\n'+front.toString()+'---\n'+body;}
    if(contextKey)raw=this.viewPropertyContent(raw,path,contextKey,column!==undefined?column||null:date!);
    if(title)raw=editCard(raw,readCard(path,raw),'# '+title.replace(/[\r\n]+/g,' ')+'\n');
    return this.write([{path,content:raw,expected:null}]);
  }
  private journalWordCounts=new Map<string,{revision:string;words:number}>();
  journalEntries(year:number):JournalEntry[] {
    if(!Number.isInteger(year)||year<1001||year>9997)throw new Error(ui.journal.invalidDate);
    const settings=this.preferences.journal??DEFAULT_JOURNAL,days=journalDays(year),paths=new Map<string,{date:string;period:JournalPeriod}>();
    for(const day of days){paths.set(journalPath(settings,day,'daily'),{date:day,period:'daily'});const week=journalWeek(day);paths.set(journalPath(settings,week,'weekly'),{date:week,period:'weekly'});}
    const rows=this.db.prepare(`SELECT path,id,searchText,revision,json_extract(frontmatter,'$.journal.date') AS date,json_extract(frontmatter,'$.journal.period') AS period FROM cards WHERE (json_extract(frontmatter,'$.journal.date') BETWEEN ? AND ?) OR path IN (${[...paths].map(()=>'?').join(',')})`).all(days[0],days.at(-1)!,...paths.keys());
    const segments=new Intl.Segmenter(undefined,{granularity:'word'}),entries:JournalEntry[]=[];
    for(const row of rows){
      const path=String(row.path),identity=typeof row.date==='string'&&validJournalDay(row.date)&&['daily','weekly'].includes(String(row.period))?{date:row.date,period:row.period as JournalPeriod}:paths.get(path);
      if(!identity)continue;
      let count=this.journalWordCounts.get(path);if(count?.revision!==row.revision){count={revision:String(row.revision),words:[...segments.segment(String(row.searchText))].filter(s=>s.isWordLike).length};this.journalWordCounts.set(path,count);}
      entries.push({...identity,path,id:String(row.id),words:count.words});
    }
    return entries;
  }
  async templatePlan(template:string){return {inputs:(await loadTemplate(template,path=>this.read(path))).inputs};}
  async ensureSystemGuide(id:SystemEntry){
    if(!Object.hasOwn(systemGuideBody,id))throw new Error(ui.errors.invalidRequestValue);
    const path=systemGuidePath(id,this.preferences),raw=await this.raw(path);
    if(raw!==null){await this.refresh(path,false);return {snapshot:this.snapshot(),edits:[],path};}
    await fs.mkdir(dirname(await this.path(path)),{recursive:true});
    return {...await this.write([{path,content:newNote()+systemGuideBody[id],expected:null}]),path};
  }
  private async templateContent(template:string,path:string,title:string,day:string,period?:JournalPeriod,inputs:TemplateValues={}){
    const time=wallTime(new Date().toISOString(),this.preferences.dateDisplay??DEFAULT_DATE_DISPLAY).slice(11,19);
    const parts=template?(await loadTemplate(template,p=>this.read(p))).render(path,title,day,time,inputs):splitNote('# '+title+'\n');
    parts.front.set('card-id',randomUUID());parts.front.delete('journal');
    if(period)parts.front.set('journal',{date:day,period});
    return '---\n'+parts.front.toString()+'---\n'+parts.body;
  }
  async createFromTemplate(template:string,folder:string,stem:string,inputs:TemplateValues={}){
    if(!validNotePath(template)||!template.endsWith('.md')||!validNotePath(folder))throw new Error(ui.errors.invalidWorkspacePath);
    const path=await this.newCardPath(folder,stem),raw=await this.templateContent(template,path,basename(path,'.md'),journalToday(this.preferences.dateDisplay),undefined,inputs);
    return this.write([{path,content:raw,expected:null}]);
  }
  async createTemplate(period?:JournalPeriod){
    if(period!==undefined&&!['daily','weekly'].includes(period))throw new Error(ui.errors.invalidRequestValue);
    const folder=(this.preferences.templates??DEFAULT_TEMPLATES).folder,path=await this.newCardPath(folder,period==='daily'?'Daily template':period==='weekly'?'Weekly template':'New template');
    return this.write([{path,content:newNote()+'# {{title}}\n\n{{date}}\n\n'+(period==='weekly'?'## Weekly review\n\n':period==='daily'?'## Notes\n\n':''),expected:null}]);
  }
  async openJournal(date:string,period:JournalPeriod,inputs:TemplateValues={}){
    if(!validJournalDay(date)||!['daily','weekly'].includes(period))throw new Error(ui.journal.invalidDate);
    const day=period==='weekly'?journalWeek(date):date,entries=this.db.prepare(`SELECT path FROM cards WHERE json_extract(frontmatter,'$.journal.date')=? AND json_extract(frontmatter,'$.journal.period')=?`).all(day,period) as {path:string}[];
    if(entries.length>1)throw new Error(ui.journal.duplicate(entries.map(e=>e.path)));
    if(entries.length)return {snapshot:this.snapshot(),edits:[],path:entries[0].path};
    const settings=this.preferences.journal??DEFAULT_JOURNAL,path=journalPath(settings,day,period),existing=await this.raw(path);
    // Never replace a conventional existing date note. It can be opened without migration.
    if(existing!==null){const identity=splitNote(existing).front.toJSON()?.journal;if(identity&&(identity.date!==day||identity.period!==period))throw new Error(ui.journal.pathConflict(path));readCard(path,existing);return {snapshot:this.snapshot(),edits:[],path};}
    const template=period==='daily'?settings.dailyTemplate:settings.weeklyTemplate,raw=await this.templateContent(template,path,basename(path,'.md'),day,period,inputs);
    await fs.mkdir(dirname(await this.path(path)),{recursive:true});
    return {...await this.write([{path,content:raw,expected:null}]),path};
  }
  private async newCardPath(folder:string,stem:string){
    validateStem(stem);
    const directory=folder?await this.path(folder):this.root;await fs.mkdir(directory,{recursive:true});
    const names=new Set((await fs.readdir(directory)).map(n=>n.toLocaleLowerCase()));
    let filename=stem+'.md',i=0;while(names.has(filename.toLocaleLowerCase()))filename=`${stem}_${++i}.md`;
    return join(folder,filename);
  }
  async create(folder: string, stem: string, x: number, y: number,place=true) {
    validateStem(stem);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(ui.errors.invalidPosition);
    const path=await this.newCardPath(folder,stem),raw=newNote(),card=readCard(path,raw);
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
  private async linkEdits(moves:{from:string;to:string}[]){
    if(!moves.length)return [];
    const remap=(path:string)=>{const move=moves.find(m=>path===m.from||path.startsWith(m.from+'/'));return move?remapFilePath(path,move.from,move.to):path;};
    const edits:{path:string;before:string;after:string}[]=[],targets:import('../shared').ReferenceTarget[]=[...this.db.prepare('SELECT id,path,name FROM cards').all().map(c=>({kind:'card' as const,key:'card:'+c.id,path:String(c.path),name:String(c.name)})),...this.allBoards().map(b=>({kind:'board' as const,key:'board:'+b.folder,path:b.path,name:b.name}))];
    const resolveReference=referenceResolver(targets);
    // ponytail: rename scans note links; add a path-link index if large-workspace renames become slow.
    for(const row of this.db.prepare('SELECT path,revision FROM cards').all()){
      const path=String(row.path),before=await this.read(path);
      if(revision(before)!==row.revision)throw new Error(ui.errors.renameRefresh(path));
      const card=readCard(path,before),nextPath=remap(path);
      const rewrite=(href:string)=>{
        if(/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href))return href;
        const [link]=href.split(/[?#]/),tail=href.slice(link.length);
        let decoded:string;try{decoded=decodeURIComponent(link);}catch{return href;}
        const target=relative(this.root,resolve(this.root,dirname(path),decoded)),mapped=remap(target);
        const next=relative(dirname(nextPath),mapped).split(sep).map(encodeURIComponent).join('/');
        return next===relative(dirname(path),target).split(sep).map(encodeURIComponent).join('/')?href:next+tail;
      };
      let body=card.body;
      marked.walkTokens(marked.lexer(body),token=>{if(token.type==='link'&&token.href.startsWith('wiki:')){const matches=resolveReference(path,token.href),target=matches.length===1?matches[0].path:undefined;if(target&&remap(target)!==target){const original=decodeURIComponent(token.href.slice(5)),fragment=original.includes('#')?original.slice(original.indexOf('#')):'',alias=token.raw.includes('|')?'|'+token.raw.slice(token.raw.indexOf('|')+1,-2):'';body=body.replace(token.raw,'[['+remap(target).replace(/\.md$/i,'')+fragment+alias+']]');}}else if((token.type==='image'||token.type==='link')&&token.raw.includes('](')){const next=rewrite(token.href);if(next!==token.href)body=body.replace(token.raw,token.raw.replace(']('+token.href,']('+next).replace('](<'+token.href+'>','](<'+next+'>'));}else if(token.type==='html')body=body.replace(token.raw,rewriteHtmlLinks(token.raw,rewrite));});
      body=body.replace(/^( {0,3}\[[^\]\n]+\]:\s*)<?([^\s>]+)>?/gm,(all,lead,href)=>{const next=rewrite(href);return next===href?all:lead+'<'+next+'>';});
      const after=remapTagReferences(body!==card.body||nextPath!==path&&card.legacy?editCard(before,card,body):before,path,[...this.tags.values()],value=>remap(value));
      if(after!==before)edits.push({path,before,after});
    }
    for(const tag of this.tags.values()){
      const before=await this.read(tag.path);if(revision(before)!==tag.revision)throw new Error(ui.errors.renameRefresh(tag.path));
      const after=remapTagReferences(before,tag.path,[...this.tags.values()],value=>remap(value));if(after!==before)edits.push({path:tag.path,before,after});
    }
    return edits;
  }
  private async pathEdits(from:string,to:string,boardPath=this.boardPath(from),name=basename(to),position?:{x:number;y:number}){
    const edits=await this.linkEdits([{from,to}]);
    const displayed=this.allBoards(),movingBoard=displayed.find(b=>b.folder===from),tile=displayed.flatMap(b=>b.cards).find(p=>p.folder===from);
    let destination=dirname(to)==='.'?'':dirname(to);
    while(destination&&!displayed.some(b=>b.folder===destination&&b.folder!==from&&!b.folder.startsWith(from+'/')))destination=dirname(destination)==='.'?'':dirname(destination);
    const movingCard=this.snapshot().cards.find(c=>c.path===from),home=dirname(from)==='.'?'':dirname(from),cardFolder=dirname(to)==='.'?'':dirname(to),owned=displayed.find(b=>b.folder===home)?.cards.find(p=>p.cardId===movingCard?.id);
    for(const b of this.boards.values()){
      const before=await this.read(b.path);if(revision(before)!==b.revision)throw new Error(ui.errors.renameRefresh(b.path));
      const cards=b.cards.filter(p=>!(movingBoard&&p.folder===from&&b.folder!==destination)&&!(movingCard&&b.folder===home&&home!==dirname(to)&&p.cardId===movingCard.id)).map(p=>p.folder?{...p,folder:remapPath(p.folder,from,to)}:p);
      if(movingBoard&&b.folder===destination){
        const existing=cards.find(p=>p.folder===to);
        if(existing){if(position){existing.x=position.x;existing.y=position.y;}}
        else cards.push({...tile,id:tile?.id??randomUUID(),cardId:'',folder:to,x:position?.x??tile?.x??60,y:position?.y??tile?.y??60,width:tile?.width??320,height:tile?.height??160});
      }
      if(movingCard&&b.folder===cardFolder&&cardFolder&&cardFolder!==home&&!cards.some(p=>p.cardId===movingCard.id))cards.push({...owned,id:owned?.id??randomUUID(),cardId:movingCard.id,x:position?.x??owned?.x??80,y:position?.y??owned?.y??80,width:owned?.width??340,height:owned?.height??280});
      const ids=new Set(cards.map(p=>p.id)),edges=b.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
      if(b.path===boardPath||JSON.stringify(cards)!==JSON.stringify(b.cards))edits.push({path:b.path,before,after:writeBoard({...b,name:b.path===boardPath?name:b.name,cards,edges})});
    }
    return edits;
  }
  private async recoverFileMove(){
    const file=join(this.cache,'file-move.json');let journal:{from:string;to:string;edits:import('../shared').Edit[];preferences:Preferences;nextPreferences:Preferences};
    try{journal=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
    const exists=async(path:string)=>{try{await fs.lstat(await editablePath(this.root,path));return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}};
    const moved=await exists(journal.to);if(moved===await exists(journal.from))throw new Error(ui.errors.renameRecoveryPaths);
    const oldBoard=join(journal.to,basename(journal.from)+'.whiteboard'),newBoard=join(journal.to,basename(journal.to)+'.whiteboard'),boardRenamed=moved&&await exists(newBoard);
    const actual=(path:string)=>moved?path===this.boardPath(journal.from)?boardRenamed?newBoard:oldBoard:remapPath(path,journal.from,journal.to):path;
    const current=await readPreferences(this.root);if(JSON.stringify(current)!==JSON.stringify(journal.preferences)&&JSON.stringify(current)!==JSON.stringify(journal.nextPreferences))throw new Error(ui.errors.renameRecoverySettings);
    for(const edit of journal.edits){const raw=await this.read(actual(edit.path));if(raw!==edit.before&&raw!==edit.after)throw new Error(ui.errors.renameRecoveryChange(edit.path));}
    if(moved)await operateFile(this.root,systemPath('trash',this.preferences),{action:'move',path:journal.to,destination:journal.from});
    for(const edit of journal.edits)await this.atomic(edit.path,edit.before);
    this.preferences=await writePreferences(this.root,current,journal.preferences);await fs.unlink(file);this.renamePending=false;
  }
  async fileOperation(operation:import('../shared').FileOperation):Promise<import('../shared').FileMutation>{
    this.assertReady();
    if(operation.position&&(!Number.isFinite(operation.position.x)||!Number.isFinite(operation.position.y)))throw new Error(ui.errors.invalidWorkspacePath);
    if(operation.action!=='copy'&&operation.path===this.boardPath(''))throw new Error(ui.errors.rootRename);
    if(operation.action==='move'){
      const from=operation.path,to=operation.destination;if(!to)throw new Error(ui.errors.invalidWorkspacePath);
      const source=await editablePath(this.root,from),target=await editablePath(this.root,to,true);if(source===target||target.startsWith(source+sep))throw new Error(ui.errors.invalidWorkspacePath);await vacant(this.root,to);
      if(operation.expected&&await fileStamp(this.root,from)!==operation.expected)throw new Error(ui.errors.externalEdit(from));
      const edits=await this.pathEdits(from,to,undefined,undefined,operation.position);
      if(operation.boards){
        if(!Array.isArray(operation.boards)||operation.boards.length>10000)throw new Error(ui.errors.invalidTransaction);
        for(const restore of operation.boards){
          if(typeof restore.path!=='string'||typeof restore.content!=='string'||typeof restore.expected!=='string'||!this.boards.has(restore.path))throw new Error(ui.errors.invalidTransaction);
          readBoard(restore.path,restore.content);
          const before=await this.read(restore.path);if(revision(before)!==restore.expected)throw new Error(ui.errors.externalEdit(restore.path));
          const edit=edits.find(e=>e.path===restore.path);if(edit)edit.after=restore.content;else edits.push({path:restore.path,before,after:restore.content});
        }
      }
      const restoredBoards=edits.filter(e=>this.boards.has(e.path)).map(e=>({path:remapFilePath(e.path,from,to),content:e.before,expected:revision(e.after!)}));
      const preferences=await readPreferences(this.root),nextPreferences=remapPreferences(preferences,from,to),file=join(this.cache,'file-move.json'),handle=await fs.open(file,'wx');
      try{await handle.writeFile(JSON.stringify({from,to,edits,preferences,nextPreferences}));await handle.sync();}finally{await handle.close();}
      this.renamePending=true;
      try{
        for(const edit of edits){if(await this.read(edit.path)!==edit.before)throw new Error(ui.errors.concurrentEdit(edit.path));await this.atomic(edit.path,edit.after);}
        const result=await operateFile(this.root,systemPath('trash',this.preferences),{...operation,expected:undefined});
        this.preferences=await writePreferences(this.root,preferences,nextPreferences);await fs.unlink(file);this.renamePending=false;this.pathMoves.push({from,to});await this.scan();
        return {...result,inverse:{...result.inverse,boards:restoredBoards},snapshot:this.snapshot(),edits:[]};
      }catch(e){await this.recoverFileMove().catch(()=>undefined);throw e;}
    }
    if(operation.action==='copy'&&operation.destination)operation={...operation,destination:await availableFilePath(this.root,operation.destination)};
    const result=await operateFile(this.root,systemPath('trash',this.preferences),operation);await this.scan();return {...result,snapshot:this.snapshot(),edits:[]};
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
    const edits=await this.pathEdits(from,to,boardPath,name);
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
  async moveSelection(source:string,expected:string,ids:string[],destination:string,destinationExpected:string,x:number,y:number):Promise<import('../shared').TransferMutation>{
    this.assertReady();
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||![x,y].every(Number.isFinite)||source===destination)throw new Error(ui.errors.invalidTransaction);
    const origin=this.allBoards().find(b=>b.folder===source),target=this.allBoards().find(b=>b.folder===destination);
    if(!origin||!target)throw new Error(ui.errors.whiteboardMissing);
    if(origin.revision!==expected||target.revision!==destinationExpected)throw new Error(ui.errors.externalEdit(origin.path));
    const selected=new Set(ids),items=origin.cards.filter(p=>selected.has(p.id));
    if(items.length!==ids.length||!destination&&items.some(p=>!p.folder)||items.some(p=>p.folder&&(destination===p.folder||destination.startsWith(p.folder+'/'))))throw new Error(ui.errors.invalidWorkspacePath);
    const snapshot=this.snapshot(),paths=new Set<string>();
    for(const p of items){
      if(p.folder){if(!snapshot.boards.some(b=>b.folder===p.folder))throw new Error(ui.errors.whiteboardMissing);paths.add(p.folder);}
      else{const card=snapshot.cards.find(c=>c.id===p.cardId);if(!card)throw new Error(ui.errors.cardMissing);if(dirname(card.path)===source)paths.add(card.path);}
    }
    const moves:import('../shared').BoardTransfer['moves']=[];
    for(const from of paths){
      if([...paths].some(p=>p!==from&&from.startsWith(p+'/')))continue;
      const requested=join(destination,basename(from)),to=items.some(p=>p.folder===from)?requested:await availableFilePath(this.root,requested);
      if(moves.some(m=>m.to.toLocaleLowerCase()===to.toLocaleLowerCase()))throw new Error(ui.errors.fileNameConflict);
      moves.push({from,to,expected:await fileStamp(this.root,from)});
    }
    const remap=(path:string)=>{const move=moves.find(m=>path===m.from||path.startsWith(m.from+'/'));return move?remapFilePath(path,move.from,move.to):path;};
    const edits=await this.linkEdits(moves),left=Math.min(...items.map(p=>p.x)),top=Math.min(...items.map(p=>p.y));
    const placementIds=new Set(target.cards.map(p=>p.id)),edgeIds=new Set(target.edges.map(e=>e.id)),mappedIds=new Map<string,string>();
    const incoming=items.map(p=>{
      const id=placementIds.has(p.id)?randomUUID():p.id;placementIds.add(id);mappedIds.set(p.id,id);
      return {...p,id,x:p.x-left+x,y:p.y-top+y,...(p.folder?{folder:remap(p.folder)}:{})};
    });
    const connections=origin.edges.filter(e=>selected.has(e.from)&&selected.has(e.to)).map(e=>{const id=edgeIds.has(e.id)?randomUUID():e.id;edgeIds.add(id);return {...e,id,from:mappedIds.get(e.from)!,to:mappedIds.get(e.to)!};});
    for(const board of this.boards.values()){
      if(board.folder!==source&&board.folder!==destination&&!board.cards.some(p=>p.folder&&remap(p.folder)!==p.folder))continue;
      const before=await this.read(board.path);if(revision(before)!==board.revision)throw new Error(ui.errors.renameRefresh(board.path));
      const cards=board.cards.filter(p=>board.folder!==source||!selected.has(p.id)).map(p=>p.folder?{...p,folder:remap(p.folder)}:p);
      const remaining=new Set(cards.map(p=>p.id)),edges=board.edges.filter(e=>remaining.has(e.from)&&remaining.has(e.to));
      if(board.folder===destination){cards.push(...incoming);edges.push(...connections);}
      if(JSON.stringify(cards)!==JSON.stringify(board.cards)||JSON.stringify(edges)!==JSON.stringify(board.edges))edits.push({path:board.path,before,after:writeBoard({...board,cards,edges})});
    }
    return this.transfer({moves,changes:edits.map(e=>({path:e.path,content:e.after,expected:revision(e.before)}))});
  }
  private async recoverTransfer(){
    const file=join(this.cache,'board-transfer.json');
    let journal:{moves:import('../shared').BoardTransfer['moves'];edits:import('../shared').Edit[];preferences:Preferences;nextPreferences:Preferences};
    try{journal=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
    const exists=async(path:string)=>{try{await fs.lstat(await editablePath(this.root,path));return true;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e;}};
    const moved:import('../shared').BoardTransfer['moves']=[];
    for(const move of journal.moves){const atTarget=await exists(move.to);if(atTarget===await exists(move.from))throw new Error(ui.errors.renameRecoveryPaths);if(atTarget)moved.push(move);}
    const actual=(path:string)=>{const move=moved.find(m=>path===m.from||path.startsWith(m.from+'/'));return move?remapFilePath(path,move.from,move.to):path;};
    const current=await readPreferences(this.root);
    if(JSON.stringify(current)!==JSON.stringify(journal.preferences)&&JSON.stringify(current)!==JSON.stringify(journal.nextPreferences))throw new Error(ui.errors.renameRecoverySettings);
    for(const edit of journal.edits){const raw=await this.raw(actual(edit.path));if(raw!==edit.before&&raw!==edit.after)throw new Error(ui.errors.renameRecoveryChange(edit.path));}
    for(const move of moved.reverse())await operateFile(this.root,systemPath('trash',this.preferences),{action:'move',path:move.to,destination:move.from});
    for(const edit of journal.edits)await this.atomic(edit.path,edit.before);
    this.preferences=await writePreferences(this.root,current,journal.preferences);await fs.unlink(file);this.renamePending=false;
  }
  async transfer(operation:import('../shared').BoardTransfer):Promise<import('../shared').TransferMutation>{
    this.assertReady();
    if(!operation||!Array.isArray(operation.moves)||!Array.isArray(operation.changes)||operation.moves.length>10000||!operation.changes.length||operation.changes.length>10000||new Set(operation.changes.map(c=>c.path)).size!==operation.changes.length)throw new Error(ui.errors.invalidTransaction);
    const moves=operation.moves;
    for(const move of moves){
      if(typeof move.from!=='string'||typeof move.to!=='string'||typeof move.expected!=='string'||move.from===this.boardPath('')||move.from===move.to||move.to.startsWith(move.from+'/'))throw new Error(ui.errors.invalidTransaction);
      await editablePath(this.root,move.from);await editablePath(this.root,move.to,true);await vacant(this.root,move.to);
      if(await fileStamp(this.root,move.from)!==move.expected)throw new Error(ui.errors.externalEdit(move.from));
    }
    for(let i=0;i<moves.length;i++)for(let j=0;j<moves.length;j++)if(i!==j&&(moves[i].from===moves[j].from||moves[i].from.startsWith(moves[j].from+'/')||moves[i].to.toLocaleLowerCase()===moves[j].to.toLocaleLowerCase()||moves[i].to.startsWith(moves[j].to+'/')||moves[i].to===moves[j].from||moves[i].to.startsWith(moves[j].from+'/')))throw new Error(ui.errors.invalidTransaction);
    const edits:import('../shared').Edit[]=[];
    for(const change of operation.changes){
      if(typeof change.path!=='string'||typeof change.content!=='string'||typeof change.expected!=='string'||!validNotePath(change.path))throw new Error(ui.errors.invalidTransaction);
      const before=await this.read(change.path);if(revision(before)!==change.expected)throw new Error(ui.errors.externalEdit(change.path));
      if(change.path.endsWith('.whiteboard'))readBoard(change.path,change.content);else if(change.path.endsWith('.tag'))readTag(change.path,change.content);else if(change.path.endsWith('.md'))readCard(change.path,change.content);else throw new Error(ui.errors.unsupportedFileEdit);
      edits.push({path:change.path,before,after:change.content});
    }
    const preferences=await readPreferences(this.root),nextPreferences=moves.reduce((p,m)=>remapPreferences(p,m.from,m.to),preferences),file=join(this.cache,'board-transfer.json'),handle=await fs.open(file,'wx');
    try{await handle.writeFile(JSON.stringify({moves,edits,preferences,nextPreferences}));await handle.sync();}finally{await handle.close();}
    this.renamePending=true;
    try{
      for(const edit of edits){if(await this.read(edit.path)!==edit.before)throw new Error(ui.errors.concurrentEdit(edit.path));await this.atomic(edit.path,edit.after);}
      for(const move of moves)await operateFile(this.root,systemPath('trash',this.preferences),{action:'move',path:move.from,destination:move.to});
      this.preferences=await writePreferences(this.root,preferences,nextPreferences);
      const inverseMoves=await Promise.all(moves.map(async m=>({from:m.to,to:m.from,expected:await fileStamp(this.root,m.to)})));
      const remap=(path:string)=>{const move=moves.find(m=>path===m.from||path.startsWith(m.from+'/'));return move?remapFilePath(path,move.from,move.to):path;};
      const inverse={moves:inverseMoves,changes:edits.map(e=>({path:remap(e.path),content:e.before,expected:revision(e.after!)}))};
      await fs.unlink(file);this.renamePending=false;this.pathMoves.push(...moves.map(({from,to})=>({from,to})));await this.scan();
      return {snapshot:this.snapshot(),edits:[],inverse};
    }catch(e){await this.recoverTransfer().catch(()=>undefined);throw e;}
  }
  async placeCard(id:string,expected:string,folder:string,boardExpected:string,x:number,y:number,mode:'move'|'reference'|'move-reference',source?:string,placement?:string){
    if(!['move','reference','move-reference'].includes(mode)||!Number.isFinite(x)||!Number.isFinite(y)||!folder||source!==undefined&&typeof source!=='string')throw new Error(ui.errors.invalidQuery);
    const info=this.snapshot().cards.find(c=>c.id===id),board=this.boards.get(this.boardPath(folder));
    if(!info||!board)throw new Error(ui.errors.fileMissing);
    if(info.revision!==expected||board.revision!==boardExpected)throw new Error(ui.errors.externalEdit(info.path));
    const before=await this.read(info.path),card=readCard(info.path,before),moving=mode==='move'&&dirname(card.path)!==folder;
    if(card.revision!==expected)throw new Error(ui.errors.externalEdit(card.path));
    if(mode==='move-reference'&&!this.boards.get(this.boardPath(source??''))?.cards.some(p=>p.cardId===id&&(!placement||p.id===placement)))throw new Error(ui.errors.fileMissing);
    const path=moving?await this.newCardPath(folder,basename(card.path,'.md')):card.path,changes:Write[]=[],boards=new Map<string,Board>();
    const destination=structuredClone(board),existing=destination.cards.find(p=>p.cardId===id);
    if(existing){existing.x=x;existing.y=y;destination.cards=destination.cards.filter(p=>p!==existing).concat(existing);}
    else {const original=this.boards.get(this.boardPath(source??dirname(card.path)))?.cards.find(p=>p.cardId===id);destination.cards.push({...original,id:randomUUID(),cardId:id,x,y,width:original?.width??340,height:original?.height??280});}
    boards.set(destination.path,destination);
    if(mode!=='reference'){
      const home=dirname(card.path);if(mode==='move-reference'&&(!source||source===home))throw new Error(ui.errors.invalidQuery);
      const origins=new Set(mode==='move-reference'?[source!]:[home,...(source?[source]:[])]);
      for(const origin of origins){const original=this.boards.get(this.boardPath(origin));if(!original||original.path===board.path)continue;
        const ids=new Set(original.cards.filter(p=>p.cardId===id&&(mode!=='move-reference'||!placement||p.id===placement)).map(p=>p.id));if(!ids.size)continue;
        boards.set(original.path,{...original,cards:original.cards.filter(p=>!ids.has(p.id)),edges:original.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to))});
      }
    }
    if(moving){
      const edits=await this.pathEdits(card.path,path),own=edits.find(e=>e.path===card.path);
      changes.push({path:card.path,content:null,expected},{path,content:own?.after??editCard(before,card,moveCardLinks(card.body,card.path,path)),expected:null});
      for(const edit of edits)if(edit.path!==card.path&&!this.boards.has(edit.path))changes.push({path:edit.path,content:edit.after,expected:revision(edit.before)});
    }
    else if(card.legacy)changes.push({path:card.path,content:editCard(before,card,card.body),expected});
    for(const next of boards.values())changes.push({path:next.path,expected:next.revision,content:writeBoard(next)});
    return this.write(changes);
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
    const edits=await this.linkEdits([{from:path,to:next}]),own=edits.find(e=>e.path===path);
    const changes:Write[]=[{path,content:null,expected},{path:next,content:own?.after??editCard(raw,card,card.body),expected:null},...edits.filter(e=>e.path!==path).map(e=>({path:e.path,content:e.after,expected:revision(e.before)}))];
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
  workspaceGraph():WorkspaceGraph {
    const snapshot=this.snapshot(),prefs=snapshot.preferences,hidden=(path:string)=>isSystemGuide(path,prefs)||['templates','trash'].some(id=>{const folder=systemPath(id as 'templates'|'trash',prefs);return path===folder||path.startsWith(folder+'/');});
    const boardColors=new Map(snapshot.boards.flatMap(b=>b.cards.filter(p=>p.folder).map(p=>[p.folder,p.fillColor] as const)));
    const nodes:GraphNode[]=snapshot.boards.filter(b=>b.folder).map(b=>({kind:'board',key:'board:'+b.folder,path:b.path,name:b.name,color:boardColors.get(b.folder)}));
    const boards=new Map(snapshot.boards.map(b=>[b.folder,b])),placed=new Map<string,import('../shared').Placement>();
    for(const b of snapshot.boards)for(const p of b.cards)if(!p.folder&&!placed.has(p.cardId))placed.set(p.cardId,p);
    for(const card of snapshot.cards)if(!hidden(card.path)){const folder=dirname(card.path)==='.'?'':dirname(card.path),owner=boards.get(folder),placement=owner?.cards.find(p=>!p.folder&&p.cardId===card.id)??placed.get(card.id);nodes.push({kind:'card',key:'card:'+card.id,path:card.path,name:card.title||card.name,color:cardFill(card,placement)});}
    const byKey=new Map(nodes.map(n=>[n.key,n])),paths=new Map(nodes.map(n=>[n.path,n])),links:GraphLink[]=[],seen=new Set<string>();
    const add=(from:string,to:string,kind:GraphLink['kind'])=>{const key=kind+'|'+from+'|'+to;if(from!==to&&byKey.has(from)&&byKey.has(to)&&!seen.has(key)){seen.add(key);links.push({from,to,kind});}};
    for(const board of snapshot.boards){const from='board:'+board.folder;for(const placement of board.cards){const to=placement.folder?'board:'+placement.folder:'card:'+placement.cardId,node=byKey.get(to);if(!node)continue;const owned=!!placement.folder||dirname(node.path)===board.folder;add(from,to,owned?'membership':'reference');if(owned&&byKey.has(from))node.parent=from;}
      const placements=new Map(board.cards.map(p=>[p.id,p.folder?'board:'+p.folder:'card:'+p.cardId]));for(const edge of board.edges){const a=placements.get(edge.from),b=placements.get(edge.to);if(a&&b)add(a,b,'edge');}
    }
    // Ownership is file based even if an externally edited board has no placement yet.
    for(const node of nodes)if(node.kind==='card'&&!node.parent&&!systemFolder(dirname(node.path),prefs)){let folder=dirname(node.path);while(folder&&folder!=='.'){if(boards.has(folder)){node.parent='board:'+folder;add(node.parent,node.key,'membership');break;}folder=dirname(folder);}}
    const targets:import('../shared').ReferenceTarget[]=[...snapshot.cards.map(c=>({kind:'card' as const,key:'card:'+c.id,path:c.path,name:c.name})),...snapshot.boards.map(b=>({kind:'board' as const,key:'board:'+b.folder,path:b.path,name:b.name}))],resolve=referenceResolver(targets);
    for(const row of this.db.prepare('SELECT DISTINCT source,target FROM links').all()){const source=paths.get(String(row.source));if(!source)continue;const target=String(row.target),href=target.startsWith('file:')?referenceHref(source.path,target.slice(5)):target.startsWith('wiki:')?target:'card:'+target,matches=resolve(source.path,href);if(matches.length===1)add(source.key,matches[0].key,'mention');}
    return {nodes,links};
  }
  private wikiLinks(){
    const rows=this.db.prepare("SELECT source,target FROM links WHERE substr(target,1,5)='wiki:'").all();if(!rows.length)return [];
    const targets=this.db.prepare('SELECT id,path,name FROM cards').all().map(c=>({kind:'card' as const,key:'card:'+c.id,path:String(c.path),name:String(c.name)}));
    const match=referenceResolver(targets);
    return rows.flatMap(row=>{const matches=match(String(row.source),String(row.target));return matches.length===1?[{source:String(row.source),id:matches[0].key.slice(5)}]:[];});
  }
  boardMentions(path:string) {
    const board=this.boards.get(path);if(!board)return [];
    const ids=[...new Set(board.cards.filter(p=>!p.folder).map(p=>p.cardId))];
    const links=this.db.prepare(`SELECT DISTINCT c.id AS "from", target.id AS "to"
      FROM json_each(?) selected JOIN cards c ON c.id=selected.value JOIN links l ON l.source=c.path JOIN cards target ON l.target=target.id OR (substr(l.target,1,5)='file:' AND target.path=substr(l.target,6))
      WHERE target.id IN (SELECT value FROM json_each(?)) AND c.id<>target.id`).all(JSON.stringify(ids),JSON.stringify(ids));
    const sources=new Map(this.db.prepare('SELECT cards.id,cards.path FROM cards JOIN json_each(?) selected ON cards.id=selected.value').all(JSON.stringify(ids)).map(c=>[String(c.path),String(c.id)]));
    return [...links,...this.wikiLinks().filter(l=>sources.has(l.source)&&ids.includes(l.id)&&sources.get(l.source)!==l.id).map(l=>({from:sources.get(l.source)!,to:l.id}))];
  }
  query(text: string) {
    if (text.startsWith('backlinks:')) {const id=text.slice(10),rows=this.db.prepare("SELECT DISTINCT source AS path FROM links WHERE target=? OR target='file:'||(SELECT path FROM cards WHERE id=?)").all(id,id);return [...new Set([...rows.map(row=>String(row.path)),...this.wikiLinks().filter(l=>l.id===id).map(l=>l.source)])].map(path=>({path}));}
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
  queryReferences(text:string,cardsOnly=false,exclude:string[]=[]):import('../shared').ReferenceTarget[] {
    if(typeof text!=='string'||text.length>2048||typeof cardsOnly!=='boolean'||!Array.isArray(exclude)||exclude.length>20000||exclude.some(path=>typeof path!=='string'||path.length>4096))throw new Error(ui.errors.invalidQuery);
    const omitted=new Set(exclude),boards=new Map((cardsOnly?[]:this.allBoards()).filter(b=>!omitted.has(b.path)).map(b=>[b.path,b]));
    const cardAt=this.db.prepare('SELECT id,path,name,title FROM cards WHERE path=?');
    const paths=text.trim()?this.search.search(text).filter(hit=>!omitted.has(hit.path)&&(hit.path.endsWith('.md')||boards.has(hit.path))).slice(0,30).map(hit=>hit.path):[
      ...this.db.prepare('SELECT path FROM cards ORDER BY name').all().map(row=>String(row.path)),...boards.keys()
    ].filter(path=>!omitted.has(path)).sort((a,b)=>a.localeCompare(b)).slice(0,30);
    return paths.flatMap<import('../shared').ReferenceTarget>(path=>{const b=boards.get(path);if(b)return [{kind:'board' as const,key:'board:'+b.folder,path,name:b.name}];const c=cardAt.get(path);return c?[{kind:'card' as const,key:'card:'+c.id,path,name:String(c.title||c.name)}]:[];});
  }
  async createSlipboxCard(name:string,placement?:{folder:string;expected:string;x:number;y:number}){
    if(typeof name!=='string')throw new Error(ui.errors.invalidFilename);
    name=name.trim();validateStem(name);
    let board:Board|undefined;
    if(placement){
      if(typeof placement!=='object'||typeof placement.folder!=='string'||!placement.folder||typeof placement.expected!=='string'||!Number.isFinite(placement.x)||!Number.isFinite(placement.y))throw new Error(ui.errors.invalidQuery);
      board=this.boards.get(this.boardPath(placement.folder));if(!board)throw new Error(ui.errors.whiteboardMissing);if(board.revision!==placement.expected)throw new Error(ui.errors.whiteboardChanged(board.path));
    }
    const path=await this.newCardPath(systemPath('slipbox',this.preferences),name),raw=newNote()+'# '+name.replace(/[\\`*_{}[\]()#+.!<>~|]/g,'\\$&')+'\n\n',changes:Write[]=[{path,content:raw,expected:null}];
    if(board&&placement)changes.push({path:board.path,expected:board.revision,content:writeBoard({...board,cards:[...board.cards,{id:randomUUID(),cardId:readCard(path,raw).id,x:placement.x,y:placement.y,width:340,height:280}]})});
    return this.write(changes);
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
  private viewRowIds(source:string,id:string,plan:ReturnType<typeof compileView>){
    // Reconcile all indexed IDs so dragging a loaded row also preserves later query pages.
    const ids=this.db.prepare('SELECT c.id FROM cards c WHERE '+plan.where+' ORDER BY '+plan.order).all(...plan.args).map(row=>String(row.id));
    if(plan.view.sort!=='manual')return ids;
    const key=JSON.stringify([parseViewBlock(source).query,id,plan.view.filter,plan.view.type]);
    const tail=orderedCardIds([],ids,this.viewOrderTails.get(key)?.get('rows'));
    this.viewOrderTails.delete(key);this.viewOrderTails.set(key,new Map([['rows',tail]]));
    if(this.viewOrderTails.size>20)this.viewOrderTails.delete(this.viewOrderTails.keys().next().value!);
    return orderedCardIds(plan.view.order?.rows??[],tail);
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
    }else if(['table','list','timeline'].includes(plan.view.type)&&plan.view.sort==='manual'){
      const ordered=this.viewRowIds(source,view,plan);total=ordered.length;
      rows=this.db.prepare('SELECT c.path,c.id,c.name,c.title,c.titleMarkdown,c.revision,c.legacy,c.frontmatter FROM json_each(?) ids JOIN cards c ON c.id=ids.value ORDER BY ids.key').all(JSON.stringify(ordered.slice(offset,offset+100)));
      if(offset+rows.length<total)nextOffset=offset+rows.length;
    }else{
      total=Number(this.db.prepare('SELECT count(*) AS count FROM cards c WHERE '+plan.where).get(...plan.whereArgs)!.count);
      rows=this.db.prepare('SELECT c.path,c.id,c.name,c.title,c.titleMarkdown,c.revision,c.legacy,c.frontmatter FROM cards c WHERE '+plan.where+' ORDER BY '+plan.order+' LIMIT 100 OFFSET ?').all(...plan.args,offset);
      if(offset+rows.length<total)nextOffset=offset+rows.length;
    }
    const scopeTags=this.db.prepare("SELECT DISTINCT v.value FROM cards c,json_each(c.frontmatter,'$.tags') v WHERE v.type='text' AND "+plan.queryWhere).all(...plan.queryArgs).map(row=>String(row.value));
    return {total,scopeTags,...(columns?{columns}:{}),...(nextOffset!==undefined?{nextOffset}:{}),rows:rows.map(row=>{const {frontmatter,...card}=row,properties=JSON.parse(String(frontmatter));let preview:ReturnType<typeof searchDocument>|undefined;
      if(plan.view.type==='gallery'){
        const key=String(card.path);preview=this.searchPreviews.get(key);
        if(!preview){preview=searchDocument(String(this.db.prepare('SELECT body FROM cards WHERE path=?').get(String(card.path))?.body??''));if(this.searchPreviews.size>=256)this.searchPreviews.delete(this.searchPreviews.keys().next().value!);this.searchPreviews.set(key,preview);}
      }
      return {card:{...card,legacy:!!card.legacy,...(properties['card-color']!==undefined?{fillColor:properties['card-color']}: {})} as unknown as CardInfo,properties,...(preview?{previewImage:preview.image,snippet:preview.text.slice(0,200)}:{})};})};
  }
  async moveViewCard(move:import('../shared').ViewCardMove){
    if(!move||typeof move!=='object'||!move.owner||!move.card||typeof move.owner.path!=='string'||!['.md','.tag'].includes(extname(move.owner.path))||typeof move.card.path!=='string'||!move.card.path.endsWith('.md')||typeof move.owner.expected!=='string'||typeof move.card.expected!=='string'||typeof move.owner.source!=='string'||typeof move.view!=='string'||!Number.isInteger(move.owner.block)||move.owner.block< -1||[move.from,move.to].some(v=>typeof v!=='string'||v.length>2048)||[move.before,move.after].some(v=>v!==undefined&&(typeof v!=='string'||!v||v.length>256)))throw new Error(ui.errors.invalidQuery);
    const raw=await this.read(move.owner.path),cardRaw=move.owner.path===move.card.path?raw:await this.read(move.card.path);
    if(revision(raw)!==move.owner.expected)throw new Error(ui.errors.externalEdit(move.owner.path));
    if(revision(cardRaw)!==move.card.expected)throw new Error(ui.errors.externalEdit(move.card.path));
    const card=readCard(move.card.path,cardRaw),block=parseViewBlock(move.owner.source),view=block.views.find(v=>v.id===move.view);
    if(!view)throw new Error(ui.errors.invalidQuery);
    let content=cardRaw;
    if(['table','list','timeline'].includes(view.type)){
      if(move.from!=='rows'||move.to!=='rows'||(view.type==='timeline'?!view.dateBy:move.date!==undefined))throw new Error(ui.errors.invalidQuery);
      const plan=compileView(move.owner.source,move.view,[...this.tags.values()]),ids=this.viewRowIds(move.owner.source,move.view,plan);
      if(!ids.includes(card.id)||[move.before,move.after].some(id=>id!==undefined&&(id===card.id||!ids.includes(id))))throw new Error(viewText.errors.viewChanged);
      if(move.date!==undefined)content=this.viewPropertyContent(cardRaw,card.path,fieldKeys(view.dateBy!)[0],move.date);
      // Keep hidden IDs for returning results; freeze the current sort before switching to manual.
      const saved=view.sort==='manual'?view.order?.rows??[]:[...ids,...(view.order?.rows??[])];
      view.order={...view.order,rows:moveCardId(saved,ids,card.id,move.before,move.after)};
    }else{
      if(move.date!==undefined)throw new Error(ui.errors.invalidQuery);
      const data=this.kanbanColumns(move.owner.source,move.view);
      if(!data.columns.get(move.from)?.includes(card.id))throw new Error(viewText.errors.viewChanged);
      const target=data.columns.get(move.to)??[];
      if([move.before,move.after].some(id=>id!==undefined&&(id===card.id||!target.includes(id))))throw new Error(viewText.errors.viewChanged);
      if(move.from!==move.to)content=this.viewPropertyContent(cardRaw,card.path,fieldKeys(view.groupBy!)[0],move.to||null);
      if(typeof view.sort==='object'){
        // Freeze every current column before switching modes, including unloaded cards.
        view.order={...view.order,...Object.fromEntries([...data.columns].map(([value,ids])=>[value,[...new Set([...ids,...(view.order&&Object.hasOwn(view.order,value)?view.order[value]:[])])]]))};
      }
      const saved=view.order&&Object.hasOwn(view.order,move.to)?view.order[move.to]:[];
      view.order=Object.fromEntries([...Object.entries(view.order??{}).map(([value,ids])=>[value,ids.filter(id=>id!==card.id)]),[move.to,moveCardId(saved,target,card.id,move.before,move.after)]]);
    }
    view.sort='manual';
    validateView(view,[...this.tags.values()]);const next=writeViewBlock(move.owner.source,block);parseViewBlock(next);
    const ownerContent=move.owner.path===card.path?content:raw,{header,body}=splitNote(ownerContent);
    let nextBody:string;
    if(move.owner.block===-1){if(!move.owner.path.endsWith('.tag')||viewBlockRanges(body).length)throw new Error(viewText.errors.viewChanged);nextBody=body+'\n\n```view-block\n'+next+'```\n';}
    else nextBody=replaceViewSource(body,move.owner.block,move.owner.source,next);
    const changes:Write[]=[{path:move.owner.path,expected:move.owner.expected,content:header+nextBody}];
    if(content!==cardRaw&&move.owner.path!==card.path)changes.push({path:card.path,expected:move.card.expected,content});
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
    if(backlinksTo!==undefined){where.push('c.path IN (SELECT value FROM json_each(?))');args.push(JSON.stringify(this.query('backlinks:'+backlinksTo).map(row=>String(row.path))));}
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
