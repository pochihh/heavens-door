import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../src/core/workspace';
import { Session } from '../src/renderer/session';
import {defaultDocks} from '../src/layout';
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
  const bridge={appSettings:async()=>({hardwareAcceleration:true,restartRequired:false}),setHardwareAcceleration:async enabled=>({hardwareAcceleration:enabled,restartRequired:!enabled}),onAppSettingsChange:()=>()=>undefined,graphicsDiagnostics:async()=>({hardwareAcceleration:true,features:{},electron:'test',chromium:'test'}),unregisterWorkspace:async()=>[],listWorkspaces:async()=>[],openWorkspace:async()=>w.snapshot(),revealFile:async()=>undefined,newWindow:async()=>undefined,platform:'darwin',chooseWorkspace:async () => w.snapshot(),demo:async () => w.snapshot(),onChange:() => () => undefined,reload:() => undefined,assetUrl:path => path,currentWorkspace:async () => w.snapshot(),onClosing:callback => {handler=callback;return () => undefined;},finishClosing:action => completed.push(action),cancelClosing:action => cancelled.push(action),request:async request => {
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
  const w=await Workspace.open(root,join(folder,'cache'));await w.createFolder('','Ideas');await w.create('Ideas','a',0,0);
  const boardNow=()=>w.snapshot().boards.find(b=>b.folder==='Ideas')!;
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
  const original=boardNow();
  // Property order may change when the board is serialized and read back.
  const first={...original,cards:original.cards.map(({cardId,...p}) => ({cardId,...p,x:100}))};
  const second={...first,cards:first.cards.map(p => ({...p,x:200}))};
  const a=session.board(first,'Move cards',original);await saving;
  const b=session.board(second,'Move cards',first);release();await Promise.all([a,b]);
  assert.equal(boardNow().cards[0].x,200);assert.equal(session.state.error,'');
  assert.equal(session.undoHistory.past.length,2);
  await session.undo();assert.equal(boardNow().cards[0].x,100);
  await session.undo();assert.equal(boardNow().cards[0].x,0);
  await session.undo(true);await session.undo(true);assert.equal(boardNow().cards[0].x,200);
  const auto=boardNow(),fixed={...auto,cards:auto.cards.map(p=>({...p,autoHeight:false}))};
  await session.board(fixed,'Use fixed card height',auto);
  assert.equal(boardNow().cards[0].autoHeight,false);
  await assert.rejects(()=>session.board({...auto,cards:auto.cards.map(p=>({...p,x:300}))},'Stale move',auto),/changed/);
  assert.equal(boardNow().cards[0].autoHeight,false,'a stale gesture cannot overwrite a newer height mode');
  await session.undo();assert.equal(boardNow().cards[0].autoHeight,undefined);
  const before=boardNow(),external={...before,cards:before.cards.map(p => ({...p,y:500}))};
  await w.saveBoard(external,before.revision);await session.refresh();
  await assert.rejects(() => session.board({...before,cards:before.cards.map(p => ({...p,x:300}))},'Move cards',before),/changed|changes/i);
  assert.equal(boardNow().cards[0].y,500,'a refreshed external edit is not overwritten');
  assert.equal(boardNow().cards[0].x,200);
});

test('registered workspace switching saves first and keeps the old workspace when opening fails',async t=>{
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-workspace-switch-')),root=join(folder,'Notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));await w.create('','a',0,0);
  let fail=true;
  const bridge={request:async (request:Parameters<Bridge['request']>[0])=>{
    if(request.kind==='card')return w.card(request.path);
    if(request.kind==='saveCard')return w.saveCard(request.path,request.body,request.expected);
    throw new Error('Unexpected request');
  },openWorkspace:async()=>{
    assert.equal((await w.card('a.md')).body,'Save before changing workspace');
    if(fail)throw new Error('Workspace unavailable');
    return {...w.snapshot(),root:'/second',cards:[]};
  }} as unknown as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});
  t.after(async()=>{session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  await session.select('a.md');session.edit('Save before changing workspace');
  await assert.rejects(()=>session.open(false,'/second'),/unavailable/);
  assert.equal(session.state.snapshot?.root,w.root);assert.equal(session.state.draft?.body,'Save before changing workspace');
  assert.equal(session.state.status,'Needs attention');assert.equal(session.undoHistory.past.length,1);
  fail=false;await session.open(false,'/second');
  assert.equal(session.state.snapshot?.root,'/second');assert.equal(session.state.draft,null);assert.equal(session.undoHistory.past.length,0);
});


