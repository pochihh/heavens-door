import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from 'react';
import type { FileEntry, Preferences, Snapshot } from '../shared';
import type { Session } from './session';
import { DocumentIcon, Icon, Tool } from './Icons';
import { ActionMenu, type MenuAction, type MenuState } from './Overlays';
import { documentInfo, documentIndex, fileIcon, parent, portable } from './documents';
import { insertBookmark, useBookmarkDrag } from './sortable';

export type ExplorerModule='whiteboards'|'files'|'bookmarks'|'tags'|'search';
type Entry={path:string;key?:string;folder?:string;name:string;symlink?:boolean};
export function Explorer({snapshot,prefs,activeKey,module,starredTarget,session,onOpen,onSplit,onFolder,onCard,onIcon,onPrefs}:{
  snapshot:Snapshot;prefs:Preferences;activeKey:string;module:ExplorerModule;starredTarget:RefObject<HTMLDivElement|null>;session:Session;
  onOpen:(key:string)=>void;onSplit:(key:string)=>void;onFolder:(folder:string)=>void;onCard:(folder:string)=>void;onIcon:(key:string)=>void;onPrefs:(change:(prefs:Preferences)=>Partial<Preferences>)=>void;
}) {
  const expanded=useMemo(()=>new Set(prefs.navigation?.[module]?.expanded??['']),[prefs.navigation,module]);
  const setExpanded=(change:(current:Set<string>)=>Set<string>)=>onPrefs(p=>({navigation:{...p.navigation,[module]:{...p.navigation?.[module],expanded:[...change(new Set(p.navigation?.[module]?.expanded??['']))]}}}));
  const [files,setFiles]=useState<Record<string,FileEntry[]>>({});
  const [menu,setMenu]=useState<MenuState|null>(null),[search,setSearch]=useState(prefs.navigation?.search?.search??''),[results,setResults]=useState<string[]>([]);
  const starred=starredTarget,scroller=useRef<HTMLDivElement>(null);
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
  useEffect(()=>{
    let live=true;
    if(module!=='search'||!search.trim()){setResults([]);return;}
    const timer=setTimeout(()=>{void window.door.request<{path:string}[]>({kind:'query',text:search}).then(rows=>{if(live)setResults(rows.map(r=>r.path));}).catch(report);},120);
    return()=>{live=false;clearTimeout(timer);};
  },[module,search,snapshot,report]);
  const tree=useMemo(()=>{
    const groups=new Map(snapshot.boards.map(b=>[portable(b.folder),{folders:[] as string[],keys:[] as string[]} ]));
    for(const board of snapshot.boards)if(board.folder){let ancestor=parent(board.folder);while(ancestor&&!groups.has(ancestor))ancestor=parent(ancestor);groups.get(ancestor)?.folders.push(board.folder);}
    for(const c of snapshot.cards){const folder=parent(c.path);if(folder)groups.get(folder)?.keys.push('card:'+c.id);}
    for(const t of snapshot.tags??[])groups.get(parent(t.path))?.keys.push('tag:'+t.path);
    for(const group of groups.values())group.folders.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    return groups;
  },[snapshot.boards,snapshot.cards,snapshot.tags]);
  const toggle=(folder:string)=>setExpanded(current=>{const next=new Set(current);if(next.has(folder))next.delete(folder);else next.add(folder);return next;});
  const star=(key:string)=>onPrefs(p=>({starred:p.starred.includes(key)?p.starred.filter(k=>k!==key):[...p.starred,key]}));
  const drag=useBookmarkDrag(starred,(key,index,source)=>onPrefs(p=>{const next=insertBookmark(p.starred,key,index,source);return next.length===p.starred.length&&next.every((k,i)=>k===p.starred[i])?{}:{starred:next};}));
  const entryFor=(key:string):Entry=>{const d=documentInfo(key,snapshot);return {key,path:d.path,name:d.title,folder:d.kind==='board'?d.id:undefined};};
  const creations=(folder:string):MenuAction[]=>{
    const internal=portable(folder).split('/').some(part=>part.startsWith('.')||part==='node_modules');
    return [
      {label:'New sub-whiteboard',icon:'map',disabled:internal,hint:internal?'Internal folders are read-only in Explorer':undefined,run:()=>onFolder(folder)},
      {label:'New note',icon:'note',disabled:!folder||internal,hint:!folder?'The mother whiteboard contains sub-whiteboards only':internal?'Internal folders are read-only in Explorer':undefined,run:()=>onCard(folder)},
    ];
  };
  function actions(entry:Entry):MenuAction[] {
    const key=entry.key,index=key?prefs.starred.indexOf(key):-1;
    return [
      ...(entry.folder!==undefined?creations(entry.folder):[]),
      ...(key&&!entry.symlink?[
        {label:'Open',icon:'file' as const,run:()=>onOpen(key)},
        {label:'Open to the side',icon:'splitRight' as const,run:()=>onSplit(key)},
        {label:index>=0?'Remove from Starred':'Add to Starred',icon:'star' as const,run:()=>star(key)},
        {label:'Change icon…',icon:'art' as const,run:()=>onIcon(key)},
        ...(index>=0?[
          {label:'Move up in Starred',icon:'up' as const,disabled:index===0,run:()=>onPrefs(p=>({starred:insertBookmark(p.starred,key,p.starred.indexOf(key)-1,true)}))},
          {label:'Move down in Starred',icon:'arrowDown' as const,disabled:index===prefs.starred.length-1,run:()=>onPrefs(p=>({starred:insertBookmark(p.starred,key,p.starred.indexOf(key)+1,true)}))},
        ]:[]),
        ...(entry.folder===undefined&&module==='files'?[{label:'View source',icon:'source' as const,run:()=>onOpen('file:'+entry.path)}]:[]),
      ]:[]),
      {label:'Copy relative path',icon:'copy',run:()=>attempt(navigator.clipboard.writeText(entry.path||'.'))},
      {label:window.door.platform==='darwin'?'Reveal in Finder':'Reveal in file manager',icon:'reveal',disabled:entry.symlink,run:()=>attempt(window.door.revealFile(entry.path))},
    ];
  }
  function viewActions():MenuAction[] {
    return [
      {label:'Refresh Explorer',icon:'sync',run:()=>attempt(module==='files'?refresh():session.refresh())},
      ...(module==='whiteboards'||module==='files'?[{label:'Collapse folders',icon:'collapse' as const,run:()=>setExpanded(()=>new Set(['']))}]:[]),
    ];
  }
  function show(actions:MenuAction[],event:{clientX?:number;clientY?:number;currentTarget:EventTarget|null},context=false) {
    const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({x:context?event.clientX!:rect.left,y:context?event.clientY!:rect.bottom+3,actions});
  }
  function row(entry:Entry,depth=0,saved?:'starred'|'recent',physical=false):ReactNode {
    const key=entry.key,folder=entry.folder,expandedHere=folder!==undefined&&expanded.has(folder);
    const info=key?documentInfo(key,snapshot):null,icon=folder!==undefined?(physical?'folder':'map'):info?.icon??fileIcon(entry.path);
    return <div className={'tree-row '+(key&&activeKey===key?'current ':'')+(saved?'saved-row':'')} key={saved?key:entry.path} data-file-key={key} style={{paddingLeft:8+depth*16}}
      onContextMenu={e=>{e.preventDefault();show(actions(entry),e,true);}}
      onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();e.stopPropagation();show(actions(entry),e);}}}>
      {!saved&&(folder!==undefined?<button className="tree-disclosure" data-tooltip={(expandedHere?'Collapse ':'Expand ')+(entry.path||snapshot.name)} aria-label={(expandedHere?'Collapse ':'Expand ')+(entry.path||snapshot.name)} aria-expanded={expandedHere} onClick={()=>toggle(folder)}><Icon name={expandedHere?'down':'chevron'} size={12}/></button>:<span className="tree-spacer"/>)}
      <button className="file-button" disabled={entry.symlink} data-tooltip={entry.symlink?'Symbolic link · '+entry.path:'Open '+(entry.path||snapshot.name)+' in the active pane'}
        onPointerDown={key?e=>drag(e,key,saved==='starred'):undefined}
        onKeyDown={e=>{if(saved==='starred'&&key&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onPrefs(p=>({starred:insertBookmark(p.starred,key,p.starred.indexOf(key)+(e.key==='ArrowUp'?-1:1),true)}));}}}
        onClick={()=>{if(physical&&folder!==undefined)toggle(folder);else if(key)onOpen(key);}}>
        <span className="row-icon"><DocumentIcon value={key?prefs.icons[key]:undefined} fallback={entry.symlink?'link':icon}/></span><span>{entry.name}</span>
      </button>
      <span className="row-actions">{folder!==undefined&&<Tool icon="plus" label={'Add in '+(entry.path||snapshot.name)} onClick={e=>show(creations(folder),e)}/>}<Tool icon="more" label={'More actions for '+entry.name} onClick={e=>show(actions(entry),e)}/></span>
    </div>;
  }
  function boardBranch(folder:string,depth=0):ReactNode {
    const group=tree.get(portable(folder));
    return <div key={folder}>{row(entryFor('board:'+folder),depth)}{expanded.has(folder)&&<>{group?.folders.map(f=>boardBranch(f,depth+1))}{group?.keys.map(key=>row(entryFor(key),depth+1))}</>}</div>;
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
    {module==='search'&&<div className="module-toolbar">
      <label className="search"><Icon name="search" size={14}/><input aria-label="Search cards" data-tooltip="Search filenames and card content" placeholder="Search" value={search} onChange={e=>{setSearch(e.target.value);session.schedulePreferences({navigation:{search:{search:e.target.value}}},snapshot.root);}}/>{search&&<Tool icon="close" label="Clear search" onClick={()=>{setSearch('');onPrefs(p=>({navigation:{...p.navigation,search:{...p.navigation?.search,search:''}}}));}}/>}</label>
    </div>}
    {module==='bookmarks'?<div className="nav-bottom" ref={scroller} onScroll={e=>rememberScroll(e.currentTarget.scrollTop)}>
      <section className="starred" data-bookmark-target><div className="section-title" data-tooltip="Drag files here to star them. Drag out to remove; drag vertically to reorder."><Icon name="star" size={13}/><strong>Starred</strong></div><div className="saved-files" ref={starred} aria-label="Starred files">{prefs.starred.map(key=>row(entryFor(key),0,'starred'))}</div></section>
      <section className="recent"><div className="section-title" data-tooltip="Recently opened files. Drag a file into Starred to keep it."><Icon name="clock" size={13}/><strong>Recent</strong></div><div className="saved-files">{prefs.recent.map(key=>row(entryFor(key),0,'recent'))}</div></section>
    </div>:<div className="file-tree" ref={scroller} role="navigation" tabIndex={0} aria-label={module==='files'?'Workspace files':module==='whiteboards'?'Workspace whiteboards':module==='tags'?'Workspace tags':'Search results'} onScroll={e=>rememberScroll(e.currentTarget.scrollTop)} onContextMenu={e=>{if(!(e.target as Element).closest('.tree-row')){e.preventDefault();show(viewActions(),e,true);}}}
      onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){e.preventDefault();show(viewActions(),e);}}}>
      {module==='tags'?snapshot.tags?.map(tag=>row(entryFor('tag:'+tag.path))):module==='search'?results.map(path=>{const key=documentIndex(snapshot).paths.get(portable(path));return key?row(entryFor(key)):null;}):module==='whiteboards'?boardBranch(''):fileBranch({path:'',folder:'',name:snapshot.name})}
    </div>}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
  </div>;
}
