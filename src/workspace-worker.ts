import { ui } from './text/ui';
import { parentPort } from 'node:worker_threads';
import { relative, sep } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import {listFiles,inspectFile} from './core/files';
import { Workspace } from './core/workspace';
import type { Request } from './shared';

let workspace: Workspace | undefined;
let watcher: FSWatcher | undefined;
let queue: Promise<unknown> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | undefined;
const changed = new Set<string>();

function enqueue<T>(operation: () => Promise<T>) {
  const next = queue.then(operation);
  queue = next.catch(() => undefined);
  return next;
}
function string(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 32 * 1024 * 1024) throw new Error(ui.errors.invalidRequestValue);
}
async function dispatch(request: Request) {
  if (!request || typeof request !== 'object') throw new Error(ui.errors.invalidRequest);
  if (request.kind === 'open') {
    string(request.root); string(request.cache);
    const next=await Workspace.open(request.root,request.cache);
    clearTimeout(timer); changed.clear();
    await watcher?.close(); workspace?.close();
    workspace = next;
    const root = workspace.root;
    watcher = chokidar.watch(root, {
      ignoreInitial:true, awaitWriteFinish:{stabilityThreshold:200,pollInterval:50},
      ignored:path => relative(root,path).split(sep).some(p => p.startsWith('.') || p === 'node_modules'),
    });
    let directoryChanged=false;
    watcher.on('all', (event,path) => {
      if (event === 'addDir' || event === 'unlinkDir') directoryChanged=true;
      changed.add(relative(root,path));
      clearTimeout(timer);
      timer = setTimeout(() => {
        const paths = [...changed]; changed.clear(); const rescan=directoryChanged; directoryChanged=false;
        void enqueue(async () => {
          if (rescan) await workspace!.scan(); else {for (const path of paths) await workspace!.refresh(path,false);await workspace!.reconcile(paths);}
          parentPort!.postMessage({event:'change'});
        }).catch(error => parentPort!.postMessage({event:'error',error:String(error)}));
      },100);
    });
    watcher.on('error',error => parentPort!.postMessage({event:'error',error:String(error)}));
    await new Promise<void>(resolve => watcher!.once('ready',resolve));
    return workspace.snapshot();
  }
  if (!workspace) throw new Error(ui.errors.openAWorkspaceFirst);
  workspace.assertReady();
  switch (request.kind) {
    case 'preferences': return workspace.setPreferences(request.patch);
    case 'createFolder': string(request.parent); string(request.name); return workspace.createFolder(request.parent,request.name,request.position);
    case 'migrateRoot': return workspace.migrateRoot();
    case 'tagCards': string(request.tag); return workspace.tagCards(request.tag,request.text,request.offset);
    case 'createTag': string(request.tag);return workspace.createTag(request.tag);
    case 'saveTag': string(request.path);string(request.expected);if(request.createParent!==undefined)string(request.createParent);return workspace.saveTag(request.path,request.expected,request.fields,request.inherits,request.createParent,request.propertiesCollapsed);
    case 'cardProperties': string(request.path);return workspace.cardProperties(request.path);
    case 'setCardTag': string(request.path);string(request.expected);string(request.tag);return workspace.setCardTag(request.path,request.expected,request.tag,request.add,request.create);
    case 'reorderCardTags': string(request.path);string(request.expected);return workspace.reorderCardTags(request.path,request.expected,request.tags);
    case 'reorderTagProperties': string(request.path);string(request.expected);string(request.tag);return workspace.reorderTagProperties(request.path,request.expected,request.tag,request.keys);
    case 'addTagProperty': string(request.path);string(request.expected);string(request.tag);string(request.tagExpected);return workspace.addTagProperty(request.path,request.expected,request.tag,request.tagExpected,request.field,request.value);
    case 'setTagProperty': string(request.path);string(request.expected);string(request.tag);string(request.key);return workspace.setTagProperty(request.path,request.expected,request.tag,request.key,request.value);
    case 'listFiles': string(request.path);return listFiles(workspace.root,request.path);
    case 'inspectFile': string(request.path);return inspectFile(workspace.root,request.path);
    case 'snapshot': return workspace.snapshot();
    case 'boardMentions': string(request.path); return workspace.boardMentions(request.path);
    case 'create':
      string(request.folder); string(request.stem);
      if(request.place!==undefined&&typeof request.place!=='boolean')throw new Error(ui.errors.invalidPlacementFlag);
      return workspace.create(request.folder,request.stem,request.x,request.y,request.place);
    case 'renameBoard':
      string(request.folder); string(request.name); string(request.expected);
      return workspace.renameBoard(request.folder,request.name,request.expected);
    case 'renameCard':
      string(request.path); string(request.stem); string(request.expected);
      return workspace.renameCard(request.path,request.stem,request.expected);
    case 'saveCard':
      string(request.path); string(request.body); string(request.expected);
      return workspace.saveCard(request.path,request.body,request.expected);
    case 'setFill':
      if(!Array.isArray(request.cards)||request.cards.length>10000)throw new Error(ui.errors.invalidTransaction);
      for(const card of request.cards){string(card.path);string(card.expected);if(!card.path.endsWith('.md'))throw new Error(ui.errors.invalidWorkspacePath);}
      if(request.board){string(request.board.expected);string(request.board.value?.path);}
      return workspace.setFill(request.cards,request.color,request.board);
    case 'saveBoard':
      string(request.expected);
      if (!request.board || !Array.isArray(request.board.cards) || !Array.isArray(request.board.edges)) throw new Error(ui.errors.invalidBoard);
      string(request.board.path); string(request.board.name);
      return workspace.saveBoard(request.board,request.expected);
    case 'read': string(request.path); return workspace.read(request.path);
    case 'card': string(request.path); return workspace.card(request.path);
    case 'prepareDeletion':
      string(request.path);string(request.expected);
      if(!Array.isArray(request.placements)||!Array.isArray(request.edges)||request.placements.length>10000||request.edges.length>50000)throw new Error(ui.errors.invalidTransaction);
      request.placements.forEach(string);request.edges.forEach(string);
      return workspace.prepareDeletion(request.path,request.placements,request.edges,request.expected);
    case 'write':
      if (!Array.isArray(request.changes) || request.changes.length > 10000) throw new Error(ui.errors.invalidTransaction);
      for (const change of request.changes) {
        string(change.path);
        if (change.content !== null) string(change.content);
        if (change.expected !== null) string(change.expected);
      }
      return workspace.write(request.changes);
    case 'query': string(request.text); return workspace.query(request.text);
    case 'queryTags': string(request.text);return workspace.queryTags(request.text,request.exclude,request.limit);
    case 'searchWorkspace': string(request.text);return workspace.searchWorkspace(request.text);
    case 'queryCards': return workspace.queryCards(request.query);
    case 'checkpoint': string(request.label); await workspace.history.checkpoint(request.label); return workspace.history.list();
    case 'history': return workspace.history.list(request.limit);
    case 'checkpointChanges': string(request.id); return workspace.history.changes(request.id);
    case 'applyCheckpoint':
      string(request.source);string(request.target);
      await workspace.history.apply(request.source,request.target);
      return workspace.scan();
    case 'restore':
      string(request.id);
      await workspace.history.restore(request.id);
      return workspace.scan();
    default: throw new Error(ui.errors.unknownRequest);
  }
}
parentPort!.on('message', ({id,request}: {id:number;request:Request}) => {
  void enqueue(() => dispatch(request)).then(
    result => parentPort!.postMessage({id,result}),
    error => parentPort!.postMessage({id,error:error instanceof Error ? error.message : String(error)}),
  );
});
