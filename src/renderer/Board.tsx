import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Board, Card, CardInfo, Placement } from '../shared';
import { preview } from './markdown';
import { BoardNavigation, type Camera } from './navigation';
import { Icon } from './Icons';
import { CardEditor, type EditorFocus } from './Editor';
import type { ReactNode } from 'react';

export function isVisible(p: Placement, camera: Camera, width: number, height: number, margin = 160) {
  return (p.x + p.width) * camera.zoom + camera.x > -margin && p.x * camera.zoom + camera.x < width + margin &&
    (p.y + p.height) * camera.zoom + camera.y > -margin && p.y * camera.zoom + camera.y < height + margin;
}
const Preview = memo(function Preview({ card, onOpen, cache }: {
  card: CardInfo; onOpen: (id: string) => void; cache: Map<string, string>;
}) {
  const key = `${card.path}:${card.revision}`;
  const [html, setHtml] = useState(cache.get(key) ?? '');
  useEffect(() => {
    let live = true;
    const cached = cache.get(key);
    if (cached !== undefined) { setHtml(cached); return; }
    void window.door.request<Card>({ kind: 'card', path: card.path }).then(c => {
      const rendered = preview(c.body, c.path);
      // Bound cached previews to 64 entries of at most 128k characters each.
      if (rendered.length <= 128000 && c.revision === card.revision) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, rendered);
      }
      if (live) setHtml(rendered);
    }).catch(() => { if (live) setHtml('<p>Card unavailable</p>'); });
    return () => { live = false; };
  }, [card.path, card.revision, key, cache]);
  return <div className="prose card-preview" onClick={e => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (href) { e.preventDefault(); if (href.startsWith('card:')) onOpen(href.slice(5)); }
  }} dangerouslySetInnerHTML={{ __html: html || '<p class="empty-text">Click to write</p>' }} />;
});
interface Props {
  enabled?: boolean; initialCamera?: Camera; onCamera?: (camera:Camera)=>void; folders?: string[]; onOpenFolder?: (folder:string)=>void; onReference?: (id:string)=>void;
  board: Board; cards: CardInfo[]; onSave: (board: Board, label: string, base: Board) => void | Promise<void>;
  onOpen: (path: string) => void; onCreate: (x: number, y: number) => void;
  draft?: { card: Card; body: string } | null; onEdit?: (body: string) => void; onFinish?: () => void; cardDetails?: ReactNode;
}
interface Gesture {
  type: 'pan' | 'move' | 'resize' | 'select'; ids: string[]; x: number; y: number; pointerId: number;
  board: Board; camera: Camera; rect: DOMRect; additive: boolean; initialSelection: string[];
}
const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');

