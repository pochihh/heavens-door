import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Session } from './session';
import type { Mutation, Preferences, Snapshot } from '../shared';
import { Icon, Tool, type IconName } from './Icons';
import { BoardView, HistoryPanel, NoteView, TagView, type ViewMemory } from './DocumentViews';
import { closeTab, moveTab, openTab, pane, panes, removePane, resizeSplit, restoreLayout, splitPane, type Layout, type Pane } from './layout';

export const session=new Session(window.door);
const attempt=(promise:Promise<unknown>)=>{void promise.catch(()=>undefined);};
const parent=(path:string)=>path.replaceAll('\\','/').split('/').slice(0,-1).join('/');
const leaf=(path:string)=>path.replaceAll('\\','/').split('/').at(-1)??path;
const defaults:Preferences={theme:'system',stem:'untitled',starred:[],recent:[],icons:{}};
export function documentInfo(key:string,snapshot:Snapshot) {
  const split=key.indexOf(':'),kind=key.slice(0,split),id=key.slice(split+1);
  if(kind==='board')return {key,kind,id,title:id?leaf(id):snapshot.name,path:id,icon:'map' as IconName,exists:(snapshot.folders??['']).includes(id)};
  if(kind==='card'){const card=snapshot.cards.find(c=>c.id===id);return {key,kind,id,title:card?leaf(card.path):'Missing card',path:card?.path??'',icon:'note' as IconName,exists:!!card};}
  const tag=snapshot.tags?.find(t=>t.path===id);
  return {key,kind:'tag',id,title:tag?.name??leaf(id),path:id,icon:'tag' as IconName,exists:!!tag};
}
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
  return state.snapshot?<WorkspaceShell key={state.snapshot.root} snapshot={state.snapshot}/>:
    <div className={'app welcome-shell platform-'+window.door.platform}><div className="welcome-drag"/><div className="welcome">
      <button className="primary" title="Open an existing notes folder or create a workspace" onClick={()=>attempt(session.open(false))}>Open workspace</button>
      <button title="Create a temporary workspace with example cards" onClick={()=>attempt(session.open(true))}>Try a sample workspace</button>
      {state.error&&<p role="alert">{state.error}</p>}
    </div></div>;
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
  const [bottomHeight,setBottomHeight]=useState(38);
  const [search,setSearch]=useState(''),[results,setResults]=useState<string[]|null>(null);
  const [expanded,setExpanded]=useState(new Set(['']));
  const [modal,setModal]=useState<'settings'|'folder'|'icon'|'migration'|null>(null);
  const [folderParent,setFolderParent]=useState(''),[folderName,setFolderName]=useState('');
  const [iconKey,setIconKey]=useState(''),[customIcon,setCustomIcon]=useState('');
  const [pulse,setPulse]=useState(0),[wordCounts,setWordCounts]=useState<Record<string,number>>({});
  const memories=useRef(new Map<string,ViewMemory>());
  const active=panes(layout).find(p=>p.id===activeId)??panes(layout)[0];
  const doc=active.active?documentInfo(active.active,snapshot):null;
  const activeFolder=doc?.kind==='board'?doc.id:doc?parent(doc.path):'';
  const rootCards=snapshot.cards.filter(c=>!parent(c.path));
  useEffect(()=>{sessionStorage.setItem(storage,JSON.stringify(layout));},[layout,storage]);
  useEffect(()=>{
    const query=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=prefs.theme==='system'?(query.matches?'dark':'light'):prefs.theme;};
    apply();query.addEventListener('change',apply);return()=>query.removeEventListener('change',apply);
  },[prefs.theme]);
  useEffect(()=>{
    if(right==='history')attempt(session.history());
  },[right]);
  useEffect(()=>{
    let live=true;if(!search.trim()){setResults(null);return;}
    const timer=setTimeout(()=>{void window.door.request<{path:string}[]>({kind:'query',text:search}).then(rows=>{if(live)setResults(rows.map(r=>r.path));}).catch(error=>session.update({error:String(error)}));},120);
    return()=>{live=false;clearTimeout(timer);};
  },[search,snapshot]);
  const changePrefs=useCallback((change:(p:Preferences)=>Partial<Preferences>)=>{
    attempt(session.run(async()=>{
      const result=await window.door.request<Snapshot>({kind:'preferences',patch:change(session.state.snapshot?.preferences??defaults)});
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
    setExpanded(v=>new Set([...v,folderParent,path]));setModal(null);open('board:'+path);
  }
  function createCard(folder:string,x=80,y=80,paneId=activeId){
    if(!folder){createFolder('');return;}
    attempt((async()=>{await session.create(folder,prefs.stem,x,y);const card=session.state.draft?.card;
      if(card){setExpanded(v=>new Set([...v,folder]));const p=panes(layout).find(p=>p.id===paneId);if(p?.active!=='board:'+folder)open('card:'+card.id,paneId);}
    })());
  }
  function star(key:string){changePrefs(p=>({starred:p.starred.includes(key)?p.starred.filter(k=>k!==key):[...p.starred,key]}));}
  function docIcon(key:string){const info=documentInfo(key,snapshot);return prefs.icons[key]?<span className="document-icon">{prefs.icons[key]}</span>:<Icon name={info.icon}/>;}
  function item(key:string,indent=0,extra?:ReactNode){
    const info=documentInfo(key,snapshot);
    return <div className={'tree-row '+(active.active===key?'current':'')} key={key} style={{paddingLeft:8+indent*16}}>
      {extra}<button className="file-button" title={'Open '+(info.path||snapshot.name)+' in the active pane'} onClick={()=>open(key)}>{docIcon(key)}<span>{info.title}</span></button>
    </div>;
  }
  const folders=useMemo(()=>snapshot.folders??['',...snapshot.boards.map(b=>b.folder)], [snapshot]);
  const tree=useMemo(()=>{
    const groups=new Map<string,{folders:string[];keys:string[]}>();
    for(const folder of folders)groups.set(folder,{folders:[],keys:[]});
    for(const folder of folders)if(folder)groups.get(parent(folder))?.folders.push(folder);
    for(const card of snapshot.cards)groups.get(parent(card.path))?.keys.push('card:'+card.id);
    for(const tag of snapshot.tags??[])groups.get(parent(tag.path))?.keys.push('tag:'+tag.path);
    return groups;
  },[folders,snapshot.cards,snapshot.tags]);
  function branch(folder:string,depth=0):ReactNode {
    const group=tree.get(folder),show=expanded.has(folder);
    return <div key={folder}>{item('board:'+folder,depth,<button className="tree-disclosure" title={(show?'Collapse ':'Expand ')+(folder||snapshot.name)} aria-expanded={show} onClick={()=>setExpanded(v=>{const next=new Set(v);if(show)next.delete(folder);else next.add(folder);return next;})}><Icon name={show?'down':'chevron'} size={12}/></button>)}
      {show&&<div>{group?.folders.map(f=>branch(f,depth+1))}{group?.keys.map(key=>item(key,depth+1,<span className="tree-spacer"/>))}</div>}
    </div>;
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
            <button role="tab" aria-selected={p.active===key} title={info.path||info.title} onClick={()=>open(key,p.id)}>{docIcon(key)}<span>{info.title}</span></button>
            <Tool icon="close" label={'Close '+info.title} onClick={()=>close(p,key)}/>
          </div>;})}
        </div>
        <details className="menu pane-menu"><summary title="Pane actions" aria-label="Pane actions"><Icon name="down" size={12}/></summary><div className="menu-content">
          <button title="Open the current file beside this pane" onClick={()=>split(p,'row')}><Icon name="splitRight"/>Split right</button>
          <button title="Open the current file below this pane" onClick={()=>split(p,'column')}><Icon name="splitDown"/>Split down</button>
          <button title="Close this pane; keep files on disk" disabled={panes(layout).length===1} onClick={()=>attempt((async()=>{await session.select(null);const next=removePane(layout,p.id);if(next){setLayout(next);setActiveId(panes(next)[0].id);}})())}><Icon name="close"/>Close pane</button>
        </div></details>
      </div>
      {info&&<div className="document-toolbar">
        <button className="document-icon-button" title="Change this file’s icon" onClick={()=>{setIconKey(p.active);setCustomIcon(prefs.icons[p.active]??'');setModal('icon');}}>{docIcon(p.active)}</button>
        <span className="document-breadcrumb" title={info.path||snapshot.root}>{info.path||snapshot.name}</span>
        <div className="toolbar-spacer"/>
        {info.kind==='board'&&<><Tool icon="folder" label="Create sub-whiteboard" onClick={()=>createFolder(info.id)}/>{!!info.id&&<Tool icon="plus" label="Create card in this whiteboard" onClick={()=>createCard(info.id,80,80,p.id)}/>}</>}
        {info.kind==='card'&&<Tool icon="format" label="Show or hide formatting controls" aria-pressed={formatting.has(p.id)} className={formatting.has(p.id)?'selected':''} onClick={()=>setFormatting(current=>{const next=new Set(current);if(next.has(p.id))next.delete(p.id);else next.add(p.id);return next;})}/>}
        <Tool icon="star" className={prefs.starred.includes(p.active)?'is-starred':''} label={prefs.starred.includes(p.active)?'Remove from starred':'Add to starred'} onClick={()=>star(p.active)}/>

      </div>}
      <div className="document-content">
        {!info?<div className="empty-pane"><button title="Open the mother whiteboard" onClick={()=>open('board:',p.id)}><Icon name="map"/>Open whiteboard</button></div>:
          !info.exists?<p className="notice">This file is no longer in the workspace.</p>:
          board?<BoardView key={p.active} board={board} snapshot={snapshot} session={session} active={focused} memory={memory} onActivate={()=>setActiveId(p.id)} onOpen={key=>open(key,p.id)} onCreate={(x,y)=>createCard(info.id,x,y,p.id)} onMigrate={()=>setModal('migration')}/>:
          tag?<TagView key={p.active} tag={tag} snapshot={snapshot} session={session} onOpen={key=>open(key,p.id)}/>:
          <NoteView key={p.active} formatting={formatting.has(p.id)} path={info.path} session={session} snapshot={snapshot} active={focused} memory={memory} onActivate={()=>{setActiveId(p.id);attempt(session.select(info.path));}} onOpen={key=>open(key,p.id)} onWords={count=>setWordCounts(v=>v[p.active]===count?v:{...v,[p.active]:count})}/>}
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
  return <div className={'app platform-'+window.door.platform} style={{'--sidebar-width':leftWidth+'px','--dock-width':rightWidth+'px'} as CSSProperties}>
    <header className="window-toolbar">
      <div className="traffic-light-space"/>
      <details className="menu workspace-menu"><summary title="Workspace actions"><span>{snapshot.name}</span><Icon name="down" size={12}/></summary><div className="menu-content">
        <button title="Open another workspace in this window" onClick={()=>attempt(session.open(false))}><Icon name="folder"/>Open workspace…</button>
        <button title="Open a new window for another workspace" onClick={()=>attempt(window.door.newWindow(false))}><Icon name="window"/>New window</button>
        <button title="Open this workspace in another window" onClick={()=>attempt(window.door.newWindow(true))}><Icon name="window"/>New window for this workspace</button>
      </div></details>
      <Tool icon="left" label={left?'Hide file navigation':'Show file navigation'} onClick={()=>setLeft(!left)}/>
      <div className="window-drag-space"/>
      <Tool icon="search" label="Search workspace cards" onClick={()=>{setLeft(true);setNavMode('search');}}/>
      <div className="windows-controls-space"/>
    </header>
    <div className={"workspace-body "+(!left?"no-sidebar":"")}>
      <nav className="dock-rail" aria-label="Navigation tools">
        <Tool icon="folder" label="Documents" aria-pressed={left&&navMode==='files'} className={left&&navMode==='files'?'selected':''} onClick={()=>{setLeft(!(left&&navMode==='files'));setNavMode('files');}}/>
        <Tool icon="tag" label="Tags" aria-pressed={left&&navMode==='tags'} className={left&&navMode==='tags'?'selected':''} onClick={()=>{setLeft(!(left&&navMode==='tags'));setNavMode('tags');}}/>
        <Tool icon="star" label="Starred files" onClick={()=>{setLeft(true);setNavMode('files');requestAnimationFrame(()=>document.querySelector('.starred .file-button')?.scrollIntoView({block:'nearest'}));}}/>
        <div className="toolbar-spacer"/>
        <Tool icon="settings" label="Workspace settings" onClick={()=>setModal('settings')}/>
      </nav>
      {left&&<><aside className="sidebar" aria-label="File navigation">
        <div className="nav-files" style={{flex:100-bottomHeight}}>
          <div className="section-title"><strong>{navMode==='search'?'Search':navMode==='tags'?'Tags':'Documents'}</strong><div className="toolbar-spacer"/><Tool icon="folder" label="Create sub-whiteboard in the active folder" onClick={()=>createFolder(activeFolder)}/><Tool icon="plus" label={activeFolder?'Create card in the active folder':'Create sub-whiteboard'} onClick={()=>createCard(activeFolder)}/></div>
          {navMode==='search'&&<label className="search"><Icon name="search" size={14}/><input autoFocus aria-label="Search cards" title="Search filenames and card content" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<Tool icon="close" label="Clear search" onClick={()=>setSearch('')}/>}</label>}
          <nav className="file-tree" aria-label="Workspace files">{navMode==='tags'?snapshot.tags?.map(tag=>item('tag:'+tag.path)):navMode==='search'&&results?results.map(path=>{const c=snapshot.cards.find(c=>c.path===path);return c?item('card:'+c.id):null;}):branch('')}</nav>
        </div>
        <div className="nav-divider" role="separator" aria-label="Resize file navigation sections" aria-orientation="horizontal" tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowUp')setBottomHeight(v=>Math.min(70,v+5));if(e.key==='ArrowDown')setBottomHeight(v=>Math.max(20,v-5));}}
          onPointerDown={(e:PointerEvent<HTMLDivElement>)=>{
            const start=e.clientY,initial=bottomHeight,height=e.currentTarget.parentElement!.clientHeight;
            const move=(event:globalThis.PointerEvent)=>setBottomHeight(Math.max(20,Math.min(70,initial-(event.clientY-start)/height*100)));
            const stop=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);};
            document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});
          }}/>
        <div className="nav-bottom" style={{flex:bottomHeight}}>
          <section className="starred"><div className="section-title"><Icon name="star" size={13}/><strong>Starred</strong></div><div className="saved-files">{prefs.starred.map(key=>item(key))}</div></section>
          <section className="recent"><div className="section-title"><Icon name="clock" size={13}/><strong>Recent</strong></div><div className="saved-files">{prefs.recent.map(key=>item(key))}</div></section>
        </div>
      </aside><Divider value={leftWidth} label="Resize file navigation" onChange={value=>setLeftWidth(Math.max(170,Math.min(420,value)))}/></>}
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
<span title="Remote sync is not configured"><Icon name="sync" size={13}/>Sync off</span><span role="status" title={state.error||state.status}>{state.status==='Saved locally'?'Saved':state.status}</span><div className="toolbar-spacer"/>{!!rootCards.length&&<button title="Review moving root-level cards into a sub-whiteboard" onClick={()=>setModal('migration')}>Organize root cards</button>}<span>{stat}</span></footer>
    {(state.error||snapshot.issues.length>0)&&<div className="error-banner" role="alert"><span>{state.error||snapshot.issues[0]}</span>{state.draft?.dirty&&<><button title="Copy the unsaved draft before reconciling changes" onClick={()=>attempt(session.copyDraft())}>Copy draft</button><button title="Discard this draft and read the current file" onClick={()=>{if(confirm('Discard the unsaved draft and reload from disk?'))attempt(session.reloadDraft());}}>Reload from disk</button></>}<Tool icon="close" label="Dismiss error" onClick={()=>session.update({error:''})}/></div>}
    {modal&&<div className="modal-shade" onPointerDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className="settings" role="dialog" aria-modal="true" aria-label={modal==='settings'?'Workspace settings':modal==='folder'?'New whiteboard':modal==='icon'?'Change icon':'Organize root cards'}>
      <div className="panel-title"><strong>{modal==='settings'?'Workspace settings':modal==='folder'?'New whiteboard':modal==='icon'?'Change icon':'Organize root cards'}</strong><Tool icon="close" label="Close dialog" onClick={()=>setModal(null)}/></div>
      {modal==='settings'?<div className="settings-body">
        <label>Appearance<select aria-label="Workspace appearance" value={prefs.theme} onChange={e=>changePrefs(()=>({theme:e.target.value as Preferences['theme']}))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>New card filename<input aria-label="New card filename" defaultValue={prefs.stem} onBlur={e=>changePrefs(()=>({stem:e.target.value||'untitled'}))}/></label>
        <small>Settings apply to this workspace and its windows.</small>
        {!!rootCards.length&&<button title="Review root-card migration" onClick={()=>setModal('migration')}>Organize {rootCards.length} root cards…</button>}
      </div>:modal==='folder'?<form className="settings-body" onSubmit={e=>{e.preventDefault();attempt(submitFolder());}}><label>Folder name<input autoFocus aria-label="Whiteboard folder name" value={folderName} onChange={e=>setFolderName(e.target.value)}/></label><small>{folderParent||snapshot.name} / {folderName||'…'}</small><button className="primary" title="Create this folder and its whiteboard" disabled={!folderName.trim()}>Create whiteboard</button></form>:
      modal==='icon'?<form className="settings-body" onSubmit={e=>{e.preventDefault();changePrefs(p=>({icons:{...p.icons,[iconKey]:customIcon}}));setModal(null);}}>
        <label>Icon<input autoFocus aria-label="Document icon" placeholder="Emoji or symbol" value={customIcon} onChange={e=>setCustomIcon([...e.target.value].slice(0,16).join(''))}/></label>
        <div className="icon-options">{['📌','📚','💡','🔬','🎯','🌱','🗺️','📝'].map(icon=><button key={icon} type="button" title={'Use '+icon} onClick={()=>setCustomIcon(icon)}>{icon}</button>)}</div><div className="dialog-actions"><button type="button" title="Restore the default map, note, or tag icon" onClick={()=>setCustomIcon('')}>Default</button><button className="primary" title="Save this icon">Save</button></div>
      </form>:<div className="settings-body"><p>Move {rootCards.length} root-level cards and their whiteboard layouts into a new <strong>Notes</strong> subfolder. An occupied name gets a numbered suffix.</p><p>Card identities stay the same. Local attachment links are adjusted. A backup is kept before files move.</p><button className="primary" title="Back up and move root cards into a subfolder" onClick={()=>attempt(session.run(async()=>{await session.flush();const result=await window.door.request<Snapshot>({kind:'migrateRoot'});session.undoHistory.clear();session.update({snapshot:result,draft:null,error:''});setModal(null);setExpanded(new Set(['']));}))}>Move cards into Notes</button></div>}
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
