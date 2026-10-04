import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const windows:JSDOM[]=[];
// DOMPurify retains its renderer window until the module is disposed.
after(()=>windows.forEach(dom=>dom.window.close()));
import { act } from 'react';
import { createRoot } from 'react-dom/client';

test('opening and switching formatted cards never writes content or uses a destroyed editor',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path => `heavens-asset://vault/${path}`} as typeof window.door;
  const {CardEditor}=await import('../src/renderer/Editor');
  const errors:unknown[]=[],edits:string[]=[];
  const root=createRoot(document.getElementById('root')!,{onUncaughtError:error => errors.push(error)});
  try {
    for (const path of ['first.md','second.md','first.md','second.md']) {
      await act(async () => root.render(<CardEditor path={path} body={`# ${path}\n\nOriginal text.\n`} afterTitle={<button>project</button>} cards={[]} onEdit={body => edits.push(body)}/>));
      assert.deepEqual(errors,[],'switching cards must not crash React');
      assert.equal(document.querySelector('.tiptap h1')?.nextElementSibling?.className,'card-metadata ProseMirror-widget');
      assert.equal(document.querySelector('.card-metadata')?.textContent,'project');
      assert.ok(document.querySelector('[contenteditable="true"]')?.textContent?.includes(path));
    }
    await act(async()=>root.render(<CardEditor path="second.md" body="# second.md\n\nOriginal text.\n" cards={[]} onEdit={body=>edits.push(body)}/>));
    assert.equal(document.querySelector('.card-metadata'),null);
    await act(async()=>root.render(<CardEditor path="second.md" body="# second.md\n\nOriginal text.\n" afterTitle={<button>project</button>} cards={[]} onEdit={body=>edits.push(body)}/>));
    assert.equal(document.querySelector('.card-metadata')?.textContent,'project');
    assert.deepEqual(edits,[],'opening a card must not normalize or autosave its Markdown');
  } finally {await act(async () => root.unmount());}
});

