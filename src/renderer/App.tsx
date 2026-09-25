import { useCallback, useEffect, lazy, Suspense, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Session } from './session';
import type { Mutation, Preferences, Snapshot } from '../shared';
import { DocumentIcon, Icon, Tool } from './Icons';
import { Explorer } from './Explorer';
import { TooltipHost } from './Overlays';
import { documentInfo, parent } from './documents';
const IconPicker=lazy(()=>import('./IconPicker'));
export { documentInfo } from './documents';
import { BoardView, FileView, HistoryPanel, NoteView, TagView, type ViewMemory } from './DocumentViews';
import { closeTab, moveTab, openTab, pane, panes, removePane, resizeSplit, restoreLayout, splitPane, type Layout, type Pane } from './layout';

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
  return <div className={'divider '+axis} role="separator" aria-label={label} aria-orientation={axis==='row'?'vertical':'horizontal'} aria-valuenow={Math.round(value)} tabIndex={0}
    onPointerDown={e=>{e.preventDefault();drag.current={coordinate:axis==='row'?e.clientX:e.clientY,value};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)onChange(drag.current.value+(axis==='row'?e.clientX:e.clientY)-drag.current.coordinate);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();onChange(value+(['ArrowLeft','ArrowUp'].includes(e.key)?-20:20));}}}/>;
}
function WorkspaceShell({snapshot}:{snapshot:Snapshot}) {
  const state=session.state,prefs=snapshot.preferences??defaults;
  const storage='layout:'+snapshot.root;
  const [layout,setLayout]=useState(()=>restoreLayout(sessionStorage.getItem(storage)));
  const [activeId,setActiveId]=useState(()=>panes(layout)[0].id);
  const [left,setLeft]=useState(true),[right,setRight]=useState<'history'|'agent'|null>(null);
  const [leftWidth,setLeftWidth]=useState(232),[rightWidth,setRightWidth]=useState(232);
  const [navMode,setNavMode]=useState<'files'|'search'|'tags'>('files');
  const [formatting,setFormatting]=useState(new Set<string>());
  const [modal,setModal]=useState<'settings'|'folder'|'icon'|'migration'|null>(null);
  const [folderParent,setFolderParent]=useState(''),[folderName,setFolderName]=useState('');
  const [iconKey,setIconKey]=useState(''),[customIcon,setCustomIcon]=useState('');
  const [pulse,setPulse]=useState(0),[wordCounts,setWordCounts]=useState<Record<string,number>>({});
  const memories=useRef(new Map<string,ViewMemory>());
  const active=panes(layout).find(p=>p.id===activeId)??panes(layout)[0];
  const doc=active.active?documentInfo(active.active,snapshot):null;
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
  useEffect(()=>{sessionStorage.setItem(storage,JSON.stringify(layout));},[layout,storage]);
  useEffect(()=>{
    const query=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=prefs.theme==='system'?(query.matches?'dark':'light'):prefs.theme;};
    apply();query.addEventListener('change',apply);return()=>query.removeEventListener('change',apply);
  },[prefs.theme]);
  useEffect(()=>{
    if(right==='history')attempt(session.history());
  },[right]);
  const changePrefs=useCallback((change:(p:Preferences)=>Partial<Preferences>)=>{
    attempt(session.run(async()=>{
      const patch=change(session.state.snapshot?.preferences??defaults);if(!Object.keys(patch).length)return;
      const result=await window.door.request<Snapshot>({kind:'preferences',patch});
      session.update({snapshot:result});
    }));
  },[]);
  const open=useCallback((key:string,id=activeId)=>{
    attempt((async()=>{
      const info=documentInfo(key,session.state.snapshot!);
      if(!info.exists){session.update({error:'This file is no longer in the workspace.'});return;}
      await session.select(info.kind==='card'?info.path:null);
      setLayout(current=>openTab(current,id,key));setActiveId(id);setPulse(v=>v+1);
      changePrefs(p=>({recent:[key,...p.recent.filter(k=>k!==key)].slice(0,30)}));
    })());
  },[activeId,changePrefs]);
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
  function createCard(folder:string,x=80,y=80,paneId=activeId){
    if(!folder){createFolder('');return;}
    attempt((async()=>{await session.create(folder,prefs.stem,x,y,snapshot.boards.some(b=>b.folder===folder));const card=session.state.draft?.card;
      if(card){const p=panes(layout).find(p=>p.id===paneId);if(p?.active!=='board:'+folder)open('card:'+card.id,paneId);}
    })());
  }
  function star(key:string){changePrefs(p=>({starred:p.starred.includes(key)?p.starred.filter(k=>k!==key):[...p.starred,key]}));}
  function docIcon(key:string){const info=documentInfo(key,snapshot);return <DocumentIcon value={prefs.icons[key]} fallback={info.icon}/>;}
  function editIcon(key:string){setIconKey(key);setCustomIcon(prefs.icons[key]??'');setModal('icon');}
  function openBeside(key:string){
    attempt((async()=>{await session.flush();const next=pane(key);setLayout(current=>splitPane(current,activeId,'row',next));setActiveId(next.id);open(key,next.id);})());
  }
  function transfer(event:React.DragEvent,p:Pane,before?:string){
    event.preventDefault();
    try{const value=JSON.parse(event.dataTransfer.getData('application/heavens-tab'));
      if(typeof value.pane==='string'&&typeof value.key==='string'&&panes(layout).some(p=>p.id===value.pane&&p.tabs.includes(value.key))){
        attempt((async()=>{await session.flush();setLayout(current=>moveTab(current,value.pane,p.id,value.key,before));setActiveId(p.id);})());
      }
    }catch{/* unrelated drag */}
  }
  function renderPane(p:Pane):ReactNode {
    const info=p.active?documentInfo(p.active,snapshot):null;
    const focused=p.id===active.id;
    const memoryKey=p.id+':'+p.active;
    let memory=memories.current.get(memoryKey);if(!memory){memory={};memories.current.set(memoryKey,memory);}
    const board=info?.kind==='board'?snapshot.boards.find(b=>b.folder===info.id):undefined;
    const tag=info?.kind==='tag'?snapshot.tags?.find(t=>t.path===info.id):undefined;
    return <section className={'note-pane '+(focused?'active-pane':'')} data-pane={p.id} data-active={focused} aria-label="Document pane" onPointerDownCapture={()=>{if(!focused)focusPane(p);}}>
      <div className="tab-strip">
        <div className="tab-list" role="tablist" aria-label="Open files" onDragOver={e=>e.preventDefault()} onDrop={e=>transfer(e,p)}>
          {p.tabs.map(key=>{const info=documentInfo(key,snapshot);return <div className={'tab '+(p.active===key?'active-tab':'')} key={key} draggable onDragStart={e=>{e.dataTransfer.setData('application/heavens-tab',JSON.stringify({pane:p.id,key}));e.dataTransfer.effectAllowed='move';}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();transfer(e,p,key);}}>
            <button role="tab" aria-selected={p.active===key} data-tooltip={info.path||info.title} onClick={()=>open(key,p.id)}>{docIcon(key)}<span>{info.title}</span></button>
            <Tool icon="close" label={'Close '+info.title} onClick={()=>close(p,key)}/>
          </div>;})}
        </div>
        <details className="menu pane-menu"><summary data-tooltip="Pane actions" aria-label="Pane actions"><Icon name="down" size={12}/></summary><div className="menu-content">
          <button data-tooltip="Open the current file beside this pane" onClick={()=>split(p,'row')}><Icon name="splitRight"/>Split right</button>
          <button data-tooltip="Open the current file below this pane" onClick={()=>split(p,'column')}><Icon name="splitDown"/>Split down</button>
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
        {!info?<div className="empty-pane"><button data-tooltip="Open the mother whiteboard" onClick={()=>open('board:',p.id)}><Icon name="map"/>Open whiteboard</button></div>:
          !info.exists?<p className="notice">This file is no longer in the workspace.</p>:
          board?<BoardView key={p.active} board={board} snapshot={snapshot} session={session} active={focused} memory={memory} onActivate={()=>setActiveId(p.id)} onOpen={key=>open(key,p.id)} onCreate={(x,y)=>createCard(info.id,x,y,p.id)} onMigrate={()=>setModal('migration')}/>:
          tag?<TagView key={p.active} tag={tag} snapshot={snapshot} session={session} onOpen={key=>open(key,p.id)}/>:
          info.kind==='file'?<FileView key={p.active} path={info.path} snapshot={snapshot} memory={memory}/>:<NoteView key={p.active} formatting={formatting.has(p.id)} path={info.path} session={session} snapshot={snapshot} active={focused} memory={memory} onActivate={()=>{setActiveId(p.id);attempt(session.select(info.path));}} onOpen={key=>open(key,p.id)} onWords={count=>setWordCounts(v=>v[p.active]===count?v:{...v,[p.active]:count})}/>}
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
  const activeBoard=doc?.kind==='board'?snapshot.boards.find(b=>b.folder===doc.id):undefined;
  const stat=activeBoard?(doc?.id?activeBoard.cards.filter(p=>!p.folder).length+' cards · ':'')+activeBoard.cards.filter(p=>p.folder).length+' whiteboards':
    doc?.kind==='card'?(wordCounts[active.active]??0)+' words':doc?.kind==='tag'?'Tag view':'';
  return <div className={'app platform-'+window.door.platform} inert={state.status==='Opening workspace…'} style={{'--sidebar-width':leftWidth+'px','--dock-width':rightWidth+'px'} as CSSProperties}>
    <header className="window-toolbar">
      <div className="traffic-light-space"/>
      <Tool icon="left" label={left?'Hide file navigation':'Show file navigation'} onClick={()=>setLeft(!left)}/>
      <div className="window-drag-space"/>
      <Tool icon="search" label="Search workspace cards" onClick={()=>{setLeft(true);setNavMode('search');}}/>
      <div className="windows-controls-space"/>
    </header>
    <div className={"workspace-body "+(!left?"no-sidebar":"")}>
      <nav className="dock-rail" aria-label="Navigation tools">
        <Tool icon="folder" label="Explorer" aria-pressed={left&&navMode==='files'} className={left&&navMode==='files'?'selected':''} onClick={()=>{setLeft(!(left&&navMode==='files'));setNavMode('files');}}/>
        <Tool icon="tag" label="Tags" aria-pressed={left&&navMode==='tags'} className={left&&navMode==='tags'?'selected':''} onClick={()=>{setLeft(!(left&&navMode==='tags'));setNavMode('tags');}}/>
        <Tool icon="star" label="Starred files" onClick={()=>{setLeft(true);setNavMode('files');requestAnimationFrame(()=>document.querySelector('.starred .file-button')?.scrollIntoView({block:'nearest'}));}}/>
        <div className="toolbar-spacer"/>
        <Tool icon="settings" label="Workspace settings" onClick={()=>setModal('settings')}/>
      </nav>
      {left&&<><Explorer snapshot={snapshot} prefs={prefs} activeKey={active.active} navMode={navMode} session={session} onOpen={open} onSplit={openBeside} onFolder={createFolder} onCard={createCard} onIcon={editIcon} onPrefs={changePrefs}/>
      <Divider value={leftWidth} label="Resize file navigation" onChange={value=>setLeftWidth(Math.max(170,Math.min(420,value)))}/></>}
      <main className="workspace">{renderLayout(layout)}</main>
      {right&&<><Divider value={-rightWidth} label="Resize right panel" onChange={value=>setRightWidth(Math.max(190,Math.min(520,-value)))}/><aside className="right-dock" aria-label="Right panel">
        <div className="section-title"><strong>{right==='history'?'History':'Agent'}</strong><div className="toolbar-spacer"/>{right==='history'&&<Tool icon="plus" label="Save workspace checkpoint · ⌘S / Ctrl+S" disabled={!snapshot.historyAvailable} onClick={()=>attempt(session.checkpoint())}/>}<Tool icon="close" label="Close right panel" onClick={()=>setRight(null)}/></div>
        {right==='history'?<HistoryPanel session={session}/>:<div className="agent-empty">Agent integration is not connected yet.</div>}
      </aside></>}
      <nav className="dock-rail" aria-label="Workspace tools">
        <Tool icon="agent" label="Agent panel" aria-pressed={right==='agent'} className={right==='agent'?'selected':''} onClick={()=>setRight(right==='agent'?null:'agent')}/>
        <Tool icon="clock" label="Workspace history" aria-pressed={right==='history'} className={right==='history'?'selected':''} onClick={()=>setRight(right==='history'?null:'history')}/>
      </nav>
    </div>
    <footer className="statusbar">      <Tool icon="undo" label="Undo · ⌘Z / Ctrl+Z" disabled={!session.undoHistory.past.length&&!state.draft?.dirty} onClick={()=>attempt(session.undo())}/>
      <Tool icon="redo" label="Redo · ⇧⌘Z / Ctrl+Shift+Z" disabled={!session.undoHistory.future.length} onClick={()=>attempt(session.undo(true))}/>
