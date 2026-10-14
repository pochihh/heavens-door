import type {PointerEvent as ReactPointerEvent} from 'react';
import {suppressDragClick} from './sortable';
export function panRecords(event:ReactPointerEvent,el:HTMLElement,scroll?:{left:number;top:number}){
    const x=event.clientX,y=event.clientY,left=el.scrollLeft,pointer=event.pointerId;let active=false,ended=false;
    const finish=(restore=false)=>{
      if(ended)return;ended=true;
      document.removeEventListener('pointermove',motion);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);
      if(restore){el.scrollLeft=left;if(scroll)scroll.left=left;}document.body.classList.remove('records-panning');
      if(active)suppressDragClick();
    };
    const motion=(e:PointerEvent)=>{
      if(e.pointerId!==pointer)return;
      if(!active){if(Math.abs(e.clientY-y)>Math.max(5,Math.abs(e.clientX-x))){finish();return;}if(Math.abs(e.clientX-x)<5)return;active=true;document.body.classList.add('records-panning');}
      e.preventDefault();el.scrollLeft=left+x-e.clientX;if(scroll)scroll.left=el.scrollLeft;
    };
    const up=(e:PointerEvent)=>{if(e.pointerId===pointer)finish();},abort=()=>finish(true),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
    document.addEventListener('pointermove',motion,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);return abort;
}
