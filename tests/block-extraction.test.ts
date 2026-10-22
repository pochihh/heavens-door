import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {Session} from '../src/renderer/session';
import {boardDropPosition} from '../src/board-drop';
import type {Bridge,ExtractedBlocks} from '../src/shared';
async function setup(t:{after:(fn:()=>Promise<void>)=>void}){
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-blocks-')),root=join(dir,'notes');await fs.mkdir(root);const workspace=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{workspace.close();await fs.rm(dir,{recursive:true,force:true});});for(const name of ['From','To'])await workspace.createFolder('',name);await workspace.create('From','Original',0,0);const card=await workspace.card('From/Original.md');await workspace.saveCard(card.path,'# Original\n\nBefore\n\n## Selected\n\n![Figure](image.png)\n\nAfter\n',card.revision);return workspace;
}
test('moving blocks creates one linked card, rebases assets and undoes or redoes all three files together',async t=>{
 const w=await setup(t),source=await w.card('From/Original.md'),before=structuredClone(w.snapshot()),value:ExtractedBlocks={id:'created-blocks',title:'Selected',before:source.body,content:'## Selected\n\n![Figure](image.png)',body:'# Original\n\nBefore\n\n[Selected](card:created-blocks)\n\nAfter\n'};
 const session=new Session({request:async request=>{switch(request.kind){case 'card':return w.card(request.path);case 'extractCardBlocks':return w.extractCardBlocks(request.path,request.expected,request.value,request.folder,request.boardExpected,request.x,request.y);case 'write':return w.write(request.changes);default:throw Error(request.kind);}}} as Bridge);t.after(async()=>session.dispose());session.update({snapshot:before,draft:{card:source,body:source.body,dirty:false}});
 await session.extractCardBlocks(source.path,value,'To',900,400);const created=await w.card('To/Selected.md'),updated=await w.card(source.path);
 assert.equal(created.id,value.id);assert.match(created.body,/!\[Figure\]\(\.\.\/From\/image.png\)/);assert.match(updated.body,/\[Selected\]\(\.\.\/To\/Selected.md\)/);assert.match(updated.body,/Before[\s\S]*After/);assert.equal((updated.body.match(/Selected/g)??[]).length,2);assert.doesNotMatch(updated.body,/!\[Figure\]/);assert.equal(session.state.draft!.body,updated.body);
 const placement=w.snapshot().boards.find(b=>b.folder==='To')!.cards.find(p=>p.cardId===created.id)!;assert.deepEqual([placement.x,placement.y],[900,400]);assert.equal(session.undoHistory.past.length,1);
 await session.undo();assert.equal((await w.card(source.path)).body,source.body);assert.equal(w.snapshot().cards.some(c=>c.id===created.id),false);assert.deepEqual(w.snapshot().boards.find(b=>b.folder==='To')!.cards,before.boards.find(b=>b.folder==='To')!.cards);
 await session.undo(true);assert.equal((await w.card('To/Selected.md')).id,created.id);assert.equal((await w.card(source.path)).body,updated.body);
});
test('invalid or stale block extraction leaves the source and destination untouched',async t=>{
 const w=await setup(t),source=await w.card('From/Original.md'),board=w.snapshot().boards.find(b=>b.folder==='To')!,value={id:'created-blocks',title:'Selected',before:source.body,content:'Chosen',body:'[Selected](card:created-blocks)'};
 for(const bad of [{...value,before:'stale'},{...value,body:'No reference'},{...value,content:''},{...value,id:source.id}])await assert.rejects(()=>w.extractCardBlocks(source.path,source.revision,bad,'To',board.revision,0,0));
 await assert.rejects(()=>w.extractCardBlocks(source.path,'stale',value,'To',board.revision,0,0));await assert.rejects(()=>w.extractCardBlocks(source.path,source.revision,value,'To','stale',0,0));assert.equal((await w.card(source.path)).body,source.body);assert.equal(w.snapshot().boards.find(b=>b.folder==='To')!.cards.length,0);
});
test('unpositioned board moves use a free column beside expanded PDFs and survive reopening and undo',async t=>{
 const w=await setup(t),pdf=await w.importReading({name:'Large PDF',type:'pdf',data:new Uint8Array(Buffer.from('%PDF-1.4\nfixture')),folder:'To'}),snapshot=w.snapshot(),board=structuredClone(snapshot.boards.find(b=>b.folder==='To')!),paper=board.cards.find(p=>p.cardId===snapshot.cards.find(c=>c.path===pdf.path)!.id)!;
 paper.id=snapshot.boards.find(b=>!b.folder)!.cards.find(p=>p.folder==='From')!.id;paper.collapsed=false;paper.x=100;paper.y=0;paper.width=440;paper.height=280;paper.pdf={expanded:true};await w.saveBoard(board,board.revision);
 const move=await w.fileOperation({action:'move',path:'From',destination:'To/From'}),after=w.snapshot().boards.find(b=>b.folder==='To')!,tile=after.cards.find(p=>p.folder==='To/From')!;
 assert.ok(tile);assert.notEqual(tile.id,paper.id);assert.ok(tile.x>=paper.x+paper.width+480);assert.deepEqual(boardDropPosition(board,snapshot.cards),{x:tile.x,y:tile.y});assert.ok(w.snapshot().boards.some(b=>b.folder==='To/From'));await w.scan();assert.deepEqual(w.snapshot().boards.find(b=>b.folder==='To')!.cards.find(p=>p.folder==='To/From'),tile);
 await w.fileOperation(move.inverse);assert.ok(w.snapshot().boards.find(b=>!b.folder)!.cards.some(p=>p.folder==='From'));assert.equal(w.snapshot().boards.find(b=>b.folder==='To')!.cards.some(p=>p.folder==='To/From'),false);
});

test('typing while extraction is pending stays recoverable instead of being overwritten or saved over the new link',async t=>{
 const w=await setup(t),source=await w.card('From/Original.md'),value={id:'pending-blocks',title:'Selected',before:source.body,content:'Selected text',body:'# Original\n\n[Selected](card:pending-blocks)'};
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<void>(resolve=>started=resolve);
 const session=new Session({request:async request=>{switch(request.kind){case 'extractCardBlocks':started();await gate;return w.extractCardBlocks(request.path,request.expected,request.value,request.folder,request.boardExpected,request.x,request.y);case 'card':return w.card(request.path);case 'saveCard':return w.saveCard(request.path,request.body,request.expected);default:throw Error(request.kind);}}} as Bridge);t.after(async()=>session.dispose());session.update({snapshot:w.snapshot(),draft:{card:source,body:source.body,dirty:false}});
 const pending=session.extractCardBlocks(source.path,value,'To',10,20);await ready;session.edit(source.body+'\nTyped during the drop.');release();await assert.rejects(pending,/conflict|chang|another/i);
 assert.match(session.state.draft!.body,/Typed during the drop/);assert.equal(session.state.draft!.dirty,true);assert.equal(session.state.draft!.card.revision,source.revision);assert.match((await w.card(source.path)).body,/\[Selected\]\(\.\.\/To\/Selected.md\)/);assert.ok(w.snapshot().cards.some(c=>c.id==='pending-blocks'));
 await assert.rejects(()=>session.flush(),/conflict|chang|another/i);assert.match(session.state.draft!.body,/Typed during the drop/);
});
