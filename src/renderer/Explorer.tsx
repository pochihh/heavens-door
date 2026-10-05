import {systemEntries,navigationOrder} from '../features';
import {NewTag} from './TagView';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from 'react';
import type { FileEntry, Preferences, Snapshot } from '../shared';
import type { Session } from './session';
import { DocumentIcon, Icon, Tool } from './Icons';
import { ActionMenu, type MenuAction, type MenuState } from './Overlays';
import { documentInfo, documentIndex, fileIcon, parent, portable } from './documents';
import { insertBookmark, useBookmarkDrag } from './sortable';

export type ExplorerModule='whiteboards'|'files'|'bookmarks'|'tags';
type Entry={path:string;key?:string;folder?:string;name:string;symlink?:boolean};
export function Explorer({snapshot,prefs,activeKey,module,starredTarget,session,onOpen,onSplit,onFolder,onCard,onIcon,onPrefs}:{
  snapshot:Snapshot;prefs:Preferences;activeKey:string;module:ExplorerModule;starredTarget:RefObject<HTMLDivElement|null>;session:Session;
  onOpen:(key:string)=>void;onSplit:(key:string)=>void;onFolder:(folder:string)=>void;onCard:(folder:string)=>void;onIcon:(key:string)=>void;onPrefs:(change:(prefs:Preferences)=>Partial<Preferences>)=>void;
}) {
  const expanded=useMemo(()=>new Set(prefs.navigation?.[module]?.expanded??['']),[prefs.navigation,module]);
  const setExpanded=(change:(current:Set<string>)=>Set<string>)=>onPrefs(p=>({navigation:{...p.navigation,[module]:{...p.navigation?.[module],expanded:[...change(new Set(p.navigation?.[module]?.expanded??['']))]}}}));
  const [files,setFiles]=useState<Record<string,FileEntry[]>>({});
  const [menu,setMenu]=useState<MenuState|null>(null);
  const starred=starredTarget,scroller=useRef<HTMLDivElement>(null),boardsTarget=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(scroller.current)scroller.current.scrollTop=prefs.navigation?.[module]?.scroll??0;},[module]);
  const closeMenu=useCallback(()=>setMenu(null),[]);
  const attempt=(promise:Promise<unknown>)=>{void promise.catch(error=>session.update({error:String(error)}));};
  const report=useCallback((error:unknown)=>session.update({error:String(error)}),[session]);
  const fileLoad=useRef(0);
  const refresh=useCallback(async()=>{
    const version=++fileLoad.current,paths=[...expanded];
    const results=await Promise.allSettled(paths.map(path=>window.door.request<FileEntry[]>({kind:'listFiles',path})));
    if(version!==fileLoad.current)return;
    const entries:Record<string,FileEntry[]>={},failed=new Set<string>();
    results.forEach((result,i)=>{if(result.status==='fulfilled')entries[paths[i]]=result.value;else{failed.add(paths[i]);report(result.reason);}});
    setFiles(entries);
    if([...failed].some(path=>path))setExpanded(current=>new Set([...current].filter(path=>!path||!failed.has(path))));
  },[expanded,report]);
  useEffect(()=>{
    if(module!=='files')return;
    // Only expanded directories are read. A collapsed asset tree has no enumeration cost.
    void refresh();return()=>{fileLoad.current++;};
  },[module,snapshot,refresh]);
  const tree=useMemo(()=>{
    const groups=new Map(snapshot.boards.map(b=>[portable(b.folder),{folders:[] as string[]} ]));
    for(const board of snapshot.boards)if(board.folder){let ancestor=parent(board.folder);while(ancestor&&!groups.has(ancestor))ancestor=parent(ancestor);groups.get(ancestor)?.folders.push(board.folder);}
    for(const group of groups.values())group.folders.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    return groups;
  },[snapshot.boards]);
  const systems=systemEntries(prefs).map(f=>'system:'+f.id),rootGroup='boards:',savedOrder=prefs.boardNavigation?.order??{};
  const boardGroups=new Map([...tree].map(([folder,group])=>['boards:'+folder,group.folders.map(path=>'board:'+portable(path))]));
  const pinned=(savedOrder[rootGroup]??[]).filter(key=>systems.includes(key));
  boardGroups.set(rootGroup,[...(boardGroups.get(rootGroup)??[]),...pinned]);boardGroups.set('system',systems.filter(key=>!pinned.includes(key)));
  const groupKeys=(group:string)=>navigationOrder(boardGroups.get(group)??[],savedOrder[group]);
  const allowed=(key:string,group:string)=>key.startsWith('system:')?group===rootGroup||group==='system':(boardGroups.get(group)??[]).includes(key);
  function reorder(key:string,index:number|null,group?:string){
    if(index===null||group===undefined||!allowed(key,group))return;
    onPrefs(p=>{const order={...p.boardNavigation?.order};for(const [id,keys] of boardGroups)order[id]=[...navigationOrder(keys,order[id]),...(order[id]??[]).filter(k=>k.startsWith('system:')&&!systems.includes(k))].filter(k=>k!==key);order[group]=insertBookmark(order[group]??[],key,index,false);return {boardNavigation:{...p.boardNavigation,order}};});
  }
  const boardDrag=useBookmarkDrag(boardsTarget,(key,index,_,group)=>reorder(key,index,group),'vertical',true,undefined,allowed);
  const toggle=(folder:string)=>setExpanded(current=>{const next=new Set(current);if(next.has(folder))next.delete(folder);else next.add(folder);return next;});
  const star=(key:string)=>onPrefs(p=>({starred:p.starred.includes(key)?p.starred.filter(k=>k!==key):[...p.starred,key]}));
  const drag=useBookmarkDrag(starred,(key,index,source)=>onPrefs(p=>{const next=insertBookmark(p.starred,key,index,source);return next.length===p.starred.length&&next.every((k,i)=>k===p.starred[i])?{}:{starred:next};}));
  const entryFor=(key:string):Entry=>{const d=documentInfo(key,snapshot);return {key,path:d.path,name:d.title,folder:d.kind==='board'?d.id:undefined};};
  const creations=(folder:string):MenuAction[]=>{
    const internal=portable(folder).split('/').some(part=>part.startsWith('.')||part==='node_modules');
    return [
      {label:ui.common.newWhiteboard,icon:'map',disabled:internal,hint:internal?tooltips.explorer.internalFolder:undefined,run:()=>onFolder(folder)},
      {label:ui.common.newCard,icon:'note',disabled:internal,hint:internal?tooltips.explorer.internalFolder:undefined,run:()=>onCard(folder)},
    ];
  };
  function actions(entry:Entry):MenuAction[] {
    const key=entry.key,index=key?prefs.starred.indexOf(key):-1;
    return [
      ...(entry.folder!==undefined?creations(entry.folder):[]),
      ...(module==='whiteboards'&&key?.startsWith('system:')?[{label:pinned.includes(key)?ui.system.moveToSystem:ui.system.moveToBoards,icon:'map' as const,run:()=>reorder(key,groupKeys(pinned.includes(key)?'system':rootGroup).length,pinned.includes(key)?'system':rootGroup)}]:[]),
      ...(key&&!entry.symlink?[
        {label:ui.explorer.open,icon:'file' as const,run:()=>onOpen(key)},
        {label:ui.common.openInNewTab,icon:'external' as const,run:()=>onOpen(key)},
        {label:ui.common.openInAnotherTabGroup,icon:'splitRight' as const,run:()=>onSplit(key)},
        {label:index>=0?ui.explorer.removeFromStarred:ui.explorer.addToStarred,icon:'star' as const,danger:index>=0,run:()=>star(key)},
        {label:ui.explorer.changeIcon,icon:'art' as const,run:()=>onIcon(key)},
        ...(index>=0?[
          {label:ui.explorer.moveUpInStarred,icon:'up' as const,disabled:index===0,run:()=>onPrefs(p=>({starred:insertBookmark(p.starred,key,p.starred.indexOf(key)-1,true)}))},
          {label:ui.explorer.moveDownInStarred,icon:'arrowDown' as const,disabled:index===prefs.starred.length-1,run:()=>onPrefs(p=>({starred:insertBookmark(p.starred,key,p.starred.indexOf(key)+1,true)}))},
        ]:[]),
        ...(entry.folder===undefined&&module==='files'?[{label:ui.explorer.viewSource,icon:'source' as const,run:()=>onOpen('file:'+entry.path)}]:[]),
      ]:[]),
      {label:ui.explorer.copyRelativePath,icon:'copy',run:()=>attempt(navigator.clipboard.writeText(entry.path||'.'))},
      {label:window.door.platform==='darwin'?ui.explorer.revealInFinder:ui.explorer.revealInFileManager,icon:'reveal',disabled:entry.symlink,run:()=>attempt(window.door.revealFile(entry.path))},
    ];
  }
  function viewActions():MenuAction[] {
    return [
      ...(module==='whiteboards'?creations(''):[]),
      {label:ui.explorer.refreshExplorer,icon:'sync',run:()=>attempt(module==='files'?refresh():session.refresh())},
      ...(module==='whiteboards'||module==='files'?[{label:ui.explorer.collapseFolders,icon:'collapse' as const,run:()=>setExpanded(()=>new Set(['']))}]:[]),
    ];
  }
  function show(actions:MenuAction[],event:{clientX?:number;clientY?:number;currentTarget:EventTarget|null},context=false) {
    const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({x:context?event.clientX!:rect.left,y:context?event.clientY!:rect.bottom+3,actions});
  }
  function row(entry:Entry,depth=0,saved?:'starred'|'recent',physical=false,branch=false):ReactNode {
    const key=entry.key,folder=entry.folder,expandedHere=folder!==undefined&&expanded.has(folder);
    const info=key?documentInfo(key,snapshot):null,icon=folder!==undefined?(physical?'folder':'map'):info?.icon??fileIcon(entry.path);
    return <div className={'tree-row '+(key&&activeKey===key?'current ':'')+(saved?'saved-row':'')} key={saved?key:entry.path} data-file-key={branch?undefined:key} data-card-drop-folder={key?.startsWith('board:')&&entry.folder?entry.folder:undefined} style={{paddingLeft:8+depth*16}}
      onContextMenu={e=>{e.preventDefault();show(actions(entry),e,true);}}
      onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();e.stopPropagation();show(actions(entry),e);}}}>
      {!saved&&(folder!==undefined?<button className="tree-disclosure" data-tooltip={tooltips.explorer.disclosure(entry.path||snapshot.name,expandedHere)} aria-label={tooltips.explorer.disclosure(entry.path||snapshot.name,expandedHere)} aria-expanded={expandedHere} onClick={()=>toggle(folder)}><Icon name={expandedHere?'down':'chevron'} size={12}/></button>:<span className="tree-spacer"/>)}
      <button className="file-button" disabled={entry.symlink} data-tooltip={entry.symlink?tooltips.explorer.symbolicLink(entry.path):tooltips.explorer.open(entry.path||snapshot.name)}
        onPointerDown={key?e=>module==='whiteboards'?boardDrag(e,key,false):drag(e,key,saved==='starred'):undefined}
        onKeyDown={e=>{if(module==='whiteboards'&&key&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const group=[...boardGroups].find(([,keys])=>keys.includes(key))?.[0];if(group!==undefined)reorder(key,groupKeys(group).indexOf(key)+(e.key==='ArrowUp'?-1:1),group);return;}if(saved==='starred'&&key&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onPrefs(p=>({starred:insertBookmark(p.starred,key,p.starred.indexOf(key)+(e.key==='ArrowUp'?-1:1),true)}));}}}
        onClick={()=>{if(physical&&folder!==undefined)toggle(folder);else if(key)onOpen(key);}}>
        <span className="row-icon"><DocumentIcon value={key?prefs.icons[key]:undefined} fallback={entry.symlink?'link':icon}/></span><span>{entry.name}</span>
      </button>
      <span className="row-actions">{folder!==undefined&&<Tool icon="plus" label={tooltips.explorer.add(entry.path||snapshot.name)} onClick={e=>show(creations(folder),e)}/>}<Tool icon="more" label={tooltips.common.moreActions(entry.name)} onClick={e=>show(actions(entry),e)}/></span>
    </div>;
  }
  function boardBranch(folder:string,depth=0):ReactNode {
    const group=tree.get(portable(folder));
    return <div key={folder} data-file-key={'board:'+portable(folder)} onContextMenu={e=>{if(!e.defaultPrevented){e.preventDefault();show(actions(entryFor('board:'+portable(folder))),e,true);}}}>{row(entryFor('board:'+portable(folder)),depth,undefined,false,true)}{expanded.has(folder)&&!!group?.folders.length&&<div data-sort-group={'boards:'+portable(folder)}>{groupKeys('boards:'+portable(folder)).map(key=>boardBranch(key.slice(6),depth+1))}</div>}</div>;
  }
  function fileEntry(file:FileEntry):Entry {
    if(file.kind==='folder')return {path:file.path,folder:file.path,name:file.name};
    return {path:file.path,name:file.name,symlink:file.kind==='symlink',key:documentIndex(snapshot).paths.get(portable(file.path))??'file:'+file.path};
  }
  function fileBranch(entry:Entry,depth=0):ReactNode {
    return <div key={entry.path}>{row(entry,depth,undefined,true)}{entry.folder!==undefined&&expanded.has(entry.folder)&&<>{files[entry.folder]?.map(file=>fileBranch(fileEntry(file),depth+1))}</>}</div>;
  }
  const rememberScroll=(scroll:number)=>session.schedulePreferences({navigation:{[module]:{scroll}}},snapshot.root);
  return <div className="explorer-module" data-module={module}>
    {module==='bookmarks'?<div className="nav-bottom" ref={scroller} onScroll={e=>rememberScroll(e.currentTarget.scrollTop)}>
      <section className="starred" data-bookmark-target><div className="section-title" data-tooltip={tooltips.explorer.starred}><Icon name="star" size={13}/><strong>{ui.explorer.starred}</strong></div><div className="saved-files" ref={starred} aria-label={ui.explorer.starredFiles}>{prefs.starred.filter(key=>!key.startsWith('system:')||systems.includes(key)).map(key=>row(entryFor(key),0,'starred'))}</div></section>
      <section className="recent"><div className="section-title" data-tooltip={tooltips.explorer.recent}><Icon name="clock" size={13}/><strong>{ui.explorer.recent}</strong></div><div className="saved-files">{prefs.recent.filter(key=>!key.startsWith('system:')||systems.includes(key)).map(key=>row(entryFor(key),0,'recent'))}</div></section>
    </div>:<div className="file-tree" ref={scroller} role="navigation" tabIndex={0} aria-label={module==='files'?ui.explorer.workspaceFiles:module==='whiteboards'?ui.explorer.workspaceWhiteboards:module==='tags'?ui.explorer.workspaceTags:ui.explorer.searchResults} onScroll={e=>rememberScroll(e.currentTarget.scrollTop)} onContextMenu={e=>{if(!e.defaultPrevented&&!(e.target as Element).closest('.tree-row')){e.preventDefault();show(viewActions(),e,true);}}}
      onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){e.preventDefault();show(viewActions(),e);}}}>
      {module==='tags'?<><NewTag session={session} onCreated={path=>onOpen('tag:'+path)}/>{snapshot.tags?.map(tag=>row(entryFor('tag:'+tag.path)))}</>:module==='whiteboards'?<div ref={boardsTarget} className="board-sections"><section data-sort-area className="boards-section"><div className="section-title explorer-section-heading"><strong>{ui.system.boards}</strong><span className="section-rule"/><Tool icon="home" label={ui.system.home} onClick={()=>onOpen('board:')}/></div><div data-sort-group={rootGroup}>{groupKeys(rootGroup).map(key=>key.startsWith('board:')?boardBranch(key.slice(6)):row(entryFor(key)))}</div></section><section data-sort-area className="system-section"><div className="section-title explorer-section-heading"><button className="section-collapse" aria-expanded={!prefs.boardNavigation?.systemCollapsed} onClick={()=>onPrefs(p=>({boardNavigation:{order:p.boardNavigation?.order??{},...p.boardNavigation,systemCollapsed:!p.boardNavigation?.systemCollapsed}}))}><strong>{ui.system.system}</strong><span className="section-rule"/><Icon name={prefs.boardNavigation?.systemCollapsed?'chevron':'down'} size={13}/></button></div>{!prefs.boardNavigation?.systemCollapsed&&<div data-sort-group="system">{groupKeys('system').map(key=>row(entryFor(key)))}</div>}</section></div>:fileBranch({path:'',folder:'',name:snapshot.name})}
    </div>}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
  </div>;
}
