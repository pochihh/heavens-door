import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {pane,panes,openTab,navigateTab,tabDocument,tabHistory,travelTab,mapPaneDocuments,updatePane,splitPane,moveTab,closeTab,removePane,restoreLayout} from '../src/layout';

test('ordinary reopening reuses a tab, splits can share a file, and layout restores',()=>{
  const first=pane('board:');
  let layout=openTab(first,first.id,'card:a');
  layout=openTab(layout,first.id,'card:a');
  assert.deepEqual(panes(layout)[0].tabs,['board:','card:a']);
  const second=pane('card:a');
  layout=splitPane(layout,first.id,'row',second);
  assert.equal(panes(layout).filter(p=>p.active==='card:a').length,2);
  layout=openTab(layout,first.id,'tag:Project.tag');
  layout=moveTab(layout,first.id,second.id,'tag:Project.tag','card:a');
  assert.deepEqual(panes(layout)[1].tabs,['tag:Project.tag','card:a']);
  layout=closeTab(layout,second.id,'tag:Project.tag');
  assert.equal(panes(layout)[1].active,'card:a');
  assert.deepEqual(restoreLayout(JSON.stringify(layout)),layout);
  assert.deepEqual(removePane(layout,first.id),panes(layout)[1]);
});

test('workspace settings, sub-whiteboard files and root migration preserve identities, assets and recovery',async t=>{
  const directory=await fs.mkdtemp(join(tmpdir(),'heavens-door-shell-'));
  const root=join(directory,'Workspace'),other=join(directory,'Other');
  await fs.mkdir(root);await fs.mkdir(other);await fs.mkdir(join(root,'assets'));
  await fs.writeFile(join(root,'assets','image.svg'),'<svg/>');
  let workspace=await Workspace.open(root,join(directory,'cache'));
  const second=await Workspace.open(other,join(directory,'other-cache'));
  t.after(async()=>{workspace.close();second.close();await fs.rm(directory,{recursive:true,force:true});});
  await workspace.create('','first',100,120);await workspace.create('','second',600,120);
  const card=await workspace.card('first.md');
  await workspace.saveCard(card.path,'# First\n\n![Figure](assets/image.svg)\n\n[Second](second.md)\n\n[Source](https://example.org)\n\n![Reference][figure]\n\n[figure]: assets/image.svg\n',card.revision);
  await workspace.createFolder('','Existing');
  await workspace.createFolder('Existing','Nested');
  await workspace.setPreferences({whiteboardInput:'trackpad',theme:'dark',titlePlaceholder:'Start a thought',starred:['card:'+card.id],icons:{['card:'+card.id]:'🔬'}});
  assert.equal(second.snapshot().preferences?.titlePlaceholder,'A new card');
  assert.equal(second.snapshot().preferences?.whiteboardInput,'auto','new workspaces start with automatic navigation');
  await assert.rejects(()=>workspace.setPreferences({whiteboardInput:'invalid' as never}),/Invalid whiteboard input mode/);
  await assert.rejects(()=>workspace.setPreferences({titlePlaceholder:'invalid\nprompt'}),/Invalid title placeholder/);
  assert.equal(second.snapshot().preferences?.theme,'system','another workspace keeps its own appearance');
  const mother=workspace.snapshot().boards.find(b=>b.folder==='')!;
  assert.ok(mother.cards.some(p=>p.folder==='Existing'));
  await workspace.create('Existing','reader',0,0);
  let reader=await workspace.card(join('Existing','reader.md'));
  await workspace.saveCard(reader.path,'[First](../first.md)',reader.revision);
  await assert.rejects(()=>workspace.migrateRoot(),/stable card link/);
  assert.equal((await workspace.card('first.md')).id,card.id,'an unsafe migration leaves root files untouched');
  reader=await workspace.card(reader.path);
  await workspace.saveCard(reader.path,'[First](card:'+card.id+')',reader.revision);
  const migrated=await workspace.migrateRoot();
  assert.equal(migrated.cards.find(c=>c.id===card.id)?.path,join('Notes','first.md'));
  const moved=await workspace.card(join('Notes','first.md'));
  assert.match(moved.body,/\.\.\/assets\/image\.svg/);
  assert.match(moved.body,/\[Second\]\(second\.md\)/);
  assert.match(moved.body,/https:\/\/example.org/);
  assert.equal(await fs.readFile(join(root,'assets','image.svg'),'utf8'),'<svg/>');
  assert.ok(migrated.boards.find(b=>b.folder==='')!.cards.every(p=>p.folder),'mother board contains only sub-whiteboards after migration');
  assert.equal(migrated.boards.find(b=>b.folder==='Notes')!.cards.find(p=>p.cardId===card.id)?.x,100);
  const nested=structuredClone(migrated.boards.find(b=>b.folder==='Existing')!);
  nested.cards.find(p=>p.folder===join('Existing','Nested'))!.x=420;
  await workspace.saveBoard(nested,nested.revision);
  assert.equal(workspace.snapshot().boards.find(b=>b.folder==='Existing')!.cards.find(p=>p.folder===join('Existing','Nested'))!.x,420);
  assert.ok((await fs.readdir(join(directory,'cache'))).some(name=>name.startsWith('migration-')));
  assert.ok((await workspace.history.list()).some(c=>c.label==='Before root cards migration'));
  workspace.close();workspace=await Workspace.open(root,join(directory,'cache'));
  assert.equal(workspace.snapshot().preferences?.theme,'dark');
  assert.equal(workspace.snapshot().preferences?.whiteboardInput,'trackpad','input mode survives closing and reopening the workspace');
  assert.equal(workspace.snapshot().preferences?.titlePlaceholder,'Start a thought');
  assert.deepEqual(workspace.snapshot().preferences?.starred,['card:'+card.id]);
  assert.equal(workspace.snapshot().boards.find(b=>b.folder==='Existing')!.cards.find(p=>p.folder)!.folder,join('Existing','Nested'));
});


