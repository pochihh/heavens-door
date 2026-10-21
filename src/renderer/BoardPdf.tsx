import type {PdfPageBox} from './annotation-layout';
import {useEffect,useState} from 'react';
import type {CardInfo,Placement} from '../shared';
import {annotationView} from '../reading';
import {AnnotationRail,useAssetAnnotations} from './Annotations';
import {PdfReader} from './PdfReader';
import {PdfNoteLink} from './PdfNoteLink';
import {Tool} from './Icons';
import {TitleContent} from './TitleContent';
import {titlePreview} from './markdown';
import {readingText} from '../text/reading';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';

export function BoardPdf({card,width,settings,zoom,collapsed=false,active=false,onResize,onRevealPage,onPage,onShowNotes,onMore,onCollapse,onOpen,onSelect,onLayout}:{card:CardInfo;width:number;settings:Placement['pdf'];zoom:number;collapsed?:boolean;active?:boolean;onResize?:React.PointerEventHandler<HTMLButtonElement>;onRevealPage:(page:HTMLElement)=>void;onPage:(page:number)=>void;onShowNotes:()=>void;onMore:(anchor:HTMLButtonElement)=>void;onCollapse:()=>void;onOpen?:()=>void;onSelect?:()=>void;onLayout?:()=>void}){
 const {context,body,expanded,setExpanded,change,add,error}=useAssetAnnotations(card),[checksum,setChecksum]=useState(''),[pages,setPages]=useState<PdfPageBox[]>([]);
 const page=settings?.page??card.reading?.page??1;
 useEffect(()=>{if(!active)setExpanded(undefined);},[active]);
 const openAnnotation=(id:string)=>{const linked=annotationView(body).annotations.find(a=>a.id===id)?.cardId,target=context?.snapshot.cards.find(c=>c.id===linked);if(target)(context!.onPreview??context!.onOpen)('card:'+target.id);else{if(settings?.notes===false)onShowNotes();setExpanded(id);}};
 return <div className={'board-pdf'+(settings?.expanded?' continuous':'')} style={{'--pdf-width':width+'px'} as React.CSSProperties} onPointerDownCapture={()=>onSelect?.()} onClickCapture={()=>onSelect?.()} onFocusCapture={()=>onSelect?.()}>
  <div className="board-pdf-main">{!collapsed&&<div className="board-pdf-selection" aria-hidden="true"/>}<header className="board-pdf-heading">
   <svg className="board-pdf-icon" width="20" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/><text x="12" y="18" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6.5" fontWeight="600">{readingText.pdf}</text></svg>
   <TitleContent path={card.path} className="prose card-preview board-pdf-title" html={titlePreview({...card,title:card.title??card.name})}/><div className="board-pdf-actions card-actions">
   {onOpen&&<Tool icon="popup" label={ui.common.openInPopup} onClick={onOpen}/>}
   <Tool icon={collapsed?"down":"chevronUp"} label={collapsed?tooltips.whiteboard.expandCard:tooltips.whiteboard.collapseCard} aria-expanded={!collapsed} onClick={onCollapse}/>
   <Tool className="board-pdf-more" icon="more" label={readingText.pdfActions} aria-haspopup="menu" onClick={e=>onMore(e.currentTarget)}/>
  </div></header>
  {!collapsed&&<PdfReader onLayout={pages=>{setPages(pages);onLayout?.();}} path={card.path} source={card.source!} annotations={annotationView(body).annotations} initialPage={page} singlePage={!settings?.expanded} onRevealPage={settings?.expanded?onRevealPage:undefined} renderZoom={zoom} onPage={onPage} onAnnotate={attrs=>{if(settings?.notes===false)onShowNotes();add(attrs);}} onSource={setChecksum} onAnnotation={openAnnotation}/>}
  {!collapsed&&onResize&&<button className="resize-handle" aria-label={ui.whiteboard.resize(card.name)} onPointerDown={onResize}/>}</div>
  {!collapsed&&error&&<p role="alert">{error}</p>}
  {!collapsed&&settings?.notes!==false&&context&&<AnnotationRail compact previewLimit={5} active={active} pages={pages} sourceHash={checksum} page={settings?.expanded?undefined:page} path={card.path} body={body} cards={context.snapshot.cards} expanded={expanded} onExpanded={setExpanded} onChange={change}/>}
  {!collapsed&&settings?.notes!==false&&<PdfNoteLink id={expanded} color={annotationView(body).annotations.find(a=>a.id===expanded)?.color} pages={pages}/>}
 </div>;
}
