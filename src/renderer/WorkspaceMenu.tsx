import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import {useCallback,useEffect,useState,useRef} from 'react';
import type {RegisteredWorkspace,Snapshot} from '../shared';
import type {Session} from './session';
import {useBookmarkDrag} from './sortable';
import {Icon,Tool} from './Icons';
import {ActionMenu,type MenuState} from './Overlays';
export function WorkspaceMenu({snapshot,session,onManage}:{snapshot:Snapshot;session:Session;onManage:()=>void}){
  const [menu,setMenu]=useState<MenuState|null>(null),close=useCallback(()=>setMenu(null),[]);
  return <><button className="workspace-switcher" aria-label={ui.workspace.switchWorkspace(snapshot.name)} aria-haspopup="menu" aria-expanded={!!menu} data-tooltip={tooltips.workspace.switchWorkspace(snapshot.root)} onClick={async e=>{
    if(menu){setMenu(null);return;}
    const anchor=e.currentTarget,rect=anchor.getBoundingClientRect();
    try{const registered=await window.door.listWorkspaces();setMenu({anchor,label:ui.workspace.workspaceMenu,x:rect.left,y:rect.bottom,actions:[
      ...registered.filter(w=>w.status==='available').map(w=>({label:w.name,checked:w.root===snapshot.root,icon:w.root===snapshot.root?'check' as const:undefined,hint:w.root,run:()=>{if(w.root!==snapshot.root)void session.open(false,w.root).catch(()=>undefined);}})),
      {label:ui.workspace.manage,icon:'database',separatorBefore:true,run:onManage},
    ]});}catch(error){session.update({error:String(error)});}
  }}><Icon name="workspace"/><span>{snapshot.name}</span></button>{menu&&<ActionMenu menu={menu} onClose={close}/>}</>;
}
export function WorkspaceManager({snapshot,session}:{snapshot:Snapshot|null;session:Session}){
  const [workspaces,setWorkspaces]=useState<RegisteredWorkspace[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  const list=useRef<HTMLDivElement>(null),[editing,setEditing]=useState<string|null>(null),[name,setName]=useState('');
  const reorder=(root:string,index:number|null)=>{
    if(index===null)return;const roots=workspaces.map(w=>w.root),from=roots.indexOf(root);if(from<0||from===index)return;
    roots.splice(from,1);roots.splice(index,0,root);void window.door.reorderWorkspaces(roots).then(setWorkspaces).catch(error=>setError(String(error)));
  };
  const drag=useBookmarkDrag(list,reorder,'vertical',true);
  const rename=(root:string)=>{setEditing(null);if(name.trim()&&name.trim()!==workspaces.find(w=>w.root===root)?.name)void window.door.renameWorkspace(root,name.trim()).then(setWorkspaces).catch(error=>setError(String(error)));};
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    void window.door.listWorkspaces(true).then(rows=>{if(live)setWorkspaces(rows);}).catch(error=>{if(live)setError(String(error));}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[refresh]);
  return <div className="settings-body workspace-manager">
    <div className="workspace-manager-toolbar"><span role="status">{loading?ui.workspace.loading:''}</span><Tool icon="sync" label={tooltips.workspace.refreshWorkspaces} disabled={loading} onClick={()=>setRefresh(value=>value+1)}/></div>
    <div ref={list} className="registered-workspaces">{workspaces.map((w,i)=><div key={w.root} data-file-key={w.root} data-status={w.status} className="registered-workspace">
      <div className="registered-workspace-info" tabIndex={0} role="group" aria-label={w.name} data-tooltip={w.root} onPointerDown={e=>{if(!(e.target as HTMLElement).closest('button,input'))drag(e,w.root,true);}} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();reorder(w.root,Math.max(0,Math.min(workspaces.length-1,i+(e.key==='ArrowUp'?-1:1))));}}}>
        <div className="workspace-row-check" aria-hidden="true">{w.root===snapshot?.root&&<Icon name="check"/>}</div><div className="workspace-row-grip" aria-hidden="true"><Icon name="grip"/></div><span>{editing===w.root?<input autoFocus aria-label={ui.workspace.name} value={name} onFocus={e=>e.currentTarget.select()} onChange={e=>setName(e.target.value)} onBlur={()=>rename(w.root)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')rename(w.root);if(e.key==='Escape')setEditing(null);}}/>:<button className="workspace-name" data-tooltip={ui.workspace.rename} onClick={e=>{e.stopPropagation();setName(w.name);setEditing(w.root);}}>{w.name}</button>}<small>{w.root}</small>{w.status!=='available'&&<small className="workspace-availability">{ui.workspace.status[w.status]}</small>}
          <small data-tooltip={tooltips.workspace.workspaceUpdated}>{ui.workspace.lastUpdated}: {w.lastUpdated===null?ui.workspace.unknownUpdate:<time dateTime={new Date(w.lastUpdated).toISOString()}>{new Date(w.lastUpdated).toLocaleString()}</time>}</small>
        </span>
      </div>
      <Tool icon="external" label={ui.workspace.open} disabled={w.status!=='available'||w.root===snapshot?.root} onClick={()=>{void session.open(false,w.root).catch(error=>setError(String(error)));}}/>
      <Tool icon="folder" label={ui.workspace.relink} onClick={()=>{void session.run(async()=>{await session.flush();return window.door.relinkWorkspace(w.root);}).then(async rows=>{setWorkspaces(rows);await session.resume();}).catch(error=>setError(String(error)));}}/>
      <Tool icon="close" className="danger" label={tooltips.workspace.unregister(w.name)} disabled={w.root===snapshot?.root} onClick={()=>{void window.door.unregisterWorkspace(w.root).then(setWorkspaces).catch(error=>setError(String(error)));}}/>
    </div>)}</div>
    {error&&<p role="alert">{error}</p>}
    <button className="primary" data-tooltip={tooltips.workspace.addWorkspace} onClick={()=>{void session.open(false).catch(error=>setError(String(error)));}}><Icon name="plus"/>{ui.workspace.openOrAddWorkspace}</button>
    {snapshot&&<button data-tooltip={tooltips.workspace.newWindow} onClick={()=>{void window.door.newWindow(true).catch(error=>setError(String(error)));}}><Icon name="window"/>{ui.workspace.newWindow}</button>}
    <small>{ui.workspace.registrationHelp}</small>
  </div>;
}
