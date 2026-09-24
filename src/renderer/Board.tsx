import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Board, Card, CardInfo, Placement } from '../shared';
import { preview } from './markdown';

export function isVisible(p: Placement,camera:{x:number;y:number;zoom:number},width:number,height:number) {
  return (p.x+p.width)*camera.zoom+camera.x > -160 && p.x*camera.zoom+camera.x < width+160 && (p.y+p.height)*camera.zoom+camera.y > -160 && p.y*camera.zoom+camera.y < height+160;
}
const Preview=memo(function Preview({card,onOpen}:{card:CardInfo;onOpen:(id:string)=>void}) {
  const [body,setBody]=useState('');
  useEffect(() => { let live=true; void window.door.request<Card>({kind:'card',path:card.path}).then(c => { if (live) setBody(c.body); }).catch(() => { if (live) setBody('Card unavailable'); }); return () => { live=false; }; },[card.path,card.revision]);
  const html=useMemo(() => preview(body,card.path),[body,card.path]);
  return <div className="prose card-preview" onClick={e => {
    const href=(e.target as HTMLElement).closest('a')?.getAttribute('href');
    if (href) { e.preventDefault(); if (href.startsWith('card:')) onOpen(href.slice(5)); }
  }} dangerouslySetInnerHTML={{__html:html || '<p class="empty-text">An unwritten idea…</p>'}} />;
});
interface Props { board:Board;cards:CardInfo[];onSave:(board:Board,label:string)=>void;onOpen:(path:string)=>void;onCreate:(x:number,y:number)=>void }
export const Whiteboard=memo(function Whiteboard({board,cards,onSave,onOpen,onCreate}:Props) {
  const viewport=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:1000,height:800});
  const [camera,setCamera]=useState({x:20,y:20,zoom:0.85});
  const [working,setWorking]=useState<Board|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [connecting,setConnecting]=useState(false);
  const gesture=useRef<{type:'pan'|'move'|'resize';id?:string;x:number;y:number;board:Board;camera:typeof camera;moved:boolean}|null>(null);
  const current=working ?? board;
  const lookup=useMemo(() => new Map(cards.map(c => [c.id,c])),[cards]);
  useEffect(() => { setWorking(null); setSelected([]); },[board.path]);
  useEffect(() => { if (!gesture.current) setWorking(null); },[board.revision]);
  useEffect(() => {
    const element=viewport.current!;
    const observer=new ResizeObserver(([entry]) => setSize({width:entry.contentRect.width,height:entry.contentRect.height})); observer.observe(element);
    const wheel=(event:WheelEvent) => {
      if ((event.target as HTMLElement).closest('.card-preview') && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds=element.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;
      setCamera(c => {
        if (!event.ctrlKey && !event.metaKey) return {...c,x:c.x-event.deltaX,y:c.y-event.deltaY};
        const zoom=Math.min(2,Math.max(0.15,c.zoom*Math.exp(-event.deltaY*0.008)));
        return {zoom,x:x-(x-c.x)*zoom/c.zoom,y:y-(y-c.y)*zoom/c.zoom};
      });
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return () => { observer.disconnect(); element.removeEventListener('wheel',wheel); };
  },[]);
  function start(e:PointerEvent,type:'pan'|'move'|'resize',id?:string) {
    if (e.button !== 0) return;
    if (id && connecting && selected[0] && id !== selected[0]) {
      onSave({...board,edges:[...board.edges,{id:crypto.randomUUID(),from:selected[0],to:id}]},'Connect cards');
      setConnecting(false); e.stopPropagation(); return;
    }
    if (id) setSelected(previous => e.shiftKey ? [...new Set([...previous,id])].slice(-2) : [id]);
    else setSelected([]);
    gesture.current={type,id,x:e.clientX,y:e.clientY,board:current,camera,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId); e.stopPropagation();
  }
  function move(e:PointerEvent) {
    const g=gesture.current; if (!g) return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y; g.moved ||= Math.abs(dx)+Math.abs(dy)>2;
    if (g.type === 'pan') setCamera({...g.camera,x:g.camera.x+dx,y:g.camera.y+dy});
    else setWorking({...g.board,cards:g.board.cards.map(p => p.id !== g.id ? p : g.type === 'move' ? {...p,x:p.x+dx/camera.zoom,y:p.y+dy/camera.zoom} : {...p,width:Math.max(200,p.width+dx/camera.zoom),height:Math.max(120,p.height+dy/camera.zoom)})});
  }
  function end(e:PointerEvent) {
    const g=gesture.current; gesture.current=null;
    if (g && g.type !== 'pan') {
      const dx=(e.clientX-g.x)/g.camera.zoom,dy=(e.clientY-g.y)/g.camera.zoom;
      if (Math.abs(dx)+Math.abs(dy)>2) {
        // The final pointer event can arrive before React renders the last move.
        const final={...g.board,cards:g.board.cards.map(p => p.id !== g.id ? p : g.type === 'move' ? {...p,x:p.x+dx,y:p.y+dy} : {...p,width:Math.max(200,p.width+dx),height:Math.max(120,p.height+dy)})};
        onSave(final,g.type === 'move' ? 'Move card' : 'Resize card');
      }
    }
    setWorking(null);
  }
  function fit() {
    if (!current.cards.length) { setCamera({x:20,y:20,zoom:1}); return; }
    const left=Math.min(...current.cards.map(p => p.x)),top=Math.min(...current.cards.map(p => p.y));
    const right=Math.max(...current.cards.map(p => p.x+p.width)),bottom=Math.max(...current.cards.map(p => p.y+p.height));
    const zoom=Math.min(1,(size.width-100)/(right-left),(size.height-120)/(bottom-top));
    setCamera({zoom:Math.max(.15,zoom),x:(size.width-(right-left)*zoom)/2-left*zoom,y:(size.height-(bottom-top)*zoom)/2-top*zoom});
  }
  const visible=current.cards.filter(p => isVisible(p,camera,size.width,size.height));
  return <div className="board-shell">
    <div className="canvas" ref={viewport} style={{backgroundSize:`${24*camera.zoom}px ${24*camera.zoom}px`,backgroundPosition:`${camera.x}px ${camera.y}px`}} onPointerDown={e => { if (!(e.target as HTMLElement).closest('.board-card,.canvas-controls,.selection-tools')) start(e,'pan'); }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current=null; setWorking(null); }} onDoubleClick={e => { if (e.target === viewport.current) { const r=viewport.current.getBoundingClientRect(); onCreate((e.clientX-r.left-camera.x)/camera.zoom,(e.clientY-r.top-camera.y)/camera.zoom); } }}>
      <svg className="connections" aria-hidden="true"><g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
        {current.edges.map(edge => { const a=current.cards.find(p => p.id === edge.from),b=current.cards.find(p => p.id === edge.to); return a && b ? <line key={edge.id} x1={a.x+a.width/2} y1={a.y+a.height/2} x2={b.x+b.width/2} y2={b.y+b.height/2} /> : null; })}
      </g></svg>
      {visible.map(p => {
        const card=lookup.get(p.cardId),folder=card?.path.replaceAll('\\','/').split('/').slice(0,-1).join('/');
        return <article key={p.id} className={`board-card ${selected.includes(p.id) ? 'selected' : ''} ${!card ? 'missing' : ''}`} title={card?.path ?? `Missing card ${p.cardId}`} style={{left:p.x*camera.zoom+camera.x,top:p.y*camera.zoom+camera.y,width:p.width,height:p.height,transform:`scale(${camera.zoom})`}} onDoubleClick={() => card && onOpen(card.path)}>
          <div className="card-grip" onPointerDown={e => start(e,'move',p.id)}><span>{folder === board.folder ? '•' : '↗'} {folder !== board.folder ? 'Reference' : 'Card'}</span><button title="Open card" onClick={() => card && onOpen(card.path)}>↗</button></div>
          {card ? camera.zoom < .4 ? <div className="distant-card">{card.name}</div> : <Preview card={card} onOpen={id => { const target=lookup.get(id); if (target) onOpen(target.path); }} /> : <div className="missing-card">Missing card<br/><small>{p.cardId.slice(0,12)}</small></div>}
          <button className="resize-handle" aria-label={`Resize ${card?.name ?? 'card'}`} onPointerDown={e => start(e,'resize',p.id)}>⌟</button>
        </article>;
      })}
      {!board.cards.length && <div className="canvas-empty"><span>✧</span><h2>Give an idea some space.</h2><p>Create your first card to start this whiteboard.</p><button className="primary" onClick={() => onCreate(100,100)}>+ New card</button></div>}
      {!!selected.length && <div className="selection-tools"><span>{selected.length} selected</span><button onClick={() => {
        if (selected.length === 2) onSave({...board,edges:[...board.edges,{id:crypto.randomUUID(),from:selected[0],to:selected[1]}]},'Connect cards'); else setConnecting(!connecting);
      }}>{connecting ? 'Select another card…' : 'Connect'}</button><button onClick={() => { onSave({...board,cards:board.cards.filter(p => !selected.includes(p.id)),edges:board.edges.filter(e => !selected.includes(e.from) && !selected.includes(e.to))},'Remove placement'); setSelected([]); }}>Remove placement</button></div>}
      <div className="canvas-controls"><button title="Zoom out" onClick={() => setCamera(c => ({...c,zoom:Math.max(.15,c.zoom/1.2)}))}>−</button><span>{Math.round(camera.zoom*100)}%</span><button title="Zoom in" onClick={() => setCamera(c => ({...c,zoom:Math.min(2,c.zoom*1.2)}))}>+</button><i/><button onClick={fit}>Fit</button></div>
    </div>
    <div className="canvas-footer"><span>{board.cards.length} cards · {board.edges.length} connections</span><span>Drag to pan · Double-click to write</span></div>
  </div>;
});
