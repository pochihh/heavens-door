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
  await act(async()=>document.querySelector('[aria-label="Style the selection"]')!.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:800,clientY:400})));assert.equal(writes,0,'double-clicking a control is not empty-canvas creation');
  await act(async()=>{pointer(canvas,'pointerdown',800,400);pointer(document,'pointerup',800,400);canvas.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true,cancelable:true,clientX:800,clientY:400}));});
  assert.equal(writes,1);assert.equal(ordinary,0);assert.equal(saved.cards.length,2);assert.equal(saved.edges.length,1);assert.equal(saved.edges[0].kind,'branch');assert.equal(saved.edges[0].from,'root');assert.equal(saved.edges[0].to,saved.cards[1].id);assert.equal(saved.cards[1].x,1500);assert.equal(saved.cards[1].y,700);assert.ok(document.querySelector('textarea[aria-label="Edit whiteboard text"]'));assert.equal(document.querySelector('.edge-handles.connecting'),null);
 }finally{await act(async()=>root.unmount());}
});

test('editing text creates children and siblings directly, preserving drafts, focus, line breaks and IME input',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');let saved=fixture(),writes=0;const root=createRoot(document.getElementById('root')!);
 function Harness(){const [board,setBoard]=useState(saved);return <Whiteboard textDefaults={{fontSize:28,textColor:'#e96a45'}} board={board} cards={[]} onSave={(next,_label,base)=>{assert.deepEqual(base,saved,'each edit starts from the actual saved layout');saved=next;writes++;setBoard(next);}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 const key=(target:Element,key:string,options:KeyboardEventInit={})=>target.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
 const editor=()=>document.querySelector<HTMLTextAreaElement>('textarea')!;
 const type=(text:string)=>{const input=editor();Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{await act(async()=>root.render(<Harness/>));const canvas=document.querySelector('.canvas')!;await act(async()=>press(document.querySelector('[data-placement="root"]')!));await act(async()=>key(canvas,'Tab'));
  const child=saved.cards[1];assert.equal(child.object?.type==='text'&&child.object.fontSize,28);assert.equal(child.object?.type==='text'&&child.object.textColor,'#e96a45');assert.equal(saved.cards[0].object?.type==='text'&&saved.cards[0].object.fontSize,undefined,'existing text is unchanged');assert.equal(writes,1);assert.equal(saved.edges[0].from,'root');assert.equal(saved.edges[0].to,child.id);
  await act(async()=>type('Child draft'));editor().setSelectionRange(5,5);
  await act(async()=>key(editor(),'Enter',{altKey:true}));assert.equal(editor().value,'Child\n draft');assert.equal(writes,1,'Alt+Enter stays in the current text');
  await act(async()=>key(editor(),'Enter',{isComposing:true}));await act(async()=>key(editor(),'Tab',{isComposing:true}));await act(async()=>key(editor(),'Enter',{repeat:true}));assert.equal(writes,1,'composition and held shortcuts never create text');
  await act(async()=>key(editor(),'Tab'));
  const grandchild=saved.cards[2];assert.equal(writes,2,'saving the draft and creating the child is one operation');assert.equal(saved.cards[1].object?.type==='text'&&saved.cards[1].object.text,'Child\n draft');assert.equal(saved.edges[1].from,child.id);assert.equal(saved.edges[1].to,grandchild.id);assert.equal(document.activeElement,editor());
  await act(async()=>type('Grandchild draft'));await act(async()=>key(editor(),'Enter'));
  assert.equal(writes,3);assert.equal(saved.cards.length,4);assert.equal(saved.cards[2].object?.type==='text'&&saved.cards[2].object.text,'Grandchild draft');assert.equal(saved.edges[2].from,child.id,'a sibling shares its parent');assert.equal(saved.edges[2].to,saved.cards[3].id);assert.ok(saved.cards[3].y>grandchild.y);assert.equal(document.activeElement,editor());
  assert.ok(document.querySelector('.topic-measure'),'editing retains compact bounds');
  await act(async()=>key(editor(),'Escape'));assert.equal(document.activeElement,canvas);await act(async()=>press(document.querySelector('[data-placement="root"]')!));await act(async()=>document.querySelector('[data-placement="root"]')!.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true})));
  await act(async()=>type('Updated root'));await act(async()=>key(editor(),'Enter'));assert.equal(saved.cards[0].object?.type==='text'&&saved.cards[0].object.text,'Updated root');assert.equal(saved.edges.length,3,'a root sibling is independent');assert.equal(saved.cards.length,5);
  await act(async()=>type('Commit only'));await act(async()=>key(editor(),'Enter',{metaKey:true}));assert.equal(saved.cards.length,5);assert.equal(saved.cards[4].object?.type==='text'&&saved.cards[4].object.text,'Commit only');assert.equal(document.activeElement,canvas);
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
 try{await act(async()=>root.render(<Harness/>));const node=document.querySelector<HTMLElement>('[data-placement="root"]')!;Object.defineProperty(node,'offsetWidth',{value:40});Object.defineProperty(node,'offsetHeight',{value:23});await act(async()=>observers.find(o=>o.target===node)!.callback([],{} as ResizeObserver));await act(async()=>press(node,110,110));assert.equal(document.querySelector('[data-anchor-card="root"][data-anchor-side="right"]')!.getAttribute('cx'),'148');
  await act(async()=>press(document.querySelector('[data-anchor-card="root"][data-anchor-side="right"]')!,140,111));await act(async()=>{pointer(document,'pointermove',500,111);await new Promise(r=>setTimeout(r,25));});await act(async()=>press(document.querySelector('[data-anchor-card="other"][data-anchor-side="left"]')!,500,111));assert.equal(saved.edges.length,1);assert.equal(saved.cards[0].width,240);assert.equal(saved.cards[1].width,240);
 }finally{await act(async()=>root.unmount());}
});