test('card bodies edit only after a click, drag without opening an editor, and retain text selection while editing',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true}); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe() {} disconnect() {}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  document.elementFromPoint=() => null;
  dom.window.HTMLElement.prototype.setPointerCapture=() => undefined;
  dom.window.HTMLElement.prototype.hasPointerCapture=() => false;
  const {Whiteboard}=await import('../src/renderer/Board');
  const {useState}=await import('react');
  const cards=[0,1].map(i => ({id:`c${i}`,path:`card${i}.md`,name:`Card ${i}`,revision:'r',legacy:false,body:`# Card ${i}\n\nEdit this text.\n`}));
  window.door={assetUrl:path => `heavens-asset://vault/${path}`,request:async request => cards.find(c => c.path === ('path' in request ? request.path : ''))} as typeof window.door;
  const board={path:'board.whiteboard',folder:'',name:'Board',revision:'r',cards:cards.map((c,i) => ({id:`p${i}`,cardId:c.id,x:i*400,y:0,width:340,height:280})),edges:[]};
  let saves=0,opens=0;
  function Fixture() {
    const [draft,setDraft]=useState<{card:typeof cards[number];body:string}|null>(null);
    return <Whiteboard board={board} cards={cards} draft={draft} initialCamera={{x:80,y:35,zoom:0.3}} onSave={() => {saves++;}} onOpen={path => {opens++;const card=cards.find(c => c.path === path)!;setDraft({card,body:card.body});}} onCreate={() => assert.fail('editing must not create a card')} onEdit={body => setDraft(d => d && {...d,body})} onFinish={() => setDraft(null)}/>;
  }
  const root=createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(<Fixture/>));
    const pointer=(target:Element,type:string,x:number,y:number) => target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
    const world=document.querySelector<HTMLElement>('.board-world')!,camera=world.style.transform;
    for (const id of ['p0','p1','p0']) {
      const preview=document.querySelector(`[data-placement="${id}"] .card-preview`)!;
      await act(async () => {pointer(preview,'pointerdown',100,100);});
      assert.equal(document.querySelectorAll('.tiptap').length,0,'pointer-down must not mount an editor');
      await act(async()=>{pointer(preview,'pointermove',101,101);pointer(preview,'pointerup',101,101);});
      assert.equal(document.querySelectorAll('.tiptap').length,1);
      assert.ok(document.querySelector(`[data-placement="${id}"] .card-editor .tiptap`));
      assert.equal(document.querySelector('.editor-pane'),null);
      assert.equal(world.style.transform,camera,'selecting and editing at distant zoom must not zoom or recenter the canvas');
      assert.equal(document.querySelector('.zoom-level')!.textContent,'30%');
    }
    const editor=document.querySelector('.tiptap')!;
    await act(async () => {pointer(editor,'pointerdown',100,100);pointer(editor,'pointermove',200,200);pointer(editor,'pointerup',200,200);});
    assert.equal(saves,0,'selecting text cannot move a card');
    const canvas=document.querySelector('.canvas')!;
    await act(async () => {
      for (let i=0;i<30;i++) canvas.dispatchEvent(new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:120}));
      await new Promise(resolve => dom.window.requestAnimationFrame(resolve));
    });
    assert.equal(document.querySelector('.tiptap'),editor,'panning offscreen keeps the active editor mounted');
    await act(async () => {
      for (let i=0;i<30;i++) canvas.dispatchEvent(new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:-120}));
      await new Promise(resolve => dom.window.requestAnimationFrame(resolve));
    });
    await act(async () => {pointer(canvas,'pointerdown',0,500);pointer(canvas,'pointerup',0,500);});
    assert.equal(document.querySelector('.tiptap'),null,'clicking the canvas finishes editing');
    const preview=document.querySelector('.card-preview')!,before=opens;
    await act(async()=>{pointer(preview,'pointerdown',100,100);pointer(canvas,'pointermove',185,100);pointer(canvas,'pointerup',185,100);});
    assert.equal(opens,before,'dragging the preview never activates editing');assert.equal(saves,1);
    await act(async()=>{pointer(preview,'pointerdown',100,100);pointer(canvas,'pointermove',185,100);pointer(canvas,'pointerup',100,100);});
    assert.equal(opens,before,'a drag returning to its starting point is still not a click');assert.equal(saves,2);
    await act(async()=>{pointer(preview,'pointerdown',100,100);pointer(canvas,'pointercancel',100,100);pointer(canvas,'pointerup',100,100);});
    assert.equal(opens,before,'cancelled presses do not edit');assert.equal(saves,2);
    await act(async()=>{pointer(preview,'pointerdown',100,100);pointer(canvas,'pointerup',185,100);});
    assert.equal(opens,before,'a fast drag with no move event still does not edit');assert.equal(saves,3);
    await act(async()=>{pointer(document.querySelector('.card-preview')!,'pointerdown',100,100);pointer(canvas,'pointerup',100,100);});
    assert.ok(document.querySelector('.board-card.editing'));
    const grip=document.querySelector('.board-card.editing .card-drag-strip')!;
    await act(async () => {pointer(grip,'pointerdown',100,100);pointer(canvas,'pointermove',185,100);pointer(canvas,'pointerup',185,100);});
    assert.equal(saves,4,'the top empty strip drags an actively edited card');
    assert.equal(document.querySelector('.tiptap'),null,'dragging its strip finishes editing');
  } finally {await act(async () => root.unmount());}
});

