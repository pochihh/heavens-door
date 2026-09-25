import { useEffect, useRef, useState } from 'react';
import type { Board, Card, Snapshot, TagInfo, TagResult } from '../shared';
import type { Session } from './session';
import { CardEditor, type EditorFocus } from './Editor';
import { preview } from './markdown';
import { Whiteboard } from './Board';
import type { Camera } from './navigation';
import { Icon } from './Icons';

export interface ViewMemory {camera?:Camera;scroll?:number}
export function NoteView({path,session,snapshot,active,memory,formatting,onActivate,onOpen,onWords}:{
  path:string;session:Session;snapshot:Snapshot;active:boolean;memory:ViewMemory;formatting:boolean;onActivate:()=>void;onOpen:(key:string)=>void;onWords:(count:number)=>void;
}) {
  const [loaded,setLoaded]=useState<Card|null>(null),[focus,setFocus]=useState<EditorFocus>();
  const container=useRef<HTMLDivElement>(null);
  const [backlinks,setBacklinks]=useState<{path:string}[]>([]);
  const draft=session.state.draft, info=snapshot.cards.find(c=>c.path===path);
  const editing=active&&draft?.card.path===path;
  const body=draft?.card.path===path?draft.body:loaded?.body??'';
  useEffect(()=>{
    let live=true;
    void session.bridge.request<Card>({kind:'card',path}).then(card=>{if(live)setLoaded(card);}).catch(error=>session.update({error:String(error)}));
    return()=>{live=false;};
  },[path,info?.revision,session]);
  useEffect(()=>{
    const element=container.current!;
    const content=element.querySelector<HTMLElement>('.editor-body');
    if(content)content.scrollTop=memory.scroll??0;
  },[editing,loaded?.path,memory]);
  useEffect(()=>{
    let live=true;if(!info?.id)return;
    void session.bridge.request<{path:string}[]>({kind:'query',text:'backlinks:'+info.id}).then(rows=>{if(live)setBacklinks(rows);}).catch(error=>session.update({error:String(error)}));
    return()=>{live=false;};
  },[info?.id,snapshot,session]);
  useEffect(()=>{onWords(body.trim()?body.trim().split(/\s+/).length:0);},[body,onWords]);
  return <section className={'document-editor '+(formatting?'show-formatting':'')} ref={container} onScrollCapture={e=>{memory.scroll=(e.target as HTMLElement).scrollTop;}}
    onPointerDown={e=>{
      if(editing||(e.target as HTMLElement).closest('button,a,summary,select,input'))return;
      setFocus({x:e.clientX,y:e.clientY,scrollTop:memory.scroll??0});onActivate();
    }}
    onClick={e=>{
      const link=(e.target as HTMLElement).closest('a'),href=link?.getAttribute('href');
      if(href?.startsWith('card:')){e.preventDefault();onOpen(href);}
    }}>
    {editing?<CardEditor path={path} body={body} cards={snapshot.cards} onEdit={body=>session.edit(body)} autofocus focusPoint={focus}/>:
      <div className="prose editor-body document-preview" dangerouslySetInnerHTML={{__html:preview(body,path)||'<p class="empty-text">Click to write</p>'}}/>}
    <details className="card-details"><summary title="Cards that link here, and whiteboards where this card can be placed">Linked from · {backlinks.length}</summary>
      {backlinks.map(link=>{const card=snapshot.cards.find(c=>c.path===link.path);return card&&<button key={card.id} title={'Open '+card.path} onClick={()=>onOpen('card:'+card.id)}>{card.path}</button>;})}
      {info&&!info.legacy&&<select aria-label="Place card on whiteboard" title="Add a reference to this card on another whiteboard" value="" onChange={e=>{
        const board=snapshot.boards.find(b=>b.path===e.target.value);if(board)void session.board({...board,cards:[...board.cards,{id:crypto.randomUUID(),cardId:info.id,x:120,y:120,width:340,height:280}]},'Place card reference',board).catch(()=>undefined);
      }}><option value="" disabled>Place on whiteboard…</option>{snapshot.boards.filter(b=>b.folder&&!b.cards.some(p=>p.cardId===info.id)).map(b=><option key={b.path} value={b.path}>{b.folder}</option>)}</select>}
    </details>
  </section>;
}
export function BoardView({board,snapshot,session,active,memory,onActivate,onOpen,onCreate,onMigrate}:{
  board:Board;snapshot:Snapshot;session:Session;active:boolean;memory:ViewMemory;onActivate:()=>void;onOpen:(key:string)=>void;onCreate:(x:number,y:number)=>void;onMigrate:()=>void;
}) {
  const legacyRoot=!board.folder&&board.cards.some(p=>!p.folder);
  const shown=legacyRoot?{...board,cards:board.cards.filter(p=>p.folder),edges:[]}:board;
  return <Whiteboard board={shown} cards={snapshot.cards} enabled={active} initialCamera={memory.camera} onCamera={camera=>{memory.camera=camera;}}
    folders={snapshot.folders??[]} onOpenFolder={folder=>onOpen('board:'+folder)}
    onSave={(next,label,base)=>{
      if(legacyRoot){onMigrate();return Promise.reject(new Error('Move root cards before changing the mother whiteboard.'));}
      return session.board(next,label,base);
    }}
    onOpen={path=>{onActivate();void session.select(path).catch(()=>undefined);}}
    onReference={id=>onOpen('card:'+id)}
    onCreate={onCreate}
    draft={active?session.state.draft:null} onEdit={body=>session.edit(body)}
    onFinish={()=>{void session.select(null).catch(()=>undefined);}}/>;
}
export function TagView({tag,snapshot,session,onOpen}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void}) {
  const [rows,setRows]=useState<TagResult[]>([]),[view,setView]=useState<'table'|'kanban'>('table'),[group,setGroup]=useState('status');
  useEffect(()=>{
    let live=true;
    void session.bridge.request<TagResult[]>({kind:'tagCards',tag:tag.tag}).then(result=>{if(live)setRows(result);}).catch(error=>session.update({error:String(error)}));
    return()=>{live=false;};
  },[tag.tag,snapshot,session]);
  const fields=[...new Set(rows.flatMap(r=>Object.keys(r.properties)))].filter(k=>!['card-id','tags'].includes(k)).slice(0,8);
  const text=(value:unknown)=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
  const groups=[...new Set(rows.map(row=>text(row.properties[group])||'No '+group))];
  return <section className="tag-view">
    <div className="tag-view-toolbar">
      <button title="Show tagged cards as a table" className={view==='table'?'selected':''} onClick={()=>setView('table')}><Icon name="table"/> Table</button>
      <button title="Group tagged cards by a property; editing properties is a later milestone" className={view==='kanban'?'selected':''} onClick={()=>setView('kanban')}><Icon name="kanban"/> Kanban</button>
      {view==='kanban'&&<select aria-label="Group cards by property" title="Property used for Kanban columns" value={group} onChange={e=>setGroup(e.target.value)}>{[...new Set(['status',...fields])].map(f=><option key={f}>{f}</option>)}</select>}
      <span className="muted">{rows.length} cards</span>
    </div>
    {view==='table'?<div className="tag-results"><table><thead><tr><th>Card</th>{fields.map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.card.id}><td><button title={'Open '+row.card.path} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/>{row.card.name}</button></td>{fields.map(f=><td key={f}>{text(row.properties[f])}</td>)}</tr>)}</tbody></table></div>:
      <div className="kanban">{groups.map(name=><section key={name}><h3>{name}<span>{rows.filter(r=>(text(r.properties[group])||'No '+group)===name).length}</span></h3>{rows.filter(r=>(text(r.properties[group])||'No '+group)===name).map(row=><button key={row.card.id} title={'Open '+row.card.path} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/>{row.card.name}</button>)}</section>)}</div>}
    {!rows.length&&<p className="empty-label">No cards tagged {tag.tag}</p>}
  </section>;
}
export function HistoryPanel({session}:{session:Session}) {
  const state=session.state;
  return <>
    {!state.snapshot?.historyAvailable&&<p className="notice">History is unavailable for this existing Git repository.</p>}
    <div className="history-list">{state.checkpoints.map(item=><button key={item.id} className={'checkpoint '+(item.active?'active':'')} title={(item.active?'Current checkpoint: ':'Restore workspace to ')+item.label} onClick={()=>{if(!item.active)void session.restore(item.id).catch(()=>undefined);}}><span className="history-dot"/><strong>{item.label}</strong><time>{new Date(item.time).toLocaleString()}</time><small>{item.id.slice(0,7)}{item.active?' · Current':''}</small></button>)}</div></>;
}
