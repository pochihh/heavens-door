import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Board, Edge } from '../src/shared';
import { readBoard, writeBoard } from '../src/core/format';
import { Workspace } from '../src/core/workspace';
import { UndoHistory } from '../src/renderer/history';
import { defaultDocks, validateDocks } from '../src/layout';
import { StyleView } from '../src/renderer/StyleView';
import { Session } from '../src/renderer/session';

test('edges and styles round-trip independently of indexed mentions, including undo and old layouts',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-edges-'));const root=join(dir,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Ideas');await w.create('Ideas','a',0,0);await w.create('Ideas','b',500,0);
  const a=await w.card('Ideas/a.md'),b=await w.card('Ideas/b.md');
  await w.saveCard(a.path,`# A\n[mention](card:${b.id})\n[again](card:${b.id})\n\n\`\`\`\n[ignored](card:${a.id})\n\`\`\``,a.revision);
  const board=w.snapshot().boards.find(b=>b.folder==='Ideas')!;
  assert.deepEqual(w.boardMentions(board.path).map(r=>({...r})),[{from:a.id,to:b.id}]);
  const edge:Edge={id:'edge',from:board.cards[0].id,to:board.cards[1].id,fromSide:'right',toSide:'left',fromArrowhead:'triangle-outline',toArrowhead:'arrow',label:'Related',labelSize:18,strokeColor:'#7950f2',strokeWidth:4,strokeStyle:'dashed'};
  const styled:Board={...board,showMentions:false,mentionStyle:{strokeColor:'#e03131',strokeStyle:'dotted'},canvasColor:'#18181b',edges:[edge],cards:board.cards.map(p=>({...p,fillColor:'#153e75',strokeStyle:'dotted',strokeWidth:2}))};
  const decoded=readBoard(board.path,writeBoard(styled));assert.deepEqual(decoded.edges,[edge]);assert.equal(decoded.cards[0].fillColor,'#153e75');assert.equal(decoded.showMentions,false);
  const before=await w.read(a.path),undo=new UndoHistory();const mutation=await w.saveBoard(styled,board.revision);undo.record('Style',mutation.edits);
  assert.equal(await w.read(a.path),before,'visual edges never write mentions into notes');
  assert.equal(w.boardMentions(board.path).length,1,'visibility and edges do not change indexed mentions');
  await undo.travel(false,changes=>w.write(changes));assert.equal(w.snapshot().boards.find(b=>b.path===board.path)!.edges.length,0);
  await undo.travel(true,changes=>w.write(changes));assert.equal(w.snapshot().boards.find(b=>b.path===board.path)!.edges[0].label,'Related');
  assert.throws(()=>writeBoard({...styled,edges:[{...edge,strokeColor:'url(https://example.com)'}]}),/Invalid whiteboard style/);
  assert.throws(()=>writeBoard({...styled,edges:[{...edge,strokeWidth:NaN}]}),/Invalid whiteboard style/);
  const old=defaultDocks();old.right.groups[0].tabs=['agent','history'];old.right.groups[0].active='history';
  const migrated=validateDocks(old);assert.deepEqual(migrated.right.groups[0].tabs,['agent','history','style']);assert.equal(migrated.right.groups[0].active,'history');assert.equal(old.right.groups[0].tabs.length,2);
});

