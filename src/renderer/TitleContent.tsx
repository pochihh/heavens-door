import {useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
// The metadata slot is UI only: it never becomes Markdown or an editor node.
export function titleSlot(){const slot=document.createElement('div');slot.className='card-metadata';slot.contentEditable='false';return slot;}
export function TitleContent({html,afterTitle,...props}:{html:string;afterTitle?:ReactNode}&HTMLAttributes<HTMLDivElement>){
  const ref=useRef<HTMLDivElement>(null),[slot]=useState(titleSlot);
  useLayoutEffect(()=>{if(afterTitle){const heading=ref.current?.querySelector(':scope > h1');if(heading?.nextElementSibling!==slot)heading?.after(slot);}else slot.remove();},[html,afterTitle,slot]);
  return <><div {...props} ref={ref} dangerouslySetInnerHTML={{__html:html}}/>{afterTitle&&createPortal(afterTitle,slot)}</>;
}
