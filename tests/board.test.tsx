import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const windows:JSDOM[]=[];
// DOMPurify retains its renderer window until the module is disposed.
after(()=>windows.forEach(dom=>dom.window.close()));
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Board } from '../src/shared';

test('board drags persist final coordinates even when pointer events share a render batch',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  const captured:HTMLElement[]=[];
  dom.window.HTMLElement.prototype.setPointerCapture=function () {captured.push(this);};
  dom.window.HTMLElement.prototype.hasPointerCapture=() => false;
  dom.window.HTMLElement.prototype.releasePointerCapture=() => undefined;
  const errors:unknown[]=[]; dom.window.addEventListener('error',event => { errors.push(event.error); event.preventDefault(); });
  const {Whiteboard,isVisible}=await import('../src/renderer/Board');
  const board:Board={path:'test.whiteboard',folder:'',name:'Test',revision:'revision',canvasColor:'#ffffff',gridColor:'#ff0000',cards:[{id:'placement',cardId:'card',x:0,y:0,width:340,height:280,strokeColor:'#ff0000',strokeWidth:8,strokeStyle:'dotted'}],edges:[]};
  const saved:Board[]=[];
  const root=createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Whiteboard board={board} cards={[]} onSave={b => { saved.push(b); }} onOpen={() => undefined} onCreate={() => undefined}/>));
  const grip=document.querySelector<HTMLElement>('.board-card')!;
  assert.equal(grip.style.borderColor,'');assert.equal(grip.style.borderWidth,'');assert.equal(grip.style.borderStyle,'','card borders come from the theme');
  assert.equal(document.querySelector('.canvas')!.getAttribute('style'),null,'legacy canvas and grid colors do not override the theme');
  await act(async () => {
    grip.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));
    grip.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,clientX:185,clientY:142.5}));
    grip.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true,clientX:185,clientY:142.5}));
  });
  assert.equal(captured[0],document.querySelector('.board-card'),'card gestures retain the card as click target');
  assert.equal(saved.length,1); assert.equal(saved[0].cards[0].x,100); assert.equal(saved[0].cards[0].y,50);
  assert.equal(isVisible(board.cards[0],{x:0,y:0,zoom:1},1000,800),true);
  assert.equal(isVisible({...board.cards[0],x:10000},{x:0,y:0,zoom:1},1000,800),false);
  await act(async () => root.unmount()); assert.deepEqual(errors,[]);
});

test('plugin pointer navigation selects with left drag, pans with middle/right/Space, and moves a selection together',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
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
  const grip=document.querySelector('.board-card')!;
  await act(async () => {pointer(grip,'pointerdown',100,100);pointer(canvas,'pointermove',185,100);pointer(canvas,'pointerup',185,100);});
  assert.equal(saved.length,1);assert.deepEqual(saved[0].cards.map(p => [p.id,p.x]),[['p2',800],['p0',100],['p1',500]],'dropped selection is saved after other placements');
  await drag(1);await frame();assert.notEqual(world.style.transform,initial);
  const middle=world.style.transform;await drag(2);await frame();assert.notEqual(world.style.transform,middle);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true})));
  const right=world.style.transform;await drag(0);await frame();assert.notEqual(world.style.transform,right);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true})));
  assert.equal(saved.length,1,'navigation does not create edit history');
  await act(async () => root.unmount());assert.deepEqual(errors,[]);
});

test('dragged cards keep their latest position through delayed saves, consecutive gestures and cancellation',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
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
    const down=async () => act(async () => {pointer(card(),'pointerdown',100);});
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
  } finally {await act(async () => root.unmount());}
});

