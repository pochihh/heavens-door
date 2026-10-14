import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JSDOM} from 'jsdom';
import {act,useRef} from 'react';
import {Workspace} from '../src/core/workspace';
import {UndoHistory} from '../src/renderer/history';
import {useBookmarkDrag,dragKanban} from '../src/renderer/sortable';
import {clearDocumentDrop,documentDropTarget,dropDocumentAt,previewDocumentDrop,type DocumentDrop} from '../src/renderer/card-drop';

async function workspace(t:{after:(fn:()=>Promise<void>)=>void}){
  const dir=await fs.mkdtemp(join(tmpdir(),'door-document-drop-')),root=join(dir,'Notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});return w;
}
test('a moved reference leaves the original file, owner and other references intact, and undo restores only that placement',async t=>{
  const w=await workspace(t);for(const folder of ['Owner','One','Two','Other'])await w.createFolder('',folder);
  await w.create('Owner','Note',20,30);const card=await w.card('Owner/Note.md'),raw=await w.read(card.path);
  const board=(folder:string)=>w.snapshot().boards.find(b=>b.folder===folder)!;
  const place=(folder:string,mode:'move'|'reference'|'move-reference',source?:string,placement?:string)=>w.placeCard(card.id,card.revision,folder,board(folder).revision,100,200,mode,source,placement);
  await place('One','reference');await place('Other','reference');const source=board('One').cards.find(p=>p.cardId===card.id)!,owner=structuredClone(board('Owner'));
  const result=await place('Two','move-reference','One',source.id);
  assert.equal(await w.read(card.path),raw);assert.deepEqual(board('Owner'),owner);assert.equal(board('One').cards.some(p=>p.cardId===card.id),false);assert.ok(board('Two').cards.some(p=>p.cardId===card.id));assert.ok(board('Other').cards.some(p=>p.cardId===card.id));
  const undo=new UndoHistory();undo.record('Move reference',result.edits);await undo.travel(false,changes=>w.write(changes));assert.ok(board('One').cards.some(p=>p.id===source.id));assert.equal(board('Two').cards.some(p=>p.cardId===card.id),false);
  await assert.rejects(()=>place('Two','move-reference','One','stale-placement'),/missing|no longer|not found/i);
});
test('real card moves rewrite inbound and image links, preserve identity, and folder move undo restores edges and geometry',async t=>{
  const w=await workspace(t);await w.createFolder('','Board');await w.createFolder('','Next');await w.ensureFolder('Slipbox');
  await w.create('Slipbox','Note',0,0,false);let card=await w.card('Slipbox/Note.md');await w.saveCard(card.path,'# Note\n\n![Photo](photo.png)\n<img src="photo.png">\n',card.revision);card=await w.card(card.path);
  await w.create('','Links',0,0,false);const links=await w.card('Links.md');await w.saveCard(links.path,'# Links\n\n[Note](Slipbox/Note.md)\n',links.revision);
  const board=()=>w.snapshot().boards.find(b=>b.folder==='Board')!;
  await w.placeCard(card.id,card.revision,'Board',board().revision,123,234,'move');
  assert.equal(w.snapshot().cards.find(c=>c.id===card.id)!.path,'Board/Note.md');assert.match((await w.card('Links.md')).body,/Board\/Note.md/);assert.match((await w.card('Board/Note.md')).body,/\.\.\/Slipbox\/photo.png/);
  await w.create('Board','Second',400,300);let layout=structuredClone(board());const first=layout.cards.find(p=>p.cardId===card.id)!,second=layout.cards.find(p=>p.cardId!==card.id&&!p.folder)!;
  layout.edges.push({id:'edge',from:first.id,to:second.id});await w.saveBoard(layout,layout.revision);layout=structuredClone(board());
  const move=await w.fileOperation({action:'move',path:'Board/Note.md',destination:'Next/Note.md'});assert.equal(board().cards.some(p=>p.cardId===card.id),false);assert.equal(board().edges.length,0);assert.match((await w.card('Links.md')).body,/Next\/Note.md/);
  const undone=await w.fileOperation(move.inverse);assert.deepEqual(board().cards,layout.cards);assert.deepEqual(board().edges,layout.edges);assert.equal((await w.card('Board/Note.md')).id,card.id);
  await w.fileOperation(undone.inverse);assert.equal(board().cards.some(p=>p.cardId===card.id),false);assert.equal((await w.card('Next/Note.md')).id,card.id);
});
test('moving a board moves its tree and assets, retains one real parent, and restores exact parent layout on undo',async t=>{
  const w=await workspace(t);await w.createFolder('','From');await w.createFolder('','To');await w.createFolder('From','Child',{x:333,y:222});await w.createFolder('From/Child','Nested');await w.create('From/Child','Note',10,20);
  await fs.writeFile(join(w.root,'From/Child/photo.png'),new Uint8Array([1,7,42]));const id=(await w.card('From/Child/Note.md')).id;
  const before=structuredClone(w.snapshot().boards.find(b=>b.folder==='From')!),moved=await w.fileOperation({action:'move',path:'From/Child',destination:'To/Child',position:{x:88,y:99}}),after=w.snapshot();
  assert.equal(after.boards.find(b=>b.folder==='From')!.cards.some(p=>p.folder?.includes('Child')),false);
  assert.equal(after.boards.flatMap(b=>b.cards).filter(p=>p.folder==='To/Child').length,1);assert.ok(after.boards.some(b=>b.folder==='To/Child/Nested'));
  const tile=after.boards.find(b=>b.folder==='To')!.cards.find(p=>p.folder==='To/Child')!;assert.equal(tile.x,88);assert.equal(tile.y,99);assert.equal(tile.id,before.cards.find(p=>p.folder==='From/Child')!.id);
  assert.equal((await w.card('To/Child/Note.md')).id,id);assert.deepEqual(await fs.readFile(join(w.root,'To/Child/photo.png')),Buffer.from([1,7,42]));
  await assert.rejects(()=>w.fileOperation({action:'move',path:'To/Child',destination:'To/Child/Nested/Child'}),/Invalid/);
  await w.fileOperation(moved.inverse);assert.deepEqual(w.snapshot().boards.find(b=>b.folder==='From')!.cards,before.cards);assert.equal(w.snapshot().boards.find(b=>b.folder==='To')!.cards.some(p=>p.folder?.includes('Child')),false);
});

test('document targets distinguish row nesting, gaps, root-board restrictions and cycles; table and Kanban drags export without a sort write',async()=>{
  const dom=new JSDOM('<div id="root"></div><div id="destination" class="tree-row" data-drop-kind="board" data-drop-folder="Target"></div><div id="mother" data-drop-kind="board" data-drop-folder=""></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}} as DOMRect),destination=document.getElementById('destination')!,mother=document.getElementById('mother')!;destination.getBoundingClientRect=()=>rect(500,100,200,40);let hit:HTMLElement[]= [destination];document.elementsFromPoint=()=>hit;
  const drops:DocumentDrop[]=[];window.addEventListener('door:document-drop',e=>drops.push((e as CustomEvent<DocumentDrop>).detail));
  assert.equal(documentDropTarget({key:'card:c'},550,105),null);assert.equal(previewDocumentDrop({key:'card:c'},550,120),true);assert.ok(destination.classList.contains('document-drop-target'));clearDocumentDrop();assert.equal(documentDropTarget({key:'board:Target'},550,120),null);
  hit=[mother];assert.equal(dropDocumentAt({key:'card:c'},500,120),false);assert.equal(dropDocumentAt({key:'board:Child'},500,120),true);drops.length=0;
  let writes=0;
  function Harness(){const ref=useRef<HTMLTableSectionElement>(null),drag=useBookmarkDrag(ref,()=>{writes++;},'vertical',true);return <table><tbody ref={ref}><tr data-file-key="c" data-drag-key="card:c" data-drag-path="Slipbox/Note.md"><td><button onPointerDown={e=>drag(e,'c',true)}>Grip</button></td></tr></tbody></table>;}
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const pointer=async(el:Element|Document,type:string,x:number,y:number)=>{await act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});el.dispatchEvent(e);});};
  try{
    await act(async()=>root.render(<Harness/>));const row=document.querySelector('tbody tr')!,body=document.querySelector('tbody')!;row.getBoundingClientRect=()=>rect(100,100,200,30);body.getBoundingClientRect=()=>rect(100,100,200,100);hit=[destination];
    await pointer(row.querySelector('button')!,'pointerdown',120,115);await pointer(document,'pointermove',550,120);assert.equal(document.querySelector<HTMLElement>('.drag-phantom')!.style.left,'530px');await pointer(document,'pointerup',550,120);assert.equal(drops.length,1);assert.equal(drops[0].key,'card:c');assert.equal(writes,0);assert.equal(document.querySelector('.drag-phantom'),null);
    await pointer(row.querySelector('button')!,'pointerdown',120,115);await pointer(document,'pointermove',550,120);await pointer(document,'pointercancel',550,120);assert.equal(drops.length,1);assert.equal(writes,0);
    await act(async()=>root.render(<div className="view-kanban"><section data-tag-column="Todo"><h3>Todo</h3><div data-card-id="c">Card</div></section></div>));const kanban=document.querySelector<HTMLElement>('.view-kanban')!,source=kanban.querySelector<HTMLElement>('[data-card-id]')!,column=source.parentElement!;
    kanban.getBoundingClientRect=column.getBoundingClientRect=()=>rect(100,100,200,300);source.getBoundingClientRect=()=>rect(100,150,200,60);column.querySelector('h3')!.getBoundingClientRect=()=>rect(100,100,200,30);
    dragKanban({currentTarget:source,clientX:120,clientY:160,pointerId:1} as unknown as Parameters<typeof dragKanban>[0],kanban,()=>{writes++;},()=>true);
    await pointer(document,'pointermove',550,120);await pointer(document,'pointerup',550,120);assert.equal(drops.length,2);assert.equal(writes,0);assert.equal(source.style.display,'');assert.equal(document.querySelector('.drag-phantom'),null);
  }finally{await act(async()=>root.unmount());clearDocumentDrop();dom.window.close();}
});