test('plain text connectors leave an eight-pixel gap on all sides without changing card or shape anchors',async()=>{
 const {anchor,edgeGeometry}=await import('../src/renderer/edge-geometry');
 const a=topic('text'),b={...topic('next'),x:500};
 assert.deepEqual(anchor(a,'left',40),{x:92,y:120});assert.deepEqual(anchor(a,'right',40),{x:348,y:120});
 assert.deepEqual(anchor(a,'top',40),{x:220,y:92});assert.deepEqual(anchor(a,'bottom',40),{x:220,y:148});
 const edge=edgeGeometry({id:'e',from:a.id,to:b.id,fromSide:'right',toSide:'left'},a,b,()=>40);
 assert.deepEqual(edge.start,{x:348,y:120});assert.deepEqual(edge.end,{x:492,y:120});
 assert.deepEqual(anchor({...a,object:undefined},'right',40),{x:340,y:120});
 assert.deepEqual(anchor({...a,object:{...a.object,shape:'rectangle'}},'right',40),{x:340,y:120});
});


test('whiteboard text defaults round-trip through settings and reject invalid sizes and colors',async()=>{
 const {defaultPreferences,validatePreferences}=await import('../src/core/preferences');
 const prefs=validatePreferences({...defaultPreferences(),whiteboardText:{fontSize:28,textColor:'#e96a45'}});
 assert.deepEqual(validatePreferences(JSON.parse(JSON.stringify(prefs))).whiteboardText,{fontSize:28,textColor:'#e96a45'});
 assert.equal(validatePreferences(defaultPreferences()).whiteboardText,undefined);
 assert.deepEqual(validatePreferences({...defaultPreferences(),whiteboardText:{fontSize:28,type:'image',shape:'diamond'}}).whiteboardText,{fontSize:28,textColor:undefined},'extra settings keys cannot change the object kind');
 for(const value of [null,[],{fontSize:7},{fontSize:121},{fontSize:NaN},{fontSize:'20'},{textColor:'red'},{textColor:'url(https://example.com)'}])assert.throws(()=>validatePreferences({...defaultPreferences(),whiteboardText:value}),/Invalid whiteboard text defaults/);
});


