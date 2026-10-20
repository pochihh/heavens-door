import {useState} from 'react';
import type {CardInfo,Placement} from '../shared';
import {annotationView} from '../reading';
import {AnnotationRail,useAssetAnnotations} from './Annotations';
import {PdfReader} from './PdfReader';
import {Tool} from './Icons';
import {readingText} from '../text/reading';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';

export function BoardPdf({card,settings,zoom,onRevealPage,onPage,onShowNotes,onMore,onCollapse,onOpen}:{card:CardInfo;settings:Placement['pdf'];zoom:number;onRevealPage:(page:HTMLElement)=>void;onPage:(page:number)=>void;onShowNotes:()=>void;onMore:(anchor:HTMLButtonElement)=>void;onCollapse:()=>void;onOpen?:()=>void}){
 const {context,body,expanded,setExpanded,change,add,error}=useAssetAnnotations(card),[jump,setJump]=useState<string>(),[checksum,setChecksum]=useState('');
 const page=settings?.page??card.reading?.page??1;
 return <div className={'board-pdf'+(settings?.expanded?' continuous':'')}>
  <header className="board-pdf-heading"><span className="board-pdf-title">{card.title||card.name}</span><div className="board-pdf-actions">
   {onOpen&&<Tool icon="external" label={ui.common.openInPopup} onClick={onOpen}/>}
   <Tool icon="chevronUp" label={tooltips.whiteboard.collapseCard} onClick={onCollapse}/>
   <Tool icon="more" label={readingText.pdfActions} aria-haspopup="menu" onClick={e=>onMore(e.currentTarget)}/>
  </div></header>
  <PdfReader path={card.path} source={card.source!} annotations={annotationView(body).annotations} initialPage={page} singlePage={!settings?.expanded} onRevealPage={settings?.expanded?onRevealPage:undefined} renderZoom={zoom} onPage={onPage} onAnnotate={(attrs,note)=>{if(note&&settings?.notes===false)onShowNotes();add(attrs,note);}} onSource={setChecksum} onJump={jump} onAnnotation={id=>{if(settings?.notes===false)onShowNotes();setExpanded(id);}}/>
  {error&&<p role="alert">{error}</p>}
  {settings?.notes!==false&&context&&<AnnotationRail compact sourceHash={checksum} page={settings?.expanded?undefined:page} path={card.path} body={body} cards={context.snapshot.cards} expanded={expanded} onExpanded={setExpanded} onChange={change} onJump={id=>{setJump(undefined);requestAnimationFrame(()=>setJump(id));}}/>}
 </div>;
}