test('moving a linked card refreshes an open note and preserves text typed while the move is pending',async t=>{
  const w=await workspace(t);for(const folder of ['One','Two'])await w.createFolder('',folder);
  await w.create('One','Target',0,0);await w.create('','Open note',0,0,false);let note=await w.card('Open note.md');await w.saveCard(note.path,'# Open note\n\n[Target](One/Target.md)\n',note.revision);note=await w.card(note.path);
  let started!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const {Session}=await import('../src/renderer/session');const session=new Session({request:async r=>{switch(r.kind){case 'card':return w.card(r.path);case 'saveCard':return w.saveCard(r.path,r.body,r.expected);case 'placeCard':started();await gate;return w.placeCard(r.id,r.expected,r.board,r.boardExpected,r.x,r.y,r.mode,r.source,r.placement);default:throw new Error(r.kind);}}} as import('../src/shared').Bridge);t.after(async()=>session.dispose());session.update({snapshot:w.snapshot()});await session.select(note.path);
  const card=await w.card('One/Target.md'),pending=session.placeCard(card.id,'Two',50,60,'move');await ready;session.edit(note.body+'\nTyped during move.');release();await pending;
  assert.match(session.state.draft!.body,/Two\/Target.md/);assert.match(session.state.draft!.body,/Typed during move/);assert.equal(session.state.draft!.dirty,true);assert.equal(session.state.draft!.card.revision,(await w.card(note.path)).revision);
  await session.run(()=>session.flush());assert.match((await w.card(note.path)).body,/Typed during move/);
});


