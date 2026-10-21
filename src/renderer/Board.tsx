import {binding,matchesBinding} from '../keybindings';
import {flushSync} from 'react-dom';
import {topicText,textNeighbor,type TextNavigation} from '../topics';
import {readingText} from '../text/reading';
import {BoardObject} from './BoardObject';
import {BoardAnnotations} from './Annotations';
import {BoardPdf} from './BoardPdf';
import {imageHtml} from './image-layout';
import {imageFiles,imageTransferUrl} from './editor-images';
import {clearDocumentDrop,dropDocumentAt,previewDocumentDrop,type DocumentDrag} from './card-drop';
import {createDragPhantom} from './sortable';
import { cardFill, tintColor } from '../colors';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import { Edges } from './Edges';
import { edgeGeometry, opposite } from './edge-geometry';
import type { BoardSelection } from './StyleView';
import type {AnchorSide,Edge} from '../shared';
import type { Mention } from '../shared';
import type { NavigationMode } from '../layout';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { placementHeight, type Board, type Card, type CardInfo, type EdgeStyle, type Placement, type Preferences, type WhiteboardInput } from '../shared';
import { leadingTitle } from '../card-title';
import { parent, portable } from './documents';
import { preview, titlePreview } from './markdown';
import { BoardNavigation, type Camera } from './navigation';
import { Icon, Tool } from './Icons';
import { InlineName } from './InlineName';
import {ReferencePicker} from './ReferencePicker';
import {PropertyPopover} from './PropertyValue';
import { ActionMenu, type MenuState } from './Overlays';
import {TitleContent} from './TitleContent';
import { CardEditor, type EditorFocus } from './Editor';
import type { ReactNode } from 'react';

export function isVisible(p: Placement, camera: Camera, width: number, height: number, margin = 160, footprint = placementHeight(p)) {
  return (p.x + p.width) * camera.zoom + camera.x > -margin && p.x * camera.zoom + camera.x < width + margin &&
    (p.y + footprint) * camera.zoom + camera.y > -margin && p.y * camera.zoom + camera.y < height + margin;
}
const Preview = memo(function Preview({ card, onOpen, cache, onReady, collapsed=false }: {
  card: CardInfo; collapsed?:boolean; onOpen: (id: string) => void; cache: Map<string, string>; onReady:()=>void;
}) {
  const key = `${card.path}:${card.revision}`;
  const [content,setContent]=useState({key,html:cache.get(key)??''});
  const {html}=content,ready=content.key===key&&!!html;
  useEffect(() => {
    if(collapsed)return;
    let live = true;
    const cached = cache.get(key);
    if (cached !== undefined) { setContent({key,html:cached}); return; }
    void window.door.request<Card>({ kind: 'card', path: card.path }).then(c => {
      const rendered = preview(c.body, c.path);
      // Bound previews to 256 entries of at most 32k characters each (same memory ceiling).
      if (rendered.length <= 32000 && c.revision === card.revision) {
        if (cache.size >= 256) cache.delete(cache.keys().next().value!);
        cache.set(key, rendered);
      }
      if (live) setContent({key,html:rendered});
    }).catch(() => { if (live) setContent({key,html:'<p>'+ui.whiteboard.cardUnavailable+'</p>'}); });
    return () => { live = false; };
  }, [card.path, card.revision, key, cache, collapsed]);
  const summary=useMemo(()=>collapsed?titlePreview(card):'',[collapsed,card.title,card.titleMarkdown,card.path]);
  useLayoutEffect(()=>{if(ready||collapsed)onReady();},[html,ready,collapsed,onReady]);

  return <TitleContent path={card.path} data-ready={ready||collapsed} className="prose card-preview" onClick={e => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (href) { e.preventDefault(); if (href.startsWith('card:')) onOpen(href.slice(5)); }
  }} html={collapsed?summary:html||preview('',card.path)} />;
});
interface Props {
  keybindings?:Preferences['keybindings'];hasCopiedStyle?:boolean;onCopyStyle?:(base:Board,placements:string[],edges:string[])=>Promise<void>;onPasteStyle?:(base:Board,placements:string[],edges:string[])=>Promise<void>;
  onConvertTopics?:(base:Board,ids:string[])=>Promise<CardInfo[]>;
  addTagActions?:(card:CardInfo)=>import('./Overlays').MenuAction[];reveal?:{placement:string;token:number};onRevealed?:()=>void;onOpenCard?:(id:string,mode?:import('../layout').NavigationMode|'popup')=>void;
  textDefaults?:Preferences['whiteboardText'];edgeDefaults?:EdgeStyle;
  mentions?:Mention[]; onSelection?:(selection:BoardSelection)=>void; onStyle?:()=>void;
  inputMode?: WhiteboardInput; onCycleInput?: () => void;
  enabled?: boolean; initialCamera?: Camera; onCamera?: (camera:Camera)=>void; boards?: Board[]; onOpenFolder?: (folder:string,mode?:NavigationMode)=>void; onReference?: (id:string)=>void;
  onDelete?:(board:Board,placements:string[],edges:string[])=>Promise<boolean>;
  onPlaceReference?:(id:string,x:number,y:number)=>Promise<void>;onCreateReference?:(name:string,x:number,y:number)=>Promise<void>;
  onRename?:(id:string,stem:string)=>Promise<void>;
  board: Board; cards: CardInfo[]; onSave: (board: Board, label: string, base: Board) => void | Promise<void>;
  onOpen: (path: string) => void; onCreate: (x: number, y: number) => void; onCreateBoard?:(x:number,y:number)=>void;
  onTitleDone?:()=>void;draft?: { card: Card; body: string } | null; onEdit?: (body: string,label?:string) => void; onFinish?: () => void; cardDetails?: ReactNode;
}
interface Gesture {
  type: 'pan' | 'move' | 'resize' | 'select'; ids: string[]; x: number; y: number; pointerId: number;
  board: Board; camera: Camera; rect: DOMRect; button:number; additive: boolean; initialSelection: string[]; initialEdges:string[];
  moved: boolean; resizeHeight?:number; editOnClick?: {id:string;focus:EditorFocus};
}
const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');

const autoHeight=(p:Placement)=>!p.object&&!p.folder&&p.autoHeight!==false;
const heightKey=(p:Placement)=>p.id+(p.collapsed?':collapsed':':expanded');

