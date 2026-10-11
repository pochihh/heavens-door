import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {activeAfterRemoval,moveTab,defaultDocks,findModule,moveModule,closeModule,revealModule,resizeGroups,validateDocks,pane,openTab,splitPane,MAX_PANES,MAX_TABS,panes,type Layout,type ModuleId,type Docks} from '../src/layout';
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
  assert.deepEqual(layout.right.groups[0].tabs,['calendar','graph','style','agent','files','history']);
  assert.deepEqual(moveModule(layout,{module:'files'},{side:'right',group:'tools',position:'tab',beforeTab:'files'}),layout);
  layout=moveModule(layout,{module:'files'},{side:'right',group:'tools',position:'after'});
  assert.equal(layout.right.groups.length,2);assert.deepEqual(layout.right.groups[1].tabs,['files']);
  layout=moveModule(layout,{group:'saved'},{side:'right',group:'tools',position:'before'});
  assert.equal(findModule(layout,'bookmarks').side,'right');assert.equal(layout.left.groups.length,1);
  layout=moveModule(layout,{group:'tools'},{side:'left',group:'navigation',position:'tab'});
  assert.deepEqual(findModule(layout,'agent').group.tabs,['whiteboards','tags','search','calendar','graph','style','agent','history']);
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
  let closed=closeModule(initial,'whiteboards');
  assert.equal(findModule(closed,'files').group.active,'files');assert.deepEqual(validateDocks(closed),closed);
  closed=closeModule(closed,'search');assert.equal(findModule(closed,'files').group.active,'files','closing an inactive View preserves selection');
  closed=closeModule(closed,'bookmarks');assert.equal(closed.left.groups.length,1,'closing the sole tab removes its group');
  await writePreferences(two,defaultPreferences(),{docks:closed});
  const savedClosed=(await readPreferences(two)).docks!;assert.deepEqual(savedClosed,closed);
  const reopened=revealModule(savedClosed,'bookmarks');assert.equal(findModule(reopened,'bookmarks').group.id,'saved');assert.equal(findModule(reopened,'bookmarks').group.weight,38);
  assert.deepEqual(findModule(revealModule(revealModule(reopened,'search'),'whiteboards'),'whiteboards').group.tabs,initial.left.groups[0].tabs);
  const duplicate=structuredClone(closed);duplicate.closed!.files=duplicate.closed!.whiteboards;assert.throws(()=>validateDocks(duplicate),/Invalid closed View/);
  const invalid=structuredClone(closed);invalid.closed!.whiteboards!.index=-1;assert.throws(()=>validateDocks(invalid),/Invalid closed View/);
  for(const module of ['files','tags','agent','history','style','calendar','graph'] as const)closed=closeModule(closed,module);
  assert.equal(closed.left.collapsed,true);assert.equal(closed.right.collapsed,true);assert.deepEqual(validateDocks(closed),closed);
  assert.equal(revealModule(closed,'history').right.collapsed,false,'Action Ribbon can reopen a View after all tabs are closed');
  const registry=new WorkspaceRegistry(join(root,'registered.json'));await registry.register(one);await registry.register(two);await registry.unregister(await fs.realpath(two));assert.equal((await registry.list()).length,1);assert.equal((await fs.stat(two)).isDirectory(),true);
});

