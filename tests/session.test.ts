import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../src/core/workspace';
import { Session } from '../src/renderer/session';
import type { Bridge } from '../src/shared';

test('typing during an in-flight save is retained, and conflicting drafts remain recoverable',async t => {
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-session-'));
  const root=join(folder,'notes'); await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache')); await w.create('','untitled',0,0);
  let release: () => void = () => undefined;
  let saving: () => void = () => undefined;
  let block=true;
  const started=new Promise<void>(resolve => { saving=resolve; });
  const gate=new Promise<void>(resolve => { release=resolve; });
  const bridge={request:async request => {
    if (request.kind === 'card') return w.card(request.path);
    if (request.kind === 'snapshot') return w.snapshot();
    if (request.kind === 'saveCard') {
      if (block) { block=false; saving(); await gate; }
      return w.saveCard(request.path,request.body,request.expected);
    }
    throw new Error('Unexpected request');
  }} as Bridge;
  const session=new Session(bridge); session.update({snapshot:w.snapshot()});
  t.after(async () => { session.dispose(); w.close(); await fs.rm(folder,{recursive:true,force:true}); });
  await session.select('untitled.md'); session.edit('First');
  const flush=session.run(() => session.flush()); await started;
  session.edit('First plus a newer keystroke'); release(); await flush;
  assert.equal((await w.card('untitled.md')).body,'First plus a newer keystroke');
  assert.equal(session.state.draft?.dirty,false);
  assert.equal(session.undoHistory.past.length,1);
  await fs.writeFile(join(root,'untitled.md'),(await w.read('untitled.md'))+'\nAn external edit');
  session.edit('A local draft');
  await assert.rejects(() => session.run(() => session.flush()),/External changes/);
  assert.equal(session.state.draft?.body,'A local draft');
  assert.equal(session.state.draft?.dirty,true);
  assert.match(await w.read('untitled.md'),/An external edit/);
});

test('reload and quit flush drafts independently of the UI, and refuse to discard a conflicting draft',async t => {
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-reload-'));
  const root=join(folder,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));await w.create('','untitled',0,0);
  let handler:(action:'reload'|'close')=>void=() => undefined;
  const completed:string[]=[],cancelled:string[]=[];
  const bridge={chooseWorkspace:async () => w.snapshot(),demo:async () => w.snapshot(),onChange:() => () => undefined,reload:() => undefined,assetUrl:path => path,currentWorkspace:async () => w.snapshot(),onClosing:callback => {handler=callback;return () => undefined;},finishClosing:action => completed.push(action),cancelClosing:action => cancelled.push(action),request:async request => {
    if (request.kind === 'card') return w.card(request.path);
    if (request.kind === 'saveCard') return w.saveCard(request.path,request.body,request.expected);
    throw new Error('Unexpected request');
  }} as Bridge;
  const session=new Session(bridge);session.connectWindow();
  t.after(async () => {session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  await session.resume();await session.select('untitled.md');session.edit('Save before reload');
  handler('reload');await session.run(async () => undefined);
  assert.deepEqual(completed,['reload']);assert.equal((await w.card('untitled.md')).body,'Save before reload');
  await fs.writeFile(join(root,'untitled.md'),(await w.read('untitled.md'))+'\nExternal edit');
  session.edit('Keep my conflicting draft');handler('close');await session.run(async () => undefined);
  assert.deepEqual(cancelled,['close']);assert.deepEqual(completed,['reload']);
  assert.equal(session.state.draft?.body,'Keep my conflicting draft');assert.equal(session.state.draft?.dirty,true);
});

test('typing in the previous card while the next card loads is saved before switching',async t => {
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-switch-'));
  const root=join(folder,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));await w.create('','a',0,0);await w.create('','b',400,0);
  let release:()=>void=() => undefined,loading:()=>void=() => undefined;
  const gate=new Promise<void>(resolve => {release=resolve;});
  const started=new Promise<void>(resolve => {loading=resolve;});
  const bridge={request:async request => {
    if (request.kind === 'card') {if (request.path === 'b.md') {loading();await gate;}return w.card(request.path);}
    if (request.kind === 'saveCard') return w.saveCard(request.path,request.body,request.expected);
    throw new Error('Unexpected request');
  }} as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});
  t.after(async () => {session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  await session.select('a.md');const switching=session.select('b.md');await started;
  session.edit('A final keystroke in A');release();await switching;
  assert.equal((await w.card('a.md')).body,'A final keystroke in A');assert.equal(session.state.draft?.card.path,'b.md');
});

test('rapid board edits save against their predecessor and remain undoable without overwriting external edits',async t => {
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-drag-'));
  const root=join(folder,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));await w.create('','a',0,0);
  let release:()=>void=() => undefined,started:()=>void=() => undefined;
  const gate=new Promise<void>(resolve => {release=resolve;}),saving=new Promise<void>(resolve => {started=resolve;});
  let writes=0;
  const bridge={request:async request => {
    if (request.kind === 'saveBoard') {if (++writes === 1) {started();await gate;}return w.saveBoard(request.board,request.expected);}
    if (request.kind === 'write') return w.write(request.changes);
    if (request.kind === 'snapshot') return w.snapshot();
    throw new Error('Unexpected request');
  }} as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});
  t.after(async () => {session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  const original=w.snapshot().boards[0];
  // Property order may change when the board is serialized and read back.
  const first={...original,cards:original.cards.map(({cardId,...p}) => ({cardId,...p,x:100}))};
  const second={...first,cards:first.cards.map(p => ({...p,x:200}))};
  const a=session.board(first,'Move cards',original);await saving;
  const b=session.board(second,'Move cards',first);release();await Promise.all([a,b]);
  assert.equal(w.snapshot().boards[0].cards[0].x,200);assert.equal(session.state.error,'');
  assert.equal(session.undoHistory.past.length,2);
  await session.undo();assert.equal(w.snapshot().boards[0].cards[0].x,100);
  await session.undo();assert.equal(w.snapshot().boards[0].cards[0].x,0);
  await session.undo(true);await session.undo(true);assert.equal(w.snapshot().boards[0].cards[0].x,200);
  const before=w.snapshot().boards[0],external={...before,cards:before.cards.map(p => ({...p,y:500}))};
  await w.saveBoard(external,before.revision);await session.refresh();
  await assert.rejects(() => session.board({...before,cards:before.cards.map(p => ({...p,x:300}))},'Move cards',before),/changed|changes/i);
  assert.equal(w.snapshot().boards[0].cards[0].y,500,'a refreshed external edit is not overwritten');
  assert.equal(w.snapshot().boards[0].cards[0].x,200);
});
