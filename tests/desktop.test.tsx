import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Bridge,Card,Preferences,Snapshot} from '../src/shared';

test('desktop shell reuses tabs, splits the same card, shares edits and restores pane layout',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://workspace.test',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,innerWidth:1200,innerHeight:800,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,sessionStorage:dom.window.sessionStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect=()=>({x:0,y:0,top:0,left:0,bottom:0,right:0,width:0,height:0,toJSON(){}});

  const card:Card={id:'a',path:'Ideas/A.md',name:'A',body:'# First card\n\nOriginal text',revision:'r1',legacy:false};
  const prefs:Preferences={theme:'light',stem:'untitled',starred:[],recent:[],icons:{}};
  let snapshot:Snapshot={root:'/test/workspace',name:'Workspace',cards:[card,{id:'loose',path:'loose.md',name:'loose',revision:'r',legacy:false}],boards:[{path:'Workspace.whiteboard',folder:'',name:'Workspace',revision:'b1',cards:[],edges:[]},{path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'b2',cards:[{id:'p',cardId:'a',x:0,y:0,width:340,height:280}],edges:[]}],folders:['','Ideas'],tags:[],preferences:prefs,issues:[],historyAvailable:false};
  const requests:string[]=[];
  window.door={unregisterWorkspace:async()=>[],listWorkspaces:async()=>[{root:snapshot.root,name:snapshot.name}],openWorkspace:async()=>snapshot,revealFile:async()=>undefined,chooseWorkspace:async()=>snapshot,demo:async()=>snapshot,onClosing:()=>()=>undefined,finishClosing:()=>undefined,cancelClosing:()=>undefined,reload:()=>undefined,newWindow:async()=>undefined,platform:'darwin',assetUrl:p=>p,currentWorkspace:async()=>snapshot,onChange:()=>()=>undefined,request:async request=>{
    requests.push(request.kind);
    switch(request.kind){
      case 'listFiles':return request.path===''?[{name:'Ideas',path:'Ideas',kind:'folder'},{name:'assets',path:'assets',kind:'folder'}]:request.path==='assets'?[{name:'photo.jpg',path:'assets/photo.jpg',kind:'file'}]:[{name:'A.md',path:'Ideas/A.md',kind:'file'}];
      case 'snapshot':return snapshot;
      case 'history':return [];
      case 'card':return request.path===card.path?{...card}:{...snapshot.cards.find(c=>c.path===request.path)!,body:''};
      case 'create':{
        const created={id:'created',path:'Ideas/untitled.md',name:'untitled',revision:'new',legacy:false};
        assert.equal(request.place,false,'Explorer creation requests automatic placement');
        snapshot={...snapshot,cards:[...snapshot.cards,created],boards:snapshot.boards.map(b=>b.folder==='Ideas'?{...b,cards:[...b.cards,{id:'created-placement',cardId:created.id,x:500,y:60,width:340,height:280,collapsed:true}]}:b)};
        return {snapshot,edits:[{path:created.path,before:null,after:'New note'}]};
      }
      case 'query':return [];
      case 'preferences':snapshot={...snapshot,preferences:{...snapshot.preferences!,...request.patch}};return snapshot;
      case 'saveCard':{
        const before=card.body;card.body=request.body;card.revision='r2';snapshot={...snapshot,cards:[{...card}]};
        return {snapshot,edits:[{path:card.path,before,after:card.body}]};
      }
      default:throw new Error('Unexpected '+request.kind);
    }
  }} as Bridge;
  const {App,session}=await import('../src/renderer/App');
  let root=createRoot(document.getElementById('root')!);
  const settle=()=>act(async()=>{await session.run(async()=>undefined);await new Promise(resolve=>setTimeout(resolve,40));});
  const click=async(selector:string)=>{
    const button=document.querySelector<HTMLElement>(selector);assert.ok(button,selector);
    await act(async()=>button.click());await settle();
  };
  try {
    await act(async()=>{session.update({snapshot});root.render(<App/>);});await settle();
    assert.equal(document.querySelectorAll('.activity-bar').length,1);
    assert.equal(document.querySelectorAll('.side-dock').length,1);
    assert.equal(document.querySelector('[aria-label^="Tab Group actions ·"]'),null);
    assert.equal(document.querySelector('.explorer-module>.module-toolbar'),null,'navigation has no empty toolbar');
    const tree=document.querySelector<HTMLElement>('.file-tree')!;
    await act(async()=>{tree.focus();tree.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}));});
    assert.deepEqual([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent),['Refresh Explorer','Collapse folders']);
    await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.ok(document.activeElement===tree,'keyboard context menus restore focus: '+document.activeElement?.outerHTML.slice(0,250));
    assert.equal(document.querySelector('.statusbar [aria-label^=Undo]'),null);
    assert.equal(document.querySelector('.statusbar [aria-label^=Redo]'),null);
    assert.ok(document.querySelector('.statusbar .workspace-switcher'));
    assert.equal(document.querySelector('.statusbar')?.textContent?.includes('words'),false);
    assert.equal(document.querySelector('.file-tree [data-file-key="card:loose"]'),null,'root notes remain outside whiteboard navigation');
    assert.ok(!requests.includes('migrateRoot'),'opening the workspace never moves files');
    assert.ok(!document.querySelector('.workspace-menu'),'workspace selector is no longer in the titlebar');
    assert.ok(!document.querySelector('[data-tooltip="Expand assets"]'),'ordinary folders stay out of whiteboard mode');
    await click('[aria-label="Switch workspace · Workspace"]');
    assert.equal(document.querySelector('[role=menuitemradio][aria-checked=true]')?.textContent,'Workspace');
    assert.ok(document.querySelector('[role=menu] [role=separator]'));
    assert.equal(document.querySelector('[role=menuitem]')?.textContent,'Manage workspaces');
    await click('[role=menuitem]');
    assert.ok(document.querySelector('[role=dialog][aria-label="Manage workspaces"]'));
    assert.ok(document.querySelector('[aria-label^="Remove Workspace from registered"]')?.hasAttribute('disabled'));
    await click('[aria-label="Close dialog"]');
    await click('[aria-label="Add in Ideas"]');
    assert.deepEqual([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent),['New sub-whiteboard','New note']);
    await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await click('[aria-label="More actions for Ideas"]');
    const labels=[...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent);
    await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await act(async()=>document.querySelector('[data-file-key="board:Ideas"]')!.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100})));
    assert.deepEqual([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent),labels);
    await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    await click('.activity-bar [aria-label="File explorer"]');
    await click('[data-tooltip="Expand assets"]');
    assert.ok(document.querySelector('[data-tooltip="Open assets/photo.jpg in the active pane"]'));
    await click('.activity-bar [aria-label="Search"]');
    assert.ok(document.querySelector('.module-toolbar input[aria-label="Search cards"]'),'Search keeps its input');
    assert.equal(document.querySelector('[aria-label="Search actions"]'),null);
    await click('.activity-bar [aria-label="Whiteboard explorer"]');
    const control=document.querySelector<HTMLElement>('[aria-label="Switch workspace · Workspace"]')!;
    await act(async()=>{control.dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,470));});
    assert.match(document.querySelector('[role=tooltip]')?.textContent??'',/switch or manage workspaces/);
    assert.equal(control.getAttribute('aria-describedby'),'app-tooltip');
    await act(async()=>control.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true})));
    assert.equal(document.querySelector('[role=tooltip]'),null);

    await click('[data-tooltip="Expand Ideas"]');
    await click('[data-tooltip="Open Ideas/A.md in the active pane"]');
    await click('[data-tooltip="Open Ideas/A.md in the active pane"]');
    assert.equal(document.querySelectorAll('.workspace [role=tab]').length,2,'reopening a card reuses its tab');
    assert.equal(document.querySelectorAll('.tiptap').length,1);
    await click('[data-tooltip="Open the current file beside this pane"]');
    assert.equal(document.querySelectorAll('.note-pane').length,2);
    assert.equal(document.querySelectorAll('.workspace [role=tab][aria-selected=true]').length,2);
    assert.equal(document.querySelectorAll('.tiptap').length,1,'one focused editor, shared card content');
    await act(async()=>session.edit('# First card\n\nShared draft'));
    assert.match(document.querySelector('.document-preview')?.textContent??'',/Shared draft/);
    await act(async()=>session.run(()=>session.flush()));await settle();
    assert.match(card.body,/Shared draft/);
    await click('.note-pane:not(.active-pane) [role=tab][aria-selected=true]');
    assert.equal(session.state.draft?.card.path,card.path,'switching between the same card retains its draft');
    await click('.active-pane [data-tooltip="Show or hide formatting controls"]');
    assert.ok(document.querySelector('.active-pane .show-formatting'));
    await click('.active-pane [data-tooltip="Add to starred"]');
    assert.equal(snapshot.preferences?.starred[0],'card:a');
    await act(async()=>session.flushPreferences());
    const savedLayout=snapshot.preferences?.documents;
    assert.ok(savedLayout);
    assert.ok(snapshot.preferences?.docks);
    assert.equal(sessionStorage.length,0,'workspace state does not depend on browser storage');
    await act(async()=>root.unmount());
    root=createRoot(document.getElementById('root')!);
    await act(async()=>root.render(<App/>));await settle();
    assert.equal(document.querySelectorAll('.note-pane').length,2,'splits survive renderer reload');
    assert.equal(session.state.error,'');
    await click('.activity-bar [aria-label="Agent console"]');
    assert.ok(document.querySelector('.right-dock [aria-label="Agent console"][role=tabpanel]'));
    await act(async()=>document.querySelector('#tab-agent')!.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,clientX:900,clientY:70})));
    await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Move View to left dock')!.click());await settle();
    await click('[aria-label="Collapse left dock"]');
    await click('.activity-bar [aria-label="Agent console"]');
    assert.ok(document.querySelector('.left-dock [aria-label="Agent console"][role=tabpanel]'),'activity buttons reveal a module in its chosen location');
    await click('.file-tree [data-file-key="board:Ideas"] .file-button');
    await click('.file-tree [aria-label="Add in Ideas"]');
    const newNote=[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='New note')!;
    await act(async()=>newNote.click());await settle();
    assert.equal(document.querySelector('.active-pane [role=tab][aria-selected=true]')?.textContent,'untitled.md','Explorer creation opens the note even when its board is active');
    assert.equal(snapshot.boards.find(b=>b.folder==='Ideas')?.cards.at(-1)?.collapsed,true);
  } finally {
    await act(async()=>root.unmount());session.dispose();dom.window.close();
  }
});