test('losing pointer capture before release still saves the final drag instead of snapping back',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  dom.window.HTMLElement.prototype.setPointerCapture=() => undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture=() => false;
  const {Whiteboard}=await import('../src/renderer/Board');
  const board:Board={path:'test.whiteboard',folder:'',name:'Test',revision:'r',cards:[{id:'p',cardId:'c',x:0,y:0,width:340,height:280}],edges:[]};
  const saved:Board[]=[];const root=createRoot(document.getElementById('root')!);
  const pointer=(target:EventTarget,type:string,x:number,pointerId=1) => {
    const event=new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:100});
    Object.defineProperty(event,'pointerId',{value:pointerId});target.dispatchEvent(event);
  };
  try {
    await act(async () => root.render(<Whiteboard board={board} cards={[]} onOpen={() => undefined} onCreate={() => undefined} onSave={next => {saved.push(next);}}/>));
    const grip=document.querySelector('.board-card')!,card=document.querySelector('.board-card')!;
    await act(async () => {pointer(grip,'pointerdown',100);pointer(card,'pointermove',185);});
    await act(async () => {pointer(card,'lostpointercapture',185);pointer(document,'pointermove',270);pointer(document,'pointerup',270,2);});
    assert.equal(saved.length,0,'another pointer must not end the active drag');
    await act(async () => {pointer(document,'pointerup',270);});
    assert.equal(saved.length,1,'release is committed even after capture was lost');
    assert.equal(saved[0].cards[0].x,200);
  } finally {await act(async () => root.unmount());}
});

test('200 full previews keep their DOM through saves and distant zoom, and cache across offscreen culling',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  const {Whiteboard}=await import('../src/renderer/Board');
  const cards=Array.from({length:200},(_,i)=>({id:`c${i}`,path:`${i}.md`,name:`${i}`,revision:'r',legacy:false}));
  let reads=0;
  window.door={assetUrl:path=>path,request:async request=>{reads++;return {...cards.find(c=>c.path===('path' in request ? request.path : ''))!,body:'# Heading\n\n![Local image](asset.svg)\n\nText to read.'};}} as typeof window.door;
  const board:Board={path:'test.whiteboard',folder:'',name:'Test',revision:'r0',cards:cards.map((c,i)=>({id:`p${i}`,cardId:c.id,x:(i%20)*60,y:Math.floor(i/20)*60,width:340,height:280})),edges:[]};
  const root=createRoot(document.getElementById('root')!);
  const render=(b:Board)=>root.render(<Whiteboard board={b} cards={cards.map(c=>({...c}))} onOpen={()=>undefined} onCreate={()=>undefined} onSave={()=>undefined}/>);
  try {
    await act(async ()=>render(board));
    const previews=[...document.querySelectorAll<HTMLElement>('.card-preview')];
    assert.equal(previews.length,200);assert.equal(reads,200);
    const headings=previews.map(p=>p.firstElementChild),images=previews.map(p=>p.querySelector('img'));
    previews.forEach(p=>{p.scrollTop=75;});
    await act(async ()=>render({...board,revision:'r1',cards:board.cards.map((p,i)=>i ? p : {...p,x:100})}));
    assert.ok(previews.every((p,i)=>p.firstElementChild===headings[i] && p.querySelector('img')===images[i]),'unchanged previews must not replace their DOM when the board saves');
    assert.ok(previews.every(p=>p.scrollTop===75));assert.equal(reads,200,'saving geometry does not reload card bodies');
    const canvas=document.querySelector('.canvas')!;
    const wheel=async(init:WheelEventInit,count:number)=>act(async()=>{
      for(let i=0;i<count;i++)canvas.dispatchEvent(new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,...init}));
      await new Promise(resolve=>setTimeout(resolve,300));
    });
    await wheel({deltaY:100},8);
    assert.ok(Number.parseInt(document.querySelector('.zoom-level')!.textContent!)<40);
    assert.equal(document.querySelectorAll('.card-preview').length,200,'zoomed-out cards retain full previews');
    assert.ok(previews.every((p,i)=>p.isConnected && p.firstElementChild===headings[i] && p.querySelector('img')===images[i]));
    await wheel({deltaY:-100},8);
    assert.ok(previews.every(p=>p.scrollTop===75));assert.equal(reads,200,'zooming does not reload bodies');
    await wheel({deltaX:120},100);
    assert.equal(document.querySelectorAll('.card-preview').length,0,'offscreen cards are still culled');
    await wheel({deltaX:-120},100);
    assert.equal(document.querySelectorAll('.card-preview').length,200);assert.equal(reads,200,'returning to a 200-card board reuses cached previews');
    assert.equal(document.querySelector('.canvas-controls input'),null);
    await act(async()=>{document.querySelector<HTMLButtonElement>('[aria-label="Zoom to fit"]')!.click();await new Promise(resolve=>setTimeout(resolve,130));});
    assert.equal(document.querySelector('.zoom-level')!.textContent,'25%','clicking the percentage fits all placements (zero-sized test viewport)');
  } finally {await act(async()=>root.unmount());}
});

