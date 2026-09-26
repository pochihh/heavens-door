import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {activeAfterRemoval,moveTab,defaultDocks,findModule,moveModule,revealModule,resizeGroups,validateDocks,pane,openTab,splitPane,MAX_PANES,MAX_TABS,panes,type Layout,type ModuleId,type Docks} from '../src/layout';
import {readPreferences,writePreferences,defaultPreferences,validatePreferences} from '../src/core/preferences';
import {WorkspaceRegistry} from '../src/core/registry';
import {SideDock} from '../src/renderer/Docks';
import {useTabDrag} from '../src/renderer/tab-drag';

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

test('tab pointer drags preview activation, retain empty sources, respect dock families, and cancel without saving',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root')!);let current=defaultDocks(),writes=0;
  const first=pane('a'),second=pane('c');first.tabs=['a','b'];let documents=splitPane(first,first.id,'row',second),documentWrites=0;
  function Harness(){
    const [docks,setDocks]=useState(current),[layout,setLayout]=useState(documents);
    const commit=(next:Docks)=>{if(next===current)return;current=next;writes++;setDocks(next);};
    const tabs=useTabDrag((source,target)=>{
      if(source.family==='side')commit(moveModule(current,{module:source.key as ModuleId},{side:target.side!,group:target.group||undefined,position:target.position,beforeTab:target.before as ModuleId|undefined}));
      else{documents=moveTab(documents,source.group,target.group,source.key,target.before);documentWrites++;setLayout(documents);}
    });
    return <>{(['left','right'] as const).map(side=><SideDock key={side} side={side} docks={docks} drag={tabs.drag} onTabDrag={tabs.begin} onChange={commit} onPreview={setDocks} renderModule={m=><div>{m}</div>}/>)}{panes(layout).map(p=>{
      const active=tabs.drag?.group===p.id?activeAfterRemoval(p.tabs,p.active,tabs.drag.key):p.active;
      return <section key={p.id}><div data-tab-strip data-tab-family="main" data-tab-group={p.id}>{p.tabs.map(key=><div key={key} data-tab-key={key} className={'tab '+(active===key?'active-tab':'')}><button role="tab" onPointerDown={e=>tabs.begin(e,{family:'main',group:p.id,key})}>{key}</button></div>)}</div><div data-test-content={p.id}>{active}</div></section>;
    })}</>;
  }
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const el=this as HTMLElement;
    if(el.matches('[data-tab-strip],[data-tab-drop]')){
      if(el.hasAttribute('data-tab-drop')&&el.dataset.tabGroup)return rect(0,0,0,0);
      const main=el.dataset.tabFamily==='main',right=el.dataset.dockSide==='right';
      return rect(main?400:right?800:10,main?(el.dataset.tabGroup===first.id?40:300):(el.dataset.tabGroup==='saved'?240:40),main?220:320,34);
    }
    if(el.matches('[data-tab-key],.tab-drop-preview')){
      const parent=el.parentElement!,r=parent.getBoundingClientRect(),visible=[...parent.children].filter(e=>(e as HTMLElement).style.display!=='none');
      return rect(r.left+visible.indexOf(el)*80,r.top,80,34);
    }
    return rect(0,0,0,0);
  };
  const pointer=async(target:Element|Document,type:string,x:number,y:number,id=1)=>{await act(async()=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});target.dispatchEvent(event);});};
  const tab=(key:string)=>document.querySelector<HTMLElement>('.side-dock #tab-'+key)!;
  const escape=()=>act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  const mainTab=(group:string,key:string)=>[...document.querySelectorAll<HTMLElement>('[data-tab-family=main]')].find(e=>e.dataset.tabGroup===group)!.querySelector<HTMLElement>('[data-tab-key="'+key+'"] button')!;
  try{
    await act(async()=>root.render(<Harness/>));
    assert.equal(document.querySelector('[aria-label="Drag panel group"]'),null);
    await pointer(tab('whiteboards'),'pointerdown',30,50);await pointer(document,'pointermove',32,51);assert.equal(document.querySelector('.drag-phantom'),null,'ordinary clicks retain the 5px threshold');
    await pointer(document,'pointermove',100,180);
    assert.equal(document.querySelectorAll('.drag-phantom').length,1);assert.ok(document.querySelector('.tab-phantom.selected .module-tab-label'));
    assert.equal(tab('files').getAttribute('aria-selected'),'true','next source tab becomes active');
    assert.equal(writes,0);assert.ok(document.querySelector('[aria-label="Right dock drop target"]'));
    await pointer(document,'pointermove',440,50);assert.equal(document.querySelector('.tab-drop-preview'),null,'Side Dock tabs cannot enter Main Dock');
    await pointer(document,'pointerup',440,50);assert.equal(writes,0);assert.equal(tab('whiteboards').getAttribute('aria-selected'),'true');

    await pointer(tab('whiteboards'),'pointerdown',30,50);await pointer(document,'pointermove',850,50);
    assert.ok(document.querySelector('.collapsed-dock-target .tab-drop-preview.selected'));
    assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.top,'40px','Y is locked to the destination strip');
    await pointer(document,'pointerup',850,50);assert.equal(findModule(current,'whiteboards').side,'right');assert.equal(findModule(current,'files').group.active,'files');assert.equal(writes,1);assert.deepEqual(validateDocks(current),current);

    await pointer(tab('bookmarks'),'pointerdown',30,250);await pointer(document,'pointermove',200,180);
    assert.ok(document.querySelector('[data-group="saved"] [aria-label="Empty Tab Group"]'),'sole-tab source stays open');
    await pointer(document,'pointermove',30,250);assert.ok(document.querySelector('[data-group="saved"] .tab-drop-preview'));
    await pointer(document,'pointerup',30,250);assert.equal(findModule(current,'bookmarks').group.id,'saved');assert.equal(writes,1,'dropping back is a no-op');

    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',850,50);await escape();assert.equal(writes,1);assert.equal(findModule(current,'files').side,'left');assert.equal(document.querySelector('.drag-phantom'),null);
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',850,50);await pointer(document,'pointercancel',850,50);assert.equal(writes,1);

    await pointer(mainTab(first.id,'a'),'pointerdown',420,50);await pointer(document,'pointermove',440,310);
    assert.equal(document.querySelector('[data-test-content="'+first.id+'"]')?.textContent,'b');
    assert.ok(document.querySelector('[data-tab-group="'+second.id+'"] .tab-drop-preview.active-tab'));assert.equal(documentWrites,0);
    await pointer(document,'pointerup',440,310);assert.equal(panes(documents).find(p=>p.id===second.id)?.active,'a');assert.equal(documentWrites,1);
    await pointer(mainTab(first.id,'b'),'pointerdown',420,50);await pointer(document,'pointermove',440,180);assert.equal(document.querySelector('[data-test-content="'+first.id+'"]')?.textContent,'');
    await pointer(document,'pointermove',30,50);assert.equal(document.querySelector('.tab-drop-preview'),null,'Main Dock tabs cannot enter Side Docks');await pointer(document,'pointerup',30,50);assert.equal(documentWrites,1);
    await pointer(mainTab(first.id,'b'),'pointerdown',420,50);await pointer(document,'pointermove',440,310);await act(async()=>window.dispatchEvent(new dom.window.Event('blur')));assert.equal(documentWrites,1);
    assert.equal(document.querySelector('.drag-phantom'),null);assert.equal(document.querySelector('.tab-drop-preview'),null);assert.equal(document.body.classList.contains('tab-dragging'),false);
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',270,50);await pointer(document,'pointerup',270,50);
    assert.deepEqual(findModule(current,'files').group.tabs,['tags','search','files']);assert.equal(findModule(current,'files').group.active,'files');
    await pointer(tab('files'),'pointerdown',190,50);await pointer(document,'pointermove',30,50);await pointer(document,'pointerup',30,50);
    assert.deepEqual(findModule(current,'files').group.tabs,['files','tags','search'],'horizontal reordering works in both directions');
    await pointer(tab('tags'),'pointerdown',110,50);await pointer(document,'pointermove',850,50);
    assert.equal(document.querySelector('.tab-phantom')?.classList.contains('selected'),false,'inactive phantom keeps its original state');
    assert.ok(document.querySelector('.tab-drop-preview.selected .module-tab-label'),'destination preview still becomes active');
    assert.ok(parseFloat((document.querySelector('.tab-drop-preview') as HTMLElement).style.width)>=80,'active preview reserves label space');
    await escape();


  }finally{await act(async()=>root.unmount());dom.window.close();}
});
