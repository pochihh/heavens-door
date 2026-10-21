import { ui } from '../text/ui';
import { useEffect, useLayoutEffect, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {MenuCheck, Icon, type IconName } from './Icons';

export function overlayContainer(anchor?:Element|null){return anchor?anchor.closest('dialog[open],[aria-modal=true]')??document.body:[...document.querySelectorAll('dialog[open],[aria-modal=true]')].at(-1)??document.body;}

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
export interface MenuAction {danger?:boolean;separatorBefore?:boolean;label:string;icon?:IconName;checked?:boolean;checkType?:'checkbox'|'radio';disabled?:boolean;hint?:string;submenu?:MenuAction[];run?:()=>void}
export interface MenuState {anchor?:HTMLElement;toggleAnchor?:boolean;above?:boolean;label?:string;x:number;y:number;actions:MenuAction[]}
export function ActionMenu({menu,onClose}:{menu:MenuState;onClose:()=>void}) {
  return <MenuPanel menu={menu} onClose={onClose} onChoose={onClose}/>;
}
function MenuPanel({menu,onClose,onChoose,parent,focus=true}:{menu:MenuState;onClose:()=>void;onChoose:()=>void;parent?:HTMLElement;focus?:boolean}) {
  const [child,setChild]=useState<{action:MenuAction;anchor:HTMLElement;focus:boolean}|null>(null);
  const ref=useRef<HTMLDivElement>(null),restoreFocus=useRef(true);
  useLayoutEffect(()=>{
    const el=ref.current!,box=el.getBoundingClientRect(),previous=document.activeElement;
    restoreFocus.current=!parent;
    const x=parent&&menu.x+box.width>innerWidth-8?parent.closest('.context-menu')!.getBoundingClientRect().left-box.width+2:menu.x;
    el.style.left=Math.max(8,Math.min(x,innerWidth-box.width-8))+'px';
    el.style.top=Math.max(8,Math.min(menu.above?menu.y-box.height-4:menu.y,innerHeight-box.height-8))+'px';
    if(focus)el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return()=>{if(restoreFocus.current&&previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[menu,parent,focus]);
  useEffect(()=>{
    if(parent)return;
    const outside=(e:PointerEvent)=>{if(!(e.target as Element).closest?.('.context-menu')&&!((menu.toggleAnchor||menu.anchor?.matches('button,[role=button]'))&&menu.anchor?.contains(e.target as Node))){restoreFocus.current=false;onChoose();}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!(e.target as Element).closest?.('.context-menu')){e.preventDefault();e.stopImmediatePropagation();onChoose();}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);window.addEventListener('blur',onChoose);window.addEventListener('resize',onChoose);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);window.removeEventListener('blur',onChoose);window.removeEventListener('resize',onChoose);};
  },[onChoose,menu.anchor,menu.toggleAnchor,parent]);
  return createPortal(<><div ref={ref} className="context-menu" role="menu" aria-label={menu.label??ui.menus.explorerActions} onKeyDown={e=>{
    const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
    if(e.key==='ArrowRight'){const button=document.activeElement as HTMLElement,action=menu.actions[Number(button.dataset.menuIndex)];if(action?.submenu){e.preventDefault();e.stopPropagation();setChild({action,anchor:button,focus:true});}}
    if(parent&&(e.key==='ArrowLeft'||e.key==='Escape')){e.preventDefault();e.stopPropagation();parent.focus();onClose();return;}
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();e.stopPropagation();onClose();}
  }}>{menu.actions.map((action,i)=><Fragment key={i}>{action.separatorBefore&&<div role="separator" className="menu-separator"/>}<button role={action.checked!==undefined?(action.checkType==='checkbox'?'menuitemcheckbox':'menuitemradio'):'menuitem'} className={action.danger?'danger':undefined} data-menu-index={i} aria-checked={action.checked} aria-haspopup={action.submenu?'menu':undefined} aria-expanded={action.submenu?child?.action===action:undefined} onFocus={()=>{if(child&&child.action!==action)setChild(null);}} onPointerEnter={e=>setChild(action.submenu?{action,anchor:e.currentTarget,focus:false}:null)} disabled={action.disabled} data-tooltip={action.hint} onClick={e=>{if(action.submenu){setChild({action,anchor:e.currentTarget,focus:true});return;}onChoose();action.run?.();}}>{action.checked!==undefined?<MenuCheck checked={action.checked}/>:action.icon?<Icon name={action.icon}/>:<span className="menu-icon-space"/>}<span>{action.label}</span>{action.submenu&&<Icon name="chevron" size={14}/>}</button></Fragment>)}</div>{child&&<MenuPanel key={child.action.label} parent={child.anchor} focus={child.focus} onChoose={onChoose} menu={{anchor:child.anchor,label:child.action.label,x:child.anchor.getBoundingClientRect().right-2,y:child.anchor.getBoundingClientRect().top,actions:child.action.submenu!}} onClose={()=>setChild(null)}/>}</>,overlayContainer(menu.anchor));
}
