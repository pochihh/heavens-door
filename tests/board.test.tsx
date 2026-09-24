import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Board } from '../src/shared';

test('board drags persist final coordinates even when pointer events share a render batch',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  const captured:HTMLElement[]=[];
  dom.window.HTMLElement.prototype.setPointerCapture=function () {captured.push(this);};
  dom.window.HTMLElement.prototype.hasPointerCapture=() => false;
  dom.window.HTMLElement.prototype.releasePointerCapture=() => undefined;
  const errors:unknown[]=[]; dom.window.addEventListener('error',event => { errors.push(event.error); event.preventDefault(); });
  const {Whiteboard,isVisible}=await import('../src/renderer/Board');
  const board:Board={path:'test.whiteboard',folder:'',name:'Test',revision:'revision',cards:[{id:'placement',cardId:'card',x:0,y:0,width:340,height:280}],edges:[]};
  const saved:Board[]=[];
  const root=createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Whiteboard board={board} cards={[]} onSave={b => { saved.push(b); }} onOpen={() => undefined} onCreate={() => undefined}/>));
  const grip=document.querySelector('.card-grip')!;
  await act(async () => {
    grip.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));
    grip.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,clientX:185,clientY:142.5}));
    grip.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true,clientX:185,clientY:142.5}));
  });
  assert.equal(captured[0],document.querySelector('.board-card'),'card gestures retain the card as click target');
  assert.equal(saved.length,1); assert.equal(saved[0].cards[0].x,100); assert.equal(saved[0].cards[0].y,50);
  assert.equal(isVisible(board.cards[0],{x:0,y:0,zoom:1},1000,800),true);
  assert.equal(isVisible({...board.cards[0],x:10000},{x:0,y:0,zoom:1},1000,800),false);
  await act(async () => root.unmount()); assert.deepEqual(errors,[]); dom.window.close();
});

test('plugin pointer navigation selects with left drag, pans with middle/right/Space, and moves a selection together',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  dom.window.HTMLElement.prototype.setPointerCapture=() => undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture=() => false;
  dom.window.HTMLElement.prototype.releasePointerCapture=() => undefined;
  const errors:unknown[]=[]; dom.window.addEventListener('error',event => { errors.push(event.error); event.preventDefault(); });
  const frames=new Map<number,FrameRequestCallback>();let nextId=0;
  dom.window.requestAnimationFrame=callback => {frames.set(++nextId,callback);return nextId;};
  dom.window.cancelAnimationFrame=id => {frames.delete(id);};
  const frame=async () => act(async () => {const callbacks=[...frames.values()];frames.clear();callbacks.forEach(c => c(0));});
  const {Whiteboard}=await import('../src/renderer/Board');
  const board:Board={path:'test.whiteboard',folder:'',name:'Test',revision:'revision',cards:[0,1,2].map(i => ({id:`p${i}`,cardId:`c${i}`,x:i*400,y:0,width:340,height:280})),edges:[]};
  const saved:Board[]=[];const root=createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Whiteboard board={board} cards={[]} onSave={b => {saved.push(b);}} onOpen={() => undefined} onCreate={() => undefined}/>));
  const canvas=document.querySelector<HTMLElement>('.canvas')!,world=document.querySelector<HTMLElement>('.board-world')!;
  const pointer=(target:Element,type:string,x:number,y:number,button=0) => target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button,clientX:x,clientY:y}));
  const drag=async (button:number) => act(async () => {pointer(canvas,'pointerdown',10,500,button);pointer(canvas,'pointermove',95,585,button);pointer(canvas,'pointerup',95,585,button);});
  const initial=world.style.transform;
  await act(async () => {pointer(canvas,'pointerdown',0,0);pointer(canvas,'pointermove',650,300);pointer(canvas,'pointerup',650,300);});
  assert.equal(world.style.transform,initial);assert.equal(document.querySelectorAll('.board-card.selected').length,2);
  const grip=document.querySelector('.card-grip')!;
  await act(async () => {pointer(grip,'pointerdown',100,100);pointer(canvas,'pointermove',185,100);pointer(canvas,'pointerup',185,100);});
  assert.equal(saved.length,1);assert.deepEqual(saved[0].cards.map(p => p.x),[100,500,800]);
  await drag(1);await frame();assert.notEqual(world.style.transform,initial);
  const middle=world.style.transform;await drag(2);await frame();assert.notEqual(world.style.transform,middle);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true})));
  const right=world.style.transform;await drag(0);await frame();assert.notEqual(world.style.transform,right);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true})));
  assert.equal(saved.length,1,'navigation does not create edit history');
  await act(async () => root.unmount());assert.deepEqual(errors,[]);dom.window.close();
});