test('collapsed cards use cached titles without loading bodies and expand without losing size or position',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  const {Whiteboard,isVisible}=await import('../src/renderer/Board');
  const {useState}=await import('react');
  const cards=Array.from({length:200},(_,i)=>({id:`c${i}`,path:`Ideas/${i}.md`,name:String(i),title:i===0?'A cached title':undefined,titleMarkdown:i===0?'A **cached** title':'',revision:'r',legacy:false}));
  let reads=0;
  window.door={assetUrl:path=>path,request:async request=>{reads++;return {...cards.find(c=>c.path===('path' in request?request.path:''))!,body:'# A **cached** title\n\nFull body'};}} as typeof window.door;
  const board:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:cards.map((c,i)=>({id:`p${i}`,cardId:c.id,x:i%20*60,y:Math.floor(i/20)*60,width:340,height:280,collapsed:true})),edges:[]};
  let latest=board;
  function Fixture(){const [value,setValue]=useState(board);return <Whiteboard board={value} cards={cards} onOpen={()=>undefined} onCreate={()=>undefined} onSave={next=>{latest=next;setValue(next);}}/>;}
  const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<Fixture/>));
    assert.equal(document.querySelectorAll('.board-card.collapsed').length,200);assert.equal(reads,0);
    const first=document.querySelector<HTMLElement>('[data-placement="p0"]')!;
    assert.equal(first.querySelector('.card-title')?.textContent,'A cached title');assert.equal(first.style.height,'auto');
    assert.equal(document.querySelector('[data-placement="p1"] .card-title')?.textContent,'');
    assert.ok(document.querySelector('[data-placement="p1"] .card-title.is-empty'),'a missing H1 shows a visual prompt, not the filename');
    const summary=first.querySelector('.card-title')!.innerHTML,chevron=first.querySelector('[aria-label="Expand card"]');
    assert.equal(first.querySelector('.resize-handle'),null);
    await act(async()=>first.querySelector<HTMLButtonElement>('[aria-label="Expand card"]')!.click());
    assert.equal(reads,1);assert.equal(first.style.height,'auto');assert.ok(first.querySelector('.card-preview p'),'expansion mounts the body');
    assert.equal(first.querySelector('.card-title')!.innerHTML,summary,'heading formatting stays identical');
    assert.equal(first.querySelector('[aria-label="Collapse card"]'),chevron,'the same button stays mounted');
    assert.deepEqual([latest.cards[0].x,latest.cards[0].y,latest.cards[0].height],[0,0,280]);
    await act(async()=>first.querySelector<HTMLButtonElement>('[aria-label="Collapse card"]')!.click());
    assert.equal(first.style.height,'auto');assert.equal(first.querySelector('.card-preview p'),null);assert.equal(first.querySelector('.card-title')!.innerHTML,summary);assert.equal(latest.cards[0].collapsed,true);
    assert.equal(isVisible({...board.cards[0],y:-100},{x:0,y:0,zoom:1},1000,800,0),false,'visibility uses the collapsed footprint');
    assert.equal(isVisible({...board.cards[0],y:-100,collapsed:false},{x:0,y:0,zoom:1},1000,800,0),true);
  }finally{await act(async()=>root.unmount());}
});

