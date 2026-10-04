import type {Editor} from '@tiptap/core';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {createDragPhantom} from './sortable';
import {overlayContainer} from './Overlays';
import {imageLayout,imageHtml,row,rowPicture,type ImageItem,type ImageLayout} from './image-layout';
export function suppressDragClick(){const suppress=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
export function dragImage(event:ReactPointerEvent,editor:Editor,position:number,index:number){
  if(event.button!==0)return()=>{};event.preventDefault();event.stopPropagation();
  const original=editor.state.doc,node=original.nodeAt(position),layout=node&&imageLayout(node);if(!node||!layout)return()=>{};
  const item=layout.kind==='row'?layout.images[index]:layout,source=(event.currentTarget as HTMLElement).closest<HTMLElement>('[data-image-item]')!;
  const rect=source.getBoundingClientRect(),pointer=event.pointerId,startX=event.clientX,startY=event.clientY;
  let phantom:HTMLElement|null=null,marker:HTMLElement|null=null,choice:{pos:number;index:number;join:boolean;after:boolean}|null=null;
  const motion=(e:PointerEvent)=>{
    if(e.pointerId!==pointer)return;if(!phantom&&Math.hypot(e.clientX-startX,e.clientY-startY)<5)return;e.preventDefault();
    if(!editor.state.doc.eq(original)){finish(false);return;}
    if(!phantom){phantom=createDragPhantom(source,rect);marker=document.createElement('div');marker.className='editor-block-drop';overlayContainer(source).append(marker);source.style.opacity='.25';document.body.classList.add('list-dragging');}
    phantom.style.left=rect.left+e.clientX-startX+'px';phantom.style.top=rect.top+e.clientY-startY+'px';choice=null;marker!.hidden=true;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-image-item]');
    if(target&&editor.view.dom.contains(target)){
      const r=target.getBoundingClientRect(),pos=Number(target.closest<HTMLElement>('[data-image-position]')!.dataset.imagePosition),i=Number(target.dataset.imageItem);
      if(pos===position&&i===index)return;
      const join=e.clientY>r.top+Math.min(24,r.height*.2)&&e.clientY<r.bottom-Math.min(24,r.height*.2),after=join?e.clientX>(r.left+r.right)/2:e.clientY>(r.top+r.bottom)/2;
      choice={pos,index:i,join,after};marker!.hidden=false;Object.assign(marker!.style,{left:(join?(after?r.right:r.left):r.left)+'px',top:(join?r.top:after?r.bottom:r.top)+'px',width:(join?2:r.width)+'px',height:(join?r.height:2)+'px'});
    }else{
      const area=editor.view.dom.getBoundingClientRect();if(e.clientX<area.left-30||e.clientX>area.right+30||e.clientY<area.top||e.clientY>area.bottom+40)return;
      editor.state.doc.forEach((n,pos,i)=>{if(!i)return;const el=editor.view.nodeDOM(pos) as HTMLElement|null,r=el?.getBoundingClientRect();if(!r||e.clientY<r.top-12||e.clientY>r.bottom+12)return;const after=e.clientY>(r.top+r.bottom)/2;choice={pos,index:0,join:false,after};Object.assign(marker!.style,{left:area.left+'px',top:(after?r.bottom:r.top)+'px',width:area.width+'px',height:'2px'});marker!.hidden=false;});
    }
  };
  const finish=(save:boolean)=>{
    document.removeEventListener('pointermove',motion);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);source.style.removeProperty('opacity');phantom?.remove();marker?.remove();document.body.classList.remove('list-dragging');if(phantom)suppressDragClick();else if(save)editor.commands.setNodeSelection(position);
    if(!save||!choice||!editor.state.doc.eq(original))return;
    const target=original.nodeAt(choice.pos);if(!target)return;
    const html=(value:ImageLayout)=>editor.schema.nodes.htmlBlock.create({source:imageHtml(value)}),tr=editor.state.tr;
    if(choice.join){
      const destination=imageLayout(target);if(!destination)return;
      const items=destination.kind==='row'?[...destination.images]:[destination];
      let at=choice.index+(choice.after?1:0);
      if(choice.pos===position){items.splice(index,1);if(at>index)at--;items.splice(at,0,rowPicture(item));tr.replaceWith(position,position+node.nodeSize,html({...destination as ReturnType<typeof row>,kind:'row',images:items}));}
      else{
        items.splice(at,0,rowPicture(item));const next=destination.kind==='row'?{...destination,images:items}:row(items.map(rowPicture));
        tr.replaceWith(choice.pos,choice.pos+target.nodeSize,html(next));const from=tr.mapping.map(position),to=tr.mapping.map(position+node.nodeSize);
        const remaining=layout.kind==='row'?layout.images.filter((_,i)=>i!==index):[];if(remaining.length)tr.replaceWith(from,to,html({...layout as ReturnType<typeof row>,images:remaining}));else tr.delete(from,to);
      }
    }else{
      const remaining:ImageItem[]=layout.kind==='row'?layout.images.filter((_,i)=>i!==index):[];
      const at=choice.pos+(choice.after?target.nodeSize:0);
      if(at===position||at===position+node.nodeSize){if(layout.kind!=='row')return;}
      if(remaining.length)tr.replaceWith(position,position+node.nodeSize,html({...layout as ReturnType<typeof row>,images:remaining}));else tr.delete(position,position+node.nodeSize);
      tr.insert(tr.mapping.map(at,choice.after?1:-1),html(item));
    }
    editor.view.dispatch(tr);editor.commands.focus();
  };
  const up=(e:PointerEvent)=>{if(e.pointerId===pointer)finish(true);},abort=()=>finish(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
  document.addEventListener('pointermove',motion,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);return abort;
}
