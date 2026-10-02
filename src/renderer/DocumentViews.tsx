import { cardFill, tintColor } from '../colors';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import type { NavigationMode } from '../layout';
import { useEffect, useRef, useState } from 'react';
import type { Board, Card, FileInspection, Snapshot } from '../shared';
import type { Session } from './session';
import type {MenuAction} from './Overlays';
import { CardEditor, type EditorFocus } from './Editor';
import { preview } from './markdown';
import { Whiteboard } from './Board';
import type { BoardSelection } from './StyleView';
import type { Mention } from '../shared';
import type { ViewMemory } from '../layout';
export type { ViewMemory } from '../layout';
import {TitleContent} from './TitleContent';
import {CardTags} from './TagView';
export {TagView} from './TagView';
import { useConfirmation } from './Confirmation';

export function NoteView({path,session,snapshot,active,memory,formatting,suspended=false,onActivate,onOpen,onViewChange}:{
  path:string;session:Session;snapshot:Snapshot;active:boolean;memory:ViewMemory;formatting:boolean;suspended?:boolean;onActivate:()=>void;onOpen:(key:string)=>void;onViewChange:()=>void;
}) {
  const [loaded,setLoaded]=useState<Card|null>(null),[focus,setFocus]=useState<EditorFocus>();
  const container=useRef<HTMLDivElement>(null);
  const [backlinks,setBacklinks]=useState<{path:string}[]>([]);
  const draft=session.state.draft, info=snapshot.cards.find(c=>c.path===path);
  const editing=active&&draft?.card.path===path;
  const body=draft?.card.path===path?draft.body:loaded?.body??'';
  const retained=useRef({editing:false,body:''});if(!suspended)retained.current={editing,body};
  const shown=suspended?retained.current:{editing,body};
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
  const tags=info?<CardTags card={info} snapshot={snapshot} session={session} onOpen={onOpen}/>:undefined;
  return <section className={'document-editor '+(formatting?'show-formatting':'')} ref={container} style={{background:tintColor(cardFill(info))}} onScrollCapture={e=>{memory.scroll=(e.target as HTMLElement).scrollTop;onViewChange();}}
    onPointerDown={e=>{
      if(editing||(e.target as HTMLElement).closest('button,a,summary,select,input'))return;
      setFocus({x:e.clientX,y:e.clientY,scrollTop:memory.scroll??0});onActivate();
    }}
    onClick={e=>{
      const link=(e.target as HTMLElement).closest('a'),href=link?.getAttribute('href');
      if(href?.startsWith('card:')){e.preventDefault();onOpen(href);}
    }}>
    {shown.editing?<CardEditor afterTitle={tags} path={path} body={shown.body} cards={snapshot.cards} onEdit={body=>{if(!suspended)session.edit(body);}} autofocus={!suspended} focusPoint={focus}/>:
      <TitleContent className="prose editor-body document-preview" html={preview(body,path)} afterTitle={tags}/>}
    <details className="card-details"><summary data-tooltip={tooltips.card.backlinks}>{ui.card.linkedFrom(backlinks.length)}</summary>
      {backlinks.map(link=>{const card=snapshot.cards.find(c=>c.path===link.path);return card&&<button key={card.id} data-tooltip={tooltips.files.open(card.path)} onClick={()=>onOpen('card:'+card.id)}>{card.path}</button>;})}
      {info&&!info.legacy&&<select aria-label={ui.card.placeCardOnWhiteboard} data-tooltip={tooltips.card.placeReference} value="" onChange={e=>{
        const board=snapshot.boards.find(b=>b.path===e.target.value);if(board)void session.board({...board,cards:[...board.cards,{id:crypto.randomUUID(),cardId:info.id,x:120,y:120,width:340,height:280}]},ui.history.placeCardReference,board).catch(()=>undefined);
      }}><option value="" disabled>{ui.card.placeOnWhiteboard}</option>{snapshot.boards.filter(b=>b.folder&&!b.cards.some(p=>p.cardId===info.id)).map(b=><option key={b.path} value={b.path}>{b.folder}</option>)}</select>}
    </details>
  </section>;
}
export function BoardView({reveal,onRevealed,onSelection,onStyle,board,snapshot,session,active,memory,onActivate,onOpen,onPreview,onNavigate,onCreate,onCreateBoard,onMigrate,onViewChange,onCycleInput}:{
  reveal?:{placement:string;token:number};onRevealed:()=>void;onSelection:(selection:BoardSelection)=>void;onStyle:()=>void;board:Board;snapshot:Snapshot;session:Session;active:boolean;memory:ViewMemory;onActivate:()=>void;onOpen:(key:string)=>void;onPreview:(key:string)=>void;onNavigate:(key:string,mode?:NavigationMode)=>void;onCreate:(x:number,y:number)=>void;onCreateBoard:(x:number,y:number)=>void;onMigrate:()=>void;onViewChange:()=>void;onCycleInput:()=>void;
}) {
  const confirm=useConfirmation();
  const [mentions,setMentions]=useState<Mention[]>([]);
  useEffect(()=>{let live=true;if(board.showMentions===false)return;
    void session.bridge.request<Mention[]>({kind:'boardMentions',path:board.path}).then(rows=>{if(live)setMentions(rows);}).catch(error=>{if(live)session.update({error:String(error)});});
    return()=>{live=false;};
  },[session,snapshot.cards,board.path,board.showMentions,board.cards.length]);
  const legacyRoot=!board.folder&&board.cards.some(p=>!p.folder);
  const shown=legacyRoot?{...board,cards:board.cards.filter(p=>p.folder),edges:[]}:board;
  return <Whiteboard renderTags={card=><CardTags card={card} snapshot={snapshot} session={session} onOpen={onOpen}/>} addTagActions={(card):MenuAction[]=>(snapshot.tags??[]).filter(t=>!card.tags?.includes(t.tag)).map<MenuAction>(t=>({label:t.tag,icon:'tag' as const,run:()=>{void session.setCardTag(card.path,card.revision,t.tag,true).catch(()=>undefined);}})).concat((snapshot.tags??[]).every(t=>card.tags?.includes(t.tag))?[{label:ui.tags.unavailable,disabled:true,icon:'tag' as const,run:()=>{}}]:[])} reveal={reveal} onRevealed={onRevealed} onOpenCard={(id,mode='new')=>mode==='popup'?onPreview('card:'+id):onNavigate('card:'+id,mode)} edgeDefaults={snapshot.lastEdgeStyle} board={shown} mentions={mentions} onSelection={onSelection} onStyle={onStyle} cards={snapshot.cards} inputMode={snapshot.preferences?.whiteboardInput} onCycleInput={onCycleInput} enabled={active} initialCamera={memory.camera} onCamera={camera=>{memory.camera=camera;onViewChange();}}
    boards={snapshot.boards} onOpenFolder={(folder,mode)=>onNavigate('board:'+folder,mode)}
    onSave={(next,label,base)=>{
      if(legacyRoot){onMigrate();return Promise.reject(new Error(ui.errors.migrateRootFirst));}
      return session.board(next,label,base);
    }}
    onOpen={path=>{onActivate();void session.select(path).catch(()=>undefined);}}
    onReference={id=>onOpen('card:'+id)} onRename={(id,stem)=>session.renameCard(id,stem)}
    onDelete={(base,placements,edges)=>session.deleteSelection(base,placements,edges,names=>confirm({title:ui.card.deleteTitle(names.length),message:ui.card.confirmDelete(names),accept:ui.card.deleteTitle(names.length),danger:true}))}
    onCreate={onCreate} onCreateBoard={onCreateBoard}
    draft={active?session.state.draft:null} onEdit={body=>session.edit(body)}
    onFinish={()=>{void session.select(null).catch(()=>undefined);}}/>;
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
