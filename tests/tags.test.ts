import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {revision} from '../src/core/format';
import {resolveTag,cardTagFields,validateFields,validateTagValue,fieldOptions} from '../src/tags';
import {UndoHistory} from '../src/renderer/history';

test('tags preserve Markdown, apply typed defaults, query descendants and remove only unshared values with undo',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-tags-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);
  t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.setPreferences({tagColors:{project:'#c9838a'}});assert.equal(w.snapshot().preferences?.tagColors?.project,'#c9838a');
  await assert.rejects(()=>w.setPreferences({tagColors:{project:'red'}}),/six-digit hex/);
  await assert.rejects(()=>w.setPreferences({tagColors:{'bad tag':'#c9838a'}}),/six-digit hex/);
  await w.createFolder('','Notes');await w.create('Notes','A',20,20);await w.create('Notes','B',400,20);
  await w.createTag('project');let tag=w.snapshot().tags!.find(t=>t.tag==='project')!;
  await w.saveTag(tag.path,tag.revision,[{key:'status',type:'select',options:['Todo','Done'],default:'Todo'},{key:'priority',type:'number',default:2},{key:'related',type:'link'}],[]);
  await w.createTag('project/research');tag=w.snapshot().tags!.find(t=>t.tag==='project/research')!;
  await w.saveTag(tag.path,tag.revision,[{key:'method',type:'text',default:'Read'}],['project']);
  await w.createTag('task');tag=w.snapshot().tags!.find(t=>t.tag==='task')!;await w.saveTag(tag.path,tag.revision,[],['project']);
  const path='Notes/A.md',raw=(await w.read(path)).replace('---\ncard-id:','---\n# Keep comment\ncustom: keep\nproject/status: Done\ncard-id:')+'# A\n\nKeep **Markdown** unchanged.\n';
  await w.write([{path,content:raw,expected:(await w.card(path)).revision}]);
  await w.setCardTag(path,revision(raw),'project/research',true);
  let props=w.cardProperties(path);assert.equal(props.properties['project/status'],'Done');assert.equal(props.properties['project/priority'],2);assert.equal(props.properties['project/research/method'],'Read');assert.equal(props.properties.custom,'keep');assert.match(await w.read(path),/# Keep comment/);assert.match(await w.read(path),/# A\n\nKeep \*\*Markdown\*\* unchanged\.\n$/);
  assert.equal(w.tagCards('project').length,1);assert.equal(w.tagCards('project/research').length,1);assert.equal(w.tagCards('pro').length,0);assert.equal(w.tagCards("' OR 1=1 --").length,0);
  assert.equal(w.queryCards({tag:'project'}).length,0);assert.equal(w.queryCards({tag:'project',tagChildren:true}).length,1);
  await assert.rejects(()=>w.setTagProperty(path,props.revision,'project','project/priority','two'),/Invalid value/);
  await assert.rejects(()=>w.setTagProperty(path,props.revision,'project','card-id','bad'),/Unknown property/);
  await w.setTagProperty(path,props.revision,'project','project/priority',3);
  await assert.rejects(()=>w.setTagProperty(path,props.revision,'project','project/priority',4),/External changes/);
  props=w.cardProperties(path);const target=(await w.card('Notes/B.md')).id;await w.setTagProperty(path,props.revision,'project','project/related','card:'+target);assert.equal(w.query('backlinks:'+target).length,1);
  await w.setCardTag(path,(await w.card(path)).revision,'task',true);
  await assert.rejects(()=>w.reorderCardTags(path,(w.cardProperties(path)).revision,['task','task']),/valid tag/);
  await w.reorderCardTags(path,w.cardProperties(path).revision,['task','project/research']);assert.deepEqual(w.cardProperties(path).properties.tags,['task','project/research']);assert.equal(w.cardProperties(path).properties['project/priority'],3);assert.match(await w.read(path),/# Keep comment/);
  const original=await w.read(path);await w.reorderTagProperties(path,(await w.card(path)).revision,'project/research',['project/research/method','project/related','project/priority','project/status']);
  assert.ok((await w.read(path)).indexOf('project/related:')<(await w.read(path)).indexOf('project/status:'));assert.equal(w.cardProperties(path).properties['project/status'],'Done');assert.match(await w.read(path),/# Keep comment/);assert.equal((await w.read(path)).split('---')[2],original.split('---')[2]);
  const undo=new UndoHistory(),removed=await w.setCardTag(path,(await w.card(path)).revision,'project/research',false);undo.record('Remove tag',removed.edits);
  props=w.cardProperties(path);assert.equal(props.properties['project/research/method'],undefined);assert.equal(props.properties['project/priority'],3);assert.equal(props.properties.custom,'keep');assert.deepEqual(props.properties.tags,['task']);
  await undo.travel(false,changes=>w.write(changes));assert.equal(w.cardProperties(path).properties['project/research/method'],'Read');
  await undo.travel(true,changes=>w.write(changes));await w.setCardTag(path,(await w.card(path)).revision,'task',false);assert.equal(w.cardProperties(path).properties['project/status'],undefined);assert.equal(w.query('backlinks:'+target).length,0);
  await w.history.checkpoint('Tags');assert.ok((await w.history.changes((await w.history.list())[0].id)).some(c=>c.path.endsWith('.tag')));
  w.close();w=await Workspace.open(root,cache);assert.equal(w.snapshot().preferences?.tagColors?.project,'#c9838a');assert.equal(resolveTag(w.snapshot().tags!,'project/research').fields[0].propertyKey,'project/status');
  const external='---\ntag: external\nfields:\n  - key: date\n    type: date\n---\n';await fs.writeFile(join(root,'external.tag'),external);await w.refresh('external.tag');assert.ok(w.snapshot().tags!.some(t=>t.tag==='external'));
  tag=w.snapshot().tags!.find(t=>t.tag==='task')!;await w.saveTag(tag.path,tag.revision,[],['task']);assert.match(resolveTag(w.snapshot().tags!,'task').warnings.join(' '),/cycle/);
  await assert.rejects(()=>w.createTag('../escape'),/valid tag/);
});


test('Status groups and date ranges remain readable values, with validation and indexed round trips',async t=>{
  const status={key:'status',type:'status' as const,statusGroups:{todo:['Todo','Backlog'],inProgress:['Doing','Review'],done:['Done']},default:'Todo'};
  const date={key:'schedule',type:'date' as const};
  assert.deepEqual(fieldOptions(status),['Todo','Backlog','Doing','Review','Done']);validateFields([status,date]);
  assert.throws(()=>validateFields([{...status,statusGroups:{...status.statusGroups,done:['Todo']}}]),/Check property/);
  assert.throws(()=>validateFields([{...status,statusGroups:{todo:['Todo'],done:['Done']}}]),/Check property/);
  validateTagValue(status,'Review');assert.throws(()=>validateTagValue(status,'Unknown'),/Invalid value/);
  for(const value of ['2026-02-30','2026-09-30T25:00Z','2026-09-30T12:00',{start:'2026-09-30',end:'2026-09-29'},{start:'2026-09-30',end:'2026-09-30T12:00Z'},{start:'2026-09-30',end:'2026-10-01',extra:1}])assert.throws(()=>validateTagValue(date,value),/Invalid value/);
  validateTagValue(date,'2024-02-29');validateTagValue(date,{start:'2026-09-30T09:00:00-07:00',end:'2026-09-30T17:00:00Z'});
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-tag-dates-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Notes');await w.create('Notes','A',0,0);await w.createTag('task');const tag=w.snapshot().tags![0];await w.saveTag(tag.path,tag.revision,[status,date],[]);
  const path='Notes/A.md';await w.setCardTag(path,(await w.card(path)).revision,'task',true);
  const range={start:'2026-09-30',end:'2026-10-03'};const result=await w.setTagProperty(path,(await w.card(path)).revision,'task','task/schedule',range);
  assert.deepEqual(w.tagCards('task')[0].properties['task/schedule'],range);assert.match(await w.read(path),/task\/schedule:\n {2}start: 2026-09-30\n {2}end: 2026-10-03/);
  const undo=new UndoHistory();undo.record('Set dates',result.edits);await undo.travel(false,changes=>w.write(changes));assert.equal(w.cardProperties(path).properties['task/schedule'],null);await undo.travel(true,changes=>w.write(changes));assert.deepEqual(w.cardProperties(path).properties['task/schedule'],range);
  await w.setTagProperty(path,(await w.card(path)).revision,'task','task/status','Review');assert.equal(w.queryCards({properties:[{field:'task/status',op:'eq',value:'Review'}]}).length,1);
});


test('tag suggestions and global search reuse fuzzy bilingual indexing without indexing storage metadata',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-tag-search-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Notes');await w.create('Notes','A',0,0);await w.createTag('research');await w.createTag('旅行');
  const tag=w.snapshot().tags!.find(t=>t.tag==='research')!;await w.saveTag(tag.path,tag.revision,[{key:'location',type:'text'},{key:'cities',type:'multi-select',options:['Boston','上海']}],[]);
  const path='Notes/A.md';await w.setCardTag(path,w.cardProperties(path).revision,'research',true);await w.setTagProperty(path,w.cardProperties(path).revision,'research','research/location','臺北 Taipei');await w.setTagProperty(path,w.cardProperties(path).revision,'research','research/cities',['Boston','上海']);
  assert.equal(w.queryTags('researh')[0]?.tag,'research');assert.equal(w.queryTags('researh',['research']).length,0);assert.equal(w.queryTags('旅')[0]?.tag,'旅行');
  assert.throws(()=>w.queryTags('research',[],1000),/Invalid card query/);
  for(const query of ['researh','台北','taipai','Boston','上海'])assert.equal(w.queryCards({text:query})[0]?.path,path,query);
  const result=w.queryCards({text:'台北'})[0];assert.match(result.snippet,/research\/location: 臺北 Taipei/);assert.ok(result.highlights!.snippet.some(([start,end])=>result.snippet.slice(start,end)==='臺北'));
  assert.ok(w.searchWorkspace('researh').some(r=>'kind' in r&&r.kind==='tag'));assert.ok(w.searchWorkspace('researh').some(r=>'id' in r&&r.path===path));
  const raw=await w.read(path);await fs.writeFile(join(root,path),raw.replace('臺北 Taipei','京都 Kyoto').replace('card-id:', 'card-color: "#ff9876"\ncard-id:'));await w.refresh(path);
  assert.equal(w.queryCards({text:'台北'}).length,0);assert.equal(w.queryCards({text:'Kyoto'})[0]?.path,path);assert.equal(w.queryCards({text:'ff9876'}).length,0);assert.equal(w.queryCards({text:(await w.card(path)).id}).length,0);
  w.close();w=await Workspace.open(root,cache);assert.equal(w.queryCards({text:'Kyoto'})[0]?.path,path);assert.equal(w.queryTags('researh')[0]?.tag,'research');
  const deletion=await w.setCardTag(path,w.cardProperties(path).revision,'research',false),undo=new UndoHistory();undo.record('Remove tag',deletion.edits);assert.equal(w.queryCards({text:'Kyoto'}).length,0);await undo.travel(false,changes=>w.write(changes));assert.equal(w.queryCards({text:'Kyoto'})[0]?.path,path);
  await fs.unlink(join(root,tag.path));await w.scan();assert.equal(w.queryTags('researh').length,0);assert.equal(w.queryCards({text:'Kyoto'})[0]?.path,path);
});


