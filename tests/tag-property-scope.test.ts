import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {TagInfo} from '../src/shared';
import {fieldOptions,resolveTag} from '../src/tags';
import {viewDisplayFields,viewPropertyTargets,queryTagScope,queryFields,newViewBlock,writeViewBlock} from '../src/view-block';
import {Workspace} from '../src/core/workspace';
import {UndoHistory} from '../src/renderer/history';

const definitions:TagInfo[]=[
  {tag:'readlater',name:'readlater',path:'tags/readlater.tag',revision:'r',inherits:[],overrides:[],fields:[{key:'status',label:'Status',type:'status',statusGroups:{todo:['New'],inProgress:['Reading'],done:['Done']},default:'New'}]},
  {tag:'todo',name:'todo',path:'tags/todo.tag',revision:'t',inherits:[],overrides:[],fields:[{key:'Status',type:'status',statusGroups:{todo:['Listed'],inProgress:['Today','This week','Pending'],done:['Done']},default:'Listed'}]},
];
test('a selected tag property never widens to unrelated same-name properties',()=>{
  const scope=queryTagScope({field:'tags',op:'contains',value:'todo'},['todo','readlater']);assert.deepEqual(scope,['todo']);assert.deepEqual(queryFields(definitions,scope).filter(f=>f.definition).map(f=>f.keys),[['todo/Status']]);
  for(const tags of [definitions,[...definitions].reverse()]){
    const todo=viewDisplayFields([['todo/Status']],tags);assert.equal(todo.length,1);assert.deepEqual(todo[0].keys,['todo/Status']);assert.deepEqual(fieldOptions(todo[0].definition!),['Listed','Today','This week','Pending','Done']);
    const reading=viewDisplayFields(['readlater/status'],tags);assert.deepEqual(reading[0].keys,['readlater/status']);assert.deepEqual(fieldOptions(reading[0].definition!),['New','Reading','Done']);
    assert.deepEqual(resolveTag(tags,'todo').fields.map(f=>f.propertyKey),['todo/Status']);
    const intentional=viewDisplayFields([['todo/Status','readlater/status']],tags);assert.equal(intentional.length,1);assert.deepEqual(new Set(intentional[0].keys),new Set(['todo/Status','readlater/status']));
    assert.equal(viewDisplayFields([['todo/Status','readlater/status']],tags,{mergeProperties:false,caseSensitive:false}).length,2);
  }
});
test('property write destinations use the explicit binding, including inherited namespaces',()=>{
  const child:TagInfo={tag:'paper',name:'paper',path:'tags/paper.tag',revision:'p',fields:[],inherits:['readlater'],overrides:[]},tags=[...definitions,child],properties={tags:['paper','todo'],'readlater/status':'Reading','todo/Status':'Today'};
  assert.deepEqual(viewPropertyTargets('todo/Status',tags,properties).map(t=>t.field.propertyKey),['todo/Status']);
  assert.deepEqual(viewPropertyTargets('readlater/status',tags,properties).map(t=>t.field.propertyKey),['readlater/status']);
  assert.deepEqual(new Set(viewPropertyTargets(['todo/Status','readlater/status'],tags,properties).map(t=>t.field.propertyKey)),new Set(['todo/Status','readlater/status']));
  for(const invalid of [[],['todo/Status','todo/Status'],Array(33).fill('todo/Status'),['todo/Status','missing/status']])assert.throws(()=>viewPropertyTargets(invalid,tags,properties));
});
test('indexed Todo columns and edits remain isolated from Read later, through moves, undo and reopen',async t=>{
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-tag-scope-')),root=join(folder,'notes'),cache=join(folder,'cache');await fs.mkdir(root);let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(folder,{recursive:true,force:true});});
  for(const definition of definitions){await w.createTag(definition.tag);const tag=w.snapshot().tags!.find(t=>t.tag===definition.tag)!;await w.saveTag(tag.path,tag.revision,definition.fields,[]);}
  await w.write([{path:'Task.md',expected:null,content:'---\ncard-id: task\ntags: [todo, readlater]\ntodo/Status: Today\nreadlater/status: Reading\ncustom: keep\n---\n# Task\n\nBody stays.\n'},{path:'Paper.md',expected:null,content:'---\ncard-id: paper\ntags: [readlater]\nreadlater/status: New\n---\n# Paper\n'}]);
  const block=newViewBlock('todo');block.views=[{id:'board',name:'Todo',type:'kanban',groupBy:['todo/Status'],fields:['file.title']}];const source=writeViewBlock('',block);
  await w.write([{path:'Query.md',expected:null,content:'---\ncard-id: query\n---\n# Tasks\n\n```view-block\n'+source+'```\n'}]);
  const current=()=>w.cardProperties('Task.md'),before=await w.read('Task.md'),beforePaper=await w.read('Paper.md'),owner=()=>({path:'Query.md',expected:w.cardProperties('Query.md').revision,source,block:0});
  let result=w.viewCards(source,'board');assert.deepEqual(result.rows.map(r=>r.card.id),['task']);assert.deepEqual(result.columns?.map(c=>c.value),['Today']);
  const changed=await w.setViewProperty('Task.md',current().revision,'todo/Status','Done'),undo=new UndoHistory();undo.record('Status',changed.edits);assert.equal(current().properties['readlater/status'],'Reading');await undo.travel(false,changes=>w.write(changes));assert.equal(await w.read('Task.md'),before);
  await w.moveViewCard({owner:owner(),view:'board',card:{path:'Task.md',expected:current().revision},from:'Today',to:'Listed'});assert.equal(current().properties['todo/Status'],'Listed');assert.equal(current().properties['readlater/status'],'Reading');
  const stable=await w.read('Task.md');await assert.rejects(w.setViewProperty('Task.md',current().revision,'todo/Status','New'),/Invalid value/);assert.equal(await w.read('Task.md'),stable);
  await w.setViewProperty('Task.md',current().revision,['todo/Status','readlater/status'],'Done');assert.equal(current().properties['todo/Status'],'Done');assert.equal(current().properties['readlater/status'],'Done');
  assert.equal(await w.read('Paper.md'),beforePaper);assert.equal(current().properties.custom,'keep');assert.match(await w.read('Task.md'),/Body stays\./);
  w.close();w=await Workspace.open(root,join(folder,'fresh-cache'));result=w.viewCards(source,'board');assert.deepEqual(result.columns?.map(c=>c.value),['Done']);assert.equal(w.cardProperties('Task.md').properties['readlater/status'],'Done');
});
