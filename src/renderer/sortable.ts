import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export type SortAxis='vertical'|'horizontal';
// Match the supertag property list: enter 25% moving forward, 75% moving back.
export function crossed(coordinate:number,start:number,size:number,direction:number) {
  return direction>0?coordinate>start+size*.25:direction<0&&coordinate<start+size*.75;
}
export function insertBookmark(keys:string[],key:string,index:number|null,fromStarred:boolean) {
  if(index===null)return fromStarred?keys.filter(k=>k!==key):keys;
  const next=keys.filter(k=>k!==key);next.splice(Math.max(0,Math.min(index,next.length)),0,key);return next;
}
function freezeStyle(source:HTMLElement,clone:HTMLElement) {
  const originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  originals.forEach((el,i)=>{const style=getComputedStyle(el),copy=copies[i] as HTMLElement;for(let j=0;j<style.length;j++){const name=style.item(j);copy.style.setProperty(name,style.getPropertyValue(name));}copy.removeAttribute('id');copy.removeAttribute('data-tooltip');copy.removeAttribute('aria-describedby');});
}
export function useBookmarkDrag(target:RefObject<HTMLDivElement|null>,commit:(key:string,index:number|null,fromStarred:boolean)=>void,axis:SortAxis='vertical') {
  const cancel=useRef<()=>void>(()=>{}),onCommit=useRef(commit);onCommit.current=commit;
  useEffect(()=>()=>cancel.current(),[]);
  return (event:ReactPointerEvent,key:string,fromStarred:boolean)=>{
    if(event.button!==0)return;
    cancel.current();
    const source=event.currentTarget.closest<HTMLElement>('[data-file-key]')!,list=target.current;
    if(!source||!list)return;
    const vertical=axis==='vertical',start=vertical?event.clientY:event.clientX,initialCross=vertical?event.clientX:event.clientY;
    const rect=source.getBoundingClientRect(),offset=start-(vertical?rect.top:rect.left),pointer=event.pointerId;
    let phantom:HTMLElement|null=null,placeholder:HTMLElement|null=null,active=false,ended=false,last=start,direction=0,x=event.clientX,y=event.clientY,frame=0;
    const animations=new Map<HTMLElement,Animation>();
    const duplicate=[...list.querySelectorAll<HTMLElement>('[data-file-key]')].find(el=>el!==source&&el.dataset.fileKey===key);
    const inside=()=>{const r=list.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;};
    const rows=()=>[...list.querySelectorAll<HTMLElement>(':scope > [data-file-key]')].filter(el=>el!==source&&el.dataset.fileKey!==key);
    const place=(before:HTMLElement|null)=>{
      if(!placeholder)return;
      if(placeholder.parentElement===list&&placeholder.nextElementSibling===before)return;
      const beforeRects=new Map(rows().map(el=>[el,el.getBoundingClientRect()]));
      animations.forEach(a=>a.cancel());animations.clear();
      list.insertBefore(placeholder,before);
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      for(const [row,r] of beforeRects){const next=row.getBoundingClientRect(),delta=vertical?r.top-next.top:r.left-next.left;if(delta&&row.animate){const animation=row.animate([{transform:vertical?`translateY(${delta}px)`:`translateX(${delta}px)`},{transform:'none'}],{duration:150,easing:'cubic-bezier(0.2,0,0,1)'});animations.set(row,animation);}}
    };
    const update=()=>{
      if(!active||!phantom)return;
      if(!source.isConnected){finish(false);return;}
      const coordinate=vertical?y:x,r=list.getBoundingClientRect(),inList=inside();
      const size=vertical?rect.height:rect.width,min=vertical?r.top:r.left,max=(vertical?r.bottom:r.right)-size;
      phantom.style[vertical?'top':'left']=(inList?Math.max(min,Math.min(max,coordinate-offset)):coordinate-offset)+'px';
      list.classList.toggle('drop-target',inList);
      document.body.dataset.bookmarkDrop=inList?'star':fromStarred?'remove':'';
      if(inList){
        if(!placeholder!.isConnected){const before=rows().find(row=>{const r=row.getBoundingClientRect();return coordinate<(vertical?r.top+r.height/2:r.left+r.width/2);});place(before??null);}
        const available=rows();
        for(let step=0;step<available.length;step++){
          const children=[...list.children].filter(el=>el===placeholder||available.includes(el as HTMLElement)),index=children.indexOf(placeholder!);
          const neighbor=children[index+(direction>0?1:-1)] as HTMLElement|undefined;
          if(!direction||!neighbor)break;
          const r=neighbor.getBoundingClientRect();
          if(!crossed(coordinate,vertical?r.top:r.left,vertical?r.height:r.width,direction))break;
          place(direction>0?(children[index+2] as HTMLElement??null):neighbor);
        }
      }else placeholder?.remove();
    };
    const tick=()=>{
      if(!active||ended)return;
      if(inside()){
        const r=list.getBoundingClientRect(),coordinate=vertical?y:x,min=vertical?r.top:r.left,max=vertical?r.bottom:r.right;
        const delta=coordinate<min+22?-5:coordinate>max-22?5:0;
        if(delta){const old=vertical?list.scrollTop:list.scrollLeft;if(vertical)list.scrollTop+=delta;else list.scrollLeft+=delta;if(old!==(vertical?list.scrollTop:list.scrollLeft)){direction=delta;update();}}
      }
      frame=requestAnimationFrame(tick);
    };
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==pointer)return;
      x=e.clientX;y=e.clientY;const coordinate=vertical?y:x;
      if(!active&&Math.hypot(coordinate-start,(vertical?x:y)-initialCross)<5)return;
      e.preventDefault();
      if(!active){
        active=true;phantom=source.cloneNode(true) as HTMLElement;freezeStyle(source,phantom);
        Object.assign(phantom.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',zIndex:'1000',pointerEvents:'none'});
        phantom.classList.add('drag-phantom');phantom.setAttribute('aria-hidden','true');phantom.inert=true;document.body.appendChild(phantom);
        placeholder=document.createElement('div');placeholder.className='sort-placeholder';placeholder.style.height=rect.height+'px';placeholder.style.width=rect.width+'px';
        if(fromStarred)list.insertBefore(placeholder,source);
        source.style.display='none';if(duplicate)duplicate.style.display='none';document.body.classList.add('list-dragging');frame=requestAnimationFrame(tick);
      }
      if(coordinate!==last)direction=coordinate-last;last=coordinate;update();
    };
    const suppress=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();};
    const finish=(save:boolean)=>{
      if(ended)return;ended=true;
      let index:number|null=null;
      if(save&&active&&inside()&&placeholder?.parentElement===list)index=[...list.children].slice(0,[...list.children].indexOf(placeholder)).filter(el=>el instanceof HTMLElement&&el.dataset.fileKey&&el!==source&&el.dataset.fileKey!==key).length;
      cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());source.style.removeProperty('display');duplicate?.style.removeProperty('display');phantom?.remove();placeholder?.remove();list.classList.remove('drop-target');document.body.classList.remove('list-dragging');delete document.body.dataset.bookmarkDrop;
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',keyboard,true);window.removeEventListener('blur',abort);cancel.current=()=>{};
      if(active){document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
      if(save&&active)onCommit.current(key,index,fromStarred);
    };
    const up=(e:PointerEvent)=>{if(e.pointerId===pointer){x=e.clientX;y=e.clientY;update();finish(x>=0&&y>=0&&x<=window.innerWidth&&y<=window.innerHeight);}};
    const abort=(event?:Event)=>{if(event?.type!=='pointercancel'||(event as PointerEvent).pointerId===pointer)finish(false);};
    const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
    cancel.current=abort;document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',keyboard,true);window.addEventListener('blur',abort);
  };
}
