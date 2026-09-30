import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Checkpoint, CheckpointChange } from '../shared';
import type { Session } from './session';
import { ActionMenu, type MenuState } from './Overlays';
import { createDragPhantom } from './sortable';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';

export function diverged(source:Checkpoint,target:Checkpoint,items:Checkpoint[]) {
  const map=new Map(items.map(item=>[item.id,item]));
  const ancestor=(a:string,b:string)=>{const seen=new Set<string>(),pending=[b];while(pending.length){const id=pending.pop()!;if(id===a)return true;if(seen.has(id))continue;seen.add(id);pending.push(...(map.get(id)?.parents??[]));}return false;};
  return source.parents.length===1&&!ancestor(source.id,target.id)&&!ancestor(target.id,source.id);
}
export function historyLanes(items:Checkpoint[]) {
  const lanes:string[]=[],positions=new Map<string,number>();
  for(const item of items){let lane=lanes.indexOf(item.id);if(lane<0){lane=lanes.indexOf('');if(lane<0)lane=lanes.length;}positions.set(item.id,lane);lanes[lane]='';
    for(const [i,parent] of item.parents.entries()){if(lanes.includes(parent))continue;if(i===0)lanes[lane]=parent;else{let empty=lanes.indexOf('');if(empty<0)empty=lanes.length;lanes[empty]=parent;}}
  }
  return positions;
}
export function HistoryPanel({session}:{session:Session}) {
  const {checkpoints:items,snapshot}=session.state;
  const [selected,setSelected]=useState(''),[changes,setChanges]=useState<CheckpointChange[]>([]),[menu,setMenu]=useState<MenuState|null>(null),[limit,setLimit]=useState(200);
  const cancelDrag=useRef<()=>void>(()=>{});
  useEffect(()=>()=>cancelDrag.current(),[]);
  useEffect(()=>{
    let live=true;setChanges([]);
    if(selected)void session.bridge.request<CheckpointChange[]>({kind:'checkpointChanges',id:selected}).then(rows=>{if(live)setChanges(rows);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[selected,session]);
  const go=(item:Checkpoint)=>{if(!item.active&&window.confirm(ui.history.confirmRestore(item.label)))void session.restore(item.id).catch(()=>undefined);};
  const apply=(source:Checkpoint,target:Checkpoint)=>{if(diverged(source,target,items)&&window.confirm(ui.history.confirmApply(source.label,target.label)))void session.restore(target.id,source.id).catch(()=>undefined);};
  function context(item:Checkpoint,x:number,y:number){
    setSelected(item.id);const current=items.find(c=>c.active);
    setMenu({x,y,label:ui.history.selected,actions:[{label:ui.history.restore,icon:'clock',disabled:item.active,run:()=>go(item)},
      ...(current&&diverged(item,current,items)?[{label:ui.history.apply,icon:'plus' as const,run:()=>apply(item,current)}]:[])]});
  }
  function drag(event:ReactPointerEvent<HTMLButtonElement>,item:Checkpoint){
    if(event.button!==0||item.parents.length!==1)return;cancelDrag.current();
    const source=event.currentTarget,rect=source.getBoundingClientRect(),pointer=event.pointerId,start=event.clientY;
    let phantom:HTMLElement|null=null,target:HTMLElement|null=null;
    const finish=(save:boolean)=>{const destination=items.find(c=>c.id===target?.dataset.checkpoint);const active=!!phantom;phantom?.remove();target?.classList.remove('history-drop');source.style.removeProperty('opacity');document.body.classList.remove('list-dragging');
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);cancelDrag.current=()=>{};
      if(active){const suppress=(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}
      if(save&&destination)apply(item,destination);
    };
    const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;if(!phantom&&Math.abs(e.clientY-start)<5)return;e.preventDefault();
      if(!phantom){phantom=createDragPhantom(source,rect);source.style.opacity='.35';document.body.classList.add('list-dragging');}
      phantom.style.top=rect.top+e.clientY-start+'px';
      target?.classList.remove('history-drop');target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-checkpoint]')??null;
      const candidate=items.find(c=>c.id===target?.dataset.checkpoint);if(!candidate||!diverged(item,candidate,items))target=null;target?.classList.add('history-drop');
    };
    const up=(e:PointerEvent)=>{if(e.pointerId===pointer)finish(true);};
    const abort=()=>finish(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
    cancelDrag.current=abort;document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  }
  const positions=historyLanes(items),width=(Math.max(0,...positions.values())+1)*12+8,index=new Map(items.map((item,i)=>[item.id,i]));
  return <section className="history-view" aria-label={ui.history.graph}>
    {!snapshot?.historyAvailable&&<p className="notice">{ui.history.unavailable}</p>}
    <div className="history-list"><div className="history-graph" style={{paddingLeft:width}}>
      <svg className="history-lines" width={width} height={items.length*92} aria-hidden="true">{items.flatMap((item,i)=>item.parents.map(parent=>{const next=index.get(parent);if(next===undefined)return null;const x=positions.get(item.id)!*12+7,y=i*92+20,px=positions.get(parent)!*12+7,py=next*92+20;return <path key={item.id+parent} d={`M${x} ${y} C${x} ${y+35} ${px} ${py-35} ${px} ${py}`}/>;}))}{items.map((item,i)=><circle key={item.id} cx={positions.get(item.id)!*12+7} cy={i*92+20} r={3} className={item.active?'active':''}/>)}</svg>
      {items.map(item=><button key={item.id} data-checkpoint={item.id} className={'checkpoint '+(item.active?'active ':'')+(selected===item.id?'selected':'')} aria-pressed={selected===item.id} data-tooltip={tooltips.history.checkpoint(item.label,item.active)} onClick={()=>setSelected(item.id)} onDoubleClick={()=>go(item)} onPointerDown={e=>drag(e,item)} onContextMenu={e=>{e.preventDefault();context(item,e.clientX,e.clientY);}} onKeyDown={e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();context(item,r.left,r.bottom);}}}>
        <strong>{item.label}</strong><time>{new Date(item.time).toLocaleString()}</time><small>{item.id.slice(0,7)}{item.active?ui.history.current:''}</small>
      </button>)}
    </div>{!items.length&&snapshot?.historyAvailable&&<p className="empty-label">{ui.history.empty}</p>}
    {items.length>=limit&&limit<5000&&<button data-tooltip={tooltips.history.loadMore} onClick={()=>{const next=Math.min(5000,limit+200);setLimit(next);void session.history(next).catch(()=>undefined);}}>{ui.history.loadMore}</button>}</div>
    {selected&&<div className="history-changes" aria-label={ui.history.changes}><strong>{ui.history.changes}</strong>{changes.map(change=><div key={change.path}><span>{change.path}</span><small>{change.added===null?ui.history.binary:`+${change.added} −${change.removed}`}</small></div>)}</div>}
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </section>;
}
