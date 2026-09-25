import {useCallback,useEffect,useState} from 'react';
import type {RegisteredWorkspace,Snapshot} from '../shared';
import type {Session} from './session';
import {Icon,Tool} from './Icons';
import {ActionMenu,type MenuState} from './Overlays';
export function WorkspaceMenu({snapshot,session,onManage}:{snapshot:Snapshot;session:Session;onManage:()=>void}){
  const [menu,setMenu]=useState<MenuState|null>(null),close=useCallback(()=>setMenu(null),[]);
  return <><button className="workspace-switcher" aria-label={'Switch workspace · '+snapshot.name} aria-haspopup="menu" aria-expanded={!!menu} data-tooltip={snapshot.root+' · switch or manage workspaces'} onClick={async e=>{
    const rect=e.currentTarget.getBoundingClientRect();
    try{const registered=await window.door.listWorkspaces();setMenu({above:true,label:'Workspace menu',x:rect.left,y:rect.top,actions:[
      ...registered.map(w=>({label:w.name,checked:w.root===snapshot.root,hint:w.root,run:()=>{if(w.root!==snapshot.root)void session.open(false,w.root).catch(()=>undefined);}})),
      {label:'Manage workspaces',icon:'database',separatorBefore:true,run:onManage},
    ]});}catch(error){session.update({error:String(error)});}
  }}><Icon name="workspace"/><span>{snapshot.name}</span></button>{menu&&<ActionMenu menu={menu} onClose={close}/>}</>;
}
export function WorkspaceManager({snapshot,session}:{snapshot:Snapshot;session:Session}){
  const [workspaces,setWorkspaces]=useState<RegisteredWorkspace[]>([]),[error,setError]=useState('');
  useEffect(()=>{let live=true;void window.door.listWorkspaces().then(rows=>{if(live)setWorkspaces(rows);}).catch(error=>{if(live)setError(String(error));});return()=>{live=false;};},[]);
  return <div className="settings-body workspace-manager">
    <div className="registered-workspaces">{workspaces.map(w=><div key={w.root} className="registered-workspace"><button data-tooltip={w.root} onClick={()=>{if(w.root!==snapshot.root)void session.open(false,w.root).catch(()=>undefined);}}><Icon name="database"/><span><strong>{w.name}</strong><small>{w.root}</small></span>{w.root===snapshot.root&&<Icon name="check"/>}</button><Tool icon="close" label={'Remove '+w.name+' from registered workspaces · keep files'} disabled={w.root===snapshot.root} onClick={()=>{void window.door.unregisterWorkspace(w.root).then(setWorkspaces).catch(error=>setError(String(error)));}}/></div>)}</div>
    {error&&<p role="alert">{error}</p>}
    <button className="primary" data-tooltip="Register and open an existing folder, or create a new workspace folder" onClick={()=>{void session.open(false).catch(()=>undefined);}}><Icon name="plus"/>Open or add workspace…</button>
    <button data-tooltip="Open another window for this workspace" onClick={()=>{void window.door.newWindow(true).catch(error=>setError(String(error)));}}><Icon name="window"/>New window for this workspace</button>
    <small>Removing a registration keeps every file on disk. Layout and appearance are stored inside each workspace.</small>
  </div>;
}
