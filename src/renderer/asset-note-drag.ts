import type {PointerEvent as ReactPointerEvent} from 'react';
import {clearDocumentDrop,clearDocumentNavigation,dropDocumentAt,previewDocumentDrop,type DocumentDrag} from './card-drop';
import {createDragPhantom,suppressDragClick} from './sortable';

export function dragAssetNote(event:ReactPointerEvent,drag:()=>DocumentDrag){
  if(event.button!==0)return ()=>{};
  event.preventDefault();event.stopPropagation();
  const source=event.currentTarget.closest<HTMLElement>('.sticky-note')!,r=source.getBoundingClientRect(),pointer=event.pointerId,start={x:event.clientX,y:event.clientY};
  let x=start.x,y=start.y,phantom:HTMLElement|undefined,ended=false;
  const move=(e:PointerEvent)=>{
    if(e.pointerId!==pointer)return;x=e.clientX;y=e.clientY;
    if(!phantom&&Math.hypot(x-start.x,y-start.y)<5)return;
    e.preventDefault();
    if(!phantom){phantom=createDragPhantom(source,r);document.body.classList.add('asset-note-dragging');}
    phantom.style.left=x+'px';phantom.style.top=y+'px';previewDocumentDrop(drag(),x,y,source);
  };
  const finish=(save:boolean)=>{
    if(ended)return;ended=true;
    if(phantom&&save)dropDocumentAt(drag(),x,y,source);
    phantom?.remove();document.body.classList.remove('asset-note-dragging');clearDocumentDrop();clearDocumentNavigation();
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);
    if(phantom)suppressDragClick();
  };
  const up=(e:PointerEvent)=>{if(e.pointerId===pointer){move(e);finish(true);}},abort=()=>finish(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  return abort;
}
