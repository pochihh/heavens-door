import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {stringify} from 'yaml';
import {Workspace} from '../src/core/workspace';
import {queryFields,tableAppearance,validateView,parseViewBlock,writeViewBlock,newViewBlock,viewBlockRanges,type Rule} from '../src/view-block';
import {compileView} from '../src/core/view-query';
import {searchDocument} from '../src/core/search';
import {Session} from '../src/renderer/session';
import type {Bridge} from '../src/shared';
import {UndoHistory} from '../src/renderer/history';

test('file-backed views use exact tags, typed indexed values, pinned merged keys and shared/per-view intersections',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-views-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);
  t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const name of ['project','task','project/child'])await w.createTag(name);
  const getTag=(name:string)=>w.snapshot().tags!.find(t=>t.tag===name)!;
  for(const name of ['project','task']){const tag=getTag(name);await w.saveTag(tag.path,tag.revision,[{key:name==='project'?'Status':'status',type:'select',options:['Todo','Done']},{key:'Count',type:'number'},{key:'Reviewed',type:'boolean'},{key:'Date',type:'date'},{key:'Colors',type:'select',multiple:true,options:['Red','Blue']}],[]);}
  const child=getTag('project/child');await w.saveTag(child.path,child.revision,[],['project']);
  await w.createFolder('','Notes');
  const records=[['A',{'card-color':'#c9838a',tags:['project'],'project/Status':'Todo','project/Count':0,'project/Reviewed':false,'project/Date':'2026-10-01','project/Colors':['Red']}],['B',{tags:['task'],'task/status':'Done','task/Count':4}],['Child',{tags:['project/child'],'project/Status':'Todo'}],['Empty',{}],['Wrong',{tags:['project'],'project/Count':'0','project/Reviewed':'false','project/Date':'bad'}],['Null',{tags:['project'],'project/Count':null,'project/Status':''}]] as const;
  for(const [name,props] of records){await w.create('Notes',name,0,0);const card=await w.card('Notes/'+name+'.md');await w.write([{path:card.path,expected:card.revision,content:'---\n'+stringify({'card-id':card.id,...props})+'---\n# '+name+'\n\nHello content.\n'}]);}
  const source=(where?:Rule,filter?:Rule)=>{const block=newViewBlock();block.query.where=where;block.views[0].filter=filter;return writeViewBlock('',block);};
  const names=(where?:Rule,filter?:Rule)=>w.viewCards(source(where,filter),'table').rows.map(r=>r.card.name).sort();
  const has=(tag:string):Rule=>({field:'tags',op:'contains',value:tag});
  assert.deepEqual(names(has('project')),['A','Null','Wrong']);
  assert.equal(w.viewCards(source(has('project')),'table').rows.find(r=>r.card.name==='A')?.card.fillColor,'#c9838a');assert.equal(w.tagCards('project').find(r=>r.card.name==='A')?.card.fillColor,'#c9838a');
  assert.deepEqual(names({field:'tags',op:'notContains',value:'project'}),['B','Child','Empty']);
  assert.deepEqual(names({any:[has('project'),has('task')]},{field:['project/Status','task/status'],op:'eq',value:'Done'}),['B']);
  assert.deepEqual(names({field:'project/Count',op:'eq',value:0}),['A']);
  assert.deepEqual(names({not:{field:'project/Count',op:'eq',value:3}}),['A']);
  assert.deepEqual(names({field:'project/Reviewed',op:'eq',value:false}),['A']);
  assert.deepEqual(names({field:'project/Date',op:'before',value:'2026-10-02'}),['A']);
  assert.deepEqual(names({field:'project/Colors',op:'contains',value:'Red'}),['A']);
  assert.deepEqual(names({field:'project/Colors',op:'contains',value:'Re'}),[]);
  assert.deepEqual(names({field:'project/Count',op:'missing'}),['B','Child','Empty']);
  assert.deepEqual(names({field:'project/Count',op:'empty'}),['B','Child','Empty','Null']);
  assert.deepEqual(names({field:'file.folder',op:'under',value:'Notes'}).length,6);
  assert.deepEqual(names({field:'file.text',op:'contains',value:'Hello'}).length,6);
  assert.deepEqual(names({field:'file.text',op:'contains',value:"' OR 1=1 --"}),[]);
  const tags=w.snapshot().tags!,merged=queryFields(tags,['project','task']);
  assert.deepEqual(merged.find(f=>f.name==='Status')?.keys,['project/Status','task/status']);
  assert.equal(queryFields(tags,['project','task'],{mergeProperties:true,caseSensitive:true}).filter(f=>/status/i.test(f.name)).length,2);
  assert.equal(queryFields(tags,['project','task'],{mergeProperties:false,caseSensitive:false}).filter(f=>/status/i.test(f.name)).length,2);
  assert.equal(queryFields(tags,[]).some(f=>f.keys[0]==='project/Status'),false);
  const pinned=source(undefined,{field:['project/Status','task/status'],op:'eq',value:'Todo'});const before=w.viewCards(pinned,'table');
  await w.setPreferences({query:{mergeProperties:false,caseSensitive:true}});assert.deepEqual(w.viewCards(pinned,'table'),before);
  const tag=getTag('project'),raw=await w.read(tag.path),body='Text before.\n\n```view-block\n'+pinned+'```\n\nText after.\n';
  const mutation=await w.saveTagBody(tag.path,tag.revision,body),undo=new UndoHistory();undo.record('Edit view',mutation.edits);
  assert.equal(getTag('project').body,body);assert.equal(viewBlockRanges(body).length,1);
  assert.deepEqual(compileView(viewBlockRanges(body)[0].source,'table',tags),compileView(pinned,'table',tags));
  await assert.rejects(()=>w.saveTagBody(tag.path,tag.revision,'Overwrite'),/External changes/);
  await undo.travel(false,changes=>w.write(changes));assert.equal(await w.read(tag.path),raw);
  await undo.travel(true,changes=>w.write(changes));assert.equal(getTag('project').body,body);
  w.close();w=await Workspace.open(root,cache);assert.deepEqual(w.snapshot().preferences?.query,{mergeProperties:false,caseSensitive:true});assert.deepEqual(w.viewCards(pinned,'table'),before);
  const card=await w.card('Notes/A.md');await w.write([{path:card.path,expected:card.revision,content:(await w.read(card.path)).replace('project/Status: Todo','project/Status: Done')}]);assert.deepEqual(w.viewCards(pinned,'table').rows.map(r=>r.card.name),['Child']);
  assert.throws(()=>w.viewCards(source({field:'project/Cout',op:'eq',value:0}),'table'),/Unknown property/);
  assert.throws(()=>w.viewCards(source({field:'project/Count',op:'contains',value:'0'}),'table'),/comparison/);
  assert.throws(()=>w.viewCards(source({field:'project/Date',op:'before',value:'2026-02-30'}),'table'),/ISO date/);
  assert.throws(()=>w.viewCards(source({field:'project/Colors',op:'starts',value:'R'}),'table'),/comparison/);
  assert.throws(()=>w.viewCards(source(),'table',-1),/query/i);
});

