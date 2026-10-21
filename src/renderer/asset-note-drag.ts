import {readingText} from '../text/reading';
import {overlayContainer} from './Overlays';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {clearDocumentDrop,clearDocumentNavigation,dropDocumentAt,previewDocumentDrop,type DocumentDrag} from './card-drop';
import {createDragPhantom,suppressDragClick} from './sortable';

export function dragAssetNote(event:ReactPointerEvent,drag:()=>DocumentDrag){
  if(event.button!==0)return ()=>{};
  event.preventDefault();event.stopPropagation();
  const handle=event.currentTarget,source=handle.closest<HTMLElement>('.sticky-note')!,r=source.getBoundingClientRect(),pointer=event.pointerId,start={x:event.clientX,y:event.clientY};
  handle.setPointerCapture?.(pointer);
  const region=source.closest<HTMLElement>('.board-pdf,.document-reading-layout')??source.closest<HTMLElement>('.annotation-rail')??source;
  let x=start.x,y=start.y,phantom:HTMLElement|undefined,boundary:HTMLElement|undefined,status:HTMLElement|undefined,ended=false,ready=false;
  const move=(e:PointerEvent)=>{
    if(e.pointerId!==pointer)return;x=e.clientX;y=e.clientY;
    if(!phantom&&Math.hypot(x-start.x,y-start.y)<5)return;
    e.preventDefault();
    if(!phantom){phantom=createDragPhantom(source,r);boundary=document.createElement('div');boundary.className='asset-note-drop-boundary';status=document.createElement('div');status.className='asset-note-drop-status';status.setAttribute('role','status');overlayContainer(source).append(boundary,status);document.body.classList.add('asset-note-dragging');}
    phantom.style.left=x+'px';phantom.style.top=y+'px';
    const box=region.getBoundingClientRect(),margin=48,outside=x<box.left-margin||x>box.right+margin||y<box.top-margin||y>box.bottom+margin;
    Object.assign(boundary!.style,{left:box.left-margin+'px',top:box.top-margin+'px',width:box.width+margin*2+'px',height:box.height+margin*2+'px'});
    if(outside)ready=previewDocumentDrop(drag(),x,y,source);else{ready=false;clearDocumentDrop();clearDocumentNavigation();}
    document.body.classList.toggle('asset-note-drop-ready',ready);phantom.dataset.dropReady=String(ready);boundary!.dataset.dropReady=String(ready);status!.textContent=ready?readingText.releaseComment:readingText.moveCommentOutside;Object.assign(status!.style,{left:Math.max(8,Math.min(x+12,window.innerWidth-280))+'px',top:Math.max(8,Math.min(y-32,window.innerHeight-40))+'px'});
  };
  const finish=(save:boolean)=>{
    if(ended)return;ended=true;if(handle.hasPointerCapture?.(pointer))handle.releasePointerCapture(pointer);
    if(phantom&&save&&ready)dropDocumentAt(drag(),x,y,source);
    phantom?.remove();boundary?.remove();status?.remove();document.body.classList.remove('asset-note-dragging','asset-note-drop-ready');clearDocumentDrop();clearDocumentNavigation();
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);
    if(phantom)suppressDragClick();
  };
  const up=(e:PointerEvent)=>{if(e.pointerId===pointer){if(phantom)move(e);finish(true);}},abort=()=>finish(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  return abort;
}
