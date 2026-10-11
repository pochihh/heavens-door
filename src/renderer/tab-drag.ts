import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {flushSync} from 'react-dom';
import {animateReorder,createDragPhantom,crossed} from './sortable';

export interface TabDrag {family:'side'|'main'|'view';group:string;key:string;document?:string}
export interface TabDrop {group:string;side?:'left'|'right';position:'tab'|'before'|'after';before?:string}
// Tab strips share bookmark visuals/thresholds; moving between strips unlocks Y.
export function useTabDrag(commit:(source:TabDrag,target:TabDrop)=>void){
  const [drag,setDrag]=useState<TabDrag|null>(null),cancel=useRef<()=>void>(()=>{}),onCommit=useRef(commit);onCommit.current=commit;
  useEffect(()=>()=>cancel.current(),[]);
  const begin=(event:ReactPointerEvent,value:TabDrag)=>{
    if(event.button!==0)return;
    cancel.current();
    const source=event.currentTarget.closest<HTMLElement>('[data-tab-key]');if(!source)return;
    const rect=source.getBoundingClientRect(),pointer=event.pointerId,startX=event.clientX,startY=event.clientY,offsetX=startX-rect.left,offsetY=startY-rect.top;
    let x=startX,y=startY,lastX=startX,direction=0,active=false,ended=false,frame=0,activeWidth=rect.width;
    let phantom:HTMLElement|null=null,preview:HTMLElement|null=null,target:HTMLElement|null=null,duplicate:HTMLElement|null=null;
    const animations=new Map<HTMLElement,Animation>();
    const rows=(strip:HTMLElement)=>[...strip.querySelectorAll<HTMLElement>(':scope > [data-tab-key]')].filter(el=>el!==source&&el!==duplicate);
    const iconWidth=(el:HTMLElement)=>parseFloat(getComputedStyle(el).minWidth)||el.getBoundingClientRect().width;
    const clearTarget=()=>{preview?.remove();target?.removeAttribute('data-tab-preview');duplicate?.style.removeProperty('display');duplicate=null;target=null;};
    const place=(before:HTMLElement|null)=>{
      if(!target||!preview||preview.parentElement===target&&preview.nextElementSibling===before)return;
      const bounds=new Map(rows(target).map(el=>[el,el.getBoundingClientRect()]));
      target.insertBefore(preview,before);animateReorder(bounds,'horizontal',animations);
    };
    const contains=(el:HTMLElement)=>{const r=el.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;};
    const update=(reorder=true)=>{
      if(!active||!phantom||!preview)return;
      if(!source.isConnected){finish(false);return;}
      const candidates=[...document.querySelectorAll<HTMLElement>('[data-tab-strip],[data-tab-drop]')];
      const next=candidates.find(el=>(el.dataset.tabFamily===value.family||((value.family==='side'&&value.key==='graph'||value.document==='graph:')&&['side','main'].includes(el.dataset.tabFamily??'')))&&(value.family!=='view'||el.dataset.tabGroup===value.group)&&contains(el))??null;
      if(next!==target){
        clearTarget();target=next;
        if(target){
          duplicate=rows(target).find(el=>el.dataset.tabKey===value.key)??null;
          if(duplicate)duplicate.style.display='none';
          target.dataset.tabPreview='true';
          const before=rows(target).find(el=>{const r=el.getBoundingClientRect();return x<r.left+r.width/2;});
          if(!target.classList.contains('dock-split-target'))place(before??null);
        }
      }
      if(target&&!target.classList.contains('dock-split-target')){
        const r=target.getBoundingClientRect(),margin=parseFloat(getComputedStyle(preview).marginLeft)||0;
        const available=rows(target),gap=parseFloat(getComputedStyle(target).columnGap)||0;
        // A lone Side Dock tab fills its source; fit it beside the destination icons.
        const width=value.family==='side'&&target!==source.parentElement?Math.min(activeWidth,Math.max(80,r.width-available.reduce((sum,el)=>sum+iconWidth(el),0)-gap*available.length)):activeWidth;
        Object.assign(preview.style,{width:width+'px',flex:'0 0 '+width+'px'});phantom.style.width=width+'px';
        const visibleWidth=phantom.getBoundingClientRect().width||width;
        const left=Math.max(r.left+margin,Math.min(Math.max(r.left+margin,r.right-visibleWidth-margin),x-offsetX*width/activeWidth));
        const edge=direction>0?left+visibleWidth:left;
        phantom.style.left=left+'px';
        phantom.style.top=(r.top+Math.max(0,(Math.min(r.height,42)-rect.height)/2))+'px';
        for(let step=0;reorder&&step<available.length;step++){
          const children=[...target.children].filter(el=>el===preview||available.includes(el as HTMLElement)),index=children.indexOf(preview);
          const neighbor=children[index+(direction>0?1:-1)] as HTMLElement|undefined;
          if(!direction||!neighbor)break;
          const r=neighbor.getBoundingClientRect(),transform=getComputedStyle(neighbor).transform;
          // Compare layout bounds, not the neighbor's animated displacement.
          const shift=transform&&transform!=='none'?new DOMMatrixReadOnly(transform).m41:0;
          if(!crossed(edge,r.left-shift,r.width,direction))break;
          place(direction>0?(children[index+2] as HTMLElement??null):neighbor);
        }
      }else{phantom.style.width=activeWidth+'px';phantom.style.left=x-offsetX+'px';phantom.style.top=y-offsetY+'px';}
    };
    const tick=()=>{
      if(!active||ended)return;
      if(target?.hasAttribute('data-tab-strip')){
        const r=target.getBoundingClientRect(),delta=x<r.left+22?-5:x>r.right-22?5:0,old=target.scrollLeft;
        if(delta){target.scrollLeft+=delta;if(old!==target.scrollLeft){direction=delta;update();}}
      }
      update(false);
      frame=requestAnimationFrame(tick);
    };
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==pointer)return;x=e.clientX;y=e.clientY;
      if(!active&&Math.hypot(x-startX,y-startY)<5)return;
      e.preventDefault();
      const expanding=!active&&source.matches('.module-tab:not(.selected)');
      if(!active){
        active=true;
        const label=source.querySelector<HTMLElement>('.module-tab-label'),labelStyle=label?getComputedStyle(label):null;
        const initialLabel=labelStyle?{maxWidth:labelStyle.maxWidth,marginLeft:labelStyle.marginLeft,opacity:labelStyle.opacity}:null;
        preview=source.cloneNode(true) as HTMLElement;
        for(const el of [preview,...preview.querySelectorAll('*')])for(const attr of ['id','data-tab-key','data-tooltip','aria-controls','aria-labelledby','aria-describedby','tabindex'])el.removeAttribute(attr);
        preview.querySelectorAll('[aria-hidden]').forEach(el=>el.removeAttribute('aria-hidden'));
        Object.assign(preview.style,{width:rect.width+'px',flex:'0 0 '+rect.width+'px'});
        preview.classList.add('tab-drop-preview',value.family==='side'?'selected':'active-tab');preview.setAttribute('aria-hidden','true');preview.inert=true;
        source.style.display='none';document.body.classList.add('list-dragging','tab-dragging');flushSync(()=>setDrag(value));
        // Preserve the source slot at lift, independent of where the tab was grabbed.
        target=source.parentElement!;target.dataset.tabPreview='true';target.insertBefore(preview,source);
        // Use the settled icon widths so an in-flight collapse cannot change the destination size.
        if(label){const gap=parseFloat(getComputedStyle(target).columnGap)||0;activeWidth=Math.max(80,target.getBoundingClientRect().width-rows(target).reduce((sum,el)=>sum+iconWidth(el)+gap,0));}
        phantom=createDragPhantom(preview);phantom.classList.remove('tab-drop-preview');phantom.classList.add('tab-phantom');
        if(initialLabel){
          const phantomLabel=phantom.querySelector<HTMLElement>('.module-tab-label')!;
          const finalLabel={maxWidth:phantomLabel.style.maxWidth,marginLeft:phantomLabel.style.marginLeft,opacity:phantomLabel.style.opacity};
          Object.assign(phantomLabel.style,initialLabel,{width:'auto'});
          phantom.style.transition='width var(--motion-normal) var(--motion-ease)';
          // Establish the lifted appearance, then let the normal label transition reveal its name.
          phantom.getBoundingClientRect();Object.assign(phantomLabel.style,finalLabel);
        }
        preview.style.visibility='hidden';
        frame=requestAnimationFrame(tick);
      }
      if(x!==lastX)direction=x-lastX;lastX=x;update(!expanding);
    };
    const suppress=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();};
    const finish=(save:boolean)=>{
      if(ended)return;ended=true;
      const siblings=target?[...target.children]:[],index=preview?siblings.indexOf(preview):-1;
      const before=siblings.slice(index+1).find(el=>el!==source&&el!==duplicate&&(el as HTMLElement).dataset.tabKey) as HTMLElement|undefined;
      const drop:TabDrop|null=save&&active&&target?{group:target.dataset.tabGroup??'',side:target.dataset.dockSide as TabDrop['side'],position:(target.dataset.tabDrop??'tab') as TabDrop['position'],before:before?.dataset.tabKey}:null;
      cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());clearTarget();source.style.removeProperty('display');phantom?.remove();
      document.body.classList.remove('list-dragging','tab-dragging');setDrag(null);
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',keyboard,true);window.removeEventListener('blur',abort);cancel.current=()=>{};
      if(active){document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
      if(drop)onCommit.current(value,drop);
    };
    const up=(e:PointerEvent)=>{if(e.pointerId===pointer){x=e.clientX;y=e.clientY;update(false);finish(x>=0&&y>=0&&x<=window.innerWidth&&y<=window.innerHeight);}};
    const abort=(event?:Event)=>{if(event?.type!=='pointercancel'||(event as PointerEvent).pointerId===pointer)finish(false);};
    const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
    cancel.current=abort;document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',keyboard,true);window.addEventListener('blur',abort);
  };
  return {drag,begin,cancel:()=>cancel.current()};
}