test('the whole board highlights and accepts a drop immediately, and leaving clears it',async()=>{
  const dom=new JSDOM('<div class="canvas" data-drop-kind="board" data-drop-folder="Parent"></div><article class="board-tile" data-drop-kind="board" data-drop-folder="Parent/Target"><header>Title</header><section>Contents</section><footer>Bottom</footer></article>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent});
  const tile=document.querySelector<HTMLElement>('article')!,canvas=document.querySelector<HTMLElement>('.canvas')!,drag={key:'card:c',path:'Parent/Card.md',source:'Parent',placement:'p'};
  let hit:Element[]=[];const drops:DocumentDrop[]=[];document.elementsFromPoint=()=>hit;window.addEventListener('door:document-drop',e=>drops.push((e as CustomEvent<DocumentDrop>).detail));
  try{
    for(const part of tile.querySelectorAll('header,section,footer')){
      hit=[canvas,part,tile];assert.equal(previewDocumentDrop(drag,100,100),true);assert.ok(tile.classList.contains('document-drop-target'));assert.equal(document.querySelector('[role=status]'),null);
      assert.equal(dropDocumentAt(drag,100,100),true);assert.equal(drops.at(-1)!.folder,'Parent/Target');assert.equal(drops.at(-1)!.intoBoard,true);assert.equal(drops.at(-1)!.atPointer,false);assert.equal(tile.className,'board-tile');
    }
    hit=[tile];previewDocumentDrop(drag,100,100);hit=[];previewDocumentDrop(drag,300,300);assert.equal(tile.className,'board-tile');assert.equal(dropDocumentAt(drag,300,300),false);
    hit=[tile];previewDocumentDrop(drag,100,100);clearDocumentDrop();assert.equal(tile.className,'board-tile');
    assert.equal(previewDocumentDrop({key:'board:Parent'},100,100),false,'cycles never highlight');
    const selection={ids:['a','b'],folders:['Parent/Target'],board:{} as import('../src/shared').Board,offset:{x:0,y:0}};
    assert.equal(previewDocumentDrop({...drag,selection},100,100),false,'a selected board cannot receive its own group');
    hit=[canvas];assert.equal(previewDocumentDrop({...drag,selection},100,100),false,'the source cannot receive its own group');
    hit=[tile];tile.dataset.dropKind='folder';tile.dataset.dropBoard='true';
    const cardsOnly={ids:['a','b'],folders:[],board:{} as import('../src/shared').Board,offset:{x:0,y:0}};
    assert.equal(dropDocumentAt({...drag,selection:cardsOnly},100,100),true);assert.equal(drops.at(-1)!.kind,'board','a file-explorer board folder accepts a whole group');
    delete tile.dataset.dropBoard;assert.equal(previewDocumentDrop({...drag,selection:cardsOnly},100,100),false,'a plain folder cannot preserve a group layout');
    assert.equal(dropDocumentAt({...drag,selection:{...cardsOnly,ids:['a']}},100,100),true);assert.equal(drops.at(-1)!.kind,'folder','single-item physical-folder moves keep their meaning');
  }finally{clearDocumentDrop();dom.window.close();}
});

test('table and Kanban exports drop into a board immediately on release',async()=>{
  const dom=new JSDOM('<div id="root"></div><article class="board-tile" data-drop-kind="board" data-drop-folder="Target"><section>Whole board</section></article>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const destination=document.querySelector<HTMLElement>('article')!;document.elementsFromPoint=()=>[destination.querySelector('section')!,destination];
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}} as DOMRect),drops:DocumentDrop[]=[];window.addEventListener('door:document-drop',e=>drops.push((e as CustomEvent<DocumentDrop>).detail));let writes=0;
  function Harness(){const ref=useRef<HTMLTableSectionElement>(null),drag=useBookmarkDrag(ref,()=>{writes++;},'vertical',true);return <table><tbody ref={ref}><tr data-file-key="c" data-drag-key="card:c" data-drag-path="Slipbox/Note.md"><td><button onPointerDown={e=>drag(e,'c',true)}>Grip</button></td></tr></tbody></table>;}
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const pointer=async(el:Element|Document,type:string,x:number,y:number)=>{await act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});el.dispatchEvent(e);});};
  try{
    await act(async()=>root.render(<Harness/>));const row=document.querySelector('tbody tr')!,body=document.querySelector('tbody')!;row.getBoundingClientRect=()=>rect(100,100,200,30);body.getBoundingClientRect=()=>rect(100,100,200,100);
    await pointer(row.querySelector('button')!,'pointerdown',120,115);await pointer(document,'pointermove',550,120);await pointer(document,'pointerup',550,120);assert.equal(drops.length,1);assert.equal(writes,0);
    await act(async()=>root.render(<div className="view-kanban"><section data-tag-column="Todo"><h3>Todo</h3><div data-card-id="c">Card</div></section></div>));const kanban=document.querySelector<HTMLElement>('.view-kanban')!,source=kanban.querySelector<HTMLElement>('[data-card-id]')!,column=source.parentElement!;
    kanban.getBoundingClientRect=column.getBoundingClientRect=()=>rect(100,100,200,300);source.getBoundingClientRect=()=>rect(100,150,200,60);column.querySelector('h3')!.getBoundingClientRect=()=>rect(100,100,200,30);
    dragKanban({currentTarget:source,clientX:120,clientY:160,pointerId:1} as unknown as Parameters<typeof dragKanban>[0],kanban,()=>{writes++;},()=>true);
    await pointer(document,'pointermove',550,120);await pointer(document,'pointerup',550,120);assert.equal(drops.length,2);assert.equal(writes,0);assert.equal(document.querySelector('[role=status]'),null);
  }finally{await act(async()=>root.unmount());clearDocumentDrop();dom.window.close();}
});

