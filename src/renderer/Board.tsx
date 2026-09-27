import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { placementHeight, type Board, type Card, type CardInfo, type Placement } from '../shared';
import { leadingTitle } from '../card-title';
import { parent, portable } from './documents';
import { preview, titlePreview } from './markdown';
import { BoardNavigation, type Camera } from './navigation';
import { Icon, Tool } from './Icons';
import { ActionMenu, type MenuState } from './Overlays';
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
    }).catch(() => { if (live) setContent({key,html:'<p>Card unavailable</p>'}); });
    return () => { live = false; };
  }, [card.path, card.revision, key, cache, collapsed]);
  const summary=useMemo(()=>collapsed?titlePreview(card):'',[collapsed,card.title,card.titleMarkdown,card.path]);
  useLayoutEffect(()=>{if(ready||collapsed)onReady();},[html,ready,collapsed,onReady]);
  return <div data-ready={ready||collapsed} className="prose card-preview" onClick={e => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (href) { e.preventDefault(); if (href.startsWith('card:')) onOpen(href.slice(5)); }
  }} dangerouslySetInnerHTML={{ __html: collapsed?summary:html||preview('',card.path) }} />;
});
interface Props {
  enabled?: boolean; initialCamera?: Camera; onCamera?: (camera:Camera)=>void; boards?: Board[]; onOpenFolder?: (folder:string)=>void; onReference?: (id:string)=>void;
  board: Board; cards: CardInfo[]; onSave: (board: Board, label: string, base: Board) => void | Promise<void>;
  onOpen: (path: string) => void; onCreate: (x: number, y: number) => void;
  draft?: { card: Card; body: string } | null; onEdit?: (body: string) => void; onFinish?: () => void; cardDetails?: ReactNode;
}
interface Gesture {
  type: 'pan' | 'move' | 'resize' | 'select'; ids: string[]; x: number; y: number; pointerId: number;
  board: Board; camera: Camera; rect: DOMRect; additive: boolean; initialSelection: string[];
  moved: boolean; resizeHeight?:number; editOnClick?: {id:string;focus:EditorFocus};
}
const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');

const autoHeight=(p:Placement)=>!p.folder&&p.autoHeight!==false;
const heightKey=(p:Placement)=>p.id+(p.collapsed?':collapsed':':expanded');

