import { promises as fs } from 'node:fs';
import { join, resolve, relative, basename, dirname, sep, extname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { marked } from 'marked';
import { defaultPreferences, readPreferences, writePreferences } from './preferences';
import { History } from './history';
import { readCard, editCard, readBoard, writeBoard, emptyBoard, revision, newNote, splitNote } from './format';
import { COLLAPSED_CARD_HEIGHT, placementHeight } from '../shared';
import type { Board, CardInfo, Snapshot, Write, Mutation, Preferences, TagInfo, TagResult } from '../shared';

export class Workspace {
  readonly history: History;
  private db: DatabaseSync;
  private folders = new Set<string>(['']);
  private tags = new Map<string,TagInfo>();
  private preferences = defaultPreferences();
  private boards = new Map<string, Board>();
  private issues = new Map<string, string>();
  private scanning = false;
  constructor(readonly root: string, readonly cache: string) {
    this.history = new History(root);
    this.db = new DatabaseSync(join(cache,'index.sqlite'));
    if (this.db.prepare('PRAGMA user_version').get()?.user_version !== 4) {
      this.db.exec('DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS search; DROP TABLE IF EXISTS links; PRAGMA user_version=4;');
    }
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cards(path TEXT PRIMARY KEY,id TEXT,name TEXT,body TEXT,revision TEXT,legacy INTEGER,frontmatter TEXT,title TEXT,folder TEXT,titleMarkdown TEXT);
      CREATE INDEX IF NOT EXISTS cards_folder ON cards(folder);
      CREATE INDEX IF NOT EXISTS card_identity ON cards(id);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(path UNINDEXED,name,body);
      CREATE TABLE IF NOT EXISTS links(source TEXT,target TEXT);
      CREATE INDEX IF NOT EXISTS backlinks ON links(target);
      CREATE INDEX IF NOT EXISTS outgoing_links ON links(source);`);
  }
  static async open(root: string, cache: string) {
    const actual = await fs.realpath(root);
    await fs.mkdir(cache,{recursive:true});
    const workspace = new Workspace(actual,cache);
    try {
      await workspace.recover();
      await workspace.history.initialize();
      await workspace.scan();
      if (workspace.history.available && !(await workspace.history.list()).length) await workspace.history.checkpoint('Workspace opened');
      return workspace;
    } catch(error) { workspace.close(); throw error; }
  }
  close() { this.db.close(); }
  private async path(path: string) {
    if (!path || isAbsolute(path) || path.includes('\0') || path.split(/[\\/]/).some(p => p === '..' || p.startsWith('.'))) throw new Error('Invalid workspace path');
    const target = resolve(this.root,path);
    if (!target.startsWith(this.root + sep)) throw new Error('Path leaves workspace');
    let current = this.root;
    for (const part of relative(this.root,target).split(sep)) {
      current = join(current,part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not supported'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return target;
  }
  async read(path: string) { return fs.readFile(await this.path(path),'utf8'); }
  async card(path: string) { return readCard(path,await this.read(path)); }
  async asset(path: string) { return this.path(path); }
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
    const file = join(this.cache,'transaction.json');
    let journal: { path: string; before: string | null; after: string | null }[];
    try { journal = JSON.parse(await fs.readFile(file,'utf8')); } catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
    for (const item of journal) {
      const current = await this.raw(item.path);
      if (current !== item.before && current !== item.after) throw new Error(`Recovery needs attention for ${item.path}. Backups are preserved in ${file}.`);
    }
    for (const item of journal) await this.atomic(item.path,item.before);
    await fs.unlink(file);
  }
  async write(changes: Write[]): Promise<Mutation> {
    if (!changes.length || new Set(changes.map(c => c.path)).size !== changes.length) throw new Error('Invalid edit');
    changes=this.automaticPlacements(changes);
    const journal = [];
    for (const change of changes) {
      if (!['.md','.whiteboard'].includes(extname(change.path)) || (change.content !== null && typeof change.content !== 'string')) throw new Error('Unsupported file edit');
      const before = await this.raw(change.path);
      if ((before === null ? null : revision(before)) !== change.expected) throw new Error(`External changes detected in ${change.path}. Your edit has not overwritten them.`);
      if (change.content !== null) {
        if (change.path.endsWith('.md')) readCard(change.path,change.content); else readBoard(change.path,change.content);
      }
      journal.push({ path: change.path, before, after: change.content });
    }
    const journalFile = join(this.cache,'transaction.json');
    const handle = await fs.open(journalFile,'wx');
    try { await handle.writeFile(JSON.stringify(journal)); await handle.sync(); } finally { await handle.close(); }
    try {
      for (const item of journal) {
        if (await this.raw(item.path) !== item.before) throw new Error(`Concurrent change in ${item.path}; recovery copies retained.`);
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
    this.db.prepare('DELETE FROM search WHERE rowid=(SELECT rowid FROM cards WHERE path=?)').run(path);
    this.db.prepare('DELETE FROM cards WHERE path=?').run(path);
    this.db.prepare('DELETE FROM links WHERE source=?').run(path);
  }
  async refresh(path: string,reconcile=true) {
    if (!['.md','.whiteboard','.tag'].includes(extname(path))) return;
    this.issues.delete(path);
    this.boards.delete(path); this.tags.delete(path);
    try {
      const raw = await this.raw(path);
      if (raw === null) { this.removeIndex(path); return; }
      let folder=dirname(path);
      while (folder !== '.') { this.folders.add(folder); folder=dirname(folder); }
      if (path.endsWith('.tag')) {
        const {front}=splitNote(raw), name=basename(path,'.tag');
        this.tags.set(path,{path,name,tag:String(front.get('tag') ?? name),revision:revision(raw)});
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
        this.db.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?)').run(card.path,card.id,card.name,card.body,card.revision,Number(card.legacy),JSON.stringify(splitNote(raw).front.toJSON() ?? {}),card.title??'',dirname(path)==='.'?'':dirname(path),card.titleMarkdown??'');
        this.db.prepare('INSERT INTO search(rowid,path,name,body) SELECT rowid,path,name,body FROM cards WHERE path=?').run(card.path);
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
    const cards = this.db.prepare('SELECT path,id,name,title,titleMarkdown,revision,legacy FROM cards ORDER BY path').all() as unknown as CardInfo[];
    const duplicates = this.db.prepare('SELECT id FROM cards GROUP BY id HAVING count(*)>1').all();
    return { root:this.root, name:basename(this.root), cards:cards.map(c => ({...c,legacy:!!c.legacy})), boards:this.allBoards(), issues:[...this.issues.values(),...duplicates.map(c => `Duplicate card identity: ${c.id}. These cards need distinct IDs.`)], historyAvailable:this.history.available, folders:[...this.folders].sort(), tags:[...this.tags.values()], preferences:this.preferences };
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
    this.preferences=await writePreferences(this.root,this.preferences,patch);
    return this.snapshot();
  }
  async createFolder(parent: string, name: string) {
    if (!name || name.startsWith('.') || /[<>:"/\\|?*]/.test(name) || /[. ]$/.test(name) || [...name].some(c => c.charCodeAt(0)<32) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error('Choose a valid folder name');
    if (parent) await fs.access(await this.path(parent));
    const path=join(parent,name);
    await fs.mkdir(await this.path(path));
    this.folders.add(path);
    const board=emptyBoard(join(path,name+'.whiteboard'));
    return this.write([{path:board.path,content:writeBoard(board),expected:null}]);
  }
  tagCards(tag: string): TagResult[] {
    // Properties come from the incremental index, not another filesystem scan.
    const rows=this.db.prepare('SELECT path,id,name,revision,legacy,frontmatter FROM cards').all();
    return rows.flatMap(row => {
      const properties=JSON.parse(String(row.frontmatter)) as Record<string,unknown>;
      const tags=Array.isArray(properties.tags) ? properties.tags : typeof properties.tags === 'string' ? [properties.tags] : [];
      return tags.some(t => t === tag || String(t).startsWith(tag+'/')) ? [{
        card:{path:String(row.path),id:String(row.id),name:String(row.name),revision:String(row.revision),legacy:!!row.legacy},properties,
      }] : [];
    });
  }
  async migrateRoot() {
    const cards=this.snapshot().cards.filter(c => dirname(c.path) === '.');
    if (!cards.length) return this.snapshot();
    const layouts=[...this.boards.values()].filter(b=>!b.folder&&b.cards.some(p=>!p.folder));
    if(layouts.length>1)throw new Error('Root migration needs manual attention: more than one root whiteboard contains cards.');
    const source=layouts[0];
    const moving=new Set(cards.map(c => c.path));
    // Refuse a migration whose path-dependent syntax this importer cannot preserve.
    for (const row of this.db.prepare('SELECT path,body FROM cards').all()) {
      const path=String(row.path),body=String(row.body);
      marked.walkTokens(marked.lexer(body),token=>{
        if (moving.has(path) && (token.type==='html' || token.type==='text' && /\[\[|!\[\[/.test(token.raw))) throw new Error('Root migration needs manual attention for unsupported markup in '+path);
        if (!moving.has(path) && (token.type==='link' || token.type==='image') && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(token.href)) {
          const target=relative(this.root,resolve(this.root,dirname(path),decodeURIComponent(token.href.split(/[?#]/)[0])));
          if (moving.has(target)) throw new Error('Replace the path link to '+target+' in '+path+' with a stable card link before root migration.');
        }
      });
    }
    if (this.history.available) await this.history.checkpoint('Before root cards migration');
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
    const originals=await Promise.all(changes.filter(c=>c.expected!==null).map(async c=>({path:c.path,content:await this.read(c.path)})));
    await fs.writeFile(join(this.cache,'migration-'+randomUUID()+'.json'),JSON.stringify({folder,originals},null,2),{flag:'wx'});
    await this.write(changes);
    await this.scan();
    if (this.history.available) await this.history.checkpoint('Move root cards into '+folder);
    return this.snapshot();
  }

  async create(folder: string, stem: string, x: number, y: number,place=true) {
    if (!stem || stem.startsWith('.') || /[<>:"/\\|?*]/.test(stem) || [...stem].some(c => c.charCodeAt(0)<32) || /[. ]$/.test(stem) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) throw new Error('Choose a valid filename base');
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid position');
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
  async saveCard(path: string, body: string, expected: string) {
    const raw = await this.read(path), card = readCard(path,raw);
    if (card.revision !== expected) throw new Error(`External changes detected in ${path}. Your draft is preserved.`);
    return this.write([{path,content:editCard(raw,card,body),expected}]);
  }
  async saveBoard(board: Board, expected: string) {
    return this.write([{path:board.path,content:writeBoard(board),expected:expected || null}]);
  }
  query(text: string) {
    if (text.startsWith('backlinks:')) return this.db.prepare('SELECT DISTINCT source AS path FROM links WHERE target=?').all(text.slice(10));
    const terms = text.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replaceAll('"','""')}"*`).join(' AND ');
    return terms ? this.db.prepare('SELECT path FROM search WHERE search MATCH ? ORDER BY rank LIMIT 100').all(terms) : [];
  }
}
