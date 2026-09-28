import { cardFill, tintColor } from '../colors';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import type { NavigationMode } from '../layout';
import { useEffect, useRef, useState } from 'react';
import type { Board, Card, FileInspection, Snapshot, TagInfo, TagResult } from '../shared';
import type { Session } from './session';
import { CardEditor, type EditorFocus } from './Editor';
import { preview } from './markdown';
import { Whiteboard } from './Board';
import type { BoardSelection } from './StyleView';
import type { Mention } from '../shared';
import type { ViewMemory } from '../layout';
export type { ViewMemory } from '../layout';
import { Icon } from './Icons';

export function NoteView({path,session,snapshot,active,memory,formatting,onActivate,onOpen,onViewChange}:{
  path:string;session:Session;snapshot:Snapshot;active:boolean;memory:ViewMemory;formatting:boolean;onActivate:()=>void;onOpen:(key:string)=>void;onViewChange:()=>void;
}) {
  const [loaded,setLoaded]=useState<Card|null>(null),[focus,setFocus]=useState<EditorFocus>();
  const container=useRef<HTMLDivElement>(null);
  const [backlinks,setBacklinks]=useState<{path:string}[]>([]);
  const draft=session.state.draft, info=snapshot.cards.find(c=>c.path===path);
  const editing=active&&draft?.card.path===path;
  const body=draft?.card.path===path?draft.body:loaded?.body??'';
  useEffect(()=>{
    let live=true;
    void session.bridge.request<Card>({kind:'card',path}).then(card=>{if(live)setLoaded(card);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[path,info?.revision,session]);
  useEffect(()=>{
    const element=container.current!;
    const content=element.querySelector<HTMLElement>('.editor-body');
    if(content)content.scrollTop=memory.scroll??0;
  },[editing,loaded?.path,memory]);
  useEffect(()=>{
    let live=true;if(!info?.id)return;
    void session.bridge.request<{path:string}[]>({kind:'query',text:'backlinks:'+info.id}).then(rows=>{if(live)setBacklinks(rows);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[info?.id,snapshot,session]);
  return <section className={'document-editor '+(formatting?'show-formatting':'')} ref={container} style={{background:tintColor(cardFill(info))}} onScrollCapture={e=>{memory.scroll=(e.target as HTMLElement).scrollTop;onViewChange();}}
    onPointerDown={e=>{
      if(editing||(e.target as HTMLElement).closest('button,a,summary,select,input'))return;
      setFocus({x:e.clientX,y:e.clientY,scrollTop:memory.scroll??0});onActivate();
    }}
    onClick={e=>{
      const link=(e.target as HTMLElement).closest('a'),href=link?.getAttribute('href');
      if(href?.startsWith('card:')){e.preventDefault();onOpen(href);}
    }}>
    {editing?<CardEditor path={path} body={body} cards={snapshot.cards} onEdit={body=>session.edit(body)} autofocus focusPoint={focus}/>:
      <div className="prose editor-body document-preview" dangerouslySetInnerHTML={{__html:preview(body,path)}}/>}
    <details className="card-details"><summary data-tooltip={tooltips.card.backlinks}>{ui.card.linkedFrom(backlinks.length)}</summary>
      {backlinks.map(link=>{const card=snapshot.cards.find(c=>c.path===link.path);return card&&<button key={card.id} data-tooltip={tooltips.files.open(card.path)} onClick={()=>onOpen('card:'+card.id)}>{card.path}</button>;})}
      {info&&!info.legacy&&<select aria-label={ui.card.placeCardOnWhiteboard} data-tooltip={tooltips.card.placeReference} value="" onChange={e=>{
        const board=snapshot.boards.find(b=>b.path===e.target.value);if(board)void session.board({...board,cards:[...board.cards,{id:crypto.randomUUID(),cardId:info.id,x:120,y:120,width:340,height:280}]},ui.history.placeCardReference,board).catch(()=>undefined);
      }}><option value="" disabled>{ui.card.placeOnWhiteboard}</option>{snapshot.boards.filter(b=>b.folder&&!b.cards.some(p=>p.cardId===info.id)).map(b=><option key={b.path} value={b.path}>{b.folder}</option>)}</select>}
    </details>
  </section>;
}
export function BoardView({onSelection,onStyle,board,snapshot,session,active,memory,onActivate,onOpen,onNavigate,onCreate,onCreateBoard,onMigrate,onViewChange,onCycleInput}:{
  onSelection:(selection:BoardSelection)=>void;onStyle:()=>void;board:Board;snapshot:Snapshot;session:Session;active:boolean;memory:ViewMemory;onActivate:()=>void;onOpen:(key:string)=>void;onNavigate:(key:string,mode?:NavigationMode)=>void;onCreate:(x:number,y:number)=>void;onCreateBoard:(x:number,y:number)=>void;onMigrate:()=>void;onViewChange:()=>void;onCycleInput:()=>void;
}) {
  const [mentions,setMentions]=useState<Mention[]>([]);
  useEffect(()=>{let live=true;if(board.showMentions===false)return;
    void session.bridge.request<Mention[]>({kind:'boardMentions',path:board.path}).then(rows=>{if(live)setMentions(rows);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[session,snapshot.cards,board.path,board.showMentions,board.cards.length]);
  const legacyRoot=!board.folder&&board.cards.some(p=>!p.folder);
  const shown=legacyRoot?{...board,cards:board.cards.filter(p=>p.folder),edges:[]}:board;
  return <Whiteboard board={shown} mentions={mentions} onSelection={onSelection} onStyle={onStyle} cards={snapshot.cards} inputMode={snapshot.preferences?.whiteboardInput} onCycleInput={onCycleInput} enabled={active} initialCamera={memory.camera} onCamera={camera=>{memory.camera=camera;onViewChange();}}
    boards={snapshot.boards} onOpenFolder={(folder,mode)=>onNavigate('board:'+folder,mode)}
    onSave={(next,label,base)=>{
      if(legacyRoot){onMigrate();return Promise.reject(new Error(ui.errors.migrateRootFirst));}
      return session.board(next,label,base);
    }}
    onOpen={path=>{onActivate();void session.select(path).catch(()=>undefined);}}
    onReference={id=>onOpen('card:'+id)} onRename={(id,stem)=>session.renameCard(id,stem)}
    onCreate={onCreate} onCreateBoard={onCreateBoard}
    draft={active?session.state.draft:null} onEdit={body=>session.edit(body)}
    onFinish={()=>{void session.select(null).catch(()=>undefined);}}/>;
}
export function TagView({tag,snapshot,session,onOpen,memory,onViewChange}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;memory:ViewMemory;onViewChange:()=>void}) {
  const [rows,setRows]=useState<TagResult[]>([]),[view,setView]=useState<'table'|'kanban'>(memory.tagView??'table'),[group,setGroup]=useState(memory.tagGroup??'status');
  useEffect(()=>{
    let live=true;
    void session.bridge.request<TagResult[]>({kind:'tagCards',tag:tag.tag}).then(result=>{if(live)setRows(result);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[tag.tag,snapshot,session]);
  const fields=[...new Set(rows.flatMap(r=>Object.keys(r.properties)))].filter(k=>!['card-id','card-color','tags'].includes(k)).slice(0,8);
  const text=(value:unknown)=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
  const groups=[...new Set(rows.map(row=>text(row.properties[group])||ui.tags.noProperty(group)))];
  return <section className="tag-view">
    <div className="tag-view-toolbar">
      <button data-tooltip={tooltips.tags.table} className={view==='table'?'selected':''} onClick={()=>{setView('table');memory.tagView='table';onViewChange();}}><Icon name="table"/>  {ui.tags.table}</button>
      <button data-tooltip={tooltips.tags.kanban} className={view==='kanban'?'selected':''} onClick={()=>{setView('kanban');memory.tagView='kanban';onViewChange();}}><Icon name="kanban"/>  {ui.tags.kanban}</button>
      {view==='kanban'&&<select aria-label={ui.tags.groupCardsByProperty} data-tooltip={tooltips.tags.groupProperty} value={group} onChange={e=>{setGroup(e.target.value);memory.tagGroup=e.target.value;onViewChange();}}>{[...new Set(['status',...fields])].map(f=><option key={f}>{f}</option>)}</select>}
      <span className="muted">{ui.card.count(rows.length)}</span>
    </div>
    {view==='table'?<div className="tag-results"><table><thead><tr><th>{ui.tags.card}</th>{fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.card.id}><td><button data-tooltip={tooltips.files.open(row.card.path)} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/>{row.card.name}</button></td>{fields.map(f=><td key={f}>{text(row.properties[f])}</td>)}</tr>)}</tbody></table></div>:
      <div className="kanban">{groups.map(name=><section key={name}><h3>{name}<span>{rows.filter(r=>(text(r.properties[group])||ui.tags.noProperty(group))===name).length}</span></h3>{rows.filter(r=>(text(r.properties[group])||ui.tags.noProperty(group))===name).map(row=><button key={row.card.id} data-tooltip={tooltips.files.open(row.card.path)} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/>{row.card.name}</button>)}</section>)}</div>}
    {!rows.length&&<p className="empty-label">{ui.tags.empty(tag.tag)}</p>}
  </section>;
}
export function HistoryPanel({session}:{session:Session}) {
  const state=session.state;
  return <>
    {!state.snapshot?.historyAvailable&&<p className="notice">{ui.history.unavailable}</p>}
    <div className="history-list">{state.checkpoints.map(item=><button key={item.id} className={'checkpoint '+(item.active?'active':'')} data-tooltip={tooltips.history.checkpoint(item.label,item.active)} onClick={()=>{if(!item.active)void session.restore(item.id).catch(()=>undefined);}}><span className="history-dot"/><strong>{item.label}</strong><time>{new Date(item.time).toLocaleString()}</time><small>{item.id.slice(0,7)}{item.active?ui.history.current:''}</small></button>)}</div></>;
}

export function FileView({path,snapshot,memory,onViewChange}:{path:string;snapshot:Snapshot;memory:ViewMemory;onViewChange:()=>void}) {
  const [file,setFile]=useState<FileInspection|null>(null),[error,setError]=useState('');
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let live=true;
    void window.door.request<FileInspection>({kind:'inspectFile',path}).then(value=>{if(live){setFile(value);setError('');}}).catch(error=>{if(live)setError(String(error));});
    return()=>{live=false;};
  },[path,snapshot]);
  useEffect(()=>{if(container.current)container.current.scrollTop=memory.scroll??0;},[file?.kind,memory]);
  return <div className="file-preview" ref={container} onScroll={e=>{memory.scroll=e.currentTarget.scrollTop;onViewChange();}}>
    {error?<p role="alert">{error}</p>:!file?<p className="muted">{ui.common.loading}</p>:file.kind==='text'?<pre>{file.text}</pre>:file.kind==='image'?<img src={window.door.assetUrl(path)} alt={path}/>:<p className="muted">{ui.files.size(path,file.size)}</p>}
    {file?.kind!=='text'&&<button data-tooltip={tooltips.files.reveal} onClick={()=>{void window.door.revealFile(path).catch(error=>setError(String(error)));}}>{ui.files.reveal}</button>}
  </div>;
}
