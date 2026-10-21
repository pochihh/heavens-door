import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {PdfNoteLink} from '../src/renderer/PdfNoteLink';
import {revealPdfNote} from '../src/renderer/Annotations';

const observers:ResizeObserverCallback[]=[];
const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});after(()=>dom.window.close());
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),ResizeObserver:class{constructor(callback:ResizeObserverCallback){observers.push(callback);}observe(){}disconnect(){}}});

test('opening PDF notes keeps visible notes in place and only scrolls enough to reveal clipped notes',()=>{
 const canvas=document.createElement('div');canvas.className='pdf-reading-layout';canvas.innerHTML='<div class="pdf-reader-toolbar"></div><aside></aside>';const rail=canvas.lastElementChild as HTMLElement;
 canvas.getBoundingClientRect=()=>({top:100,bottom:900,width:600} as DOMRect);Object.defineProperty(canvas,'offsetWidth',{value:300});canvas.firstElementChild!.getBoundingClientRect=()=>({bottom:180} as DOMRect);rail.getBoundingClientRect=()=>({top:100} as DOMRect);
 canvas.scrollTop=100;revealPdfNote(rail,140,120);assert.equal(canvas.scrollTop,100,'visible note does not move the shared canvas');
 revealPdfNote(rail,400,120);assert.equal(canvas.scrollTop,244,'a clipped bottom only scrolls the missing distance');
 canvas.scrollTop=100;revealPdfNote(rail,20,120);assert.equal(canvas.scrollTop,56,'a note above the toolbar is revealed without aligning the PDF page');
 canvas.scrollTop=100;revealPdfNote(rail,140,1000);assert.equal(canvas.scrollTop,176,'a very tall note keeps its first line visible');
 canvas.className='board-pdf';revealPdfNote(rail,400,120);assert.equal(canvas.scrollTop,176,'opening a board note cannot alter the board camera');
});

test('the open note traces its actual highlight and stays aligned through scrolling, zoom, and accordion motion',async()=>{
 const root=createRoot(document.getElementById('root')!),pages=[{page:1,top:0,height:800}];
 const render=(id?:string,layout=pages)=><div className="pdf-reading-layout"><div className="pdf-highlights"><span className="pdf-highlight" data-annotation="a"/></div><aside><section data-note-id="a" className="sticky-note expanded"/></aside><PdfNoteLink id={id} color="#c6ad72" pages={layout}/></div>;
 const frame=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
 try{
  await act(async()=>root.render(render('a')));const canvas=document.querySelector<HTMLElement>('.pdf-reading-layout')!,mark=document.querySelector<HTMLElement>('.pdf-highlight')!,note=document.querySelector<HTMLElement>('.sticky-note')!,link=document.querySelector<SVGSVGElement>('.pdf-note-link')!;
  Object.defineProperty(canvas,'offsetWidth',{value:500});canvas.getBoundingClientRect=()=>({left:100,top:50,width:500,height:600} as DOMRect);mark.getBoundingClientRect=()=>({right:350,top:250,bottom:270,width:100,height:20} as DOMRect);note.getBoundingClientRect=()=>({left:450,top:350,width:220,height:140} as DOMRect);await frame();
  assert.equal(link.style.visibility,'visible');const points=()=>['x1','y1','x2','y2'].map(key=>link.querySelector('line')!.getAttribute(key));assert.deepEqual(points(),['250','210','338','318']);assert.equal(link.querySelector('circle,path'),null,'plain straight line has no connector dot');assert.equal(link.getAttribute('aria-hidden'),'true');
  const original=points();canvas.scrollTop=80;mark.getBoundingClientRect=()=>({right:350,top:170,bottom:190,width:100,height:20} as DOMRect);note.getBoundingClientRect=()=>({left:450,top:270,width:220,height:140} as DOMRect);canvas.dispatchEvent(new dom.window.Event('scroll'));await frame();assert.deepEqual(points(),original,'shared scrolling does not detach either endpoint');
  canvas.scrollTop=0;canvas.getBoundingClientRect=()=>({left:100,top:50,width:1000,height:1200} as DOMRect);mark.getBoundingClientRect=()=>({right:600,top:450,bottom:490,width:200,height:40} as DOMRect);note.getBoundingClientRect=()=>({left:800,top:650,width:440,height:280} as DOMRect);observers.at(-1)!([],{} as ResizeObserver);await frame();assert.deepEqual(points(),original,'board scale is removed from the saved layout coordinates');
  note.getBoundingClientRect=()=>({left:800,top:750,width:440,height:280} as DOMRect);note.dispatchEvent(new dom.window.Event('transitionrun',{bubbles:true}));await frame();assert.equal(link.querySelector('line')!.getAttribute('y2'),'368','the line follows moving accordion sheets');
  mark.remove();await act(async()=>root.render(render('a',[...pages])));assert.equal(link.style.visibility,'hidden','missing or unresolved highlights never get a misleading line');
  await act(async()=>root.render(render()));assert.equal(link.style.visibility,'hidden');
 }finally{await act(async()=>root.unmount());}
});
