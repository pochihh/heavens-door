import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';
import type {Mutation,Request} from '../src/shared';

test('the desktop worker accepts automatic whiteboard names and preserves request validation',{timeout:20000},async t=>{
  const directory=await fs.mkdtemp(join(tmpdir(),'heavens-door-worker-')),root=join(directory,'Workspace'),bundle=join(directory,'worker.cjs');
  await fs.mkdir(root);
  await build({entryPoints:['src/workspace-worker.ts'],bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});
  const worker=new Worker(bundle);let nextId=0;
  t.after(async()=>{await worker.terminate();await fs.rm(directory,{recursive:true,force:true});});
  const call=<T,>(request:Request)=>new Promise<T>((resolve,reject)=>{
    const id=++nextId;
    const cleanup=()=>{worker.off('message',message);worker.off('error',failed);};
    const failed=(error:Error)=>{cleanup();reject(error);};
    const message=(reply:{id?:number;error?:string;result:T})=>{if(reply.id!==id)return;cleanup();if(reply.error)reject(new Error(reply.error));else resolve(reply.result);};
    worker.on('message',message);worker.once('error',failed);worker.postMessage({id,request});
  });
  await call({kind:'open',root,cache:join(directory,'cache')});
  const first=await call<Mutation>({kind:'createFolder',parent:'',position:{x:125,y:-50}});
  assert.ok(first.snapshot.boards.some(b=>b.folder==='A new board'));
  assert.deepEqual(first.snapshot.boards.find(b=>!b.folder)!.cards.map(p=>[p.folder,p.x,p.y]),[['A new board',125,-50]]);
  const duplicate=await call<Mutation>({kind:'createFolder',parent:''});
  assert.ok(duplicate.snapshot.boards.some(b=>b.folder==='A new board 2'));
  await call({kind:'preferences',patch:{whiteboardName:'Ideas'}});
  const nested=await call<Mutation>({kind:'createFolder',parent:'A new board',position:{x:20,y:30}});
  assert.ok(nested.snapshot.boards.some(b=>b.folder===join('A new board','Ideas')));
  const stamp=await call<string>({kind:'prepareBoardTrash',folder:'A new board 2'});assert.match(stamp,/^[a-f0-9]{64}$/);
  const deleted=await call<import('../src/shared').FileMutation>({kind:'fileOperation',operation:{action:'trash',path:'A new board 2',expected:stamp}});
  assert.ok(!deleted.snapshot.boards.some(b=>b.folder==='A new board 2'));
  const restored=await call<import('../src/shared').FileMutation>({kind:'fileOperation',operation:deleted.inverse});assert.ok(restored.snapshot.boards.some(b=>b.folder==='A new board 2'));
  await assert.rejects(call({kind:'prepareBoardTrash',folder:''}),/Whiteboard|whiteboard/);
  await assert.rejects(call({kind:'createFolder',parent:'',name:42 as never}),/Invalid request value/);
  const journal=await call<Mutation&{path:string}>({kind:'openJournal',date:'2026-10-05',period:'daily'});assert.equal(journal.path,'Journal/2026/10/2026-10-05.md');
  assert.equal((await call<Mutation>({kind:'openJournal',date:'2026-10-05',period:'daily'})).edits.length,0);
  assert.equal((await call<unknown[]>({kind:'journalEntries',year:2026})).length,1);
  await assert.rejects(call({kind:'openJournal',date:'../escape',period:'daily'}),/Invalid journal date/);
});

test('a file-watcher startup error rejects opening instead of hanging',{timeout:15000},async t=>{
 const directory=await fs.mkdtemp(join(tmpdir(),'heavens-door-watch-error-')),root=join(directory,'Workspace'),bundle=join(directory,'worker.cjs');await fs.mkdir(root);
 await build({entryPoints:['src/workspace-worker.ts'],bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent',plugins:[{name:'watch-error',setup(plugin){plugin.onResolve({filter:/^chokidar$/},()=>({path:'watch-error',namespace:'watch-error'}));plugin.onLoad({filter:/.*/,namespace:'watch-error'},()=>({contents:`import {EventEmitter} from 'node:events';export default {watch(){const watcher=new EventEmitter();queueMicrotask(()=>watcher.emit('error',new Error('EMFILE: too many open files')));return watcher;}};`,loader:'js'}));}}]});
 const worker=new Worker(bundle);t.after(async()=>{await worker.terminate();await fs.rm(directory,{recursive:true,force:true});});
 await assert.rejects(new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Opening hung')),3000);worker.on('message',message=>{if(message.id!==1)return;clearTimeout(timeout);if(message.error)reject(new Error(message.error));else resolve(message.result);});worker.once('error',error=>{clearTimeout(timeout);reject(error);});worker.postMessage({id:1,request:{kind:'open',root,cache:join(directory,'cache')}});}),/EMFILE/);
});
