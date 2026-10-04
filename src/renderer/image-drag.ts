import type {Editor} from '@tiptap/core';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {createDragPhantom,animateReorder} from './sortable';
import {overlayContainer} from './Overlays';
import {imageLayout,imageHtml,row,rowPicture,type ImageItem,type ImageLayout} from './image-layout';
export function suppressDragClick(){const suppress=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
export function dragImage(event:ReactPointerEvent,editor:Editor,position:number,index:number){
  if(event.button!==0)return()=>{};event.preventDefault();event.stopPropagation();
  const original=editor.state.doc,node=original.nodeAt(position),layout=node&&imageLayout(node);if(!node||!layout)return()=>{};
  const item=layout.kind==='row'?layout.images[index]:layout,source=(event.currentTarget as HTMLElement).closest<HTMLElement>('[data-image-item]')!;
  const rect=source.getBoundingClientRect(),pointer=event.pointerId,startX=event.clientX,startY=event.clientY;
  let phantom:HTMLElement|null=null,marker:HTMLElement|null=null,slot:HTMLElement|null=null,preview:HTMLElement|null=null,choice:{pos:number;index:number;join:boolean;after:boolean}|null=null;
  const animations=new Map<HTMLElement,Animation>(),styles=new Map<HTMLElement,string|null>();
  const remember=(el:HTMLElement)=>{if(!styles.has(el))styles.set(el,el.getAttribute('style'));};
  const resetPreview=()=>{animations.forEach(a=>a.cancel());animations.clear();slot?.remove();for(const [el,style] of styles){if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);}styles.clear();preview?.classList.remove('image-row-drop');preview=null;};
  const layoutRect=(el:HTMLElement)=>{const r=el.getBoundingClientRect(),scale=el.offsetWidth?r.width/el.offsetWidth:1,transform=getComputedStyle(el).transform.match(/^matrix\((.+)\)$/)?.[1].split(',').map(Number);return new DOMRect(r.left-(transform?.[4]??0)*scale,r.top-(transform?.[5]??0)*scale,r.width,r.height);};
  const motion=(e:PointerEvent)=>{
    if(e.pointerId!==pointer)return;if(!phantom&&Math.hypot(e.clientX-startX,e.clientY-startY)<5)return;e.preventDefault();
    if(!editor.state.doc.eq(original)){finish(false);return;}
    if(!phantom){phantom=createDragPhantom(source,rect);phantom.style.background='transparent';marker=document.createElement('div');marker.className='editor-block-drop';overlayContainer(source).append(marker);source.style.opacity='.25';document.body.classList.add('list-dragging','image-dragging');}
    phantom.style.left=rect.left+e.clientX-startX+'px';phantom.style.top=rect.top+e.clientY-startY+'px';marker!.hidden=true;
    // The entire image block accepts a row drop, including gaps and trailing space.
    const blocks=[...editor.view.dom.querySelectorAll<HTMLElement>('[data-image-position]')];
    const block=blocks.find(el=>{const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});
    if(block&&(Number(block.dataset.imagePosition)!==position||layout.kind==='row')){
      const r=slot?.getBoundingClientRect();
      if(preview===block&&r&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)return;
      const targets=[...block.querySelectorAll<HTMLElement>('[data-image-item]')].filter(el=>el!==source),rects=targets.map(el=>({el,r:layoutRect(el)}));
      // Pick the nearest visual line first, then the insertion point along that line.
      const distance=(r:DOMRect)=>Math.max(r.top-e.clientY,e.clientY-r.bottom,0);
      const nearest=[...rects].sort((a,b)=>distance(a.r)-distance(b.r))[0];if(!nearest)return;
      const line=rects.filter(({r})=>r.top<nearest.r.bottom&&r.bottom>nearest.r.top);
      const before=line.find(({r})=>e.clientX<(r.left+r.right)/2),target=before??line.at(-1)!;
      const next={pos:Number(block.dataset.imagePosition),index:Number(target.el.dataset.imageItem),join:true,after:!before};
      if(preview===block&&choice?.index===next.index&&choice.after===next.after)return;
      const oldRects=new Map(targets.map(el=>[el,el.getBoundingClientRect()]));
      animations.forEach(a=>a.cancel());animations.clear();
      if(preview!==block){resetPreview();preview=block;preview.classList.add('image-row-drop');}
      const content=block.querySelector<HTMLElement>('.image-layout-content')!;
      remember(content);if(!block.classList.contains('is-row')){Object.assign(content.style,{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'flex-start'});targets.forEach(el=>{remember(el);el.style.margin='0';});}
      if(!styles.has(block)){remember(block);block.style.minHeight=block.offsetHeight+'px';}
      if(Number(block.dataset.imagePosition)===position){remember(source);source.style.display='none';}
      slot??=document.createElement('div');slot.className='image-drop-slot';slot.setAttribute('aria-hidden','true');
      const picture=rowPicture(item),width=picture.kind==='single'?parseFloat(picture.width):160;
      Object.assign(slot.style,{width:width+'px',height:(rect.height/rect.width*width)+'px'});
      content.insertBefore(slot,next.after?target.el.nextSibling:target.el);
      animateReorder(oldRects,'both',animations);choice=next;return;
    }
    resetPreview();choice=null;
    const area=editor.view.dom.getBoundingClientRect();if(e.clientX<area.left-30||e.clientX>area.right+30||e.clientY<area.top||e.clientY>area.bottom+40)return;
    editor.state.doc.forEach((n,pos,i)=>{if(!i)return;const el=editor.view.nodeDOM(pos) as HTMLElement|null,r=el?.getBoundingClientRect();if(!r||e.clientY<r.top-12||e.clientY>r.bottom+12)return;const after=e.clientY>(r.top+r.bottom)/2;choice={pos,index:0,join:false,after};Object.assign(marker!.style,{left:area.left+'px',top:(after?r.bottom:r.top)+'px',width:area.width+'px',height:'2px'});marker!.hidden=false;});
  };
  const finish=(save:boolean)=>{
    document.removeEventListener('pointermove',motion);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);resetPreview();source.style.removeProperty('opacity');phantom?.remove();marker?.remove();document.body.classList.remove('list-dragging','image-dragging');if(phantom)suppressDragClick();else if(save)editor.commands.setNodeSelection(position);
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
