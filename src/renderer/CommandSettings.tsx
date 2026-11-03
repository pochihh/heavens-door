import {ui} from '../text/ui';
import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {Tool} from './Icons';
import {useBookmarkDrag} from './sortable';

export function moveCommand<T extends {id:string;enabled:boolean}>(items:T[],id:string,enabled:boolean,index:number):T[]{
 const item=items.find(item=>item.id===id);if(!item)return items;
 const rest=items.filter(item=>item.id!==id),active=rest.filter(item=>item.enabled),inactive=rest.filter(item=>!item.enabled),group=enabled?active:inactive;
 group.splice(Math.max(0,Math.min(index,group.length)),0,{...item,enabled});return [...active,...inactive];
}
export function CommandSettings({items,onMove,onEdit,icon}:{items:{id:string;name:string;description?:string;enabled:boolean}[];onMove:(id:string,enabled:boolean,index:number)=>void;onEdit:(id:string,anchor:HTMLElement)=>void;icon?:(id:string)=>ReactNode}){
 const root=useRef<HTMLDivElement>(null),focus=useRef('');
 const drag=useBookmarkDrag(root,(id,index,_source,group)=>{
  if(index===null||!group)return;const item=items.find(item=>item.id===id),enabled=group==='enabled';
  if(!item||item.enabled===enabled&&items.filter(item=>item.enabled===enabled).findIndex(item=>item.id===id)===index)return;
  onMove(id,enabled,index);
 },'vertical',true);
 useLayoutEffect(()=>{if(focus.current){const row=[...root.current!.querySelectorAll<HTMLElement>('.command-setting')].find(row=>row.dataset.command===focus.current);row?.querySelector<HTMLButtonElement>('[data-command-handle]')?.focus({preventScroll:true});focus.current='';}},[items]);
 return <div className="command-settings" ref={root}><p className="muted">{ui.commandSettings.help}</p>{[true,false].map(enabled=>{
  const group=items.filter(item=>item.enabled===enabled);
  return <section key={String(enabled)} data-sort-area aria-label={enabled?ui.commandSettings.enabled:ui.commandSettings.disabled} className="command-group">
   <h3>{enabled?ui.commandSettings.enabled:ui.commandSettings.disabled}<span>{group.length}</span></h3><div className="command-group-list" data-sort-group={enabled?'enabled':'disabled'}>{group.length?group.map((item,index)=><div key={item.id} className="command-setting" data-command={item.id} data-file-key={item.id} onPointerDown={e=>{if((e.target as Element).closest('button:not([data-command-handle]),input,select,textarea,a,[contenteditable=true]'))return;drag(e,item.id,true);}}>
    <Tool icon="grip" data-command-handle label={ui.commandSettings.move(item.name)} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight" onKeyDown={e=>{if(!e.altKey)return;if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();onMove(item.id,enabled,index+(e.key==='ArrowUp'?-1:1));}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();focus.current=item.id;onMove(item.id,!enabled,items.filter(other=>other.enabled!==enabled).length);}}}/>{icon&&<span className="command-setting-icon">{icon(item.id)}</span>}<div className="command-setting-meta"><strong>{item.name}</strong>{item.description&&<small>{item.description}</small>}</div><Tool icon="edit" label={ui.commandSettings.edit(item.name)} onClick={e=>onEdit(item.id,e.currentTarget)}/>
   </div>):<p className="command-empty">{ui.commandSettings.empty}</p>}</div>
  </section>;
 })}</div>;
}
