import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {writeBoard} from '../src/core/format';
import {Session} from '../src/renderer/session';
import type {Bridge} from '../src/shared';

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
  const dir=await fs.mkdtemp(join(tmpdir(),'door-selection-drop-')),root=join(dir,'Notes'),cache=join(dir,'cache');await fs.mkdir(root);
  const w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const folder of ['From','To','Owner','Other'])await w.createFolder('',folder);
  await w.create('From','A',130,-80);await w.create('From','Stay',1000,0);await w.create('Owner','Reference',0,0);await w.createFolder('From','Child',{x:0,y:800});await w.createFolder('From/Child','Nested');await w.create('From/Child','Inside',20,30);
  const ref=await w.card('Owner/Reference.md'),board=(folder:string)=>w.snapshot().boards.find(b=>b.folder===folder)!;
  await w.placeCard(ref.id,ref.revision,'From',board('From').revision,560,20,'reference');await w.placeCard(ref.id,ref.revision,'Other',board('Other').revision,20,20,'reference');
  let a=await w.card('From/A.md');await w.saveCard(a.path,'# A\n\n[Stay](Stay.md) [Inside](Child/Inside.md) ![Image](photo.png)\n',a.revision);a=await w.card(a.path);
  await fs.writeFile(join(root,'From/photo.png'),new Uint8Array([7,8]));await fs.writeFile(join(root,'From/Child/photo.png'),new Uint8Array([1,2,3]));
  await w.create('','Links',0,0,false);const links=await w.card('Links.md');await w.saveCard(links.path,'# Links\n\n[A](From/A.md) [Inside](From/Child/Inside.md)\n',links.revision);
  const layout=structuredClone(board('From')),first=layout.cards.find(p=>p.cardId===a.id)!,reference=layout.cards.find(p=>p.cardId===ref.id)!,child=layout.cards.find(p=>p.folder)!,stay=layout.cards.find(p=>p.cardId!==a.id&&p.cardId!==ref.id&&!p.folder)!;
  Object.assign(first,{width:420,height:321,autoHeight:false,collapsed:true,fillColor:'#654321',strokeWidth:4,strokeStyle:'dashed'});
  Object.assign(reference,{width:520,height:200,autoHeight:false});
  layout.edges=[{id:'connection',from:first.id,to:reference.id,fromSide:'bottom',toSide:'top',label:'Related',labelSize:18,strokeColor:'#123456',strokeWidth:3,strokeStyle:'dashed',toArrowhead:'triangle'}, {id:'board-connection',from:reference.id,to:child.id}, {id:'boundary',from:first.id,to:stay.id}];await w.saveBoard(layout,layout.revision);
  return {w,root,cache,dir,board,ids:[first.id,reference.id,child.id],a,ref};
}

