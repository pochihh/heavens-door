import {ui} from '../text/ui';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {systemPath,systemEntries,type SystemEntry} from '../features';
import {TextSearch} from '../core/search';
import type {Snapshot,TrashEntry,CardInfo,Card} from '../shared';
import type {Session} from './session';
import {Icon,Tool} from './Icons';
import {CalendarView} from './CalendarView';
import {NewTag} from './TagView';
import {ActionMenu,type MenuState} from './Overlays';
import {useBookmarkDrag} from './sortable';
import {useConfirmation} from './Confirmation';
import {isSystemGuide,systemGuidePath} from '../system-guides';
import {preview} from './markdown';
export function SystemView({id,snapshot,session,onOpen,onJournalOpen=onOpen,onPreview,onTemplate}:{id:SystemEntry;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;onJournalOpen?:(key:string)=>void;onPreview:(key:string)=>void;onTemplate:(path?:string)=>void}){
  const [search,setSearch]=useState(''),[trash,setTrash]=useState<TrashEntry[]>([]),[menu,setMenu]=useState<MenuState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[guide,setGuide]=useState<Card|null>(null),[guideError,setGuideError]=useState('');
  const confirm=useConfirmation(),dragTarget=useRef<HTMLDivElement>(null),drag=useBookmarkDrag(dragTarget,()=>{}),closeMenu=useCallback(()=>setMenu(null),[]);
  const path=systemPath(id,snapshot.preferences),entry=systemEntries(snapshot.preferences).find(f=>f.id===id)!;
  const guidePath=systemGuidePath(id,snapshot.preferences),guideRevision=snapshot.cards.find(c=>c.path===guidePath)?.revision;
  useEffect(()=>{let live=true;void session.ensureSystemGuide(id).then(async path=>{if(typeof path==='string'){const card=await session.bridge.request<Card>({kind:'card',path});if(live){setGuide(card);setGuideError('');}}},e=>{if(live)setGuideError(String(e));}).catch(e=>{if(live)setGuideError(String(e));});return()=>{live=false;};},[id,guidePath,guideRevision,session]);
  useEffect(()=>{let live=true;if(id==='trash'){setBusy(true);void session.bridge.request<TrashEntry[]>({kind:'trashEntries'}).then(rows=>{if(live){setTrash(rows);setError('');}},e=>{if(live)setError(String(e));}).finally(()=>{if(live)setBusy(false);});}return()=>{live=false;};},[id,snapshot,session]);
  const cards=useMemo(()=>id==='trash'?trash:snapshot.cards.filter(c=>c.path.startsWith(path+'/')&&!isSystemGuide(c.path,snapshot.preferences)),[id,trash,snapshot.cards,path]);
  const rows=useMemo(()=>id==='tags'?(snapshot.tags??[]).filter(t=>t.path.startsWith(path+'/')).map(t=>({key:'tag:'+t.path,name:t.name,path:t.path,tags:[] as string[],card:undefined as CardInfo|undefined})):cards.map(c=>({key:id==='trash'?'file:'+c.path:'card:'+c.id,name:c.title||c.name,path:id==='trash'?(c as TrashEntry).originalPath??c.path:c.path,tags:c.tags??[],card:c})),[id,cards,snapshot.tags,path]);
  const index=useMemo(()=>{const engine=new TextSearch();rows.forEach(row=>engine.update({path:row.key,name:row.name,title:row.name,body:row.path+' '+row.tags.join(' ')}));return engine;},[rows]);
  const hits=search?new Set(index.search(search).map(hit=>hit.path)):null,shown=rows.filter(row=>!hits||hits.has(row.key));
  const perform=async(run:()=>Promise<void>)=>{setBusy(true);try{await run();setError('');}catch(e){setError(String(e));}finally{setBusy(false);}};
  function actions(row:typeof rows[number],anchor:HTMLElement){const bounds=anchor.getBoundingClientRect();setMenu({anchor,x:bounds.right,y:bounds.bottom,actions:id==='trash'?[{label:ui.system.restore,icon:'undo',run:()=>void perform(async()=>{const entry=row.card as TrashEntry;if(entry.archive)await session.fileOperation({action:'restore',path:entry.archive},ui.system.restore);else{const card=await session.restoreTrash(entry.path,entry.revision);onOpen('card:'+card.id);}})},{label:(row.card as TrashEntry).kind==='folder'?ui.explorer.revealInFinder:ui.explorer.viewSource,icon:(row.card as TrashEntry).kind==='folder'?'folder':'source',run:()=>{if((row.card as TrashEntry).kind==='folder')void session.bridge.revealFile(row.card!.path);else onOpen(row.key);}}]:[
    {label:ui.common.openInPopup,icon:'note',run:()=>onPreview(row.key)},
    {label:ui.common.openInNewTab,icon:'external',run:()=>onOpen(row.key)},
    ...(id==='templates'?[{label:ui.journal.template,icon:'copy' as const,run:()=>onTemplate(row.card!.path)}]:[]),
    ...(row.card?[{label:ui.system.moveToTrash,icon:'trash' as const,danger:true,run:()=>void perform(async()=>{if(await confirm({title:ui.system.moveToTrash,message:row.name,accept:ui.system.moveToTrash,danger:true}))await session.trashCard(row.card!.path,row.card!.revision);})}]:[]),
  ]});}
  return <section className="system-library" data-drop-folder={['slipbox','templates','journal'].includes(id)?path:undefined} data-drop-kind="folder" data-drop-name={entry.name} aria-label={entry.name} aria-busy={busy}>
    <div className="system-heading"><Icon name={entry.icon}/><h1>{id==='journal'?'Journal':entry.name}</h1><div className="toolbar-spacer"/>{id==='templates'?<button onClick={()=>void perform(async()=>{const c=await session.createTemplate();onOpen('card:'+c.id);})}><Icon name="plus"/>{ui.journal.newTemplate}</button>:id==='slipbox'?<button onClick={()=>void perform(async()=>{await session.create(path,snapshot.preferences?.stem??'untitled',0,0,false);const card=session.state.draft?.card;if(card)onOpen('card:'+card.id);})}><Icon name="plus"/>{ui.common.newCard}</button>:null}</div>
    <details className="system-guide"><summary>{ui.system.guide}</summary>{guideError&&<p role="alert">{guideError}</p>}{guide&&<><div className="prose system-guide-content" dangerouslySetInnerHTML={{__html:preview(guide.body,guide.path,false)}} onClick={e=>{const href=(e.target as HTMLElement).closest('a')?.getAttribute('href');if(href?.startsWith('card:')){e.preventDefault();onPreview(href);}}}/><button className="system-guide-edit" onClick={()=>onPreview('card:'+guide.id)}><Icon name="edit"/>{ui.system.editGuide}</button></>}</details>
    {id==='journal'&&<div className="system-calendar"><CalendarView snapshot={snapshot} session={session} onOpen={onJournalOpen}/></div>}
    <div className="system-search"><Icon name="search"/><input aria-label={ui.system.searchIn(entry.name)} placeholder={ui.system.search} value={search} onChange={e=>setSearch(e.target.value)}/><small>{shown.length}</small></div>
    {id==='tags'&&<NewTag session={session} onCreated={path=>onOpen('tag:'+path)}/>}
    {error&&<p role="alert">{error}</p>}
    <div className="system-records" role="table" aria-label={entry.name}><div className="system-record header" role="row"><span role="columnheader"><Icon name="text"/>{ui.system.name}</span><span role="columnheader">{ui.system.location}</span><span role="columnheader"><Icon name="tag"/>{ui.layout.tags}</span><span/></div>
      {shown.map(row=><div key={row.key} role="row" className="system-record" data-file-key={row.key} data-drag-path={row.card?.path} onContextMenu={e=>{e.preventDefault();actions(row,e.currentTarget);}}>
        <div role="cell" className="system-name-cell"><button className="system-name" onPointerDown={id!=='trash'&&id!=='tags'?e=>drag(e,row.key,false):undefined} onClick={()=>id==='trash'?(row.card as TrashEntry).kind==='folder'?void session.bridge.revealFile(row.card!.path):onOpen(row.key):onPreview(row.key)}><Icon name={id==='tags'?'tag':id==='trash'&&(row.card as TrashEntry).kind==='folder'?'folder':'note'}/><span>{row.name}</span></button></div>
        <span role="cell" className="system-path" data-tooltip={row.path}>{row.path}</span><span role="cell" className="system-tags">{row.tags.map(tag=><span key={tag}>#{tag}</span>)}</span><span role="cell"><Tool icon="more" label={ui.system.actions(row.name)} onClick={e=>actions(row,e.currentTarget)}/></span>
      </div>)}
    </div>{!shown.length&&!busy&&<p className="muted">{search?ui.system.noMatches:ui.system.noItems}</p>}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
  </section>;
}
