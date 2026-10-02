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
export function createDragPhantom(source:HTMLElement,rect=source.getBoundingClientRect()) {
  const phantom=source.cloneNode(true) as HTMLElement;freezeStyle(source,phantom);
  // Preserve the composited surface so destination text cannot bleed through a translucent tab.
  const fill=getComputedStyle(source).backgroundColor;let parent=source.parentElement,backing='transparent';
  while(parent){backing=getComputedStyle(parent).backgroundColor;if(backing!=='transparent'&&!backing.endsWith(', 0)'))break;parent=parent.parentElement;}
  phantom.style.backgroundColor=backing;phantom.style.backgroundImage=`linear-gradient(${fill},${fill})`;
  Object.assign(phantom.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',zIndex:'1000',pointerEvents:'none',transition:'none'});
  phantom.classList.add('drag-phantom');phantom.setAttribute('aria-hidden','true');phantom.inert=true;(source.closest('dialog[open]')??document.body).appendChild(phantom);
  return phantom;
}
export function animateReorder(before:Map<HTMLElement,DOMRect>,axis:SortAxis,animations:Map<HTMLElement,Animation>) {
  animations.forEach(a=>a.cancel());animations.clear();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(const [row,r] of before){const next=row.getBoundingClientRect(),delta=axis==='vertical'?r.top-next.top:r.left-next.left;if(delta&&row.animate){const animation=row.animate([{transform:axis==='vertical'?`translateY(${delta}px)`:`translateX(${delta}px)`},{transform:'none'}],{duration:150,easing:'cubic-bezier(0.2,0,0,1)'});animations.set(row,animation);}}
}
export function useBookmarkDrag(target:RefObject<HTMLDivElement|null>,commit:(key:string,index:number|null,fromStarred:boolean,group?:string)=>void,axis:SortAxis='vertical',reorderOnly=false) {
  const cancel=useRef<()=>void>(()=>{}),onCommit=useRef(commit);onCommit.current=commit;
  useEffect(()=>()=>cancel.current(),[]);
  return (event:ReactPointerEvent,key:string,fromStarred:boolean)=>{
    if(event.button!==0)return;
    cancel.current();
    const source=event.currentTarget.closest<HTMLElement>('[data-file-key]')!,root=target.current;
    if(!source||!root)return;
    const groups=[...root.querySelectorAll<HTMLElement>('[data-sort-group]')];
    let list=groups.find(group=>group.contains(source))??root;
    const vertical=axis==='vertical',start=vertical?event.clientY:event.clientX,initialCross=vertical?event.clientX:event.clientY;
    const rect=source.getBoundingClientRect(),offset=start-(vertical?rect.top:rect.left),pointer=event.pointerId;
    let phantom:HTMLElement|null=null,placeholder:HTMLElement|null=null,active=false,ended=false,last=start,direction=0,x=event.clientX,y=event.clientY,frame=0;
    const animations=new Map<HTMLElement,Animation>();
    const duplicate=[...list.querySelectorAll<HTMLElement>('[data-file-key]')].find(el=>el!==source&&el.dataset.fileKey===key);
    const area=groups.length?root:list.closest<HTMLElement>('[data-bookmark-target]')??list;
    const scroller=vertical?(list.closest<HTMLElement>(reorderOnly?'.editor-body,.card-preview,.tag-view':'.nav-bottom')??list):list;
    const destination=()=>groups.length?groups.find(group=>{const r=(group.closest('[data-sort-area]')??group).getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}):list;
    const inside=()=>{const r=area.getBoundingClientRect(),clip=scroller.getBoundingClientRect();return !!destination()&&x>=r.left&&x<=r.right&&y>=Math.max(r.top,clip.top)&&y<=Math.min(r.bottom,clip.bottom);};
    const rows=()=>[...list.querySelectorAll<HTMLElement>(':scope > [data-file-key]')].filter(el=>el!==source&&el.dataset.fileKey!==key);
    const place=(before:HTMLElement|null)=>{
      if(!placeholder)return;
      if(placeholder.parentElement===list&&placeholder.nextElementSibling===before)return;
      const beforeRects=new Map((groups.length?[...root.querySelectorAll<HTMLElement>('[data-file-key]')].filter(el=>el!==source):rows()).map(el=>[el,el.getBoundingClientRect()]));
      animations.forEach(a=>a.cancel());animations.clear();
      list.insertBefore(placeholder,before);
      animateReorder(beforeRects,axis,animations);
    };
    const update=()=>{
      if(!active||!phantom)return;
      if(!source.isConnected){finish(false);return;}
      const coordinate=vertical?y:x,r=area.getBoundingClientRect(),inList=inside();
      const size=vertical?rect.height:rect.width,min=vertical?r.top:r.left,max=(vertical?r.bottom:r.right)-size;
      phantom.style[vertical?'top':'left']=(inList||reorderOnly?Math.max(min,Math.min(max,coordinate-offset)):coordinate-offset)+'px';
      if(!reorderOnly)document.body.dataset.bookmarkDrop=inList?'star':fromStarred?'remove':'';
      if(inList){
        list=destination()!;
        if(placeholder!.parentElement!==list){const before=rows().find(row=>{const r=row.getBoundingClientRect();return coordinate<(vertical?r.top+r.height/2:r.left+r.width/2);});place(before??null);}
        const available=rows();
        for(let step=0;step<available.length;step++){
          const children=[...list.children].filter(el=>el===placeholder||available.includes(el as HTMLElement)),index=children.indexOf(placeholder!);
          const neighbor=children[index+(direction>0?1:-1)] as HTMLElement|undefined;
          if(!direction||!neighbor)break;
          const r=neighbor.getBoundingClientRect();
          if(!crossed(coordinate,vertical?r.top:r.left,vertical?r.height:r.width,direction))break;
          place(direction>0?(children[index+2] as HTMLElement??null):neighbor);
        }
      }else if(!reorderOnly)placeholder?.remove();
    };
    const tick=()=>{
      if(!active||ended)return;
      if(inside()){
        const r=scroller.getBoundingClientRect(),coordinate=vertical?y:x,min=vertical?r.top:r.left,max=vertical?r.bottom:r.right;
        const delta=coordinate<min+22?-5:coordinate>max-22?5:0;
        if(delta){const old=vertical?scroller.scrollTop:scroller.scrollLeft;if(vertical)scroller.scrollTop+=delta;else scroller.scrollLeft+=delta;if(old!==(vertical?scroller.scrollTop:scroller.scrollLeft)){direction=delta;update();}}
      }
      frame=requestAnimationFrame(tick);
    };
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==pointer)return;
      x=e.clientX;y=e.clientY;const coordinate=vertical?y:x;
      if(!active&&Math.hypot(coordinate-start,(vertical?x:y)-initialCross)<5)return;
      e.preventDefault();
      if(!active){
        active=true;phantom=createDragPhantom(source,rect);
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
      cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());source.style.removeProperty('display');duplicate?.style.removeProperty('display');phantom?.remove();placeholder?.remove();document.body.classList.remove('list-dragging');delete document.body.dataset.bookmarkDrop;
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',keyboard,true);window.removeEventListener('blur',abort);cancel.current=()=>{};
      if(active){document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
      if(save&&active)onCommit.current(key,index,fromStarred,list.dataset.sortGroup);
    };
    const up=(e:PointerEvent)=>{if(e.pointerId===pointer){x=e.clientX;y=e.clientY;update();finish(x>=0&&y>=0&&x<=window.innerWidth&&y<=window.innerHeight);}};
    const abort=(event?:Event)=>{if(event?.type!=='pointercancel'||(event as PointerEvent).pointerId===pointer)finish(false);};
    const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
    cancel.current=abort;document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',keyboard,true);window.addEventListener('blur',abort);
  };
}