test('whiteboard tiles preview indexed members without body reads and share card move/resize gestures',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  const {Whiteboard}=await import('../src/renderer/Board'),{useState}=await import('react');
  const cards=[{id:'a',path:'Ideas/a.md',name:'a',title:'Indexed title',revision:'r',legacy:false}];
  const other=Array.from({length:198},(_,i)=>({id:'extra'+i,cardId:'a',x:0,y:0,width:340,height:280}));
  const child:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[{id:'c',cardId:'a',x:0,y:0,width:340,height:280},{id:'nested',cardId:'',folder:'Ideas/Research',x:400,y:0,width:340,height:280},...other],edges:[]};
  const board:Board={path:'Test.whiteboard',folder:'',name:'Test',revision:'r',cards:[{id:'tile',cardId:'',folder:'Ideas',x:0,y:0,width:340,height:280}],edges:[]};
  let latest=board;
  const opened:string[]=[],saved:Board[]=[];
  window.door={request:()=>{assert.fail('tile previews must not load note bodies');}} as unknown as typeof window.door;
  function Fixture(){const [value,setValue]=useState(board);return <Whiteboard board={value} boards={[child]} cards={cards} onOpen={()=>assert.fail('tile cannot open a note editor')} onOpenFolder={folder=>opened.push(folder)} onCreate={()=>undefined} onSave={next=>{latest=next;saved.push(next);setValue(next);}}/>;}
  const root=createRoot(document.getElementById('root')!);
  const pointer=(target:Element,type:string,x:number,y=100)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
  try{
    await act(async()=>root.render(<Fixture/>));
    const tile=document.querySelector<HTMLElement>('.board-tile')!,body=tile.querySelector('.board-tile-body')!;
    assert.equal(tile.querySelector('.card-grip'),null);
    assert.equal(tile.querySelector('.board-tile-heading>small')!.textContent,'199 cards · 1 whiteboard');
    assert.deepEqual([...tile.querySelectorAll('.board-tile-item')].slice(0,2).map(el=>el.textContent),['Indexed title','Research']);
    assert.equal(tile.querySelectorAll('.board-tile-item').length,12,'only the rows fitting this tile mount, beyond the old six-card limit');
    assert.equal(tile.querySelector('.board-tile-item:first-child svg'),null,'card previews show only their title');
    assert.ok(tile.querySelector('.board-tile-item:nth-child(2) svg'),'nested whiteboards retain their distinguishing map icon');
    await act(async()=>{pointer(body,'pointerdown',100);});
    assert.ok(tile.classList.contains('dragging'));
    await act(async()=>{pointer(tile,'pointermove',185);pointer(tile,'pointerup',185);});
    assert.equal(latest.cards[0].x,100);assert.equal(tile.classList.contains('dragging'),false);assert.equal(opened.length,0,'a drag does not navigate');
    await act(async()=>{pointer(tile.querySelector('.resize-handle')!,'pointerdown',100);pointer(tile,'pointerup',185,142.5);});
    assert.equal(latest.cards[0].width,440);assert.equal(latest.cards[0].height,330);
    assert.equal(tile.querySelectorAll('.board-tile-item').length,24,'resizing reveals more indexed titles');
    Object.assign(globalThis,{innerWidth:1200,innerHeight:800});
    await act(async()=>tile.querySelector<HTMLButtonElement>('[aria-label="Whiteboard actions"]')!.click());
    await act(async()=>{document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click();body.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true}));});
    assert.deepEqual(opened,['Ideas','Ideas']);assert.equal(saved.length,2,'opening leaves geometry/history untouched');
    await act(async()=>{pointer(body,'pointerdown',100);pointer(tile,'pointercancel',185);});
    assert.equal(tile.classList.contains('dragging'),false);assert.equal(saved.length,2,'cancellation does not save');
  }finally{await act(async()=>root.unmount());}
});


