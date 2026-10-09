import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {marked} from 'marked';
import {referenceHref,referencePath,referenceMatches} from '../src/document-links';
import {Workspace} from '../src/core/workspace';
import {Session} from '../src/renderer/session';
import type {Bridge,Mutation} from '../src/shared';
import {newNote,readCard} from '../src/core/format';

test('portable mentions and wiki links resolve without interpreting code or escaping the workspace',()=>{
  const href=referenceHref('Boards/A source.md','Slipbox/控制 loop.md');assert.equal(href,'../Slipbox/%E6%8E%A7%E5%88%B6%20loop.md');assert.equal(referencePath('Boards/A source.md',href),'Slipbox/控制 loop.md');
  assert.equal(referencePath('a.md','../../outside.md'),undefined);assert.equal(referencePath('a.md','javascript:alert(1)'),undefined);
  const targets=[{kind:'card' as const,key:'card:1',path:'A/Note.md',name:'Note'},{kind:'card' as const,key:'card:2',path:'B/Note.md',name:'Note'},{kind:'board' as const,key:'board:Research',path:'Research/Research.whiteboard',name:'Research'}];
  assert.equal(referenceMatches('A/source.md','wiki:Note',targets)[0].key,'card:1');assert.equal(referenceMatches('source.md','wiki:Note',targets).length,2);assert.equal(referenceMatches('source.md','Research/Research.whiteboard',targets)[0].kind,'board');
  const links:string[]=[];marked.walkTokens(marked.lexer('[[Note|My note]] and `[[hidden]]`\n\n```\n[[also hidden]]\n```'),token=>{if(token.type==='link')links.push(token.href);});assert.deepEqual(links,['wiki:Note']);
});

test('reference search, Slipbox creation, backlink indexing and link renames stay file based and reversible',async t=>{
  const directory=await fs.mkdtemp(join(tmpdir(),'door-references-')),root=join(directory,'Workspace'),cache=join(directory,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(directory,{recursive:true,force:true});});
  await w.createFolder('','Research');await w.createFolder('','Notes');
  await w.write([{path:'Notes/Motor control.md',content:newNote()+'# Motor control\n\nA source card.',expected:null},{path:'Notes/机器人.md',content:newNote()+'# 機器人視覺\n',expected:null}]);
  const motor=await w.card('Notes/Motor control.md');
  assert.equal(w.queryReferences('moter')[0].key,'card:'+motor.id);assert.equal(w.queryReferences('機器人')[0].path,'Notes/机器人.md');assert.equal(w.queryReferences('researc')[0].kind,'board');assert.equal(w.queryReferences('Research',true).length,0);
  assert.equal(w.queryReferences('moter',true,[motor.path]).length,0);assert.throws(()=>w.queryReferences('x','bad' as never),/Invalid/);
  await w.setPreferences({cardFolder:'Loose cards'});
  const created=await w.createSlipboxCard('A new card'),newFile=created.edits.find(e=>e.before===null&&e.path.endsWith('.md'))!;
  assert.equal(newFile.path,'Loose cards/A new card.md');assert.equal(readCard(newFile.path,newFile.after!).title,'A new card');assert.equal(created.edits.some(e=>e.path.endsWith('.whiteboard')),false);
  await assert.rejects(w.createSlipboxCard('../escape'));assert.equal((await w.createSlipboxCard('A new card')).edits.find(e=>e.before===null&&e.path.endsWith('.md'))?.path,'Loose cards/A new card_1.md');
  await w.write([{path:'source.md',content:newNote()+'# Source\n\n[Motor](Notes/Motor%20control.md) and [[Motor control|Motor alias]].\n\n[Board](Research/Research.whiteboard)\n\n`[[Motor control]]`',expected:null}]);
  assert.deepEqual(w.query('backlinks:'+motor.id),[{path:'source.md'}]);
  let renamed!:Mutation;
  const session=new Session({request:async request=>{if(request.kind==='renameCard'){renamed=await w.renameCard(request.path,request.stem,request.expected);return renamed;}if(request.kind==='card')return w.card(request.path);throw new Error(request.kind);}} as Bridge),source=await w.card('source.md');
  session.update({snapshot:w.snapshot(),draft:{card:source,body:source.body,dirty:false}});await session.renameCard(motor.id,'Drive');assert.match(session.state.draft!.body,/Notes\/Drive.md/);session.dispose();
  let body=(await w.card('source.md')).body;assert.match(body,/\[Motor\]\(Notes\/Drive.md\)/);assert.match(body,/\[\[Notes\/Drive\|Motor alias\]\]/);assert.match(body,/`\[\[Motor control\]\]`/);assert.deepEqual(w.query('backlinks:'+motor.id),[{path:'source.md'}]);
  await w.write(renamed.edits.map(e=>({path:e.path,content:e.before,expected:e.after===null?null:readRevision(e.after)})));assert.match((await w.card('source.md')).body,/Motor%20control/);
  const placementBoard=w.snapshot().boards.find(b=>b.folder==='Research')!,placed=await w.createSlipboxCard('Reference and creation',{folder:'Research',expected:placementBoard.revision,x:240,y:180}),placedCard=placed.snapshot.cards.find(c=>c.title==='Reference and creation')!;
  assert.equal(placedCard.path,'Loose cards/Reference and creation.md');assert.equal(placed.edits.some(e=>e.path===placementBoard.path),true);assert.deepEqual(placed.snapshot.boards.find(b=>b.path===placementBoard.path)!.cards.map(p=>[p.cardId,p.x,p.y]),[[placedCard.id,240,180]]);
  await w.write(placed.edits.map(e=>({path:e.path,content:e.before,expected:e.after===null?null:readRevision(e.after)})));assert.equal(w.snapshot().cards.some(c=>c.id===placedCard.id),false);assert.deepEqual(w.snapshot().boards.find(b=>b.path===placementBoard.path)!.cards,[]);
  await assert.rejects(w.createSlipboxCard('Stale',{folder:'Research',expected:'old',x:0,y:0}));
  const board=w.snapshot().boards.find(b=>b.folder==='Research')!;await w.renameBoard('Research','Study',board.revision);body=(await w.card('source.md')).body;assert.match(body,/Study\/Study.whiteboard/);
  w.close();w=await Workspace.open(root,cache);assert.deepEqual(w.query('backlinks:'+motor.id),[{path:'source.md'}]);assert.equal(w.queryReferences('Study')[0].kind,'board');
});
import {revision as readRevision} from '../src/core/format';
