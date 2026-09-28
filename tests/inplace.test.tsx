import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,useState} from 'react';
import type {Board} from '../src/shared';

test('in-place edge labels preview drafts, retain label size and commit only changed text',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const {useRef}=await import('react'),{createRoot}=await import('react-dom/client'),{Edges}=await import('../src/renderer/Edges');
  let board:Board={path:'a.whiteboard',folder:'',name:'A',revision:'r',cards:[{id:'a',cardId:'a',x:0,y:0,width:300,height:200},{id:'b',cardId:'b',x:500,y:0,width:300,height:200}],edges:[{id:'e',from:'a',to:'b',label:'Original label',labelSize:24}]};
  let saves=0;
  function Harness(){const [current,setBoard]=useState(board),[selected,setSelected]=useState<string[]>([]),viewport=useRef<HTMLDivElement>(null);return <div ref={viewport}><Edges board={current} mentions={[]} heightOf={p=>p.height} camera={()=>({x:0,y:0,zoom:1})} viewport={viewport} selectedCards={[]} selectedEdges={selected} enabled onSelect={setSelected} onSave={b=>{board=b;saves++;setBoard(b);}} onFinish={()=>{}} onStyle={()=>{}}/><button id="deselect" onClick={()=>setSelected([])}>Deselect</button></div>;}
  const root=createRoot(document.getElementById('root')!);
  const open=()=>act(async()=>document.querySelector<HTMLButtonElement>('button.edge-label')!.click());
  const type=(value:string)=>act(async()=>{const input=document.querySelector('textarea')!;Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  const key=(key:string)=>act(async()=>document.querySelector('textarea')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true})));
  try{
    await act(async()=>root.render(<Harness/>));await open();
    assert.equal(document.querySelector<HTMLElement>('.edge-label-wrap')!.style.fontSize,'24px');
    await type('Live draft');assert.equal(document.querySelector('.edge-label-text')!.textContent,'Live draft');assert.equal(saves,0,'typing previews locally without one save per keystroke');
    await key('Escape');assert.equal(document.querySelector('.edge-label-text')!.textContent,'Original label');assert.equal(saves,0);
    await open();await type('Saved label');await key('Enter');assert.equal(board.edges[0].label,'Saved label');assert.equal(saves,1);
    await act(async()=>document.querySelector<HTMLButtonElement>('#deselect')!.click());assert.equal(document.querySelector('.edge-label-text')!.textContent,'Saved label');
    await open();assert.equal(document.querySelector('textarea')!.value,'Saved label');await key('Enter');assert.equal(saves,1,'selection and unchanged editing do not create history');
    await open();await type('Saved on blur');await act(async()=>document.querySelector('textarea')!.blur());assert.equal(board.edges[0].label,'Saved on blur');assert.equal(saves,2);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
