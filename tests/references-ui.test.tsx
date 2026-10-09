import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Bridge,Card,ReferenceTarget,Snapshot} from '../src/shared';

test('inline mentions share fuzzy suggestions, preserve wiki syntax, and create a Slipbox card without leaving the editor',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{innerWidth:1024,innerHeight:768,window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,DOMRect:dom.window.DOMRect,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  dom.window.scrollBy=()=>{};dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.showPopover=()=>{};
  dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(40,40,10,20);dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
  const {CardEditor}=await import('../src/renderer/Editor'),{ViewBlockProvider}=await import('../src/renderer/ViewBlock'),{Session}=await import('../src/renderer/session'),{cardMarkdown}=await import('../src/renderer/editor-schema');
  const source:Card={id:'source',path:'Notes/Source.md',name:'Source.md',body:'# Source\n\nChoose ',revision:'r',legacy:false};
  const targets:ReferenceTarget[]=[{kind:'card',key:'card:motor',path:'Slipbox/Motor control.md',name:'Motor control'},{kind:'board',key:'board:Research',path:'Research/Research.whiteboard',name:'Research'}];
  let snapshot:Snapshot={root:'/test',name:'Test',cards:[source,{id:'motor',path:targets[0].path,name:'Motor control.md',title:'Motor control',revision:'r',legacy:false}],boards:[{path:targets[1].path,folder:'Research',name:'Research',revision:'r',cards:[],edges:[]}],issues:[],historyAvailable:false};
  const queries:string[]=[],opened:string[]=[],edits:string[]=[];let releaseCreate:(()=>void)|undefined;
  const bridge={request:async request=>{
    if(request.kind==='queryReferences'){queries.push(request.text);return request.text==='moter'?targets.slice(0,1):request.text==='research'?targets.slice(1):[];}
    if(request.kind==='createSlipboxCard'){await new Promise<void>(resolve=>{releaseCreate=resolve;});const card={id:'new',path:'Slipbox/'+request.name+'.md',name:request.name+'.md',title:request.name,revision:'new-r',legacy:false};snapshot={...snapshot,cards:[...snapshot.cards,card]};return {snapshot,edits:[{path:card.path,before:null,after:'new'}]};}
    throw new Error('Unexpected '+request.kind);
  }} as Bridge;window.door=bridge;
  const session=new Session(bridge);session.update({snapshot});const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={key=>opened.push(key)} onPreview={key=>opened.push('popup:'+key)}><CardEditor {...source} cards={snapshot.cards} onEdit={body=>edits.push(body)}/></ViewBlockProvider>));
    const element=document.querySelector('.tiptap') as HTMLElement&{editor:import('@tiptap/core').Editor},editor=element.editor;editor.view.coordsAtPos=()=>({top:40,bottom:60,left:40,right:40});
    const type=async(text:string)=>{await act(async()=>{editor.commands.setTextSelection(editor.state.doc.content.size-1);editor.view.focus();editor.commands.insertContent({type:'text',text});});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,130));});};
    await type('@moter');assert.ok(queries.includes('moter'));assert.equal(document.querySelector('.reference-menu [role=option]')?.textContent,'Motor controlSlipbox/Motor control.md');
    await act(async()=>{element.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true}));element.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));element.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));});assert.ok(document.querySelector('.reference-menu'),'IME confirmation must not select a result');
    await act(async()=>element.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.match(cardMarkdown(editor),/\[Motor control\]\(\.\.\/Slipbox\/Motor%20control.md\)/);assert.equal(document.querySelector('.reference-menu'),null);
    await act(async()=>element.querySelector('a')!.click());assert.deepEqual(opened,['popup:card:motor']);
    await act(async()=>editor.commands.setContent('# Source\n\n[[Motor control|My motor]] and `[[code]]`',{contentType:'markdown'}));assert.equal(document.querySelector('.tiptap a')?.textContent,'My motor');assert.match(cardMarkdown(editor),/\[\[Motor control\|My motor\]\]/);assert.match(cardMarkdown(editor),/`\[\[code\]\]`/);
    await act(async()=>editor.commands.setContent('# Source\n\nChoose ',{contentType:'markdown'}));await type('@Brand new');assert.match(document.querySelector('.reference-menu')!.textContent!,/Create “Brand new” in Slipbox/);
    await act(async()=>element.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.ok(releaseCreate);
    await act(async()=>editor.commands.insertContentAt(editor.state.doc.firstChild!.nodeSize+1,{type:'text',text:'Prefix '}));
    await act(async()=>{releaseCreate!();await new Promise(resolve=>setTimeout(resolve,5));});assert.match(cardMarkdown(editor),/Prefix Choose \[Brand new\]\(\.\.\/Slipbox\/Brand%20new.md\)/);assert.equal(document.querySelector('.tiptap'),element,'creation keeps the original editor mounted');assert.equal(session.state.draft,null);assert.ok(edits.length);
  }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});
