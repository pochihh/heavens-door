import {dragAssetNote} from './asset-note-drag';
import {readingText} from '../text/reading';
import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {DEFAULT_ANNOTATION_COLOR,annotationView,annotationOnPage,updateAnnotation,type Annotation} from '../reading';
import type {Card,CardInfo} from '../shared';
import {AnnotationEditor} from './AnnotationEditor';
import {annotationPositions,type PdfPageBox} from './annotation-layout';
import {Tool} from './Icons';
import {PropertyPopover} from './PropertyValue';
import {Color} from './StyleView';
import {DEFAULT_PALETTE} from '../colors';
import {ViewBlockContext} from './ViewBlock';
import {useConfirmation} from './Confirmation';
export function AnnotationRail({body,path,cards,expanded,onExpanded,onChange,onJump,onAdd,sourceHash,compact=false,page,pages,previewLimit,active=true}:{body:string;path:string;cards:CardInfo[];expanded?:string;onExpanded:(id:string|undefined)=>void;onChange:(value:Annotation|null,id:string)=>void;onJump?:(id:string)=>void;onAdd?:()=>void;sourceHash?:string;compact?:boolean;page?:number;pages?:PdfPageBox[];previewLimit?:number;active?:boolean}){
 const cancelDrag=useRef(()=>{}),rail=useRef<HTMLElement>(null),[heights,setHeights]=useState<Record<string,number>>({}),[colorPicker,setColorPicker]=useState<{id:string;anchor:HTMLButtonElement}>(),[shownPages,setShownPages]=useState<number[]>([]);useEffect(()=>()=>cancelDrag.current(),[]);
 const linkedCards=new Set(cards.map(card=>card.id)),annotations=annotationView(body).annotations.filter(a=>annotationOnPage(a,page)&&(!a.cardId||!linkedCards.has(a.cardId))),context=useContext(ViewBlockContext),palette=context?.snapshot.preferences?.palette??DEFAULT_PALETTE,confirm=useConfirmation();
 const groups=new Map<number,Annotation[]>();for(const a of annotations){const number=page??a.page??a.anchors?.[0]?.page??pages?.[0]?.page??1,items=groups.get(number)??[];items.push(a);groups.set(number,items);}
 const visible=previewLimit?[...groups].flatMap(([number,items])=>active&&shownPages.includes(number)?items:items.slice(0,previewLimit)):annotations;
 const more=previewLimit?[...groups].filter(([,items])=>items.length>previewLimit).map(([number,items])=>({id:'more:'+number,page:number,count:items.length-previewLimit,open:active&&shownPages.includes(number)})):[];
 const items=[...visible.map(a=>({id:a.id,page:page??a.page??a.anchors?.[0]?.page,height:heights[a.id]??42})),...more.map(m=>({id:m.id,page:m.page,height:heights[m.id]??32}))];
 useEffect(()=>{if(!active)setShownPages([]);},[active]);
 const expandedPage=previewLimit?[...groups].find(([,items])=>items.findIndex(a=>a.id===expanded)>=previewLimit)?.[0]:undefined;
 useEffect(()=>{if(active&&expandedPage!==undefined)setShownPages(old=>old.includes(expandedPage)?old:[...old,expandedPage]);},[expanded,expandedPage]);
 const visibleIds=items.map(item=>item.id).join(',');
 useLayoutEffect(()=>{const root=rail.current!;
  const measure=()=>{const next:Record<string,number>={};root.querySelectorAll<HTMLElement>('[data-note-id],[data-note-more]').forEach(el=>{
   const details=el.querySelector<HTMLElement>('.annotation-details'),heading=el.querySelector<HTMLElement>('.sticky-note-heading'),style=getComputedStyle(el);
   // Pack the final height once; sampling the animated height makes neighboring notes chase it.
   const height=details&&heading?heading.offsetHeight+['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key as keyof CSSStyleDeclaration] as string)||0),0)+(details.dataset.open==='true'?(details.firstElementChild?.scrollHeight??0):0):el.offsetHeight;
   if(height>0)next[el.dataset.noteId??el.dataset.noteMore!]=height;
  });setHeights(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};
  measure();const observer=new ResizeObserver(measure);root.querySelectorAll('[data-note-id],[data-note-more],.annotation-details>div').forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[body,expanded,visibleIds]);
 const positions=pages?annotationPositions(items,pages):undefined;
 const colorNote=annotations.find(a=>a.id===colorPicker?.id&&a.id===expanded);
 const notesHeight=positions?Math.max(0,...items.map(a=>(positions.get(a.id)?.top??0)+a.height)):undefined;
 const positionStyle=(id:string):React.CSSProperties=>{const position=positions?.get(id);return position?{position:'absolute',top:position.top,left:position.column*228,width:220}:{};};
 return <aside ref={rail} className={'annotation-rail'+(compact?' board-annotation-rail':'')+(pages?' page-aligned-notes':'')} style={pages?{'--annotation-columns':Math.max(1,...[...positions!.values()].map(p=>p.column+1)),...(compact?{height:notesHeight}:{} )} as React.CSSProperties:undefined} aria-label={readingText.annotations} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  {!previewLimit&&<div className="annotation-heading"><span>{readingText.notes}{annotations.length?' · '+annotations.length:''}</span>{onAdd&&<Tool icon="plus" label={readingText.addGeneralCardNote} onClick={onAdd}/>}</div>}
  {visible.map(a=>{const open=expanded===a.id;return <section key={a.id} data-note-id={a.id} className={'sticky-note'+(open?' expanded':'')+(!a.color?' uncolored':'')} style={{'--note-color':a.color??'transparent',...positionStyle(a.id)} as React.CSSProperties}>
    <div className="sticky-note-heading"><button className="sticky-preview" onPointerDown={e=>{if(!context||!a.text.trim()&&!a.quote?.trim())return;cancelDrag.current();cancelDrag.current=dragAssetNote(e,()=>({key:'asset-note:'+a.id,path,note:{id:a.id,expected:context.session.state.snapshot?.cards.find(c=>c.path===path)?.revision??''}}));}} aria-expanded={open} aria-label={readingText.openNote+': '+(a.text||a.quote||readingText.emptyNote).split('\n')[0]} onClick={()=>{setColorPicker(undefined);onExpanded(open?undefined:a.id);if(!open)onJump?.(a.id);}}><span>{(a.text||a.quote||readingText.emptyNote).replace(/[#*_`]/g,'').split('\n')[0]}</span></button>{open&&<Tool icon="trash" className="danger" label={readingText.deleteAnnotation} onClick={()=>{void confirm({title:readingText.deleteAnnotation,message:a.text||a.quote||readingText.deleteAnnotation,accept:readingText.delete,danger:true}).then(yes=>{if(yes)onChange(null,a.id);});}}/>}</div>
    <AnnotationDetails open={open}>{a.quote&&<blockquote className="sticky-quote">{a.quote}</blockquote>}
      <AnnotationEditor path={path} text={a.text} onChange={text=>onChange({...a,text},a.id)}/>
      <div className="annotation-color"><Tool icon="art" label={readingText.highlightColor} aria-haspopup="dialog" aria-expanded={colorNote?.id===a.id} onClick={e=>setColorPicker(colorNote?.id===a.id?undefined:{id:a.id,anchor:e.currentTarget})}/></div>
      {(a.unresolved||a.source&&sourceHash&&a.source!==sourceHash||a.kind==='highlight'&&!body.includes(`data-annotation="${a.id}"`)&&!a.page)&&<small className="annotation-unresolved">{readingText.thePassageIsUnresolvedYourNoteIsPreserved}</small>}
    </AnnotationDetails>
  </section>;})}
  {more.map(m=><button key={m.id} data-note-more={m.id} className="annotation-more" style={positionStyle(m.id)} aria-expanded={m.open} onClick={()=>{setShownPages(old=>m.open?old.filter(p=>p!==m.page):[...old,m.page]);if(m.open&&groups.get(m.page)!.slice(previewLimit).some(a=>a.id===expanded))onExpanded(undefined);}}>{m.open?readingText.showFewerComments:readingText.showMoreComments(m.count)}</button>)}

  {colorPicker&&colorNote&&<PropertyPopover anchor={colorPicker.anchor} label={readingText.highlightColor} onClose={()=>setColorPicker(undefined)}><Color label={readingText.highlightColor} palette={palette} emptyLabel={readingText.noColor} value={colorNote.color??''} onChange={color=>onChange({...colorNote,color},colorNote.id)}/></PropertyPopover>}
 </aside>;
}
function AnnotationDetails({open,children}:{open:boolean;children:React.ReactNode}){
 const [present,setPresent]=useState(open);
 useEffect(()=>{if(open){setPresent(true);return;}if(!present)return;const timer=setTimeout(()=>setPresent(false),360);return()=>clearTimeout(timer);},[open,present]);
 return <div className="annotation-details" data-open={open} data-present={open||present} aria-hidden={!open} inert={!open} onTransitionEnd={e=>{if(e.target===e.currentTarget&&!open)setPresent(false);}}><div>{(open||present)&&children}</div></div>;
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
 const add=(attrs:Omit<Annotation,'id'|'kind'|'text'>={},note=true)=>{const id=(attrs.quote?'a-':'n-')+crypto.randomUUID();change({id,kind:attrs.quote?'highlight':'note',text:'',color:DEFAULT_ANNOTATION_COLOR,...attrs},id);if(note)setExpanded(id);};
 return {context,body,expanded,setExpanded,change,add,error};
}
export function BoardAnnotations({card,openNote}:{card:CardInfo;openNote?:string}){
 const {context,body,expanded,setExpanded,change,add,error}=useAssetAnnotations(card);
 useEffect(()=>{if(openNote)setExpanded(openNote);},[openNote]);
 if(!context)return null;
 return <>{error&&<p role="alert">{error}</p>}<AnnotationRail compact path={card.path} body={body} cards={context.snapshot.cards} expanded={expanded} onExpanded={setExpanded} onChange={change} onJump={()=>context.onPreview?.('card:'+card.id)} onAdd={()=>add()}/></>;
}