test('a selection keeps relative geometry, styles, board trees, references and internal edges through one undo/redo',async t=>{
  const {w,root,board,ids,a,ref}=await fixture(t),before=structuredClone(w.snapshot()),source=structuredClone(board('From')),destination=structuredClone(board('To'));
  const owner=await w.read(ref.path),other=await w.read(board('Other').path),links=await w.read('Links.md');
  const session=new Session({request:async r=>{switch(r.kind){case 'moveSelection':return w.moveSelection(r.source,r.expected,r.ids,r.destination,r.destinationExpected,r.x,r.y);case 'transfer':return w.transfer(r.operation);case 'card':return w.card(r.path);default:throw new Error(r.kind);}}} as Bridge);t.after(async()=>session.dispose());session.update({snapshot:before});
  await session.moveSelection('From',ids,'To',500,600,source);assert.equal(session.undoHistory.past.length,1);
  const next=board('To');assert.equal(board('From').cards.length,source.cards.length-3);assert.equal(board('From').edges.length,0);
  for(const original of source.cards.filter(p=>ids.includes(p.id))){const moved=next.cards.find(p=>p.id===original.id)!;assert.deepEqual(moved,{...original,x:original.x+500,y:original.y+680,...(original.folder?{folder:'To/Child'}:{})});}
  assert.deepEqual(next.edges,source.edges.filter(e=>e.id!=='boundary'));assert.deepEqual(destination.cards,[]);
  assert.equal(w.snapshot().cards.find(c=>c.id===a.id)!.path,'To/A.md');assert.equal(await w.read(ref.path),owner);assert.equal(await w.read(board('Other').path),other);
  assert.equal((await w.card('To/Child/Inside.md')).id,before.cards.find(c=>c.path==='From/Child/Inside.md')!.id);assert.ok(w.snapshot().boards.some(b=>b.folder==='To/Child/Nested'));assert.deepEqual(await fs.readFile(join(root,'To/Child/photo.png')),Buffer.from([1,2,3]));
  assert.match((await w.card('To/A.md')).body,/\.\.\/From\/Stay.md/);assert.match((await w.card('To/A.md')).body,/Child\/Inside.md/);assert.match((await w.card('To/A.md')).body,/\.\.\/From\/photo.png/);assert.match((await w.card('Links.md')).body,/To\/A.md/);
  await session.undo();assert.deepEqual(board('From').cards,source.cards);assert.deepEqual(board('From').edges,source.edges);assert.deepEqual(board('To').cards,destination.cards);assert.equal(await w.read('Links.md'),links);assert.ok(w.snapshot().cards.some(c=>c.path==='From/A.md'));
  await session.undo(true);assert.deepEqual(board('To').cards,next.cards);assert.deepEqual(board('To').edges,next.edges);assert.ok(w.snapshot().cards.some(c=>c.path==='To/A.md'));
});

test('invalid, cyclic, conflicting and stale selection drops write nothing',async t=>{
  const {w,root,board,ids}=await fixture(t),source=board('From'),target=board('To'),before=await w.read(source.path);
  for(const [selection,folder,x] of [[ids,'From/Child',1], [ids,'',1], [['missing'],'To',1], [[ids[0],ids[0]],'To',1], [ids,'To',NaN]] as [string[],string,number][]){await assert.rejects(()=>w.moveSelection('From',source.revision,selection,folder,board(folder).revision,x,1));assert.equal(await w.read(source.path),before);}
  await assert.rejects(()=>w.moveSelection('From','stale',ids,'To',target.revision,0,0));
  await fs.mkdir(join(root,'To/Child'));await assert.rejects(()=>w.moveSelection('From',source.revision,ids,'To',target.revision,0,0),/exists|same name|conflict/i);assert.equal(await w.read(source.path),before);assert.ok(await fs.stat(join(root,'From/A.md')));
});

test('a failure during the second physical move rolls the whole selection back',async t=>{
  const {w,root,cache,board,ids}=await fixture(t),source=structuredClone(board('From')),target=structuredClone(board('To')),links=await w.read('Links.md'),rename=fs.rename;
  t.mock.method(fs,'rename',async(from:Parameters<typeof fs.rename>[0],to:Parameters<typeof fs.rename>[1])=>{if(String(from).endsWith('/From/Child'))throw new Error('Simulated move failure');return rename(from,to);});
  await assert.rejects(()=>w.moveSelection('From',source.revision,ids,'To',target.revision,1,2),/Simulated/);t.mock.restoreAll();
  assert.equal(await w.read(source.path),writeBoard(source));assert.equal(await w.read(target.path),writeBoard(target));assert.equal(await w.read('Links.md'),links);assert.ok(await fs.stat(join(root,'From/A.md')));assert.ok(await fs.stat(join(root,'From/Child/photo.png')));await assert.rejects(()=>fs.stat(join(root,'To/A.md')));await assert.rejects(()=>fs.stat(join(cache,'board-transfer.json')));w.assertReady();
});

