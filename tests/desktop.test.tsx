import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Bridge,Card,Preferences,Snapshot} from '../src/shared';

test('desktop shell reuses tabs, splits the same card, shares edits and restores pane layout',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://workspace.test',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,sessionStorage:dom.window.sessionStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect=()=>({x:0,y:0,top:0,left:0,bottom:0,right:0,width:0,height:0,toJSON(){}});

  const card:Card={id:'a',path:'Ideas/A.md',name:'A',body:'# First card\n\nOriginal text',revision:'r1',legacy:false};
  const prefs:Preferences={theme:'light',stem:'untitled',starred:[],recent:[],icons:{}};
  let snapshot:Snapshot={root:'/test/workspace',name:'Workspace',cards:[card],boards:[{path:'Workspace.whiteboard',folder:'',name:'Workspace',revision:'b1',cards:[],edges:[]},{path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'b2',cards:[{id:'p',cardId:'a',x:0,y:0,width:340,height:280}],edges:[]}],folders:['','Ideas'],tags:[],preferences:prefs,issues:[],historyAvailable:false};
  const requests:string[]=[];
  window.door={chooseWorkspace:async()=>snapshot,demo:async()=>snapshot,onClosing:()=>()=>undefined,finishClosing:()=>undefined,cancelClosing:()=>undefined,reload:()=>undefined,newWindow:async()=>undefined,platform:'darwin',assetUrl:p=>p,currentWorkspace:async()=>snapshot,onChange:()=>()=>undefined,request:async request=>{
    requests.push(request.kind);
    switch(request.kind){
      case 'snapshot':return snapshot;
      case 'card':return {...card};
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
    assert.equal(document.querySelectorAll('.dock-rail').length,2);
    assert.ok(!requests.includes('migrateRoot'),'opening the workspace never moves files');
    await click('[title="Expand Ideas"]');
    await click('[title="Open Ideas/A.md in the active pane"]');
    await click('[title="Open Ideas/A.md in the active pane"]');
    assert.equal(document.querySelectorAll('[role=tab]').length,2,'reopening a card reuses its tab');
    assert.equal(document.querySelectorAll('.tiptap').length,1);
    await click('[title="Open the current file beside this pane"]');
    assert.equal(document.querySelectorAll('.note-pane').length,2);
    assert.equal(document.querySelectorAll('[role=tab][aria-selected=true]').length,2);
    assert.equal(document.querySelectorAll('.tiptap').length,1,'one focused editor, shared card content');
    await act(async()=>session.edit('# First card\n\nShared draft'));
    assert.match(document.querySelector('.document-preview')?.textContent??'',/Shared draft/);
    await act(async()=>session.run(()=>session.flush()));await settle();
    assert.match(card.body,/Shared draft/);
    await click('.note-pane:not(.active-pane) [role=tab][aria-selected=true]');
    assert.equal(session.state.draft?.card.path,card.path,'switching between the same card retains its draft');
    await click('.active-pane [title="Show or hide formatting controls"]');
    assert.ok(document.querySelector('.active-pane .show-formatting'));
    await click('.active-pane [title="Add to starred"]');
    assert.equal(snapshot.preferences?.starred[0],'card:a');
    const savedLayout=sessionStorage.getItem('layout:'+snapshot.root);
    assert.ok(savedLayout);
    await act(async()=>root.unmount());
    root=createRoot(document.getElementById('root')!);
    await act(async()=>root.render(<App/>));await settle();
    assert.equal(document.querySelectorAll('.note-pane').length,2,'splits survive renderer reload');
    assert.equal(session.state.error,'');
  } finally {
    await act(async()=>root.unmount());session.dispose();dom.window.close();
  }
});
