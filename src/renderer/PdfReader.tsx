import {createPortal} from 'react-dom';
import {BOARD_CAMERA_EVENT} from './navigation';
import {overlayContainer} from './Overlays';
import {readingText} from '../text/reading';
import {matchesBinding} from '../keybindings';
import {ViewBlockContext} from './ViewBlock';
import {useContext,useEffect,useRef,useState,type CSSProperties} from 'react';
import type {PDFDocumentProxy,PDFPageProxy} from 'pdfjs-dist';
import type {Annotation,ReadingSource} from '../reading';
import {assetPath} from './markdown';
import {Icon,Tool} from './Icons';
const library=()=>import('pdfjs-dist').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=new URL('./pdf-assets/pdf.worker.min.mjs',window.location.href).href;return pdf;});
export function visiblePdfPage(reader:HTMLElement,viewport=reader){
  const box=viewport.getBoundingClientRect(),top=Math.max(box.top,reader.querySelector('.pdf-reader-toolbar')?.getBoundingClientRect().bottom??box.top);let visible:HTMLElement|undefined,overlap=0;
  for(const el of reader.querySelectorAll<HTMLElement>('[data-pdf-page]')){const r=el.getBoundingClientRect();if(r.top>=box.bottom)break;const amount=Math.max(0,Math.min(r.bottom,box.bottom)-Math.max(r.top,top));if(amount>overlap){visible=el;overlap=amount;}}
  return visible?Number(visible.dataset.pdfPage):undefined;
}
export function PdfReader({source,path,annotations,onAnnotate,onPage,onJump,onSource,initialPage=1,singlePage=false,renderZoom=1,onAnnotation,onRevealPage}:{source:ReadingSource;path:string;annotations:Annotation[];onAnnotate:(annotation:Omit<Annotation,'id'|'kind'|'text'>,note:boolean)=>void;onPage:(page:number)=>void;onJump?:string;onSource?:(checksum:string)=>void;initialPage?:number;singlePage?:boolean;renderZoom?:number;onAnnotation?:(id:string)=>void;onRevealPage?:(page:HTMLElement)=>void}){
  const context=useContext(ViewBlockContext);const bindings=useRef(context?.snapshot.preferences?.keybindings);bindings.current=context?.snapshot.preferences?.keybindings;
  const root=useRef<HTMLDivElement>(null),[document,setDocument]=useState<PDFDocumentProxy|null>(null),[sizes,setSizes]=useState<{width:number;height:number}[]>([]),[error,setError]=useState(''),[width,setWidth]=useState(600),[zoom,setZoom]=useState(1),[page,setPage]=useState(initialPage),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),[reload,setReload]=useState(0),[checksum,setChecksum]=useState('');
  const pageRef=useRef(page);pageRef.current=page;
  const reportPage=(next:number)=>{if(next!==pageRef.current){pageRef.current=next;setPage(next);onPage(next);}};
  const searchInput=useRef<HTMLInputElement>(null);
  const [selection,setSelection]=useState<{quote:string;page:number;rects:number[][];anchors:{page:number;rects:number[][]}[];x:number;y:number}|null>(null),selectionRef=useRef(selection);selectionRef.current=selection;
  useEffect(()=>{const el=root.current!;const resize=new ResizeObserver(()=>setWidth(Math.max(80,el.clientWidth-(el.closest('.board-pdf')?0:32))));resize.observe(el);return()=>resize.disconnect();},[]);
  useEffect(()=>{let live=true,dispose:()=>void=()=>{};setError('');setDocument(null);setSizes([]);void(async()=>{if(!source.file)throw new Error('PDF source path is missing.');const pdf=await library(),data=await window.door.attachmentData(assetPath(path,source.file));if(!live)return;const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(data));if(live){const checksum=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');setChecksum(checksum);onSource?.(checksum);}if(!live)return;const task=pdf.getDocument({data,cMapUrl:new URL('./pdf-assets/cmaps/',window.location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./pdf-assets/standard_fonts/',window.location.href).href,wasmUrl:new URL('./pdf-assets/wasm/',window.location.href).href});dispose=()=>void task.destroy();const doc=await task.promise;if(doc.numPages>5000)throw new Error('This PDF has more than 5,000 pages.');const dimensions=await Promise.all(Array.from({length:doc.numPages},(_,i)=>doc.getPage(i+1).then(p=>{const v=p.getViewport({scale:1});return {width:v.width,height:v.height};})));if(live){setSizes(dimensions);setDocument(doc);}})().catch(e=>{if(live)setError(String(e));});return()=>{live=false;dispose();};},[path,source.file,reload]);
  const jump=(number:number,reveal=true)=>{
    const next=Math.max(1,Math.min(document?.numPages??number,number));reportPage(next);
    if(!singlePage){const el=root.current,target=el?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`);if(target&&onRevealPage){if(reveal)onRevealPage(target);}else if(el&&target){const ratio=el.getBoundingClientRect().width/el.offsetWidth||1;el.scrollTop+=(target.getBoundingClientRect().top-el.getBoundingClientRect().top)/ratio-(el.querySelector<HTMLElement>('.pdf-reader-toolbar')?.offsetHeight??0);}}
  };
  useEffect(()=>{if(document)jump(initialPage,false);},[document]);
  useEffect(()=>{if(document&&initialPage!==page)jump(initialPage,false);},[initialPage]);
  useEffect(()=>{if(singlePage&&root.current)root.current.scrollTop=0;else if(document)jump(page,false);},[singlePage]);
  useEffect(()=>{const a=annotations.find(a=>a.id===onJump);if(a?.page&&(!a.source||a.source===checksum))jump(a.page);},[onJump]);
  useEffect(()=>{
    if(!onRevealPage||singlePage)return;const viewport=root.current?.closest<HTMLElement>('.canvas');if(!viewport)return;
    const update=()=>{const next=visiblePdfPage(root.current!,viewport);if(next!==undefined)reportPage(next);setSelection(null);};
    viewport.addEventListener(BOARD_CAMERA_EVENT,update);return()=>viewport.removeEventListener(BOARD_CAMERA_EVENT,update);
  },[document,singlePage,onPage,onRevealPage]);
  const choose=()=>{const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount||!root.current?.contains(sel.anchorNode)||!root.current.contains(sel.focusNode)){setSelection(null);return;}const range=sel.getRangeAt(0),quote=sel.toString().trim();if(!quote){setSelection(null);return;}const anchors=[...root.current.querySelectorAll<HTMLElement>('[data-pdf-page]')].flatMap(el=>{const p=el.getBoundingClientRect(),rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0&&r.top<p.bottom&&r.bottom>p.top&&r.left<p.right&&r.right>p.left).map(r=>[(Math.max(r.left,p.left)-p.left)/p.width,(Math.max(r.top,p.top)-p.top)/p.height,(Math.min(r.right,p.right)-Math.max(r.left,p.left))/p.width,(Math.min(r.bottom,p.bottom)-Math.max(r.top,p.top))/p.height]);return rects.length?[{page:Number(el.dataset.pdfPage),rects}]:[];});if(!anchors.length)return;const r=range.getBoundingClientRect();setSelection({quote,...anchors[0],anchors,x:r.left,y:r.top});};
  const annotate=(note:boolean)=>{const value=selectionRef.current;if(!value)return;onAnnotate({quote:value.quote,page:value.page,rects:value.rects,anchors:value.anchors,source:checksum,color:'#e6bb50'},note);setSelection(null);window.getSelection()?.removeAllRanges();};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(matchesBinding(e,'readerSearch',bindings.current,window.door.platform)){e.preventDefault();searchInput.current?.focus();searchInput.current?.select();return;}if(!(e.target instanceof HTMLElement)||e.target.closest('input,textarea,[contenteditable=true]'))return;if(matchesBinding(e,'readerHighlight',bindings.current,window.door.platform)&&selectionRef.current){e.preventDefault();e.stopPropagation();annotate(false);}if(matchesBinding(e,'readerNote',bindings.current,window.door.platform)&&selectionRef.current){e.preventDefault();e.stopPropagation();annotate(true);}};root.current?.addEventListener('keydown',key);return()=>root.current?.removeEventListener('keydown',key);},[checksum]);
  const search=async()=>{if(!document||!query.trim())return;setSearching(true);try{for(let i=page;i<=document.numPages+page-1;i++){const number=(i-1)%document.numPages+1,p=await document.getPage(number),content=await p.getTextContent();if(content.items.map(item=>'str' in item?item.str:'').join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())){jump(number);setError('');return;}}setError('No matching text.');}catch(e){setError(String(e));}finally{setSearching(false);}};
  useEffect(()=>{const clear=()=>{if(window.getSelection()?.isCollapsed)setSelection(null);};window.document.addEventListener('selectionchange',clear);return()=>window.document.removeEventListener('selectionchange',clear);},[]);
  const board=!!root.current?.closest('.board-pdf'),scale=(board?width/Math.max(1,...sizes.map(p=>p.width)):Math.min(width/Math.max(1,...sizes.map(p=>p.width)),1.5))*zoom;
  const pixelRatio=Math.ceil(Math.max(1,Math.min(4,(window.devicePixelRatio||1)*renderZoom))*2)/2;

  return <div className="pdf-reader" ref={root} tabIndex={0} onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onWheel={e=>{if(!e.ctrlKey&&!e.metaKey&&e.currentTarget.scrollHeight>e.currentTarget.clientHeight)e.stopPropagation();}} onMouseUp={choose} onKeyUp={choose} onClick={e=>{
      if(!window.getSelection()?.isCollapsed)return;const el=(e.target as HTMLElement).closest<HTMLElement>('[data-pdf-page]');if(!el)return;const box=el.getBoundingClientRect(),x=(e.clientX-box.left)/box.width,y=(e.clientY-box.top)/box.height;
      const annotation=annotations.find(a=>(!a.source||a.source===checksum)&&(a.anchors?.find(p=>p.page===Number(el.dataset.pdfPage))?.rects??(a.page===Number(el.dataset.pdfPage)?a.rects:[])??[]).some(r=>x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3]));if(annotation)onAnnotation?.(annotation.id);
    }} onScroll={()=>{setSelection(null);if(singlePage)return;const next=visiblePdfPage(root.current!);if(next!==undefined)reportPage(next);}}>
    <div className="pdf-reader-toolbar"><Tool icon="back" label={readingText.previousPdfPage} disabled={page<=1||!document} onClick={()=>jump(page-1)}/><Tool icon="forward" label={readingText.nextPdfPage} disabled={!document||page>=document.numPages} onClick={()=>jump(page+1)}/><form onSubmit={e=>{e.preventDefault();jump(page);}}><input type="number" aria-label={readingText.pdfPage} min={1} max={document?.numPages??1} value={page} onChange={e=>jump(Math.max(1,Number(e.target.value)))}/><span>/ {document?.numPages??'…'}</span></form><span className="pdf-zoom-tools"><Tool icon="minus" label={readingText.zoomOutPdf} onClick={()=>setZoom(z=>Math.max(.5,z-.1))}/><button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><Tool icon="plus" label={readingText.zoomInPdf} onClick={()=>setZoom(z=>Math.min(4,z+.1))}/></span><form className="pdf-search" onSubmit={e=>{e.preventDefault();void search();}}><input ref={searchInput} aria-label={readingText.searchPdf} placeholder={readingText.searchPdf} value={query} onChange={e=>setQuery(e.target.value)}/><button disabled={searching}><Icon name="search"/></button></form><Tool icon="sync" label={readingText.reloadPdfSource} onClick={()=>setReload(n=>n+1)}/></div>
    {error&&<p role="alert" className="reader-message">{error}</p>}{source.sha256&&checksum&&source.sha256!==checksum&&<p className="reader-message">{readingText.theSourceChangedEarlierHighlightPositionsAreUnresolved}</p>}
    {!document&&!error&&<p className="reader-message">{readingText.loadingPdf}</p>}
    {document&&sizes.map((size,i)=>!singlePage||i+1===page?<PdfPage key={reload+':'+i} pdf={document} page={i+1} size={size} scale={scale} pixelRatio={pixelRatio} annotations={annotations.filter(a=>!a.source||a.source===checksum)}/>:null)}
    {selection&&createPortal(<div className="reader-selection-tools" style={{left:Math.max(8,selection.x),top:Math.max(8,selection.y-38)}} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}}><button onClick={()=>annotate(false)}>{readingText.highlight}</button><button onClick={()=>annotate(true)}>{readingText.addNote}</button></div>,overlayContainer(root.current))}
  </div>;
}
function PdfPage({pdf,page,size,scale,pixelRatio,annotations}:{pdf:PDFDocumentProxy;page:number;size:{width:number;height:number};scale:number;pixelRatio:number;annotations:Annotation[]}){
  const ref=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{root:ref.current?.closest('.board-pdf')?.closest('.canvas')??ref.current?.closest('.pdf-reader'),rootMargin:'800px'});observer.observe(ref.current!);return()=>observer.disconnect();},[]);
  return <div className="pdf-page" data-pdf-page={page} ref={ref} style={{width:size.width*scale,height:size.height*scale,'--scale-factor':scale,'--total-scale-factor':scale,'--user-unit':1} as CSSProperties}>
    {visible&&<PdfCanvas key={scale} pdf={pdf} page={page} scale={scale} pixelRatio={pixelRatio}/>}
    {annotations.flatMap(a=>(a.anchors?.find(v=>v.page===page)?.rects??(a.page===page?a.rects:[])??[]).map((r,i)=><span key={a.id+':'+i} data-annotation={a.id} className="pdf-highlight" style={{left:r[0]*100+'%',top:r[1]*100+'%',width:r[2]*100+'%',height:r[3]*100+'%',background:a.color??'#e6bb50'}}/>))}
  </div>;
}
function PdfCanvas({pdf,page,scale,pixelRatio}:{pdf:PDFDocumentProxy;page:number;scale:number;pixelRatio:number}){
  const canvas=useRef<HTMLCanvasElement>(null),text=useRef<HTMLDivElement>(null),[error,setError]=useState('');
  useEffect(()=>{
    let live=true,render:ReturnType<PDFPageProxy['render']>|undefined,textLayer:{cancel:()=>void}|undefined;
    void(async()=>{const pdfjs=await library(),item=await pdf.getPage(page),viewport=item.getViewport({scale});if(!live)return;const ratio=Math.min(pixelRatio,Math.sqrt(16_000_000/(viewport.width*viewport.height))),el=canvas.current!;el.width=Math.ceil(viewport.width*ratio);el.height=Math.ceil(viewport.height*ratio);el.style.width=viewport.width+'px';el.style.height=viewport.height+'px';render=item.render({canvas:el,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});await render.promise;if(!live)return;text.current!.replaceChildren();const layer=new pdfjs.TextLayer({textContentSource:await item.getTextContent(),container:text.current!,viewport});textLayer=layer;await layer.render();})().catch(e=>{if(live&&e.name!=='RenderingCancelledException')setError(String(e));});
    return()=>{live=false;render?.cancel();textLayer?.cancel();};
  },[pdf,page,scale,pixelRatio]);
  return <><canvas ref={canvas}/><div ref={text} className="textLayer"/>{error&&<p role="alert">{error}</p>}</>;
}