test('canvas card and child-board drags drop into another whole tile without saving a geometry move',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>{};dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;dom.window.HTMLElement.prototype.releasePointerCapture=()=>{};
  const {Whiteboard}=await import('../src/renderer/Board'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const board:import('../src/shared').Board={path:'Parent/Parent.whiteboard',folder:'Parent',name:'Parent',revision:'r',cards:[{id:'source',cardId:'c',x:0,y:0,width:340,height:280},{id:'child',cardId:'',folder:'Parent/Child',x:400,y:0,width:320,height:160},{id:'target',cardId:'',folder:'Parent/Target',x:800,y:0,width:320,height:160}],edges:[]},drops:DocumentDrop[]=[];let saves=0;
  window.addEventListener('door:document-drop',e=>drops.push((e as CustomEvent<DocumentDrop>).detail));
  const pointer=async(el:Element|Document,type:string,x:number,y:number)=>act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(e,'pointerId',{value:1});el.dispatchEvent(e);});
  try{
    await act(async()=>root.render(<Whiteboard board={board} cards={[]} onSave={()=>{saves++;}} onOpen={()=>{}} onCreate={()=>{}}/>));
    const target=document.querySelector<HTMLElement>('[data-placement=target]')!,canvas=document.querySelector<HTMLElement>('.canvas')!;document.elementsFromPoint=()=>[canvas,target.querySelector('.board-tile-contents')!,target];
    for(const id of ['source','child']){
      const source=document.querySelector<HTMLElement>('[data-placement='+id+']')!;await pointer(source,'pointerdown',100,100);await pointer(document,'pointermove',850,100);assert.ok(target.classList.contains('document-drop-target'));await pointer(document,'pointerup',850,100);
      assert.equal(drops.length,id==='source'?1:2);assert.equal(drops.at(-1)!.folder,'Parent/Target');assert.equal(drops.at(-1)!.key,id==='source'?'card:c':'board:Parent/Child');assert.equal(saves,0);assert.equal(document.querySelector('[role=status]'),null);
    }
  }finally{await act(async()=>root.unmount());clearDocumentDrop();dom.window.close();}
});

