import {Fragment,useCallback,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {MODULE_IDS,moveModule,resizeGroups,type Docks,type DockSide,type ModuleId,type DockDrag,type DockDrop} from '../layout';
import {Icon,Tool,type IconName} from './Icons';
import {ActionMenu,type MenuState} from './Overlays';
export const modules:Record<ModuleId,{title:string;icon:IconName}>={
  whiteboards:{title:'Whiteboard explorer',icon:'map'},files:{title:'File explorer',icon:'folder'},bookmarks:{title:'Starred & Recent',icon:'star'},tags:{title:'Tags',icon:'tag'},search:{title:'Search',icon:'search'},agent:{title:'Agent console',icon:'agent'},history:{title:'History',icon:'clock'},
};
export {MODULE_IDS};
const mime='application/heavens-module';
export function SideDock({side,docks,drag,onDrag,onChange,onPreview,renderModule}:{side:DockSide;docks:Docks;drag:DockDrag|null;onDrag:(drag:DockDrag|null)=>void;onChange:(docks:Docks)=>void;onPreview:(docks:Docks)=>void;renderModule:(module:ModuleId)=>ReactNode}){
  const [menu,setMenu]=useState<MenuState|null>(null),[hover,setHover]=useState<string|null>(null);
  const closeMenu=useCallback(()=>setMenu(null),[]),resize=useRef<{start:number;fraction:number;size:number;initial:Docks;next:Docks}|null>(null);
  const dock=docks[side],name=side==='left'?'Left':'Right';
  const begin=(event:DragEvent,value:DockDrag)=>{event.dataTransfer.setData(mime,JSON.stringify(value));event.dataTransfer.effectAllowed='move';onDrag(value);};
  const drop=(event:DragEvent,target:DockDrop)=>{
    if(!drag)return;event.preventDefault();event.stopPropagation();onChange(moveModule(docks,drag,target));onDrag(null);setHover(null);
  };
  const over=(event:DragEvent,key:string)=>{if(!drag)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setHover(key);};
  const zone=(target:DockDrop,key:string)=><div className={'dock-drop-zone '+(hover===key?'drop-over':'')} data-dock-drop={key} onDragOver={e=>over(e,key)} onDragLeave={()=>setHover(null)} onDrop={e=>drop(e,target)}>{drag&&<span>{dock.collapsed?name+' dock':'New panel group'}</span>}</div>;
  if(dock.collapsed||!dock.groups.length)return drag?<aside className="collapsed-dock-target" aria-label={name+' dock drop target'}>{zone({side,position:'after'},side+':empty')}</aside>:null;
  return <aside className={'side-dock '+side+'-dock'} aria-label={name+' dock'} style={{width:dock.width}}>
    {dock.groups.map((group,index)=><Fragment key={group.id}>
      <section className="panel-group" aria-label={name+' panel group '+(index+1)} data-group={group.id} style={{flex:group.weight}}>
        {drag&&zone({side,group:group.id,position:'before'},group.id+':before')}
        <div className={'module-tab-strip '+(hover===group.id+':tab'?'drop-over':'')} onDragOver={e=>over(e,group.id+':tab')} onDragLeave={()=>setHover(null)} onDrop={e=>drop(e,{side,group:group.id,position:'tab'})}>
          <div className="module-tabs" role="tablist" aria-label={name+' panel modules'} onKeyDown={e=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')],current=buttons.indexOf(document.activeElement as HTMLButtonElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();buttons[next]?.click();
          }}>
            {group.tabs.map(module=><button key={module} role="tab" aria-label={modules[module].title} aria-selected={group.active===module} aria-controls={'module-'+module} tabIndex={group.active===module?0:-1} className={'module-tab '+(group.active===module?'selected':'')} data-tooltip={modules[module].title+' · drag to move'} draggable onDragStart={e=>begin(e,{module})} onDragEnd={()=>{onDrag(null);setHover(null);}} onDragOver={e=>over(e,group.id+':tab')} onDrop={e=>drop(e,{side,group:group.id,position:'tab',beforeTab:module})} onClick={()=>onChange({...docks,[side]:{...dock,groups:dock.groups.map(g=>g.id===group.id?{...g,active:module}:g)}})}><Icon name={modules[module].icon}/></button>)}
          </div>
          <Tool icon="grip" label="Drag panel group" className="group-grip" draggable onDragStart={e=>begin(e,{group:group.id})} onDragEnd={()=>{onDrag(null);setHover(null);}}/>
          <Tool icon="more" label={'Panel group actions · '+modules[group.active].title} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect(),other=side==='left'?'right':'left';setMenu({label:'Panel group actions',x:rect.left,y:rect.bottom,actions:[
            {label:'Move module to '+other+' dock',icon:other,run:()=>onChange(moveModule(docks,{module:group.active},{side:other,position:'after'}))},
            {label:'Move group to '+other+' dock',icon:other,run:()=>onChange(moveModule(docks,{group:group.id},{side:other,position:'after'}))},
            {label:'Split module above',icon:'up',disabled:group.tabs.length===1,run:()=>onChange(moveModule(docks,{module:group.active},{side,group:group.id,position:'before'}))},
            {label:'Split module below',icon:'arrowDown',disabled:group.tabs.length===1,run:()=>onChange(moveModule(docks,{module:group.active},{side,group:group.id,position:'after'}))},
            ...dock.groups.filter(g=>g.id!==group.id).map(g=>({label:'Merge into '+modules[g.active].title,icon:'window' as const,run:()=>onChange(moveModule(docks,{group:group.id},{side,group:g.id,position:'tab'}))})),
            {label:'Collapse '+side+' dock',icon:side,separatorBefore:true,run:()=>onChange({...docks,[side]:{...dock,collapsed:true}})},
          ]});}}/>
        </div>
        <div className="module-content" role="tabpanel" id={'module-'+group.active} aria-label={modules[group.active].title}>{renderModule(group.active)}</div>
        {drag&&zone({side,group:group.id,position:'after'},group.id+':after')}
      </section>
      {index<dock.groups.length-1&&<div className="dock-splitter" role="separator" tabIndex={0} aria-label={'Resize '+side+' panel groups'} aria-orientation="horizontal" aria-valuenow={Math.round(group.weight/(group.weight+dock.groups[index+1].weight)*100)}
        onPointerDown={e=>{const before=e.currentTarget.previousElementSibling!.getBoundingClientRect(),after=e.currentTarget.nextElementSibling!.getBoundingClientRect();resize.current={start:e.clientY,fraction:group.weight/(group.weight+dock.groups[index+1].weight),size:before.height+after.height,initial:docks,next:docks};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
        onPointerMove={e=>{const r=resize.current;if(r){r.next=resizeGroups(r.initial,side,index,r.fraction+(e.clientY-r.start)/Math.max(1,r.size));onPreview(r.next);}}}
        onPointerUp={()=>{if(resize.current)onChange(resize.current.next);resize.current=null;}} onPointerCancel={()=>{if(resize.current)onPreview(resize.current.initial);resize.current=null;}}
        onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onChange(resizeGroups(docks,side,index,group.weight/(group.weight+dock.groups[index+1].weight)+(e.key==='ArrowDown'?.05:-.05)));}}}/>}
    </Fragment>)}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
  </aside>;
}
