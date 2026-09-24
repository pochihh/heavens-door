import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Board, Card, CardInfo, Placement } from '../shared';
import { preview } from './markdown';
import { BoardNavigation, type Camera } from './navigation';

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
  }} dangerouslySetInnerHTML={{ __html: html || '<p class="empty-text">An unwritten idea…</p>' }} />;
});
interface Props {
  board: Board; cards: CardInfo[]; onSave: (board: Board, label: string) => void;
  onOpen: (path: string) => void; onCreate: (x: number, y: number) => void;
}
interface Gesture {
  type: 'pan' | 'move' | 'resize' | 'select'; ids: string[]; x: number; y: number;
  board: Board; camera: Camera; rect: DOMRect; additive: boolean; initialSelection: string[];
}
const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');

export const Whiteboard = memo(function Whiteboard({ board, cards, onSave, onOpen, onCreate }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const zoomInput = useRef<HTMLInputElement>(null);
  const selectionBox = useRef<HTMLDivElement>(null);
  const navigation = useRef<BoardNavigation | null>(null);
  const spaceDown = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const cache = useRef(new Map<string, string>());
  const [size, setSize] = useState({ width: 1000, height: 800 });
  const [view, setView] = useState<Camera>({ x: 20, y: 20, zoom: 0.85 });
  const [working, setWorking] = useState<Board | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const current = working ?? board;
  const lookup = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const placements = useMemo(() => new Map(current.cards.map(p => [p.id, p])), [current.cards]);
  const openReference = useCallback((id: string) => {
    const target = lookup.get(id); if (target) onOpen(target.path);
  }, [lookup, onOpen]);
  const latest = useRef({ board: current, onSave });
  latest.current = { board: current, onSave };

  useEffect(() => { if (!gesture.current) setWorking(null); }, [board.revision]);
  useLayoutEffect(() => {
    const element = viewport.current!;
    const nav = new BoardNavigation(element, world.current!, grid.current!, zoomInput.current!, setView);
    navigation.current = nav;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('.canvas-controls,.selection-tools')) return;
      if (gesture.current) { event.preventDefault(); return; }
      nav.wheel(event);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || editable(event.target)) return;
      if (event.code === 'Space' && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
        spaceDown.current = true; element.dataset.space = 'true'; event.preventDefault();
      }
      if ((event.metaKey || event.ctrlKey) && ['=', '+', '-', '0', '1'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '1') fit();
        else nav.zoomTo(event.key === '0' ? 1 : nav.current.zoom * (event.key === '-' ? 0.9 : 1.1));
      }
      if (event.key === 'Escape') { cancel(); setSelected([]); setConnecting(false); }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') { spaceDown.current = false; delete element.dataset.space; }
    };
    const blur = () => { spaceDown.current = false; delete element.dataset.space; cancel(); };
    element.addEventListener('wheel', wheel, { passive: false, capture: true });
    element.ownerDocument.addEventListener('keydown', keydown);
    element.ownerDocument.addEventListener('keyup', keyup);
    element.ownerDocument.defaultView!.addEventListener('blur', blur);
    return () => {
      observer.disconnect(); nav.dispose(); navigation.current = null;
      element.removeEventListener('wheel', wheel, true);
      element.ownerDocument.removeEventListener('keydown', keydown);
      element.ownerDocument.removeEventListener('keyup', keyup);
      element.ownerDocument.defaultView!.removeEventListener('blur', blur);
    };
  }, []);

  function begin(e: PointerEvent, type: Gesture['type'], ids: string[] = []) {
    const element = viewport.current!, nav = navigation.current!;
    nav.flush();
    e.preventDefault(); e.stopPropagation(); element.focus({ preventScroll: true });
    gesture.current = { type, ids, x: e.clientX, y: e.clientY, board: current,
      camera: { ...nav.current }, rect: element.getBoundingClientRect(),
      additive: e.shiftKey || e.metaKey || e.ctrlKey, initialSelection: selected };
    // Keep card clicks on the card; viewport capture would turn double-clicks into card creation.
    e.currentTarget.setPointerCapture(e.pointerId);
    if (type === 'pan') element.dataset.panning = 'true';
  }
  function capture(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.canvas-controls,.selection-tools,.canvas-empty button') || editable(target)) return;
    const card = target.closest<HTMLElement>('.board-card');
    if (e.button === 1 || (e.button === 0 && spaceDown.current) || (e.button === 2 && !card)) {
      begin(e, 'pan'); return;
    }
    if (!card && e.button === 0) { setConnecting(false); begin(e, 'select'); }
    if (card && e.button === 2) {
      e.preventDefault(); e.stopPropagation();
      const id = card.dataset.placement!; if (!selected.includes(id)) setSelected([id]);
    }
  }
  function startCard(e: PointerEvent, id: string) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,a,input')) return;
    if (connecting && selected.length === 1 && id !== selected[0]) {
      onSave({ ...board, edges: [...board.edges, { id: crypto.randomUUID(), from: selected[0], to: id }] }, 'Connect cards');
      setConnecting(false); e.stopPropagation(); return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected(previous => e.shiftKey ? [...new Set([...previous, id])] : previous.includes(id) ? previous.filter(p => p !== id) : [...previous, id]);
      e.preventDefault(); e.stopPropagation(); return;
    }
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
  function move(e: PointerEvent) {
    const g = gesture.current; if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.type === 'pan') navigation.current!.set({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy });
    else if (g.type === 'select') { if (Math.abs(dx) + Math.abs(dy) > 3) selectRegion(g, e.clientX, e.clientY); }
    else setWorking(movedBoard(g, e.clientX, e.clientY));
  }
  function end(e: PointerEvent) {
    const g = gesture.current; if (!g) return;
    const moved = Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3;
    if (g.type === 'pan') {
      navigation.current!.set({ ...g.camera, x: g.camera.x + e.clientX - g.x, y: g.camera.y + e.clientY - g.y });
    } else if (g.type === 'select') {
      if (moved) selectRegion(g, e.clientX, e.clientY); else if (!g.additive) setSelected([]);
    } else if (moved) {
      // The last pointer event may arrive before React renders the last move.
      onSave(movedBoard(g, e.clientX, e.clientY), g.type === 'move' ? 'Move cards' : 'Resize card');
    }
    cancel();
    if (viewport.current!.hasPointerCapture(e.pointerId)) viewport.current!.releasePointerCapture(e.pointerId);
  }
  function cancel() {
    gesture.current = null; setWorking(null);
    if (viewport.current) delete viewport.current.dataset.panning;
    if (selectionBox.current) selectionBox.current.style.display = 'none';
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
  const visible = current.cards.filter(p => isVisible(p, view, size.width, size.height, Math.max(size.width, size.height)));
  return <div className="board-shell">
    <div className="canvas" data-navigation="obsidian" ref={viewport} tabIndex={0} aria-label="Whiteboard canvas"
      onPointerDownCapture={capture} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}
      onLostPointerCapture={() => { if (gesture.current) cancel(); }} onContextMenu={e => e.preventDefault()}
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
          return <article key={p.id} data-placement={p.id} className={`board-card ${selected.includes(p.id) ? 'selected' : ''} ${!card ? 'missing' : ''}`}
            title={card?.path ?? `Missing card ${p.cardId}`} style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
            onPointerDown={e => startCard(e, p.id)} onDoubleClick={() => card && onOpen(card.path)}>
            <div className="card-grip"><span>{folder === board.folder ? '• Card' : '↗ Reference'}</span><button title="Open card" onClick={() => card && onOpen(card.path)}>↗</button></div>
            {card ? view.zoom < 0.4 ? <div className="distant-card">{card.name}</div> :
              <Preview card={card} onOpen={openReference} cache={cache.current}/> : <div className="missing-card">Missing card<br/><small>{p.cardId.slice(0, 12)}</small></div>}
            <button className="resize-handle" aria-label={`Resize ${card?.name ?? 'card'}`} onPointerDown={e => { if (e.button === 0) begin(e, 'resize', [p.id]); }}>⌟</button>
          </article>;
        })}
      </div>
      <div className="selection-box" ref={selectionBox}/>
      {!board.cards.length && <div className="canvas-empty"><span>✧</span><h2>Give an idea some space.</h2><p>Create your first card to start this whiteboard.</p><button className="primary" onClick={() => onCreate(100, 100)}>+ New card</button></div>}
      {!!selected.length && <div className="selection-tools"><span>{selected.length} selected</span><button disabled={selected.length > 2} onClick={() => {
        if (selected.length === 2) onSave({ ...board, edges: [...board.edges, { id: crypto.randomUUID(), from: selected[0], to: selected[1] }] }, 'Connect cards');
        else setConnecting(!connecting);
      }}>{connecting ? 'Select another card…' : 'Connect'}</button><button onClick={() => {
        onSave({ ...board, cards: board.cards.filter(p => !selected.includes(p.id)), edges: board.edges.filter(e => !selected.includes(e.from) && !selected.includes(e.to)) }, 'Remove placement'); setSelected([]);
      }}>Remove placement</button></div>}
      <div className="canvas-controls">
        <button title="Zoom out" onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 0.9)}>−</button>
        <input ref={zoomInput} aria-label="Zoom percentage" defaultValue="85%" onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={e => {
          const value = Number.parseFloat(e.target.value.replace(/%$/, '').trim());
          if (Number.isFinite(value) && value > 0) navigation.current!.zoomTo(value / 100);
          else e.target.value = `${Math.round(navigation.current!.current.zoom * 100)}%`;
        }}/>
        <button title="Zoom in" onClick={() => navigation.current!.zoomTo(navigation.current!.current.zoom * 1.1)}>+</button><i/><button onClick={fit}>Fit</button>
      </div>
    </div>
    <div className="canvas-footer"><span>{board.cards.length} cards · {board.edges.length} connections</span><span>Wheel to zoom · Space-drag to pan · Drag to select</span></div>
  </div>;
});
