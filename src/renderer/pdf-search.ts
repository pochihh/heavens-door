import {useEffect,useMemo,useRef,useState} from 'react';
import type {PDFDocumentProxy,PDFPageProxy} from 'pdfjs-dist';
type TextContent=Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

export interface PdfSearchMatch {page:number;start:number;end:number}
interface PageText {text:string;breaks:number[]}
function pageText(content:TextContent):PageText {
  let text='';const breaks:number[]=[];
  for(const item of content.items){if(!('str' in item))continue;text+=item.str;if(item.hasEOL){breaks.push(text.length);text+='\n';}}
  return {text,breaks};
}
function matchesOnPage({text,breaks}:PageText,query:string,page:number):PdfSearchMatch[] {
  const pattern=query.trim().split(/\s+/).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
  if(!pattern)return [];
  const matches:PdfSearchMatch[]=[];let removed=0;
  // TextLayer offsets exclude the line breaks inserted for phrase searching.
  const offset=(index:number)=>{while(removed<breaks.length&&breaks[removed]<index)removed++;return index-removed;};
  for(const match of text.matchAll(new RegExp(pattern,'giu')))matches.push({page,start:offset(match.index),end:offset(match.index+match[0].length)});
  return matches;
}
export function createPdfSearch(pdf:Pick<PDFDocumentProxy,'numPages'|'getPage'>){
  const pages=new Map<number,Promise<PageText>>();
  return async(query:string,cancelled=()=>false)=>{
    const matches:PdfSearchMatch[]=[];if(!query.trim())return matches;
    for(let page=1;page<=pdf.numPages;page++){
      if(cancelled())return [];
      let content=pages.get(page);if(!content){content=pdf.getPage(page).then(p=>p.getTextContent()).then(pageText);pages.set(page,content);}
      const text=await content;if(cancelled())return [];
      matches.push(...matchesOnPage(text,query,page));
    }
    return matches;
  };
}
export function usePdfSearch(pdf:PDFDocumentProxy|null,page:number,onMatch:(match:PdfSearchMatch)=>void){
  const search=useMemo(()=>pdf?createPdfSearch(pdf):null,[pdf]),latest=useRef({page,onMatch});latest.current={page,onMatch};
  const [query,setQuery]=useState(''),[state,setState]=useState({matches:[] as PdfSearchMatch[],current:-1,pending:false,error:'',reveal:0});
  useEffect(()=>{
    let cancelled=false;setState(old=>({...old,matches:[],current:-1,pending:!!search&&!!query.trim(),error:''}));
    if(!search||!query.trim())return;
    const timer=setTimeout(()=>{void search(query,()=>cancelled).then(matches=>{
      if(cancelled)return;const current=matches.length?Math.max(0,matches.findIndex(match=>match.page>=latest.current.page)):-1;
      setState(old=>({...old,matches,current,pending:false,reveal:old.reveal+1}));if(current>=0)latest.current.onMatch(matches[current]);
    }).catch(error=>{if(!cancelled)setState(old=>({...old,pending:false,error:String(error)}));});},180);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[search,query]);
  const next=(direction:number)=>{
    if(!state.matches.length||state.pending)return;
    const current=(state.current+direction+state.matches.length)%state.matches.length;
    setState(old=>({...old,current,reveal:old.reveal+1}));latest.current.onMatch(state.matches[current]);
  };
  return {...state,query,setQuery,next};
}
export function highlightPdfMatches(divs:HTMLElement[],strings:string[],matches:PdfSearchMatch[],current:PdfSearchMatch|undefined){
  let start=0,index=0;let focused:HTMLElement|undefined;
  for(let i=0;i<divs.length;i++){
    const div=divs[i],text=strings[i],end=start+text.length,fragment=div.ownerDocument.createDocumentFragment();let cursor=0;
    while(index<matches.length&&matches[index].end<=start)index++;
    for(let m=index;m<matches.length&&matches[m].start<end;m++){
      const match=matches[m],from=Math.max(0,match.start-start),to=Math.min(text.length,match.end-start);
      fragment.append(text.slice(cursor,from));const mark=div.ownerDocument.createElement('mark');
      const selected=match===current;mark.className='pdf-find-match'+(selected?' current':'');mark.textContent=text.slice(from,to);fragment.append(mark);cursor=to;if(selected&&!focused)focused=mark;
    }
    fragment.append(text.slice(cursor));div.replaceChildren(fragment);start=end;
  }
  return focused;
}
