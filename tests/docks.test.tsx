import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {defaultDocks,findModule,moveModule,revealModule,resizeGroups,validateDocks,pane,openTab,splitPane,MAX_PANES,MAX_TABS,panes,type Layout,type DockDrag,type Docks} from '../src/layout';
import {readPreferences,writePreferences,defaultPreferences,validatePreferences} from '../src/core/preferences';
import {WorkspaceRegistry} from '../src/core/registry';
import {SideDock} from '../src/renderer/Docks';

test('module layouts keep every module once, persist per workspace, and registration removal keeps files',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'heavens-docks-')),one=join(root,'One'),two=join(root,'Two');await fs.mkdir(one);await fs.mkdir(two);
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const initial=defaultDocks();
  let layout=moveModule(initial,{module:'files'},{side:'right',group:'tools',position:'tab',beforeTab:'history'});
  assert.equal(findModule(layout,'files').side,'right');assert.equal(layout.right.collapsed,false);
  assert.deepEqual(layout.right.groups[0].tabs,['agent','files','history']);
  assert.deepEqual(moveModule(layout,{module:'files'},{side:'right',group:'tools',position:'tab',beforeTab:'files'}),layout);
  layout=moveModule(layout,{module:'files'},{side:'right',group:'tools',position:'after'});
  assert.equal(layout.right.groups.length,2);assert.deepEqual(layout.right.groups[1].tabs,['files']);
  layout=moveModule(layout,{group:'saved'},{side:'right',group:'tools',position:'before'});
  assert.equal(findModule(layout,'bookmarks').side,'right');assert.equal(layout.left.groups.length,1);
  layout=moveModule(layout,{group:'tools'},{side:'left',group:'navigation',position:'tab'});
  assert.deepEqual(findModule(layout,'agent').group.tabs,['whiteboards','tags','search','agent','history']);
  layout=resizeGroups(layout,'right',0,.7);assert.ok(Math.abs(layout.right.groups[0].weight/(layout.right.groups[0].weight+layout.right.groups[1].weight)-.7)<1e-10);
  layout.right.collapsed=true;layout=revealModule(layout,'files');assert.equal(layout.right.collapsed,false);assert.equal(findModule(layout,'files').group.active,'files');
  assert.deepEqual(validateDocks(layout),layout);assert.equal(initial.left.groups.length,2,'layout operations do not mutate their input');
  const broken=structuredClone(layout);broken.left.groups[0].tabs.push('files');assert.throws(()=>validateDocks(broken),/Duplicate/);
  const missing=structuredClone(layout);missing.right.groups=[];assert.throws(()=>validateDocks(missing),/Missing/);
  const full=pane('board:');full.tabs=Array.from({length:MAX_TABS},(_,i)=>'card:'+i);full.active=full.tabs[0];assert.deepEqual(openTab(full,full.id,'card:overflow'),full);
  let splits:Layout=pane('board:');for(let i=1;i<MAX_PANES;i++)splits=splitPane(splits,panes(splits)[0].id,'row',pane('board:'));assert.deepEqual(splitPane(splits,panes(splits)[0].id,'row',pane()),splits);
  const tree=pane('board:');
  await writePreferences(one,defaultPreferences(),{docks:layout,documents:{tree,active:tree.id,formatting:[],views:{[tree.id+':board:']:{camera:{x:80,y:50,zoom:1.2}}}},navigation:{files:{expanded:['','assets'],scroll:100}}});
  const restored=await readPreferences(one);assert.deepEqual(restored.docks,layout);assert.equal(restored.documents?.views[tree.id+':board:'].camera?.zoom,1.2);assert.deepEqual(restored.navigation?.files?.expanded,['','assets']);assert.equal((await readPreferences(two)).docks,undefined);
  const before=await fs.readFile(join(one,'.heavens-door/settings.json'),'utf8');await assert.rejects(()=>writePreferences(one,restored,{docks:broken}),/Duplicate/);assert.equal(await fs.readFile(join(one,'.heavens-door/settings.json'),'utf8'),before);
  assert.throws(()=>validatePreferences({...restored,navigation:{files:4}}),/Invalid module navigation/);
  assert.throws(()=>validatePreferences({...restored,documents:{...restored.documents,views:{bad:{camera:false}}}}),/Invalid document view/);
  const registry=new WorkspaceRegistry(join(root,'registered.json'));await registry.register(one);await registry.register(two);await registry.unregister(await fs.realpath(two));assert.equal((await registry.list()).length,1);assert.equal((await fs.stat(two)).isDirectory(),true);
});

test('dragging module tabs and whole groups moves them between equal docks and cancellation leaves the layout intact',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root')!);let current=defaultDocks(),writes=0;
  function Harness(){const [docks,setDocks]=useState(current),[drag,setDrag]=useState<DockDrag|null>(null);const commit=(next:Docks)=>{current=next;writes++;setDocks(next);};return <>{(['left','right'] as const).map(side=><SideDock key={side} side={side} docks={docks} drag={drag} onDrag={setDrag} onChange={commit} onPreview={setDocks} renderModule={m=><div>{m}</div>}/>)}</>;}
  const data={setData(){},effectAllowed:'',dropEffect:''};
  const event=async(selector:string,type:string)=>{const el=document.querySelector(selector);assert.ok(el,selector);await act(async()=>{const e=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:data});el.dispatchEvent(e);});};
  try{
    await act(async()=>root.render(<Harness/>));
    await event('[role=tab][aria-label="File explorer"]','dragstart');
    assert.ok(document.querySelector('[data-dock-drop="right:empty"]'),'a collapsed dock exposes a destination');
    await event('[data-dock-drop="right:empty"]','dragover');await event('[data-dock-drop="right:empty"]','drop');
    assert.equal(findModule(current,'files').side,'right');assert.equal(writes,1);
    await event('[data-group="saved"] [aria-label="Drag panel group"]','dragstart');
    await event('[data-group="tools"] .module-tab-strip','dragover');await event('[data-group="tools"] .module-tab-strip','drop');
    assert.equal(findModule(current,'bookmarks').side,'right');assert.equal(findModule(current,'bookmarks').group.id,'tools');assert.equal(current.left.groups.length,1);
    const before=structuredClone(current);
    await event('[role=tab][aria-label="Whiteboard explorer"]','dragstart');await event('[role=tab][aria-label="Whiteboard explorer"]','dragend');assert.deepEqual(current,before);assert.equal(writes,2);
    assert.deepEqual(validateDocks(current),current);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