test('default and optional tag properties are file-backed templates, with isolated schema edits and atomic card additions',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-tag-templates-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Notes');for(const name of ['Old','New','Later'])await w.create('Notes',name,0,0);await w.createTag('project');
  const tag=()=>w.snapshot().tags!.find(t=>t.tag==='project')!,props=(name:string)=>w.cardProperties('Notes/'+name+'.md');
  await w.saveTag(tag().path,tag().revision,[{key:'status',type:'text',default:'Todo'},{key:'empty',type:'text'},{key:'location',type:'text',optional:true,default:'Taipei'}],[]);
  await w.setCardTag('Notes/Old.md',props('Old').revision,'project',true);
  assert.equal(props('Old').properties['project/status'],'Todo');assert.equal(props('Old').properties['project/empty'],null);assert.equal(props('Old').properties['project/location'],undefined);
  const before=await w.read('Notes/Old.md');
  await w.saveTag(tag().path,tag().revision,[{key:'status',type:'text',default:'Doing'},{key:'empty',type:'text'},{key:'location',type:'text',optional:true,default:'Kyoto'},{key:'count',type:'number',default:0}],[]);
  assert.equal(await w.read('Notes/Old.md'),before);await w.setCardTag('Notes/Old.md',props('Old').revision,'project',true);assert.equal(await w.read('Notes/Old.md'),before);
  assert.deepEqual(cardTagFields(w.snapshot().tags!,'project',props('Old').properties).map(f=>f.key),['status','empty']);
  await w.setCardTag('Notes/New.md',props('New').revision,'project',true);assert.equal(props('New').properties['project/status'],'Doing');assert.equal(props('New').properties['project/count'],0);assert.equal(props('New').properties['project/location'],undefined);
  const add=await w.addTagProperty('Notes/Old.md',props('Old').revision,'project',tag().revision,{key:'budget',type:'number'},12),undo=new UndoHistory();undo.record('Add property',add.edits);
  assert.equal(add.edits.length,2);assert.equal(tag().fields.at(-1)!.optional,true);assert.equal(tag().fields.at(-1)!.default,undefined);assert.equal(props('Old').properties['project/budget'],12);assert.equal(props('New').properties['project/budget'],undefined);
  assert.ok(w.queryCards({properties:[{field:'project/budget',op:'eq',value:12}]}).some(c=>c.path==='Notes/Old.md'));
  await undo.travel(false,changes=>w.write(changes));assert.equal(props('Old').properties['project/budget'],undefined);assert.ok(!tag().fields.some(f=>f.key==='budget'));await undo.travel(true,changes=>w.write(changes));
  const stable=await w.read('Notes/Old.md'),schema=await w.read(tag().path);
  await assert.rejects(()=>w.addTagProperty('Notes/Old.md','stale','project',tag().revision,{key:'bad',type:'text'},'oops'),/External changes/);assert.equal(await w.read(tag().path),schema);assert.equal(await w.read('Notes/Old.md'),stable);
  await assert.rejects(()=>w.addTagProperty('Notes/Old.md',props('Old').revision,'project','stale',{key:'bad',type:'text'},'oops'),/External changes/);assert.equal(await w.read(tag().path),schema);
  await assert.rejects(()=>w.addTagProperty('Notes/Old.md',props('Old').revision,'project',tag().revision,{key:'budget',type:'number'},18),/Check property/);
  await w.setTagProperty('Notes/Old.md',props('Old').revision,'project','project/location',tag().fields.find(f=>f.key==='location')!.default!);assert.equal(props('Old').properties['project/location'],'Kyoto');assert.equal(await w.read(tag().path),schema);
  await w.saveTag(tag().path,tag().revision,tag().fields.filter(f=>f.key!=='budget'),[]);assert.equal(props('Old').properties['project/budget'],12);assert.ok(cardTagFields(w.snapshot().tags!,'project',props('Old').properties).some(f=>f.key==='budget'));
  await w.setTagProperty('Notes/Old.md',props('Old').revision,'project','project/budget',14);
  const keys=cardTagFields(w.snapshot().tags!,'project',props('Old').properties).map(f=>f.propertyKey).reverse();await w.reorderTagProperties('Notes/Old.md',props('Old').revision,'project',keys);assert.equal(props('Old').properties['project/count'],undefined);
  await w.setCardTag('Notes/Later.md',props('Later').revision,'project',true);assert.equal(props('Later').properties['project/location'],undefined);
  assert.throws(()=>validateFields([{key:'invalid',type:'text',optional:'yes'}]),/Check property/);
  w.close();w=await Workspace.open(root,cache);assert.equal(props('Old').properties['project/budget'],14);assert.equal(tag().fields.find(f=>f.key==='location')!.optional,true);assert.equal(props('New').properties['project/location'],undefined);
});