test('an interrupted transfer is recovered on reopening without dropping files or edges',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'door-transfer-recovery-')),root=join(dir,'Notes'),cache=join(dir,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const name of ['From','To'])await w.createFolder('',name);for(const name of ['A','B'])await w.create('From',name,10,20);
  const board=(folder:string)=>w.snapshot().boards.find(b=>b.folder===folder)!,source=structuredClone(board('From')),target=structuredClone(board('To')),rename=fs.rename;
  t.mock.method(fs,'rename',async(from:Parameters<typeof fs.rename>[0],to:Parameters<typeof fs.rename>[1])=>{if(String(from).endsWith('/From/B.md')||String(from).endsWith('/To/A.md'))throw new Error('Interrupted disk');return rename(from,to);});
  await assert.rejects(()=>w.moveSelection('From',source.revision,source.cards.map(p=>p.id),'To',target.revision,1,2),/Interrupted/);assert.throws(()=>w.assertReady());assert.ok(await fs.stat(join(cache,'board-transfer.json')));w.close();t.mock.restoreAll();w=await Workspace.open(root,cache);
  assert.deepEqual(board('From').cards,source.cards);assert.deepEqual(board('To').cards,target.cards);assert.ok(await fs.stat(join(root,'From/A.md')));assert.ok(await fs.stat(join(root,'From/B.md')));assert.equal(w.snapshot().issues.length,0);await assert.rejects(()=>fs.stat(join(cache,'board-transfer.json')));
});

test('transfer undo rejects changed files and leaves the moved group intact',async t=>{
  const {w,root,board,ids}=await fixture(t),source=board('From'),target=board('To'),result=await w.moveSelection('From',source.revision,ids,'To',target.revision,1,2);
  await fs.appendFile(join(root,'To/A.md'),'\nExternal edit.');await assert.rejects(()=>w.transfer(result.inverse),/change|edited/i);assert.ok(await fs.stat(join(root,'To/A.md')));assert.ok(await fs.stat(join(root,'To/Child')));assert.equal(board('To').edges.length,2);
});

test('destination ID collisions remap only incoming endpoints, and filename collisions never overwrite cards',async t=>{
  const {w,board,ids,a}=await fixture(t);await w.create('To','A',900,900);
  const destination=structuredClone(board('To')),existing=destination.cards[0];existing.id=ids[0];destination.edges=[{id:'connection',from:existing.id,to:existing.id,label:'Existing'}];await w.saveBoard(destination,destination.revision);
  const source=board('From'),target=board('To'),result=await w.moveSelection('From',source.revision,ids,'To',target.revision,20,30),after=board('To'),incoming=after.cards.find(p=>p.cardId===a.id)!;
  assert.notEqual(incoming.id,ids[0]);assert.equal(w.snapshot().cards.find(c=>c.id===a.id)!.path,'To/A 2.md');assert.equal(after.cards.find(p=>p.id===existing.id)!.cardId,existing.cardId);assert.deepEqual(after.edges.find(e=>e.id==='connection'),destination.edges[0]);assert.ok(after.edges.some(e=>e.label==='Related'&&e.id!=='connection'&&e.from===incoming.id));
  await w.transfer(result.inverse);assert.deepEqual(board('To').cards,target.cards);assert.deepEqual(board('To').edges,target.edges);assert.deepEqual(board('From').edges,source.edges);
});

test('a pending geometry save can finish before the group drop without causing a false external-edit conflict',async t=>{
  const {w,board,ids}=await fixture(t),base=structuredClone(board('From')),next=structuredClone(base);next.cards[0].x+=30;
  let start!:()=>void,release!:()=>void;const started=new Promise<void>(r=>start=r),gate=new Promise<void>(r=>release=r);
  const session=new Session({request:async r=>{switch(r.kind){case 'saveBoard':start();await gate;return w.saveBoard(r.board,r.expected);case 'moveSelection':return w.moveSelection(r.source,r.expected,r.ids,r.destination,r.destinationExpected,r.x,r.y);default:throw new Error(r.kind);}}} as Bridge);t.after(async()=>session.dispose());session.update({snapshot:w.snapshot()});
  const save=session.board(next,'Move',base);await started;const drop=session.moveSelection('From',ids,'To',0,0,next);release();await save;await drop;assert.equal(board('To').cards.length,3);assert.equal(board('To').edges.length,2);assert.equal(session.undoHistory.past.length,2);
});