test('a rendering failure shows a recoverable draft and a working Reload action',async () => {
  const dom=new JSDOM('<!doctype html><div id="root"></div>'); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const {AppBoundary}=await import('../src/renderer/Recovery');
  const {Session}=await import('../src/renderer/session');
  let reloads=0;
  const session=new Session({reload:() => {reloads++;}} as typeof window.door);
  session.update({draft:{card:{id:'a',path:'a.md',name:'A',body:'saved',revision:'r',legacy:false},body:'Unsaved, recoverable text',dirty:true}});
  function Broken():never {throw new Error('Editor test failure');}
  const root=createRoot(document.getElementById('root')!,{onCaughtError:() => undefined});
  try {
    await act(async () => root.render(<AppBoundary session={session}><Broken/></AppBoundary>));
    assert.match(document.body.textContent!,/editor encountered a problem/);
    assert.equal(document.querySelector('textarea')?.value,'Unsaved, recoverable text');
    document.querySelector<HTMLButtonElement>('.primary')!.click();assert.equal(reloads,1);
  } finally {await act(async () => root.unmount());session.dispose();}
});


test('image selection clears beside the image inside a popup and blank card space appends one paragraph',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {CardEditor}=await import('../src/renderer/Editor'),{NodeSelection}=await import('@tiptap/pm/state');
  const root=createRoot(document.getElementById('root')!);const edits:string[]=[];
  try{
    await act(async()=>root.render(<div role="dialog"><CardEditor path="test.md" body={'# Test\n\n<img src="image.png" width="220">\n\n<img src="second.png" width="180">\n\nEnd'} cards={[]} canvas onEdit={body=>edits.push(body)}/></div>));
    const element=document.querySelector('.tiptap') as HTMLElement&{editor:import('@tiptap/core').Editor},editor=element.editor;
    const image=document.querySelector<HTMLElement>('.editor-image-layout')!;
    assert.ok(image);
    await act(async()=>editor.commands.setNodeSelection(Number(image.dataset.imagePosition)));
    assert.ok(document.querySelector('.editor-image.selected .image-media'));
    await act(async()=>image.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0})));
    assert.equal(editor.state.selection instanceof NodeSelection,false,'clicking beside an image must clear selection, also in a card dialog');
    const size=editor.state.doc.childCount;
    await act(async()=>document.querySelector('.editor-body')!.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,button:0,clientY:100})));
    assert.equal(editor.state.doc.childCount,size+1);assert.equal(editor.state.doc.lastChild?.type.name,'paragraph');
    await act(async()=>document.querySelector('.editor-body')!.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,button:0,clientY:100})));
    assert.equal(editor.state.doc.childCount,size+1,'clicking the existing empty last line must not add another one');
    assert.ok(edits.length);
  }finally{await act(async()=>root.unmount());}
});