test('new tabs stay in their group while explicit other-group navigation reuses or creates a split',()=>{
  const first=pane('board:'),same=navigateTab(first,first.id,'board:Ideas','same');
  assert.equal(tabDocument(panes(same.tree)[0]),'board:Ideas');assert.deepEqual(panes(same.tree)[0].tabs,['board:']);assert.equal(same.active,first.id);
  const beside=navigateTab(same.tree,first.id,'card:a','other');
  assert.equal(panes(beside.tree).length,2);assert.equal(beside.tree.type==='split'&&beside.tree.axis,'row');
  const reused=navigateTab(beside.tree,first.id,'board:Other','other');
  assert.equal(panes(reused.tree).length,2);assert.equal(reused.active,beside.active);
  assert.deepEqual(panes(reused.tree)[1].tabs,['card:a','board:Other']);
  assert.equal(navigateTab(reused.tree,beside.active,'board:','other').active,first.id);
  const current=navigateTab(first,first.id,'card:a','new');assert.equal(panes(current.tree).length,1);assert.deepEqual(panes(current.tree)[0].tabs,['board:','card:a']);
  const below=navigateTab(first,first.id,'card:a','other','column');assert.equal(below.tree.type==='split'&&below.tree.axis,'column');
});


test('whiteboard creation saves the cursor placement with the new board and undoes both together',async t=>{
  const directory=await fs.mkdtemp(join(tmpdir(),'heavens-door-placement-')),root=join(directory,'Workspace');await fs.mkdir(root);
  const workspace=await Workspace.open(root,join(directory,'cache'));
  t.after(async()=>{workspace.close();await fs.rm(directory,{recursive:true,force:true});});
  const created=await workspace.createFolder('','Ideas',{x:-120.5,y:640});
  const placement=created.snapshot.boards.find(b=>!b.folder)!.cards.find(p=>p.folder==='Ideas')!;
  assert.deepEqual([placement.x,placement.y],[-120.5,640]);assert.equal(created.edits.length,2);
  const nested=await workspace.createFolder('Ideas','Nested',{x:420,y:-250});
  await workspace.scan();assert.deepEqual(workspace.snapshot().boards.find(b=>b.folder==='Ideas')!.cards.map(p=>[p.x,p.y]),[[420,-250]],'coordinates persist across indexing');
  const {UndoHistory}=await import('../src/renderer/history'),undo=new UndoHistory();undo.record('Create whiteboard',nested.edits);
  await undo.travel(false,c=>workspace.write(c));assert.ok(!workspace.snapshot().boards.some(b=>b.folder===join('Ideas','Nested')));assert.equal(workspace.snapshot().boards.find(b=>b.folder==='Ideas')!.cards.length,0);
  await undo.travel(true,c=>workspace.write(c));assert.equal(workspace.snapshot().boards.find(b=>b.folder==='Ideas')!.cards[0].x,420);
  await assert.rejects(()=>workspace.createFolder('','Invalid',{x:NaN,y:0}),/Invalid whiteboard position/);
  await assert.rejects(()=>fs.stat(join(root,'Invalid')),/ENOENT/);
});


