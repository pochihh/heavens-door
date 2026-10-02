import { ui } from '../text/ui';
import { useEffect, useLayoutEffect, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icons';

export function overlayContainer(anchor?:Element|null){return anchor?.closest('dialog[open]')??[...document.querySelectorAll('dialog[open]')].at(-1)??document.body;}

// One delegated tooltip for the window, including controls mounted inside portals.
export function TooltipHost() {
  const [tip,setTip]=useState<{text:string;rect:DOMRect}|null>(null);
  const element=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>,target:HTMLElement|null=null,description:string|null=null;
    const hide=()=>{clearTimeout(timer);if(target){if(description===null)target.removeAttribute('aria-describedby');else target.setAttribute('aria-describedby',description);}target=null;setTip(null);};
    const show=(event:Event)=>{
      const next=event.target instanceof Element?event.target.closest<HTMLElement>('[data-tooltip]'):null;
      if(next===target)return;
      hide();if(!next||document.body.classList.contains('list-dragging')||document.querySelector('.docking'))return;
      target=next;description=next.getAttribute('aria-describedby');
      timer=setTimeout(()=>{if(!next.isConnected)return;next.setAttribute('aria-describedby',[description,'app-tooltip'].filter(Boolean).join(' '));setTip({text:next.dataset.tooltip!,rect:next.getBoundingClientRect()});},450);
    };
    const leave=(event:Event)=>{const related=(event as MouseEvent).relatedTarget;if(!(related instanceof Node)||!target?.contains(related))hide();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
    document.addEventListener('pointerover',show);document.addEventListener('pointerout',leave);document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide,true);document.addEventListener('scroll',hide,true);document.addEventListener('keydown',key);window.addEventListener('blur',hide);
    return()=>{hide();document.removeEventListener('pointerover',show);document.removeEventListener('pointerout',leave);document.removeEventListener('focusout',hide);document.removeEventListener('pointerdown',hide,true);document.removeEventListener('scroll',hide,true);document.removeEventListener('keydown',key);window.removeEventListener('blur',hide);};
  },[]);
  useLayoutEffect(()=>{
    if(!tip||!element.current)return;
    const box=element.current.getBoundingClientRect(),r=tip.rect;
    element.current.style.left=Math.max(8,Math.min(innerWidth-box.width-8,r.left+(r.width-box.width)/2))+'px';
    element.current.style.top=(r.bottom+box.height+14<innerHeight?r.bottom+7:Math.max(8,r.top-box.height-7))+'px';
  },[tip]);
  return tip?createPortal(<div ref={element} id="app-tooltip" className="hover-tooltip" role="tooltip">{tip.text}</div>,overlayContainer()):null;
}
export interface MenuAction {danger?:boolean;separatorBefore?:boolean;label:string;icon?:IconName;checked?:boolean;checkType?:'checkbox'|'radio';disabled?:boolean;hint?:string;run:()=>void}
export interface MenuState {anchor?:HTMLElement;above?:boolean;label?:string;x:number;y:number;actions:MenuAction[]}
export function ActionMenu({menu,onClose}:{menu:MenuState;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null),restoreFocus=useRef(true);
  useLayoutEffect(()=>{
    const el=ref.current!,box=el.getBoundingClientRect(),previous=document.activeElement;
    restoreFocus.current=true;
    el.style.left=Math.max(8,Math.min(menu.x,innerWidth-box.width-8))+'px';
    el.style.top=Math.max(8,Math.min(menu.above?menu.y-box.height-4:menu.y,innerHeight-box.height-8))+'px';
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return()=>{if(restoreFocus.current&&previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[menu]);
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!menu.anchor?.contains(e.target as Node)){restoreFocus.current=false;onClose();}};
    document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',onClose);window.addEventListener('resize',onClose);
    return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',onClose);window.removeEventListener('resize',onClose);};
  },[onClose,menu.anchor]);
  return createPortal(<div ref={ref} className="context-menu" role="menu" aria-label={menu.label??ui.menus.explorerActions} onKeyDown={e=>{
    const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();onClose();}
  }}>{menu.actions.map((action,i)=><Fragment key={i}>{action.separatorBefore&&<div role="separator" className="menu-separator"/>}<button role={action.checked!==undefined?(action.checkType==='checkbox'?'menuitemcheckbox':'menuitemradio'):'menuitem'} className={action.danger?'danger':undefined} aria-checked={action.checked} disabled={action.disabled} data-tooltip={action.hint} onClick={()=>{onClose();action.run();}}>{action.icon?<Icon name={action.icon}/>:<span className="menu-icon-space"/>}<span>{action.label}</span>{action.checked&&<Icon name="check" size={14}/>}</button></Fragment>)}</div>,overlayContainer());
}
