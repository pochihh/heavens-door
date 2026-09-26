import {Fragment,useCallback,useLayoutEffect,useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {MODULE_IDS,activeAfterRemoval,closeModule,moveModule,resizeGroups,type Docks,type DockSide,type ModuleId} from '../layout';
import {Icon,type IconName} from './Icons';
import {ActionMenu,type MenuState} from './Overlays';
import type {TabDrag} from './tab-drag';
export const modules:Record<ModuleId,{title:string;icon:IconName}>={
  whiteboards:{title:'Whiteboard explorer',icon:'map'},files:{title:'File explorer',icon:'folder'},bookmarks:{title:'Starred & Recent',icon:'star'},tags:{title:'Tags',icon:'tag'},search:{title:'Search',icon:'search'},agent:{title:'Agent console',icon:'agent'},history:{title:'History',icon:'clock'},
};
export {MODULE_IDS};
function revealActiveTabs(dock:HTMLElement|null){
  dock?.querySelectorAll<HTMLElement>('.module-tab.selected').forEach(tab=>{
    const strip=tab.parentElement!,visible=strip.getBoundingClientRect(),active=tab.getBoundingClientRect();
    if(active.left<visible.left)strip.scrollLeft+=active.left-visible.left;
    else if(active.right>visible.right)strip.scrollLeft+=active.right-visible.right;
  });
}
export function SideDock({side,docks,drag,onTabDrag,onChange,onPreview,renderModule}:{side:DockSide;docks:Docks;drag:TabDrag|null;onTabDrag:(event:PointerEvent,value:TabDrag)=>void;onChange:(docks:Docks)=>void;onPreview:(docks:Docks)=>void;renderModule:(module:ModuleId)=>ReactNode}){
  const [menu,setMenu]=useState<MenuState|null>(null);
  const closeMenu=useCallback(()=>setMenu(null),[]),resize=useRef<{start:number;fraction:number;size:number;initial:Docks;next:Docks}|null>(null);
  const dock=docks[side],name=side==='left'?'Left':'Right',dockElement=useRef<HTMLElement>(null);
  useLayoutEffect(()=>revealActiveTabs(dockElement.current),[dock]);
  const moving=drag?.family==='side'?drag:null;
  if(dock.collapsed||!dock.groups.length)return moving?<aside className="side-dock collapsed-dock-target" aria-label={name+' dock drop target'} style={{width:dock.width}}><div className="module-tabs" data-tab-family="side" data-tab-group="" data-dock-side={side} data-tab-drop="after"/><div className="module-content"/></aside>:null;
  return <aside ref={dockElement} onTransitionEnd={e=>{if(e.propertyName==='flex-basis'||e.propertyName==='flex-grow')revealActiveTabs(dockElement.current);}} className={'side-dock '+side+'-dock'} aria-label={name+' dock'} style={{width:dock.width}}>
    {dock.groups.map((group,index)=>{const active=(moving?.group===group.id?activeAfterRemoval(group.tabs,group.active,moving.key):group.active) as ModuleId|'';
      const openMenu=(target:Element,x:number,y:number)=>{
        const module=(target.closest<HTMLElement>('[data-tab-key]')?.dataset.tabKey??group.active) as ModuleId,other=side==='left'?'right':'left';
        setMenu({label:'Tab Group actions',x,y,actions:[
            {label:'Close View Tab',icon:'close',run:()=>onChange(closeModule(docks,module))},
            {separatorBefore:true,label:'Move View to '+other+' dock',icon:other,run:()=>onChange(moveModule(docks,{module},{side:other,position:'after'}))},
            {label:'Move Tab Group to '+other+' dock',icon:other,run:()=>onChange(moveModule(docks,{group:group.id},{side:other,position:'after'}))},
            {label:'Split View above',icon:'up',disabled:group.tabs.length===1,run:()=>onChange(moveModule(docks,{module},{side,group:group.id,position:'before'}))},
            {label:'Split View below',icon:'arrowDown',disabled:group.tabs.length===1,run:()=>onChange(moveModule(docks,{module},{side,group:group.id,position:'after'}))},
            ...dock.groups.filter(g=>g.id!==group.id).map(g=>({label:'Merge into '+modules[g.active].title,icon:'window' as const,run:()=>onChange(moveModule(docks,{group:group.id},{side,group:g.id,position:'tab'}))})),
            {label:'Collapse '+side+' dock',icon:side,separatorBefore:true,run:()=>onChange({...docks,[side]:{...dock,collapsed:true}})},
          ]});
      };
      return <Fragment key={group.id}>
      <section className="panel-group" aria-label={name+' Tab Group '+(index+1)} data-group={group.id} style={{flex:group.weight}}>
        <div className="module-tab-strip" onContextMenu={e=>{e.preventDefault();openMenu(e.target as Element,e.clientX,e.clientY);}}>
          <div className="module-tabs" role="tablist" aria-label={name+' Tab Group views'} data-tab-strip data-tab-family="side" data-tab-group={group.id} data-dock-side={side} onKeyDown={e=>{
            if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const target=e.target as HTMLElement,r=target.getBoundingClientRect();openMenu(target,r.left,r.bottom);return;}
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')],current=buttons.indexOf(document.activeElement as HTMLButtonElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();buttons[next]?.click();
          }}>
            {group.tabs.map(module=><button key={module} role="tab" id={'tab-'+module} data-tab-key={module} aria-label={modules[module].title} aria-selected={active===module} aria-controls={'module-'+module} tabIndex={active===module?0:-1} className={'module-tab '+(active===module?'selected':'')} data-tooltip={modules[module].title+' · drag to move · right-click for layout options'} onPointerDown={e=>onTabDrag(e,{family:'side',group:group.id,key:module})} onClick={()=>onChange({...docks,[side]:{...dock,groups:dock.groups.map(g=>g.id===group.id?{...g,active:module}:g)}})}><Icon name={modules[module].icon}/><span className="module-tab-label" aria-hidden={active!==module}>{modules[module].title}</span></button>)}
          </div>
        </div>
        <div className="module-content" role="tabpanel" id={active?'module-'+active:undefined} aria-labelledby={active?'tab-'+active:undefined} aria-label={active?modules[active].title:'Empty Tab Group'}>{active?renderModule(active):null}</div>
        {moving&&(moving.group!==group.id||group.tabs.length>1)&&<div className="dock-split-target" aria-hidden="true" data-tab-family="side" data-tab-group={group.id} data-dock-side={side} data-tab-drop="after"/>}
      </section>
      {index<dock.groups.length-1&&<div className="dock-splitter" role="separator" tabIndex={0} aria-label={'Resize '+side+' Tab Groups'} aria-orientation="horizontal" aria-valuenow={Math.round(group.weight/(group.weight+dock.groups[index+1].weight)*100)}
        onPointerDown={e=>{const before=e.currentTarget.previousElementSibling!.getBoundingClientRect(),after=e.currentTarget.nextElementSibling!.getBoundingClientRect();resize.current={start:e.clientY,fraction:group.weight/(group.weight+dock.groups[index+1].weight),size:before.height+after.height,initial:docks,next:docks};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
        onPointerMove={e=>{const r=resize.current;if(r){r.next=resizeGroups(r.initial,side,index,r.fraction+(e.clientY-r.start)/Math.max(1,r.size));onPreview(r.next);}}}
        onPointerUp={()=>{if(resize.current)onChange(resize.current.next);resize.current=null;}} onPointerCancel={()=>{if(resize.current)onPreview(resize.current.initial);resize.current=null;}}
        onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onChange(resizeGroups(docks,side,index,group.weight/(group.weight+dock.groups[index+1].weight)+(e.key==='ArrowDown'?.05:-.05)));}}}/>}
    </Fragment>;})}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
  </aside>;
}
