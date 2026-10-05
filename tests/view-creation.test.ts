import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {UndoHistory} from '../src/renderer/history';
import {newViewBlock,writeViewBlock,viewBlockRanges,parseViewBlock,viewCreationChoices} from '../src/view-block';
import {Session} from '../src/renderer/session';
import type {Bridge} from '../src/shared';
import {moveCardLinks} from '../src/card-links';

test('view creation applies defaults, exact context and folder choice; layout writes stay file based and undoable',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'door-create-view-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const name of ['project','task']){await w.createTag(name);const tag=w.snapshot().tags!.find(t=>t.tag===name)!;await w.saveTag(tag.path,tag.revision,[{key:'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:[],done:['Done']},default:'Todo'},{key:'Priority',type:'number',default:1},{key:'Date',type:'date',optional:true},{key:'Optional',type:'text',optional:true,default:'Skip'}],[]);}
  await w.createFolder('','Notes');await w.create('','Query',0,0,false);
  const block=newViewBlock('project');block.views=[{id:'board',name:'Board',type:'kanban',groupBy:'project/Status'}];
  let source='';const store=async()=>{source=writeViewBlock('',block);const card=await w.card('Query.md');await w.saveCard(card.path,'# Query\n\n```view-block\n'+source+'```\n',card.revision);};
  const owner=async()=>({path:'Query.md',expected:(await w.card('Query.md')).revision,block:0,source});
  await store();let mutation=await w.createViewCard(await owner(),'board',0,'Done');
  const created=mutation.edits.find(e=>e.path.endsWith('.md'))!.path;assert.equal(created,'Slipbox/untitled.md');const props=w.cardProperties(created).properties;
  assert.deepEqual(props.tags,['project']);assert.equal(props['project/Status'],'Done');assert.equal(props['project/Priority'],1);assert.equal(props['project/Optional'],undefined);assert.equal(props['project/Date'],undefined);assert.ok(!w.snapshot().boards.some(b=>b.folder==='Slipbox'));
  const undo=new UndoHistory();undo.record('Create',mutation.edits);await undo.travel(false,c=>w.write(c));assert.ok(!w.snapshot().cards.some(c=>c.path===created));await undo.travel(true,c=>w.write(c));assert.equal(w.cardProperties(created).properties['project/Status'],'Done');
  await w.createViewCard(await owner(),'board',0,'');assert.equal(w.cardProperties('Slipbox/untitled_1.md').properties['project/Status'],null,'No value explicitly overrides the default');
  block.query.where={all:[{field:'tags',op:'contains',value:'project'},{field:'file.folder',op:'under',value:'Notes'},{field:'project/Priority',op:'eq',value:4}]};await store();mutation=await w.createViewCard(await owner(),'board',0,'Todo');const inBoard=mutation.edits.find(e=>e.path.endsWith('.md'))!.path;assert.equal(inBoard,'Notes/untitled.md');assert.equal(w.cardProperties(inBoard).properties['project/Priority'],4);assert.ok(w.snapshot().boards.find(b=>b.folder==='Notes')!.cards.some(p=>'cardId'in p&&p.cardId===w.snapshot().cards.find(c=>c.path===inBoard)!.id));
  block.query.where={any:[{field:'tags',op:'contains',value:'project'},{field:'tags',op:'contains',value:'task'}]};assert.equal(viewCreationChoices(block,block.views[0]).length,2);await store();mutation=await w.createViewCard(await owner(),'board',1);const choicePath=mutation.edits.find(e=>e.path.endsWith('.md'))!.path;assert.deepEqual(w.cardProperties(choicePath).properties.tags,['task']);
  const range={start:'2026-10-02',end:'2026-10-05'};block.query.where={field:'tags',op:'contains',value:'project'};block.views=[{id:'time',name:'Timeline',type:'timeline',dateBy:'project/Date',scale:'week'}];await store();mutation=await w.createViewCard(await owner(),'time',0,undefined,range);const timed=mutation.edits.find(e=>e.path.endsWith('.md'))!.path;assert.deepEqual(w.cardProperties(timed).properties['project/Date'],range);
  const count=w.snapshot().cards.length;await assert.rejects(()=>w.createViewCard({path:'Query.md',expected:'stale',block:0,source},'time',0),/External changes/);await assert.rejects(async()=>w.createViewCard(await owner(),'time',0,undefined,{start:'2026-10-05',end:'2026-10-01'}),/Invalid value/);assert.equal(w.snapshot().cards.length,count);
  block.query.where={all:[{field:'file.folder',op:'eq',value:'Notes'},{field:'file.folder',op:'eq',value:'Notes/Sub'}]};await store();await assert.rejects(async()=>w.createViewCard(await owner(),'time',0),/condition/i);assert.equal(w.snapshot().cards.length,count);
  const legacy=newViewBlock('task'),tag=w.snapshot().tags!.find(t=>t.tag==='task')!;mutation=await w.createViewCard({path:tag.path,expected:tag.revision,block:-1,source:writeViewBlock('',legacy)},'table',0);assert.equal(viewBlockRanges(w.snapshot().tags!.find(t=>t.tag==='task')!.body!).length,0);assert.equal(mutation.edits.length,1);
  // First image comes from the same indexed body used by search, and refresh invalidates it.
  const card=await w.card(timed);await w.saveCard(card.path,'# Images\n\n![First](../assets/one.png)\n<img src="../assets/two.png">\n',card.revision);block.query.where={field:'file.path',op:'eq',value:timed};block.views=[{id:'gallery',name:'Gallery',type:'gallery'}];const gallery=writeViewBlock('',block);assert.equal(w.viewCards(gallery,'gallery').rows[0].previewImage,'../assets/one.png');const again=await w.card(timed);await w.saveCard(timed,'# Images\n\n<img src="../assets/two.png">\n',again.revision);assert.equal(w.viewCards(gallery,'gallery').rows[0].previewImage,'../assets/two.png');
  // Tag sets sort equally even when their stored order differs.
  for(const [name,tags] of [['A',['task','project']],['B',['project','task']]] as const){await w.create('Inbox',name,0,0,false);const card=await w.card('Inbox/'+name+'.md');await w.write([{path:card.path,expected:card.revision,content:'---\ncard-id: '+card.id+'\ntags: '+JSON.stringify(tags)+'\nproject/Status: Todo\n---\n# '+name+'\n'}]);}
  block.query.where={all:[{field:'tags',op:'contains',value:'project'},{field:'tags',op:'contains',value:'task'}]};block.views=[{id:'board',name:'Board',type:'kanban',groupBy:'project/Status',sort:{field:'tags',direction:'asc'}}];await store();assert.deepEqual(w.viewCards(source,'board').rows.map(r=>r.card.name),['A','B']);const a=await w.card('Inbox/A.md'),b=await w.card('Inbox/B.md');await w.moveViewCard({owner:await owner(),view:'board',card:{path:b.path,expected:b.revision},from:'Todo',to:'Todo',before:a.id});source=viewBlockRanges((await w.card('Query.md')).body)[0].source;assert.equal(parseViewBlock(source).views[0].sort,'manual');assert.deepEqual(w.viewCards(source,'board').rows.map(r=>r.card.name),['B','A']);assert.deepEqual(w.cardProperties(a.path).properties.tags,['task','project']);
 });

