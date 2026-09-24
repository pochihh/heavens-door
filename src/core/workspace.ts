import { promises as fs } from 'node:fs';
import { join, resolve, relative, basename, sep, extname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { marked } from 'marked';
import { History } from './history';
import { readCard, editCard, readBoard, writeBoard, emptyBoard, revision, newNote } from './format';
import type { Board, CardInfo, Snapshot, Write, Mutation } from '../shared';

export class Workspace {
  readonly history: History;
  private db: DatabaseSync;
  private boards = new Map<string, Board>();
  private issues = new Map<string, string>();
  private scanning = false;
  constructor(readonly root: string, readonly cache: string) {
    this.history = new History(root);
    this.db = new DatabaseSync(join(cache,'index.sqlite'));
    if (this.db.prepare('PRAGMA user_version').get()?.user_version !== 1) {
      this.db.exec('DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS search; DROP TABLE IF EXISTS links; PRAGMA user_version=1;');
    }
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cards(path TEXT PRIMARY KEY,id TEXT,name TEXT,body TEXT,revision TEXT,legacy INTEGER);
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
    for (const change of changes) await this.refresh(change.path);
    return {snapshot:this.snapshot(),edits:journal};
  }
  async scan() {
    const unseen=new Set((this.db.prepare('SELECT path FROM cards').all() as {path:string}[]).map(row => row.path));
    this.boards.clear(); this.issues.clear();
    const walk = async (folder: string) => {
      for (const entry of await fs.readdir(join(this.root,folder),{withFileTypes:true})) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
        const path = join(folder,entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && ['.md','.whiteboard'].includes(extname(path))) { unseen.delete(path); await this.refresh(path); }
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
    return this.snapshot();
  }
  private removeIndex(path: string) {
    this.db.prepare('DELETE FROM search WHERE rowid=(SELECT rowid FROM cards WHERE path=?)').run(path);
    this.db.prepare('DELETE FROM cards WHERE path=?').run(path);
    this.db.prepare('DELETE FROM links WHERE source=?').run(path);
  }
  async refresh(path: string) {
    if (!['.md','.whiteboard'].includes(extname(path))) return;
    this.issues.delete(path);
    this.boards.delete(path);
    try {
      const raw = await this.raw(path);
      if (raw === null) { this.removeIndex(path); return; }
      if (path.endsWith('.whiteboard')) { this.boards.set(path,readBoard(path,raw)); return; }
      const cached=this.db.prepare('SELECT revision FROM cards WHERE path=?').get(path);
      // Verify content hashes rather than trusting timestamps or file sizes.
      if (cached?.revision === revision(raw)) return;
      const card = readCard(path,raw);
      if (!this.scanning) this.db.exec('BEGIN');
      try {
        this.removeIndex(path);
        this.db.prepare('INSERT INTO cards VALUES(?,?,?,?,?,?)').run(card.path,card.id,card.name,card.body,card.revision,Number(card.legacy));
        this.db.prepare('INSERT INTO search(rowid,path,name,body) SELECT rowid,path,name,body FROM cards WHERE path=?').run(card.path);
        marked.walkTokens(marked.lexer(card.body), token => {
          if (token.type === 'link' && token.href.startsWith('card:')) this.db.prepare('INSERT INTO links VALUES(?,?)').run(path,token.href.slice(5));
        });
        if (!this.scanning) this.db.exec('COMMIT');
      } catch(e) { if (!this.scanning) this.db.exec('ROLLBACK'); throw e; }
    } catch(e) { this.removeIndex(path); this.issues.set(path,`${path}: ${String(e)}`); }
  }
  snapshot(): Snapshot {
    // ponytail: full metadata snapshots; switch to deltas if IPC dominates large-vault saves.
    // Bodies are fetched only for visible cards; a large vault never becomes one giant UI document.
    const cards = this.db.prepare('SELECT path,id,name,revision,legacy FROM cards ORDER BY path').all() as unknown as CardInfo[];
    const duplicates = this.db.prepare('SELECT id FROM cards GROUP BY id HAVING count(*)>1').all();
    return { root:this.root, name:basename(this.root), cards:cards.map(c => ({...c,legacy:!!c.legacy})), boards:[...this.boards.values()], issues:[...this.issues.values(),...duplicates.map(c => `Duplicate card identity: ${c.id}. These cards need distinct IDs.`)], historyAvailable:this.history.available };
  }
  async create(folder: string, stem: string, x: number, y: number) {
    if (!stem || stem.startsWith('.') || /[<>:"/\\|?*]/.test(stem) || [...stem].some(c => c.charCodeAt(0)<32) || /[. ]$/.test(stem) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) throw new Error('Choose a valid filename base');
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid position');
    if (folder) await fs.access(await this.path(folder));
    const directory = folder ? await this.path(folder) : this.root;
    const names = new Set((await fs.readdir(directory)).map(n => n.toLocaleLowerCase()));
    let filename = stem + '.md', i = 0;
    while (names.has(filename.toLocaleLowerCase())) filename = `${stem}_${++i}.md`;
    const path = join(folder,filename), raw = newNote(), card = readCard(path,raw);
    const boardPath = join(folder,`${folder ? basename(folder) : basename(this.root)}.whiteboard`);
    const matching = [...this.boards.values()].filter(b => b.folder === folder);
    if (matching.length > 1) throw new Error('More than one board in this folder; select a single board first');
    const board = structuredClone(matching[0] ?? emptyBoard(boardPath));
    board.cards.push({id:randomUUID(),cardId:card.id,x,y,width:340,height:280});
    return this.write([{path,content:raw,expected:null},{path:board.path,content:writeBoard(board),expected:board.revision || null}]);
  }
  async saveCard(path: string, body: string, expected: string) {
    const raw = await this.read(path), card = readCard(path,raw);
    if (card.revision !== expected) throw new Error(`External changes detected in ${path}. Your draft is preserved.`);
    return this.write([{path,content:editCard(raw,card,body),expected}]);
  }
  async saveBoard(board: Board, expected: string) {
    return this.write([{path:board.path,content:writeBoard(board),expected}]);
  }
  query(text: string) {
    if (text.startsWith('backlinks:')) return this.db.prepare('SELECT DISTINCT source AS path FROM links WHERE target=?').all(text.slice(10));
    const terms = text.trim().split(/\s+/).filter(Boolean).map(t => `"${t.replaceAll('"','""')}"*`).join(' AND ');
    return terms ? this.db.prepare('SELECT path FROM search WHERE search MATCH ? ORDER BY rank LIMIT 100').all(terms) : [];
  }
}
