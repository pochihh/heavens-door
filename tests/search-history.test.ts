import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Workspace } from '../src/core/workspace';
import { CardSearch, searchDocument, searchHighlights } from '../src/core/search';
import { newNote, revision, editCard, readCard } from '../src/core/format';

async function fixture(){const directory=await fs.mkdtemp(join(tmpdir(),'heavens-search-history-')),root=join(directory,'Workspace'),cache=join(directory,'cache');await fs.mkdir(root);return {directory,root,cache};}
const git=(root:string,args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();

test('fuzzy bilingual search and typed queries share updates, survive reopening and preserve original text',async t=>{
  const f=await fixture();let w=await Workspace.open(f.root,f.cache);
  t.after(async()=>{w.close();await fs.rm(f.directory,{recursive:true,force:true});});
  await w.createFolder('','Notes');await w.createFolder('Notes','Child');
  const write=async(path:string,body:string,props='')=>w.write([{path,content:`---\ncard-id: ${path.replace(/[^\w-]/g,'-')}\n${props}---\n${body}`,expected:null}]);
  await write('Notes/Traditional.md','# 機器學習\n\n繁體中文筆記，AI學習與知識管理。','tags: [research, project]\nstatus: active\npriority: 3\nflag: true\n');
  await write('Notes/Simplified.md','# 机器学习\n\n简体中文笔记，AI学习与知识管理。','tags: research\nstatus: draft\npriority: 1\n');
  await write('Notes/Child/English.md','# Neuroscience\n\nResearch notes about working memory. [Ref](card:Notes-Traditional-md)','tags: [research]\npriority: 10\n');
  await write('Notes/Body.md','# Unrelated heading\n\nNeuroscience appears only here.');
  assert.equal(w.queryCards({text:'neurosceince'})[0]?.name,'English');
  assert.equal(w.queryCards({text:'neurosc'})[0]?.name,'English');
  assert.equal(w.queryCards({text:'機器學習'})[0]?.name,'Traditional');
  assert.equal(w.queryCards({text:'机器学习'})[0]?.name,'Simplified');
  assert.deepEqual(new Set(w.queryCards({text:'机器学习'}).map(c=>c.name)),new Set(['Traditional','Simplified']));
  assert.equal(w.queryCards({text:'知识管理'}).length,2);
  assert.equal(w.queryCards({text:'AI 學習'}).length,2);
  assert.equal(w.queryCards({text:'學'}).length,2);
  assert.match(w.queryCards({text:'学习'}).find(c=>c.name==='Traditional')!.snippet,/學習/);
  assert.deepEqual(w.queryCards({text:'学习',tag:'research',properties:[{field:'priority',op:'gte',value:2}]}).map(c=>c.name),['Traditional']);
  assert.deepEqual(w.queryCards({properties:[{field:'flag',op:'eq',value:true}]}).map(c=>c.name),['Traditional']);
  assert.equal(w.queryCards({properties:[{field:'flag',op:'eq',value:1}]}).length,0);
  assert.equal(w.queryCards({folder:'Notes'}).length,3);assert.equal(w.queryCards({folder:'Notes',recursive:true}).length,4);
  assert.equal(w.queryCards({tag:'research'}).length,3);
  assert.equal(w.queryCards({backlinksTo:'Notes-Traditional-md'})[0]?.name,'English');
  assert.equal(w.queryCards({sort:'name',limit:1,offset:1})[0]?.name,'English');
  assert.throws(()=>w.queryCards({sort:'path; DROP TABLE cards' as never}),/Invalid card query/);
  assert.throws(()=>w.queryCards({properties:[{field:'x',op:'gt',value:'unsafe'}]}),/Invalid card query/);
  assert.deepEqual(w.queryCards({tag:"' OR 1=1 --"}),[]);
  const card=await w.card('Notes/Traditional.md'),raw=await w.read(card.path);
  await fs.writeFile(join(f.root,card.path),raw.replace('知識管理','外部更新'));await w.refresh(card.path);
  assert.equal(w.queryCards({text:'外部更新'}).length,1);assert.equal(w.queryCards({text:'知识管理'}).length,1);
  await fs.rename(join(f.root,'Notes/Body.md'),join(f.root,'Notes/Renamed.md'));await w.scan();
  assert.ok(!w.queryCards({text:'neuroscience'}).some(c=>c.path==='Notes/Body.md'));
  w.close();w=await Workspace.open(f.root,f.cache);
  assert.equal(w.queryCards({text:'外部更新'}).length,1);assert.match(await w.read(card.path),/機器學習/);
  await fs.unlink(join(f.root,card.path));await w.refresh(card.path);
  assert.equal(w.queryCards({text:'外部更新'}).length,0);assert.equal(w.queryCards({properties:[{field:'flag',op:'exists'}]}).length,0);
});

test('history preserves interface, trash and alternate futures; applies only a diverged checkpoint delta',async t=>{
  const f=await fixture();let w=await Workspace.open(f.root,f.cache);
  t.after(async()=>{w.close();await fs.rm(f.directory,{recursive:true,force:true});});
  const write=async(path:string,body:string)=>{let raw:string|null=null;try{raw=await w.read(path);}catch{ /* new card */ }return w.write([{path,content:raw===null?newNote()+body:editCard(raw,readCard(path,raw),body),expected:raw===null?null:revision(raw)}]);};
  await write('one.md','# Base\n\nOne');await write('two.md','# Base\n\nTwo');await w.history.checkpoint('A');
  const a=(await w.history.list()).find(c=>c.label==='A')!;
  await write('one.md','# Branch C');await w.history.checkpoint('C');const c=(await w.history.list()).find(c=>c.label==='C')!;
  await w.history.restore(a.id);await w.scan();await write('two.md','# Branch D');await w.history.checkpoint('D');const d=(await w.history.list()).find(c=>c.label==='D')!;
  await w.setPreferences({theme:'dark',starred:['card:missing']});
  const preferences=await fs.readFile(join(f.root,'.heavens-door/settings.json'),'utf8'),count=(await w.history.list()).length;
  await w.history.checkpoint('Settings are not content');assert.equal((await w.history.list()).length,count);
  const applied=await w.history.apply(c.id,d.id);await w.scan();
  assert.match((await w.card('one.md')).body,/Branch C/);assert.match((await w.card('two.md')).body,/Branch D/);
  assert.equal(git(f.root,['rev-parse','HEAD^']),d.id);assert.ok((await w.history.list()).some(h=>h.id===c.id));
  assert.equal(await fs.readFile(join(f.root,'.heavens-door/settings.json'),'utf8'),preferences);
  assert.deepEqual((await w.history.changes(applied)).map(change=>change.path),['one.md']);
  await assert.rejects(()=>w.history.apply(d.id,applied),/diverged/);
  await w.history.restore(a.id);await w.scan();await write('one.md','# Conflicting branch E');await w.history.checkpoint('E');const e=(await w.history.list()).find(c=>c.label==='E')!;
  const before=await w.read('one.md');await assert.rejects(()=>w.history.apply(c.id,e.id),/conflict/);
  assert.equal(await w.read('one.md'),before);assert.equal(git(f.root,['rev-parse','HEAD']),e.id);assert.equal(git(f.root,['status','--porcelain']),'');
  assert.ok(!git(f.root,['ls-files']).includes('settings.json'));
  await w.createFolder('','Notes');await w.create('Notes','trash-test',0,0);
  const board=w.snapshot().boards.find(b=>b.folder==='Notes')!;
  await w.history.checkpoint('Before deletion');const deletion=await w.prepareDeletion(board.path,[board.cards[0].id],[],board.revision);await w.write(deletion.changes);await w.history.checkpoint('Deleted card');
  assert.ok(git(f.root,['ls-files']).includes('.heavens-door/trash/'));
  w.close();w=await Workspace.open(f.root,f.cache);assert.ok((await w.history.list()).some(h=>h.id===applied));
  assert.equal(w.snapshot().preferences?.theme,'dark');
});

test('legacy checkpoints cannot roll back layout, and interrupted interface restoration recovers on open',async t=>{
  const f=await fixture();let w=await Workspace.open(f.root,f.cache);
  t.after(async()=>{w.close();await fs.rm(f.directory,{recursive:true,force:true});});
  await w.create('','one',0,0);await w.setPreferences({theme:'light'});
  git(f.root,['add','--all']);git(f.root,['add','-f','.heavens-door/settings.json']);
  git(f.root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','Legacy']);const old=git(f.root,['rev-parse','HEAD']);
  await w.setPreferences({theme:'dark'});const expected=await fs.readFile(join(f.root,'.heavens-door/settings.json'),'utf8');
  await w.history.restore(old);await w.scan();assert.equal(w.snapshot().preferences?.theme,'dark');
  await w.history.checkpoint('Exclude legacy layout');assert.ok(!git(f.root,['ls-files']).includes('settings.json'));
  await w.history.restore(old);await w.scan();assert.equal(w.snapshot().preferences?.theme,'dark');
  await fs.writeFile(join(f.root,'.git/heavens-door-interface.json'),JSON.stringify({content:expected}));await fs.writeFile(join(f.root,'.heavens-door/settings.json'),expected.replace('dark','light'));
  w.close();w=await Workspace.open(f.root,f.cache);assert.equal(w.snapshot().preferences?.theme,'dark');await assert.rejects(()=>fs.stat(join(f.root,'.git/heavens-door-interface.json')),/ENOENT/);
});


test('search previews strip Markdown, find local embedded images and highlight original Chinese text',()=>{
  const preview=searchDocument(`# Robot

A **robot** with [a camera](https://example.com).

![Robot photo](../assets/robot.png)

- one
- two`);
  assert.match(preview.text,/A robot with a camera/);assert.ok(!preview.text.includes('**'));assert.ok(!preview.text.includes('https://'));
  assert.equal(preview.image,'../assets/robot.png');
  assert.equal(searchDocument('<img src="assets/photo.jpg" alt="photo"><script>danger()</script>').image,'assets/photo.jpg');
  assert.equal(searchDocument('![remote](https://example.com/photo.jpg)').image,undefined);
  assert.equal(searchDocument('<script>danger()</script>').text,'');
  const text='機器學習與 robotics';const spans=searchHighlights(text,['机器','学习','robot']);
  assert.deepEqual(spans.map(([a,b])=>text.slice(a,b)),['機器學習','robot']);
  assert.deepEqual(searchHighlights('ﬃ test',['ffi']),[[0,1]]);
});


test('default text search ignores storage attributes, link destinations and hidden comments',()=>{
  const index=new CardSearch();
  index.update({path:'Notes/Robot.md',name:'Robot',title:'Robot vision',body:`# Robot vision

A camera on the robot. Position is a useful word in this paragraph.

[Reference](card:internal_target_8675309)
<img src="assets/asset_secret_name.png" width="7654321" data-x="coordinate_secret" data-card-id="opaque_identity" alt="Visible caption">
<!-- hidden_storage_comment -->`});
  assert.equal(index.search('camera').length,1);assert.equal(index.search('position').length,1);assert.equal(index.search('Reference').length,1);assert.equal(index.search('caption').length,1);
  for(const text of ['internal_target_8675309','asset_secret_name','7654321','coordinate_secret','opaque_identity','hidden_storage_comment'])assert.equal(index.search(text).length,0,text);
});
