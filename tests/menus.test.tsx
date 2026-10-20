import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {ActionMenu,overlayContainer} from '../src/renderer/Overlays';

test('hover submenus retain the parent, keyboard returns to it, and actions dismiss the tree',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div><button id="anchor">Options</button><dialog open></dialog>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,innerWidth:1000,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true});
  const anchor=document.getElementById('anchor')!,dialog=document.querySelector('dialog')!;
  assert.equal(overlayContainer(anchor),document.body);assert.equal(overlayContainer(dialog),dialog);
  let selected=0,closed=0;const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<ActionMenu menu={{anchor,x:10,y:20,actions:[{label:'Turn into',submenu:[{label:'Text',run:()=>{selected++;}}]},{label:'Delete',run:()=>{}}]}} onClose={()=>{closed++;root.render(null);}}/>));
    const trigger=document.querySelector<HTMLButtonElement>('[aria-haspopup=menu]')!;
    assert.ok(trigger.querySelector('svg'));assert.equal(trigger.getAttribute('aria-expanded'),'false');
    await act(async()=>trigger.dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true})));
    assert.equal(document.querySelectorAll('[role=menu]').length,2);assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.ok(trigger.isConnected);
    await act(async()=>trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
    const choice=document.querySelector<HTMLButtonElement>('[aria-label="Turn into"] button')!;assert.equal(document.activeElement,choice);
    await act(async()=>choice.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));
    assert.equal(document.querySelectorAll('[role=menu]').length,1);assert.equal(document.activeElement,trigger);
    await act(async()=>trigger.click());await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Turn into"] button')!.click());
    assert.equal(selected,1);assert.equal(closed,1);assert.equal(document.querySelectorAll('[role=menu]').length,0);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('checked and unchecked menu items reserve the same left-hand checkmark slot',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,innerWidth:1000,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')!);try{await act(async()=>root.render(<ActionMenu menu={{x:10,y:20,actions:[{label:'Expand PDF preview',checked:true,checkType:'checkbox'},{label:'Show notes',checked:false,checkType:'checkbox'},{label:'Align left',icon:'imageLeft',checked:true}]}} onClose={()=>{}}/>));
  const options=[...document.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')];for(const button of options){assert.ok(button.firstElementChild?.classList.contains('menu-check'));assert.equal(button.lastElementChild?.textContent,button.textContent);}
  assert.ok(options[0].firstElementChild?.querySelector('svg'));assert.equal(options[1].firstElementChild?.querySelector('svg'),null);assert.equal(options[0].getAttribute('aria-checked'),'true');assert.equal(options[1].getAttribute('aria-checked'),'false');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