test('a canvas selection exports together, previews all items and internal edges, and excludes every selected board as a target',async()=>{
  const dom=new JSDOM('<div id="root"></div><article id="outside" class="board-tile" data-drop-kind="board" data-drop-folder="Elsewhere"></article>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>{};dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;dom.window.HTMLElement.prototype.releasePointerCapture=()=>{};
  const {Whiteboard}=await import('../src/renderer/Board'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const board:import('../src/shared').Board={path:'Parent/Parent.whiteboard',folder:'Parent',name:'Parent',revision:'r',cards:[{id:'source',cardId:'c',x:0,y:0,width:340,height:280},{id:'child',cardId:'',folder:'Parent/Child',x:400,y:0,width:320,height:160},{id:'target',cardId:'',folder:'Parent/Target',x:800,y:0,width:320,height:160}],edges:[{id:'internal',from:'source',to:'child',label:'Keep'},{id:'boundary',from:'child',to:'target'}]},drops:DocumentDrop[]=[];let saves=0;
  window.addEventListener('door:document-drop',e=>drops.push((e as CustomEvent<DocumentDrop>).detail));
  const pointer=async(el:Element|Document,type:string,x:number,y:number,shiftKey=false)=>act(async()=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y,shiftKey});Object.defineProperty(e,'pointerId',{value:1});el.dispatchEvent(e);});
  try{
    await act(async()=>root.render(<Whiteboard board={board} cards={[]} initialCamera={{x:0,y:0,zoom:1}} onSave={()=>{saves++;}} onOpen={()=>{}} onCreate={()=>{}}/>));
    const source=document.querySelector<HTMLElement>('[data-placement=source]')!,child=document.querySelector<HTMLElement>('[data-placement=child]')!,target=document.querySelector<HTMLElement>('[data-placement=target]')!,canvas=document.querySelector<HTMLElement>('.canvas')!,outside=document.getElementById('outside')!;
    canvas.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:600,right:1200,bottom:600,x:0,y:0,toJSON(){}} as DOMRect);
    await pointer(source,'pointerdown',100,100,true);await pointer(child,'pointerdown',450,100,true);
    document.elementsFromPoint=()=>[child,canvas];await pointer(source,'pointerdown',100,100);await pointer(document,'pointermove',450,100);assert.equal(child.classList.contains('document-drop-target'),false);
    document.elementsFromPoint=()=>[outside];await pointer(document,'pointermove',1300,100);
    const phantom=document.querySelector('.drag-phantom')!;assert.equal(phantom.querySelectorAll('[data-placement]').length,2);assert.equal(phantom.querySelectorAll('[data-edge]').length,1);assert.ok(phantom.querySelector('[data-edge=internal]'));assert.ok(outside.classList.contains('document-drop-target'));
    await pointer(document,'pointerup',1300,100);assert.equal(drops.length,1);assert.deepEqual(drops[0].selection,{ids:['source','child'],folders:['Parent/Child'],board,offset:{x:100,y:100}});assert.equal(saves,0);assert.equal(document.querySelector('.drag-phantom'),null);
    document.elementsFromPoint=()=>[target];await pointer(source,'pointerdown',100,100);await pointer(document,'pointermove',850,100);await pointer(document,'pointercancel',850,100);assert.equal(drops.length,1);assert.equal(saves,0);assert.equal(target.classList.contains('document-drop-target'),false);
  }finally{await act(async()=>root.unmount());clearDocumentDrop();dom.window.close();}
});

