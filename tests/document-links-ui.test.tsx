import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Bridge,Card,Snapshot} from '../src/shared';

test('website links and link menus work in card previews and editors while document mentions stay in the app',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,DOMRect:dom.window.DOMRect,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1024,innerHeight:768,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.showPopover=()=>{};dom.window.scrollBy=()=>{};
 dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(40,40,10,20);dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
 const external:string[]=[],copied:string[]=[],opened:string[]=[],navigated:string[]=[],errors:string[]=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{copied.push(value);}}});
 const bridge={openExternal:async(url:string)=>{external.push(url);}} as Bridge;window.door=bridge;
 const {Session}=await import('../src/renderer/session'),{ViewBlockProvider}=await import('../src/renderer/ViewBlock'),{TitleContent}=await import('../src/renderer/TitleContent'),{CardEditor}=await import('../src/renderer/Editor');
 const card:Card={id:'source',path:'Notes/Source.md',name:'Source.md',revision:'r',legacy:false,body:'# Source\n\n[Website](https://example.com/path) and [[Target]]'},target={id:'target',path:'Notes/Target.md',name:'Target.md',revision:'r',legacy:false};
 const snapshot={root:'/test',name:'Test',cards:[card,target],boards:[],issues:[],historyAvailable:false} as Snapshot,session=new Session(bridge);session.update({snapshot});session.subscribe(()=>{if(session.state.error)errors.push(session.state.error);});
 const root=createRoot(document.getElementById('root')!);let cardMenus=0;
 try{
  await act(async()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={key=>opened.push(key)} onPreview={key=>opened.push('popup:'+key)} onNavigate={(key,mode)=>navigated.push(mode+':'+key)}><article onContextMenu={()=>cardMenus++}><TitleContent className="preview" path={card.path} html='<a href="https://example.com/path">Website</a> <a href="Target.md">Target</a>'/><CardEditor {...card} cards={snapshot.cards} onEdit={()=>{}}/></article></ViewBlockProvider>));
  const preview=document.querySelector('.preview')!,editor=document.querySelector('.tiptap')!;
  for(const area of [preview,editor]){
   const link=area.querySelector<HTMLAnchorElement>('a')!;await act(async()=>link.click());assert.equal(external.at(-1),'https://example.com/path');
   await act(async()=>link.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:40,clientY:40})));assert.equal(cardMenus,0);assert.equal(document.querySelector('[role=menu]')?.getAttribute('aria-label'),'Link actions');
   await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Copy link address')!.click());assert.equal(copied.at(-1),'https://example.com/path');assert.equal(document.querySelector('[role=menu]'),null);
   await act(async()=>link.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Open link in browser')!.click());
  }
  assert.equal(external.length,4);const mention=editor.querySelectorAll<HTMLAnchorElement>('a')[1];await act(async()=>mention.click());assert.deepEqual(opened,['popup:card:target']);
  await act(async()=>mention.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Open in new tab')!.click());assert.deepEqual(navigated,['new:card:target']);
  const unsafe=preview.querySelector<HTMLAnchorElement>('a')!;unsafe.setAttribute('href','file:///etc/passwd');await act(async()=>unsafe.click());assert.equal(external.length,4);assert.deepEqual(errors,[]);
 }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});
