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
  await assert.rejects(call({kind:'createFolder',parent:'',name:42 as never}),/Invalid request value/);
  const journal=await call<Mutation&{path:string}>({kind:'openJournal',date:'2026-10-05',period:'daily'});assert.equal(journal.path,'Journal/2026/10/2026-10-05.md');
  assert.equal((await call<Mutation>({kind:'openJournal',date:'2026-10-05',period:'daily'})).edits.length,0);
  assert.equal((await call<unknown[]>({kind:'journalEntries',year:2026})).length,1);
  await assert.rejects(call({kind:'openJournal',date:'../escape',period:'daily'}),/Invalid journal date/);
});