test('moving or referencing a card preserves its identity, assets and other board references, with atomic undo',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'door-place-card-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const name of ['One','Two'])await w.createFolder('',name);
  await w.create('Inbox','Draft',0,0,false);let card=await w.card('Inbox/Draft.md');await w.saveCard(card.path,'# Draft\n\n![Figure](image.png)\n[Source](../Source.md)\n<img src="image.png">\n\n`![Code](image.png)`\n',card.revision);card=await w.card(card.path);
  const board=(folder:string)=>w.snapshot().boards.find(b=>b.folder===folder)!;
  const place=async(folder:string,mode:'move'|'reference',source?:string)=>{const current=w.snapshot().cards.find(c=>c.id===card.id)!;return w.placeCard(card.id,current.revision,folder,board(folder).revision,40,50,mode,source);};
  await place('Two','reference');assert.ok(w.snapshot().cards.some(c=>c.path==='Inbox/Draft.md'));assert.ok(board('Two').cards.some(p=>'cardId'in p&&p.cardId===card.id));
  let mutation=await place('One','move');assert.ok(!w.snapshot().cards.some(c=>c.path==='Inbox/Draft.md'));assert.equal(w.snapshot().cards.find(c=>c.id===card.id)!.path,'One/Draft.md');assert.ok(board('Two').cards.some(p=>'cardId'in p&&p.cardId===card.id));assert.match((await w.card('One/Draft.md')).body,/!\[Figure\]\(\.\.\/Inbox\/image.png\)/);assert.match((await w.card('One/Draft.md')).body,/<img src="\.\.\/Inbox\/image.png">/);assert.match((await w.card('One/Draft.md')).body,/`!\[Code\]\(image.png\)`/);
  const undo=new UndoHistory();undo.record('Move',mutation.edits);await undo.travel(false,c=>w.write(c));assert.equal(w.snapshot().cards.find(c=>c.id===card.id)!.path,'Inbox/Draft.md');assert.ok(!board('One').cards.some(p=>'cardId'in p&&p.cardId===card.id));await undo.travel(true,c=>w.write(c));
  // A colliding filename is preserved; moving clears the old owned placement, not unrelated references.
  await w.create('Two','Draft',100,100);const old=await w.read('Two/Draft.md');mutation=await place('Two','move','One');assert.equal(w.snapshot().cards.find(c=>c.id===card.id)!.path,'Two/Draft_1.md');assert.equal(await w.read('Two/Draft.md'),old);assert.ok(!board('One').cards.some(p=>'cardId'in p&&p.cardId===card.id));assert.equal(board('Two').cards.filter(p=>'cardId'in p&&p.cardId===card.id).length,1);
  undo.record('Move again',mutation.edits);await undo.travel(false,c=>w.write(c));assert.equal(w.snapshot().cards.find(c=>c.id===card.id)!.path,'One/Draft.md');assert.ok(board('One').cards.some(p=>'cardId'in p&&p.cardId===card.id));assert.ok(board('Two').cards.some(p=>'cardId'in p&&p.cardId===card.id));
  await assert.rejects(()=>w.placeCard(card.id,'stale','Two',board('Two').revision,0,0,'move'),/External changes/);
  let release:()=>void=()=>undefined,started:()=>void=()=>undefined;
  const gate=new Promise<void>(resolve=>{release=resolve;}),moving=new Promise<void>(resolve=>{started=resolve;});
  const session=new Session({request:async r=>{
    if(r.kind==='card')return w.card(r.path);
    if(r.kind==='saveCard')return w.saveCard(r.path,r.body,r.expected);
    if(r.kind==='placeCard'){started();await gate;return w.placeCard(r.id,r.expected,r.board,r.boardExpected,r.x,r.y,r.mode,r.source);}
    throw new Error('Unexpected request '+r.kind);
  }} as Bridge);t.after(()=>session.dispose());session.update({snapshot:{...w.snapshot(),historyAvailable:false}});
  await session.select('One/Draft.md');const pending=session.placeCard(card.id,'Two',0,0,'move','One');await moving;
  session.edit(session.state.draft!.body+'\nTyped during move.');release();await pending;
  assert.equal(session.state.draft?.card.path,'Two/Draft_1.md');assert.equal(session.state.draft?.dirty,true);
  await session.run(()=>session.flush());assert.match((await w.card('Two/Draft_1.md')).body,/Typed during move/);

 });

test('moving a note leaves code, external links and card IDs intact',()=>{
  assert.equal(moveCardLinks('[![image](image.png)](Other.md)', 'Inbox/Draft.md','Notes/Draft.md'),'[![image](../Inbox/image.png)](../Inbox/Other.md)');
  const body='[site](https://example.com) [card](card:abc) [self](Draft.md#title)\n\n```md\n![image](image.png)\n```\n\n![actual](image.png)\n';
  const result=moveCardLinks(body,'Inbox/Draft.md','Notes/Draft.md');assert.match(result,/\[self\]\(Draft.md#title\)/);assert.match(result,/```md\n!\[image\]\(image.png\)\n```/);assert.match(result,/!\[actual\]\(\.\.\/Inbox\/image.png\)/);assert.match(result,/\[card\]\(card:abc\)/);
 });