test('hovering another main tab keeps a Kanban drag alive through unmount and drops into its canvas',async()=>{
  const dom=new JSDOM('<!doctype html><div class="editor-body"><div class="view-kanban"><section data-tag-column="Todo"><h3>Todo</h3><div class="view-result-card" data-card-id="c" data-drag-path="Slipbox/C.md">Card</div></section></div></div><div data-tab-family="main" data-tab-group="main"><div class="tab" data-tab-key="target" data-drop-folder="Board" data-drop-kind="board">Board</div></div><div class="canvas" data-drop-kind="board" data-drop-folder="Board"><div class="board-world"></div></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,CustomEvent:dom.window.CustomEvent,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:true}),DOMMatrix:class{a=1;d=1;e=0;f=0;}});
  const {clearDocumentNavigation}=await import('../src/renderer/card-drop');clearDocumentNavigation();
  const source=document.querySelector<HTMLElement>('[data-card-id]')!,root=document.querySelector<HTMLElement>('.view-kanban')!,tab=document.querySelector<HTMLElement>('[data-tab-key]')!,canvas=document.querySelector<HTMLElement>('.canvas')!,rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}} as DOMRect);
  source.getBoundingClientRect=()=>rect(20,100,160,60);root.getBoundingClientRect=()=>rect(0,60,220,440);root.parentElement!.getBoundingClientRect=()=>rect(0,60,220,440);source.parentElement!.getBoundingClientRect=()=>rect(0,60,220,440);source.parentElement!.querySelector('h3')!.getBoundingClientRect=()=>rect(0,60,220,30);canvas.getBoundingClientRect=()=>rect(400,60,600,600);
  document.elementsFromPoint=(x,y)=>y<50?[tab]:x>400?[canvas]:[source];let sorts=0,drop:DocumentDrop|undefined,hover=0;const onDrop=(e:Event)=>{drop=(e as CustomEvent<DocumentDrop>).detail;};window.addEventListener('door:document-drop',onDrop);
  const hoverTab=(e:Event)=>{assert.deepEqual((e as CustomEvent).detail,{group:'main',key:'target'});hover++;root.remove();cancel();};window.addEventListener('door:document-hover-tab',hoverTab);
  const cancel=dragKanban({currentTarget:source,clientX:30,clientY:110,pointerId:undefined} as unknown as Parameters<typeof dragKanban>[0],root,()=>{sorts++;},()=>true),pointer=(type:string,x:number,y:number)=>document.dispatchEvent(new dom.window.MouseEvent(type,{clientX:x,clientY:y,bubbles:true}));
  try{pointer('pointermove',450,20);await new Promise(resolve=>setTimeout(resolve,700));assert.equal(hover,1);assert.ok(document.querySelector('.drag-phantom'),'the originating view unmount must not cancel navigation');pointer('pointermove',600,240);assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),230,'outside the Kanban, the preview follows the pointer freely');pointer('pointerup',600,240);assert.equal(drop?.folder,'Board');assert.equal(drop?.atPointer,true);assert.equal(sorts,0);assert.equal(document.querySelector('.drag-phantom'),null);}finally{document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.removeEventListener('door:document-drop',onDrop);window.removeEventListener('door:document-hover-tab',hoverTab);clearDocumentNavigation();dom.window.close();}
});