test('pending workspace layout saves before closing or switching and survives a failed write',async t=>{
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-layout-save-')),root=join(folder,'Notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));
  let fail=true,closing:(action:'reload'|'close')=>void=()=>undefined;
  const completed:string[]=[],cancelled:string[]=[];
  const bridge={request:async(request:Parameters<Bridge['request']>[0])=>{
    if(request.kind==='preferences'){
      if(fail){fail=false;session.schedulePreferences({navigation:{files:{scroll:42}}},w.root);throw new Error('Disk unavailable');}
      return w.setPreferences(request.patch);
    }
    throw new Error('Unexpected request');
  },onClosing:(callback:typeof closing)=>{closing=callback;return()=>undefined;},finishClosing:(action:string)=>completed.push(action),cancelClosing:(action:string)=>cancelled.push(action),openWorkspace:async()=>{
    const saved=w.snapshot().preferences!;assert.equal(saved.docks?.left.collapsed,true);assert.deepEqual(saved.navigation?.files,{expanded:['','assets'],scroll:42});
    return {...w.snapshot(),root:'/second'};
  }} as unknown as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});session.connectWindow();
  t.after(async()=>{session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  const docks=defaultDocks();docks.left.collapsed=true;
  session.schedulePreferences({docks,navigation:{files:{expanded:['','assets']}}},w.root);
  closing('reload');await session.run(async()=>undefined);assert.deepEqual(cancelled,['reload']);assert.ok(session.hasPendingPreferences('docks'));
  closing('reload');await session.run(async()=>undefined);assert.deepEqual(completed,['reload']);assert.equal(session.hasPendingPreferences('docks'),false);
  await session.open(false,'/second');session.schedulePreferences({docks:defaultDocks()},w.root);assert.equal(session.hasPendingPreferences('docks'),false,'late callbacks from the previous workspace cannot change the new workspace');
});

test('renaming flushes drafts, retains edits arriving during rename and follows the card through undo',async t=>{
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-rename-')),root=join(folder,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));await w.createFolder('','Ideas');await w.create('Ideas','original',0,0);
  const original=await w.card('Ideas/original.md');
  let release:()=>void=()=>undefined,started:()=>void=()=>undefined;
  const gate=new Promise<void>(resolve=>{release=resolve;}),renaming=new Promise<void>(resolve=>{started=resolve;});
  const bridge={request:async r=>{
    if(r.kind==='card')return w.card(r.path);
    if(r.kind==='saveCard')return w.saveCard(r.path,r.body,r.expected);
    if(r.kind==='renameCard'){started();await gate;return w.renameCard(r.path,r.stem,r.expected);}
    if(r.kind==='renameBoard')return w.renameBoard(r.folder,r.name,r.expected);
    if(r.kind==='write')return w.write(r.changes);
    if(r.kind==='snapshot')return w.snapshot();
    throw new Error('Unexpected request '+r.kind);
  }} as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});
  t.after(async()=>{session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  await session.select(original.path);session.edit('# Unsaved title');
  const pending=session.renameCard(original.id,'renamed');await renaming;
  session.edit('# Unsaved title\n\nTyped during rename');release();await pending;
  assert.equal(session.state.draft?.card.path,'Ideas/renamed.md');assert.equal(session.state.draft?.dirty,true);
  await session.run(()=>session.flush());assert.match((await w.card('Ideas/renamed.md')).body,/Typed during rename/);
  await assert.rejects(()=>w.read(original.path),/ENOENT/);
  await session.undo();await session.undo();
  assert.equal(session.state.draft?.card.path,original.path);assert.equal(session.state.draft?.card.id,original.id);
  assert.equal((await w.card(original.path)).body,'# Unsaved title');
  await session.undo(true);assert.equal(session.state.draft?.card.path,'Ideas/renamed.md');
  const {documentInfo}=await import('../src/renderer/documents');
  assert.equal(documentInfo('card:'+original.id,session.state.snapshot!).title,'renamed.md','ID-based tabs and starred entries resolve the new filename');
  await session.renameBoard('Ideas','Thoughts');assert.equal(session.state.draft?.card.path,'Thoughts/renamed.md');
  await session.undo();assert.equal(session.state.draft?.card.path,'Ideas/renamed.md');
  await session.undo(true);assert.equal(session.state.draft?.card.path,'Thoughts/renamed.md');
});

