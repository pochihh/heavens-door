import {useLayoutEffect,useMemo,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {useDocumentLinks} from './DocumentLink';
import {ViewBlock} from './ViewBlock';
import {createPortal} from 'react-dom';
// The metadata slot is UI only: it never becomes Markdown or an editor node.
export function titleSlot(){const slot=document.createElement('div');slot.className='card-metadata';slot.contentEditable='false';return slot;}
export function TitleContent({html,afterTitle,path,...props}:{html:string;path?:string;afterTitle?:ReactNode}&HTMLAttributes<HTMLDivElement>){
  const links=useDocumentLinks(path??'');
  // YAML changes update the existing portals, not the surrounding rendered document.
  const content=useMemo(()=>{const template=document.createElement('template');template.innerHTML=html;
    const sources=[...template.content.querySelectorAll<HTMLPreElement>("pre:has(> code.language-view-block)")].map(pre=>{const source=pre.textContent??'';pre.hidden=true;pre.firstElementChild!.textContent='';return source;});
    return {html:template.innerHTML,sources};
  },[html]);
  const ref=useRef<HTMLDivElement>(null),[slot]=useState(titleSlot),[slots,setSlots]=useState<HTMLElement[]>([]);
  useLayoutEffect(()=>{const next=[...(ref.current?.querySelectorAll<HTMLPreElement>("pre:has(> code.language-view-block)")??[])].map((pre,i)=>{
    const target=slots[i]??document.createElement('div');target.className='view-block-preview';pre.after(target);return target;
  });setSlots(next);},[content.html]);
  useLayoutEffect(()=>{if(afterTitle){const heading=ref.current?.querySelector(':scope > h1');if(heading?.nextElementSibling!==slot)heading?.after(slot);}else slot.remove();},[content.html,afterTitle,slot]);
  return <><div {...props} onClick={e=>{if(!links.click(e))props.onClick?.(e);}} ref={ref} dangerouslySetInnerHTML={{__html:content.html}}/>{links.picker}{afterTitle&&createPortal(afterTitle,slot)}{slots.map((target,i)=>i<content.sources.length&&createPortal(<ViewBlock path={path} blockIndex={i} source={content.sources[i]}/>,target,path+'\0'+i))}</>;
}
