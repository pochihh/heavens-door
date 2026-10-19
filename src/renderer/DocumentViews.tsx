import {readingText} from '../text/reading';
import {matchesBinding} from '../keybindings';
import {AnnotationRail} from './Annotations';
import {PdfReader} from './PdfReader';
import {annotationView,splitAnnotations,updateAnnotation,type Annotation} from '../reading';
import {Icon} from './Icons';
import {assetPath} from './markdown';
import {searchDocument} from '../core/search';
import {featureEnabled} from '../features';
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

export function NoteView({metadata=false,path,session,snapshot,active,memory,suspended=false,onActivate,onOpen,onViewChange}:{
  metadata?:boolean;path:string;session:Session;snapshot:Snapshot;active:boolean;memory:ViewMemory;suspended?:boolean;onActivate:()=>void;onOpen:(key:string)=>void;onViewChange:()=>void;
}) {
  const [loaded,setLoaded]=useState<Card|null>(null),[focus,setFocus]=useState<EditorFocus>(),[expanded,setExpanded]=useState<string>(),[jump,setJump]=useState<string>(),[titleEdit,setTitleEdit]=useState(false),[sourceHash,setSourceHash]=useState('');
  const progressTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),pendingPage=useRef<number|undefined>(undefined),readingState=useRef<'new'|'reading'|'done'>('new');
  useEffect(()=>()=>{clearTimeout(progressTimer.current);if(pendingPage.current!==undefined)void session.updateReading(path,{state:readingState.current==='done'?'done':'reading',page:pendingPage.current}).catch(()=>undefined);},[session,path]);
  const container=useRef<HTMLDivElement>(null);
  const [backlinks,setBacklinks]=useState<{path:string}[]>([]);
  const draft=session.state.draft, info=snapshot.cards.find(c=>c.path===path);
  readingState.current=info?.reading?.state??'new';
  const editing=active&&draft?.card.path===path;
  const body=draft?.card.path===path?draft.body:loaded?.body??'';
  const source=editing?draft.source??(draft.card.header??'')+draft.body:(loaded?.header??'')+body;
  const retained=useRef({editing:false,body:'',source:''});if(!suspended)retained.current={editing,body,source};
  const shown=suspended?retained.current:{editing,body,source};
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
  const changeAnnotation=(value:Annotation|null,id:string)=>{void session.select(path).then(()=>{const current=session.state.draft;if(current?.card.path===path)session.edit(updateAnnotation(current.body,value,id));}).catch(e=>session.update({error:String(e)}));};
  const addAnnotation=(attrs:Omit<Annotation,'id'|'kind'|'text'>={},note=true)=>{const id=(attrs.quote?'a-':'n-')+crypto.randomUUID();changeAnnotation({id,kind:attrs.quote?'highlight':'note',text:'',...attrs},id);if(note)setExpanded(id);};
  const parts=annotationView(body),annotations=parts.annotations,sourceMode=memory.source||!!parts.error;
  const jumpTo=(id:string)=>{setJump(id);container.current?.querySelector(`[data-annotation="${id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});};
  const tags=info&&featureEnabled(snapshot.preferences,'tags')?<CardTags card={info} snapshot={snapshot} session={session} onOpen={onOpen}/>:undefined;
  const content=sourceMode?<textarea className="editor-body card-source" aria-label={ui.editorTools.markdownSource} spellCheck={false} value={shown.source} readOnly={suspended||!shown.editing} onFocus={()=>{if(!editing)onActivate();}} onChange={e=>{if(!suspended)session.editSource(e.target.value);}}/>:info?.source?.type==='pdf'?<>{titleEdit?<div className="reader-title-edit"><input autoFocus aria-label={readingText.title} defaultValue={info.title??info.name} onBlur={e=>{const title=e.target.value.replace(/[\r\n]/g,' ');setTitleEdit(false);void session.select(path).then(()=>{const current=session.state.draft;if(current)session.edit(current.body.replace(/^#[^\n]*/,'# '+title));});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')setTitleEdit(false);}}/>{tags}</div>:<TitleContent onClick={e=>{if((e.target as HTMLElement).closest('h1'))setTitleEdit(true);}} path={path} className="prose reader-title" html={preview(body.split('\n\n')[0],path)} afterTitle={tags}/> }<PdfReader onSource={setSourceHash} source={info.source} path={path} annotations={annotations} initialPage={info.reading?.page??1} onJump={jump} onAnnotate={addAnnotation} onPage={page=>{pendingPage.current=page;clearTimeout(progressTimer.current);progressTimer.current=setTimeout(()=>{pendingPage.current=undefined;void session.updateReading(path,{state:readingState.current==='done'?'done':'reading',page}).catch(()=>undefined);},1500);}}/><details className="reader-summary"><summary>{readingText.summary}</summary><CardEditor noteOnly path={path} body={splitAnnotations(body).content.replace(/^#[^\n]*\n*/, '')} cards={snapshot.cards} onEdit={summary=>{void session.select(path).then(()=>{const current=session.state.draft;if(current)session.edit(current.body.split('\n')[0]+'\n\n'+summary+splitAnnotations(current.body).footer);});}}/></details></>:shown.editing?<CardEditor id={info?.id} onAnnotation={info?.source?setExpanded:undefined} onTitleDone={()=>void session.run(()=>session.flush()).catch(()=>undefined)} afterTitle={tags} path={path} body={shown.body} cards={snapshot.cards} onEdit={(body,label)=>{if(!suspended){if(label)void session.editAction(body,label).catch(()=>undefined);else session.edit(body);}}} autofocus={!suspended} focusPoint={focus}/>:
      <TitleContent path={path} className="prose editor-body document-preview" html={preview(body,path)} afterTitle={tags}/>;
  return <section className="document-editor" ref={container} style={{background:tintColor(cardFill(info))}} onScrollCapture={e=>{if((e.target as HTMLElement).closest('.annotation-rail'))return;memory.scroll=(e.target as HTMLElement).scrollTop;onViewChange();}}
    onKeyDown={e=>{if(e.defaultPrevented||!info?.source||(e.target as HTMLElement).closest('input,textarea,[contenteditable=true]'))return;if(matchesBinding(e.nativeEvent,'readerLibrary',snapshot.preferences?.keybindings,session.bridge.platform)){e.preventDefault();onOpen('system:reading');}if(matchesBinding(e.nativeEvent,'readerDone',snapshot.preferences?.keybindings,session.bridge.platform)){e.preventDefault();void session.updateReading(path,{...info.reading,state:'done'}).catch(()=>undefined);}if(matchesBinding(e.nativeEvent,'readerNext',snapshot.preferences?.keybindings,session.bridge.platform)){e.preventDefault();const entries=snapshot.cards.filter(c=>c.source&&c.path.startsWith((snapshot.preferences?.reading?.folder??'Inbox')+'/'));const next=entries[(entries.findIndex(c=>c.id===info.id)+1)%entries.length];if(next)onOpen('card:'+next.id);}if(matchesBinding(e.nativeEvent,'readerNote',snapshot.preferences?.keybindings,session.bridge.platform)&&window.getSelection()?.isCollapsed){e.preventDefault();addAnnotation();}}}
    onPointerDown={e=>{
      if(editing||(e.target as HTMLElement).closest('button,a,summary,select,input'))return;
      setFocus({x:e.clientX,y:e.clientY,scrollTop:memory.scroll??0});onActivate();
    }}>
    {!sourceMode&&info?.source&&<div className="reading-actions"><button onClick={()=>addAnnotation()}><Icon name="plus"/>{readingText.addNote}</button>{info?.source&&<>{featureEnabled(snapshot.preferences,'reading')&&<button onClick={()=>onOpen('system:reading')}>{readingText.inbox}</button>}<select aria-label={readingText.readingState} value={info.reading?.state??'new'} onChange={e=>void session.updateReading(path,{...info.reading,state:e.target.value as 'new'|'reading'|'done'}).catch(()=>undefined)}><option value="new">{readingText.new}</option><option value="reading">{readingText.reading}</option><option value="done">{readingText.done}</option></select><button onClick={()=>void session.bridge.revealFile(assetPath(path,info.source!.file??'')).catch(e=>session.update({error:String(e)}))}>{readingText.sourceFile}</button></>}</div>}
    {!sourceMode&&!!info?.source?.missingImages?.length&&<p className="reader-message">{readingText.someArticleImagesCouldNotBeDownloadedThe}</p>}
    {parts.error&&<p role="alert" className="reader-message">{parts.error} {readingText.repairAnnotationSource}</p>}
    {info?.source?<div className="document-reading-layout"><div className="reading-main">{content}</div>{!sourceMode&&<AnnotationRail sourceHash={sourceHash} body={body} path={path} cards={snapshot.cards} expanded={expanded} onExpanded={setExpanded} onChange={changeAnnotation} onJump={jumpTo} onAdd={()=>addAnnotation()}/>}</div>:content}
    {metadata&&info&&<div className="card-info-footer"><span>{info.path}</span><span>{ui.cardWords([...new Intl.Segmenter(undefined,{granularity:'word'}).segment(searchDocument(body).text)].filter(s=>s.isWordLike).length)}</span><div className="card-membership">{snapshot.boards.filter(board=>board.cards.some(p=>p.cardId===info.id)).map(board=><button key={board.path} onClick={()=>onOpen('board:'+board.folder)}>{board.folder||snapshot.name}</button>)}</div></div>}
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
  return <Whiteboard addTagActions={featureEnabled(snapshot.preferences,'tags')?(card):MenuAction[]=>(snapshot.tags??[]).filter(t=>!card.tags?.includes(t.tag)).map<MenuAction>(t=>({label:t.tag,icon:'tag' as const,run:()=>{void session.setCardTag(card.path,card.revision,t.tag,true).catch(()=>undefined);}})).concat((snapshot.tags??[]).every(t=>card.tags?.includes(t.tag))?[{label:ui.tags.unavailable,disabled:true,icon:'tag' as const,run:()=>{}}]:[]):undefined} reveal={reveal} onRevealed={onRevealed} onOpenCard={(id,mode='new')=>mode==='popup'?onPreview('card:'+id):onNavigate('card:'+id,mode)} textDefaults={snapshot.preferences?.whiteboardText} edgeDefaults={snapshot.lastEdgeStyle} board={shown} mentions={mentions} onSelection={onSelection} onStyle={onStyle} cards={snapshot.cards} inputMode={snapshot.preferences?.whiteboardInput} onCycleInput={onCycleInput} enabled={active} initialCamera={memory.camera} onCamera={camera=>{memory.camera=camera;onViewChange();}}
    boards={snapshot.boards} onOpenFolder={(folder,mode)=>onNavigate('board:'+folder,mode)}
    onSave={(next,label,base)=>{
      if(legacyRoot){onMigrate();return Promise.reject(new Error(ui.errors.migrateRootFirst));}
      return session.board(next,label,base);
    }}
    onOpen={path=>{onActivate();void session.select(path).catch(()=>undefined);}}
    onReference={id=>onOpen('card:'+id)} onRename={(id,stem)=>session.renameCard(id,stem)}
    onDelete={(base,placements,edges)=>session.deleteSelection(base,placements,edges,(names,boards)=>confirm({title:boards?ui.whiteboard.deleteTitle:ui.card.deleteTitle(names.length),message:boards?ui.whiteboard.confirmDelete(names):ui.card.confirmDelete(names),accept:boards?ui.whiteboard.delete:ui.card.deleteTitle(names.length),danger:true}))}
    onPlaceReference={(id,x,y)=>session.placeCard(id,board.folder,x,y,'reference')}
    onCreateReference={async(name,x,y)=>{await session.createSlipboxCard(name,{folder:board.folder,x,y});}}
    onConvertTopic={(base,id)=>session.convertTopic(base,id)} onCreate={onCreate} onCreateBoard={onCreateBoard}
    onTitleDone={()=>void session.run(()=>session.flush()).catch(()=>undefined)} draft={active?session.state.draft:null} onEdit={(body,label)=>{if(label)void session.editAction(body,label).catch(()=>undefined);else session.edit(body);}}
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
