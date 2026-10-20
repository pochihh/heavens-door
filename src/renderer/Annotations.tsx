import {dragAssetNote} from './asset-note-drag';
import {readingText} from '../text/reading';
import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {annotationView,annotationOnPage,updateAnnotation,type Annotation} from '../reading';
import type {Card,CardInfo} from '../shared';
import {AnnotationEditor} from './AnnotationEditor';
import {annotationPositions,type PdfPageBox} from './annotation-layout';
import {Tool} from './Icons';
import {Color} from './StyleView';
import {DEFAULT_PALETTE} from '../colors';
import {ViewBlockContext} from './ViewBlock';
import {useConfirmation} from './Confirmation';
export function AnnotationRail({body,path,expanded,onExpanded,onChange,onJump,onAdd,sourceHash,compact=false,page,pages}:{body:string;path:string;cards:CardInfo[];expanded?:string;onExpanded:(id:string|undefined)=>void;onChange:(value:Annotation|null,id:string)=>void;onJump?:(id:string)=>void;onAdd?:()=>void;sourceHash?:string;compact?:boolean;page?:number;pages?:PdfPageBox[]}){
 const cancelDrag=useRef(()=>{}),rail=useRef<HTMLElement>(null),[heights,setHeights]=useState<Record<string,number>>({});useEffect(()=>()=>cancelDrag.current(),[]);
 const annotations=annotationView(body).annotations.filter(a=>annotationOnPage(a,page)),context=useContext(ViewBlockContext),palette=context?.snapshot.preferences?.palette??DEFAULT_PALETTE,confirm=useConfirmation();
 useLayoutEffect(()=>{const root=rail.current!;const observer=new ResizeObserver(()=>{const next:Record<string,number>={};root.querySelectorAll<HTMLElement>('[data-note-id]').forEach(el=>{next[el.dataset.noteId!]=el.offsetHeight;});setHeights(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);});root.querySelectorAll('[data-note-id]').forEach(el=>observer.observe(el));return()=>observer.disconnect();},[body,expanded]);
 const positions=pages?annotationPositions(annotations.map(a=>({id:a.id,page:page??a.page??a.anchors?.[0]?.page,height:heights[a.id]??42})),pages):undefined;
 return <aside ref={rail} className={'annotation-rail'+(compact?' board-annotation-rail':'')+(pages?' page-aligned-notes':'')} style={pages?{'--annotation-columns':Math.max(1,...[...positions!.values()].map(p=>p.column+1))} as React.CSSProperties:undefined} aria-label={readingText.annotations} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <div className="annotation-heading"><span>{readingText.notes}{annotations.length?' · '+annotations.length:''}</span>{onAdd&&<Tool icon="plus" label={readingText.addGeneralCardNote} onClick={onAdd}/>}</div>
  {annotations.map(a=>{const position=positions?.get(a.id),open=expanded===a.id;return <section key={a.id} data-note-id={a.id} className={'sticky-note'+(open?' expanded':'')} style={{'--note-color':a.color??'#e6bb50',...(position?{position:'absolute',top:position.top,left:position.column*228,width:220}:{})} as React.CSSProperties}>
    <div className="sticky-note-heading"><button className="sticky-preview" aria-expanded={open} aria-label={readingText.openNote+': '+(a.text||a.quote||readingText.emptyNote).split('\n')[0]} onClick={()=>{onExpanded(open?undefined:a.id);if(!open)onJump?.(a.id);}}><span>{(a.text||a.quote||readingText.emptyNote).replace(/[#*_`]/g,'').split('\n')[0]}</span></button>{open&&<Tool icon="trash" className="danger" label={readingText.deleteAnnotation} onClick={()=>{void confirm({title:readingText.deleteAnnotation,message:a.text||a.quote||readingText.deleteAnnotation,accept:readingText.delete,danger:true}).then(yes=>{if(yes)onChange(null,a.id);});}}/>}</div>
    {open&&<>{a.quote&&<blockquote className="sticky-quote">{a.quote}</blockquote>}
      <AnnotationEditor path={path} text={a.text} onChange={text=>onChange({...a,text},a.id)}/>
      {context&&(a.text.trim()||a.quote?.trim())&&<details className="annotation-transfer"><summary>{readingText.createCardFromComment}</summary><button className="asset-note-extract" onPointerDown={e=>{cancelDrag.current();cancelDrag.current=dragAssetNote(e,()=>({key:'asset-note:'+a.id,path,note:{id:a.id,expected:context.session.state.snapshot?.cards.find(c=>c.path===path)?.revision??''}}));}}>{readingText.dragToCreateCard}</button></details>}
      <div className="annotation-color"><Color label={readingText.highlightColor} palette={palette} value={a.color} onChange={color=>onChange({...a,color:color??'#e6bb50'},a.id)}/></div>
      {(a.unresolved||a.source&&sourceHash&&a.source!==sourceHash||a.kind==='highlight'&&!body.includes(`data-annotation="${a.id}"`)&&!a.page)&&<small className="annotation-unresolved">{readingText.thePassageIsUnresolvedYourNoteIsPreserved}</small>}
    </>}
  </section>;})}

 </aside>;
}
export function useAssetAnnotations(card:CardInfo){
 const context=useContext(ViewBlockContext),[loaded,setLoaded]=useState<Card|null>(null),[expanded,setExpanded]=useState<string>(),[error,setError]=useState(''),pending=useRef(new Map<string,Annotation|null>());
 useEffect(()=>{let live=true;void window.door.request<Card>({kind:'card',path:card.path}).then(c=>{if(live){setLoaded(c);setError('');}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[card.path,card.revision]);
 const draft=context?.session.state.draft,body=draft?.card.id===card.id?draft.body:loaded?.body??'';
 const change=(value:Annotation|null,id:string)=>{
  if(!context)return;pending.current.set(id,value);
  const apply=()=>{const current=context.session.state.draft;if(current?.card.id===card.id&&pending.current.get(id)===value)context.session.edit(updateAnnotation(current.body,value,id));};
  if(context.session.state.draft?.card.id===card.id)apply();else void context.session.select(card.path).then(apply).catch(e=>context.session.update({error:String(e)}));
 };
 const add=(attrs:Omit<Annotation,'id'|'kind'|'text'>={},note=true)=>{const id=(attrs.quote?'a-':'n-')+crypto.randomUUID();change({id,kind:attrs.quote?'highlight':'note',text:'',...attrs},id);if(note)setExpanded(id);};
 return {context,body,expanded,setExpanded,change,add,error};
}
export function BoardAnnotations({card,openNote}:{card:CardInfo;openNote?:string}){
 const {context,body,expanded,setExpanded,change,add,error}=useAssetAnnotations(card);
 useEffect(()=>{if(openNote)setExpanded(openNote);},[openNote]);
 if(!context)return null;
 return <>{error&&<p role="alert">{error}</p>}<AnnotationRail compact path={card.path} body={body} cards={context.snapshot.cards} expanded={expanded} onExpanded={setExpanded} onChange={change} onJump={()=>context.onPreview?.('card:'+card.id)} onAdd={()=>add()}/></>;
}