test('row toolbox edits portable layout and editor controls follow canvas transforms without a render',async()=>{
  const dom=new JSDOM('<!doctype html><div class="canvas"><div class="board-world"><div id="root"></div></div></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {CardEditor}=await import('../src/renderer/Editor'),{imageHtml,imageLayout,row}=await import('../src/renderer/image-layout');
  const content=row([{kind:'single',src:'circle.png',width:'240px',alignment:'left',crop:{shape:'circle',imgWidth:400,height:240,offsetX:0,offsetY:0}},{kind:'single',src:'rectangle.png',width:'200px',alignment:'left'}]);
  const root=createRoot(document.getElementById('root')!);const edits:string[]=[];
  try{
    await act(async()=>root.render(<CardEditor path="row.md" body={'# Images\n\n'+imageHtml(content)+'\n\nEnd'} cards={[]} canvas onEdit={body=>edits.push(body)}/>));
    const element=document.querySelector('.tiptap') as HTMLElement&{editor:import('@tiptap/core').Editor},editor=element.editor;
    let x=100,y=100;
    const rect=(left:number,top:number,width:number,height:number)=>new dom.window.DOMRect(left,top,width,height);
    element.getBoundingClientRect=()=>rect(x,y,500,600);Object.defineProperty(element,'offsetWidth',{value:500});
    document.querySelector('.editor-body')!.getBoundingClientRect=()=>rect(0,0,1000,1000);
    document.querySelector('.canvas')!.getBoundingClientRect=()=>rect(0,0,1000,1000);
    const imageRow=document.querySelector<HTMLElement>('.editor-image-layout')!;imageRow.getBoundingClientRect=()=>rect(x,y+60,500,300);
    const last=element.lastElementChild!;last.getBoundingClientRect=()=>rect(x,y+400,500,26);
    await act(async()=>editor.commands.setTextSelection(editor.state.doc.content.size-1));
    const grip=document.querySelector<HTMLElement>('.editor-block-controls')!,before={left:parseFloat(grip.style.left),top:parseFloat(grip.style.top)};
    await act(async()=>document.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,clientX:150,clientY:180})));
    const toolbar=document.querySelector<HTMLElement>('.image-row-toolbar')!;assert.ok(toolbar);
    const toolLeft=parseFloat(toolbar.style.left),toolTop=parseFloat(toolbar.style.top);
    x+=80;y+=40;
    await act(async()=>{document.querySelector<HTMLElement>('.board-world')!.style.transform='translate(80px,40px)';await Promise.resolve();});
    assert.equal(parseFloat(grip.style.left),before.left+80);assert.equal(parseFloat(grip.style.top),before.top+40);
    assert.equal(parseFloat(toolbar.style.left),toolLeft+80);assert.equal(parseFloat(toolbar.style.top),toolTop+40);
    assert.equal(edits.length,0,'navigation never writes card content');
    await act(async()=>toolbar.querySelector<HTMLButtonElement>('[aria-label="Justify: space between"]')!.click());
    assert.match(edits.at(-1)!,/justify-content: space-between/);
    await act(async()=>document.querySelector<HTMLButtonElement>('.image-row-toolbar [aria-label="Add image"]')!.click());
    const node=editor.state.doc.child(1),layout=imageLayout(node)!;
    assert.equal(layout.kind,'row');if(layout.kind==='row')assert.deepEqual(layout.images.at(-1),{kind:'placeholder'});
    assert.deepEqual([...document.querySelectorAll('.image-media')].map(el=>el.getAttribute('data-shape')),['circle','rectangle']);
    const {createDragPhantom}=await import('../src/renderer/sortable');
    const phantom=createDragPhantom(document.querySelectorAll<HTMLElement>('[data-image-item]')[1]);
    assert.equal(phantom.querySelector('.image-media')?.getAttribute('data-shape'),'rectangle','a frozen drag preview retains its own crop shape');phantom.remove();
  }finally{await act(async()=>root.unmount());}
});