export const Whiteboard = memo(function Whiteboard({ board, cards, onSave, onOpen, onCreate, draft, onEdit, onFinish, cardDetails, enabled=true, initialCamera, onCamera, folders=[], onOpenFolder, onReference }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const zoomInput = useRef<HTMLInputElement>(null);
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
  const [selected, setSelected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState('');
  const [focusPoint, setFocusPoint] = useState<EditorFocus>();
  const current = working ?? board;
  const active = current.cards.find(p => p.id === editingPlacement && p.cardId === draft?.card.id) ?? current.cards.find(p => p.cardId === draft?.card.id);
  const lookup = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const placements = useMemo(() => new Map(current.cards.map(p => [p.id, p])), [current.cards]);
  const openReference = useCallback((id: string) => {
    const target = lookup.get(id); if (target) { if(onReference) onReference(id); else onOpen(target.path); }
  }, [lookup, onOpen, onReference]);
  const latest = useRef({ board: current, onFinish, move, end, enabled, onCamera });
  latest.current = { board: current, onFinish, move, end, enabled, onCamera };

  useLayoutEffect(() => {
    const element = viewport.current!;
    const nav = new BoardNavigation(element, world.current!, grid.current!, zoomInput.current!, camera => {setView(camera);latest.current.onCamera?.(camera);});
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
      additive: e.shiftKey || e.metaKey || e.ctrlKey, initialSelection: selected };
    // Keep card clicks on the card; viewport capture would turn double-clicks into card creation.
    e.currentTarget.setPointerCapture(e.pointerId);
    if (type === 'pan') element.dataset.panning = 'true';
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
    const body=(e.target as HTMLElement).closest<HTMLElement>('.card-preview,.distant-card');
    if (body) {
      const placement=current.cards.find(p => p.id === id), card=placement && lookup.get(placement.cardId);
      if (card) {
        e.preventDefault(); e.stopPropagation(); setSelected([id]); setEditingPlacement(id);
        setFocusPoint({x:e.clientX,y:e.clientY,scrollTop:body.scrollTop}); onOpen(card.path);
      }
      return;
    }
    onFinish?.();
    const ids = selected.includes(id) ? selected : [id];
    setSelected(ids); begin(e, 'move', ids);
  }
  function selectRegion(g: Gesture, x: number, y: number) {
    const left = Math.min(g.x, x) - g.rect.left, top = Math.min(g.y, y) - g.rect.top;
    const width = Math.abs(x - g.x), height = Math.abs(y - g.y);
    Object.assign(selectionBox.current!.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const a = (left - g.camera.x) / g.camera.zoom, b = (top - g.camera.y) / g.camera.zoom;
    const ids = g.board.cards.filter(p => p.x <= a + width / g.camera.zoom && p.x + p.width >= a && p.y <= b + height / g.camera.zoom && p.y + p.height >= b).map(p => p.id);
    const next = g.additive ? [...new Set([...g.initialSelection, ...ids])] : ids;
    setSelected(previous => previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next);
  }
  function movedBoard(g: Gesture, x: number, y: number): Board {
    const dx = (x - g.x) / g.camera.zoom, dy = (y - g.y) / g.camera.zoom;
    return { ...g.board, cards: g.board.cards.map(p => !g.ids.includes(p.id) ? p : g.type === 'move' ?
      { ...p, x: p.x + dx, y: p.y + dy } : { ...p, width: Math.max(200, p.width + dx), height: Math.max(120, p.height + dy) }) };
  }
  function move(e: Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.type === 'pan') navigation.current!.set({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
    else if (g.type === 'select') { if (Math.abs(dx) + Math.abs(dy) > 3) selectRegion(g, e.clientX, e.clientY); }
    else {
      dragPoint.current = { x: e.clientX, y: e.clientY };
      if (dragFrame.current === null) dragFrame.current = viewport.current!.ownerDocument.defaultView!.requestAnimationFrame(() => {
        dragFrame.current = null;
        if (gesture.current === g) setWorking(movedBoard(g, dragPoint.current.x, dragPoint.current.y));
      });
    }
  }
  function end(e: Pick<globalThis.PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return;
    const moved = Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3;
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
  }
  function cancel() {
    gesture.current = null; setWorking(pendingSave.current);
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
  function fit() {
    const nav = navigation.current, element = viewport.current;
    if (!nav || !element) return;
    const cards = latest.current.board.cards;
    if (!cards.length) { nav.set({ x: 20, y: 20, zoom: 1 }); return; }
    const left = Math.min(...cards.map(p => p.x)), top = Math.min(...cards.map(p => p.y));
    const width = Math.max(1, Math.max(...cards.map(p => p.x + p.width)) - left);
    const height = Math.max(1, Math.max(...cards.map(p => p.y + p.height)) - top);
    const zoom = Math.min(1.6, Math.max(0.25, Math.min((element.clientWidth - 120) / width, (element.clientHeight - 120) / height)));
    nav.flush(); nav.set({ zoom, x: element.clientWidth / 2 - (left + width / 2) * zoom, y: element.clientHeight / 2 - (top + height / 2) * zoom });
  }
  const visible = current.cards.filter(p => p.id === active?.id || gesture.current?.ids.includes(p.id) || isVisible(p, view, size.width, size.height, Math.max(size.width, size.height)));
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
            return a && b ? <line key={edge.id} x1={a.x + a.width / 2} y1={a.y + a.height / 2} x2={b.x + b.width / 2} y2={b.y + b.height / 2}/> : null;
          })}
        </svg>
        {visible.map(p => {
          const card = lookup.get(p.cardId), folder = card?.path.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
          return <article key={p.id} data-placement={p.id} className={`board-card ${selected.includes(p.id) ? 'selected' : ''} ${!card && !p.folder ? 'missing' : ''} ${active?.id === p.id ? 'editing' : ''}`}
            title={p.folder ?? card?.path ?? `Missing card ${p.cardId}`} style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
            onPointerDown={e => startCard(e, p.id)}>
            <div className="card-grip"><span>{p.folder ? 'Whiteboard' : folder === board.folder ? 'Card' : '↗ Reference'}</span><button title={p.folder ? 'Open sub-whiteboard' : 'Edit card in place'} onClick={() => { if(p.folder) onOpenFolder?.(p.folder); if (card) { setEditingPlacement(p.id); setFocusPoint(undefined); onOpen(card.path); } }}>✎</button></div>
            {p.folder ? <button className="subboard-preview" title={'Open '+p.folder} onClick={()=>onOpenFolder?.(p.folder!)}><Icon name="map" size={28}/><strong>{p.folder.split(/[\\/]/).at(-1)}</strong><small>{folders.includes(p.folder) ? cards.filter(c=>c.path.replaceAll('\\','/').split('/').slice(0,-1).join('/')===p.folder).length+' cards' : 'Missing whiteboard'}</small></button> : active?.id === p.id && draft ? <div className="card-editor">
              <CardEditor path={draft.card.path} body={draft.body} cards={cards} onEdit={onEdit!} autofocus focusPoint={focusPoint}/>
              {cardDetails}
            </div> : card ? view.zoom < 0.4 ? <div className="distant-card">{card.name}</div> :
              <Preview card={card} onOpen={openReference} cache={cache.current}/> : <div className="missing-card">Missing card<br/><small>{p.cardId.slice(0, 12)}</small></div>}
            <button className="resize-handle" aria-label={`Resize ${card?.name ?? 'card'}`} onPointerDown={e => { if (e.button === 0) begin(e, 'resize', [p.id]); }}>⌟</button>
          </article>;
        })}
      </div>
      <div className="selection-box" ref={selectionBox}/>
      {!board.cards.length && <div className="canvas-empty"><button className="primary" title={board.folder ? "Create a card in this whiteboard" : "Create a sub-whiteboard"} onClick={() => onCreate(100, 100)}>{board.folder ? "+ New card" : "+ New whiteboard"}</button></div>}
      {!!selected.length && !active && <div className="selection-tools"><span>{selected.length} selected</span><button title="Connect selected cards" disabled={selected.length > 2} onClick={() => {
        if (selected.length === 2) save({ ...current, edges: [...current.edges, { id: crypto.randomUUID(), from: selected[0], to: selected[1] }] }, 'Connect cards');
        else setConnecting(!connecting);
      }}>{connecting ? 'Select another card…' : 'Connect'}</button><button onClick={() => {
        save({ ...current, cards: current.cards.filter(p => !selected.includes(p.id)), edges: current.edges.filter(e => !selected.includes(e.from) && !selected.includes(e.to)) }, 'Remove placement'); setSelected([]);
      }} title="Remove this placement; keep the original file">Remove placement</button></div>}
      <div className="canvas-controls">
        <button title="Zoom out" onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 0.9)}>−</button>
        <input ref={zoomInput} aria-label="Zoom percentage" defaultValue="85%" onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={e => {
          const value = Number.parseFloat(e.target.value.replace(/%$/, '').trim());
          if (Number.isFinite(value) && value > 0) navigation.current!.zoomTo(value / 100);
          else e.target.value = `${Math.round(navigation.current!.current.zoom * 100)}%`;
        }}/>
        <button title="Zoom in" onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 1.1)}>+</button><i/><button title="Fit whiteboard in this pane · ⌘1 / Ctrl+1" onClick={fit}>Fit</button>
      </div>
    </div>

  </div>;
});