test('Text branch endpoints reconnect to any element and leave their former text as an orphan',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');
 let saved:Board={...fixture(),cards:[{...topic('root','Root'),x:0,y:0},{...topic('leaf','Leaf'),x:400,y:0},{...topic('claimed','Has a parent'),x:400,y:200},{id:'card',cardId:'note',x:800,y:0,width:240,height:160},{id:'board',cardId:'',folder:'Board/Child',x:800,y:240,width:240,height:160},{...topic('shape','Shape'),x:0,y:400,object:{type:'text',text:'Shape',shape:'ellipse'}},{id:'image',cardId:'',x:400,y:400,width:240,height:160,object:{type:'image',html:'<figure data-better-edit-image="true"><img src="image.png"></figure>'}}],edges:[{id:'moving',kind:'branch',from:'root',to:'leaf',fromSide:'right',toSide:'left',strokeColor:'#80aaa6',strokeStyle:'dashed',strokeWidth:4},{id:'existing',kind:'branch',from:'root',to:'claimed'}]};
 const ids=saved.cards.map(p=>p.id),root=createRoot(document.getElementById('root')!);
 function Harness(){const [board,setBoard]=useState(saved);return <Whiteboard board={board} cards={[]} initialCamera={{x:0,y:0,zoom:1}} onSave={next=>{assert.doesNotThrow(()=>writeBoard(next));saved=next;setBoard(next);}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 const edge=()=>saved.edges.find(e=>e.id==='moving')!;
 const reconnect=async(endpoint:'Start'|'End',id:string)=>{
  const target=saved.cards.find(p=>p.id===id)!,handle=document.querySelector('[aria-label="'+endpoint+' endpoint"]')!;
  assert.ok(handle);const x=Number(handle.getAttribute('cx')),y=Number(handle.getAttribute('cy'));
  await act(async()=>{pointer(handle,'pointerdown',x,y);pointer(document,'pointermove',target.x+20,target.y+20);pointer(document,'pointerup',target.x+20,target.y+20);});
 };
 try{await act(async()=>root.render(<Harness/>));await act(async()=>press(document.querySelector('[data-edge="moving"] .edge-hit')!,320,40));
  await reconnect('End','card');assert.equal(edge().to,'card');assert.equal(edge().kind,'branch','valid reparenting retains quick-add structure');
  await reconnect('End','claimed');assert.equal(edge().to,'claimed','a pre-existing parent does not block a visual connection');assert.equal(edge().kind,undefined,'a conflicting branch becomes an ordinary connector');assert.ok(saved.edges.some(e=>e.id==='existing'&&e.to==='claimed'));
  for(const id of ['card','board','shape','image','leaf']){await reconnect('End',id);assert.equal(edge().to,id);assert.deepEqual(saved.cards.map(p=>p.id),ids,'rewiring never removes the old text or other elements');}
  await reconnect('Start','card');assert.equal(edge().from,'card');assert.equal(edge().to,'leaf');assert.equal(edge().strokeColor,'#80aaa6');assert.equal(edge().strokeStyle,'dashed');assert.equal(edge().strokeWidth,4);
  await reconnect('End','card');assert.equal(edge().to,'leaf','self-connections cancel without losing the old arrow');
  assert.equal(saved.edges.length,2);
  await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true})));
  assert.ok(!saved.edges.some(e=>e.id==='moving'));assert.deepEqual(saved.cards.map(p=>p.id),ids,'removing an arrow leaves every text item on the board');
 }finally{await act(async()=>root.unmount());}
});


test('dragging shows anchors only for the nearest candidate and clears them on empty canvas',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');const root=createRoot(document.getElementById('root')!);
 const board:Board={...fixture(),cards:[{...topic('source'),x:0,y:0},{...topic('near'),x:500,y:0},{...topic('far'),x:900,y:0}],edges:[]};
 const shown=()=>[...new Set([...document.querySelectorAll('[data-anchor-card]')].map(el=>el.getAttribute('data-anchor-card')))];
 const move=async(x:number,y:number)=>act(async()=>{pointer(document,'pointermove',x,y);await new Promise(r=>setTimeout(r,25));});
 try{await act(async()=>root.render(<Whiteboard board={board} cards={[]} initialCamera={{x:0,y:0,zoom:.5}} onSave={()=>{}} onOpen={()=>{}} onCreate={()=>{}}/>));
  await act(async()=>press(document.querySelector('[data-placement="source"]')!,20,20));const source=document.querySelector('[data-anchor-card="source"][data-anchor-side="right"]')!;
  await act(async()=>pointer(source,'pointerdown',124,20));await move(400,200);assert.deepEqual(shown(),[],'distant elements stay uncluttered');
  await move(240,20);assert.deepEqual(shown(),['near'],'nearby means screen pixels and appears before the actual drop snap');assert.equal(document.querySelectorAll('.edge-anchor').length,4);
  await move(440,20);assert.deepEqual(shown(),['far'],'moving between candidates replaces their anchors');
  await move(400,200);assert.deepEqual(shown(),[]);
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.deepEqual(shown(),[],'cancel clears selection and target hints');
  await act(async()=>press(document.querySelector('[data-placement="source"]')!,20,20));assert.deepEqual(shown(),['source'],'idle selection still exposes its own anchors');
  const keyboardSource=document.querySelector('[data-anchor-card="source"][data-anchor-side="right"]')!;await act(async()=>keyboardSource.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.deepEqual(shown(),['source','near','far'],'keyboard users can still tab through destinations');assert.equal(keyboardSource.isConnected,true,'the focused keyboard anchor is never unmounted');
 }finally{await act(async()=>root.unmount());}
});


