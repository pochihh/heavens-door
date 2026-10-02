import {useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {ViewBlock} from './ViewBlock';
import {createPortal} from 'react-dom';
// The metadata slot is UI only: it never becomes Markdown or an editor node.
export function titleSlot(){const slot=document.createElement('div');slot.className='card-metadata';slot.contentEditable='false';return slot;}
export function TitleContent({html,afterTitle,path,...props}:{html:string;path?:string;afterTitle?:ReactNode}&HTMLAttributes<HTMLDivElement>){
  const ref=useRef<HTMLDivElement>(null),[slot]=useState(titleSlot),[blocks,setBlocks]=useState<{source:string;slot:HTMLElement}[]>([]);
  useLayoutEffect(()=>{const items=[...(ref.current?.querySelectorAll<HTMLPreElement>("pre:has(> code.language-view-block)")??[])].map(pre=>{const slot=document.createElement("div");slot.className="view-block-preview";pre.after(slot);pre.hidden=true;return {pre,slot,source:pre.textContent??""};});setBlocks(items);return()=>{for(const item of items){item.slot.remove();item.pre.hidden=false;}};},[html]);
  useLayoutEffect(()=>{if(afterTitle){const heading=ref.current?.querySelector(':scope > h1');if(heading?.nextElementSibling!==slot)heading?.after(slot);}else slot.remove();},[html,afterTitle,slot]);
  return <><div {...props} ref={ref} dangerouslySetInnerHTML={{__html:html}}/>{afterTitle&&createPortal(afterTitle,slot)}{blocks.map((block,i)=>createPortal(<ViewBlock path={path} blockIndex={i} source={block.source}/>,block.slot,String(i)))}</>;
}