test('image drops use the whole row, preview without saving, and preserve crop data on drop or cancel',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,DOMRect:dom.window.DOMRect,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {CardEditor}=await import('../src/renderer/Editor'),{imageHtml,imageLayout,row}=await import('../src/renderer/image-layout'),{dragImage}=await import('../src/renderer/image-drag');
  const image={kind:'single' as const,src:'circle.png',width:'240px',alignment:'left' as const,crop:{shape:'circle' as const,imgWidth:400,height:240,offsetX:0,offsetY:0}},plain={kind:'single' as const,src:'rectangle.png',width:'200px',alignment:'left' as const};
  const body='# Images\n\n'+imageHtml(row([image,plain]))+'\n\n'+imageHtml({...plain,src:'moving.png'})+'\n\nEnd';
  const root=createRoot(document.getElementById('root')!);let edits=0;
  try{
    await act(async()=>root.render(<CardEditor path="drop.md" body={body} cards={[]} onEdit={()=>edits++}/>));
    const element=document.querySelector('.tiptap') as HTMLElement&{editor:import('@tiptap/core').Editor},editor=element.editor;
    const blocks=[...document.querySelectorAll<HTMLElement>('[data-image-position]')],pictures=[...element.querySelectorAll<HTMLElement>('[data-image-item]')];
    blocks[0].getBoundingClientRect=()=>new DOMRect(100,100,800,250);blocks[1].getBoundingClientRect=()=>new DOMRect(100,450,800,150);
    pictures[0].getBoundingClientRect=()=>new DOMRect(100,100,240,240);pictures[1].getBoundingClientRect=()=>new DOMRect(350,100,200,100);pictures[2].getBoundingClientRect=()=>new DOMRect(100,450,200,100);
    const begin=()=>dragImage({button:0,clientX:150,clientY:480,currentTarget:pictures[2].querySelector('.image-clip'),preventDefault(){},stopPropagation(){}} as unknown as Parameters<typeof dragImage>[0],editor,Number(blocks[1].dataset.imagePosition),0);
    const move=(x:number,y:number)=>document.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:x,clientY:y}));
    let cancel:()=>void=()=>{};
    await act(async()=>{cancel=begin();move(800,200);});
    assert.ok(blocks[0].querySelector('.image-drop-slot'),'empty space far to the right of the images must accept the drop');
    assert.equal(editor.state.doc.childCount,4);assert.equal(edits,0,'preview cannot save or change the document');
    await act(async()=>cancel());
    assert.equal(document.querySelector('.image-drop-slot,.drag-phantom'),null);assert.equal(edits,0);assert.equal(blocks[0].style.minHeight,'');
    await act(async()=>{begin();move(345,200);});
    assert.ok(blocks[0].querySelector('.image-drop-slot'),'space between images also accepts the drop');
    await act(async()=>document.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true,clientX:345,clientY:200})));
    const result=imageLayout(editor.state.doc.child(1));assert.equal(result?.kind,'row');
    if(result?.kind==='row'){assert.deepEqual(result.images.map(i=>i.kind==='single'?i.src:''),['circle.png','moving.png','rectangle.png']);assert.deepEqual(result.images[0],{...image,alt:''});}
    assert.equal(editor.state.doc.childCount,3);assert.equal(document.querySelector('.image-drop-slot,.drag-phantom'),null);
    const reordered=document.querySelector<HTMLElement>('[data-image-position]')!,items=[...reordered.querySelectorAll<HTMLElement>('[data-image-item]')];
    reordered.getBoundingClientRect=()=>new DOMRect(100,100,800,250);items.forEach((el,i)=>{el.getBoundingClientRect=()=>new DOMRect(100+i*250,100,200,200);});
    await act(async()=>{dragImage({button:0,clientX:150,clientY:150,currentTarget:items[0].querySelector('.image-clip'),preventDefault(){},stopPropagation(){}} as unknown as Parameters<typeof dragImage>[0],editor,Number(reordered.dataset.imagePosition),0);move(850,220);});
    assert.equal(items[0].style.display,'none','same-row moves replace the source with the insertion slot');
    await act(async()=>document.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true,clientX:850,clientY:220})));
    const sorted=imageLayout(editor.state.doc.child(1));if(sorted?.kind==='row')assert.deepEqual(sorted.images.map(i=>i.kind==='single'?i.src:''),['moving.png','rectangle.png','circle.png']);else assert.fail('must remain a row');

  }finally{await act(async()=>root.unmount());}
});