test('canvas creation menu has one Text action and the navigation controls have no creation buttons',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');Object.assign(globalThis,{innerWidth:1000,innerHeight:800});let saved=fixture();const root=createRoot(document.getElementById('root')!);
 function Harness(){const [board,setBoard]=useState(saved);return <Whiteboard board={board} cards={[]} initialCamera={{x:20,y:40,zoom:.5}} onSave={next=>{saved=next;setBoard(next);}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 try{await act(async()=>root.render(<Harness/>));
  assert.equal(document.querySelector('.canvas-controls [aria-label="New text"],.canvas-controls [aria-label="Add image"]'),null);
  await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:200})));
  assert.deepEqual([...document.querySelectorAll('[role=menuitem]')].map(n=>n.textContent),['New card','New whiteboard','New text','Image or figure']);
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(n=>n.textContent==='New text')!.click());
  assert.equal(saved.cards.length,2);assert.equal(saved.cards[1].object?.type,'text');assert.equal(saved.cards[1].object?.type==='text'&&saved.cards[1].object.shape,'none');assert.equal(saved.cards[1].x,560);assert.equal(saved.cards[1].y,320);assert.ok(document.querySelector('[aria-label="Edit whiteboard text"]'));
 }finally{await act(async()=>root.unmount());}
});


test('Text shapes render their stored border settings and keep independent fill data',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');const shapes=['none','rectangle','rounded','ellipse','diamond'] as const;
 const board:Board={...fixture(),cards:shapes.map((shape,i)=>({...topic(shape,shape),x:i*260,y:0,height:120,fillColor:'#91aa8b',strokeColor:'#c9838a',strokeWidth:4,strokeStyle:'dotted',object:{type:'text',shape,text:shape}}))};
 assert.deepEqual(readBoard(board.path,writeBoard(board)).cards,board.cards,'all text fills and strokes remain portable, including plain Text');
 const root=createRoot(document.getElementById('root')!);try{await act(async()=>root.render(<Whiteboard board={board} cards={[]} onSave={()=>{}} onOpen={()=>{}} onCreate={()=>{}}/>));
  for(const shape of shapes){const item=document.querySelector<HTMLElement>(`[data-placement="${shape}"]`)!;assert.equal(item.style.getPropertyValue('--object-border-color'),'#c9838a');assert.equal(item.style.getPropertyValue('--object-border-width'),'4px');assert.equal(item.style.getPropertyValue('--object-border-style'),'dotted');}
  const diamond=document.querySelector('.object-diamond')!,polygon=diamond.querySelector('.object-stroke')!;assert.equal(diamond.getAttribute('viewBox'),'0 0 240 120');assert.equal(polygon.getAttribute('stroke'),'#c9838a');assert.equal(polygon.getAttribute('stroke-width'),'4');assert.equal(polygon.getAttribute('stroke-dasharray'),'0 12');assert.equal(polygon.getAttribute('stroke-linecap'),'round');assert.equal(polygon.getAttribute('points'),'120,2 238,60 120,118 2,60');
  await act(async()=>press(document.querySelector('[data-placement="diamond"]')!));const highlight=diamond.querySelector('.edge-selection')!;assert.ok(highlight);assert.equal(highlight.getAttribute('points'),polygon.getAttribute('points'));assert.equal(highlight.getAttribute('stroke-width'),'9');
  const plain=document.querySelector<HTMLElement>('[data-placement="none"]')!;assert.ok(plain.classList.contains('board-text'));assert.equal(plain.querySelector('.object-diamond'),null);assert.equal(plain.style.background,'transparent');
 }finally{await act(async()=>root.unmount());}
});