test('each tab retains bounded navigation through revisits, splits, moves, rename and restore',()=>{
  const start=pane('board:Ideas');let layout=navigateTab(start,start.id,'card:a','same').tree;
  const original=start.active;
  layout=openTab(layout,start.id,'board:Ideas');let current=panes(layout)[0];
  assert.notEqual(current.active,original,'a reused document key cannot steal the earlier tab history');
  const second=current.active;
  layout=navigateTab(layout,start.id,'card:a','same').tree;
  current=panes(layout)[0];assert.equal(current.tabs.length,2,'two independent tabs may visit the same document');
  layout=travelTab(layout,start.id,-1);assert.equal(tabDocument(panes(layout)[0]),'board:Ideas');
  layout=navigateTab(layout,start.id,'card:b','same').tree;
  assert.deepEqual(tabHistory(panes(layout)[0]).entries,['board:Ideas','card:b'],'a new visit truncates only this tab’s forward stack');
  layout=updatePane(layout,start.id,p=>({...p,active:original}));assert.equal(tabDocument(panes(layout)[0]),'card:a');
  layout=travelTab(layout,start.id,-1);layout=travelTab(layout,start.id,1);assert.equal(tabDocument(panes(layout)[0]),'card:a');
  const other=pane('board:Ideas');layout=splitPane(layout,start.id,'row',other);layout=moveTab(layout,start.id,other.id,original);
  const moved=panes(layout)[1];assert.equal(tabDocument(moved),'card:a');assert.notEqual(moved.active,original,'moving preserves both histories even when identifiers collide');
  assert.deepEqual(tabHistory(moved).entries,['board:Ideas','card:a']);assert.deepEqual(tabHistory(panes(layout)[0],second).entries,['board:Ideas','card:b']);
  layout=updatePane(layout,other.id,p=>mapPaneDocuments(p,key=>key==='board:Ideas'?'board:Renamed':key));layout=travelTab(layout,other.id,-1);
  assert.equal(tabDocument(panes(layout)[1]),'board:Renamed');assert.deepEqual(restoreLayout(JSON.stringify(layout)),layout);
  layout=closeTab(layout,other.id,panes(layout)[1].active);assert.equal(Object.keys(panes(layout)[1].history??{}).length,0);
  for(let i=0;i<120;i++)layout=navigateTab(layout,start.id,'card:'+i,'same').tree;
  assert.equal(tabHistory(panes(layout)[0]).entries.length,100);
  const broken=structuredClone(panes(layout)[0]);broken.history![broken.active].index=999;
  assert.deepEqual(panes(restoreLayout(JSON.stringify(broken)))[0].tabs,['board:']);
});


test('automatic whiteboard names use workspace settings and preserve existing entries',async t=>{
  const directory=await fs.mkdtemp(join(tmpdir(),'heavens-door-new-board-')),root=join(directory,'Workspace');await fs.mkdir(root);
  let workspace=await Workspace.open(root,join(directory,'cache'));
  t.after(async()=>{workspace.close();await fs.rm(directory,{recursive:true,force:true});});
  const created=await workspace.createFolder('',undefined,{x:125,y:-50});
  assert.ok(created.snapshot.boards.some(b=>b.folder==='A new board'));
  assert.deepEqual(created.snapshot.boards.find(b=>!b.folder)!.cards.map(p=>[p.folder,p.x,p.y]),[['A new board',125,-50]]);
  await workspace.createFolder('');
  assert.ok(workspace.snapshot().boards.some(b=>b.folder==='A new board 2'));
  await workspace.setPreferences({whiteboardName:'Ideas'});
  await fs.writeFile(join(root,'A new board','ideas'),'existing file');
  const nested=await workspace.createFolder('A new board',undefined,{x:10,y:20});
  assert.ok(nested.snapshot.boards.some(b=>b.folder===join('A new board','Ideas 2')));
  assert.equal(await fs.readFile(join(root,'A new board','ideas'),'utf8'),'existing file');
  await assert.rejects(()=>workspace.createFolder('A new board','Ideas 2'),/EEXIST/);
  for(const whiteboardName of ['', '../Outside', 'CON', 'bad/name'])await assert.rejects(()=>workspace.setPreferences({whiteboardName}),/Invalid new whiteboard name/);
  workspace.close();workspace=await Workspace.open(root,join(directory,'cache'));
  assert.equal(workspace.snapshot().preferences?.whiteboardName,'Ideas');
  await workspace.createFolder('');
  assert.ok(workspace.snapshot().boards.some(b=>b.folder==='Ideas'));
});
