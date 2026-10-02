import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import {useCallback,useEffect,useState} from 'react';
import type {RegisteredWorkspace,Snapshot} from '../shared';
import type {Session} from './session';
import {Icon,Tool} from './Icons';
import {ActionMenu,type MenuState} from './Overlays';
export function WorkspaceMenu({snapshot,session,onManage}:{snapshot:Snapshot;session:Session;onManage:()=>void}){
  const [menu,setMenu]=useState<MenuState|null>(null),close=useCallback(()=>setMenu(null),[]);
  return <><button className="workspace-switcher" aria-label={ui.workspace.switchWorkspace(snapshot.name)} aria-haspopup="menu" aria-expanded={!!menu} data-tooltip={tooltips.workspace.switchWorkspace(snapshot.root)} onClick={async e=>{
    const rect=e.currentTarget.getBoundingClientRect();
    try{const registered=await window.door.listWorkspaces();setMenu({above:true,label:ui.workspace.workspaceMenu,x:rect.left,y:rect.top,actions:[
      ...registered.map(w=>({label:w.status==='available'?w.name:w.name+' · '+ui.workspace.status[w.status],disabled:w.status!=='available',checked:w.root===snapshot.root,hint:w.root,run:()=>{if(w.root!==snapshot.root)void session.open(false,w.root).catch(()=>undefined);}})),
      {label:ui.workspace.manage,icon:'database',separatorBefore:true,run:onManage},
    ]});}catch(error){session.update({error:String(error)});}
  }}><Icon name="workspace"/><span>{snapshot.name}</span></button>{menu&&<ActionMenu menu={menu} onClose={close}/>}</>;
}
export function WorkspaceManager({snapshot,session}:{snapshot:Snapshot|null;session:Session}){
  const [workspaces,setWorkspaces]=useState<RegisteredWorkspace[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    void window.door.listWorkspaces(true).then(rows=>{if(live)setWorkspaces(rows);}).catch(error=>{if(live)setError(String(error));}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[refresh]);
  return <div className="settings-body workspace-manager">
    <div className="workspace-manager-toolbar"><span role="status">{loading?ui.workspace.loading:''}</span><Tool icon="sync" label={tooltips.workspace.refreshWorkspaces} disabled={loading} onClick={()=>setRefresh(value=>value+1)}/></div>
    <div className="registered-workspaces">{workspaces.map(w=><div key={w.root} className="registered-workspace">
      <button data-tooltip={w.root} disabled={w.status!=='available'} onClick={()=>{if(w.root!==snapshot?.root)void session.open(false,w.root).catch(error=>setError(String(error)));}}>
        <Icon name="database"/><span><strong>{w.name}</strong><small>{w.root}</small><small className="workspace-availability">{ui.workspace.status[w.status]}</small>
          <small data-tooltip={tooltips.workspace.workspaceUpdated}>{ui.workspace.lastUpdated}: {w.lastUpdated===null?ui.workspace.unknownUpdate:<time dateTime={new Date(w.lastUpdated).toISOString()}>{new Date(w.lastUpdated).toLocaleString()}</time>}</small>
        </span>{w.root===snapshot?.root&&<Icon name="check"/>}
      </button>
      <Tool icon="close" className="danger" label={tooltips.workspace.unregister(w.name)} disabled={w.root===snapshot?.root} onClick={()=>{void window.door.unregisterWorkspace(w.root).then(setWorkspaces).catch(error=>setError(String(error)));}}/>
    </div>)}</div>
    {error&&<p role="alert">{error}</p>}
    <button className="primary" data-tooltip={tooltips.workspace.addWorkspace} onClick={()=>{void session.open(false).catch(error=>setError(String(error)));}}><Icon name="plus"/>{ui.workspace.openOrAddWorkspace}</button>
    {snapshot&&<button data-tooltip={tooltips.workspace.newWindow} onClick={()=>{void window.door.newWindow(true).catch(error=>setError(String(error)));}}><Icon name="window"/>{ui.workspace.newWindow}</button>}
    <small>{ui.workspace.registrationHelp}</small>
  </div>;
}