test('batch Text conversion reserves duplicate names, preserves graph identity, and undoes as one transaction',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-text-batch-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.createFolder('','Board');await w.create('Board','Same',0,0);let board=w.snapshot().boards.find(b=>b.folder==='Board')!;
 const original={...board,cards:[...board.cards,{...topic('a','Same\nFirst body'),x:100,y:200,fillColor:'#91aa8b',strokeColor:'#c9838a',strokeWidth:4,strokeStyle:'dotted' as const},{...topic('b','Same\nSecond body'),x:500,y:300},topic('keep','Keep')],edges:[{id:'branch',kind:'branch' as const,from:'a',to:'b'},{id:'cross',from:'b',to:board.cards[0].id,label:'Keep connection'}]};
 await w.saveBoard(original,board.revision);board=w.snapshot().boards.find(b=>b.path===board.path)!;const files=await fs.readdir(join(root,'Board'));
 for(const ids of [[],['a','a'],['a','missing'],['a',board.cards[0].id]])await assert.rejects(()=>w.convertTopic(board.path,board.revision,ids));
 assert.deepEqual(await fs.readdir(join(root,'Board')),files,'invalid batches create no files');
 const {Session}=await import('../src/renderer/session');let mutation:import('../src/shared').Mutation|undefined;const session=new Session({request:async(request:import('../src/shared').Request)=>{if(request.kind!=='convertTopic')throw new Error('Unexpected request');mutation=await w.convertTopic(request.path,request.expected,request.placement);return mutation;}} as unknown as import('../src/shared').Bridge);t.after(()=>session.dispose());session.state.snapshot=w.snapshot();const cards=await session.convertTopics(board,['a','b']);assert.equal(cards.length,2);assert.equal(session.undoHistory.past.length,1,'one user action creates one undo record');const result=mutation!,created=result.edits.filter(e=>e.before===null);assert.deepEqual(created.map(e=>e.path),['Board/Same_1.md','Board/Same_2.md']);
 const next=result.snapshot.boards.find(b=>b.path===board.path)!;assert.deepEqual(next.edges,board.edges);assert.deepEqual(next.cards.map(p=>[p.id,p.x,p.y]),board.cards.map(p=>[p.id,p.x,p.y]));assert.equal(next.cards[1].strokeColor,'#c9838a');assert.equal(next.cards[1].strokeStyle,'dotted');assert.equal(next.cards[1].fillColor,'#91aa8b');assert.equal(next.cards[3].object?.type,'text');assert.match((await w.card('Board/Same_2.md')).body,/Second body/);
 const history=new UndoHistory();history.record('Convert selected Text',result.edits);assert.equal(history.past.length,1);await history.travel(false,changes=>w.write(changes));assert.deepEqual(w.snapshot().boards.find(b=>b.path===board.path)!.cards,board.cards);assert.deepEqual(await fs.readdir(join(root,'Board')),files);await history.travel(true,changes=>w.write(changes));assert.ok(w.snapshot().boards.find(b=>b.path===board.path)!.cards.slice(1,3).every(p=>!p.object));
 board=w.snapshot().boards.find(b=>b.path===board.path)!;await fs.appendFile(join(root,board.path),'\nExternal change');await assert.rejects(()=>w.convertTopic(board.path,board.revision,['keep']),/chang|edit/i);assert.equal((await fs.readdir(join(root,'Board'))).filter(p=>p.endsWith('.md')).length,3,'a conflicting board creates no orphan cards');
});

test('Text navigation follows sibling Y positions and connected X positions, independent of edge direction',async()=>{
 const {textNeighbor}=await import('../src/topics');const board:Board={...fixture(),cards:[{...topic('parent'),x:0,y:100},{...topic('here'),x:300,y:200},{...topic('up'),x:700,y:150},{...topic('far-up'),x:300,y:20},{...topic('down'),x:310,y:280},{...topic('other-parent'),x:280,y:210},{...topic('right'),x:600,y:220}],edges:[{id:'a',kind:'branch',from:'parent',to:'here'},{id:'b',kind:'branch',from:'parent',to:'up'},{id:'c',kind:'branch',from:'parent',to:'far-up'},{id:'d',kind:'branch',from:'parent',to:'down'},{id:'cross',from:'right',to:'here'}]};
 assert.equal(textNeighbor(board,'here','parent'),'parent');assert.equal(textNeighbor(board,'here','ArrowUp'),'up');assert.equal(textNeighbor(board,'here','ArrowDown'),'down');assert.equal(textNeighbor(board,'here','ArrowLeft'),'parent');assert.equal(textNeighbor(board,'here','ArrowRight'),'right');assert.equal(textNeighbor(board,'parent','parent'),undefined);assert.equal(textNeighbor(board,'right','ArrowRight'),undefined);
});