test('tab pointer drags preserve empty sources until commit, respect dock families, and cancel without saving',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,innerWidth:1200,innerHeight:800,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root')!);let current=defaultDocks(),writes=0;
  current.left.groups[0].weight=.31;current.left.groups[1].weight=.19;current.right.groups[0].weight=.25;
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
      if(el.classList.contains('dock-split-target'))return rect(el.dataset.dockSide==='right'?800:10,el.dataset.tabGroup==='saved'?320:120,320,40);
      const main=el.dataset.tabFamily==='main',right=el.dataset.dockSide==='right';
      return rect(main?400:right?800:10,main?(el.dataset.tabGroup===first.id?40:300):(el.dataset.tabGroup==='saved'?240:40),main?220:320,34);
    }
    if(el.matches('[data-tab-key],.tab-drop-preview')){
      const parent=el.parentElement!,r=parent.getBoundingClientRect(),visible=[...parent.children].filter(e=>(e as HTMLElement).style.display!=='none');
      return rect(r.left+visible.indexOf(el)*80,r.top,parseFloat(el.style.width)||(el.dataset.tabKey==='bookmarks'?320:80),34);
    }
    return rect(0,0,0,0);
  };
  const pointer=async(target:Element|Document,type:string,x:number,y:number,id=1)=>{await act(async()=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});target.dispatchEvent(event);});};
  const tab=(key:string)=>document.querySelector<HTMLElement>('.side-dock #tab-'+key)!;
  const escape=()=>act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  const mainTab=(group:string,key:string)=>[...document.querySelectorAll<HTMLElement>('[data-tab-family=main]')].find(e=>e.dataset.tabGroup===group)!.querySelector<HTMLElement>('[data-tab-key="'+key+'"] button')!;
  try{
    await act(async()=>root.render(<Harness/>));
    assert.equal([...document.querySelectorAll<HTMLElement>('.left-dock>.panel-group')].reduce((sum,g)=>sum+Number(g.style.flexGrow),0),1,'fractional saved weights consume the full dock height');
    assert.equal(document.querySelector('[aria-label="Drag panel group"]'),null);
    await pointer(tab('whiteboards'),'pointerdown',30,50);await pointer(document,'pointermove',32,51);assert.equal(document.querySelector('.drag-phantom'),null,'ordinary clicks retain the 5px threshold');
    await pointer(document,'pointermove',100,180);
    assert.equal(document.querySelectorAll('.drag-phantom').length,1);assert.ok(document.querySelector('.tab-phantom.selected .module-tab-label'));
    assert.equal(tab('files').getAttribute('aria-selected'),'true','next source tab becomes active');
    assert.equal(writes,0);assert.ok(document.querySelector('[aria-label="Right Side Dock drop target"]'));
    await pointer(document,'pointermove',440,50);assert.equal(document.querySelector('.tab-drop-preview'),null,'Side Dock tabs cannot enter Main Dock');
    await pointer(document,'pointerup',440,50);assert.equal(writes,0);assert.equal(tab('whiteboards').getAttribute('aria-selected'),'true');

    await pointer(tab('whiteboards'),'pointerdown',30,50);await pointer(document,'pointermove',850,50);
    assert.ok(document.querySelector('.collapsed-dock-target .tab-drop-preview.selected'));
    assert.equal(getComputedStyle(document.querySelector('.tab-drop-preview')!).visibility,'hidden','another group also shows only the phantom');
    assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.top,'40px','Y is locked to the destination strip');
    await pointer(document,'pointerup',850,50);assert.equal(findModule(current,'whiteboards').side,'right');assert.equal(findModule(current,'files').group.active,'files');assert.equal(writes,1);assert.deepEqual(validateDocks(current),current);

    await pointer(tab('bookmarks'),'pointerdown',30,250);await pointer(document,'pointermove',200,180);
    assert.ok(document.querySelector('[data-group="saved"] [aria-label="Empty Tab Group"]'),'sole-tab source stays open');
    await pointer(document,'pointermove',30,250);assert.ok(document.querySelector('[data-group="saved"] .tab-drop-preview'));
    assert.equal(getComputedStyle(document.querySelector('.tab-drop-preview')!).visibility,'hidden','returning to the source restores an empty insertion slot');
    await pointer(document,'pointerup',30,250);assert.equal(findModule(current,'bookmarks').group.id,'saved');assert.equal(writes,1,'dropping back is a no-op');

    await pointer(tab('bookmarks'),'pointerdown',30,250);await pointer(document,'pointermove',30,50);
    assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.width,'80px','a full-width lone tab fits beside the target tabs');
    assert.equal((document.querySelector('.tab-drop-preview') as HTMLElement).style.width,'80px');
    assert.equal(getComputedStyle(document.querySelector('.tab-drop-preview')!).visibility,'hidden');
    assert.ok(document.querySelector('[data-group="saved"] [aria-label="Empty Tab Group"]'));
    await pointer(document,'pointermove',30,250);assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.width,'320px','returning restores the original width');
    await escape();

    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',850,50);await escape();assert.equal(writes,1);assert.equal(findModule(current,'files').side,'left');assert.equal(document.querySelector('.drag-phantom'),null);
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',850,50);await pointer(document,'pointercancel',850,50);assert.equal(writes,1);

    await pointer(mainTab(first.id,'b'),'pointerdown',500,50);await pointer(document,'pointermove',440,310);
    assert.ok(document.querySelector('.tab-phantom.active-tab'),'inactive Main Dock tabs lift with active styling');
    assert.equal(document.querySelector('[data-test-content="'+first.id+'"]')?.textContent,'a','inactive Main Dock drags preserve source selection');
    await escape();assert.equal(documentWrites,0);
    assert.equal(mainTab(first.id,'b').parentElement!.classList.contains('active-tab'),false);
    await pointer(mainTab(first.id,'a'),'pointerdown',420,50);await pointer(document,'pointermove',440,310);
    assert.equal(document.querySelector('[data-test-content="'+first.id+'"]')?.textContent,'b');
    assert.ok(document.querySelector('[data-tab-group="'+second.id+'"] .tab-drop-preview.active-tab'));assert.equal(documentWrites,0);
    await pointer(document,'pointerup',440,310);assert.equal(panes(documents).find(p=>p.id===second.id)?.active,'a');assert.equal(documentWrites,1);
    await pointer(mainTab(first.id,'b'),'pointerdown',420,50);await pointer(document,'pointermove',440,180);assert.equal(document.querySelector('[data-test-content="'+first.id+'"]')?.textContent,'');
    await pointer(document,'pointermove',30,50);assert.equal(document.querySelector('.tab-drop-preview'),null,'Main Dock tabs cannot enter Side Docks');await pointer(document,'pointerup',30,50);assert.equal(documentWrites,1);
    await pointer(mainTab(first.id,'b'),'pointerdown',420,50);await pointer(document,'pointermove',440,310);await act(async()=>window.dispatchEvent(new dom.window.Event('blur')));assert.equal(documentWrites,1);
    assert.equal(document.querySelector('.drag-phantom'),null);assert.equal(document.querySelector('.tab-drop-preview'),null);assert.equal(document.body.classList.contains('tab-dragging'),false);
    assert.ok(document.querySelector('[data-test-content="'+first.id+'"]'),'cancel retains the source pane');
    await pointer(mainTab(first.id,'b'),'pointerdown',420,50);await pointer(document,'pointermove',440,310);assert.ok(document.querySelector('[data-test-content="'+first.id+'"]'),'preview retains the empty source');await pointer(document,'pointerup',440,310);assert.equal(panes(documents).length,1);assert.equal(panes(documents)[0].id,second.id);assert.equal(document.querySelector('[data-test-content="'+first.id+'"]'),null,'committing the last tab move closes the source');assert.equal(documentWrites,2);
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',270,50);await pointer(document,'pointerup',270,50);
    assert.deepEqual(findModule(current,'files').group.tabs,['tags','search','files']);assert.equal(findModule(current,'files').group.active,'files');
    await pointer(tab('files'),'pointerdown',190,50);await pointer(document,'pointermove',30,50);await pointer(document,'pointerup',30,50);
    assert.deepEqual(findModule(current,'files').group.tabs,['files','tags','search'],'horizontal reordering works in both directions');
    await pointer(tab('tags'),'pointerdown',110,50);await pointer(document,'pointermove',850,50);
    assert.ok(document.querySelector('.tab-phantom.selected .module-tab-label'),'inactive tabs lift with an active icon + name phantom');
    assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.transition,'width var(--motion-normal) var(--motion-ease)');
    assert.equal((document.querySelector('.tab-phantom .module-tab-label') as HTMLElement).style.width,'auto','the name can expand beyond its initial icon-only width');
    assert.equal(tab('files').getAttribute('aria-selected'),'true','lifting an inactive tab preserves source selection');
    assert.equal(getComputedStyle(document.querySelector('.tab-drop-preview')!).visibility,'hidden','inactive drags also keep the destination slot empty');
    assert.equal((document.querySelector('.tab-drop-preview') as HTMLElement).style.width,(document.querySelector('.tab-phantom') as HTMLElement).style.width,'slot and phantom have matching widths');
    await escape();
    assert.equal(tab('tags').getAttribute('aria-selected'),'false','cancel restores the inactive tab');
    assert.equal(tab('files').getAttribute('aria-selected'),'true');
    await act(async()=>{tab('tags').focus();tab('tags').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}));});
    assert.ok(document.querySelector('[role=menu][aria-label="Tab Group actions"]'));
    assert.equal(tab('files').getAttribute('aria-selected'),'true','opening an inactive tab menu does not select it');
    await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(e=>e.textContent==='Move View to Right Side Dock')!.click());
    assert.equal(findModule(current,'tags').side,'right','context commands target the clicked tab');
    assert.equal(findModule(current,'files').side,'left');

    const beforeSplit=current,previousWrites=writes;
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',50,85);
    assert.equal(document.querySelector('.dock-drop-zone'),null,'top and bottom split zones are removed');
    assert.equal(document.querySelector('[data-tab-drop][data-tab-preview]'),null,'below the header is not a split target');
    assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.top,'75px','the phantom does not snap to the header bottom');
    await pointer(document,'pointerup',50,85);assert.equal(current,beforeSplit);assert.equal(writes,previousWrites);
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',100,140);
    assert.ok(document.querySelector('[data-group=navigation] .dock-split-target[data-tab-preview]'),'middle target shows the divider');
    assert.equal(document.querySelector('.tab-drop-preview'),null,'splitting never creates a second tab preview');
    assert.equal((document.querySelector('.tab-phantom') as HTMLElement).style.top,'130px','the split phantom follows the pointer');
    assert.equal(writes,previousWrites,'preview does not save');
    await pointer(document,'pointermove',100,180);assert.equal(document.querySelector('.dock-split-target[data-tab-preview]'),null,'leaving clears the divider');
    await pointer(document,'pointermove',100,140);await escape();assert.equal(current,beforeSplit);
    assert.equal(document.querySelector('.dock-split-target'),null,'cancel removes split targets');
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',100,140);await pointer(document,'pointerup',100,140);
    assert.deepEqual(current.left.groups.slice(0,2).map(g=>g.tabs),[['search'],['files']]);
    assert.equal(current.left.groups[0].weight,current.left.groups[1].weight,'new group takes half the destination weight');
    assert.equal(current.left.groups[1].active,'files');assert.equal(writes,previousWrites+1);
    const soleGroup=findModule(current,'files').group.id;
    await pointer(tab('files'),'pointerdown',30,50);await pointer(document,'pointermove',100,180);
    assert.equal(document.querySelector('[data-group="'+soleGroup+'"] .dock-split-target'),null,'a lone tab cannot split its own empty group');await escape();
    await pointer(tab('bookmarks'),'pointerdown',30,250);await pointer(document,'pointermove',850,140);
    assert.ok(document.querySelector('.right-dock .dock-split-target[data-tab-preview]'));
    await pointer(document,'pointerup',850,140);
    assert.equal(document.querySelector('[data-group=saved]'),null,'the empty source disappears after a cross-dock split');
    assert.deepEqual(current.right.groups[1].tabs,['bookmarks']);assert.equal(current.right.groups[1].active,'bookmarks');
    assert.equal(current.right.groups[0].weight,current.right.groups[1].weight);assert.deepEqual(validateDocks(current),current);

  }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('wide tabs reorder by their leading edge regardless of grab offset in dock and view tab strips',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,innerWidth:1200,innerHeight:800,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root')!);let order:string[]=[],writes=0;
  function Harness({family,initial}:{family:'side'|'main'|'view';initial:string[]}){
    const [keys,setKeys]=useState(initial);
    const tabs=useTabDrag((source,target)=>{order=keys.filter(key=>key!==source.key);const index=target.before?order.indexOf(target.before):order.length;order.splice(index,0,source.key);writes++;setKeys(order);});
    return <div data-tab-strip data-tab-family={family} data-tab-group="group">{keys.map(key=><button key={key} data-tab-key={key} onPointerDown={e=>tabs.begin(e,{family,group:'group',key})}>{key}</button>)}</div>;
  }
  // These tabs fit inside the 600px strip; native scrolling stays at zero.
  Object.defineProperty(dom.window.HTMLElement.prototype,'scrollLeft',{get:()=>0,set:()=>{}});
  const width=(el:HTMLElement)=>parseFloat(el.style.width)||(el.dataset.tabKey==='wide'?180:32);
  const rect=(left:number,size:number)=>({left,top:40,width:size,height:34,right:left+size,bottom:74,x:left,y:40,toJSON(){}});
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
    const el=this as HTMLElement;if(el.hasAttribute('data-tab-strip'))return rect(10,600);
    const siblings=[...el.parentElement!.children].filter(e=>(e as HTMLElement).style.display!=='none'),index=siblings.indexOf(el);
    return rect(10+siblings.slice(0,index).reduce((x,e)=>x+width(e as HTMLElement)+2,0),width(el));
  };
  const pointer=(target:Element|Document,type:string,x:number)=>act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:50});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);});
  const previewOrder=()=>[...document.querySelector('[data-tab-strip]')!.children].filter(el=>(el as HTMLElement).style.display!=='none').map(el=>el.textContent);
  try{
    for(const family of ['side','main','view'] as const)for(const direction of [1,-1])for(const offset of [8,172]){
      const initial=direction>0?['wide','b','c']:['b','c','wide'];order=initial;writes=0;
      await act(async()=>root.render(<Harness key={family+direction+offset} family={family} initial={initial}/>));
      const source=document.querySelector<HTMLElement>('[data-tab-key=wide]')!,start=source.getBoundingClientRect().left+offset;
      await pointer(source,'pointerdown',start);await pointer(document,'pointermove',start+direction*5);
      assert.deepEqual(previewOrder(),initial,'lifting at either end preserves the source slot');
      assert.equal(getComputedStyle(document.querySelector('.tab-drop-preview')!).visibility,'hidden','only the phantom is visible while reordering within the source group');
      assert.equal(getComputedStyle(document.querySelector('.tab-phantom')!).visibility,'visible');
      await pointer(document,'pointermove',start+direction*13);
      assert.deepEqual(previewOrder(),['b','wide','c'],'the tab edge crosses its neighbor while the cursor stays inside the wide tab');
      await pointer(document,'pointermove',start+direction*45);
      const moved=direction>0?['b','c','wide']:['wide','b','c'];assert.deepEqual(previewOrder(),moved);
      assert.equal(writes,0,'edge previews do not persist');
      await pointer(document,'pointermove',start);assert.deepEqual(previewOrder(),initial,'reversing uses the opposite boundary');
      await pointer(document,'pointermove',start+direction*45);await pointer(document,'pointerup',start+direction*45);
      assert.deepEqual(order,moved);assert.equal(writes,1);
    }
  }finally{await act(async()=>root.unmount());dom.window.close();}
});


test('Side Dock preview tabs retain the shared size and label transitions while dragging',async()=>{
  const css=await fs.readFile(new URL('../src/renderer/styles.css',import.meta.url),'utf8');
  const dom=new JSDOM(`<style>${css}</style><body class="tab-dragging"><div class="app docking"><div data-tab-preview><button class="module-tab selected"><span class="module-tab-label">Previous View</span></button></div></div></body>`);
  try{
    const tab=dom.window.document.querySelector('.module-tab')!,label=tab.querySelector('.module-tab-label')!;
    const tabStyle=dom.window.getComputedStyle(tab),labelStyle=dom.window.getComputedStyle(label);
    assert.match(tabStyle.transition,/flex-basis var\(--motion-normal\) var\(--motion-ease\)/);
    assert.match(labelStyle.transition,/opacity var\(--motion-fast\) var\(--motion-ease\)/);
    assert.equal(tabStyle.flexBasis,'32px');assert.equal(labelStyle.opacity,'0','preview collapses the previous active label through its normal transition');
  }finally{dom.window.close();}
});