test('anchor clicks, dragging, reconnection, cancellation and deletion work for cards and whiteboards',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  const errors:unknown[]=[];dom.window.addEventListener('error',e=>{errors.push(e.error);e.preventDefault();});
  const {Whiteboard}=await import('../src/renderer/Board');
  let current:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[0,1,2].map(i=>({id:`p${i}`,cardId:`c${i}`,x:i*500,y:0,width:340,height:280,...(i===2?{folder:'Ideas/Child'}:{})})),edges:[]};
  let writes=0;const root=createRoot(document.getElementById('root')!);
  function Harness(){const [board,setBoard]=useState(current);return <Whiteboard board={board} cards={[]} initialCamera={{x:0,y:0,zoom:1}} onSave={b=>{current=b;writes++;setBoard(b);}} onOpen={()=>assert.fail('connecting must not edit content')} onCreate={()=>assert.fail('connecting must not create cards')}/>;}
  const pointer=(target:EventTarget,type:string,x:number,y:number,button=0)=>{const event=new dom.window.MouseEvent(type,{bubbles:true,button,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);};
  const press=async(target:EventTarget,x:number,y:number)=>act(async()=>{pointer(target,'pointerdown',x,y);pointer(document,'pointerup',x,y);});
  const anchor=(id:string,side:string)=>document.querySelector(`[data-anchor-card="${id}"][data-anchor-side="${side}"]`)!;
  try{
    await act(async()=>root.render(<Harness/>));
    await press(document.querySelector('[data-placement="p0"]')!,100,100);
    await press(anchor('p0','right'),340,140);assert.equal(writes,0);
    assert.equal(document.querySelectorAll('.edge-anchor').length,12,'destinations reveal anchors');
    await press(anchor('p1','left'),500,140);assert.equal(current.edges.length,1);assert.equal(current.edges[0].fromSide,'right');assert.equal(current.edges[0].toSide,'left');
    assert.match(document.querySelector('.edge-stroke')!.getAttribute('d')!,/ C /);
    await act(async()=>{pointer(document.querySelector('[aria-label="End endpoint"]')!,'pointerdown',500,140);pointer(document,'pointermove',1000,140);pointer(document,'pointerup',1000,140);});
    assert.equal(current.edges[0].to,'p2','endpoint can reconnect to a whiteboard tile');
    await press(document.querySelector('[data-placement="p1"]')!,600,100);
    await act(async()=>{pointer(anchor('p1','right'),'pointerdown',840,140);pointer(document,'pointermove',1100,20);pointer(document,'pointerup',1100,20);});
    assert.equal(current.edges.length,2,'drag-to-body creates a second edge');assert.equal(current.edges[1].toSide,'top');
    await press(document.querySelector('[data-placement="p1"]')!,600,100);
    await press(anchor('p1','top'),670,0);await press(anchor('p1','bottom'),670,280);
    assert.equal(writes,3,'clicking another anchor on the source does not create a self-edge');
    await press(anchor('p1','top'),670,0);
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('.edge-handles')!.classList.contains('connecting'),false);assert.equal(writes,3);
    await press(document.querySelector('.edge-hit')!,420,140);
    await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true})));
    assert.equal(current.edges.length,1);assert.deepEqual(errors,[]);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Style View exposes only common options and applies mixed stroke changes to every selected item',async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const board:Board={path:'b.whiteboard',folder:'',name:'B',revision:'r',cards:[{id:'a',cardId:'a',x:0,y:0,width:300,height:200},{id:'b',cardId:'b',x:500,y:0,width:300,height:200,folder:'Child'}],edges:[{id:'e',from:'a',to:'b',strokeColor:'#e03131'}]};
  let saved:Board|undefined;const session={board:async(b:Board)=>{saved=b;}} as Pick<Session,'board'>;
  const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<StyleView board={board} selection={{path:board.path,cards:['a','b'],edges:['e']}} session={session}/>));
    const labels=[...document.querySelectorAll('legend,.style-choice>span')].map(n=>n.textContent);
    assert.ok(labels.includes('Stroke color'));assert.ok(!labels.includes('Fill'));assert.ok(!labels.includes('End arrowhead'));assert.ok(!labels.includes('Auto height'));
    await act(async()=>{document.querySelector<HTMLButtonElement>('[aria-label="#7950f2"]')!.click();});
    assert.equal(saved?.edges[0].strokeColor,'#7950f2');assert.ok(saved?.cards.every(c=>c.strokeColor==='#7950f2'));
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