<span data-tooltip="Remote sync is not configured"><Icon name="sync" size={13}/>Sync off</span><span role="status" data-tooltip={state.error||state.status}>{state.status==='Saved locally'?'Saved':state.status}</span><div className="toolbar-spacer"/>{!!rootCards.length&&<button data-tooltip="Review moving root-level cards into a sub-whiteboard" onClick={()=>setModal('migration')}>Organize root cards</button>}<span>{stat}</span></footer>
    {(state.error||snapshot.issues.length>0)&&<div className="error-banner" role="alert"><span>{state.error||snapshot.issues[0]}</span>{state.draft?.dirty&&<><button data-tooltip="Copy the unsaved draft before reconciling changes" onClick={()=>attempt(session.copyDraft())}>Copy draft</button><button data-tooltip="Discard this draft and read the current file" onClick={()=>{if(confirm('Discard the unsaved draft and reload from disk?'))attempt(session.reloadDraft());}}>Reload from disk</button></>}<Tool icon="close" label="Dismiss error" onClick={()=>session.update({error:''})}/></div>}
    {modal&&<div className="modal-shade" onPointerDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="settings" role="dialog" aria-modal="true" aria-label={modal==='settings'?'Workspace settings':modal==='folder'?'New whiteboard':modal==='icon'?'Change icon':'Organize root cards'}>
      <div className="panel-title"><strong>{modal==='settings'?'Workspace settings':modal==='folder'?'New whiteboard':modal==='icon'?'Change icon':'Organize root cards'}</strong><Tool icon="close" label="Close dialog" onClick={()=>setModal(null)}/></div>
      {modal==='settings'?<div className="settings-body">
        <label>Appearance<select aria-label="Workspace appearance" value={prefs.theme} onChange={e=>changePrefs(()=>({theme:e.target.value as Preferences['theme']}))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>New card filename<input aria-label="New card filename" defaultValue={prefs.stem} onBlur={e=>changePrefs(()=>({stem:e.target.value||'untitled'}))}/></label>
        <small>Settings apply to this workspace and its windows.</small>
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