export const Whiteboard = memo(function Whiteboard({ board, cards, onSave, onOpen, onCreate, draft, onEdit, onFinish, cardDetails, enabled=true, initialCamera, onCamera, boards=[], onOpenFolder, onReference }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const zoomLabel = useRef<HTMLButtonElement>(null);
  const selectionBox = useRef<HTMLDivElement>(null);
  const navigation = useRef<BoardNavigation | null>(null);
  const spaceDown = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const pendingSave = useRef<Board | null>(null);
  const dragFrame = useRef<number | null>(null);
  const dragPoint = useRef({ x: 0, y: 0 });
  const cache = useRef(new Map<string, string>());
  const [size, setSize] = useState({ width: 1000, height: 800 });
  const [view, setView] = useState<Camera>({ x: 20, y: 20, zoom: 0.85 });
  const [working, setWorking] = useState<Board | null>(null);
  const [measuredHeights,setMeasuredHeights]=useState<Record<string,{height:number;signature:string}>>({});
  const [contentVersion,setContentVersion]=useState(0);
  const contentReady=useCallback(()=>setContentVersion(version=>version+1),[]);
  const heightSignature=(p:Placement)=>p.width+':'+(lookup.get(p.cardId)?.revision??'');
  const measuredHeight=(p:Placement)=>{const measured=measuredHeights[heightKey(p)];return measured?.signature===heightSignature(p)?measured.height:undefined;};
  const heightOf=(p:Placement)=>p.collapsed||autoHeight(p)?(measuredHeight(p)??placementHeight(p)):p.height;
  const expandedHeight=(p:Placement)=>autoHeight(p)?(measuredHeight({...p,collapsed:false})??p.height):p.height;
  const [menu,setMenu]=useState<(MenuState&{placementId:string})|null>(null);
  const [dragged, setDragged] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState('');
  const [focusPoint, setFocusPoint] = useState<EditorFocus>();
  const current = working ?? board;
  const draftTitle=useMemo(()=>draft?leadingTitle(draft.body)?.text??'':undefined,[draft?.body]);
  const active = current.cards.find(p => !p.collapsed && p.id === editingPlacement && p.cardId === draft?.card.id) ?? current.cards.find(p => !p.collapsed && p.cardId === draft?.card.id);
  const lookup = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const boardLookup = useMemo(() => new Map(boards.map(b => [b.folder, b])), [boards]);
  const placements = useMemo(() => new Map(current.cards.map(p => [p.id, p])), [current.cards]);
  const openReference = useCallback((id: string) => {
    const target = lookup.get(id); if (target) { if(onReference) onReference(id); else onOpen(target.path); }
  }, [lookup, onOpen, onReference]);
  const latest = useRef({ board: current, onFinish, move, end, enabled, onCamera, heightOf });
  latest.current = { board: current, onFinish, move, end, enabled, onCamera, heightOf };

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
      if ((event.target as HTMLElement).closest('.canvas-controls,.selection-tools,.editor-tools,.card-details')) return;
      if (gesture.current) { event.preventDefault(); return; }
      nav.wheel(event);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || !latest.current.enabled) return;
      if (event.key === 'Escape') { cancel(); setSelected([]); setConnecting(false); latest.current.onFinish?.(); element.focus({preventScroll:true}); return; }
      if (editable(event.target)) return;
      if (event.code === 'Space' && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
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
    const blur = () => { spaceDown.current = false; delete element.dataset.space; cancel(); };
    element.addEventListener('wheel', wheel, { passive: false, capture: true });
    element.ownerDocument.addEventListener('keydown', keydown);
    element.ownerDocument.addEventListener('keyup', keyup);
    element.ownerDocument.defaultView!.addEventListener('blur', blur);
    return () => {
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

  useLayoutEffect(() => {
    const nav=navigation.current, element=viewport.current;
    if (!active || !nav || !element) return;
    if (nav.current.zoom < 0.5 || !isVisible(active,nav.current,element.clientWidth,element.clientHeight,0)) {
      const zoom=Math.max(0.85,nav.current.zoom);
      nav.set({zoom,x:element.clientWidth/2-(active.x+active.width/2)*zoom,y:element.clientHeight/2-(active.y+active.height/2)*zoom});
      nav.flush();
    }
  },[active?.id]);

  function begin(e: PointerEvent, type: Gesture['type'], ids: string[] = []) {
    const element = viewport.current!, nav = navigation.current!;
    nav.flush();
    e.preventDefault(); e.stopPropagation(); element.focus({ preventScroll: true });
    gesture.current = { type, ids, x: e.clientX, y: e.clientY, pointerId: e.pointerId, board: pendingSave.current ?? current,
      camera: { ...nav.current }, rect: element.getBoundingClientRect(),
      additive: e.shiftKey || e.metaKey || e.ctrlKey, initialSelection: selected, moved:false,
      resizeHeight:type==='resize'?heightOf(current.cards.find(p=>p.id===ids[0])!):undefined };
    // Keep card clicks on the card; viewport capture would turn double-clicks into card creation.
    e.currentTarget.setPointerCapture(e.pointerId);
    if (type === 'pan') element.dataset.panning = 'true';
    else if (type === 'move' || type === 'resize') setDragged(ids);
  }
  function capture(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.canvas-controls,.selection-tools,.canvas-empty button,.card-editor') || editable(target)) return;
    const card = target.closest<HTMLElement>('.board-card');
    if (e.button === 1 || (e.button === 0 && spaceDown.current) || (e.button === 2 && !card)) {
      begin(e, 'pan'); return;
    }
    if (!card && e.button === 0) { onFinish?.(); setConnecting(false); begin(e, 'select'); }
    if (card && e.button === 2) {
      onFinish?.();
      e.preventDefault(); e.stopPropagation();
      const id = card.dataset.placement!; if (!selected.includes(id)) setSelected([id]);
    }
  }
  function startCard(e: PointerEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,a,input,.card-editor')) return;
    if (connecting && selected.length === 1 && id !== selected[0]) {
      save({ ...current, edges: [...current.edges, { id: crypto.randomUUID(), from: selected[0], to: id }] }, 'Connect cards');
      setConnecting(false); e.stopPropagation(); return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onFinish?.();
      setSelected(previous => e.shiftKey ? [...new Set([...previous, id])] : previous.includes(id) ? previous.filter(p => p !== id) : [...previous, id]);
      e.preventDefault(); e.stopPropagation(); return;
    }
    const body=(e.target as HTMLElement).closest<HTMLElement>('.card-preview');
    onFinish?.();
    const ids = selected.includes(id) ? selected : [id];
    setSelected(ids); begin(e, 'move', ids);
    // Like obsidian-whiteboard: a press is a pending drag; edit only on a quiet release.
    if(body&&selected.length<2)gesture.current!.editOnClick={id,focus:{x:e.clientX,y:e.clientY,scrollTop:body.scrollTop}};
  }
  function selectRegion(g: Gesture, x: number, y: number) {
    const left = Math.min(g.x, x) - g.rect.left, top = Math.min(g.y, y) - g.rect.top;
    const width = Math.abs(x - g.x), height = Math.abs(y - g.y);
    Object.assign(selectionBox.current!.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const a = (left - g.camera.x) / g.camera.zoom, b = (top - g.camera.y) / g.camera.zoom;
    const ids = g.board.cards.filter(p => p.x <= a + width / g.camera.zoom && p.x + p.width >= a && p.y <= b + height / g.camera.zoom && p.y + heightOf(p) >= b).map(p => p.id);
    const next = g.additive ? [...new Set([...g.initialSelection, ...ids])] : ids;
    setSelected(previous => previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next);
  }
  function movedBoard(g: Gesture, x: number, y: number): Board {
    const dx = (x - g.x) / g.camera.zoom, dy = (y - g.y) / g.camera.zoom;
    return { ...g.board, cards: g.board.cards.map(p => !g.ids.includes(p.id) ? p : g.type === 'move' ?
      { ...p, x: p.x + dx, y: p.y + dy } : { ...p, ...(!p.folder?{autoHeight:false}:{}), width: Math.max(200, p.width + dx), height: Math.max(120, g.resizeHeight! + dy) }) };
  }
  function move(e: Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    g.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if (g.type === 'pan') navigation.current!.set({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
    else if (g.type === 'select') { if (g.moved) selectRegion(g, e.clientX, e.clientY); }
    else if(g.moved) {
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
      if (moved) selectRegion(g, e.clientX, e.clientY); else if (!g.additive) setSelected([]);
    } else if (moved) {
      // The last pointer event may arrive before React renders the last move.
      save(movedBoard(g, e.clientX, e.clientY), g.type === 'move' ? 'Move cards' : 'Resize card', g.board);
    }
    cancel();
    if (viewport.current!.hasPointerCapture(e.pointerId)) viewport.current!.releasePointerCapture(e.pointerId);
    if(!moved&&g.editOnClick){
      const {id,focus}=g.editOnClick,placement=current.cards.find(p=>p.id===id),card=placement&&lookup.get(placement.cardId);
      if(card){
        if(placement.collapsed)toggleCollapsed(placement);
        setSelected([id]);setEditingPlacement(id);setFocusPoint(focus);onOpen(card.path);
      }
    }
  }
  function cancel() {
    gesture.current = null; setDragged([]); setWorking(pendingSave.current);
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
  function toggleCollapsed(p:Placement) {
    if(!p.collapsed)onFinish?.();
    save({...current,cards:current.cards.map(card=>card.id===p.id?{...card,height:expandedHeight(p),collapsed:!p.collapsed}:card)},p.collapsed?'Expand card':'Collapse card');
  }
  function openMenu(p:Placement,anchor:HTMLElement,x:number,y:number) {
    setMenu({anchor,placementId:p.id,label:p.folder?'Whiteboard actions':'Card actions',x,y,actions:p.folder?
      [{label:'Open whiteboard',icon:'external',run:()=>onOpenFolder?.(p.folder!)}]:
      [{label:'Auto height',checked:autoHeight(p),checkType:'checkbox',run:()=>{
        save({...current,cards:current.cards.map(card=>card.id===p.id?{...card,autoHeight:!autoHeight(p),height:expandedHeight(p)}:card)},autoHeight(p)?'Use fixed card height':'Use auto card height');
      }}]});
  }
  function fit() {
    const nav = navigation.current, element = viewport.current;
    if (!nav || !element) return;
    const cards = latest.current.board.cards;
    if (!cards.length) { nav.set({ x: 20, y: 20, zoom: 1 }); return; }
    const left = Math.min(...cards.map(p => p.x)), top = Math.min(...cards.map(p => p.y));
    const width = Math.max(1, Math.max(...cards.map(p => p.x + p.width)) - left);
    const height = Math.max(1, Math.max(...cards.map(p => p.y + latest.current.heightOf(p))) - top);
    const zoom = Math.min(1.6, Math.max(0.25, Math.min((element.clientWidth - 120) / width, (element.clientHeight - 120) / height)));
    nav.flush(); nav.set({ zoom, x: element.clientWidth / 2 - (left + width / 2) * zoom, y: element.clientHeight / 2 - (top + height / 2) * zoom });
  }
  // Measure unknown auto-height cards above the viewport before deciding to cull them.
  // ponytail: cold opens measure that column once; persist a size cache if much larger boards need it.
  const visible = current.cards.filter(p => p.id === active?.id || gesture.current?.ids.includes(p.id) || isVisible(p, view, size.width, size.height, Math.max(size.width, size.height), autoHeight(p)&&!p.collapsed&&measuredHeight(p)===undefined?Infinity:heightOf(p)));
  const measuredIds=visible.filter(p=>p.collapsed||autoHeight(p)).map(p=>heightKey(p)+':'+heightSignature(p)).join(',');
  useLayoutEffect(()=>{
    const nodes=[...world.current!.querySelectorAll<HTMLElement>('.board-card.collapsed,.board-card.auto-height')];
    const measure=()=>setMeasuredHeights(previous=>{
      let next=previous;
      for(const node of nodes){
        if(node.querySelector('.card-preview[data-ready=false]'))continue;
        const id=node.dataset.heightKey!,height=node.offsetHeight,signature=node.dataset.heightSignature!;
        if(height>0&&(height!==previous[id]?.height||signature!==previous[id]?.signature)){if(next===previous)next={...previous};next[id]={height,signature};}
      }
      return next;
    });
    measure();
    const observer=new ResizeObserver(measure);nodes.forEach(node=>observer.observe(node));
    return()=>observer.disconnect();
  },[measuredIds,contentVersion]);
  return <div className="board-shell">
    <div className="canvas" data-navigation="obsidian" ref={viewport} tabIndex={0} aria-label="Whiteboard canvas"
      onPointerDownCapture={capture} onContextMenu={e => e.preventDefault()}
      onDoubleClick={e => {
        if (e.target === viewport.current) {
          const rect = viewport.current.getBoundingClientRect(), camera = navigation.current!.current;
          onCreate((e.clientX - rect.left - camera.x) / camera.zoom, (e.clientY - rect.top - camera.y) / camera.zoom);
        }
      }}>
      <div className="canvas-grid" ref={grid}/>
      <div className="board-world" ref={world}>
        <svg className="connections" aria-hidden="true">
          {current.edges.map(edge => {
            const a = placements.get(edge.from), b = placements.get(edge.to);
            return a && b ? <line key={edge.id} x1={a.x + a.width / 2} y1={a.y + heightOf(a) / 2} x2={b.x + b.width / 2} y2={b.y + heightOf(b) / 2}/> : null;
          })}
        </svg>
        {visible.map(p => {
          const savedCard = lookup.get(p.cardId);
          const card=savedCard&&draft?.card.id===savedCard.id?{...savedCard,titleMarkdown:draftTitle}:savedCard, folder = card?parent(card.path):undefined;
          const childBoard = p.folder ? boardLookup.get(p.folder) : undefined;
          const nestedCount = childBoard?.cards.filter(child => child.folder).length ?? 0;
          const cardCount = (childBoard?.cards.length ?? 0)-nestedCount;
          // Match the CSS grid: 88×34 tiles, 12/8 gaps, 24px inset and 90px header.
          const previewCount=Math.max(1,Math.floor((p.width-38)/100))*Math.max(0,Math.ceil((p.height-116)/42));
          return <article key={p.id} data-placement={p.id} className={`board-card ${selected.includes(p.id) ? 'selected' : ''} ${!card && !p.folder ? 'missing' : ''} ${active?.id === p.id ? 'editing' : ''} ${p.collapsed?'collapsed':''} ${autoHeight(p)?'auto-height':''} ${p.folder?'board-tile':''} ${dragged.includes(p.id)?'dragging':''}`}
            data-height-key={heightKey(p)} data-height-signature={heightSignature(p)} data-tooltip={p.folder ?? card?.path ?? `Missing card ${p.cardId}`} style={{ left: p.x, top: p.y, width: p.width, height: p.collapsed||autoHeight(p)?'auto':p.height }}
            onPointerDown={e => startCard(e, p.id)} onDoubleClick={e=>{
              if((e.target as HTMLElement).closest('button'))return;
              if(p.folder){e.stopPropagation();onOpenFolder?.(p.folder);}
              else if(p.collapsed){e.stopPropagation();toggleCollapsed(p);}
            }}>
            <Tool icon="more" className="card-more" label={p.folder?'Whiteboard actions':'Card actions'} aria-haspopup="menu" aria-expanded={menu?.placementId===p.id}
              onPointerDown={e=>e.stopPropagation()} onClick={e=>{
                if(menu?.placementId===p.id){setMenu(null);return;}
                const rect=e.currentTarget.getBoundingClientRect();openMenu(p,e.currentTarget,rect.right,rect.bottom+4);
              }}/>
            {!p.folder && <div className="card-actions"><Tool icon={p.collapsed?'down':'chevronUp'} label={p.collapsed?'Expand card':'Collapse card'} aria-expanded={!p.collapsed} onClick={()=>toggleCollapsed(p)}/></div>}
            {p.collapsed ? (card?<Preview card={card} collapsed onOpen={openReference} cache={cache.current} onReady={contentReady}/>:<div className="missing-card">Missing card</div>) : <>
              {!p.folder && card && folder!==portable(board.folder) && <span className="card-reference" data-tooltip="Reference to a card in another whiteboard" aria-label="Card reference"><Icon name="external" size={12}/></span>}
              {p.folder ? <div className="board-tile-body">
                <div className="board-tile-heading">
                  <div className="board-tile-title"><Icon name="map" size={18}/><strong>{p.folder.split(/[\\/]/).at(-1)}</strong></div>
                  <small>{childBoard ? `${cardCount} card${cardCount===1?'':'s'} · ${nestedCount} whiteboard${nestedCount===1?'':'s'}` : 'Missing whiteboard'}</small>
                </div>
                <div className="board-tile-contents" aria-label="Whiteboard contents preview">
                  {childBoard?.cards.slice(0,previewCount).map(child => <span className="board-tile-item" key={child.id}>{child.folder&&<Icon name="map" size={12}/>}<span>{child.folder?.split(/[\\/]/).at(-1)||lookup.get(child.cardId)?.title||lookup.get(child.cardId)?.name||'Missing card'}</span></span>)}
                </div>
              </div> : active?.id === p.id && draft ? <div className="card-editor">
                <CardEditor path={draft.card.path} body={draft.body} cards={cards} onEdit={onEdit!} autofocus focusPoint={focusPoint}/>
                {cardDetails}
              </div> : card ? <Preview card={card} onOpen={openReference} cache={cache.current} onReady={contentReady}/> : <div className="missing-card">Missing card<br/><small>{p.cardId.slice(0, 12)}</small></div>}
              <button className="resize-handle" data-tooltip={p.folder?'Resize whiteboard':'Resize card'} aria-label={`Resize ${p.folder?.split(/[\\/]/).at(-1) ?? card?.name ?? 'card'}`} onPointerDown={e => { if (e.button === 0) { onFinish?.(); setSelected([p.id]); begin(e, 'resize', [p.id]); } }}/>
            </>}
          </article>;
        })}
      </div>
      <div className="selection-box" ref={selectionBox}/>
      {!board.cards.length && <div className="canvas-empty"><button className="primary" data-tooltip={board.folder ? "Create a card in this whiteboard" : "New whiteboard"} onClick={() => onCreate(100, 100)}>{board.folder ? "+ New card" : "+ New whiteboard"}</button></div>}
      {!!selected.length && !active && <div className="selection-tools"><span>{selected.length} selected</span><button data-tooltip="Connect selected cards" disabled={selected.length > 2} onClick={() => {
        if (selected.length === 2) save({ ...current, edges: [...current.edges, { id: crypto.randomUUID(), from: selected[0], to: selected[1] }] }, 'Connect cards');
        else setConnecting(!connecting);
      }}>{connecting ? 'Select another card…' : 'Connect'}</button><button disabled={selected.some(id=>{const p=placements.get(id),c=p&&lookup.get(p.cardId);return !!p?.folder||!!c&&parent(c.path)===portable(board.folder);})} onClick={() => {
        save({ ...current, cards: current.cards.filter(p => !selected.includes(p.id)), edges: current.edges.filter(e => !selected.includes(e.from) && !selected.includes(e.to)) }, 'Remove placement'); setSelected([]);
      }} data-tooltip="Remove a reference; cards belonging to this folder always stay on its whiteboard">Remove reference</button></div>}
      <div className="canvas-controls">
        <Tool icon="minus" label="Zoom out" onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 0.9)}/>
        <button ref={zoomLabel} className="zoom-level" aria-label="Zoom to fit" data-tooltip="Zoom to fit · ⌘1 / Ctrl+1" onClick={fit}>85%</button>
        <Tool icon="plus" label="Zoom in" onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 1.1)}/>
      </div>
    </div>
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </div>;
});
