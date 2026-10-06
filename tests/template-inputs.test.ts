import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Workspace} from '../src/core/workspace';
import {splitNote,revision} from '../src/core/format';
import {DEFAULT_JOURNAL} from '../src/journal';
import {UndoHistory} from '../src/renderer/history';
import {systemGuidePath} from '../src/system-guides';

test('named inputs and nested includes preserve types, shared answers, links and undo',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-template-inputs-')),root=join(dir,'Notes');await fs.mkdir(root);
 const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 for(const folder of ['Templates','Sections'])await w.ensureFolder(folder);
 const main=`---
card-id: main
tags: [project]
project/Location: "{{input:project}}"
project/Priority: "{{input:priority}}"
project/Reviewed: "{{input:reviewed}}"
template:
  inputs:
    project:
      label: Project
    priority:
      type: number
      default: 3
    reviewed:
      type: checkbox
      default: false
    mood:
      options: [Good, Okay, Low]
      default: Okay
---
# {{title}}

Project: {{input:project}}
{{include:Sections/Review.md}}

![main](images/main.png)
`;
 const section=`---
card-id: section
unrelated: do not copy
---
## {{input:project}} review
Mood: {{input:mood}}
{{include:Sections/Checklist.md}}
<img src="images/review.png">
`;
 await w.write([{path:'Templates/Meeting.md',content:main,expected:null},{path:'Sections/Review.md',content:section,expected:null},{path:'Sections/Checklist.md',content:'- [ ] Review {{input:project}} on {{date}}\n',expected:null}]);
 const plan=await w.templatePlan('Templates/Meeting.md');assert.equal(plan.inputs.filter(i=>i.name==='project').length,1);assert.equal(plan.inputs.find(i=>i.name==='priority')?.type,'number');assert.equal(plan.inputs.find(i=>i.name==='mood')?.default,'Okay');
 await assert.rejects(()=>w.createFromTemplate('Templates/Meeting.md','Slipbox','Missing'),/Enter Project/);await assert.rejects(fs.access(join(root,'Slipbox/Missing.md')));
 const created=await w.createFromTemplate('Templates/Meeting.md','Slipbox','Planning',{project:'Robot "arm"',priority:4,reviewed:true}),path=created.edits[0].path,raw=await w.read(path),note=splitNote(raw);
 assert.equal(note.front.get('project/Location'),'Robot "arm"');assert.equal(note.front.get('project/Priority'),4);assert.equal(note.front.get('project/Reviewed'),true);assert.equal(note.front.has('template'),false);assert.equal(note.front.has('unrelated'),false);assert.notEqual(note.front.get('card-id'),'main');
 assert.match(note.body,/# Planning/);assert.match(note.body,/Project: Robot "arm"/);assert.match(note.body,/## Robot "arm" review/);assert.match(note.body,/Mood: Okay/);assert.match(note.body,/src="..\/Sections\/images\/review.png"/);assert.match(note.body,/!\[main\]\(..\/Templates\/images\/main.png\)/);assert.ok(!note.body.includes('{{'));
 const history=new UndoHistory();history.record('Template',created.edits);await history.travel(false,changes=>w.write(changes));await assert.rejects(fs.access(join(root,path)));await history.travel(true,changes=>w.write(changes));assert.equal(await w.read(path),raw);
 await w.write([{path:'Sections/Checklist.md',content:'Changed checklist\n',expected:revision(await w.read('Sections/Checklist.md'))}]);assert.equal(await w.read(path),raw,'includes are copied once');
 await w.setPreferences({journal:{...DEFAULT_JOURNAL,dailyTemplate:'Templates/Meeting.md',weeklyTemplate:'Templates/Meeting.md'}});
 const day=await w.openJournal('2026-10-04','daily',{project:'Daily'});assert.match(await w.read(day.path),/Review Daily on 2026-10-04|Changed checklist/);assert.equal(splitNote(await w.read(day.path)).front.toJSON().journal.date,'2026-10-04');assert.equal((await w.openJournal('2026-10-04','daily')).edits.length,0,'existing journals do not request inputs');
 await w.write([{path:'Sections/Checklist.md',content:'Selected date: {{date}}\n',expected:revision(await w.read('Sections/Checklist.md'))}]);const week=await w.openJournal('2026-10-08','weekly',{project:'Weekly'});assert.match(await w.read(week.path),/Selected date: 2026-10-05/);
 const literal=await w.createFromTemplate('Templates/Meeting.md','Slipbox','Literal',{project:'{{include:Missing.md}} {{date}}'});assert.match(await w.read(literal.edits[0].path),/Project: \{\{include:Missing.md\}\} \{\{date\}\}/,'answers are data, not another template expansion');
});