test('card auto height defaults on, toggles at its measured height, and manual resizing fixes that height',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  let measuredHeight=560;
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,innerWidth:1200,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  Object.defineProperty(dom.window.HTMLElement.prototype,'offsetHeight',{get(){return this.classList.contains('collapsed')?70:measuredHeight;}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  const {Whiteboard}=await import('../src/renderer/Board'),{useState}=await import('react');
  const board:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[{id:'p',cardId:'c',x:0,y:0,width:340,height:280}],edges:[]};
  const cards=[{id:'c',path:'Ideas/card.md',name:'card',title:'Title',revision:'r',legacy:false}];
  window.door={assetUrl:(p:string)=>p,request:async()=>({...cards[0],body:'# Title\n\nBody'})} as unknown as typeof window.door;
  const saved:Board[]=[];let latest=board;
  function Fixture(){const [value,setValue]=useState(board);return <Whiteboard board={value} cards={cards} onOpen={()=>undefined} onCreate={()=>undefined} onSave={b=>{saved.push(b);latest=b;setValue(b);}}/>;}
  const root=createRoot(document.getElementById('root')!);
  const pointer=(target:Element,type:string,x:number,y:number)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
  const open=async()=>act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Card actions"]')!.click());
  const toggle=async()=>act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitemcheckbox]')!.click());
  try{
    await act(async()=>root.render(<Fixture/>));
    const card=document.querySelector<HTMLElement>('.board-card')!;
    assert.ok(card.classList.contains('auto-height'));assert.equal(card.style.height,'auto');
    assert.equal(saved.length,0,'measuring content does not add history entries');
    await open();
    assert.equal(document.querySelector('[role=menuitemcheckbox]')?.getAttribute('aria-checked'),'true');
    assert.equal(document.querySelector('[role=menuitemcheckbox]')?.hasAttribute('data-tooltip'),false,'the visible menu label is not repeated in a tooltip');
    await act(async()=>document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(!!document.querySelector('[role=menu]'),false);
    await open();await open();assert.equal(!!document.querySelector('[role=menu]'),false,'the same trigger toggles the menu');
    await open();await act(async()=>pointer(document.querySelector('.canvas')!,'pointerdown',900,700));
    assert.equal(!!document.querySelector('[role=menu]'),false,'outside press closes the menu');
    await act(async()=>pointer(document.querySelector('.canvas')!,'pointercancel',900,700));
    await open();await toggle();
    assert.equal(latest.cards[0].autoHeight,false);assert.equal(card.style.height,'560px');
    await open();assert.equal(document.querySelector('[role=menuitemcheckbox]')?.getAttribute('aria-checked'),'false');
    await toggle();assert.equal(latest.cards[0].autoHeight,true);assert.equal(card.style.height,'auto');
    await act(async()=>card.querySelector<HTMLButtonElement>('[aria-label="Collapse card"]')!.click());
    assert.equal(latest.cards[0].height,560,'collapse remembers expanded height independently');
    await open();await toggle();assert.equal(latest.cards[0].height,560,'switching mode while collapsed never saves the collapsed height');
    await act(async()=>card.querySelector<HTMLButtonElement>('[aria-label="Expand card"]')!.click());
    assert.equal(card.style.height,'560px');
    measuredHeight=720;await open();await toggle();
    await act(async()=>{pointer(card.querySelector('.resize-handle')!,'pointerdown',340,720);pointer(card,'pointerup',425,762.5);});
    assert.equal(latest.cards[0].autoHeight,false);assert.equal(latest.cards[0].height,770,'resizing starts from measured content height');assert.equal(latest.cards[0].width,440);
  }finally{await act(async()=>root.unmount());}
});


