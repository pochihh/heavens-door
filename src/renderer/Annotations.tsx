import {dragAssetNote} from './asset-note-drag';
import {readingText} from '../text/reading';
import {useContext,useEffect,useRef,useState} from 'react';
import {annotationView,annotationOnPage,updateAnnotation,type Annotation} from '../reading';
import type {Card,CardInfo} from '../shared';
import {CardEditor} from './Editor';
import {Tool,Icon} from './Icons';
import {Color} from './StyleView';
import {DEFAULT_PALETTE} from '../colors';
import {ViewBlockContext} from './ViewBlock';
import {useConfirmation} from './Confirmation';
export function AnnotationRail({body,path,cards,expanded,onExpanded,onChange,onJump,onAdd,sourceHash,compact=false,page}:{body:string;path:string;cards:CardInfo[];expanded?:string;onExpanded:(id:string|undefined)=>void;onChange:(value:Annotation|null,id:string)=>void;onJump?:(id:string)=>void;onAdd:()=>void;sourceHash?:string;compact?:boolean;page?:number}){
 const cancelDrag=useRef(()=>{});useEffect(()=>()=>cancelDrag.current(),[]);
 const annotations=annotationView(body).annotations.filter(a=>annotationOnPage(a,page)),context=useContext(ViewBlockContext),palette=context?.snapshot.preferences?.palette??DEFAULT_PALETTE,confirm=useConfirmation();
 return <aside className={'annotation-rail'+(compact?' board-annotation-rail':'')} aria-label={readingText.annotations} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <div className="annotation-heading"><span>{readingText.notes}{annotations.length?' · '+annotations.length:''}</span><Tool icon="plus" label={readingText.addGeneralCardNote} onClick={onAdd}/></div>
  {annotations.map(a=><section key={a.id} className={'sticky-note'+(expanded===a.id?' expanded':'')} style={{'--note-color':a.color??'#e6bb50'} as React.CSSProperties}>
    <div className="sticky-note-heading">{context&&(a.text.trim()||a.quote?.trim())&&<Tool icon="grip" className="asset-note-grip" label={readingText.moveNoteToBoard} onPointerDown={e=>{cancelDrag.current();cancelDrag.current=dragAssetNote(e,()=>({key:'asset-note:'+a.id,path,note:{id:a.id,expected:context.session.state.snapshot?.cards.find(c=>c.path===path)?.revision??''}}));}}/>}<button className="sticky-preview" aria-expanded={expanded===a.id} aria-label={'Open note: '+(a.text||a.quote||'Empty note').split('\n')[0]} onClick={()=>onExpanded(expanded===a.id?undefined:a.id)}><Icon name={a.kind==='highlight'?'quote':'note'} size={13}/><span>{(a.text||a.quote||'Empty note').replace(/[#*_`]/g,'').split('\n')[0]}</span></button></div>
    {expanded===a.id&&<><div className="sticky-actions">{a.quote&&<button className="sticky-quote" onClick={()=>onJump?.(a.id)}>{a.quote}</button>}<Tool icon="close" label={readingText.collapseNote} onClick={()=>onExpanded(undefined)}/><Tool icon="trash" className="danger" label={readingText.deleteAnnotation} onClick={()=>{void confirm({title:readingText.deleteAnnotation,message:a.text||a.quote||'Remove this note?',accept:'Delete',danger:true}).then(yes=>{if(yes)onChange(null,a.id);});}}/></div>
      <CardEditor id={path+':'+a.id} path={path} body={a.text} cards={cards} noteOnly autofocus onEdit={text=>onChange({...a,text},a.id)}/>
      <details className="annotation-color"><summary>{readingText.highlightColor}</summary><Color label={readingText.highlightColor} palette={palette} value={a.color} onChange={color=>onChange({...a,color:color??'#e6bb50'},a.id)}/></details>
      {(a.unresolved||a.source&&sourceHash&&a.source!==sourceHash||a.kind==='highlight'&&!body.includes(`data-annotation="${a.id}"`)&&!a.page)&&<small className="annotation-unresolved">{readingText.thePassageIsUnresolvedYourNoteIsPreserved}</small>}
    </>}
  </section>)}
 </aside>;
}
export function useAssetAnnotations(card:CardInfo){
 const context=useContext(ViewBlockContext),[loaded,setLoaded]=useState<Card|null>(null),[expanded,setExpanded]=useState<string>(),[error,setError]=useState('');
 useEffect(()=>{let live=true;void window.door.request<Card>({kind:'card',path:card.path}).then(c=>{if(live){setLoaded(c);setError('');}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[card.path,card.revision]);
 const draft=context?.session.state.draft,body=draft?.card.id===card.id?draft.body:loaded?.body??'';
 const change=(value:Annotation|null,id:string)=>{if(!context)return;void context.session.select(card.path).then(()=>{const current=context.session.state.draft;if(current?.card.id===card.id)context.session.edit(updateAnnotation(current.body,value,id));}).catch(e=>context.session.update({error:String(e)}));};
 const add=(attrs:Omit<Annotation,'id'|'kind'|'text'>={},note=true)=>{const id=(attrs.quote?'a-':'n-')+crypto.randomUUID();change({id,kind:attrs.quote?'highlight':'note',text:'',...attrs},id);if(note)setExpanded(id);};
 return {context,body,expanded,setExpanded,change,add,error};
}
export function BoardAnnotations({card,openNote}:{card:CardInfo;openNote?:string}){
 const {context,body,expanded,setExpanded,change,add,error}=useAssetAnnotations(card);
 useEffect(()=>{if(openNote)setExpanded(openNote);},[openNote]);
 if(!context)return null;
 return <>{error&&<p role="alert">{error}</p>}<AnnotationRail compact path={card.path} body={body} cards={context.snapshot.cards} expanded={expanded} onExpanded={setExpanded} onChange={change} onJump={()=>context.onPreview?.('card:'+card.id)} onAdd={()=>add()}/></>;
}
