import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { SearchDialog } from '../src/renderer/SearchView';
import { HistoryPanel, diverged, historyLanes } from '../src/renderer/HistoryView';
import { Session } from '../src/renderer/session';
import type { Bridge, CardResult, Checkpoint, Snapshot } from '../src/shared';

test('search keyboard/IME and menu-driven history navigation keep selection separate from restore',async()=>{
  const dom=new JSDOM('<button id="before">Search</button><div id="root"></div>',{url:'https://test.local',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Element:dom.window.Element,innerWidth:1200,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true});
  const snapshot:Snapshot={root:'/test',name:'Test',cards:[],boards:[],issues:[],historyAvailable:true};
  const a:Checkpoint={id:'a',parents:[],time:1,label:'A',active:false},b={...a,id:'b',parents:['a'],label:'B'},c={...a,id:'c',parents:['b'],label:'C'},d={...a,id:'d',parents:['b'],label:'D',active:true};
  const items=[d,c,b,a];assert.equal(diverged(c,d,items),true);assert.equal(diverged(b,d,items),false);assert.notEqual(historyLanes(items).get('c'),historyLanes(items).get('d'));
  const calls:string[]=[],opened:string[]=[],restored:string[]=[],confirms:string[]=[];
  const results:CardResult[]=[{id:'one',name:'機器學習',path:'one.md',title:'機器學習',revision:'r',legacy:false,properties:{},score:1,snippet:'原始內容',terms:[],previewImage:'assets/photo.jpg',highlights:{name:[[0,4]],path:[],snippet:[]}},{id:'two',name:'Two',path:'two.md',revision:'r',legacy:false,properties:{},score:1,snippet:'second',terms:[]}];
  let releaseQuery:()=>void=()=>{};const queryGate=new Promise<void>(resolve=>{releaseQuery=resolve;});
  const session=new Session({assetUrl:(path:string)=>'heavens-asset://test/'+path,request:async request=>{calls.push(request.kind);if(request.kind==='queryCards'){await queryGate;return results;}if(request.kind==='checkpointChanges')return [{path:'one.md',added:2,removed:1}];if(request.kind==='preferences')return snapshot;throw new Error(request.kind);}} as Bridge);
  session.update({snapshot,checkpoints:items});session.restore=async id=>{restored.push(id);};
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('root')!);
  const onClose=()=>{root.render(null);};
  try{
    document.getElementById('before')!.focus();
    await act(async()=>root.render(<SearchDialog session={session} snapshot={{...snapshot,preferences:{theme:'dark',stem:'untitled',starred:[],recent:[],icons:{},navigation:{search:{search:'学习'}}}}} onOpen={key=>opened.push(key)} onSplit={key=>opened.push('split:'+key)} onClose={onClose}/>));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,150));});
    assert.equal(document.querySelector('[role=listbox]')?.getAttribute('aria-busy'),'true');assert.ok(document.querySelector('.search-loading'));
    await act(async()=>releaseQuery());
    assert.equal(document.querySelector('[role=listbox]')?.getAttribute('aria-busy'),'false');assert.equal(document.querySelector('mark')?.textContent,'機器學習');assert.equal(document.querySelector('img')?.getAttribute('src'),'heavens-asset://test/assets/photo.jpg');
    const input=document.querySelector('input')!;assert.equal(document.activeElement,input);assert.equal(document.querySelectorAll('[role=option]').length,2);
    const clear=document.querySelector<HTMLButtonElement>('.search button')!;clear.focus();
    await act(async()=>clear.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement,input);
    await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));assert.equal(document.activeElement,clear);input.focus();
    await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));assert.deepEqual(opened,[]);
    await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    assert.equal(document.querySelector('[role=option][aria-selected=true] .search-result-path')?.textContent,'two.md');
    await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(document.activeElement?.id,'before');
    await act(async()=>root.render(<HistoryPanel session={session}/>));
    const card=document.querySelector<HTMLButtonElement>('[data-checkpoint=c]')!;
    await act(async()=>card.click());assert.deepEqual(restored,[]);assert.ok(document.querySelector('[aria-label="Checkpoint changes"]')?.textContent?.includes('+2 −1'));
    window.confirm=(text)=>{confirms.push(text??'');return false;};
    await act(async()=>card.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true})));assert.equal(confirms.length,1);assert.deepEqual(restored,[]);
    await act(async()=>card.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,clientX:30,clientY:40})));
    const menu=document.querySelector('[role=menu]')!;assert.ok(menu.textContent?.includes('Apply changes'));
    window.confirm=()=>true;
    await act(async()=>menu.querySelector<HTMLButtonElement>('button')!.click());assert.deepEqual(restored,['c']);assert.equal(document.querySelector('[role=menu]'),null);
  }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});