test('template errors stop creation before any note is written',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-template-errors-')),root=join(dir,'Notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});await w.ensureFolder('Templates');
 const set=async(path:string,content:string)=>{const previous=await w.read(path).catch(()=>null);await w.write([{path,content,expected:previous===null?null:revision(previous)}]);};
 await set('Templates/A.md','{{include:Templates/B.md}}');await assert.rejects(()=>w.templatePlan('Templates/A.md'),/Template not found: Templates\/B.md/);
 await set('Templates/B.md','{{include:Templates/A.md}}');await assert.rejects(()=>w.templatePlan('Templates/A.md'),/Circular template include/);
 await set('Templates/A.md','{{include:../Outside.md}}');await assert.rejects(()=>w.templatePlan('Templates/A.md'),/Invalid template include path/);
 await set('Templates/A.md','{{input:}}');await assert.rejects(()=>w.templatePlan('Templates/A.md'),/Invalid template input/);
 const spec=(options:string)=>'---\ntemplate:\n  inputs:\n    mood:\n      options: ['+options+']\n---\n{{input:mood}}\n';
 await set('Templates/A.md',spec('Good, Low')+'{{include:Templates/B.md}}');await set('Templates/B.md',spec('Good, Okay'));await assert.rejects(()=>w.templatePlan('Templates/A.md'),/Conflicting definitions/);
 await set('Templates/A.md',spec('Good, Low'));await assert.rejects(()=>w.createFromTemplate('Templates/A.md','Slipbox','Bad',{mood:'Other'}),/Choose an option/);await assert.rejects(fs.access(join(root,'Slipbox/Bad.md')));
});

test('special-folder guides are normal editable Markdown, created once in configured folders',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-guides-')),root=join(dir,'Notes');await fs.mkdir(root);let w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.setPreferences({templates:{folder:'Resources/Templates'},journal:{...DEFAULT_JOURNAL,folder:'Writing/Journal'},cardFolder:'Storage/Cards',tagsFolder:'Schemas/Tags'});
 for(const id of ['templates','journal','slipbox','tags','trash'] as const){
   const created=await w.ensureSystemGuide(id);assert.equal(created.path,systemGuidePath(id,w.snapshot().preferences));assert.equal(created.edits.length,1);assert.ok(w.snapshot().cards.some(c=>c.path===created.path));assert.ok(!created.edits.some(e=>e.path.endsWith('.whiteboard')));
   const card=await w.card(created.path);await w.saveCard(card.path,'# My '+id+' notes\n\nPersonal instructions.\n',card.revision);assert.equal((await w.ensureSystemGuide(id)).edits.length,0);assert.match((await w.card(created.path)).body,/Personal instructions/);
 }
 assert.equal((await w.trashEntries()).length,0);await w.scan();assert.ok(w.snapshot().cards.some(c=>c.path==='.heavens-door/trash/trash.md'));
 w.close();w=await Workspace.open(root,join(dir,'cache'));assert.match((await w.card((await w.ensureSystemGuide('templates')).path)).body,/Personal instructions/);
 await w.setPreferences({trashFolder:'Deleted'});const trash=await w.ensureSystemGuide('trash');assert.equal(trash.path,'Deleted/trash.md');assert.equal((await w.trashEntries()).length,0);
 await assert.rejects(()=>w.read('.heavens-door/trash/not-a-guide.md'),/Invalid workspace path/);
});
