import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Checkpoint, CheckpointChange } from '../shared';
import type { Session } from './session';
import { ActionMenu, type MenuState } from './Overlays';
import { createDragPhantom } from './sortable';
import { ui } from '../text/ui';
import { useConfirmation } from './Confirmation';
import { tooltips } from '../text/tooltips';

export function diverged(source:Checkpoint,target:Checkpoint,items:Checkpoint[]) {
  const map=new Map(items.map(item=>[item.id,item]));
  const ancestor=(a:string,b:string)=>{const seen=new Set<string>(),pending=[b];while(pending.length){const id=pending.pop()!;if(id===a)return true;if(seen.has(id))continue;seen.add(id);pending.push(...(map.get(id)?.parents??[]));}return false;};
  return source.parents.length===1&&!ancestor(source.id,target.id)&&!ancestor(target.id,source.id);
}
const ROW=92, STEP=16, INSET=10, CENTER=42;
export function historyGraph(items:Checkpoint[]) {
  const lanes:(string|undefined)[]=[],positions=new Map<string,number>(),lines:{id:string;d:string;color:number}[]=[];
  const rows=new Map(items.map((item,i)=>[item.id,i]));let widest=1;
  const occupiedUntil:number[]=[];let currentRow=0;
  const free=()=>{let lane=0;while(lanes[lane]!==undefined||(occupiedUntil[lane]??-1)>=currentRow)lane++;return lane;};
  for(const [row,item] of items.entries()){
    currentRow=row;
    let lane=lanes.indexOf(item.id);if(lane<0)lane=free();
    positions.set(item.id,lane);lanes[lane]=undefined;widest=Math.max(widest,lane+1);
    for(const [i,parent] of item.parents.entries()){
      const next=rows.get(parent);if(next!==undefined&&next<=row)continue;
      let destination=lanes.indexOf(parent);const joins=destination>=0;
      if(!joins){destination=i===0?lane:free();lanes[destination]=parent;}
      widest=Math.max(widest,destination+1);
      const x=INSET+lane*STEP,px=INSET+destination*STEP,y=row*ROW+CENTER,py=next===undefined?items.length*ROW:next*ROW+CENTER;
      // Keep each branch vertical until the parent row; the short diagonal
      // ends at the actual parent, not halfway through an unrelated checkpoint.
      if(x!==px)occupiedUntil[lane]=Math.max(occupiedUntil[lane]??-1,next??items.length);
      const bend=x===px?'':` V${py-28} L${px} ${py-10}`;
      lines.push({id:item.id+':'+parent,color:item.color??lane,d:`M${x} ${y}${bend} V${py}`});
    }
  }
  return {positions,lines,width:widest*STEP+12,height:items.length*ROW};
}
export const historyLanes=(items:Checkpoint[])=>historyGraph(items).positions;
const laneColor=(lane:number)=>`var(--history-lane-${lane%10})`;
export function HistoryPanel({session}:{session:Session}) {
  const confirm=useConfirmation();
  const {checkpoints:items,snapshot}=session.state;
  const [selected,setSelected]=useState(''),[changes,setChanges]=useState<CheckpointChange[]>([]),[menu,setMenu]=useState<MenuState|null>(null),[limit,setLimit]=useState(200);
  const cancelDrag=useRef<()=>void>(()=>{});
  useEffect(()=>()=>cancelDrag.current(),[]);
  useEffect(()=>{
    let live=true;setChanges([]);
    if(selected)void session.bridge.request<CheckpointChange[]>({kind:'checkpointChanges',id:selected}).then(rows=>{if(live)setChanges(rows);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[selected,session]);
  const go=async(item:Checkpoint)=>{if(!item.active&&await confirm({title:ui.history.restore,message:ui.history.confirmRestore(item.label),accept:ui.history.restore}))void session.restore(item.id).catch(()=>undefined);};
  const apply=async(source:Checkpoint,target:Checkpoint)=>{if(diverged(source,target,items)&&await confirm({title:ui.history.apply,message:ui.history.confirmApply(source.label,target.label),accept:ui.history.apply}))void session.restore(target.id,source.id).catch(()=>undefined);};
  function context(item:Checkpoint,x:number,y:number){
    setSelected(item.id);const current=items.find(c=>c.active);
    setMenu({x,y,label:ui.history.selected,actions:[{label:ui.history.restore,icon:'branch',disabled:item.active,run:()=>go(item)},
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
  const graph=useMemo(()=>historyGraph(items),[items]);
  return <section className="history-view" aria-label={ui.history.graph}>
    {!snapshot?.historyAvailable&&<p className="notice">{ui.history.unavailable}</p>}
    <div className="history-list"><div className="history-graph" style={{paddingLeft:graph.width}}>
      <svg className="history-lines" width={graph.width} height={graph.height} aria-hidden="true">
        {graph.lines.map(line=><path key={line.id} d={line.d} style={{stroke:laneColor(line.color)}}/>)}
        {items.map((item,i)=>{const lane=graph.positions.get(item.id)!,x=INSET+lane*STEP,y=i*ROW+CENTER;return <g key={item.id}>
          {item.active&&<circle cx={x} cy={y} r={7} className="current-ring" style={{stroke:laneColor(item.color??lane)}}/>}
          <circle cx={x} cy={y} r={4} style={{fill:laneColor(item.color??lane)}}/>
        </g>;})}
      </svg>
      {items.map(item=><button key={item.id} data-checkpoint={item.id} className={'checkpoint '+(item.active?'active ':'')+(selected===item.id?'selected':'')} aria-pressed={selected===item.id} data-tooltip={tooltips.history.checkpoint(item.label,item.active)} onClick={()=>setSelected(item.id)} onDoubleClick={()=>go(item)} onPointerDown={e=>drag(e,item)} onContextMenu={e=>{e.preventDefault();context(item,e.clientX,e.clientY);}} onKeyDown={e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();context(item,r.left,r.bottom);}}}>
        <strong>{item.label}</strong><time>{new Date(item.time).toLocaleString()}</time><small>{item.id.slice(0,7)}{item.active?ui.history.current:''}</small>
      </button>)}
    </div>{!items.length&&snapshot?.historyAvailable&&<p className="empty-label">{ui.history.empty}</p>}
    {items.length>=limit&&limit<5000&&<button data-tooltip={tooltips.history.loadMore} onClick={()=>{const next=Math.min(5000,limit+200);setLimit(next);void session.history(next).catch(()=>undefined);}}>{ui.history.loadMore}</button>}</div>
    {selected&&<div className="history-changes" aria-label={ui.history.changes}><strong>{ui.history.changes}</strong>{changes.map(change=><div key={change.path}><span>{change.path}</span><small>{change.added===null?ui.history.binary:<><span className="change-added">+{change.added}</span>{' '}<span className="change-removed">−{change.removed}</span></>}</small></div>)}</div>}
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </section>;
}
