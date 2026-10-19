import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {act,useState} from 'react';
import {Workspace} from '../src/core/workspace';
import {readBoard,writeBoard} from '../src/core/format';
import {UndoHistory} from '../src/renderer/history';
import type {Board} from '../src/shared';

const observers:{target:Element;callback:ResizeObserverCallback}[]=[];
const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});after(()=>dom.window.close());
Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,CustomEvent:dom.window.CustomEvent,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{constructor(private callback:ResizeObserverCallback){}observe(target:Element){observers.push({target,callback:this.callback});}disconnect(){}}});
dom.window.HTMLElement.prototype.setPointerCapture=()=>{};dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;document.elementFromPoint=()=>null;
window.door={platform:'darwin',assetUrl:p=>p} as typeof window.door;
const {createRoot}=await import('react-dom/client');
const topic=(id:string,text='Topic')=>({id,cardId:'',x:100,y:100,width:240,height:80,object:{type:'text' as const,text,shape:'none' as const}});
const fixture=():Board=>({path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[topic('root','Root')],edges:[]});
const pointer=(target:EventTarget,type:string,x:number,y:number)=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);};
const press=(target:Element,x=120,y=120)=>{pointer(target,'pointerdown',x,y);pointer(document,'pointerup',x,y);};

test('branch structure round-trips and rejects multiple parents and cycles while arbitrary cross-links remain valid',()=>{
 const board={...fixture(),cards:[topic('root'),topic('child'),topic('other')],edges:[{id:'branch',from:'root',to:'child',kind:'branch' as const}]};
 assert.deepEqual(readBoard(board.path,writeBoard(board)).edges,board.edges);
 assert.doesNotThrow(()=>writeBoard({...board,edges:[...board.edges,{id:'link',from:'child',to:'root'}]}));
 assert.throws(()=>writeBoard({...board,edges:[...board.edges,{id:'another',from:'other',to:'child',kind:'branch'}]}),/one parent/);
 assert.throws(()=>writeBoard({...board,edges:[...board.edges,{id:'cycle',from:'child',to:'root',kind:'branch'}]}),/cycle/);
 assert.throws(()=>writeBoard({...board,edges:[{id:'bad',from:'root',to:'child',kind:'bad' as 'branch'}]}));
});

test('conversion preserves text, position, color, placement identity and all connections as one reversible transaction',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-topics-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'index'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.createFolder('','Board');let board=w.snapshot().boards.find(b=>b.folder==='Board')!;
 const original={...topic('root','A [plan]*\nSecond line > text'),fillColor:'#91aa8b'},child=topic('child');
 await w.saveBoard({...board,cards:[original,child],edges:[{id:'branch',from:'root',to:'child',kind:'branch'},{id:'cross',from:'child',to:'root',label:'Related'}]},board.revision);board=w.snapshot().boards.find(b=>b.folder==='Board')!;
 const converted=await w.convertTopic(board.path,board.revision,'root'),created=converted.snapshot.cards.find(c=>c.path.startsWith('Board/'))!,card=await w.card(created.path),placed=converted.snapshot.boards.find(b=>b.path===board.path)!;
 assert.equal(card.title,'A [plan]*');assert.match(card.body,/Second line \\> text/);assert.equal(card.fillColor,original.fillColor);assert.equal(card.source,undefined);assert.deepEqual(placed.edges,board.edges);
 assert.equal(placed.cards[0].id,original.id);assert.equal(placed.cards[0].object,undefined);assert.equal(placed.cards[0].cardId,card.id);assert.equal(placed.cards[0].x,original.x);assert.equal(placed.cards[0].y,original.y);assert.ok(placed.cards[0].width>=340);
 const history=new UndoHistory();history.record('Convert',converted.edits);await history.travel(false,changes=>w.write(changes));assert.deepEqual(w.snapshot().boards.find(b=>b.path===board.path)!.cards[0],original);assert.equal(w.snapshot().cards.some(c=>c.id===card.id),false);
 await history.travel(true,changes=>w.write(changes));assert.equal(w.snapshot().cards.find(c=>c.id===card.id)?.title,'A [plan]*');
 await assert.rejects(()=>w.convertTopic(board.path,board.revision,'child'),/changed/);
 const latest=w.snapshot().boards.find(b=>b.path===board.path)!;await fs.appendFile(join(root,latest.path),'\nExternal edit');const count=w.snapshot().cards.length;await assert.rejects(()=>w.convertTopic(latest.path,latest.revision,'child'),/chang|conflict/i);assert.equal(w.snapshot().cards.length,count);assert.equal((await fs.readdir(join(root,'Board'))).filter(n=>n.endsWith('.md')).length,1,'a conflict creates no orphan Markdown file');
});

