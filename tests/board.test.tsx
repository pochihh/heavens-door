import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Board } from '../src/shared';

test('board drags persist final coordinates even when pointer events share a render batch',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  dom.window.HTMLElement.prototype.setPointerCapture=() => undefined;
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
  assert.equal(saved.length,1); assert.equal(saved[0].cards[0].x,100); assert.equal(saved[0].cards[0].y,50);
  assert.equal(isVisible(board.cards[0],{x:0,y:0,zoom:1},1000,800),true);
  assert.equal(isVisible({...board.cards[0],x:10000},{x:0,y:0,zoom:1},1000,800),false);
  await act(async () => root.unmount()); dom.window.close();
});