test('card deletion confirms content, preserves trash and references, and restores the entire selection with undo',async t=>{
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-delete-')),root=join(folder,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache'));
  await w.createFolder('','Ideas');await w.createFolder('','Other');
  await w.create('Ideas','empty',0,0);await w.create('Ideas','written',500,0);
  const empty=await w.card('Ideas/empty.md'),written=await w.card('Ideas/written.md');
  await w.saveCard(empty.path,'# \n\n',empty.revision);
  let board=w.snapshot().boards.find(b=>b.folder==='Ideas')!;
  board=(await w.saveBoard({...board,edges:[{id:'e',from:board.cards[0].id,to:board.cards[1].id}]},board.revision)).snapshot.boards.find(b=>b.folder==='Ideas')!;
  const other=w.snapshot().boards.find(b=>b.folder==='Other')!;
  await w.saveBoard({...other,cards:[{...board.cards[0],id:'reference'}]},other.revision);
  const otherRaw=await w.read(other.path);
  const mother=w.snapshot().boards.find(b=>!b.folder)!;
  assert.deepEqual((await w.prepareDeletion(mother.path,mother.cards.map(p=>p.id),[],mother.revision)).changes,[],'card deletion never deletes whiteboard folders');
  const bridge={request:async r=>{
    if(r.kind==='card')return w.card(r.path);
    if(r.kind==='saveCard')return w.saveCard(r.path,r.body,r.expected);
    if(r.kind==='prepareDeletion')return w.prepareDeletion(r.path,r.placements,r.edges,r.expected);
    if(r.kind==='write')return w.write(r.changes);
    if(r.kind==='snapshot')return w.snapshot();
    throw new Error('Unexpected request '+r.kind);
  }} as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});
  t.after(async()=>{session.dispose();w.close();await fs.rm(folder,{recursive:true,force:true});});
  const current=()=>session.state.snapshot!.boards.find(b=>b.path===board.path)!;
  const emptyBytes=await w.read(empty.path),boardBytes=await w.read(board.path);
  assert.equal(await session.deleteSelection(current(),[board.cards[0].id],[],()=>assert.fail('blank heading needs no confirmation')),true);
  await assert.rejects(w.read(empty.path),/ENOENT/);
  const trash=session.undoHistory.past.at(-1)!.edits.find(e=>e.path.startsWith('.heavens-door/trash/'))!.path;
  assert.equal(await fs.readFile(join(root,trash),'utf8'),emptyBytes);
  assert.equal(current().cards.length,1);assert.equal(current().edges.length,0);
  assert.equal(await w.read(other.path),otherRaw,'other boards retain missing references');
  await w.scan();assert.equal(w.snapshot().cards.length,1,'trash is excluded from indexing after restart/rescan');
  await session.undo();assert.equal(await w.read(empty.path),emptyBytes);assert.equal(await w.read(board.path),boardBytes);
  await assert.rejects(fs.readFile(join(root,trash)),/ENOENT/);
  await session.undo(true);await session.undo();
  await session.select(written.path);session.edit('# My title\n\nUnsaved content');
  let confirmations=0;
  const cancel=(names:string[])=>{confirmations++;assert.deepEqual(names,[empty.path,written.path]);return false;};
  assert.equal(await session.deleteSelection(current(),current().cards.map(p=>p.id),['e'],cancel),false);
  assert.equal(confirmations,1);assert.equal(current().cards.length,2);assert.equal(current().edges.length,1);
  assert.match((await w.card(written.path)).body,/Unsaved content/,'draft flushes before confirmation');
  const before=await w.read(written.path),step=session.undoHistory.past.length;
  assert.equal(await session.deleteSelection(current(),current().cards.map(p=>p.id),['e'],()=>true),true);
  assert.equal(current().cards.length,0);assert.equal(session.undoHistory.past.length,step+1);
  await session.undo();assert.equal(await w.read(written.path),before);assert.equal(current().cards.length,2);assert.equal(current().edges.length,1);
  const stale=await w.prepareDeletion(current().path,[current().cards[1].id],[],current().revision);
  const card=await w.card(written.path);await w.saveCard(card.path,'# External update',card.revision);
  await assert.rejects(w.write(stale.changes),/External changes/);
  assert.equal((await w.card(written.path)).body,'# External update');
  assert.equal(await w.read(board.path),boardBytes,'failed deletion does not partially remove placements');
  for(const body of ['# Title','![image](asset.png)','[Link](https://example.com)','---\nstatus: todo\n---\n']){
    const raw=body.startsWith('---')?body:'---\ncard-id: content\n---\n'+body;
    const now=await w.card(written.path);await w.write([{path:written.path,content:raw,expected:now.revision}]);
    const b=w.snapshot().boards.find(b=>b.path===board.path)!,p=b.cards.find(p=>p.cardId===(w.snapshot().cards.find(c=>c.path===written.path)!.id))!;
    assert.deepEqual((await w.prepareDeletion(b.path,[p.id],[],b.revision)).nonEmpty,[written.path]);
  }
});