// Shared by tag pages and embedded views; pressing a card is not a drag until it moves.
export function dragKanban(e:ReactPointerEvent<HTMLElement>,root:HTMLElement,onDrop:(value:string,position:{before?:string;after?:string})=>void,accepts:(value:string)=>boolean,reorder=true){
  const source=e.currentTarget,rect=source.getBoundingClientRect(),start={x:e.clientX,y:e.clientY},pointer=e.pointerId,id=source.dataset.cardId;
  const home=source.closest<HTMLElement>('[data-tag-column]')!,columns=[...root.querySelectorAll<HTMLElement>('[data-tag-column]')];
  const cards=(column:HTMLElement)=>[...column.querySelectorAll<HTMLElement>('[data-card-id]')].filter(row=>row!==source&&row.dataset.cardId!==id);
  const initialBefore=source.nextElementSibling instanceof HTMLElement?source.nextElementSibling.dataset.cardId:undefined;
  let phantom:HTMLElement|null=null,target:HTMLElement|null=null,slot:HTMLElement|null=null,ended=false,x=start.x,y=start.y,lastY=y,frame=0;
  const animations=new Map<HTMLElement,Animation>(),hidden=new Map<HTMLElement,string>();
  const conceal=(row:HTMLElement)=>{if(!hidden.has(row))hidden.set(row,row.style.display);row.style.display='none';};
  const reveal=()=>{for(const [row,display] of hidden)row.style.display=display;hidden.clear();};
  function finish(save:boolean){
    if(ended)return;ended=true;cancelAnimationFrame(frame);
    const rows=target?cards(target):[],index=slot?rows.filter(row=>!!(row.compareDocumentPosition(slot!)&Node.DOCUMENT_POSITION_FOLLOWING)).length:0;
    const value=target?.dataset.tagColumn,before=rows[index]?.dataset.cardId,after=rows[index-1]?.dataset.cardId;
    const changed=target!==home||reorder&&before!==initialBefore,dragged=!!phantom;
    animations.forEach(a=>a.cancel());target?.classList.remove('kanban-drop');slot?.remove();phantom?.remove();reveal();document.body.classList.remove('list-dragging');
    document.removeEventListener('pointermove',motion);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);
    if(dragged){const suppress=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
    if(save&&dragged&&changed&&value!==undefined)onDrop(value,reorder?{before,after}:{});
  }
  function place(scrollY=0){
    if(!phantom||!slot)return;
    const bounds=root.getBoundingClientRect();
    const hit=columns.filter(column=>accepts(column.dataset.tagColumn!)&&(()=>{const r=column.getBoundingClientRect(),margin=column===target?24:12;return x>=bounds.left-24&&x<=bounds.right+24&&x>=r.left-margin&&x<=r.right+margin&&y>=bounds.top-24&&y<=bounds.bottom+24;})()).sort((a,b)=>Math.abs(x-(a.getBoundingClientRect().left+a.getBoundingClientRect().right)/2)-Math.abs(x-(b.getBoundingClientRect().left+b.getBoundingClientRect().right)/2))[0]??null;
    const changed=hit!==target;let layoutChanged=changed;
    const beforeRects=new Map([...new Set([target,hit])].flatMap(column=>column?cards(column):[]).map(row=>[row,row.getBoundingClientRect()]));
    if(changed){target?.classList.remove('kanban-drop');reveal();conceal(source);target=hit;
      if(target){target.classList.add('kanban-drop');for(const row of target.querySelectorAll<HTMLElement>('[data-card-id]'))if(row!==source&&row.dataset.cardId===id)conceal(row);target.append(slot);}else slot.remove();
    }
    if(target){
      const rows=cards(target);let before:HTMLElement|undefined;
      if(reorder){
        if(changed)before=rows.find(row=>y<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);
        else {
          const direction=Math.sign(y-lastY+scrollY),current=rows.filter(row=>!!(row.compareDocumentPosition(slot!)&Node.DOCUMENT_POSITION_FOLLOWING)).length;
          let index=current;
          if(direction>0)while(index<rows.length){const r=rows[index].getBoundingClientRect(),shift=Number(getComputedStyle(rows[index]).transform.match(/^matrix\((.+)\)$/)?.[1].split(',')[5])||0;if(!crossed(y,r.top-shift,r.height,1))break;index++;}
          if(direction<0)while(index>0){const r=rows[index-1].getBoundingClientRect(),shift=Number(getComputedStyle(rows[index-1]).transform.match(/^matrix\((.+)\)$/)?.[1].split(',')[5])||0;if(!crossed(y,r.top-shift,r.height,-1))break;index--;}
          before=rows[index];
        }
      }
      if(slot.nextElementSibling!==before&&(before||slot!==target.lastElementChild)){target.insertBefore(slot,before??null);layoutChanged=true;}
      const r=slot.getBoundingClientRect(),freeY=rect.top+y-start.y;
      phantom.style.left=r.left+'px';phantom.style.top=(r.top+Math.max(-10,Math.min(10,freeY-r.top)))+'px';phantom.style.width=r.width+'px';
    }else{phantom.style.left=rect.left+x-start.x+'px';phantom.style.top=rect.top+y-start.y+'px';phantom.style.width=rect.width+'px';}
    if(layoutChanged)animateReorder(beforeRects,'vertical',animations);lastY=y;
  }
  function scroll(){
    if(ended||!phantom)return;if(!root.isConnected){finish(false);return;}
    const r=root.getBoundingClientRect(),speed=(p:number,lo:number,hi:number)=>p<lo+32?-Math.min(14,(lo+32-p)/3):p>hi-32?Math.min(14,(p-hi+32)/3):0;
    const left=root.scrollLeft,top=root.scrollTop;
    if(x>=r.left-24&&x<=r.right+24&&y>=r.top-24&&y<=r.bottom+24){root.scrollLeft+=speed(x,r.left,r.right);root.scrollTop+=speed(y,r.top,r.bottom);if(left!==root.scrollLeft||top!==root.scrollTop)place(root.scrollTop-top);}
    frame=requestAnimationFrame(scroll);
  }
  function motion(event:PointerEvent){
    if(event.pointerId!==pointer||ended)return;if(!phantom&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<5)return;event.preventDefault();x=event.clientX;y=event.clientY;
    if(!phantom){phantom=createDragPhantom(source,rect);phantom.style.transition=matchMedia('(prefers-reduced-motion: reduce)').matches?'none':'left 100ms ease, top 100ms ease, width 100ms ease';slot=document.createElement('div');slot.className='kanban-slot';slot.style.height=rect.height+'px';slot.setAttribute('aria-hidden','true');source.before(slot);conceal(source);target=home;home.classList.add('kanban-drop');document.body.classList.add('list-dragging');frame=requestAnimationFrame(scroll);}
    place();
  }
  const up=(event:PointerEvent)=>{if(event.pointerId===pointer)finish(true);},abort=()=>finish(false),cancel=(event:PointerEvent)=>{if(event.pointerId===pointer)abort();},key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abort();}};
  document.addEventListener('pointermove',motion,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);return abort;
}
