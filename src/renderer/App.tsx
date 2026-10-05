import {featureEnabled,moduleEnabled,type SystemEntry} from '../features';
import {SystemView} from './SystemView';
import {CalendarView} from './CalendarView';
import {TemplateDialog} from './TemplateDialog';
import {cardFill,tintColor} from '../colors';
import type {CardDrop} from './card-drop';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import { useCallback, useEffect, useLayoutEffect, lazy, Suspense, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { remapKey } from '../path-remap';
import {DateDisplayContext} from './DateProperty';
import {DEFAULT_DATE_DISPLAY} from '../dates';
import { DEFAULT_CARD_FOLDER, DEFAULT_TITLE_PLACEHOLDER } from '../shared';
import { ViewBlockProvider } from './ViewBlock';
import {SettingsPanel} from './SettingsPanel';
import { StyleView, type BoardSelection } from './StyleView';
import { CardPopup } from './CardPopup';
import { Breadcrumbs } from './Breadcrumbs';
import { Session } from './session';
import type { Mutation, Preferences, Snapshot } from '../shared';
import { DocumentIcon, Icon, Tool } from './Icons';
import { HistoryPanel } from './HistoryView';
import { SearchDialog, SearchView } from './SearchView';
import { ConfirmationProvider, useConfirmation } from './Confirmation';
import { Explorer } from './Explorer';
import { SideDock, modules, MODULE_IDS } from './Docks';
import { WorkspaceMenu,WorkspaceManager } from './WorkspaceMenu';
import {defaultDocks,findModule,revealModule,moveModule,activeAfterRemoval,type ModuleId,type Docks,type DocumentsLayout} from '../layout';
import { ActionMenu,TooltipHost,type MenuState } from './Overlays';
import {useTabDrag} from './tab-drag';
import { documentInfo, parent, cardPlacement } from './documents';
const IconPicker=lazy(()=>import('./IconPicker'));
export { documentInfo } from './documents';
import { BoardView, FileView, NoteView, TagView, type ViewMemory } from './DocumentViews';
import { MAX_PANES, MAX_TABS, tabDocument, tabHistory, travelTab, mapPaneDocuments, updatePane, navigateTab, closeTab, moveTab, openTab, pane, panes, removePane, resizeSplit, restoreLayout, splitPane, type NavigationMode, type Layout, type Pane } from '../layout';

export const session=new Session(window.door);
const attempt=(promise:Promise<unknown>)=>{void promise.catch(()=>undefined);};
const defaults:Preferences={theme:'system',stem:'untitled',starred:[],recent:[],icons:{}};
export function App() {return <ConfirmationProvider><Application/></ConfirmationProvider>;}
function Application() {
  const state=useSyncExternalStore(session.subscribe,session.getState);
  const [manage,setManage]=useState(false);
  const opening=state.status===ui.status.openingWorkspace;
  useEffect(()=>{
    const remove=window.door.onChange(()=>{if(session.state.snapshot)attempt(session.refresh());});
    const keyboard=(event:KeyboardEvent)=>{
      if(document.querySelector('dialog[open]:not(.card-popup)')||!(event.metaKey||event.ctrlKey)||event.isComposing)return;
      if(event.key.toLowerCase()==='s'){event.preventDefault();attempt(session.checkpoint());}
      if(event.key.toLowerCase()==='z'&&!(event.target instanceof HTMLInputElement&&event.target.type!=='checkbox')){event.preventDefault();attempt(session.undo(event.shiftKey));}
    };
    window.addEventListener('keydown',keyboard,true);
    return()=>{remove();window.removeEventListener('keydown',keyboard,true);};
  },[]);
  return <><TooltipHost/>{state.snapshot?<WorkspaceShell key={state.snapshot.root} snapshot={state.snapshot}/>:
    <div className={'app welcome-shell platform-'+window.door.platform} inert={opening}><div className="welcome-drag"/><div className="welcome">
      <button className="primary" data-tooltip={tooltips.workspace.open} onClick={()=>attempt(session.open(false))}>{ui.workspace.open}</button>
      <button data-tooltip={tooltips.workspace.sampleWorkspace} onClick={()=>attempt(session.open(true))}>{ui.workspace.trySample}</button>
      <button data-tooltip={tooltips.workspace.manage} aria-expanded={manage} onClick={()=>setManage(value=>!value)}>{ui.workspace.manage}</button>
      {manage&&<section className="workspace-start-manager" aria-label={ui.workspace.manage}><WorkspaceManager snapshot={null} session={session}/></section>}
      {state.error&&<p role="alert">{state.error}</p>}
    </div></div>}{opening&&<div className="workspace-loading" role="status" aria-live="polite" aria-busy="true"><div className="welcome-drag"/><div className="loading-message"><span className="loading-spinner" aria-hidden="true"/><strong>{ui.status.openingWorkspace}</strong><span>{ui.search.preparing}</span></div></div>}</>;
}
function Divider({axis='row',value,onChange,label}:{axis?:'row'|'column';value:number;onChange:(value:number)=>void;label:string}) {
  const drag=useRef<{coordinate:number;value:number}|null>(null);
  return <div className={'divider '+axis} role="separator" aria-label={label} aria-orientation={axis==='row'?'vertical':'horizontal'} aria-valuemin={180} aria-valuemax={520} aria-valuenow={Math.round(Math.abs(value))} aria-valuetext={ui.layout.pixels(Math.round(Math.abs(value)))} tabIndex={0}
    onPointerDown={e=>{e.preventDefault();drag.current={coordinate:axis==='row'?e.clientX:e.clientY,value};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)onChange(drag.current.value+(axis==='row'?e.clientX:e.clientY)-drag.current.coordinate);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();onChange(value+(['ArrowLeft','ArrowUp'].includes(e.key)?-20:20));}}}/>;
}
function WorkspaceShell({snapshot}:{snapshot:Snapshot}) {
  const confirm=useConfirmation();
  const [reveal,setReveal]=useState<{pane:string;path:string;placement:string;token:number}>();
  const state=session.state,prefs=snapshot.preferences??defaults;
  const [boardSelection,setBoardSelection]=useState<BoardSelection>();
  const [popup,setPopup]=useState<{key:string;pane:string;previousCard?:string}>();
  const [searchOpen,setSearchOpen]=useState(false);
  useEffect(()=>{const search=()=>setSearchOpen(true);window.addEventListener('editor:search',search);return()=>window.removeEventListener('editor:search',search);},[]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(!document.querySelector('dialog[open]')&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!e.isComposing){e.preventDefault();setSearchOpen(true);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const [layout,setLayout]=useState(()=>prefs.documents?.tree??restoreLayout(null));
  const [activeId,setActiveId]=useState(()=>prefs.documents?.active??panes(layout)[0].id);
  const [docks,setDocks]=useState<Docks>(()=>prefs.docks??defaultDocks());
  const enabledModule=(module:ModuleId)=>moduleEnabled(module,prefs);
  const left=!docks.left.collapsed&&docks.left.groups.some(g=>g.tabs.some(enabledModule)),right=!docks.right.collapsed&&docks.right.groups.some(g=>g.tabs.some(enabledModule));
  const [modal,setModal]=useState<'settings'|'icon'|'migration'|'workspaces'|null>(null);
  const [settingsPage,setSettingsPage]=useState('general');
  const [iconKey,setIconKey]=useState(''),[customIcon,setCustomIcon]=useState('');
  const [pulse,setPulse]=useState(0),[tabMenu,setTabMenu]=useState<MenuState|null>(null);
  const dismissTabMenu=useCallback(()=>setTabMenu(null),[]);
  useEffect(()=>{
    const drop=(event:Event)=>{
      const d=(event as CustomEvent<CardDrop>).detail,card=snapshot.cards.find(c=>c.id===d.id);
      if(!card||!snapshot.boards.some(b=>b.folder===d.folder))return;
      const run=(mode:'move'|'reference')=>attempt(session.placeCard(d.id,d.folder,d.x,d.y,mode,d.source));
      if(!snapshot.boards.some(b=>b.folder&&b.folder===parent(card.path)))run('move');
      else setTabMenu({x:d.screenX,y:d.screenY,actions:[{label:ui.views.moveCard,icon:'folder',run:()=>run('move')},{label:ui.views.addReference,icon:'link',run:()=>run('reference')}]});
    };
    window.addEventListener('door:card-drop',drop);return()=>window.removeEventListener('door:card-drop',drop);
  },[snapshot]);

  const memories=useRef(new Map<string,ViewMemory>(Object.entries(prefs.documents?.views??{}))),starredTarget=useRef<HTMLDivElement>(null);
  const seenMoves=useRef(snapshot.pathMoves?.length??0);
  useLayoutEffect(()=>{
    const moves=snapshot.pathMoves?.slice(seenMoves.current)??[];seenMoves.current=snapshot.pathMoves?.length??0;
    if(!moves.length)return;
    setLayout(current=>{
      let next=current;
      for(const {from,to} of moves)for(const group of panes(next))next=updatePane(next,group.id,p=>mapPaneDocuments(p,k=>remapKey(k,from,to)));
      return next;
    });
    for(const {from,to} of moves)memories.current=new Map([...memories.current].map(([key,value])=>{const at=key.indexOf(':');return [key.slice(0,at+1)+remapKey(key.slice(at+1),from,to),value];}));
  },[snapshot.pathMoves]);
  const active=panes(layout).find(p=>p.id===activeId)??panes(layout)[0];
  const rootCards=snapshot.cards.filter(c=>!parent(c.path));
  useEffect(()=>{
    if(!modal)return;
    const dialog=document.querySelector<HTMLElement>('[role=dialog]')!,previous=document.activeElement;
    (dialog.querySelector<HTMLElement>('[autofocus]')??dialog.querySelector<HTMLElement>('input,button'))?.focus();
    return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[modal]);
  const documentState=useRef<()=>DocumentsLayout>(()=>({tree:layout,active:active.id,views:{},formatting:[]}));
  documentState.current=()=>{
    const keys=new Set(panes(layout).flatMap(p=>p.tabs.flatMap(key=>tabHistory(p,key).entries.map(doc=>p.id+':'+doc))));
    return {tree:layout,active:active.id,views:Object.fromEntries([...memories.current].filter(([key])=>keys.has(key)).slice(-3200)),formatting:[]};
  };
  const rememberViews=useCallback(()=>session.schedulePreferences({documents:documentState.current()},snapshot.root),[snapshot.root]);
  useEffect(()=>{rememberViews();},[layout,activeId,rememberViews]);
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
      if(!destination||source.group!==target.group&&destination.tabs.length>=MAX_TABS)return;
      attempt((async()=>{
        const sourcePane=panes(layout).find(p=>p.id===source.group)!;const documentKey=tabDocument(sourcePane,source.key);const info=documentInfo(documentKey,snapshot);await session.select(info.kind==='card'?info.path:null);
        const memory=memories.current.get(source.group+':'+documentKey);
        if(memory&&!destination.tabs.includes(source.key))memories.current.set(target.group+':'+documentKey,{...memory});
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
      if(target&&!target.tabs.some(tab=>tabDocument(target,tab)===key)&&target.tabs.length>=MAX_TABS){session.update({error:ui.errors.tabLimit});return;}
      const info=documentInfo(key,session.state.snapshot!);
      if(!info.exists){session.update({error:ui.errors.fileMissing});return;}
      await session.select(info.kind==='card'?info.path:null);
      setLayout(current=>openTab(current,id,key));setActiveId(id);setPulse(v=>v+1);
      changePrefs(p=>({recent:[key,...p.recent.filter(k=>k!==key)].slice(0,30)}));
    })());
  },[activeId,changePrefs,layout]);
  function focusPane(p:Pane){
    setActiveId(p.id);
    const current=p.active?documentInfo(tabDocument(p),snapshot):null;
    if(current?.kind==='card'){if(state.draft?.card.path!==current.path)attempt(session.select(current.path));}
    else if(p.id!==activeId)attempt(session.select(null));
  }
  function close(p:Pane,key:string){
    attempt((async()=>{await session.select(null);const next=closeTab(layout,p.id,key);setLayout(next);setActiveId(p.id);
      const nextPane=panes(next).find(item=>item.id===p.id);const selected=nextPane&&tabDocument(nextPane);if(selected){const info=documentInfo(selected,snapshot);if(info.kind==='card')await session.select(info.path);}
    })());
  }
  function split(p:Pane,axis:'row'|'column'){
    if(panes(layout).length>=MAX_PANES)return;
    document.querySelectorAll('details.pane-menu[open]').forEach(el=>el.removeAttribute('open'));
    const next=pane(tabDocument(p));setLayout(current=>splitPane(current,p.id,axis,next));setActiveId(next.id);
  }
  function createFolder(folder:string,position?:{x:number;y:number},paneId=activeId){
    // Toolbar and Explorer creation use the visible parent canvas when available.
    const visible=panes(layout).find(p=>p.id===paneId&&tabDocument(p)==='board:'+folder);
    const canvas=visible&&[...document.querySelectorAll<HTMLElement>('.note-pane')].find(el=>el.dataset.pane===paneId)?.querySelector('.canvas');
    if(!position&&canvas){const r=canvas.getBoundingClientRect(),camera=memories.current.get(paneId+':board:'+folder)?.camera??{x:20,y:20,zoom:.85};position={x:(r.width/2-camera.x)/camera.zoom-160,y:(r.height/2-camera.y)/camera.zoom-80};}
    const placement=position;
    attempt(session.run(async()=>{
      await session.flush();
      const result=await window.door.request<Mutation>({kind:'createFolder',parent:folder,position:placement});
      session.undoHistory.record(ui.history.createWhiteboard,result.edits);session.update({snapshot:result.snapshot,error:''});
      if(!placement){const created=result.snapshot.boards.find(b=>result.edits.some(e=>e.path===b.path&&e.before===null));if(created)open('board:'+created.folder,paneId);}
    }));
  }
  function createCard(folder:string,x?:number,y?:number,paneId=activeId){
    attempt((async()=>{await session.create(folder||prefs.cardFolder||DEFAULT_CARD_FOLDER,prefs.stem,x??80,y??80,!!folder&&x!==undefined&&y!==undefined);const card=session.state.draft?.card;
      if(card){const p=panes(layout).find(p=>p.id===paneId);if(x===undefined||y===undefined||(!p||tabDocument(p)!=='board:'+folder))open('card:'+card.id,paneId);}
    })());
  }
  function star(key:string){changePrefs(p=>({starred:p.starred.includes(key)?p.starred.filter(k=>k!==key):[...p.starred,key]}));}
  function docIcon(key:string){const info=documentInfo(key,snapshot);return <DocumentIcon value={prefs.icons[key]} fallback={info.icon}/>;}
  function editIcon(key:string){setIconKey(key);setCustomIcon(prefs.icons[key]??'');setModal('icon');}
  async function navigate(key:string,id:string,mode:NavigationMode='same'){
    try{
      const info=documentInfo(key,session.state.snapshot!);
      if(!info.exists)throw new Error(ui.errors.fileMissing);
      const next=navigateTab(layout,id,key,mode,prefs.newSplitDirection);
      await session.run(()=>session.flush());
      await session.select(info.kind==='card'?info.path:null);
      setLayout(next.tree);setActiveId(next.active);setPulse(v=>v+1);
      changePrefs(p=>({recent:[key,...p.recent.filter(k=>k!==key)].slice(0,30)}));
      return true;
    }catch(error){session.update({error:String(error)});return false;}
  }
  function openBeside(key:string){navigate(key,activeId,'other');}
  function showOnBoard(key:string){
    attempt(session.run(async()=>{
      const target=cardPlacement(session.state.snapshot!,key.slice(5));
      if(!target){open(key);return;}
      const boardKey='board:'+target.board.folder;
      const next=navigateTab(layout,activeId,boardKey,'new',prefs.newSplitDirection);
      await session.flush();session.update({draft:null});
      setLayout(next.tree);setActiveId(next.active);
      setReveal({pane:next.active,path:target.board.path,placement:target.placement.id,token:Date.now()});
      changePrefs(p=>({recent:[boardKey,...p.recent.filter(k=>k!==boardKey)].slice(0,30)}));
    }));
  }
  async function previewCard(key:string,id=activeId){
    const info=documentInfo(key,session.state.snapshot!);if(info.kind!=='card'){if(await navigate(key,id))setPopup(undefined);return;}
    const previousCard=popup?popup.previousCard:session.state.draft?.card.id;
    setPopup({key,pane:id,previousCard});
    try{await session.select(info.path);}catch{/* Session retains the unsaved draft and reports the error. */}
  }
  async function closePopup(){
    const previous=snapshot.cards.find(c=>c.id===popup?.previousCard);
    await session.run(()=>session.flush());await session.select(previous?.path??null);setPopup(undefined);
  }
  async function transferPopup(key:string,mode:NavigationMode){if(await navigate(key,popup!.pane,mode))setPopup(undefined);else throw new Error(session.state.error);}
  function travel(p:Pane,offset:-1|1){attempt((async()=>{const next=travelTab(layout,p.id,offset),key=tabDocument(panes(next).find(group=>group.id===p.id)!);const info=documentInfo(key,session.state.snapshot!);if(!info.exists){session.update({error:ui.errors.fileMissing});return;}await session.select(info.kind==='card'?info.path:null);setLayout(next);setActiveId(p.id);})());}
  function selectTab(p:Pane,key:string){attempt((async()=>{const info=documentInfo(tabDocument(p,key),session.state.snapshot!);await session.select(info.kind==='card'&&info.exists?info.path:null);setLayout(current=>updatePane(current,p.id,g=>({...g,active:key})));setActiveId(p.id);})());}
  function renderPane(original:Pane):ReactNode {
    const p=tabs.drag?.family==='main'&&tabs.drag.group===original.id?{...original,active:activeAfterRemoval(original.tabs,original.active,tabs.drag.key)}:original;
    const showTabMenu=(key:string,x:number,y:number)=>setTabMenu({label:ui.layout.viewTabActions,x,y,actions:[{label:ui.common.openInAnotherTabGroup,icon:'splitRight',run:()=>{void navigate(tabDocument(p,key),p.id,'other');}},{label:ui.common.closeViewTab,icon:'close',run:()=>close(p,key)}]});
    const documentKey=tabDocument(p),history=tabHistory(p);
    const info=p.active?documentInfo(documentKey,snapshot):null;
    const focused=p.id===active.id;
    const memoryKey=p.id+':'+documentKey;
    let memory=memories.current.get(memoryKey);if(!memory){memory={};memories.current.set(memoryKey,memory);}
    const board=info?.kind==='board'?snapshot.boards.find(b=>b.folder===info.id):undefined;
    const tag=info?.kind==='tag'?snapshot.tags?.find(t=>t.path===info.id):undefined;
    return <section className={'note-pane '+(focused?'active-pane':'')} style={{'--document-fill':info?.kind==='card'?tintColor(cardFill(snapshot.cards.find(c=>c.id===info.id))):undefined} as CSSProperties} data-pane={p.id} data-active={focused&&!popup} aria-label={ui.layout.mainDockTabGroup} onPointerDownCapture={e=>{if(!focused&&!(e.target as HTMLElement).closest('[data-tab-strip]'))focusPane(p);}}>
      <div className="tab-strip">
        <div className="tab-list" role="tablist" aria-label={ui.layout.openFiles} data-tab-strip data-tab-family="main" data-tab-group={p.id}>
          {p.tabs.map(key=>{const info=documentInfo(tabDocument(p,key),snapshot);return <div className={'tab '+(p.active===key?'active-tab':'')} key={key} data-tab-key={key} onContextMenu={e=>{e.preventDefault();showTabMenu(key,e.clientX,e.clientY);}} onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();showTabMenu(key,r.left,r.bottom);}}}>
            <button role="tab" onPointerDown={e=>tabs.begin(e,{family:'main',group:p.id,key})} aria-selected={p.active===key} data-tooltip={info.path||info.title} onClick={()=>selectTab(p,key)}>{docIcon(tabDocument(p,key))}<span>{info.title}</span></button>
            <Tool icon="close" label={tooltips.tabs.close(info.title)} onClick={()=>close(p,key)}/>
          </div>;})}
        </div>
        <details className="menu pane-menu"><summary data-tooltip={tooltips.layout.tabGroupActions} aria-label={ui.layout.tabGroupActions}><Icon name="down" size={12}/></summary><div className="menu-content">
          <button data-tooltip={tooltips.layout.splitRight} disabled={panes(layout).length>=MAX_PANES} onClick={()=>split(p,'row')}><Icon name="splitRight"/>{ui.layout.splitRight}</button>
          <button data-tooltip={tooltips.layout.splitDown} disabled={panes(layout).length>=MAX_PANES} onClick={()=>split(p,'column')}><Icon name="splitDown"/>{ui.layout.splitDown}</button>
          <button data-tooltip={tooltips.layout.closeTabGroup} disabled={panes(layout).length===1} onClick={()=>attempt((async()=>{await session.select(null);const next=removePane(layout,p.id);if(next){setLayout(next);setActiveId(panes(next)[0].id);}})())}><Icon name="close"/>{ui.layout.closeTabGroup}</button>
        </div></details>
      </div>
      {info&&<div className="document-toolbar">
        <Breadcrumbs key={documentKey} documentKey={documentKey} snapshot={snapshot} onNavigate={(key,mode)=>navigate(key,p.id,mode)} onIcon={()=>editIcon(documentKey)} onRename={async(key,name)=>{const info=documentInfo(key,session.state.snapshot!);if(info.kind==='card')await session.renameCard(info.id,name);else await session.renameBoard(info.id,name);}}/>
        <div className="tab-navigation"><Tool icon="back" label={tooltips.navigation.back} disabled={history.index===0} onClick={()=>travel(p,-1)}/><Tool icon="forward" label={tooltips.navigation.forward} disabled={history.index>=history.entries.length-1} onClick={()=>travel(p,1)}/></div>
        <div className="toolbar-spacer"/>
        {info.kind==='board'&&<><Tool icon="folder" label={tooltips.common.newWhiteboard} onClick={()=>createFolder(info.id,undefined,p.id)}/>{!!info.id&&<Tool icon="plus" label={tooltips.common.newCard} onClick={()=>createCard(info.id,80,80,p.id)}/>}</>}
        {info.kind==='card'&&<Tool icon="more" label={tooltips.whiteboard.cardActions} onClick={e=>{const anchor=e.currentTarget,r=anchor.getBoundingClientRect();setTabMenu({anchor,x:r.left,y:r.bottom,actions:[{label:ui.editorTools.sourceMode,icon:'source',checked:!!memory.source,checkType:'checkbox',run:()=>{memory.source=!memory.source;rememberViews();setTabMenu(null);if(!focused)focusPane(p);}},{label:ui.common.openInPopup,icon:'note',run:()=>{void previewCard(documentKey,p.id);}},{label:ui.common.openInNewTab,icon:'external',run:()=>{void navigate(documentKey,p.id,'new');}},{label:ui.common.openInAnotherTabGroup,icon:'splitRight',run:()=>{void navigate(documentKey,p.id,'other');}}]});}}/>}
        <Tool icon="star" className={prefs.starred.includes(documentKey)?'is-starred':''} label={prefs.starred.includes(documentKey)?tooltips.common.removeFromStarred:tooltips.common.addToStarred} onClick={()=>star(documentKey)}/>

      </div>}
      <div className="document-content"><ViewBlockProvider snapshot={snapshot} session={session} onOpen={key=>navigate(key,p.id)} onPreview={key=>previewCard(key,p.id)} onNavigate={(key,mode)=>navigate(key,p.id,mode)}>
        {!info?(tabs.drag?.family==='main'&&tabs.drag.group===p.id?<div className="empty-pane" aria-label={ui.layout.emptyTabGroup}/>:<div className="empty-pane"><button data-tooltip={tooltips.whiteboard.openRoot} onClick={()=>open('board:',p.id)}><Icon name="map"/>{ui.whiteboard.openWhiteboard}</button></div>):
          !info.exists?<p className="notice">{info.kind==='system'?ui.system.disabled:ui.errors.fileMissing}</p>:
          info.kind==='system'?<SystemView key={documentKey} id={info.id as SystemEntry} snapshot={snapshot} session={session} onOpen={key=>open(key,p.id)} onPreview={key=>previewCard(key,p.id)} onTemplate={path=>{setTemplatePath(path);setTemplateOpen(true);}}/>:
          board?<BoardView key={documentKey} reveal={reveal?.pane===p.id&&reveal.path===board.path?reveal:undefined} onRevealed={()=>setReveal(undefined)} board={board} onSelection={setBoardSelection} onStyle={()=>changeDocks(revealModule(docks,'style'))} snapshot={snapshot} session={session} active={focused&&!popup} memory={memory} onActivate={()=>setActiveId(p.id)} onOpen={key=>open(key,p.id)} onPreview={key=>previewCard(key,p.id)} onNavigate={(key,mode)=>navigate(key,p.id,mode)} onCreate={(x,y)=>info.id?createCard(info.id,x,y,p.id):createFolder('',{x,y},p.id)} onCreateBoard={(x,y)=>createFolder(info.id,{x,y},p.id)} onMigrate={()=>setModal('migration')} onViewChange={rememberViews} onCycleInput={()=>changePrefs(p=>({whiteboardInput:({auto:'mouse',mouse:'trackpad',trackpad:'auto'} as const)[p.whiteboardInput??'auto']}))}/>:
          tag&&!featureEnabled(prefs,'tags')?<FileView key={documentKey} path={info.path} snapshot={snapshot} memory={memory} onViewChange={rememberViews}/>:tag?<TagView key={documentKey} onPreview={key=>previewCard(key,p.id)} tag={tag} snapshot={snapshot} session={session} onOpen={key=>open(key,p.id)} memory={memory} onViewChange={rememberViews}/>:
          info.kind==='file'?<FileView key={documentKey} path={info.path} snapshot={snapshot} memory={memory} onViewChange={rememberViews}/>:<NoteView suspended={!!popup} key={documentKey} path={info.path} session={session} snapshot={snapshot} active={focused&&!popup} memory={memory} onActivate={()=>{setActiveId(p.id);attempt(session.select(info.path));}} onOpen={key=>navigate(key,p.id)} onViewChange={rememberViews}/>}
      </ViewBlockProvider></div>
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
  const [templateOpen,setTemplateOpen]=useState(false),[templatePath,setTemplatePath]=useState<string>();
  function renderModule(module:typeof MODULE_IDS[number]):ReactNode {
    if(module==='calendar')return <CalendarView snapshot={snapshot} session={session} onOpen={open}/>;
    if(module==='style'){
      const board=snapshot.boards.find(b=>'board:'+b.folder===tabDocument(active)),card=snapshot.cards.find(c=>'card:'+c.id===tabDocument(active));
      return <StyleView board={board} card={card} cardInfos={snapshot.cards} palette={prefs.palette} selection={boardSelection?.path===board?.path?boardSelection:undefined} session={session} onPalette={palette=>session.run(async()=>{
        await session.flushPreferences();const snapshot=await window.door.request<Snapshot>({kind:'preferences',patch:{palette}});session.update({snapshot});
      })}/>;
    }
    if(module==='history')return <><div className="module-toolbar"><div className="toolbar-spacer"/><Tool icon="plus" label={tooltips.history.saveCheckpoint} disabled={!snapshot.historyAvailable} onClick={()=>attempt(session.checkpoint())}/></div><HistoryPanel session={session}/></>;
    if(module==='search')return <SearchView session={session} snapshot={snapshot} onReveal={showOnBoard} onOpen={open} onSplit={openBeside}/>;
    if(module==='agent')return <div className="agent-empty">{ui.agent.disconnected}</div>;
    return <Explorer key={module} module={module} starredTarget={starredTarget} snapshot={snapshot} prefs={prefs} activeKey={tabDocument(active)} session={session} onOpen={open} onSplit={openBeside} onFolder={createFolder} onCard={createCard} onIcon={editIcon} onPrefs={changePrefs} onSettings={page=>{setSettingsPage(page);setModal('settings');}}/>;
  }
  return <DateDisplayContext value={{display:prefs.dateDisplay??DEFAULT_DATE_DISPLAY,onChange:dateDisplay=>session.run(async()=>{await session.flushPreferences();session.update({snapshot:await window.door.request<Snapshot>({kind:'preferences',patch:{dateDisplay}})});})}}><div className={'app platform-'+window.door.platform+(tabs.drag?' docking':'')} data-left-open={left} inert={state.status===ui.status.openingWorkspace||state.status===ui.status.changingHistory} style={{'--card-title-placeholder':JSON.stringify(prefs.titlePlaceholder??DEFAULT_TITLE_PLACEHOLDER),'--sidebar-width':docks.left.width+'px','--dock-width':docks.right.width+'px'} as CSSProperties}>
    <header className="window-toolbar">
      <div className="traffic-light-space"/>
      <Tool icon="left" label={left?tooltips.layout.collapseLeftSideDock:tooltips.layout.expandLeftSideDock} aria-expanded={left} onClick={()=>changeDocks({...docks,left:{...docks.left,collapsed:left}})}/>
      <WorkspaceMenu snapshot={snapshot} session={session} onManage={()=>setModal('workspaces')}/>
      <div className="window-drag-space"/>
      {featureEnabled(prefs,'templates')&&<Tool icon="copy" label={ui.journal.newFromTemplate} onClick={()=>{setTemplatePath(undefined);setTemplateOpen(true);}}/>}
      <Tool icon="search" label={tooltips.workspace.search} onClick={()=>setSearchOpen(true)}/>
      <Tool icon="right" label={right?tooltips.layout.collapseRightSideDock:tooltips.layout.expandRightSideDock} aria-expanded={right} onClick={()=>changeDocks({...docks,right:{...docks.right,collapsed:right}})}/>
      <div className="windows-controls-space"/>
    </header>
    <div className={"workspace-body "+(!left?"no-sidebar":"")}>
      <nav className="activity-bar" aria-label={ui.layout.actionRibbon}>
        {MODULE_IDS.filter(enabledModule).map(module=>{const placed=docks.closed?.[module]?null:findModule(docks,module),selected=!!placed&&!docks[placed.side].collapsed&&placed.group.active===module;return <Tool key={module} icon={modules[module].icon} label={modules[module].title} aria-pressed={selected} className={selected?'selected':''} onClick={()=>changeDocks(revealModule(docks,module))}/>;})}
        <div className="toolbar-spacer"/><Tool icon="settings" label={tooltips.settings.open} onClick={()=>setModal('settings')}/>
      </nav>
      <SideDock side="left" docks={docks} drag={tabs.drag} onTabDrag={tabs.begin} onChange={changeDocks} onPreview={setDocks} renderModule={renderModule} enabled={enabledModule}/>
      {left&&<Divider value={docks.left.width} label={ui.layout.resizeLeftSideDock} onChange={value=>changeDocks({...docks,left:{...docks.left,width:Math.max(180,Math.min(520,value))}})}/>}
      <main className="workspace" aria-label={ui.layout.mainDock}>{renderLayout(layout)}</main>
      {right&&<Divider value={-docks.right.width} label={ui.layout.resizeRightSideDock} onChange={value=>changeDocks({...docks,right:{...docks.right,width:Math.max(180,Math.min(520,-value))}})}/>}
      <SideDock side="right" docks={docks} drag={tabs.drag} onTabDrag={tabs.begin} onChange={changeDocks} onPreview={setDocks} renderModule={renderModule} enabled={enabledModule}/>
    </div>
    <footer className="statusbar">
      <div className="toolbar-spacer"/>
      <span data-tooltip={tooltips.status.syncOff}><Icon name="sync" size={13}/>{ui.status.syncOff}</span>
      <span role="status" data-tooltip={state.error||state.status}>{state.status===ui.status.savedLocally?ui.status.saved:state.status}</span>
    </footer>
    {popup&&<CardPopup documentKey={popup.key} snapshot={snapshot} session={session} onClose={closePopup} onNavigate={transferPopup} onPreview={key=>previewCard(key,popup.pane)}/>}
    {templateOpen&&featureEnabled(prefs,'templates')&&<TemplateDialog initialTemplate={templatePath} snapshot={snapshot} session={session} onOpen={open} onClose={()=>setTemplateOpen(false)}/>}
    {searchOpen&&<SearchDialog session={session} snapshot={snapshot} onReveal={showOnBoard} onOpen={open} onSplit={openBeside} onClose={()=>setSearchOpen(false)}/>}
    {tabMenu&&<ActionMenu menu={tabMenu} onClose={dismissTabMenu}/>}
    {(state.error||snapshot.issues.length>0)&&<div className="error-banner" role="alert"><span>{state.error||snapshot.issues[0]}</span>{state.draft?.dirty&&<><button data-tooltip={tooltips.recovery.copyDraft} onClick={()=>attempt(session.copyDraft())}>{ui.common.copyDraft}</button><button data-tooltip={tooltips.recovery.reloadFromDisk} onClick={()=>{void confirm({title:ui.common.reloadFromDisk,message:ui.recovery.confirmDiscard,accept:ui.common.reloadFromDisk,danger:true}).then(ok=>{if(ok)attempt(session.reloadDraft());});}}>{ui.common.reloadFromDisk}</button></>}<Tool icon="close" label={tooltips.recovery.dismissError} onClick={()=>session.update({error:''})}/></div>}
    {modal&&<div className="modal-shade" onPointerDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><section className={"settings "+(modal==='settings'?'settings-window':'')} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setModal(null);}if(e.key==='Tab'){const items=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}} role="dialog" aria-modal="true" aria-label={modal==='workspaces'?ui.workspace.manage:modal==='settings'?ui.settings.title:modal==='icon'?ui.icons.changeIcon:ui.migration.title}>
      <div className="panel-title"><strong>{modal==='workspaces'?ui.workspace.manage:modal==='settings'?ui.settings.title:modal==='icon'?ui.icons.changeIcon:ui.migration.title}</strong><Tool icon="close" label={tooltips.common.closeDialog} onClick={()=>setModal(null)}/></div>
      {modal==='workspaces'?<WorkspaceManager snapshot={snapshot} session={session}/>:modal==='settings'?<SettingsPanel initialPage={settingsPage} snapshot={snapshot} prefs={prefs} onCreateFolder={path=>session.run(async()=>{await session.flushPreferences();const snapshot=await session.bridge.request<Snapshot>({kind:'ensureFolder',path});session.update({snapshot,error:''});})} onCreateTemplate={period=>session.createTemplate(period)} onChange={patch=>changePrefs(()=>patch)} onResetDocks={()=>changeDocks(defaultDocks())} rootCards={rootCards.length} onMigrate={()=>setModal('migration')}/>:
      modal==='icon'?<form className="settings-body" onSubmit={e=>{e.preventDefault();changePrefs(p=>({icons:{...p.icons,[iconKey]:customIcon}}));setModal(null);}}>
        <div className="icon-selection"><DocumentIcon value={customIcon} fallback={documentInfo(iconKey,snapshot).icon}/><span>{customIcon?ui.icons.selectedIcon:ui.icons.defaultIcon}</span></div>
        <Suspense fallback={<small>{ui.icons.loading}</small>}><IconPicker onSelect={setCustomIcon}/></Suspense><div className="dialog-actions"><button type="button" data-tooltip={tooltips.icons.restoreDefault} onClick={()=>setCustomIcon('')}>{ui.common.default}</button><button className="primary" data-tooltip={tooltips.icons.save}>{ui.common.save}</button></div>
      </form>:<div className="settings-body"><p>{ui.migration.description(rootCards.length)}</p><p>{ui.migration.preservedData}</p><button className="primary" data-tooltip={tooltips.migration.moveCards} onClick={()=>attempt(session.run(async()=>{await session.flush();const result=await window.door.request<Snapshot>({kind:'migrateRoot'});session.undoHistory.clear();session.update({snapshot:result,draft:null,error:''});setModal(null);}))}>{ui.migration.moveCards}</button></div>}
    </section></div>}
  </div></DateDisplayContext>;
}
function SplitDivider({node,onResize}:{node:Extract<Layout,{type:'split'}>;onResize:(ratio:number)=>void}) {
  const drag=useRef<{start:number;ratio:number;size:number}|null>(null);
  return <div className={'divider '+node.axis} role="separator" tabIndex={0} aria-label={ui.layout.resizeTabGroups} aria-orientation={node.axis==='row'?'vertical':'horizontal'} aria-valuenow={Math.round(node.ratio*100)}
    onPointerDown={e=>{const rect=e.currentTarget.parentElement!.getBoundingClientRect();drag.current={start:node.axis==='row'?e.clientX:e.clientY,ratio:node.ratio,size:node.axis==='row'?rect.width:rect.height};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
    onPointerMove={e=>{if(drag.current)onResize(drag.current.ratio+((node.axis==='row'?e.clientX:e.clientY)-drag.current.start)/drag.current.size);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();onResize(node.ratio+(['ArrowLeft','ArrowUp'].includes(e.key)?-.05:.05));}}}/>;
}