test('dragged cards keep their latest position through delayed saves, consecutive gestures and cancellation',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  dom.window.HTMLElement.prototype.setPointerCapture=() => undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture=() => false;
  const frames=new Map<number,FrameRequestCallback>();let nextId=0;
  dom.window.requestAnimationFrame=callback => {frames.set(++nextId,callback);return nextId;};
  dom.window.cancelAnimationFrame=id => {frames.delete(id);};
  const frame=async () => act(async () => {const callbacks=[...frames.values()];frames.clear();callbacks.forEach(c => c(0));});
  const {Whiteboard}=await import('../src/renderer/Board');
  const {useState}=await import('react');
  const board:Board={path:'test.whiteboard',folder:'',name:'Test',revision:'r0',cards:[{id:'p',cardId:'c',x:0,y:0,width:340,height:280}],edges:[]};
  const saves:{board:Board;base:Board;finish:()=>void}[]=[];
  function Fixture() {
    const [saved,setSaved]=useState(board);
    return <Whiteboard board={saved} cards={[]} onOpen={() => undefined} onCreate={() => undefined} onSave={(next,_label,base) => new Promise<void>(resolve => {
      const revision=`r${saves.length+1}`;
      saves.push({board:next,base,finish:() => {setSaved({...next,revision});resolve();}});
    })}/>;
  }
  const root=createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(<Fixture/>));
    const canvas=document.querySelector('.canvas')!;
    const card=() => document.querySelector<HTMLElement>('[data-placement="p"]')!;
    const pointer=(target:Element,type:string,x:number,y=100) => target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
    const down=async () => act(async () => {pointer(card().querySelector('.card-grip')!,'pointerdown',100);});
    const up=async (x:number) => act(async () => {pointer(canvas,'pointerup',x);});
    await down();await up(185);
    assert.equal(card().style.left,'100px','dropping must not flash back while saving');
    await down();
    await act(async () => {for (let x=101;x<=270;x++) pointer(canvas,'pointermove',x);});
    assert.equal(frames.size,1,'pointer movement is painted at most once per frame');
    await frame();assert.equal(card().style.left,'300px');
    await act(async () => saves[0].finish());
    assert.equal(card().style.left,'300px','an earlier save cannot reset an ongoing drag');
    await up(270);
    assert.equal(saves[1].base.cards[0].x,100);
    assert.equal(card().style.left,'300px');
    await down();await up(185);assert.equal(card().style.left,'400px');
    await act(async () => saves[1].finish());
    assert.equal(card().style.left,'400px','an earlier acknowledgement cannot roll back a later completed drag');
    await act(async () => saves[2].finish());assert.equal(card().style.left,'400px');
    await act(async () => {pointer(card().querySelector('.resize-handle')!,'pointerdown',100);pointer(canvas,'pointerup',185);});
    assert.equal(card().style.width,'440px','resize also stays visible while saving');
    await down();await act(async () => {pointer(canvas,'pointermove',4100);});await frame();
    assert.ok(card(),'the dragged card stays mounted even outside the viewport');
    await act(async () => {pointer(canvas,'pointercancel',4100);});
    assert.equal(card().style.left,'400px');assert.equal(card().style.width,'440px','cancelling a gesture preserves the earlier pending save');
    await act(async () => saves[3].finish());assert.equal(card().style.width,'440px');
    assert.equal(saves.length,4);
  } finally {await act(async () => root.unmount());dom.window.close();}
});
