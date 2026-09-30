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
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
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