test('a tall auto-height card is measured before culling when the camera starts below its top',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  Object.defineProperty(dom.window.HTMLElement.prototype,'offsetHeight',{get(){return 3500;}});
  const {Whiteboard}=await import('../src/renderer/Board');
  const card={id:'c',path:'Ideas/card.md',name:'card',revision:'r',legacy:false};
  window.door={request:async()=>({...card,body:'# Tall note\n\nBody'})} as unknown as typeof window.door;
  const board:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[{id:'p',cardId:'c',x:0,y:-3000,width:340,height:280}],edges:[{id:'e',from:'p',to:'p'}]};
  const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<Whiteboard board={board} cards={[card]} onOpen={()=>undefined} onCreate={()=>undefined} onSave={()=>assert.fail('measurement must not save')}/>));
    assert.equal(document.querySelectorAll('.card-preview').length,1,'visible tail renders even when saved fallback height is offscreen');
    assert.match(document.querySelector('.edge-stroke')!.getAttribute('d')!,/^M 340 -1250 /,'edges use measured content height');
  }finally{await act(async()=>root.unmount());}
});


test('canvas menu captures board coordinates, preserves right-drag panning and restricts root creation',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,innerWidth:1200,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  const {Whiteboard}=await import('../src/renderer/Board');
  const board:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[],edges:[]},created:unknown[]=[];
  const root=createRoot(document.getElementById('root')!);
  const render=(value:Board)=>root.render(<Whiteboard board={value} cards={[]} initialCamera={{x:-100,y:50,zoom:.5}} onSave={()=>assert.fail('menu navigation must not save')} onOpen={()=>undefined} onCreate={(x,y)=>created.push(['card',x,y])} onCreateBoard={(x,y)=>created.push(['board',x,y])}/>);
  try{
    await act(async()=>render(board));
    const canvas=document.querySelector<HTMLElement>('.canvas')!;canvas.getBoundingClientRect=()=>({left:40,top:30,width:1000,height:600} as DOMRect);
    const pointer=(type:string,x=300,y=200)=>canvas.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:2,clientX:x,clientY:y}));
    const context=()=>canvas.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,button:2,clientX:300,clientY:200}));
    await act(async()=>{pointer('pointerdown');context();});assert.equal(document.querySelector('[role=menu]'),null,'press-time contextmenu waits for quiet release');
    await act(async()=>{pointer('pointerup');context();});
    assert.equal(document.querySelectorAll('[role=menu]').length,1);assert.equal(document.querySelector('[role=menu]')?.getAttribute('aria-label'),'Canvas actions');
    const choose=async(label:string)=>act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent===label)!.click());
    await choose('New card');assert.deepEqual(created,[['card',720,240]]);
    await act(async()=>{pointer('pointerdown');pointer('pointerup');});await choose('New whiteboard');assert.deepEqual(created.at(-1),['board',720,240]);
    await act(async()=>{pointer('pointerdown');context();pointer('pointermove',360,260);pointer('pointerup',360,260);context();});
    assert.equal(document.querySelector('[role=menu]'),null,'release-time contextmenu stays suppressed after right-drag');assert.equal(created.length,2);
    await act(async()=>{pointer('pointerdown');pointer('pointerup');});
    await act(async()=>document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role=menu]'),null);
    await act(async()=>render({...board,folder:'',path:'Workspace.whiteboard'}));
    await act(async()=>{pointer('pointerdown');pointer('pointerup');});assert.equal(document.querySelector<HTMLButtonElement>('[role=menuitem]')!.disabled,true,'mother whiteboard cannot contain cards');
    await act(async()=>document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true})));assert.equal(document.querySelector('[role=menu]'),null,'outside click dismisses canvas menu');
  }finally{await act(async()=>root.unmount());}
});