export const Whiteboard = memo(function Whiteboard({ keybindings,hasCopiedStyle,onCopyStyle,onPasteStyle,onConvertTopics,addTagActions,reveal,onRevealed,onOpenCard,textDefaults,edgeDefaults, mentions=[], onSelection, onStyle, board, cards, onSave, onOpen, onCreate, onCreateBoard, draft, onTitleDone, onEdit, onFinish, cardDetails, inputMode='auto', onCycleInput, enabled=true, initialCamera, onCamera, boards=[], onOpenFolder, onReference, onRename, onDelete, onPlaceReference,onCreateReference }: Props) {
  const imageImportLive=useRef(true);
  const [objectError,setObjectError]=useState(''),[imageDrop,setImageDrop]=useState(false);
  useEffect(()=>{imageImportLive.current=true;return()=>{imageImportLive.current=false;};},[]);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const zoomLabel = useRef<HTMLButtonElement>(null);
  const selectionBox = useRef<HTMLDivElement>(null);
  const navigation = useRef<BoardNavigation | null>(null);
  const spaceDown = useRef(false);
  const rightPress = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const pendingSave = useRef<Board | null>(null);
  const deleting=useRef(false);
  const dragFrame = useRef<number | null>(null);
  const dragPoint = useRef({ x: 0, y: 0 });
  const cache = useRef(new Map<string, string>());
  const [size, setSize] = useState({ width: 1000, height: 800 });
  const [view, setView] = useState<Camera>({ x: 20, y: 20, zoom: 0.85 });
  const [objectPreview,setObjectPreview]=useState<{id:string;width:number;x?:number}>();
  const [working, setWorking] = useState<Board | null>(null);
  const [measuredHeights,setMeasuredHeights]=useState<Record<string,{height:number;width:number;top:number;pdfHeight?:number;signature:string}>>({});
  const [contentVersion,setContentVersion]=useState(0);
  const contentReady=useCallback(()=>setContentVersion(version=>version+1),[]);
  const naturalHeight=(p:Placement)=>p.object?.type==='image'||p.object?.type==='text'||lookup.get(p.cardId)?.source?.type==='pdf'||autoHeight(p);
  const heightSignature=(p:Placement)=>p.width+':'+(p.object?JSON.stringify(p.object):lookup.get(p.cardId)?.revision??'')+':'+JSON.stringify(p.pdf);
  const measuredHeight=(p:Placement)=>{const measured=measuredHeights[heightKey(p)];return measured?.signature===heightSignature(p)?measured.height:undefined;};
  const widthOf=(p:Placement)=>objectPreview?.id===p.id?objectPreview.width:(p.object?.type==='text'||!p.collapsed&&lookup.get(p.cardId)?.source?.type==='pdf')&&measuredHeight(p)!==undefined?measuredHeights[heightKey(p)]!.width:p.width;
  const heightOf=(placement:Placement)=>{const p=placements.get(placement.id)??placement;return p.collapsed||naturalHeight(p)?(measuredHeight(p)??placementHeight(p)):p.height;};
  const geometryTop=(item:Placement)=>{const p=placements.get(item.id)??item;return !p.collapsed&&measuredHeight(p)!==undefined?measuredHeights[heightKey(p)]?.top??0:0;};
  const geometryCard=(p:Placement)=>({...p,x:xOf(p),y:p.y+geometryTop(p),width:!p.collapsed&&lookup.get(p.cardId)?.source?.type==='pdf'?p.width:widthOf(p)});
  const geometryHeight=(item:Placement)=>{const p=placements.get(item.id)??item;return measuredHeight(p)!==undefined?measuredHeights[heightKey(p)]!.pdfHeight??heightOf(p)-geometryTop(p):heightOf(p);};
  const expandedHeight=(p:Placement)=>naturalHeight(p)?(measuredHeight({...p,collapsed:false})??p.height):p.height;
  const [menu,setMenu]=useState<(MenuState&{placementId?:string})|null>(null);
  const [reference,setReference]=useState<{x:number;y:number;screenX:number;screenY:number}|null>(null),[referenceAnchor,setReferenceAnchor]=useState<HTMLSpanElement|null>(null),[referenceBusy,setReferenceBusy]=useState(false),[referenceError,setReferenceError]=useState('');
  const [dragged, setDragged] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEdges,setSelectedEdges]=useState<string[]>([]);
  const [editingPlacement, setEditingPlacement] = useState(''),[editingObject,setEditingObject]=useState('');
  const [focusPoint, setFocusPoint] = useState<EditorFocus>();
  const textOrigin=useRef<{id:string;x:number;width:number;left:boolean}|undefined>(undefined),[textReplacement,setTextReplacement]=useState<string>();
  const current = working ?? board;
  const draftTitle=useMemo(()=>draft?leadingTitle(draft.body)?.text??'':undefined,[draft?.body]);
  const active = current.cards.find(p => !p.collapsed && p.id === editingPlacement && p.cardId === draft?.card.id) ?? current.cards.find(p => !p.collapsed && p.cardId === draft?.card.id);
  const lookup = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const boardLookup = useMemo(() => new Map(boards.map(b => [b.folder, b])), [boards]);
  const branchEnds=useMemo(()=>new Map(current.edges.filter(e=>e.kind==='branch').map(e=>[e.to,e.toSide??opposite[e.fromSide??'right']])),[current.edges]);
  const xOf=(p:Placement)=>objectPreview?.id===p.id&&objectPreview.x!==undefined?objectPreview.x:p.x;
  const placements = useMemo(() => new Map(current.cards.map(p => [p.id, p])), [current.cards]);
  const openReference = useCallback((id: string) => {
    const target = lookup.get(id); if (target) { if(onReference) onReference(id); else onOpen(target.path); }
  }, [lookup, onOpen, onReference]);
  const selectionCallback=useRef(onSelection);selectionCallback.current=onSelection;
  useEffect(()=>{if(enabled)selectionCallback.current?.({path:board.path,cards:selected,edges:selectedEdges});},[enabled,board.path,selected,selectedEdges]);
  const latest = useRef({ styleShortcut,deleteSelection, board: current, onFinish, move, end, enabled, onCamera, heightOf });
  latest.current = { styleShortcut,deleteSelection, board: current, onFinish, move, end, enabled, onCamera, heightOf };

  useLayoutEffect(() => {
    const element = viewport.current!;
    const nav = new BoardNavigation(element, world.current!, grid.current!, zoomLabel.current!, camera => {setView(camera);latest.current.onCamera?.(camera);});
    if(initialCamera) { nav.set(initialCamera); nav.flush(); setView(initialCamera); }
    navigation.current = nav;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('.canvas-controls,.editor-tools,.card-details')) return;
      const reader=(event.target as HTMLElement).closest<HTMLElement>('.annotation-rail');
      if(reader&&!event.ctrlKey&&!event.metaKey&&reader.scrollHeight>reader.clientHeight)return;
      if (gesture.current) { event.preventDefault(); return; }
      nav.wheel(event);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !latest.current.enabled || document.querySelector('dialog[open],[popover][data-open="true"]')) return;
      if (event.key === 'Escape') { cancel(); setSelected([]); setSelectedEdges([]); latest.current.onFinish?.(); element.focus({preventScroll:true}); return; }
      if (editable(event.target)) return;
      if(latest.current.styleShortcut(event))return;
      if ((event.key==='Delete'||event.key==='Backspace')&&element.contains(event.target as Node)){event.preventDefault();latest.current.deleteSelection();return;}
      if (event.code === 'Space' && !event.metaKey && !event.ctrlKey && !event.altKey && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        spaceDown.current = true; element.dataset.space = 'true'; event.preventDefault();
      }
      if ((event.metaKey || event.ctrlKey) && ['=', '+', '-', '0', '1'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '1') fit();
        else nav.zoomTo(event.key === '0' ? 1 : nav.current.zoom * (event.key === '-' ? 0.9 : 1.1));
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') { spaceDown.current = false; delete element.dataset.space; }
    };
    // Capture can be lost before mouse-up on macOS. It is not a cancellation:
    // keep tracking this pointer through the document until release or pointercancel.
    const pointermove = (event: globalThis.PointerEvent) => latest.current.move(event);
    const pointerup = (event: globalThis.PointerEvent) => latest.current.end(event);
    const pointercancel = (event: globalThis.PointerEvent) => { if (gesture.current?.pointerId === event.pointerId) cancel(); };
    element.ownerDocument.addEventListener('pointermove', pointermove, true);
    element.ownerDocument.addEventListener('pointerup', pointerup, true);
    element.ownerDocument.addEventListener('pointercancel', pointercancel, true);
    const blur = () => { nav.stopWheel(); spaceDown.current = false; delete element.dataset.space; cancel(); };
    element.addEventListener('wheel', wheel, { passive: false, capture: true });
    element.ownerDocument.addEventListener('keydown', keydown);
    element.ownerDocument.addEventListener('keyup', keyup);
    element.ownerDocument.defaultView!.addEventListener('blur', blur);
    return () => {
      clearDocumentDrop();externalPhantom.current?.remove();externalPhantom.current=null;
      observer.disconnect(); latest.current.onCamera?.(nav.current); nav.dispose(); navigation.current = null;
      if (dragFrame.current !== null) element.ownerDocument.defaultView!.cancelAnimationFrame(dragFrame.current);
      element.removeEventListener('wheel', wheel, true);
      element.ownerDocument.removeEventListener('keydown', keydown);
      element.ownerDocument.removeEventListener('keyup', keyup);
      element.ownerDocument.removeEventListener('pointermove', pointermove, true);
      element.ownerDocument.removeEventListener('pointerup', pointerup, true);
      element.ownerDocument.removeEventListener('pointercancel', pointercancel, true);
      element.ownerDocument.defaultView!.removeEventListener('blur', blur);
    };
  }, []);

  useLayoutEffect(() => { navigation.current?.setInputMode(inputMode); }, [inputMode]);

  useEffect(()=>{
    if(!reveal||!enabled)return;
    const p=current.cards.find(p=>p.id===reveal.placement),nav=navigation.current,element=viewport.current;
    if(p&&nav&&element){
      setSelected([p.id]);setSelectedEdges([]);setEditingPlacement('');
      if(p.collapsed)save({...current,cards:current.cards.map(item=>item.id===p.id?{...item,collapsed:false}:item)},ui.history.expandCard);
      const {width,height}=element.getBoundingClientRect(),zoom=nav.current.zoom;
      nav.stopWheel();nav.set({...nav.current,x:(width-p.width*zoom)/2-p.x*zoom,y:Math.max(48,(height-Math.min(expandedHeight(p)*zoom,height-96))/2)-p.y*zoom});nav.flush();
      element.focus({preventScroll:true});
    }
    onRevealed?.();
  },[reveal?.token,enabled]);

  function begin(e: PointerEvent, type: Gesture['type'], ids: string[] = []) {
    const element = viewport.current!, nav = navigation.current!;
    nav.stopWheel(); nav.flush();
    e.preventDefault(); e.stopPropagation(); element.focus({ preventScroll: true });
    gesture.current = { type, ids, x: e.clientX, y: e.clientY, pointerId: e.pointerId, board: pendingSave.current ?? current,
      camera: { ...nav.current }, rect: element.getBoundingClientRect(), button:e.button,
      additive: e.shiftKey || e.metaKey || e.ctrlKey, initialSelection: selected, initialEdges:selectedEdges, moved:false,
      resizeHeight:type==='resize'?heightOf(current.cards.find(p=>p.id===ids[0])!):undefined };
    // Keep card clicks on the card; viewport capture would turn double-clicks into card creation.
    e.currentTarget.setPointerCapture(e.pointerId);
    if (type === 'pan') element.dataset.panning = 'true';
    else if (type === 'move' || type === 'resize') setDragged(ids);
  }
  function capture(e: PointerEvent) {
    const target = e.target as HTMLElement;
    // React portals still bubble through the board; floating editor controls are not canvas presses.
    if(!e.currentTarget.contains(target))return;
    rightPress.current=e.button===2;
    if (target.closest('.edge-layer,.edge-handles')) return;
    if (target.closest('.canvas-controls,.canvas-empty button,.card-editor,.pdf-reader,.annotation-rail') || editable(target)) return;
    const card = target.closest<HTMLElement>('[data-placement]');
    if (e.button === 1 || (e.button === 0 && spaceDown.current) || (e.button === 2 && !card)) {
      begin(e, 'pan'); return;
    }
    if (!card && e.button === 0) { onFinish?.(); begin(e, 'select'); }
    if (card && e.button === 2) {
      onFinish?.();
      e.preventDefault(); e.stopPropagation();
      const id = card.dataset.placement!; if (!selected.includes(id)) {setSelected([id]);setSelectedEdges([]);}
    }
  }
  function startCard(e: PointerEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,a,input,.card-editor,.pdf-reader,.annotation-rail')) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onFinish?.();
      setSelected(previous => e.shiftKey ? [...new Set([...previous, id])] : previous.includes(id) ? previous.filter(p => p !== id) : [...previous, id]);
      e.preventDefault(); e.stopPropagation(); return;
    }
    if(!selected.includes(id))setSelectedEdges([]);
    if(latest.current.board.cards.find(p=>p.id===id)?.object&&(e.target as HTMLElement).closest('textarea'))return;
    const element=e.currentTarget,body=element.querySelector<HTMLElement>('.card-preview,.card-editor .editor-body');
    const last=body?.querySelector('.tiptap')?.lastElementChild??body?.lastElementChild;
    const append=!!last&&e.clientY>last.getBoundingClientRect().bottom&&!(e.target as HTMLElement).closest('.card-drag-strip,.card-top-row');
    onFinish?.();
    const ids = selected.includes(id) ? selected : [id];
    setSelected(ids); begin(e, 'move', ids);
    // Like obsidian-whiteboard: a press is a pending drag; edit only on a quiet release.
    if((body||lookup.get(latest.current.board.cards.find(p=>p.id===id)?.cardId??'')?.source?.type==='web')&&selected.length<2)gesture.current!.editOnClick={id,focus:{x:e.clientX,y:e.clientY,scrollTop:body?.scrollTop??0,append}};
  }
  function selectRegion(g: Gesture, x: number, y: number) {
    const left = Math.min(g.x, x) - g.rect.left, top = Math.min(g.y, y) - g.rect.top;
    const width = Math.abs(x - g.x), height = Math.abs(y - g.y);
    Object.assign(selectionBox.current!.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const a = (left - g.camera.x) / g.camera.zoom, b = (top - g.camera.y) / g.camera.zoom;
    const ids = g.board.cards.filter(p => p.x <= a + width / g.camera.zoom && p.x + widthOf(p) >= a && p.y <= b + height / g.camera.zoom && p.y + heightOf(p) >= b).map(p => p.id);
    const next = g.additive ? [...new Set([...g.initialSelection, ...ids])] : ids;
    setSelected(previous => previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next);
    const edges=g.board.edges.filter(edge=>{
      const from=placements.get(edge.from),to=placements.get(edge.to);if(!from||!to)return false;
      return edgeGeometry(edge,geometryCard(from),geometryCard(to),geometryHeight).samples.some(p=>p.x>=a&&p.x<=a+width/g.camera.zoom&&p.y>=b&&p.y<=b+height/g.camera.zoom);
    }).map(e=>e.id);
    setSelectedEdges(g.additive?[...new Set([...g.initialEdges,...edges])]:edges);
  }
  const externalPhantom=useRef<HTMLElement|null>(null);
  function draggedDocument(g:Gesture):DocumentDrag|null {
    const items=g.board.cards.filter(p=>g.ids.includes(p.id)),p=items[0];if(g.type!=='move'||!p)return null;
    const left=Math.min(...items.map(p=>p.x)),top=Math.min(...items.map(p=>p.y));
    return {key:p.folder?'board:'+p.folder:'card:'+p.cardId,path:p.folder??lookup.get(p.cardId)?.path,source:board.folder,placement:p.id,
      selection:{ids:g.ids,folders:items.flatMap(p=>p.folder?[p.folder]:[]),board:g.board,offset:{x:(g.x-g.rect.left-g.camera.x)/g.camera.zoom-left,y:(g.y-g.rect.top-g.camera.y)/g.camera.zoom-top}}};
  }
  function selectionPhantom(g:Gesture){
    const items=g.board.cards.filter(p=>g.ids.includes(p.id)),left=Math.min(...items.map(p=>p.x)),top=Math.min(...items.map(p=>p.y)),zoom=g.camera.zoom;
    const phantom=document.createElement('div');phantom.className='drag-phantom';phantom.setAttribute('aria-hidden','true');phantom.inert=true;
    Object.assign(phantom.style,{position:'fixed',pointerEvents:'none',zIndex:'1000',width:'0',height:'0'});document.body.appendChild(phantom);
    const edges=viewport.current!.querySelector('.edge-layer')!.cloneNode(true) as SVGSVGElement;
    edges.querySelectorAll('.mention-link,.edge-preview,.edge-hit').forEach(node=>node.remove());
    edges.querySelectorAll<SVGGElement>('[data-edge]').forEach(node=>{
      const edge=g.board.edges.find(e=>e.id===node.dataset.edge&&g.ids.includes(e.from)&&g.ids.includes(e.to));
      if(!edge){node.remove();return;}
      const geometry=edgeGeometry(edge,geometryCard(items.find(p=>p.id===edge.from)!),geometryCard(items.find(p=>p.id===edge.to)!),geometryHeight);
      node.querySelectorAll('path').forEach(path=>path.setAttribute('d',geometry.path));
      const label=node.querySelector('foreignObject');label?.setAttribute('x',String(geometry.midpoint.x-120));label?.setAttribute('y',String(geometry.midpoint.y-20));
    });
    edges.querySelector('.edge-camera')!.setAttribute('transform',`scale(${zoom}) translate(${-left} ${-top})`);
    Object.assign(edges.style,{position:'absolute',left:'0',top:'0',width:'1px',height:'1px',overflow:'visible',pointerEvents:'none'});phantom.appendChild(edges);
    for(const p of items){const source=viewport.current!.querySelector<HTMLElement>('[data-placement="'+p.id+'"]');if(!source)continue;
      const clone=createDragPhantom(source),height=source.getBoundingClientRect().height/zoom;
      Object.assign(clone.style,{position:'absolute',left:(p.x-left)*zoom+'px',top:(p.y-top)*zoom+'px',width:widthOf(p)+'px',height:height+'px',transform:`scale(${zoom})`,transformOrigin:'top left'});phantom.appendChild(clone);
    }
    return phantom;
  }
  function movedBoard(g: Gesture, x: number, y: number): Board {
    const dx = (x - g.x) / g.camera.zoom, dy = (y - g.y) / g.camera.zoom;
    return { ...g.board, cards: g.board.cards.map(p => !g.ids.includes(p.id) ? p : g.type === 'move' ?
      { ...p, x: p.x + dx, y: p.y + dy } : { ...p, ...(!p.folder?{autoHeight:false}:{}), width: Math.max(p.object?.type==='image'?40:lookup.get(p.cardId)?.source?.type==='pdf'?120:200, p.width + dx), height: Math.max(120, g.resizeHeight! + dy) }) };
  }
  function move(e: Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    g.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if (g.type === 'pan') navigation.current!.set({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
    else if (g.type === 'select') { if (g.moved) selectRegion(g, e.clientX, e.clientY); }
    else if(g.moved) {
      const drag=draggedDocument(g),source=viewport.current?.querySelector<HTMLElement>('[data-placement="'+g.ids[0]+'"]');
      if(drag&&source){
        previewDocumentDrop(drag,e.clientX,e.clientY,source);
        const r=viewport.current!.getBoundingClientRect(),outside=r.width>0&&r.height>0&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);
        if(outside&&!externalPhantom.current)externalPhantom.current=selectionPhantom(g);
        if(externalPhantom.current){const offset=drag.selection!.offset;externalPhantom.current.style.visibility=outside?'visible':'hidden';externalPhantom.current.style.left=e.clientX-offset.x*g.camera.zoom+'px';externalPhantom.current.style.top=e.clientY-offset.y*g.camera.zoom+'px';}
      }
      dragPoint.current = { x: e.clientX, y: e.clientY };
      if (dragFrame.current === null) dragFrame.current = viewport.current!.ownerDocument.defaultView!.requestAnimationFrame(() => {
        dragFrame.current = null;
        if (gesture.current === g) setWorking(movedBoard(g, dragPoint.current.x, dragPoint.current.y));
      });
    }
  }
  function end(e: Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return;
    const moved = g.moved || Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3;
    if (g.type === 'pan') {
      navigation.current!.set({ ...g.camera, x: g.camera.x + e.clientX - g.x, y: g.camera.y + e.clientY - g.y });
    } else if (g.type === 'select') {
      if (moved) selectRegion(g, e.clientX, e.clientY); else if (!g.additive) {setSelected([]);setSelectedEdges([]);}
    } else if (moved) {
      // The last pointer event may arrive before React renders the last move.
      const next=movedBoard(g,e.clientX,e.clientY);
      if(g.type==='move')next.cards=[...next.cards.filter(p=>!g.ids.includes(p.id)),...next.cards.filter(p=>g.ids.includes(p.id))];
      const drag=draggedDocument(g),source=viewport.current?.querySelector<HTMLElement>('[data-placement="'+g.ids[0]+'"]'),r=viewport.current!.getBoundingClientRect();
      const dropped=drag&&dropDocumentAt(drag,e.clientX,e.clientY,source??undefined),inside=!r.width||!r.height||e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
      if(!dropped&&(inside||g.type==='resize'))save(next, g.type === 'move' ? ui.history.moveCards : ui.history.resizeCard, g.board);
    }
    cancel();
    if (viewport.current!.hasPointerCapture(e.pointerId)) viewport.current!.releasePointerCapture(e.pointerId);
    if(g.type==='pan'&&g.button===2&&!moved)openCanvasMenu(e.clientX,e.clientY);
    if(!moved&&g.editOnClick){
      const {id,focus}=g.editOnClick,placement=current.cards.find(p=>p.id===id),card=placement&&lookup.get(placement.cardId);
      if(card){
        if(card.source){onOpenCard?.(card.id,'popup');return;}
        if(placement.collapsed)toggleCollapsed(placement);
        setSelected([id]);setEditingPlacement(id);setFocusPoint(focus);onOpen(card.path);
      }
    }
  }
  function cancel() {
    clearDocumentDrop();externalPhantom.current?.remove();externalPhantom.current=null;gesture.current = null; setDragged([]); setWorking(pendingSave.current);
    if (dragFrame.current !== null) {
      viewport.current!.ownerDocument.defaultView!.cancelAnimationFrame(dragFrame.current); dragFrame.current = null;
    }
    if (viewport.current) delete viewport.current.dataset.panning;
    if (selectionBox.current) selectionBox.current.style.display = 'none';
  }
  function save(next: Board, label: string, base = current) {
    // Keep the latest local layout until its own save settles, even if earlier saves reply mid-drag.
    pendingSave.current = next; setWorking(next);
    const settled = () => {
      if (pendingSave.current !== next) return;
      pendingSave.current = null;
      if (!gesture.current) setWorking(null);
    };
    void Promise.resolve(onSave(next, label, base)).then(settled, settled);
  }
  function selectEdges(ids:string[],add:boolean,toggle=false){
    if(!add)setSelected([]);
    setSelectedEdges(previous=>!add?ids:toggle?previous.includes(ids[0])?previous.filter(id=>!ids.includes(id)):[...previous,...ids]:[...new Set([...previous,...ids])]);
    viewport.current?.focus({preventScroll:true});
  }
  async function deleteSelection(placements=selected,edges=selectedEdges){
    if(deleting.current||gesture.current)return;
    if(onDelete){
      deleting.current=true;
      try{if(await onDelete(current,placements,edges)){setSelected([]);setSelectedEdges([]);}}
      catch{ /* Session reports save errors without losing the selection. */ }
      finally{deleting.current=false;}
    }else if(edges.length){
      save({...current,edges:current.edges.filter(e=>!edges.includes(e.id))},ui.history.deleteEdges);setSelectedEdges([]);
    }
  }
  function removeReference(p:Placement){
    save({...current,cards:current.cards.filter(c=>c.id!==p.id),edges:current.edges.filter(e=>e.from!==p.id&&e.to!==p.id)},ui.history.removePlacement);
    setSelected(ids=>ids.filter(id=>id!==p.id));
  }
  function toggleCollapsed(p:Placement) {
    if(!p.collapsed)onFinish?.();
    save({...current,cards:current.cards.map(card=>card.id===p.id?{...card,height:expandedHeight(p),collapsed:!p.collapsed}:card)},p.collapsed?ui.history.expandCard:ui.history.collapseCard);
  }
  function setPdf(id:string,settings:NonNullable<Placement['pdf']>){
    const base=pendingSave.current??latest.current.board;
    save({...base,cards:base.cards.map(p=>p.id===id?{...p,pdf:{...p.pdf,...settings}}:p)},'Change PDF preview',base);
  }
  function copyStyle(ids=selected,lines=selectedEdges){onFinish?.();void onCopyStyle?.(pendingSave.current??latest.current.board,ids,lines).catch(error=>setObjectError(String(error)));}
  function pasteStyle(ids=selected,lines=selectedEdges){onFinish?.();void onPasteStyle?.(pendingSave.current??latest.current.board,ids,lines).catch(error=>setObjectError(String(error)));}
  function styleShortcut(event:KeyboardEvent){
    if(onCopyStyle&&matchesBinding(event,'copyStyle',keybindings,window.door.platform)){event.preventDefault();event.stopPropagation();if(!event.repeat)copyStyle();return true;}
    if(onPasteStyle&&matchesBinding(event,'pasteStyle',keybindings,window.door.platform)){event.preventDefault();event.stopPropagation();if(!event.repeat)pasteStyle();return true;}
    return false;
  }
  const styleActions=(ids=selected,lines=selectedEdges)=>[
    ...(onCopyStyle?[{label:ui.style.copy,icon:'copy' as const,hint:binding('copyStyle',keybindings).replace('Mod-',window.door.platform==='darwin'?'⌘ ':'Ctrl ').replace('Shift-','⇧ '),disabled:ids.length+lines.length!==1,run:()=>copyStyle(ids,lines)}]:[]),
    ...(onPasteStyle?[{label:ui.style.paste,icon:'art' as const,hint:binding('pasteStyle',keybindings).replace('Mod-',window.door.platform==='darwin'?'⌘ ':'Ctrl ').replace('Shift-','⇧ '),disabled:!hasCopiedStyle,run:()=>pasteStyle(ids,lines)}]:[]),
  ];
  function openMenu(p:Placement,anchor:HTMLElement,x:number,y:number) {
    const styles=styleActions(selected.includes(p.id)?selected:[p.id],selected.includes(p.id)?selectedEdges:[]);
    const textIds=current.cards.filter(item=>selected.includes(item.id)&&item.object?.type==='text').map(item=>item.id);
    if(onConvertTopics&&selected.includes(p.id)&&selected.length>1&&textIds.length){setMenu({anchor,label:topicText.selection,x,y,actions:[...styles,{label:topicText.convertMany(textIds.length),icon:'note',run:()=>{void convertTopics(textIds);}},{label:ui.history.deleteSelection,icon:'trash',danger:true,run:()=>{void deleteSelection();}}]});return;}
    if(lookup.get(p.cardId)?.source?.type==='pdf'){
      setMenu({anchor,placementId:p.id,label:readingText.pdfActions,x,y,actions:[
        {label:readingText.expandPdf,checked:!!p.pdf?.expanded,checkType:'checkbox',run:()=>setPdf(p.id,{expanded:!p.pdf?.expanded})},
        {label:readingText.showNotes,checked:p.pdf?.notes!==false,checkType:'checkbox',run:()=>setPdf(p.id,{notes:p.pdf?.notes===false})},
        {label:p.collapsed?tooltips.whiteboard.expandCard:tooltips.whiteboard.collapseCard,icon:p.collapsed?'down':'chevronUp',run:()=>toggleCollapsed(p)},
        ...(onOpenCard?[{label:ui.common.openInPopup,icon:'external' as const,run:()=>onOpenCard(p.cardId,'popup')},{label:ui.common.openInNewTab,icon:'window' as const,run:()=>onOpenCard(p.cardId,'new')}]:[]),
        ...styles,
        ...(parent(lookup.get(p.cardId)!.path)!==portable(board.folder)?[{label:ui.whiteboard.removeReference,separatorBefore:true,run:()=>removeReference(p)}]:[]),
        ...(onDelete?[{label:ui.card.delete,icon:'trash' as const,danger:true,separatorBefore:true,run:()=>{void deleteSelection([p.id],[]);}}]:[])
      ]});return;
    }
    if(p.object){setMenu({anchor,placementId:p.id,label:readingText.objectActions,x,y,actions:[...styles,...(p.object.type==='text'?[{label:topicText.edit,icon:'edit' as const,run:()=>editText(p.id)},{label:topicText.child,hint:topicText.childKey,icon:'branch' as const,run:()=>addRelatedTopic(p.id,'child')},{label:topicText.sibling,hint:topicText.siblingKey,icon:'plus' as const,run:()=>addRelatedTopic(p.id,'sibling')},...(onConvertTopics?[{label:topicText.convert,icon:'note' as const,separatorBefore:true,run:()=>{void convertTopics([p.id]);}}]:[])]:[]),{label:readingText.duplicate,icon:'copy',run:()=>save({...current,cards:[...current.cards,{...p,id:crypto.randomUUID(),x:p.x+24,y:p.y+24}]},'Duplicate object')},{label:readingText.delete,icon:'trash',danger:true,run:()=>{void deleteSelection([p.id],[]);}}]});return;}
    setMenu({anchor,placementId:p.id,label:p.folder?ui.whiteboard.whiteboardActions:ui.whiteboard.cardActions,x,y,actions:p.folder?
      [...styles,{label:ui.whiteboard.openWhiteboard,icon:'map',run:()=>onOpenFolder?.(p.folder!)},{label:ui.common.openInNewTab,icon:'external',run:()=>onOpenFolder?.(p.folder!,'new')},{label:ui.common.openInAnotherTabGroup,icon:'splitRight',run:()=>onOpenFolder?.(p.folder!,'other')},...(onDelete?[{label:ui.whiteboard.delete,icon:'trash' as const,danger:true,separatorBefore:true,run:()=>{void deleteSelection([p.id],[]);}}]:[])]:
      [...styles,{label:topicText.child,hint:topicText.childKey,icon:'branch' as const,run:()=>addRelatedTopic(p.id,'child')},{label:topicText.sibling,hint:topicText.siblingKey,icon:'plus' as const,run:()=>addRelatedTopic(p.id,'sibling')},...(lookup.has(p.cardId)&&addTagActions?[{label:ui.tags.add,icon:'tag' as const,submenu:addTagActions(lookup.get(p.cardId)!)}]:[]),...(lookup.has(p.cardId)&&onOpenCard?[{label:ui.common.openInPopup,icon:'note' as const,run:()=>onOpenCard(p.cardId,'popup')},{label:ui.common.openInSameTab,icon:'external' as const,run:()=>onOpenCard(p.cardId,'same')},{label:ui.common.openInNewTab,icon:'window' as const,run:()=>onOpenCard(p.cardId,'new')},{label:ui.common.openInAnotherTabGroup,icon:'splitRight' as const,run:()=>onOpenCard(p.cardId,'other')}]:[]),{label:ui.whiteboard.autoHeight,separatorBefore:!!onOpenCard,checked:autoHeight(p),checkType:'checkbox',run:()=>{
        save({...current,cards:current.cards.map(card=>card.id===p.id?{...card,autoHeight:!autoHeight(p),height:expandedHeight(p)}:card)},autoHeight(p)?ui.history.useFixedCardHeight:ui.history.useAutoCardHeight);
      }},...(!lookup.has(p.cardId)||parent(lookup.get(p.cardId)!.path)!==portable(board.folder)?[{label:ui.whiteboard.removeReference,danger:true,run:()=>removeReference(p)}]:[]),
      ...(lookup.has(p.cardId)&&onDelete?[{label:ui.card.delete,icon:'trash' as const,danger:true,separatorBefore:true,run:()=>{void deleteSelection([p.id],[]);}}]:[])]});
  }
  function openCanvasMenu(clientX:number,clientY:number) {
    const element=viewport.current!,nav=navigation.current!;nav.flush();
    const rect=element.getBoundingClientRect(),x=(clientX-rect.left-nav.current.x)/nav.current.zoom,y=(clientY-rect.top-nav.current.y)/nav.current.zoom;
    onFinish?.();
    setMenu({label:ui.whiteboard.canvasActions,x:clientX,y:clientY,actions:[
      {label:ui.common.newCard,icon:'note',disabled:!board.folder,hint:!board.folder?tooltips.whiteboard.rootWhiteboardsOnly:undefined,run:()=>onCreate(x,y)},
      {label:ui.common.newWhiteboard,icon:'map',run:()=>onCreateBoard?.(x,y)},
      {label:topicText.new,icon:'text',disabled:!board.folder,run:()=>addTopic(x,y)},
      {label:readingText.imageOrFigure,icon:'image',disabled:!board.folder,run:()=>addImagePlaceholder(x,y)},
      ...(onPlaceReference?[{label:ui.references.add,icon:'link' as const,disabled:!board.folder,run:()=>{setReferenceError('');setReference({x,y,screenX:clientX,screenY:clientY});}}]:[]),
    ]});
  }
  function addTopic(x:number,y:number,from?:string,side:AnchorSide='right',edited?:Placement,rightAnchor?:number) {
    const base=pendingSave.current??latest.current.board;if(!base.folder)return;
    const id=crypto.randomUUID(),topic:Placement={id,cardId:'',x:from&&side==='left'?(rightAnchor??x)-240:x,y,width:240,height:80,autoHeight:false,object:{type:'text',text:'',shape:'none',...textDefaults}};
    const edge:Edge|undefined=from?{id:crypto.randomUUID(),kind:'branch',from,to:id,fromSide:side,toSide:side==='right'?'left':side==='left'?'right':side==='top'?'bottom':'top',fromArrowhead:'none',toArrowhead:'arrow',...edgeDefaults}:undefined;
    textOrigin.current={id,x:topic.x,width:topic.width,left:!!from&&side==='left'};setTextReplacement(undefined);
    onFinish?.();save({...base,cards:[...base.cards.map(p=>p.id===edited?.id?edited:p),topic],edges:edge?[...base.edges,edge]:base.edges},'Create text',base);setSelected([id]);setSelectedEdges([]);setEditingObject(id);
  }
  function addRelatedTopic(id:string,mode:'child'|'sibling',object?:Placement['object']) {
    const base=pendingSave.current??latest.current.board,original=base.cards.find(p=>p.id===id);if(!original||!base.folder)return;
    const selected=object?editedText(original,object):original;
    const incoming=base.edges.find(e=>e.kind==='branch'&&e.to===id),parent=mode==='sibling'?incoming:undefined,source=parent?base.cards.find(p=>p.id===parent.from)!:selected;
    const from=mode==='child'?source.id:parent?.from,side=parent?.fromSide??(incoming?.toSide?opposite[incoming.toSide]:incoming?.fromSide)??'right',vertical=side==='top'||side==='bottom';
    // A quick key can arrive before ResizeObserver records the edited text's new size.
    const sizes=new Map([...world.current!.querySelectorAll<HTMLElement>('[data-placement]')].map(node=>[node.dataset.placement,{width:node.offsetWidth,height:node.offsetHeight}]));
    const width=(p:Placement)=>sizes.get(p.id)?.width||widthOf(p),height=(p:Placement)=>sizes.get(p.id)?.height||heightOf(p);
    let x=from?(side==='left'?source.x-330:side==='right'?source.x+width(source)+90:source.x):selected.x;
    let y=from?(side==='top'?source.y-120:side==='bottom'?source.y+height(source)+90:source.y+height(source)/2-14):selected.y+height(selected)+32;
    const siblingIds=new Set(from?base.edges.filter(e=>e.kind==='branch'&&e.from===from).map(e=>e.to):[id]),siblings=base.cards.filter(p=>siblingIds.has(p.id));
    if(siblings.length){if(vertical)x=Math.max(x,...siblings.map(p=>p.x+width(p)+48));else y=Math.max(y,...siblings.map(p=>p.y+height(p)+32));}
    // Place only the new topic; existing manual positions remain untouched.
    const blockers=base.cards.filter(p=>x<p.x+width(p)+16&&x+240>p.x-16).sort((a,b)=>a.y-b.y);
    for(const p of blockers)if(y<p.y+height(p)+16&&y+28>p.y-16)y=p.y+height(p)+32;
    addTopic(x,y,from,side,object?selected:undefined,side==='left'?x+240:undefined);
  }
  function textNode(id:string){return [...world.current!.querySelectorAll<HTMLElement>('[data-placement]')].find(node=>node.dataset.placement===id);}
  function textWidth(p:Placement){const node=textNode(p.id);return (node?.getBoundingClientRect().width??0)/(navigation.current?.current.zoom??1)||node?.offsetWidth||widthOf(p);}
  function editText(id:string,replacement?:string){
    const p=(pendingSave.current??latest.current.board).cards.find(p=>p.id===id);if(p?.object?.type!=='text')return;
    textOrigin.current={id,x:p.x,width:textWidth(p),left:branchEnds.get(id)==='right'};
    setTextReplacement(replacement);setEditingObject(id);
  }
  function editedText(p:Placement,object:Placement['object']){
    const origin=textOrigin.current,width=textWidth(p);
    return {...p,object,x:origin?.id===p.id&&origin.left?origin.x+origin.width-width:p.x};
  }
  function finishTextEdit(focus=false){textOrigin.current=undefined;setObjectPreview(undefined);setEditingObject('');if(focus)viewport.current?.focus({preventScroll:true});}
  function previewObject(p:Placement,width?:number){
    if(width===undefined){setObjectPreview(previous=>previous?.id===p.id?undefined:previous);return;}
    if(p.object?.type==='text')width=textWidth(p);
    const origin=textOrigin.current,x=origin?.id===p.id&&origin.left?origin.x+origin.width-width:undefined;
    setObjectPreview(previous=>previous?.id===p.id&&previous.width===width&&previous.x===x?previous:{id:p.id,width,x});
  }
  function navigateText(id:string,direction:TextNavigation,object?:Placement['object']){
    const base=pendingSave.current??latest.current.board,target=textNeighbor(base,id,direction);
    if(object){const previous=base.cards.find(p=>p.id===id),next=previous&&editedText(previous,object);if(next&&JSON.stringify(next)!==JSON.stringify(previous))save({...base,cards:base.cards.map(p=>p.id===id?next:p)},'Edit whiteboard object',base);}
    finishTextEdit();setSelectedEdges([]);if(target)setSelected([target]);
    const element=viewport.current!,nav=navigation.current!,p=base.cards.find(p=>p.id===target);nav.flush();
    if(p&&element.clientWidth>0&&element.clientHeight>0){const camera=nav.current,left=p.x*camera.zoom+camera.x,top=p.y*camera.zoom+camera.y,right=left+widthOf(p)*camera.zoom,bottom=top+heightOf(p)*camera.zoom,dx=left<24?24-left:right>element.clientWidth-24?element.clientWidth-24-right:0,dy=top<24?24-top:bottom>element.clientHeight-24?element.clientHeight-24-bottom:0;if(dx||dy){nav.set({...camera,x:camera.x+dx,y:camera.y+dy});nav.flush();}}
    element.focus({preventScroll:true});
  }
  async function convertTopics(ids:string[]) {
    if(!onConvertTopics)return;setObjectError('');
    try{const cards=await onConvertTopics(pendingSave.current??latest.current.board,ids);setEditingObject('');setSelected(ids);if(cards.length===1)onOpen(cards[0].path);}catch(error){setObjectError(String(error));}
  }
  function imagePosition(clientX?:number,clientY?:number) {
    const element=viewport.current!,nav=navigation.current!;nav.flush();
    const rect=element.getBoundingClientRect(),camera=nav.current;
    return {x:((clientX??rect.left+rect.width/2)-rect.left-camera.x)/camera.zoom,y:((clientY??rect.top+rect.height/2)-rect.top-camera.y)/camera.zoom};
  }
  function addImagePlaceholder(x:number,y:number){
    const base=pendingSave.current??latest.current.board,id=crypto.randomUUID();
    save({...base,cards:[...base.cards,{id,cardId:'',x,y,width:340,height:80,autoHeight:false,object:{type:'image',html:imageHtml({kind:'placeholder'})}}]},'Add image object',base);setSelected([id]);setSelectedEdges([]);viewport.current?.focus({preventScroll:true});
  }
  async function addImages(files:File[],position:{x:number;y:number},url?:string) {
    setObjectError('');const additions:Placement[]=[];
    try {
      for(const source of files.length?files:[url!]) {
        const image=typeof source==='string'?await window.door.importImageLink(board.path,source):await window.door.importImage(board.path,source.name,source.type,new Uint8Array(await source.arrayBuffer()));
        if(!imageImportLive.current)return;
        additions.push({id:crypto.randomUUID(),cardId:'',x:position.x+additions.length*360,y:position.y,width:340,height:280,autoHeight:false,object:{type:'image',html:imageHtml({kind:'single',...image,width:'340px',alignment:'left'})}});
      }
    } catch(error) {if(imageImportLive.current)setObjectError(String(error));}
    if(additions.length&&imageImportLive.current){const base=pendingSave.current??latest.current.board;save({...base,cards:[...base.cards,...additions]},'Add image object',base);setSelected(additions.map(p=>p.id));setSelectedEdges([]);viewport.current?.focus({preventScroll:true});}
  }
  function acceptsImage(target:EventTarget|null) {
    return enabled&&!!board.folder&&target instanceof Node&&!!viewport.current?.contains(target)&&!editable(target)&&!(target as HTMLElement).closest('.card-editor,[role="dialog"]');
  }
  function fit() {
    const nav = navigation.current, element = viewport.current;
    if (!nav || !element) return;
    const cards = latest.current.board.cards;
    if (!cards.length) { nav.set({ x: 20, y: 20, zoom: 1 }); return; }
    const left = Math.min(...cards.map(p => p.x)), top = Math.min(...cards.map(p => p.y));
    const width = Math.max(1, Math.max(...cards.map(p => p.x + widthOf(p))) - left);
    const height = Math.max(1, Math.max(...cards.map(p => p.y + latest.current.heightOf(p))) - top);
    const zoom = Math.min(1.6, Math.max(0.25, Math.min((element.clientWidth - 120) / width, (element.clientHeight - 120) / height)));
    nav.flush(); nav.set({ zoom, x: element.clientWidth / 2 - (left + width / 2) * zoom, y: element.clientHeight / 2 - (top + height / 2) * zoom });
  }
  // Measure unknown auto-height cards above the viewport before deciding to cull them.
  // ponytail: cold opens measure that column once; persist a size cache if much larger boards need it.
  const visible = current.cards.filter(p => p.id === editingObject || p.id === active?.id || gesture.current?.ids.includes(p.id) || isVisible({...p,x:xOf(p),width:widthOf(p)}, view, size.width, size.height, Math.max(size.width, size.height), naturalHeight(p)&&!p.collapsed&&measuredHeight(p)===undefined?Infinity:heightOf(p)));
  const measuredIds=visible.filter(p=>p.collapsed||naturalHeight(p)).map(p=>heightKey(p)+':'+heightSignature(p)).join(',');
  useLayoutEffect(()=>{
    const nodes=[...world.current!.querySelectorAll<HTMLElement>('.board-placement.collapsed,.board-placement.auto-height')];
    const measure=()=>setMeasuredHeights(previous=>{
      let next=previous;
      for(const node of nodes){
        if(node.querySelector('.card-preview[data-ready=false]'))continue;
        const frame=node.querySelector<HTMLElement>('.board-pdf-selection'),top=frame?.offsetTop??0,pdfHeight=frame?.offsetHeight;
        const id=node.dataset.heightKey!,height=(node.classList.contains('board-image')?node.querySelector<HTMLElement>('.image-media')??node:node).offsetHeight,width=node.offsetWidth,signature=node.dataset.heightSignature!;
        if(height>0&&(height!==previous[id]?.height||width!==previous[id]?.width||signature!==previous[id]?.signature||top!==previous[id]?.top||pdfHeight!==previous[id]?.pdfHeight)){if(next===previous)next={...previous};next[id]={height,width,top,pdfHeight,signature};}
      }
      return next;
    });
    measure();
    const observer=new ResizeObserver(measure);nodes.forEach(node=>observer.observe(node));
    return()=>observer.disconnect();
  },[measuredIds,contentVersion]);
  return <div className="board-shell">
    {objectError&&<p className="editor-image-error" role="alert">{objectError}</p>}
    <div className={"canvas"+(imageDrop?" document-drop-target":"")} data-drop-folder={board.folder} data-drop-kind="board" data-drop-name={board.name} data-navigation="obsidian" ref={viewport} tabIndex={0} aria-label={ui.whiteboard.whiteboardCanvas}
      onPaste={e=>{if(e.defaultPrevented||!acceptsImage(e.target))return;const files=imageFiles(e.clipboardData),url=files.length?undefined:imageTransferUrl(e.clipboardData);if(!files.length&&!url)return;e.preventDefault();void addImages(files,imagePosition(),url);}}
      onDragOver={e=>{if(!acceptsImage(e.target)||(e.target as HTMLElement).closest('.editor-image'))return;if([...e.dataTransfer.items].some(item=>item.kind==='file'&&(!item.type||item.type.startsWith('image/')))||e.dataTransfer.types.includes('text/html')||e.dataTransfer.types.includes('text/uri-list')){e.preventDefault();e.dataTransfer.dropEffect='copy';setImageDrop(true);}}}
      onDragLeave={e=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))setImageDrop(false);}}
      onDropCapture={()=>setImageDrop(false)} onDrop={e=>{setImageDrop(false);if(e.defaultPrevented||!acceptsImage(e.target))return;const files=imageFiles(e.dataTransfer),url=files.length?undefined:imageTransferUrl(e.dataTransfer);if(!files.length&&!url)return;e.preventDefault();e.stopPropagation();void addImages(files,imagePosition(e.clientX,e.clientY),url);}}
      onPointerDownCapture={capture} onContextMenu={e=>{
        e.preventDefault();
        // Mouse contextmenu fires on press on macOS and on release elsewhere. A quiet right release opens it once; a right drag only pans.
        if(!rightPress.current&&!(e.target as HTMLElement).closest('[data-placement],.edge-layer,.edge-handles,button,input'))openCanvasMenu(e.clientX,e.clientY);
      }} onKeyDown={e=>{
        if(!e.defaultPrevented&&enabled&&board.folder&&!editable(e.target)&&!(e.target as HTMLElement).closest('button,a,select')&&selected.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
          const p=current.cards.find(p=>p.id===selected[0]);if(p){
            const composing=e.nativeEvent.isComposing||e.keyCode===229||e.key==='Process'||e.key==='Dead';
            if(p.object?.type==='text'&&(e.key==='F2'||e.key===' '||[...e.key].length===1||composing)){
              if(!composing)e.preventDefault();e.stopPropagation();if(!e.repeat)flushSync(()=>editText(p.id,e.key==='F2'||e.key===' '?undefined:composing?'':e.key));return;
            }
            if(composing)return;
            if(e.key==='Tab'&&e.shiftKey||!e.shiftKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();navigateText(p.id,e.key==='Tab'?'parent':e.key as TextNavigation);return;}
            if(!p.folder&&(p.object?.type==='text'||!p.object)&&!e.shiftKey&&(e.key==='Tab'||e.key==='Enter')){e.preventDefault();e.stopPropagation();if(!e.repeat)addRelatedTopic(p.id,e.key==='Tab'?'child':'sibling');return;}
          }
        }
        if(e.target===e.currentTarget&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();openCanvasMenu(r.left+r.width/2,r.top+r.height/2);}
      }}
      onDoubleClick={e => {
        if (e.target === viewport.current) {
          const rect = viewport.current.getBoundingClientRect(), camera = navigation.current!.current;
          onCreate((e.clientX - rect.left - camera.x) / camera.zoom, (e.clientY - rect.top - camera.y) / camera.zoom);
        }
      }}>
      <div className="canvas-grid" ref={grid}/>
        {/* Measured text widths are for edge geometry; keep stored placement sizes on save. */}
        <Edges onCreateTopic={board.folder?addTopic:undefined} edgeDefaults={edgeDefaults} board={{...current,cards:current.cards.map(geometryCard)}} mentions={mentions} heightOf={geometryHeight} camera={()=>navigation.current?.current??view} viewport={viewport} enabled={enabled}
          selectedCards={[...new Set([...selected,...(active?[active.id]:[])])]} selectedEdges={selectedEdges} onSelect={selectEdges} onSave={(next,label)=>save({...next,cards:current.cards},label)} styleActions={id=>styleActions([], [id])} onFinish={()=>onFinish?.()} onStyle={()=>onStyle?.()}/>
      <div className="board-world" ref={world}>
        {visible.map(p => {
          const savedCard = lookup.get(p.cardId);
          const card=savedCard&&draft?.card.id===savedCard.id?{...savedCard,titleMarkdown:draftTitle}:savedCard, folder = card?parent(card.path):undefined;
          const childBoard = p.folder ? boardLookup.get(p.folder) : undefined;
          const nestedCount = childBoard?.cards.filter(child => child.folder).length ?? 0;
          const cardCount = (childBoard?.cards.length ?? 0)-nestedCount;
          // Match the CSS grid: 88×34 tiles, 12/8 gaps, 24px inset and 90px header.
          const previewCount=Math.max(1,Math.floor((p.width-38)/100))*Math.max(0,Math.ceil((p.height-116)/42));
          const text=p.object?.type==='text',pdf=card?.source?.type==='pdf',media=p.object?.type==='image'||pdf||text;
          return <article key={p.id} data-drop-folder={p.folder} data-drop-kind="board" data-drop-name={childBoard?.name??p.folder?.split('/').at(-1)} data-placement={p.id} className={`board-placement ${media?'board-media': 'board-card'} ${p.object?.type==='image'?'board-image':''} ${text?'board-text':''} ${pdf?'board-pdf-placement':''} ${selected.includes(p.id) ? 'selected' : ''} ${!card && !p.folder && !p.object ? 'missing' : ''} ${p.object?'board-object':''} ${p.object?.type==='text'?'object-shape-'+p.object.shape:''} ${active?.id === p.id ? 'editing' : ''} ${p.collapsed?'collapsed':''} ${naturalHeight(p)?'auto-height':''} ${p.folder?'board-tile':''} ${dragged.includes(p.id)?'dragging':''} ${menu?.placementId===p.id?'menu-open':''}`}
            data-height-key={heightKey(p)} data-height-signature={heightSignature(p)} data-text-grow-left={text&&branchEnds.get(p.id)==='right'||undefined} style={{ left: xOf(p), top: p.y, width: text?undefined:pdf?'max-content':objectPreview?.id===p.id?objectPreview.width:p.width,height: p.collapsed||naturalHeight(p)?'auto':p.height, background:pdf&&p.collapsed?tintColor(cardFill(savedCard,p))??'var(--card)':media?'transparent':tintColor(p.folder||p.object?p.fillColor:cardFill(savedCard,p)),...(p.object?.type==='text'?{'--object-border-color':p.strokeColor??'var(--muted)','--object-border-width':(p.strokeWidth??2)+'px','--object-border-style':p.strokeStyle??'solid'}:{}) } as React.CSSProperties}
            onContextMenu={e=>{e.preventDefault();e.stopPropagation();onFinish?.();if(!selected.includes(p.id)){setSelected([p.id]);setSelectedEdges([]);}openMenu(p,e.currentTarget,e.clientX,e.clientY);}} onPointerDown={e => startCard(e, p.id)} onDoubleClick={e=>{
              if((e.target as HTMLElement).closest('button,input,.card-top-row,.pdf-reader,.annotation-rail'))return;
              if(p.object?.type==='text'){e.stopPropagation();editText(p.id);}
              else if(p.folder){e.stopPropagation();onOpenFolder?.(p.folder);}
              else if(p.collapsed){e.stopPropagation();toggleCollapsed(p);}
            }}>
            {!p.folder&&!media&&<div className="card-drag-strip" data-tooltip={tooltips.whiteboard.dragCard}/>}
            {!media&&<div className="card-top-row">
              {!p.folder&&card&&<InlineName name={card.name} suffix=".md" tooltip={card.path} onRename={onRename?stem=>onRename(card.id,stem):undefined} onStart={()=>{setSelected([p.id]);onFinish?.();}}/>}
              <Tool icon="more" className="card-more" label={p.folder?tooltips.whiteboard.whiteboardActions:tooltips.whiteboard.cardActions} aria-haspopup="menu" aria-expanded={menu?.placementId===p.id}
              onPointerDown={e=>e.stopPropagation()} onClick={e=>{
                if(menu?.placementId===p.id){setMenu(null);return;}
                const rect=e.currentTarget.getBoundingClientRect();openMenu(p,e.currentTarget,rect.right,rect.bottom+4);
              }}/>
            </div>}
            {!media&&!p.folder&&!p.object && <div className="card-actions">{card&&onOpenCard&&<Tool icon="external" label={ui.common.openInPopup} onClick={()=>{onFinish?.();onOpenCard(card.id,'popup');}}/>}<Tool icon={p.collapsed?'down':'chevronUp'} label={p.collapsed?tooltips.whiteboard.expandCard:tooltips.whiteboard.collapseCard} aria-expanded={!p.collapsed} onClick={()=>toggleCollapsed(p)}/></div>}
            {p.object?<BoardObject selected={selected.includes(p.id)} onParent={object=>navigateText(p.id,'parent',object)} onRelated={(mode,object)=>addRelatedTopic(p.id,mode,object)} onResizePreview={width=>previewObject(p,width)} initialText={textReplacement} editing={editingObject===p.id} onDone={finishTextEdit} onDelete={()=>{void deleteSelection([p.id],[]);}} placement={text?{...p,width:widthOf(p),height:heightOf(p)}:p} path={board.path} onChange={(object,width)=>{const base=pendingSave.current??latest.current.board,original=base.cards.find(item=>item.id===p.id);if(!original)return;const next={...editedText(original,object),...(width?{width}:{})};if(JSON.stringify(next)!==JSON.stringify(original))save({...base,cards:base.cards.map(item=>item.id===p.id?next:item)},'Edit whiteboard object',base);}}/>:pdf?<BoardPdf collapsed={p.collapsed} onResize={e=>{if(e.button===0){onFinish?.();setSelected([p.id]);begin(e,'resize',[p.id]);}}} onLayout={contentReady} onSelect={()=>{if(!selected.includes(p.id)){setSelected([p.id]);setSelectedEdges([]);onFinish?.();}}} card={card!} width={p.width} settings={p.pdf} zoom={view.zoom} onRevealPage={page=>{const nav=navigation.current!,rect=page.getBoundingClientRect(),viewportRect=viewport.current!.getBoundingClientRect();nav.set({...nav.current,y:nav.current.y+viewportRect.top+48-rect.top});nav.flush();}} onPage={page=>setPdf(p.id,{page})} onShowNotes={()=>setPdf(p.id,{notes:true})} onMore={anchor=>{const r=anchor.getBoundingClientRect();openMenu(p,anchor,r.right,r.bottom+4);}} onCollapse={()=>toggleCollapsed(p)} onOpen={onOpenCard?()=>{onFinish?.();onOpenCard(card!.id,'popup');}:undefined}/>:p.collapsed ? (card?<Preview card={card} collapsed onOpen={openReference} cache={cache.current} onReady={contentReady}/>:<div className="missing-card">{ui.whiteboard.missingCard}</div>) : <>
              {!p.folder && card && folder!==portable(board.folder) && <span className="card-reference" data-tooltip={tooltips.whiteboard.cardReference} aria-label={ui.whiteboard.cardReference}><Icon name="external" size={12}/></span>}
              {p.folder ? <div className="board-tile-body">
                <div className="board-tile-heading">
                  <div className="board-tile-title"><Icon name="map" size={18}/><strong>{p.folder.split(/[\\/]/).at(-1)}</strong></div>
                  <small>{childBoard ? ui.whiteboard.contentsCount(cardCount,nestedCount) : ui.whiteboard.missingWhiteboard}</small>
                </div>
                <div className="board-tile-contents" aria-label={ui.whiteboard.whiteboardContentsPreview}>
                  {childBoard?.cards.slice(0,previewCount).map(child => <span className="board-tile-item" key={child.id} style={{background:tintColor(child.folder?child.fillColor:cardFill(lookup.get(child.cardId),child))}}>{child.folder&&<Icon name="map" size={12}/>}<span>{child.folder?.split(/[\\/]/).at(-1)||lookup.get(child.cardId)?.title||lookup.get(child.cardId)?.name||ui.whiteboard.missingCard}</span></span>)}
                </div>
              </div> : active?.id === p.id && draft ? <div className="card-editor">
                <CardEditor id={draft.card.id} onTitleDone={onTitleDone} canvas zoom={view.zoom} path={draft.card.path} body={draft.body} cards={cards} onEdit={onEdit!} autofocus focusPoint={focusPoint}/>
                {cardDetails}
              </div> : card ? <Preview card={card} onOpen={openReference} cache={cache.current} onReady={contentReady}/> : <div className="missing-card">{ui.whiteboard.missingCard}<br/><small>{p.cardId.slice(0, 12)}</small></div>}
              <button className="resize-handle" data-tooltip={p.folder?tooltips.whiteboard.resizeWhiteboard:tooltips.whiteboard.resizeCard} aria-label={ui.whiteboard.resize(p.folder?.split(/[\\/]/).at(-1) ?? card?.name ?? ui.whiteboard.card)} onPointerDown={e => { if (e.button === 0) { onFinish?.(); setSelected([p.id]); begin(e, 'resize', [p.id]); } }}/>
            </>}
            {selected.includes(p.id)&&selected.length===1&&savedCard?.source?.type==='web'&&!p.collapsed&&view.zoom>=.65&&<BoardAnnotations card={savedCard}/>}
          </article>;
        })}
      </div>
      <div className="selection-box" ref={selectionBox}/>
      {!board.cards.length && <div className="canvas-empty"><button className="primary" data-tooltip={board.folder ? tooltips.common.newCard : tooltips.common.newWhiteboard} onClick={e=>{const button=e.currentTarget.getBoundingClientRect(),r=viewport.current!.getBoundingClientRect(),camera=navigation.current!.current;onCreate((button.left+button.width/2-r.left-camera.x)/camera.zoom-(board.folder?170:160),(button.top+button.height/2-r.top-camera.y)/camera.zoom-(board.folder?60:80));}}>{board.folder ? ui.whiteboard.addCard : ui.whiteboard.addWhiteboard}</button></div>}
      <div className="canvas-controls">
        <Tool icon="art" label={tooltips.edges.showStyle} onClick={()=>onStyle?.()}/>
        <Tool icon="minus" label={tooltips.whiteboard.zoomOut} onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 0.9)}/>
        <button ref={zoomLabel} className="zoom-level" aria-label={ui.whiteboard.zoomToFit} data-tooltip={tooltips.whiteboard.zoomToFit} onClick={fit}>85%</button>
        <Tool icon="plus" label={tooltips.whiteboard.zoomIn} onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 1.1)}/>
        <button type="button" className="tool navigation-mode" aria-label={tooltips.whiteboard.navigationDevice[inputMode]}
          data-tooltip={tooltips.whiteboard.navigationDevice[inputMode]}
          onClick={onCycleInput}><Icon name={inputMode==='auto'?'autoInput':inputMode}/></button>
      </div>
    </div>
    {reference&&<span ref={setReferenceAnchor} style={{position:'fixed',left:reference.screenX,top:reference.screenY,width:1,height:1}}/>}
    {reference&&referenceAnchor&&<PropertyPopover anchor={referenceAnchor} label={ui.references.add} onClose={()=>{if(!referenceBusy)setReference(null);}}><ReferencePicker cardsOnly disabled={referenceBusy} exclude={board.cards.flatMap(p=>{const card=lookup.get(p.cardId);return card?[card.path]:[];})} onSelect={target=>{setReferenceBusy(true);void onPlaceReference?.(target.key.slice(5),reference.x,reference.y).then(()=>setReference(null)).catch(error=>setReferenceError(String(error))).finally(()=>setReferenceBusy(false));}} onCreate={onCreateReference?async name=>{await onCreateReference(name,reference.x,reference.y);setReference(null);}:undefined}/>{referenceError&&<p role="alert">{referenceError}</p>}</PropertyPopover>}
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </div>;
});
