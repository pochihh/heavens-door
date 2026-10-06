import {useLayoutEffect,useMemo,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {TextSearch} from '../core/search';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {Icon,Tool} from './Icons';
import {PropertyPopover} from './PropertyValue';

interface TabItem {key:string;title:string;path?:string;icon:ReactNode}
export function MainTabs({group,active,items,dragging,onSelect,onClose,onMenu,onDrag,children}:{group:string;active:string;items:TabItem[];dragging:boolean;onSelect:(key:string)=>void;onClose:(key:string)=>void;onMenu:(key:string,x:number,y:number)=>void;onDrag:(e:PointerEvent,key:string)=>void;children:ReactNode}){
  const list=useRef<HTMLDivElement>(null),[anchor,setAnchor]=useState<HTMLElement|null>(null),[query,setQuery]=useState('');
  const signature=JSON.stringify(items.map(item=>[item.key,item.title]));
  function reveal(key=active){const el=list.current!,tab=[...el.querySelectorAll<HTMLElement>(':scope > [data-tab-key]')].find(tab=>tab.dataset.tabKey===key);if(!tab||dragging)return;const r=tab.getBoundingClientRect(),bounds=el.getBoundingClientRect();if(r.left<bounds.left)el.scrollLeft-=bounds.left-r.left;else if(r.right>bounds.right)el.scrollLeft+=r.right-bounds.right;}
  useLayoutEffect(()=>{
    const el=list.current!,resize=()=>reveal(),observer=new ResizeObserver(resize);resize();observer.observe(el);return()=>observer.disconnect();
    // Contents and active selection, not unrelated draft saves, reveal the active tab.
  },[signature,active,dragging]);
  const search=useMemo(()=>{const index=new TextSearch();items.forEach(item=>index.update({path:item.key,name:item.title,title:item.title,body:item.path??''}));return index;},[items]);
  const shown=query.trim()?search.search(query).map(hit=>items.find(item=>item.key===hit.path)!):items;
  function choose(key:string){setAnchor(null);onSelect(key);[...list.current!.querySelectorAll<HTMLElement>('[data-tab-key]')].find(tab=>tab.dataset.tabKey===key)?.querySelector<HTMLButtonElement>('[role=tab]')?.focus({preventScroll:true});}
  return <div className="tab-strip">
    <div ref={list} className="tab-list" role="tablist" aria-label={ui.layout.openFiles} data-tab-strip data-tab-family="main" data-tab-group={group} onWheel={e=>{const el=list.current!;if(e.ctrlKey||e.metaKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||!e.deltaY||el.scrollWidth<=el.clientWidth)return;el.scrollLeft+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?el.clientWidth:1);}}>
      {items.map((item,index)=><div className={'tab '+(active===item.key?'active-tab':'')} key={item.key} data-tab-key={item.key} onAuxClick={e=>{if(e.button===1){e.preventDefault();onClose(item.key);}}} onContextMenu={e=>{e.preventDefault();onMenu(item.key,e.clientX,e.clientY);}} onKeyDown={e=>{
        if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();onMenu(item.key,r.left,r.bottom);return;}
        if(!(e.target as Element).closest('[role=tab]'))return;
        const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowLeft'?(index+items.length-1)%items.length:e.key==='ArrowRight'?(index+1)%items.length:-1;
        if(next<0)return;e.preventDefault();onSelect(items[next].key);const tab=list.current!.children[next].querySelector<HTMLButtonElement>('[role=tab]')!;tab.focus({preventScroll:true});reveal(items[next].key);
      }}>
        <button role="tab" aria-label={item.title} tabIndex={active===item.key?0:-1} onPointerDown={e=>onDrag(e,item.key)} aria-selected={active===item.key} data-tooltip={item.path||item.title} onClick={()=>onSelect(item.key)}>{item.icon}<span className="tab-title">{item.title}</span></button>
        <Tool icon="close" label={tooltips.tabs.close(item.title)} tabIndex={active===item.key?0:-1} onClick={()=>onClose(item.key)}/>
      </div>)}
    </div>
    {!!items.length&&<Tool className="tab-picker-toggle" icon="search" label={ui.layout.searchTabs} aria-haspopup="dialog" aria-expanded={!!anchor} onClick={e=>{setQuery('');setAnchor(anchor?null:e.currentTarget);}}/>}
    {children}
    {anchor&&<PropertyPopover anchor={anchor} align="end" label={ui.layout.searchTabs} className="main-tab-picker" onClose={()=>setAnchor(null)}>
      <input aria-label={ui.layout.searchTabs} placeholder={ui.layout.searchTabs} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&shown.length){e.preventDefault();choose(shown[0].key);}}}/>
      <div role="listbox" aria-label={ui.layout.openFiles}>{shown.map(item=><button type="button" key={item.key} role="option" aria-selected={item.key===active} onClick={()=>choose(item.key)} onContextMenu={e=>{e.preventDefault();setAnchor(null);onMenu(item.key,e.clientX,e.clientY);}}>{item.icon}<span>{item.title}{item.path&&<small>{item.path}</small>}</span>{item.key===active&&<Icon name="check" size={14}/>}</button>)}{!shown.length&&<p>{ui.layout.noMatchingTabs}</p>}</div>
    </PropertyPopover>}
  </div>;
}
