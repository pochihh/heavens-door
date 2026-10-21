import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {PDFDocumentProxy,PDFPageProxy} from 'pdfjs-dist';
type TextContent=Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
import {createPdfSearch,highlightPdfMatches,usePdfSearch} from '../src/renderer/pdf-search';

const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});after(()=>dom.window.close());
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
const text=(...items:(string|{str:string;hasEOL:boolean})[])=>({items:items.map(item=>typeof item==='string'?{str:item}:item),styles:{}} as TextContent);
const pdf=(pages:TextContent[],reads:number[]=[])=>({numPages:pages.length,getPage:async(page:number)=>({getTextContent:async()=>{reads.push(page);return pages[page-1];}})} as unknown as PDFDocumentProxy);

test('PDF find locates every literal match, including split spans and phrases across line breaks',async()=>{
 const find=createPdfSearch(pdf([text('Alpha alpha AL',{str:'PHA',hasEOL:true},'Line two. [x] $ a+b 😀'),text('Alpha')]));
 assert.deepEqual(await find('alpha'),[{page:1,start:0,end:5},{page:1,start:6,end:11},{page:1,start:12,end:17},{page:2,start:0,end:5}]);
 assert.deepEqual(await find('ALPHA line'),[{page:1,start:12,end:21}]);
 const literal=await find('[x] $ a+b');assert.equal(literal.length,1);assert.equal(literal[0].end-literal[0].start,9);
 assert.equal((await find('😀'))[0].end-(await find('😀'))[0].start,2);assert.deepEqual(await find('  '),[]);assert.deepEqual(await find('missing'),[]);
});
test('PDF find reuses extracted page text and stops stale searches before reading another page',async()=>{
 const reads:number[]=[],find=createPdfSearch(pdf([text('alpha'),text('beta alpha')],reads));
 await find('alpha');await find('beta');assert.deepEqual(reads,[1,2]);
 let release!:(content:TextContent)=>void,cancelled=false;const loaded:number[]=[],slow={numPages:2,getPage:async(page:number)=>{loaded.push(page);return {getTextContent:()=>page===1?new Promise<TextContent>(resolve=>{release=resolve;}):Promise.resolve(text('alpha'))};}} as unknown as PDFDocumentProxy;
 const search=createPdfSearch(slow),pending=search('alpha',()=>cancelled);await Promise.resolve();cancelled=true;release(text('alpha'));assert.deepEqual(await pending,[]);assert.deepEqual(loaded,[1]);assert.equal((await search('alpha')).length,2);assert.deepEqual(loaded,[1,2]);
 const broken={numPages:1,getPage:async()=>{throw new Error('Unreadable page');}} as unknown as PDFDocumentProxy;await assert.rejects(()=>createPdfSearch(broken)('alpha'),/Unreadable page/);
});
test('find marks distinguish the focused occurrence without changing text, layout spans or saved highlights',async()=>{
 const host=document.createElement('div');host.innerHTML='<span data-annotation="saved">Original highlight</span><div class="textLayer"><span style="left:20px"></span><span></span><span></span></div>';
 const strings=['Alpha AL','PHA alpha ','<img src=x onerror=bad>'],divs=[...host.querySelectorAll<HTMLElement>('.textLayer>span')];
 const matches=await createPdfSearch(pdf([text(...strings)]))('alpha'),current=matches[1];
 const focused=highlightPdfMatches(divs,strings,matches,current);assert.ok(focused?.matches('.pdf-find-match.current'));assert.equal(host.querySelectorAll('.pdf-find-match').length,4,'a split occurrence has two marked fragments');assert.equal(host.querySelectorAll('.current').length,2);assert.deepEqual(divs.map(div=>div.textContent),strings);assert.equal(divs[0].style.left,'20px');assert.equal(host.querySelector('img'),null);assert.equal(host.querySelector('[data-annotation=saved]')!.textContent,'Original highlight');
 highlightPdfMatches(divs,strings,matches,matches[2]);assert.equal(host.querySelectorAll('.current').length,1);assert.equal(host.querySelector('.current')!.textContent,'alpha');
 highlightPdfMatches(divs,strings,[],undefined);assert.equal(host.querySelector('mark'),null);assert.deepEqual(divs.map(div=>div.textContent),strings);
});
test('live find starts at the current page, wraps individual matches, clears results and ignores cancelled queries',async()=>{
 const reads:number[]=[],source=pdf([text('alpha alpha'),text('alpha beta')],reads),selected:number[]=[];let find!:ReturnType<typeof usePdfSearch>;
 function Harness(){find=usePdfSearch(source,2,match=>selected.push(match.start+match.page*100));return null;}
 const root=createRoot(document.getElementById('root')!);const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,210));});
 try{await act(async()=>root.render(<Harness/>));await act(async()=>find.setQuery('alpha'));assert.equal(find.pending,true);await settle();assert.equal(find.matches.length,3);assert.equal(find.current,2);assert.deepEqual(selected,[200]);
  await act(async()=>find.next(1));assert.equal(find.current,0);assert.equal(selected.at(-1),100);await act(async()=>find.next(-1));assert.equal(find.current,2);assert.equal(selected.at(-1),200);
  await act(async()=>{find.setQuery('not found');});await settle();assert.equal(find.current,-1);assert.equal(find.pending,false);assert.equal(find.error,'');await act(async()=>find.next(1));assert.equal(find.current,-1);
  await act(async()=>find.setQuery('alpha'));await act(async()=>find.setQuery('beta'));await settle();assert.equal(find.matches.length,1);assert.equal(find.matches[0].start,6);assert.deepEqual(reads,[1,2]);
  await act(async()=>find.setQuery(''));assert.equal(find.matches.length,0);assert.equal(find.pending,false);
 }finally{await act(async()=>root.unmount());}
});

test('board search previews never request navigation until next or previous is explicitly invoked',async()=>{
 const source=pdf([text('alpha alpha'),text('alpha beta')]),selected:number[]=[];let find!:ReturnType<typeof usePdfSearch>;
 function Harness(){find=usePdfSearch(source,2,match=>selected.push(match.page*100+match.start),true);return null;}
 const root=createRoot(document.getElementById('root')!),settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,210));});
 try{await act(async()=>root.render(<Harness/>));await act(async()=>find.setQuery('alpha'));await settle();assert.equal(find.matches.length,3);assert.equal(find.current,2);assert.equal(find.requested,undefined);assert.equal(find.reveal,0);assert.deepEqual(selected,[]);
  await act(async()=>find.next(1));assert.deepEqual(selected,[200]);assert.equal(find.current,2,'first Enter goes to the previewed result');assert.equal(find.requested,find.matches[2]);assert.equal(find.reveal,1);await act(async()=>find.next(1));assert.equal(find.current,0);assert.equal(selected.at(-1),100);
  await act(async()=>find.setQuery('beta'));await settle();assert.equal(find.requested,undefined);assert.equal(find.reveal,2);assert.equal(selected.length,2,'editing after navigation does not navigate again');await act(async()=>find.next(-1));assert.equal(selected.at(-1),206);
  await act(async()=>find.setQuery('alpha'));await act(async()=>find.next(1));assert.equal(selected.length,3);await settle();assert.equal(selected.at(-1),200,'Enter during the debounce navigates once results are ready');assert.equal(selected.length,4);
 }finally{await act(async()=>root.unmount());}
});