test('YAML errors fail closed, view-local errors stay local, source comments and ordinary code survive',()=>{
  const base=newViewBlock(),source='# Query explanation\n'+writeViewBlock('',base);
  assert.match(writeViewBlock(source,{...base,views:[{...base.views[0],name:'Renamed'}]}),/# Query explanation/);
  for(const bad of [source.replace('from: cards','from: all'),source.replace('type: table','type: mystery'),source.replace('fields:','feilds:'),source.replace('version: 1','version: 2'),source+'unexpected: value\n'])assert.throws(()=>compileView(bad,'table',[]));
  assert.throws(()=>parseViewBlock('version: [1\n'),/line/);
  const mixed={...base,views:[base.views[0],{id:'bad',name:'Bad',type:'unknown'}]};
  compileView(stringify(mixed),'table',[]);assert.throws(()=>compileView(stringify(mixed),'bad',[]),/supported layout/);
  const raw='```view-block\n'+source+'```\n';
  assert.equal(searchDocument('# Card\n\n'+raw).text.includes('version'),false);
  assert.equal(viewBlockRanges('```text\n'+raw+'```\n').length,0);
});

test('view edits honor merge settings, validate every attached destination and undo one source-file change',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-view-edit-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));
  t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const name of ['project','task','child','unattached'])await w.createTag(name);
  for(const name of ['project','task','unattached']){const tag=w.snapshot().tags!.find(t=>t.tag===name)!;await w.saveTag(tag.path,tag.revision,[{key:name==='task'?'status':'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:name==='project'?['Review']:[],done:['Done']}},{key:'Date',type:'date'}],[]);}
  const child=w.snapshot().tags!.find(t=>t.tag==='child')!;await w.saveTag(child.path,child.revision,[],['project']);
  await w.createFolder('','Notes');await w.create('Notes','A',0,0);let card=await w.card('Notes/A.md');
  await w.write([{path:card.path,expected:card.revision,content:'---\n'+stringify({'card-id':card.id,tags:['project','task'],unrelated:'keep','project/Status':'Todo','task/status':'Todo'})+'---\n# A\n\nBody stays intact.\n'}]);
  const before=await w.read(card.path),undo=new UndoHistory();card=await w.card(card.path);
  const mutation=await w.setViewProperty(card.path,card.revision,'project/Status','Done');undo.record('Edit Status',mutation.edits);
  assert.equal(mutation.edits.length,1);let props=w.cardProperties(card.path).properties;
  assert.equal(props['project/Status'],'Done');assert.equal(props['task/status'],'Done');assert.equal(props['unattached/Status'],undefined);assert.equal(props.unrelated,'keep');assert.match(await w.read(card.path),/# A\n\nBody stays intact\.\n$/);
  const view=newViewBlock();view.query.where={field:'task/status',op:'eq',value:'Done'};assert.equal(w.viewCards(writeViewBlock('',view),'table').total,1);
  await assert.rejects(()=>w.setViewProperty(card.path,card.revision,'project/Status','Todo'),/External changes/);
  await undo.travel(false,changes=>w.write(changes));assert.equal(await w.read(card.path),before);
  card=await w.card(card.path);await assert.rejects(()=>w.setViewProperty(card.path,card.revision,'project/Status','Review'),/Invalid value/);assert.equal(await w.read(card.path),before,'No partial write when one option schema rejects');
  await w.setPreferences({query:{mergeProperties:false,caseSensitive:false}});await w.setViewProperty(card.path,card.revision,'project/Status','Done');props=w.cardProperties(card.path).properties;assert.equal(props['project/Status'],'Done');assert.equal(props['task/status'],'Todo');
  await w.setPreferences({query:{mergeProperties:true,caseSensitive:true}});card=await w.card(card.path);await w.setViewProperty(card.path,card.revision,'task/status','Done');assert.equal(w.cardProperties(card.path).properties['project/Status'],'Done');
  card=await w.card(card.path);await w.setViewProperty(card.path,card.revision,'project/Status','Todo');assert.equal(w.cardProperties(card.path).properties['task/status'],'Done');
  await w.setPreferences({query:{mergeProperties:true,caseSensitive:false}});card=await w.card(card.path);const range={start:'2026-10-01',end:'2026-10-03'};await w.setViewProperty(card.path,card.revision,'project/Date',range);props=w.cardProperties(card.path).properties;assert.deepEqual(props['project/Date'],range);assert.deepEqual(props['task/Date'],range);
  card=await w.card(card.path);await w.write([{path:card.path,expected:card.revision,content:'---\n'+stringify({'card-id':card.id,tags:['child'],'project/Status':'Todo'})+'---\n# A\n'}]);card=await w.card(card.path);await w.setViewProperty(card.path,card.revision,'project/Status','Done');props=w.cardProperties(card.path).properties;assert.equal(props['project/Status'],'Done');assert.equal(props['child/Status'],undefined);assert.equal(props['task/status'],undefined);
  const current=await w.read(card.path);card=await w.card(card.path);await assert.rejects(()=>w.setViewProperty(card.path,card.revision,'missing/Status','Todo'),/Unknown property/);assert.equal(await w.read(card.path),current);
});

test('Kanban order is lazy, reconciles query pages and new arrivals, and moves missing properties atomically',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-order-')),root=join(dir,'notes');await fs.mkdir(root);await fs.mkdir(join(root,'Notes'));
  const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createTag('project');let tag=w.snapshot().tags![0];await w.saveTag(tag.path,tag.revision,[{key:'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:[],done:['Done','__proto__','constructor']}},{key:'Unrelated',type:'number',default:123}],[]);
  const put=async(name:string,id:string,props:Record<string,unknown>={})=>fs.writeFile(join(root,'Notes',name+'.md'),'---\n'+stringify({'card-id':id,...props})+'---\n# '+name+'\n\nBody.\n');
  await Promise.all(Array.from({length:105},(_,i)=>put(String(i).padStart(3,'0'),'card-'+i,{tags:['project'],'project/Status':'Todo'})));
  await put('Empty','empty');await put('Attached','attached',{tags:['project']});
  const block=newViewBlock();block.query.where={field:'file.folder',op:'under',value:'Notes'};block.views=[{id:'board',type:'kanban',name:'Board',groupBy:'project/Status'}];
  let source=writeViewBlock('',block);await fs.writeFile(join(root,'Query.md'),'---\ncard-id: query\n---\n# Query\n\n```view-block\n'+source+'```\n');await w.scan();
  const owner=async()=>({path:'Query.md',expected:(await w.card('Query.md')).revision,block:0,source});
  const card=async(path:string)=>({path,expected:(await w.card(path)).revision});
  const refresh=async()=>{source=viewBlockRanges((await w.card('Query.md')).body)[0].source;};
  const ids=(value:string)=>w.viewCards(source,'board').columns!.find(c=>c.value===value)?.ids??[];
  const original=await w.read('Query.md');let page=w.viewCards(source,'board');assert.equal(page.rows.length,102);assert.equal(page.nextOffset,100);assert.equal(w.viewCards(source,'board',100).rows.length,5);assert.equal(await w.read('Query.md'),original);assert.equal(parseViewBlock(source).views[0].order,undefined);
  await w.moveViewCard({owner:await owner(),view:'board',card:await card('Notes/104.md'),from:'Todo',to:'Todo',before:'card-0'});await refresh();
  assert.equal(ids('Todo')[0],'card-104');assert.equal(parseViewBlock(source).views[0].order!.Todo.length,105);assert.equal(parseViewBlock(source).views[0].order![''],undefined);
  await put('000 new','new',{tags:['project'],'project/Status':'Todo'});await w.refresh('Notes/000 new.md');page=w.viewCards(source,'board',100);assert.equal(page.columns!.find(c=>c.value==='Todo')!.ids.at(-1),'new');assert.ok(!parseViewBlock(source).views[0].order!.Todo.includes('new'));
  const before=await w.read('Query.md');await w.setViewProperty('Notes/002.md',(await w.card('Notes/002.md')).revision,'project/Status','Done');assert.ok(!ids('Todo').includes('card-2'));assert.equal(await w.read('Query.md'),before,'Refresh does not prune or rewrite the order');await w.setViewProperty('Notes/002.md',(await w.card('Notes/002.md')).revision,'project/Status','Todo');assert.equal(ids('Todo')[3],'card-2');
  const raw=await w.read('Notes/Empty.md'),undo=new UndoHistory();
  const mutation=await w.moveViewCard({owner:await owner(),view:'board',card:await card('Notes/Empty.md'),from:'',to:'Done'});undo.record('Move',mutation.edits);await refresh();
  assert.equal(mutation.edits.length,2);let props=w.cardProperties('Notes/Empty.md').properties;assert.deepEqual(props.tags,['project']);assert.equal(props['project/Status'],'Done');assert.equal(props['project/Unrelated'],undefined);assert.deepEqual(ids('Done'),['empty']);
  await undo.travel(false,changes=>w.write(changes));await refresh();assert.equal(await w.read('Notes/Empty.md'),raw);assert.equal(await w.read('Query.md'),before);
  await undo.travel(true,changes=>w.write(changes));await refresh();assert.equal(w.cardProperties('Notes/Empty.md').properties['project/Status'],'Done');
  await w.moveViewCard({owner:await owner(),view:'board',card:await card('Notes/Attached.md'),from:'',to:'Todo',before:'card-0'});await refresh();props=w.cardProperties('Notes/Attached.md').properties;assert.equal(props['project/Status'],'Todo');assert.equal(props['project/Unrelated'],undefined);assert.ok(parseViewBlock(source).views[0].order!.Todo.includes('new'),'Reordering this column now records its new arrivals');
  const snapshot=await w.read('Query.md'),empty=await w.read('Notes/Empty.md');
  await assert.rejects(()=>w.moveViewCard({owner:{path:'Query.md',expected:'stale',block:0,source},view:'board',card:{path:'Notes/Empty.md',expected:'stale'},from:'Done',to:'Todo'}),/External changes/);assert.equal(await w.read('Query.md'),snapshot);assert.equal(await w.read('Notes/Empty.md'),empty);
  await assert.rejects(async()=>w.moveViewCard({owner:await owner(),view:'board',card:await card('Notes/Empty.md'),from:'Done',to:'Invalid'}),/Invalid value/);assert.equal(await w.read('Query.md'),snapshot);
  tag=w.snapshot().tags![0];const legacy=await w.moveViewCard({owner:{path:tag.path,expected:tag.revision,block:-1,source},view:'board',card:await card('Notes/Empty.md'),from:'Done',to:'Todo',before:'card-0'});assert.equal(legacy.edits.length,2);assert.equal(viewBlockRanges(w.snapshot().tags![0].body!).length,1);
  const filtered=parseViewBlock(source);filtered.views[0].filter={field:'file.title',op:'neq',value:'000'};const filteredSource=writeViewBlock(source,filtered);assert.ok(!w.viewCards(filteredSource,'board').columns!.find(c=>c.value==='Todo')!.ids.includes('card-0'));assert.ok(ids('Todo').includes('card-0'));
  // The block's own card can move too, even with pending body edits, without duplicate writes or losing its draft.
  const own=parseViewBlock(source);delete own.query.where;source=writeViewBlock(source,own);const ownCard=await w.card('Query.md');await w.saveCard(ownCard.path,'# Query\n\n```view-block\n'+source+'```\n',ownCard.revision);
  const session=new Session({request:async request=>{switch(request.kind){case 'card':return w.card(request.path);case 'saveCard':return w.saveCard(request.path,request.body,request.expected);case 'moveViewCard':return w.moveViewCard(request.move);case 'write':return w.write(request.changes);default:throw new Error(request.kind);}}} as Bridge);
  session.state.snapshot={...w.snapshot(),historyAvailable:false};await session.select('Query.md');session.edit(session.state.draft!.body+'\nPending text.\n');
  await session.moveViewCard({owner:await owner(),view:'board',card:await card('Query.md'),from:'',to:'Done'});assert.match(session.state.draft!.body,/Pending text/);assert.equal(session.state.draft!.dirty,false);assert.equal(w.cardProperties('Query.md').properties['project/Status'],'Done');assert.equal(session.state.draft!.body,(await w.card('Query.md')).body);
  await session.undo();assert.equal(w.cardProperties('Query.md').properties['project/Status'],undefined);assert.match(session.state.draft!.body,/Pending text/);session.dispose();
  await refresh();const emptyColumn=w.cardProperties('Notes/Empty.md').properties['project/Status'] as string;
  await w.moveViewCard({owner:await owner(),view:'board',card:await card('Notes/Empty.md'),from:emptyColumn,to:'__proto__'});await refresh();assert.deepEqual(ids('__proto__'),['empty']);assert.ok(Object.hasOwn(parseViewBlock(source).views[0].order!,'__proto__'));
  await w.moveViewCard({owner:await owner(),view:'board',card:await card('Notes/Empty.md'),from:'__proto__',to:'constructor'});await refresh();assert.deepEqual(ids('constructor'),['empty']);
  const started=performance.now();for(let i=0;i<20;i++)w.viewCards(source,'board');t.diagnostic(`Indexed Kanban query, ${w.viewCards(source,'board').total} cards: ${((performance.now()-started)/20).toFixed(2)} ms average`);
});


test('Table appearances preserve query results and accept legacy List without rewriting it',()=>{
  const block=newViewBlock();block.views[0].fields=['file.title','file.name'];const source=writeViewBlock('',block),compiled=compileView(source,'table',[]);
  for(const appearance of ['grid','compact'] as const){block.views[0].appearance=appearance;validateView(block.views[0]);assert.equal(tableAppearance(parseViewBlock(writeViewBlock('',block)).views[0]),appearance);assert.deepEqual(compileView(writeViewBlock('',block),'table',[]).where,compiled.where);}
  const legacy=source.replace('type: table','type: list'),parsed=parseViewBlock(legacy);validateView(parsed.views[0]);assert.equal(tableAppearance(parsed.views[0]),'compact');assert.equal(writeViewBlock(legacy,parsed),legacy);
  assert.throws(()=>validateView({...block.views[0],appearance:'unknown'}),/Invalid view/);
});

test('named blocks, query property scope, date endpoints and manual timeline order remain file-based',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-timeline-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.createTag('project');const tag=w.snapshot().tags![0];await w.saveTag(tag.path,tag.revision,[{key:'Date',type:'date'}],[]);await w.createFolder('','Tasks');
 const values=[['A',{start:'2026-10-03',end:'2026-10-09'}],['B','2026-10-05'],['C',null]] as const;
 for(const [name,value] of values){await w.create('Tasks',name,0,0);const card=await w.card('Tasks/'+name+'.md');await w.write([{path:card.path,expected:card.revision,content:'---\n'+stringify({'card-id':card.id,tags:['project'],'project/Date':value})+'---\n# '+name+'\n'}]);}
 const block=newViewBlock();block.name='Project schedule';block.query.where={field:'file.folder',op:'under',value:'Tasks'};block.views[0]={id:'timeline',name:'Timeline',type:'timeline',dateBy:'project/Date',sort:{field:'project/Date',part:'end',direction:'asc'}};
 const results=()=>w.viewCards(writeViewBlock('',block),'timeline');
 assert.deepEqual(results().rows.map(r=>r.card.name),['B','A','C']);
 block.views[0].sort={field:'project/Date',part:'start',direction:'asc'};assert.deepEqual(results().rows.map(r=>r.card.name),['A','B','C']);
 block.views[0].filter={field:'file.name',op:'eq',value:'Missing'};assert.deepEqual(results().scopeTags,['project'],'the view filter cannot hide query property choices');delete block.views[0].filter;
 const cards=results().rows;block.views[0].sort='manual';block.views[0].order={rows:[cards[1].card.id,cards[0].card.id]};assert.deepEqual(results().rows.map(r=>r.card.name),['B','A','C']);
 await w.create('Tasks','D',0,0);assert.deepEqual(results().rows.map(r=>r.card.name),['B','A','C','D']);
 assert.equal(parseViewBlock(writeViewBlock('',block)).name,'Project schedule');
 const {replaceViewSource}=await import('../src/view-block'),source=writeViewBlock('',block),body='Before\n\n```view-block\n'+source+'```\n\nAfter';
 const copied=replaceViewSource(body,0,source,writeViewBlock(source,{...block,name:'Copy'}),true);assert.equal(viewBlockRanges(copied).length,2);assert.equal(parseViewBlock(viewBlockRanges(copied)[1].source).name,'Copy');assert.ok(copied.endsWith('After'));
});

test('Timeline drops save dates and complete row order in one undoable file transaction',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-timeline-move-')),root=join(dir,'notes');await fs.mkdir(root);await fs.mkdir(join(root,'Tasks'));
 const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.createTag('project');const tag=w.snapshot().tags![0];await w.saveTag(tag.path,tag.revision,[{key:'Date',type:'date'},{key:'Unrelated',type:'number',default:10}],[]);
 const put=(name:string,id:string,props:Record<string,unknown>={})=>fs.writeFile(join(root,'Tasks',name+'.md'),'---\n'+stringify({'card-id':id,...props})+'---\n# '+name+'\n');
 await Promise.all(Array.from({length:105},(_,i)=>put(String(i).padStart(3,'0'),'card-'+i,{tags:['project'],'project/Date':'2026-10-03'})));
 await put('Unscheduled','new');
 const block=newViewBlock();block.query.where={field:'file.folder',op:'under',value:'Tasks'};block.views=[{id:'time',name:'Timeline',type:'timeline',dateBy:'project/Date',sort:{field:'file.name',direction:'asc'}}];
 let source=writeViewBlock('',block);await fs.writeFile(join(root,'Query.md'),'---\ncard-id: query\n---\n# Query\n\n```view-block\n'+source+'```\n');await w.scan();
 const owner=async()=>({path:'Query.md',expected:(await w.card('Query.md')).revision,block:0,source});
 const card=async(path:string)=>({path,expected:(await w.card(path)).revision});
 const refresh=async()=>{source=viewBlockRanges((await w.card('Query.md')).body)[0].source;};
 const original=await w.read('Tasks/Unscheduled.md'),originalQuery=await w.read('Query.md'),undo=new UndoHistory();
 const date={start:'2026-10-04T09:00:00.000Z',end:'2026-10-04T10:00:00.000Z'};
 const moved=await w.moveViewCard({owner:await owner(),view:'time',card:await card('Tasks/Unscheduled.md'),from:'rows',to:'rows',before:'card-1',date});undo.record('Move',moved.edits);await refresh();
 assert.equal(moved.edits.length,2);const view=parseViewBlock(source).views[0];assert.equal(view.sort,'manual');assert.equal(view.order?.rows.length,106,'Moving a loaded card retains every unloaded result');assert.deepEqual(view.order?.rows.slice(0,3),['card-0','new','card-1']);
 const props=w.cardProperties('Tasks/Unscheduled.md').properties;assert.deepEqual(props.tags,['project']);assert.deepEqual(props['project/Date'],date);assert.equal(props['project/Unrelated'],undefined);
 assert.deepEqual(w.viewCards(source,'time').rows.slice(0,3).map(r=>r.card.id),['card-0','new','card-1']);assert.equal(w.viewCards(source,'time',100).rows.at(-1)?.card.id,'card-104');
 await undo.travel(false,changes=>w.write(changes));await refresh();assert.equal(await w.read('Tasks/Unscheduled.md'),original);assert.equal(await w.read('Query.md'),originalQuery);
 await undo.travel(true,changes=>w.write(changes));await refresh();assert.deepEqual(w.cardProperties('Tasks/Unscheduled.md').properties['project/Date'],date);
 const raw=await w.read('Tasks/000.md');const vertical=await w.moveViewCard({owner:await owner(),view:'time',card:await card('Tasks/000.md'),from:'rows',to:'rows',after:'card-1'});await refresh();assert.equal(vertical.edits.length,1);assert.equal(await w.read('Tasks/000.md'),raw,'A vertical drop must not rewrite date formatting or attach properties');
 await put('000 arrival','arrival',{tags:['project'],'project/Date':'2026-10-03'});await w.refresh('Tasks/000 arrival.md');const before=await w.read('Query.md');assert.equal(w.viewCards(source,'time',100).rows.at(-1)?.card.id,'arrival');assert.equal(await w.read('Query.md'),before,'Query refresh does not eagerly rewrite the order');
 await w.moveViewCard({owner:await owner(),view:'time',card:await card('Tasks/104.md'),from:'rows',to:'rows',before:'card-0'});await refresh();assert.ok(parseViewBlock(source).views[0].order?.rows.includes('arrival'));
 const safe=await w.read('Query.md'),safeCard=await w.read('Tasks/000.md');
 await assert.rejects(async()=>w.moveViewCard({owner:await owner(),view:'time',card:await card('Tasks/000.md'),from:'rows',to:'rows',date:'not a date'}),/Invalid value/);
 await assert.rejects(async()=>w.moveViewCard({owner:await owner(),view:'time',card:await card('Tasks/000.md'),from:'rows',to:'rows',before:'missing',date:'2026-10-05'}),/changed/i);
 await assert.rejects(async()=>w.moveViewCard({owner:await owner(),view:'time',card:{path:'Tasks/000.md',expected:'stale'},from:'rows',to:'rows',date:'2026-10-05'}),/External changes/);
 assert.equal(await w.read('Query.md'),safe);assert.equal(await w.read('Tasks/000.md'),safeCard);
 // A view may include its own owner card; date and order must still produce just one write.
 const self=parseViewBlock(source);delete self.query.where;source=writeViewBlock(source,self);await w.saveCard('Query.md','# Query\n\n```view-block\n'+source+'```\n',(await w.card('Query.md')).revision);
 const own=await w.moveViewCard({owner:await owner(),view:'time',card:await card('Query.md'),from:'rows',to:'rows',before:'new',date:'2026-10-06'});await refresh();assert.equal(own.edits.length,1);assert.equal(w.cardProperties('Query.md').properties['project/Date'],'2026-10-06');assert.equal(parseViewBlock(source).views[0].order?.rows[0],'query');
});

test('Manual Table and Compact order stays in the view file, survives pagination and can be undone',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-table-order-')),root=join(dir,'notes');await fs.mkdir(root);await fs.mkdir(join(root,'Tasks'));
 const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await Promise.all(Array.from({length:105},(_,i)=>fs.writeFile(join(root,'Tasks',String(i).padStart(3,'0')+'.md'),'---\ncard-id: card-'+i+'\n---\n# Card '+i+'\n')));
 const block=newViewBlock();block.query.where={field:'file.folder',op:'under',value:'Tasks'};block.views[0].sort={field:'file.name',direction:'desc'};
 let source=writeViewBlock('',block);await fs.writeFile(join(root,'Query.md'),'---\ncard-id: query\n---\n```view-block\n'+source+'```\n');await w.scan();
 const owner=async()=>({path:'Query.md',expected:(await w.card('Query.md')).revision,block:0,source}),card=async()=>({path:'Tasks/103.md',expected:(await w.card('Tasks/103.md')).revision});
 const refresh=async()=>{source=viewBlockRanges((await w.card('Query.md')).body)[0].source;};
 const initial=await w.read('Query.md'),originalCard=await w.read('Tasks/103.md'),undo=new UndoHistory();
 const moved=await w.moveViewCard({owner:await owner(),view:'table',card:await card(),from:'rows',to:'rows',before:'card-104'});undo.record('Reorder',moved.edits);await refresh();
 assert.equal(moved.edits.length,1);assert.equal(await w.read('Tasks/103.md'),originalCard);const view=parseViewBlock(source).views[0];assert.equal(view.sort,'manual');assert.equal(view.order?.rows.length,105);assert.deepEqual(w.viewCards(source,'table').rows.slice(0,3).map(r=>r.card.id),['card-103','card-104','card-102']);assert.equal(w.viewCards(source,'table',100).rows.at(-1)?.card.id,'card-0');
 for(const type of ['table','list'] as const){const next=parseViewBlock(source);next.views[0]={...next.views[0],type,appearance:'compact'};assert.deepEqual(w.viewCards(writeViewBlock('',next),'table').rows.map(r=>r.card.id),w.viewCards(source,'table').rows.map(r=>r.card.id));}
 await undo.travel(false,changes=>w.write(changes));await refresh();assert.equal(await w.read('Query.md'),initial);await undo.travel(true,changes=>w.write(changes));await refresh();
 await fs.writeFile(join(root,'Tasks','000 new.md'),'---\ncard-id: arrival\n---\n# New\n');await w.refresh('Tasks/000 new.md');const saved=await w.read('Query.md');assert.equal(w.viewCards(source,'table',100).rows.at(-1)?.card.id,'arrival');assert.equal(await w.read('Query.md'),saved,'Refresh never writes order');
 await assert.rejects(async()=>w.moveViewCard({owner:await owner(),view:'table',card:await card(),from:'rows',to:'rows',date:'2026-10-03'}),/Invalid/);
 await assert.rejects(async()=>w.moveViewCard({owner:await owner(),view:'table',card:await card(),from:'rows',to:'rows',before:'missing'}),/changed/i);
 assert.equal(await w.read('Query.md'),saved);
});