test('card menu and keyboard share deletion without intercepting text editing',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,innerWidth:1200,innerHeight:900,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  const {Whiteboard}=await import('../src/renderer/Board');
  const card={id:'c',name:'a',path:'Ideas/a.md',revision:'r',legacy:false,body:''};
  Object.assign(dom.window,{door:{request:async()=>card}});
  const board:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[{id:'p',cardId:'c',x:0,y:0,width:340,height:280}],edges:[]};
  const calls:{placements:string[];edges:string[]}[]=[],root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<Whiteboard board={board} cards={[card]} onSave={()=>undefined} onOpen={()=>undefined} onCreate={()=>undefined} onDelete={async(b,placements,edges)=>{assert.equal(b,board);calls.push({placements,edges});return false;}}/>));
    const menu=document.querySelector<HTMLButtonElement>('[aria-label="Card actions"]')!;
    await act(async()=>menu.click());
    const deletion=[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b=>b.textContent==='Delete card');assert.ok(deletion);
    await act(async()=>deletion.click());assert.deepEqual(calls,[{placements:['p'],edges:[]}]);
    const cardElement=document.querySelector<HTMLElement>('[data-placement="p"]')!;
    await act(async()=>{
      cardElement.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));
      cardElement.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true,button:0,clientX:100,clientY:100}));
    });
    assert.equal(document.querySelector('.selection-tools'),null);
    await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true})));
    assert.deepEqual(calls[1],calls[0],'keyboard and menu target the same card');
    const input=document.createElement('input');cardElement.append(input);
    await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Backspace',bubbles:true})));
    assert.equal(calls.length,2,'typing never deletes a card');input.remove();
  }finally{await act(async()=>root.unmount());}
});


test('search reveal expands and selects a card without editing or zooming, and card menus open standalone views',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,innerWidth:1000,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  const {Whiteboard}=await import('../src/renderer/Board'),{cardPlacement}=await import('../src/renderer/documents');
  const {useState}=await import('react');
  const board:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[{id:'p',cardId:'c',x:5000,y:3000,width:340,height:280,collapsed:true}],edges:[]};
  const card={id:'c',path:'Ideas/C.md',name:'C',title:'Card C',revision:'r',legacy:false};
  const reference={...board,path:'Other/Other.whiteboard',folder:'Other'};
  const snapshot={root:'/tmp',name:'Test',cards:[card],boards:[reference,board],issues:[],historyAvailable:true};
  assert.equal(cardPlacement(snapshot,'c')?.board,board);assert.equal(cardPlacement({...snapshot,boards:[reference]},'c')?.board,reference);assert.equal(cardPlacement({...snapshot,boards:[]},'c'),undefined);
  let saved=board,reveals=0;const opened:string[]=[];
  window.door={request:async()=>({...card,body:'# Card C'}),assetUrl:(p:string)=>p} as unknown as typeof window.door;
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,right:1000,bottom:800,width:1000,height:800,toJSON(){}};};
  const root=createRoot(document.getElementById('root')!);
  function Fixture({token}:{token:number}){const [b,setBoard]=useState(board);return <Whiteboard board={b} cards={[card]} initialCamera={{x:0,y:0,zoom:.5}} reveal={{placement:'p',token}} onRevealed={()=>reveals++} onOpen={()=>assert.fail('reveal must not edit')} onOpenCard={(id,mode)=>opened.push(id+':'+mode)} onCreate={()=>undefined} onSave={next=>{saved=next;setBoard(next);}}/>;}
  try{
    await act(async()=>root.render(<Fixture token={1}/>));
    assert.equal(saved.cards[0].collapsed,false);assert.equal(reveals,1);
    const cardElement=document.querySelector<HTMLElement>('.board-card')!;assert.ok(cardElement.classList.contains('selected'));assert.ok(!cardElement.classList.contains('editing'));
    assert.match(document.querySelector<HTMLElement>('.board-world')!.style.transform,/scale\(0.5\)/);
    assert.notEqual(document.querySelector<HTMLElement>('.board-world')!.style.transform,'translate(0px, 0px) scale(0.5)');
    await act(async()=>root.render(<Fixture token={2}/>));assert.equal(reveals,2);
    await act(async()=>cardElement.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100})));
    await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Open in same tab')!.click());assert.deepEqual(opened,['c:same']);
    await act(async()=>cardElement.querySelector<HTMLButtonElement>('.card-more')!.click());
    await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Open in another Tab Group')!.click());assert.deepEqual(opened,['c:same','c:other']);
  }finally{await act(async()=>root.unmount());}
});