test('a released connector stays live on empty canvas and double-click creates a topic and edge atomically',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');let saved=fixture(),writes=0,ordinary=0;const root=createRoot(document.getElementById('root')!);
 function Harness(){const [board,setBoard]=useState(saved);return <Whiteboard board={board} cards={[]} initialCamera={{x:10,y:20,zoom:.5}} onSave={next=>{saved=next;writes++;setBoard(next);}} onOpen={()=>{}} onCreate={()=>ordinary++}/>;}
 try{await act(async()=>root.render(<Harness/>));const canvas=document.querySelector<HTMLElement>('.canvas')!;canvas.getBoundingClientRect=()=>({left:40,top:30,width:1000,height:700} as DOMRect);
  await act(async()=>press(document.querySelector('[data-placement="root"]')!));const anchor=document.querySelector('[data-anchor-card="root"][data-anchor-side="right"]')!;
  await act(async()=>{pointer(anchor,'pointerdown',220,100);pointer(document,'pointermove',800,400);pointer(document,'pointerup',800,400);});assert.ok(document.querySelector('.edge-handles.connecting'));assert.equal(writes,0);
  await act(async()=>document.querySelector('[aria-label="New topic"]')!.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:800,clientY:400})));assert.equal(writes,0,'double-clicking a control is not empty-canvas creation');
  await act(async()=>{pointer(canvas,'pointerdown',800,400);pointer(document,'pointerup',800,400);canvas.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:800,clientY:400}));});
  assert.equal(writes,1);assert.equal(ordinary,0);assert.equal(saved.cards.length,2);assert.equal(saved.edges.length,1);assert.equal(saved.edges[0].kind,'branch');assert.equal(saved.edges[0].from,'root');assert.equal(saved.edges[0].to,saved.cards[1].id);assert.equal(saved.cards[1].x,1500);assert.equal(saved.cards[1].y,700);assert.ok(document.querySelector('textarea[aria-label="Edit whiteboard text"]'));assert.equal(document.querySelector('.edge-handles.connecting'),null);
 }finally{await act(async()=>root.unmount());}
});

test('selected topics create children and siblings, while typing keeps ordinary Tab/Enter behavior',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');let saved=fixture(),writes=0;const root=createRoot(document.getElementById('root')!);
 function Harness(){const [board,setBoard]=useState(saved);return <Whiteboard board={board} cards={[]} onSave={next=>{saved=next;writes++;setBoard(next);}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 const key=(target:Element,key:string)=>target.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 try{await act(async()=>root.render(<Harness/>));const canvas=document.querySelector('.canvas')!;await act(async()=>press(document.querySelector('[data-placement="root"]')!));await act(async()=>key(canvas,'Tab'));
  const child=saved.cards[1];assert.equal(writes,1);assert.equal(saved.edges[0].from,'root');assert.equal(saved.edges[0].to,child.id);
  const editor=document.querySelector('textarea')!;await act(async()=>{key(editor,'Enter');key(editor,'Tab');});assert.equal(writes,1,'text editing never creates branches');await act(async()=>key(editor,'Escape'));assert.equal(document.activeElement,canvas,'finishing an edit returns focus to the board');await act(async()=>key(canvas,'Enter'));
  assert.equal(saved.cards.length,3);assert.equal(saved.edges[1].from,'root','a sibling shares its parent');assert.ok(saved.cards[2].y>child.y);assert.equal(saved.edges[1].kind,'branch');
  const measured=document.querySelector('.topic-measure');assert.ok(measured,'edit mode retains the text mirror that defines compact bounds');
 }finally{await act(async()=>root.unmount());}
});


test('normal Quit commits a focused topic control before closing the window',async()=>{
 const {Session}=await import('../src/renderer/session');let close!:(action:'close')=>void;const order:string[]=[];
 const session=new Session({onClosing:(callback:(action:import('../src/shared').WindowAction)=>void)=>{close=callback;return()=>{};},finishClosing:()=>order.push('close'),cancelClosing:()=>assert.fail('closing must save successfully')} as unknown as import('../src/shared').Bridge);
 const control=document.createElement('textarea');document.body.append(control);control.onblur=()=>{void session.run(async()=>{order.push('save');});};control.focus();session.connectWindow();close('close');await session.run(async()=>{});assert.deepEqual(order,['save','close']);control.remove();
});


test('manual connectors use compact topic bounds without persisting their narrow display widths',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');let saved:Board={...fixture(),cards:[topic('root','A'),{...topic('other','B'),x:500}]};const root=createRoot(document.getElementById('root')!);
 function Harness(){const [board,setBoard]=useState(saved);return <Whiteboard board={board} cards={[]} initialCamera={{x:0,y:0,zoom:1}} onSave={next=>{assert.doesNotThrow(()=>writeBoard(next));saved=next;setBoard(next);}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 try{await act(async()=>root.render(<Harness/>));const node=document.querySelector<HTMLElement>('[data-placement="root"]')!;Object.defineProperty(node,'offsetWidth',{value:40});Object.defineProperty(node,'offsetHeight',{value:23});await act(async()=>observers.find(o=>o.target===node)!.callback([],{} as ResizeObserver));await act(async()=>press(node,110,110));assert.equal(document.querySelector('[data-anchor-card="root"][data-anchor-side="right"]')!.getAttribute('cx'),'140');
  await act(async()=>press(document.querySelector('[data-anchor-card="root"][data-anchor-side="right"]')!,140,111));await act(async()=>press(document.querySelector('[data-anchor-card="other"][data-anchor-side="left"]')!,500,111));assert.equal(saved.edges.length,1);assert.equal(saved.cards[0].width,240);assert.equal(saved.cards[1].width,240);
 }finally{await act(async()=>root.unmount());}
});
