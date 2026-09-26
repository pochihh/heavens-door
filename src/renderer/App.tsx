import { useCallback, useEffect, lazy, Suspense, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Session } from './session';
import type { Mutation, Preferences, Snapshot } from '../shared';
import { DocumentIcon, Icon, Tool } from './Icons';
import { Explorer } from './Explorer';
import { SideDock, modules, MODULE_IDS } from './Docks';
import { WorkspaceMenu,WorkspaceManager } from './WorkspaceMenu';
import {defaultDocks,findModule,revealModule,moveModule,activeAfterRemoval,type ModuleId,type Docks,type DocumentsLayout} from '../layout';
import { ActionMenu,TooltipHost,type MenuState } from './Overlays';
import {useTabDrag} from './tab-drag';
import { documentInfo, parent } from './documents';
const IconPicker=lazy(()=>import('./IconPicker'));
export { documentInfo } from './documents';
import { BoardView, FileView, HistoryPanel, NoteView, TagView, type ViewMemory } from './DocumentViews';
import { MAX_PANES, MAX_TABS, closeTab, moveTab, openTab, pane, panes, removePane, resizeSplit, restoreLayout, splitPane, type Layout, type Pane } from '../layout';

export const session=new Session(window.door);
const attempt=(promise:Promise<unknown>)=>{void promise.catch(()=>undefined);};
const defaults:Preferences={theme:'system',stem:'untitled',starred:[],recent:[],icons:{}};
export function App() {
  const state=useSyncExternalStore(session.subscribe,session.getState);
  useEffect(()=>{
    const remove=window.door.onChange(()=>{if(session.state.snapshot)attempt(session.refresh());});
    const keyboard=(event:KeyboardEvent)=>{
      if(!(event.metaKey||event.ctrlKey)||event.isComposing)return;
      if(event.key.toLowerCase()==='s'){event.preventDefault();attempt(session.checkpoint());}
      if(event.key.toLowerCase()==='z'&&!(event.target instanceof HTMLInputElement&&event.target.type!=='checkbox')){event.preventDefault();attempt(session.undo(event.shiftKey));}
    };
    window.addEventListener('keydown',keyboard,true);
    return()=>{remove();window.removeEventListener('keydown',keyboard,true);};
  },[]);
  return <><TooltipHost/>{state.snapshot?<WorkspaceShell key={state.snapshot.root} snapshot={state.snapshot}/>:
    <div className={'app welcome-shell platform-'+window.door.platform}><div className="welcome-drag"/><div className="welcome">
      <button className="primary" data-tooltip="Open an existing notes folder or create a workspace" onClick={()=>attempt(session.open(false))}>Open workspace</button>
      <button data-tooltip="Create a temporary workspace with example cards" onClick={()=>attempt(session.open(true))}>Try a sample workspace</button>
      {state.error&&<p role="alert">{state.error}</p>}
    </div></div>}</>;
}
function Divider({axis='row',value,onChange,label}:{axis?:'row'|'column';value:number;onChange:(value:number)=>void;label:string}) {
  const drag=useRef<{coordinate:number;value:number}|null>(null);
  return <div className={'divider '+axis} role="separator" aria-label={label} aria-orientation={axis==='row'?'vertical':'horizontal'} aria-valuemin={180} aria-valuemax={520} aria-valuenow={Math.round(Math.abs(value))} aria-valuetext={Math.round(Math.abs(value))+' pixels'} tabIndex={0}
    onPointerDown={e=>{e.preventDefault();drag.current={coordinate:axis==='row'?e.clientX:e.clientY,value};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)onChange(drag.current.value+(axis==='row'?e.clientX:e.clientY)-drag.current.coordinate);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();onChange(value+(['ArrowLeft','ArrowUp'].includes(e.key)?-20:20));}}}/>;
}
function WorkspaceShell({snapshot}:{snapshot:Snapshot}) {
  const state=session.state,prefs=snapshot.preferences??defaults;
  const [layout,setLayout]=useState(()=>prefs.documents?.tree??restoreLayout(null));
  const [activeId,setActiveId]=useState(()=>prefs.documents?.active??panes(layout)[0].id);
  const [docks,setDocks]=useState<Docks>(()=>prefs.docks??defaultDocks());
  const left=!docks.left.collapsed&&!!docks.left.groups.length,right=!docks.right.collapsed&&!!docks.right.groups.length;
  const [formatting,setFormatting]=useState(new Set(prefs.documents?.formatting??[]));
  const [modal,setModal]=useState<'settings'|'folder'|'icon'|'migration'|'workspaces'|null>(null);
  const [folderParent,setFolderParent]=useState(''),[folderName,setFolderName]=useState('');
  const [iconKey,setIconKey]=useState(''),[customIcon,setCustomIcon]=useState('');
  const [pulse,setPulse]=useState(0),[tabMenu,setTabMenu]=useState<MenuState|null>(null);
  const dismissTabMenu=useCallback(()=>setTabMenu(null),[]);
  const memories=useRef(new Map<string,ViewMemory>(Object.entries(prefs.documents?.views??{}))),starredTarget=useRef<HTMLDivElement>(null);
  const active=panes(layout).find(p=>p.id===activeId)??panes(layout)[0];
  const rootCards=snapshot.cards.filter(c=>!parent(c.path));
  useEffect(()=>{
    if(!modal)return;
    const dialog=document.querySelector<HTMLElement>('[role=dialog]')!,previous=document.activeElement;
    (dialog.querySelector<HTMLElement>('[autofocus]')??dialog.querySelector<HTMLElement>('input,button'))?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setModal(null);}
      if(event.key==='Tab'){
        const controls=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')],first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    dialog.addEventListener('keydown',key);return()=>{dialog.removeEventListener('keydown',key);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[modal]);
  const documentState=useRef<()=>DocumentsLayout>(()=>({tree:layout,active:active.id,views:{},formatting:[]}));
  documentState.current=()=>{
    const keys=new Set(panes(layout).flatMap(p=>p.tabs.map(key=>p.id+':'+key)));
    return {tree:layout,active:active.id,views:Object.fromEntries([...memories.current].filter(([key])=>keys.has(key))),formatting:[...formatting].filter(id=>panes(layout).some(p=>p.id===id))};
  };
  const rememberViews=useCallback(()=>session.schedulePreferences({documents:documentState.current()},snapshot.root),[snapshot.root]);
  useEffect(()=>{rememberViews();},[layout,activeId,formatting,rememberViews]);
  const incomingDocks=JSON.stringify(prefs.docks),knownDocks=useRef(incomingDocks);
  useEffect(()=>{if(incomingDocks!==knownDocks.current){knownDocks.current=incomingDocks;if(prefs.docks&&!session.hasPendingPreferences('docks'))setDocks(prefs.docks);}},[incomingDocks,prefs.docks]);
  useEffect(()=>{if(!prefs.docks)session.schedulePreferences({docks},snapshot.root);},[]);
  function changeDocks(next:Docks){setDocks(next);session.schedulePreferences({docks:next},snapshot.root);}
  const tabs=useTabDrag((source,target)=>{
    if(source.family==='side'){
      if(!target.side||!MODULE_IDS.includes(source.key as ModuleId)||docks.closed?.[source.key as ModuleId])return;
      const placed=findModule(docks,source.key as ModuleId);if(placed.group.id!==source.group)return;
      const next=moveModule(docks,{module:source.key as ModuleId},{side:target.side,group:target.group||undefined,position:target.position,beforeTab:target.before as ModuleId|undefined});if(next!==docks)changeDocks(next);
    }else{
      const destination=panes(layout).find(p=>p.id===target.group);
      if(!destination||!destination.tabs.includes(source.key)&&destination.tabs.length>=MAX_TABS)return;
      attempt((async()=>{
        const info=documentInfo(source.key,snapshot);await session.select(info.kind==='card'?info.path:null);
        const memory=memories.current.get(source.group+':'+source.key);
        if(memory&&!destination.tabs.includes(source.key))memories.current.set(target.group+':'+source.key,{...memory});
        setLayout(current=>moveTab(current,source.group,target.group,source.key,target.before));setActiveId(target.group);
      })());
    }
  });
  const shownModules=[...(left?docks.left.groups:[]),...(right?docks.right.groups:[])].map(g=>tabs.drag?.family==='side'&&tabs.drag.group===g.id?activeAfterRemoval(g.tabs,g.active,tabs.drag.key):g.active);
  const historyVisible=shownModules.includes('history');

  useEffect(()=>{
    const query=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=prefs.theme==='system'?(query.matches?'dark':'light'):prefs.theme;};
    apply();query.addEventListener('change',apply);return()=>query.removeEventListener('change',apply);
  },[prefs.theme]);
  useEffect(()=>{
    if(historyVisible)attempt(session.history());
  },[historyVisible]);
  const changePrefs=useCallback((change:(p:Preferences)=>Partial<Preferences>)=>{
    attempt(session.run(async()=>{
      await session.flushPreferences();
      const patch=change(session.state.snapshot?.preferences??defaults);if(!Object.keys(patch).length)return;
      const result=await window.door.request<Snapshot>({kind:'preferences',patch});
      session.update({snapshot:result});
    }));
  },[]);
  const open=useCallback((key:string,id=activeId)=>{
    attempt((async()=>{
      const target=panes(layout).find(p=>p.id===id);
      if(target&&!target.tabs.includes(key)&&target.tabs.length>=MAX_TABS){session.update({error:'Close a document tab before opening more in this pane.'});return;}
      const info=documentInfo(key,session.state.snapshot!);
      if(!info.exists){session.update({error:'This file is no longer in the workspace.'});return;}
      await session.select(info.kind==='card'?info.path:null);
      setLayout(current=>openTab(current,id,key));setActiveId(id);setPulse(v=>v+1);
      changePrefs(p=>({recent:[key,...p.recent.filter(k=>k!==key)].slice(0,30)}));
    })());
  },[activeId,changePrefs,layout]);
  function focusPane(p:Pane){
    setActiveId(p.id);
    const current=p.active?documentInfo(p.active,snapshot):null;
    if(current?.kind==='card'){if(state.draft?.card.path!==current.path)attempt(session.select(current.path));}
    else if(p.id!==activeId)attempt(session.select(null));
  }
  function close(p:Pane,key:string){
    attempt((async()=>{await session.select(null);const next=closeTab(layout,p.id,key);setLayout(next);setActiveId(p.id);
      const selected=panes(next).find(item=>item.id===p.id)?.active;if(selected){const info=documentInfo(selected,snapshot);if(info.kind==='card')await session.select(info.path);}
    })());
  }
  function split(p:Pane,axis:'row'|'column'){
    if(panes(layout).length>=MAX_PANES)return;
    document.querySelectorAll('details.pane-menu[open]').forEach(el=>el.removeAttribute('open'));
    const next=pane(p.active);setLayout(current=>splitPane(current,p.id,axis,next));setActiveId(next.id);
  }
  function createFolder(folder:string){setFolderParent(folder);setFolderName('');setModal('folder');}
  async function submitFolder(){
    await session.run(async()=>{
      await session.flush();
      const result=await window.door.request<Mutation>({kind:'createFolder',parent:folderParent,name:folderName});
      session.undoHistory.record('Create whiteboard',result.edits);session.update({snapshot:result.snapshot,error:''});
    });
    const path=folderParent?folderParent+'/'+folderName:folderName;
    setModal(null);open('board:'+path);
  }
  function createCard(folder:string,x?:number,y?:number,paneId=activeId){
    if(!folder){createFolder('');return;}
    attempt((async()=>{await session.create(folder,prefs.stem,x??80,y??80,x!==undefined&&y!==undefined);const card=session.state.draft?.card;
      if(card){const p=panes(layout).find(p=>p.id===paneId);if(x===undefined||y===undefined||p?.active!=='board:'+folder)open('card:'+card.id,paneId);}
    })());
  }
  function star(key:string){changePrefs(p=>({starred:p.starred.includes(key)?p.starred.filter(k=>k!==key):[...p.starred,key]}));}
  function docIcon(key:string){const info=documentInfo(key,snapshot);return <DocumentIcon value={prefs.icons[key]} fallback={info.icon}/>;}
  function editIcon(key:string){setIconKey(key);setCustomIcon(prefs.icons[key]??'');setModal('icon');}
  function openBeside(key:string){
    if(panes(layout).length>=MAX_PANES){session.update({error:'Close a document pane before creating another split.'});return;}
    attempt((async()=>{await session.flush();const next=pane(key);setLayout(current=>splitPane(current,activeId,'row',next));setActiveId(next.id);open(key,next.id);})());
  }
  function renderPane(original:Pane):ReactNode {
    const p=tabs.drag?.family==='main'&&tabs.drag.group===original.id?{...original,active:activeAfterRemoval(original.tabs,original.active,tabs.drag.key)}:original;
    const showTabMenu=(key:string,x:number,y:number)=>setTabMenu({label:'View tab actions',x,y,actions:[{label:'Close View Tab',icon:'close',run:()=>close(p,key)}]});
    const info=p.active?documentInfo(p.active,snapshot):null;
    const focused=p.id===active.id;
    const memoryKey=p.id+':'+p.active;
    let memory=memories.current.get(memoryKey);if(!memory){memory={};memories.current.set(memoryKey,memory);}
    const board=info?.kind==='board'?snapshot.boards.find(b=>b.folder===info.id):undefined;
    const tag=info?.kind==='tag'?snapshot.tags?.find(t=>t.path===info.id):undefined;
    return <section className={'note-pane '+(focused?'active-pane':'')} data-pane={p.id} data-active={focused} aria-label="Main Dock Tab Group" onPointerDownCapture={e=>{if(!focused&&!(e.target as HTMLElement).closest('[data-tab-strip]'))focusPane(p);}}>
      <div className="tab-strip">
        <div className="tab-list" role="tablist" aria-label="Open files" data-tab-strip data-tab-family="main" data-tab-group={p.id}>
          {p.tabs.map(key=>{const info=documentInfo(key,snapshot);return <div className={'tab '+(p.active===key?'active-tab':'')} key={key} data-tab-key={key} onContextMenu={e=>{e.preventDefault();showTabMenu(key,e.clientX,e.clientY);}} onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();showTabMenu(key,r.left,r.bottom);}}}>
            <button role="tab" onPointerDown={e=>tabs.begin(e,{family:'main',group:p.id,key})} aria-selected={p.active===key} data-tooltip={info.path||info.title} onClick={()=>open(key,p.id)}>{docIcon(key)}<span>{info.title}</span></button>
            <Tool icon="close" label={'Close '+info.title} onClick={()=>close(p,key)}/>
          </div>;})}
        </div>
        <details className="menu pane-menu"><summary data-tooltip="Pane actions" aria-label="Pane actions"><Icon name="down" size={12}/></summary><div className="menu-content">
          <button data-tooltip="Open the current file beside this pane" disabled={panes(layout).length>=MAX_PANES} onClick={()=>split(p,'row')}><Icon name="splitRight"/>Split right</button>
          <button data-tooltip="Open the current file below this pane" disabled={panes(layout).length>=MAX_PANES} onClick={()=>split(p,'column')}><Icon name="splitDown"/>Split down</button>
          <button data-tooltip="Close this pane; keep files on disk" disabled={panes(layout).length===1} onClick={()=>attempt((async()=>{await session.select(null);const next=removePane(layout,p.id);if(next){setLayout(next);setActiveId(panes(next)[0].id);}})())}><Icon name="close"/>Close pane</button>
        </div></details>
      </div>
      {info&&<div className="document-toolbar">
        <button className="document-icon-button" aria-label="Change this file’s icon" data-tooltip="Change this file’s icon" onClick={()=>editIcon(p.active)}>{docIcon(p.active)}</button>
        <span className="document-breadcrumb" data-tooltip={info.path||snapshot.root}>{info.path||snapshot.name}</span>
        <div className="toolbar-spacer"/>
        {info.kind==='board'&&<><Tool icon="folder" label="Create sub-whiteboard" onClick={()=>createFolder(info.id)}/>{!!info.id&&<Tool icon="plus" label="Create card in this whiteboard" onClick={()=>createCard(info.id,80,80,p.id)}/>}</>}
        {info.kind==='card'&&<Tool icon="format" label="Show or hide formatting controls" aria-pressed={formatting.has(p.id)} className={formatting.has(p.id)?'selected':''} onClick={()=>setFormatting(current=>{const next=new Set(current);if(next.has(p.id))next.delete(p.id);else next.add(p.id);return next;})}/>}
        <Tool icon="star" className={prefs.starred.includes(p.active)?'is-starred':''} label={prefs.starred.includes(p.active)?'Remove from starred':'Add to starred'} onClick={()=>star(p.active)}/>

      </div>}
      <div className="document-content">
        {!info?(tabs.drag?.family==='main'&&tabs.drag.group===p.id?<div className="empty-pane" aria-label="Empty Tab Group"/>:<div className="empty-pane"><button data-tooltip="Open the mother whiteboard" onClick={()=>open('board:',p.id)}><Icon name="map"/>Open whiteboard</button></div>):
          !info.exists?<p className="notice">This file is no longer in the workspace.</p>:
          board?<BoardView key={p.active} board={board} snapshot={snapshot} session={session} active={focused} memory={memory} onActivate={()=>setActiveId(p.id)} onOpen={key=>open(key,p.id)} onCreate={(x,y)=>createCard(info.id,x,y,p.id)} onMigrate={()=>setModal('migration')} onViewChange={rememberViews}/>:
          tag?<TagView key={p.active} tag={tag} snapshot={snapshot} session={session} onOpen={key=>open(key,p.id)} memory={memory} onViewChange={rememberViews}/>:
          info.kind==='file'?<FileView key={p.active} path={info.path} snapshot={snapshot} memory={memory} onViewChange={rememberViews}/>:<NoteView key={p.active} formatting={formatting.has(p.id)} path={info.path} session={session} snapshot={snapshot} active={focused} memory={memory} onActivate={()=>{setActiveId(p.id);attempt(session.select(info.path));}} onOpen={key=>open(key,p.id)} onViewChange={rememberViews}/>}
      </div>
      {focused&&<div className="pane-focus-flash" key={pulse}/>}
    </section>;
  }
  function renderLayout(node:Layout,top=true,first=true,last=true):ReactNode {
    if(node.type==='pane')return <div className={"pane-container "+(top?"top-pane "+(first?"first-top ":"")+(last?"last-top":""):"")} key={node.id}>{renderPane(node)}</div>;
    return <div key={node.id} className={'split '+node.axis}>
      <div className="split-child" style={{flex:node.ratio}}>{renderLayout(node.first,top,first,last&&node.axis==='column')}</div>
      <SplitDivider node={node} onResize={ratio=>setLayout(current=>resizeSplit(current,node.id,ratio))}/>
      <div className="split-child" style={{flex:1-node.ratio}}>{renderLayout(node.second,top&&node.axis==='row',first&&node.axis==='column',last)}</div>
    </div>;
  }
  function renderModule(module:typeof MODULE_IDS[number]):ReactNode {
    if(module==='history')return <><div className="module-toolbar"><div className="toolbar-spacer"/><Tool icon="plus" label="Save workspace checkpoint · ⌘S / Ctrl+S" disabled={!snapshot.historyAvailable} onClick={()=>attempt(session.checkpoint())}/></div><HistoryPanel session={session}/></>;
    if(module==='agent')return <div className="agent-empty">Agent integration is not connected yet.</div>;
    return <Explorer key={module} module={module} starredTarget={starredTarget} snapshot={snapshot} prefs={prefs} activeKey={active.active} session={session} onOpen={open} onSplit={openBeside} onFolder={createFolder} onCard={createCard} onIcon={editIcon} onPrefs={changePrefs}/>;
  }
  return <div className={'app platform-'+window.door.platform+(tabs.drag?' docking':'')} inert={state.status==='Opening workspace…'} style={{'--sidebar-width':docks.left.width+'px','--dock-width':docks.right.width+'px'} as CSSProperties}>
    <header className="window-toolbar">
      <div className="traffic-light-space"/>
      <Tool icon="left" label={left?'Collapse left dock':'Expand left dock'} aria-expanded={left} onClick={()=>changeDocks({...docks,left:{...docks.left,collapsed:left}})}/>
      <div className="window-drag-space"/>
      <Tool icon="search" label="Search workspace cards" onClick={()=>changeDocks(revealModule(docks,'search'))}/>
      <Tool icon="right" label={right?'Collapse right dock':'Expand right dock'} aria-expanded={right} onClick={()=>changeDocks({...docks,right:{...docks.right,collapsed:right}})}/>
      <div className="windows-controls-space"/>
    </header>
    <div className={"workspace-body "+(!left?"no-sidebar":"")}>
      <nav className="activity-bar" aria-label="Activity bar">
        {MODULE_IDS.map(module=>{const placed=docks.closed?.[module]?null:findModule(docks,module),selected=!!placed&&!docks[placed.side].collapsed&&placed.group.active===module;return <Tool key={module} icon={modules[module].icon} label={modules[module].title} aria-pressed={selected} className={selected?'selected':''} onClick={()=>changeDocks(revealModule(docks,module))}/>;})}
        <div className="toolbar-spacer"/><Tool icon="settings" label="Workspace settings" onClick={()=>setModal('settings')}/>
      </nav>
      <SideDock side="left" docks={docks} drag={tabs.drag} onTabDrag={tabs.begin} onChange={changeDocks} onPreview={setDocks} renderModule={renderModule}/>
      {left&&<Divider value={docks.left.width} label="Resize left dock" onChange={value=>changeDocks({...docks,left:{...docks.left,width:Math.max(180,Math.min(520,value))}})}/>}
      <main className="workspace" aria-label="Document area">{renderLayout(layout)}</main>
      {right&&<Divider value={-docks.right.width} label="Resize right dock" onChange={value=>changeDocks({...docks,right:{...docks.right,width:Math.max(180,Math.min(520,-value))}})}/>}
      <SideDock side="right" docks={docks} drag={tabs.drag} onTabDrag={tabs.begin} onChange={changeDocks} onPreview={setDocks} renderModule={renderModule}/>
    </div>
    <footer className="statusbar">
      <WorkspaceMenu snapshot={snapshot} session={session} onManage={()=>setModal('workspaces')}/>
      <div className="toolbar-spacer"/>
      <span data-tooltip="Remote sync is not configured"><Icon name="sync" size={13}/>Sync off</span>
      <span role="status" data-tooltip={state.error||state.status}>{state.status==='Saved locally'?'Saved':state.status}</span>
    </footer>
    {tabMenu&&<ActionMenu menu={tabMenu} onClose={dismissTabMenu}/>}
    {(state.error||snapshot.issues.length>0)&&<div className="error-banner" role="alert"><span>{state.error||snapshot.issues[0]}</span>{state.draft?.dirty&&<><button data-tooltip="Copy the unsaved draft before reconciling changes" onClick={()=>attempt(session.copyDraft())}>Copy draft</button><button data-tooltip="Discard this draft and read the current file" onClick={()=>{if(confirm('Discard the unsaved draft and reload from disk?'))attempt(session.reloadDraft());}}>Reload from disk</button></>}<Tool icon="close" label="Dismiss error" onClick={()=>session.update({error:''})}/></div>}
    {modal&&<div className="modal-shade" onPointerDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="settings" role="dialog" aria-modal="true" aria-label={modal==='workspaces'?'Manage workspaces':modal==='settings'?'Workspace settings':modal==='folder'?'New whiteboard':modal==='icon'?'Change icon':'Organize root cards'}>
      <div className="panel-title"><strong>{modal==='workspaces'?'Manage workspaces':modal==='settings'?'Workspace settings':modal==='folder'?'New whiteboard':modal==='icon'?'Change icon':'Organize root cards'}</strong><Tool icon="close" label="Close dialog" onClick={()=>setModal(null)}/></div>
      {modal==='workspaces'?<WorkspaceManager snapshot={snapshot} session={session}/>:modal==='settings'?<div className="settings-body">
        <label>Appearance<select aria-label="Workspace appearance" value={prefs.theme} onChange={e=>changePrefs(()=>({theme:e.target.value as Preferences['theme']}))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>New card filename<input aria-label="New card filename" defaultValue={prefs.stem} onBlur={e=>changePrefs(()=>({stem:e.target.value||'untitled'}))}/></label>
        <button data-tooltip="Restore the default left and right dock arrangement" onClick={()=>changeDocks(defaultDocks())}>Reset side docks</button>
        <small>Settings and layout are saved inside this workspace. Side docks are shared across its windows.</small>
        {!!rootCards.length&&<button data-tooltip="Review root-card migration" onClick={()=>setModal('migration')}>Organize {rootCards.length} root cards…</button>}
      </div>:modal==='folder'?<form className="settings-body" onSubmit={e=>{e.preventDefault();attempt(submitFolder());}}><label>Folder name<input autoFocus aria-label="Whiteboard folder name" value={folderName} onChange={e=>setFolderName(e.target.value)}/></label><small>{folderParent||snapshot.name} / {folderName||'…'}</small><button className="primary" data-tooltip="Create this folder and its whiteboard" disabled={!folderName.trim()}>Create whiteboard</button></form>:
      modal==='icon'?<form className="settings-body" onSubmit={e=>{e.preventDefault();changePrefs(p=>({icons:{...p.icons,[iconKey]:customIcon}}));setModal(null);}}>
        <div className="icon-selection"><DocumentIcon value={customIcon} fallback={documentInfo(iconKey,snapshot).icon}/><span>{customIcon?'Selected icon':'Default icon'}</span></div>
        <Suspense fallback={<small>Loading icons…</small>}><IconPicker onSelect={setCustomIcon}/></Suspense><div className="dialog-actions"><button type="button" data-tooltip="Restore the default map, note, or tag icon" onClick={()=>setCustomIcon('')}>Default</button><button className="primary" data-tooltip="Save this icon">Save</button></div>
      </form>:<div className="settings-body"><p>Move {rootCards.length} root-level cards and their whiteboard layouts into a new <strong>Notes</strong> subfolder. An occupied name gets a numbered suffix.</p><p>Card identities stay the same. Local attachment links are adjusted. A backup is kept before files move.</p><button className="primary" data-tooltip="Back up and move root cards into a subfolder" onClick={()=>attempt(session.run(async()=>{await session.flush();const result=await window.door.request<Snapshot>({kind:'migrateRoot'});session.undoHistory.clear();session.update({snapshot:result,draft:null,error:''});setModal(null);}))}>Move cards into Notes</button></div>}
    </section></div>}
  </div>;
}
function SplitDivider({node,onResize}:{node:Extract<Layout,{type:'split'}>;onResize:(ratio:number)=>void}) {
  const drag=useRef<{start:number;ratio:number;size:number}|null>(null);
  return <div className={'divider '+node.axis} role="separator" tabIndex={0} aria-label="Resize split panes" aria-orientation={node.axis==='row'?'vertical':'horizontal'} aria-valuenow={Math.round(node.ratio*100)}
    onPointerDown={e=>{const rect=e.currentTarget.parentElement!.getBoundingClientRect();drag.current={start:node.axis==='row'?e.clientX:e.clientY,ratio:node.ratio,size:node.axis==='row'?rect.width:rect.height};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
    onPointerMove={e=>{if(drag.current)onResize(drag.current.ratio+((node.axis==='row'?e.clientX:e.clientY)-drag.current.start)/drag.current.size);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();onResize(node.ratio+(['ArrowLeft','ArrowUp'].includes(e.key)?-.05:.05));}}}/>;
}
