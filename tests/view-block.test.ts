import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {stringify} from 'yaml';
import {Workspace} from '../src/core/workspace';
import {queryFields,parseViewBlock,writeViewBlock,newViewBlock,viewBlockRanges,type Rule} from '../src/view-block';
import {compileView} from '../src/core/view-query';
import {searchDocument} from '../src/core/search';
import {UndoHistory} from '../src/renderer/history';

test('file-backed views use exact tags, typed indexed values, pinned merged keys and shared/per-view intersections',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-views-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);
  t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const name of ['project','task','project/child'])await w.createTag(name);
  const getTag=(name:string)=>w.snapshot().tags!.find(t=>t.tag===name)!;
  for(const name of ['project','task']){const tag=getTag(name);await w.saveTag(tag.path,tag.revision,[{key:name==='project'?'Status':'status',type:'select',options:['Todo','Done']},{key:'Count',type:'number'},{key:'Reviewed',type:'boolean'},{key:'Date',type:'date'},{key:'Colors',type:'select',multiple:true,options:['Red','Blue']}],[]);}
  const child=getTag('project/child');await w.saveTag(child.path,child.revision,[],['project']);
  await w.createFolder('','Notes');
  const records=[['A',{tags:['project'],'project/Status':'Todo','project/Count':0,'project/Reviewed':false,'project/Date':'2026-10-01','project/Colors':['Red']}],['B',{tags:['task'],'task/status':'Done','task/Count':4}],['Child',{tags:['project/child'],'project/Status':'Todo'}],['Empty',{}],['Wrong',{tags:['project'],'project/Count':'0','project/Reviewed':'false','project/Date':'bad'}],['Null',{tags:['project'],'project/Count':null,'project/Status':''}]] as const;
  for(const [name,props] of records){await w.create('Notes',name,0,0);const card=await w.card('Notes/'+name+'.md');await w.write([{path:card.path,expected:card.revision,content:'---\n'+stringify({'card-id':card.id,...props})+'---\n# '+name+'\n\nHello content.\n'}]);}
  const source=(where?:Rule,filter?:Rule)=>{const block=newViewBlock();block.query.where=where;block.views[0].filter=filter;return writeViewBlock('',block);};
  const names=(where?:Rule,filter?:Rule)=>w.viewCards(source(where,filter),'table').rows.map(r=>r.card.name).sort();
  const has=(tag:string):Rule=>({field:'tags',op:'contains',value:tag});
  assert.deepEqual(names(has('project')),['A','Null','Wrong']);
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