test('floating block grips and row tools remain interactive inside a whiteboard',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,DOMRect:dom.window.DOMRect,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  document.elementFromPoint=()=>null;
  dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;dom.window.Range.prototype.getBoundingClientRect=()=>new DOMRect(0,0,0,0);
  const {Whiteboard}=await import('../src/renderer/Board'),{useState}=await import('react'),{imageHtml,row,imageLayout}=await import('../src/renderer/image-layout');
  const card={id:'image-card',path:'images.md',name:'Images',revision:'r',legacy:false,body:'# Images\n\nAlpha\n\nBeta\n\n'+imageHtml(row([{kind:'single',src:'a.png',width:'180px',alignment:'left',caption:'A long caption that wraps across several lines.'}]))};
  window.door={assetUrl:(path:string)=>`heavens-asset://vault/${path}`,request:async()=>card} as unknown as typeof window.door;
  const board={path:'board.whiteboard',folder:'',name:'Board',revision:'r',cards:[{id:'p',cardId:card.id,x:0,y:0,width:500,height:600}],edges:[]};let finishes=0,saves=0;
  function Fixture(){const [draft,setDraft]=useState<{card:typeof card;body:string}|null>(null);return <Whiteboard board={board} cards={[card]} draft={draft} initialCamera={{x:0,y:0,zoom:1}} onOpen={()=>setDraft({card,body:card.body})} onEdit={body=>setDraft(d=>d&&{...d,body})} onFinish={()=>{finishes++;setDraft(null);}} onSave={()=>{saves++;}} onCreate={()=>assert.fail('no new cards')}/>;}
  const root=createRoot(document.getElementById('root')!);
  const pointer=(target:EventTarget,type:string,x:number,y:number)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));
  try{
    await act(async()=>root.render(<Fixture/>));
    const preview=document.querySelector('.card-preview')!;
    assert.equal(preview.querySelector('.image-caption')?.textContent,'A long caption that wraps across several lines.');
    assert.ok(preview.querySelector('.editor-image-layout .image-layout-content .editor-image'));
    await act(async()=>{pointer(preview,'pointerdown',150,150);pointer(preview,'pointerup',150,150);});
    const element=document.querySelector('.tiptap') as HTMLElement&{editor:import('@tiptap/core').Editor},editor=element.editor;
    element.getBoundingClientRect=()=>new DOMRect(100,100,500,500);Object.defineProperty(element,'offsetWidth',{value:500});
    document.querySelector('.canvas')!.getBoundingClientRect=()=>new DOMRect(0,0,1000,900);document.querySelector('.editor-body')!.getBoundingClientRect=()=>new DOMRect(80,80,540,560);
    [...element.children].forEach((el,i)=>{el.getBoundingClientRect=()=>new DOMRect(100,100+i*60,500,40);});
    const beta=editor.state.doc.child(0).nodeSize+editor.state.doc.child(1).nodeSize;
    await act(async()=>editor.commands.setTextSelection(beta+1));
    const grip=document.querySelector('.editor-block-grip')!,before=finishes;
    await act(async()=>pointer(grip,'pointerdown',85,225));
    assert.equal(finishes,before,'portaled grip presses must not finish editing');assert.equal(document.querySelector('.tiptap'),element);
    await act(async()=>{pointer(document,'pointermove',110,161);pointer(document,'pointerup',110,161);});
    assert.equal(editor.state.doc.child(1).textContent,'Beta');assert.equal(editor.state.doc.child(2).textContent,'Alpha');assert.equal(saves,0,'editor drag does not move the whiteboard card');
    await new Promise(resolve=>setTimeout(resolve,1));
    const image=element.querySelector<HTMLElement>('[data-image-position]')!;image.getBoundingClientRect=()=>new DOMRect(100,280,500,300);
    await act(async()=>editor.commands.setNodeSelection(Number(image.dataset.imagePosition)));
    const center=document.querySelector<HTMLButtonElement>('.image-row-toolbar [aria-label="Justify: center"]')!;
    await act(async()=>{pointer(center,'pointerdown',70,380);pointer(center,'pointerup',70,380);center.click();});
    assert.equal(finishes,before);assert.equal(document.querySelector('.tiptap'),element);
    const layout=imageLayout(editor.state.doc.nodeAt(Number(element.querySelector<HTMLElement>('[data-image-position]')!.dataset.imagePosition))!);assert.equal(layout?.kind,'row');if(layout?.kind==='row')assert.equal(layout.justify,'center');
    assert.equal(element.querySelector('.image-caption')?.tagName,'TEXTAREA','editable captions wrap like their preview');
  }finally{await act(async()=>root.unmount());}
});
