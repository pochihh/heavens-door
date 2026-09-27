import type { NavigationMode } from '../layout';
import { useCallback, useState } from 'react';
import type { Snapshot } from '../shared';
import { documentInfo, parent, portable } from './documents';
import { DocumentIcon } from './Icons';
import { InlineName } from './InlineName';
import { ActionMenu, type MenuState } from './Overlays';

export function Breadcrumbs({documentKey,snapshot,onNavigate,onRename,onIcon}:{documentKey:string;snapshot:Snapshot;onNavigate:(key:string,mode?:NavigationMode)=>void;onRename:(key:string,name:string)=>Promise<void>;onIcon:()=>void}) {
  const info=documentInfo(documentKey,snapshot),folder=info.kind==='board'?parent(info.id):parent(info.path);
  const [menu,setMenu]=useState<MenuState|null>(null),dismiss=useCallback(()=>setMenu(null),[]);
  const ancestors: {name:string;key?:string;path:string}[]=[];
  if(info.kind!=='board'||info.id){
    ancestors.push({name:snapshot.name,key:'board:',path:snapshot.root});
    let path='';for(const part of portable(folder).split('/').filter(Boolean)){path=path?path+'/'+part:part;ancestors.push({name:part,path,key:snapshot.boards.some(b=>portable(b.folder)===path)?'board:'+path:undefined});}
  }
  function context(key:string,anchor:HTMLElement,x:number,y:number){setMenu({label:'Breadcrumb actions',anchor,x,y,actions:[{label:'Open in new tab',icon:'external',run:()=>onNavigate(key,'new')},{label:'Open in another Tab Group',icon:'splitRight',run:()=>onNavigate(key,'other')}]});}
  const editable=info.exists&&(info.kind==='card'||info.kind==='board'&&!!info.id);
  return <nav className="document-breadcrumb" aria-label="File location">
    {ancestors.map(item=><span className="breadcrumb-part" key={item.path}>{item.key?<button data-tooltip={item.path} onClick={()=>onNavigate(item.key!)} onContextMenu={e=>{e.preventDefault();context(item.key!,e.currentTarget,e.clientX,e.clientY);}} onKeyDown={e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();context(item.key!,e.currentTarget,r.left,r.bottom);}}}>{item.name}</button>:<span data-tooltip={item.path}>{item.name}</span>}<span className="breadcrumb-divider" aria-hidden="true">/</span></span>)}
    <span className="breadcrumb-current" aria-current="page">
      <button className="document-icon-button" aria-label="Change this file’s icon" data-tooltip="Change this file’s icon" onClick={onIcon}><DocumentIcon value={snapshot.preferences?.icons[documentKey]} fallback={info.icon}/></button>
      {editable?<InlineName name={info.kind==='card'?info.title.replace(/\.md$/,''):info.title} suffix={info.kind==='card'?'.md':''} tooltip={info.path} onRename={name=>onRename(documentKey,name)}/>:<span data-tooltip={info.path||snapshot.root}>{info.title}</span>}
    </span>
    {menu&&<ActionMenu menu={menu} onClose={dismiss}/>}
  </nav>;
}