test('Text keyboard navigation selects without creating, commits Shift+Tab drafts, and leaves typing arrows alone',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');let board:Board={...fixture(),cards:[{...topic('parent'),x:0,y:100},{...topic('here'),x:300,y:100},{...topic('down'),x:300,y:200}],edges:[{id:'a',kind:'branch',from:'parent',to:'here'},{id:'b',kind:'branch',from:'parent',to:'down'}]},writes=0;const root=createRoot(document.getElementById('root')!);
 function Harness(){const [value,setValue]=useState(board);return <Whiteboard board={value} cards={[]} onSave={next=>{board=next;writes++;setValue(next);}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 const key=(target:Element,key:string,shiftKey=false)=>{const e=new dom.window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true});target.dispatchEvent(e);return e;},selected=()=>document.querySelector<HTMLElement>('.board-text.selected')?.dataset.placement;
 try{await act(async()=>root.render(<Harness/>));const canvas=document.querySelector('.canvas')!;await act(async()=>press(document.querySelector('[data-placement="here"]')!));
  await act(async()=>key(canvas,'ArrowDown'));assert.equal(selected(),'down');await act(async()=>key(canvas,'ArrowUp'));assert.equal(selected(),'here');await act(async()=>key(canvas,'ArrowLeft'));assert.equal(selected(),'parent');await act(async()=>key(canvas,'ArrowRight'));assert.equal(selected(),'here');assert.equal(writes,0);assert.equal(board.cards.length,3);
  await act(async()=>key(canvas,'F2'));const editor=document.querySelector<HTMLTextAreaElement>('[aria-label="Edit whiteboard text"]')!;const set=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!;
  await act(async()=>{set.call(editor,'Edited child');editor.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>assert.equal(key(editor,'ArrowLeft').defaultPrevented,false));assert.equal(selected(),'here');
  await act(async()=>key(editor,'Tab',true));assert.equal(selected(),'parent');assert.equal(board.cards.length,3);assert.equal(writes,1);assert.equal(board.cards[1].object?.type==='text'&&board.cards[1].object.text,'Edited child');assert.equal(document.querySelector('[aria-label="Edit whiteboard text"]'),null);
 }finally{await act(async()=>root.unmount());}
});

test('all Text uses measured content bounds and multi-select conversion passes only Text in one action',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board');Object.assign(globalThis,{innerWidth:1400,innerHeight:900});let board:Board={...fixture(),cards:[{...topic('a','A'),object:{type:'text',shape:'rounded',text:'A'}},{...topic('b','B'),x:400},{id:'card',cardId:'existing',x:700,y:100,width:340,height:280}],edges:[{id:'ab',from:'a',to:'b'}]},calls=0,opened=0,ids:string[]=[];const root=createRoot(document.getElementById('root')!);
 function Harness(){const [value,setValue]=useState(board);return <Whiteboard board={value} cards={[]} onSave={next=>{board=next;setValue(next);}} onOpen={()=>opened++} onCreate={()=>{}} onConvertTopics={async(base,selected)=>{calls++;ids=selected;board={...base,cards:base.cards.map(p=>selected.includes(p.id)?{...p,object:undefined,cardId:'converted-'+p.id}:p)};setValue(board);return selected.map(id=>({id:'converted-'+id,path:'Board/'+id+'.md',name:id,revision:'r',legacy:false}));}}/>;}
 try{await act(async()=>root.render(<Harness/>));const a=document.querySelector<HTMLElement>('[data-placement="a"]')!;assert.equal(a.querySelector('.resize-handle'),null);assert.equal(a.style.width,'');assert.equal(a.style.height,'auto');Object.defineProperty(a,'offsetWidth',{value:36});Object.defineProperty(a,'offsetHeight',{value:42});await act(async()=>observers.findLast(o=>o.target===a)!.callback([],{} as ResizeObserver));await act(async()=>press(a));assert.equal(document.querySelector('[data-anchor-card="a"][data-anchor-side="right"]')!.getAttribute('cx'),'136','shapes use their measured width for anchors');
  for(const id of ['b','card'])await act(async()=>document.querySelector(`[data-placement="${id}"]`)!.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0,shiftKey:true})));
  await act(async()=>a.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200})));const action=[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(n=>n.textContent?.startsWith('Convert 2'))!;assert.ok(action);await act(async()=>action.click());assert.equal(calls,1);assert.deepEqual(ids,['a','b']);assert.equal(opened,0,'bulk conversion stays on the board');assert.equal(board.cards[2].cardId,'existing');assert.equal(document.querySelectorAll('.board-text').length,0);assert.deepEqual(board.edges,[{id:'ab',from:'a',to:'b'}]);
 }finally{await act(async()=>root.unmount());}
});
