import {EdgeAnchors} from './EdgeAnchors';
import {connectorScene,closestConnector} from './connector-proximity';
import {fontSizeCSS} from '../font-size';
import {canReconnectBranch,topicText} from '../topics';
import { tintColor } from '../colors';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { AnchorSide, Arrowhead, Board, Edge, EdgeStyle, Mention, Placement } from '../shared';
import {BOARD_CAMERA_EVENT,type Camera} from './navigation';
import { anchor, curve, edgeGeometry, nearestSide, opposite, strokeDash, type Point } from './edge-geometry';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import { ActionMenu, type MenuState } from './Overlays';

interface Props {
  styleActions?:(id:string)=>import('./Overlays').MenuAction[];
  onCreateTopic?:(x:number,y:number,from:string,side:AnchorSide)=>void;
  edgeDefaults?:EdgeStyle;
  board:Board;mentions:Mention[];heightOf:(p:Placement)=>number;camera:()=>Camera;viewport:RefObject<HTMLDivElement|null>;
  selectedCards:string[];selectedEdges:string[];enabled:boolean;onSelect:(ids:string[],add:boolean,toggle?:boolean)=>void;
  onSave:(board:Board,label:string)=>void;onFinish:()=>void;onStyle:()=>void;
}
interface Pending {from:string;side:AnchorSide;pointerId?:number;x:number;y:number;moved:boolean;edge?:Edge;endpoint?:'from'|'to';keyboard?:boolean}
export function Edges(props:Props) {
  const {board,mentions,heightOf,selectedCards,selectedEdges,viewport,onSelect,onSave,onFinish,onStyle}=props;
  const markerId=useId().replaceAll(':',''),latest=useRef(props);latest.current=props;
  const preview=useRef<SVGPathElement>(null),pending=useRef<Pending|null>(null),frame=useRef<number|null>(null),point=useRef({x:0,y:0});
  const [connecting,setConnecting]=useState(false),[menu,setMenu]=useState<MenuState|null>(null),[label,setLabel]=useState<{id:string;text:string}|null>(null);
  const placements=new Map(board.cards.map(p=>[p.id,p]));
  const scene=useMemo(()=>connectorScene(board.cards,heightOf),[board.cards,heightOf]),sceneRef=useRef(scene);sceneRef.current=scene;
  function clear(){pending.current=null;setConnecting(false);preview.current?.setAttribute('d','');if(frame.current!==null)viewport.current?.ownerDocument.defaultView?.cancelAnimationFrame(frame.current);frame.current=null;}
  function worldPoint(x:number,y:number):Point {const r=viewport.current!.getBoundingClientRect(),c=latest.current.camera();return {x:(x-r.left-c.x)/c.zoom,y:(y-r.top-c.y)/c.zoom};}
  function targetAt(x:number,y:number) {
    const p=worldPoint(x,y),source=pending.current?.from,geometry=sceneRef.current,near=closestConnector(geometry.points,p,latest.current.camera().zoom,source);
    if(near)return {card:near.card,side:near.side};
    for(let i=geometry.rects.length-1;i>=0;i--){const {card,height}=geometry.rects[i];if(card.id!==source&&p.x>=card.x&&p.x<=card.x+card.width&&p.y>=card.y&&p.y<=card.y+height)return {card,side:nearestSide(card,p,height)};}
  }
  function draw(x:number,y:number){
    const g=pending.current;if(!g)return;
    const {board,heightOf}=latest.current,from=board.cards.find(p=>p.id===g.from);if(!from){clear();return;}
    const target=targetAt(x,y),start=anchor(from,g.side,heightOf(from)),end=target?anchor(target.card,target.side,heightOf(target.card)):worldPoint(x,y),side=target?.side??opposite[g.side];
    const style=g.edge??{fromArrowhead:'none',toArrowhead:'arrow',...latest.current.edgeDefaults} as const;
    preview.current?.setAttribute('d',g.endpoint==='from'?curve(end,start,side,g.side,style).path:curve(start,end,g.side,side,style).path);
  }
  function complete(x:number,y:number,exact?:{card:Placement;side:AnchorSide}){
    const g=pending.current,target=exact??targetAt(x,y);if(!g)return;if(!target&&!g.edge&&latest.current.onCreateTopic){g.pointerId=undefined;point.current={x,y};draw(x,y);return;}if(!target||target.card.id===g.from){clear();return;}
    const {board,onSave,onSelect}=latest.current;
    const next:Edge=g.edge?{...g.edge,[g.endpoint!]:target.card.id,[g.endpoint!+'Side']:target.side}:{id:crypto.randomUUID(),from:g.from,to:target.card.id,fromSide:g.side,toSide:target.side,fromArrowhead:'none',toArrowhead:'arrow',...latest.current.edgeDefaults};
    // A visual reconnection remains valid even when it no longer describes a tree branch.
    if(next.kind==='branch'&&!canReconnectBranch(board,next))next.kind=undefined;
    onSave({...board,edges:g.edge?board.edges.map(e=>e.id===next.id?next:e):[...board.edges,next]},g.edge?ui.history.reconnectEdge:ui.history.createEdge);
    onSelect([next.id],false);
    clear();
  }
  function keyboardStart(card:Placement,side:AnchorSide,at:Point,edge?:Edge,endpoint?:'from'|'to'){
    const r=viewport.current!.getBoundingClientRect(),c=latest.current.camera(),x=r.left+at.x*c.zoom+c.x,y=r.top+at.y*c.zoom+c.y;
    if(pending.current&&!edge){complete(x,y,{card,side});return;}
    onFinish();pending.current={from:card.id,side,x,y,moved:false,edge,endpoint,keyboard:true};point.current={x,y};setConnecting(true);
  }
  function start(event:React.PointerEvent,card:Placement,side:AnchorSide,edge?:Edge,endpoint?:'from'|'to'){
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();onFinish();
    if(pending.current&&!edge){complete(event.clientX,event.clientY,{card,side});return;}
    pending.current={from:card.id,side,pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,edge,endpoint};setConnecting(true);
    point.current={x:event.clientX,y:event.clientY};viewport.current?.focus({preventScroll:true});viewport.current?.setPointerCapture?.(event.pointerId);draw(event.clientX,event.clientY);
  }
  useEffect(()=>{
    const doc=viewport.current!.ownerDocument;
    const redraw=()=>{if(pending.current&&frame.current===null)frame.current=doc.defaultView!.requestAnimationFrame(()=>{frame.current=null;draw(point.current.x,point.current.y);});};
    const move=(e:PointerEvent)=>{
      const g=pending.current;if(!g||g.pointerId!==undefined&&g.pointerId!==e.pointerId)return;
      g.moved||=Math.abs(e.clientX-g.x)+Math.abs(e.clientY-g.y)>3;point.current={x:e.clientX,y:e.clientY};
      redraw();
    };
    const up=(e:PointerEvent)=>{
      const g=pending.current;if(!g||g.pointerId!==e.pointerId)return;
      if(g.moved||Math.abs(e.clientX-g.x)+Math.abs(e.clientY-g.y)>3)complete(e.clientX,e.clientY);
      else if(g.edge)clear();else g.pointerId=undefined;
    };
    const down=(e:PointerEvent)=>{
      if(!pending.current||!viewport.current?.contains(e.target as Node))return;
      if(e.button===2){e.preventDefault();e.stopPropagation();clear();return;}
      if((e.target as Element).closest('.canvas-controls,button,input,textarea,a')&&!(e.target as Element).closest('[data-anchor-card]'))return;
      if(pending.current.pointerId===undefined&&e.button===0){
        e.stopPropagation();
        if(!targetAt(e.clientX,e.clientY)&&latest.current.onCreateTopic){point.current={x:e.clientX,y:e.clientY};draw(e.clientX,e.clientY);return;}
        e.preventDefault();
        const anchor=(e.target as Element).closest('[data-anchor-card]'),card=latest.current.board.cards.find(p=>p.id===anchor?.getAttribute('data-anchor-card'));
        complete(e.clientX,e.clientY,card?{card,side:anchor!.getAttribute('data-anchor-side') as AnchorSide}:undefined);
      }
    };
    const double=(e:MouseEvent)=>{const g=pending.current;if(!g||g.edge||!latest.current.onCreateTopic||!viewport.current?.contains(e.target as Node)||(e.target as Element).closest('[data-placement],.canvas-controls,.edge-layer,.edge-handles,button,input,textarea,a')||targetAt(e.clientX,e.clientY))return;e.preventDefault();e.stopPropagation();const p=worldPoint(e.clientX,e.clientY);latest.current.onCreateTopic(p.x,p.y,g.from,g.side);clear();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')clear();};
    const cancel=()=>clear();
    viewport.current!.addEventListener(BOARD_CAMERA_EVENT,redraw);doc.addEventListener('dblclick',double,true);doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',cancel,true);doc.addEventListener('keydown',key);window.addEventListener('blur',cancel);
    return()=>{viewport.current?.removeEventListener(BOARD_CAMERA_EVENT,redraw);doc.removeEventListener('dblclick',double,true);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',cancel,true);doc.removeEventListener('keydown',key);window.removeEventListener('blur',cancel);if(frame.current!==null)doc.defaultView?.cancelAnimationFrame(frame.current);};
  },[]);
  useEffect(()=>{if(!props.enabled)clear();},[props.enabled]);
  useLayoutEffect(()=>{if(connecting)draw(point.current.x,point.current.y);},[connecting]);
  const geometries=board.edges.flatMap(edge=>{const a=placements.get(edge.from),b=placements.get(edge.to);return a&&b?[{edge,...edgeGeometry(edge,a,b,heightOf)}]:[];});
  const select=(event:React.MouseEvent|React.PointerEvent,edge:Edge)=>{event.preventDefault();event.stopPropagation();onFinish();onSelect([edge.id],event.shiftKey||event.metaKey||event.ctrlKey,event.metaKey||event.ctrlKey);};
  const editLabel=(edge:Edge)=>{onSelect([edge.id],false);setLabel({id:edge.id,text:edge.label??''});};
  const saveLabel=()=>{if(label){if(board.edges.some(e=>e.id===label.id&&(e.label??'')!==label.text))onSave({...board,edges:board.edges.map(e=>e.id===label.id?{...e,label:label.text}:e)},ui.history.editEdgeLabel);setLabel(null);}};
  const byCard=new Map<string,Placement[]>();for(const p of board.cards){const list=byCard.get(p.cardId)??[];list.push(p);byCard.set(p.cardId,list);}
  const marker=(arrow:Arrowhead|undefined)=>!arrow||arrow==='none'?undefined:`url(#${markerId}-${arrow})`;
  const camera=props.camera(),transform=`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`;
  return <>
    <svg className="edge-layer" aria-label={ui.edges.edge}><g className="edge-camera" transform={transform} style={{'--edge-zoom':camera.zoom} as React.CSSProperties}>
      <defs>{(['arrow','triangle','triangle-outline'] as const).map(type=><marker key={type} id={`${markerId}-${type}`} markerWidth="10" markerHeight="10" viewBox="0 0 10 10" refX="9" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 1 1 L 9 5 L 1 9" fill={type==='triangle'?'context-stroke':type==='triangle-outline'?'var(--canvas)':'none'} stroke="context-stroke" strokeWidth="1" strokeLinejoin="round" {...(type!=='arrow'?{d:'M 1 1 L 9 5 L 1 9 Z'}:{})}/></marker>)}</defs>
      {board.showMentions!==false&&mentions.flatMap(m=>(byCard.get(m.from)??[]).flatMap(a=>(byCard.get(m.to)??[]).map(b=><line className="mention-link" key={`${a.id}:${b.id}`} x1={a.x+a.width/2} y1={a.y+heightOf(a)/2} x2={b.x+b.width/2} y2={b.y+heightOf(b)/2} strokeLinecap="round"/>)))}
      {geometries.map(({edge,path,midpoint})=>{const selected=selectedEdges.includes(edge.id),color=tintColor(edge.strokeColor,'stroke')??'var(--muted)',width=edge.strokeWidth??2;return <g key={edge.id} className={'board-edge '+(selected?'selected':'')} data-edge={edge.id}>
        <path className="edge-hit" d={path} tabIndex={0} role="button" aria-label={edge.label||ui.edges.edge} data-tooltip={tooltips.edges.select} onPointerDown={e=>select(e,edge)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onFinish();onSelect([edge.id],e.shiftKey||e.metaKey||e.ctrlKey,e.metaKey||e.ctrlKey);}}} onDoubleClick={()=>editLabel(edge)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();onSelect([edge.id],false);setMenu({label:ui.edges.actions,x:e.clientX,y:e.clientY,actions:[...(latest.current.styleActions?.(edge.id)??[]),{label:ui.edges.editLabel,icon:'edit',run:()=>editLabel(edge)},{label:ui.edges.showStyle,icon:'art',run:onStyle},{label:ui.edges.delete,icon:'close',danger:true,run:()=>{onSave({...board,edges:board.edges.filter(item=>item.id!==edge.id)},ui.history.deleteEdges);onSelect([],false);}}]});}}/>
        {selected&&<path className="edge-selection" d={path} strokeWidth={width+5}/>}
        <path className="edge-stroke" d={path} stroke={color} strokeWidth={width} strokeDasharray={strokeDash(edge.strokeStyle,width)} strokeLinecap={edge.strokeStyle==='dotted'?'round':'butt'} markerStart={marker(edge.fromArrowhead)} markerEnd={marker(edge.toArrowhead)}/>
        {(edge.label||selected||label?.id===edge.id)&&<foreignObject x={midpoint.x-100} y={midpoint.y-18} width="200" height="72" className="edge-label-wrap" style={{fontSize:fontSizeCSS(edge.labelSize??'s')}}>
          {label?.id===edge.id?<div className="edge-label">
            <span className="edge-label-text" aria-hidden="true">{label.text||'\u200b'}</span>
            <textarea autoFocus rows={1} className="edge-label-input" aria-label={ui.edges.editLabel} maxLength={2000} value={label.text} onChange={e=>setLabel({...label,text:e.target.value})} onBlur={saveLabel} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();saveLabel();}if(e.key==='Escape'){e.preventDefault();setLabel(null);}}}/>
          </div>:<button className="edge-label" data-tooltip={tooltips.edges.editLabel} onPointerDown={e=>select(e,edge)} onClick={()=>editLabel(edge)}><span className="edge-label-text">{edge.label||'+'}</span></button>}
        </foreignObject>}
      </g>;})}
      <path ref={preview} className="edge-preview"/>
    </g></svg>
    <svg className={'edge-handles '+(connecting?'connecting':'')} aria-label={ui.edges.edge}><EdgeAnchors points={scene.points} selected={selectedCards} connecting={connecting} keyboard={!!pending.current?.keyboard} source={pending.current?.from} enabled={props.enabled} viewport={viewport} camera={props.camera} onStart={start} onKeyboardStart={keyboardStart}/><g className="edge-camera" transform={transform} style={{'--edge-zoom':camera.zoom} as React.CSSProperties}>
      {geometries.filter(g=>selectedEdges.includes(g.edge.id)).flatMap(g=>(['from','to'] as const).map(endpoint=>{const at=endpoint==='from'?g.start:g.end,fixed=endpoint==='from'?'to':'from',card=placements.get(g.edge[fixed])!,side=fixed==='from'?g.fromSide:g.toSide;return <circle className="edge-endpoint" key={g.edge.id+endpoint} cx={at.x} cy={at.y} r={6/props.camera().zoom} role="button" tabIndex={0} aria-label={ui.edges.endpoint(endpoint)} data-tooltip={tooltips.edges.reconnect} onPointerDown={e=>start(e,card,side,g.edge,endpoint)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboardStart(card,side,at,g.edge,endpoint);}}}/>;}))}
    </g></svg>
    {connecting&&!pending.current?.edge&&props.onCreateTopic&&<div className="canvas-connector-hint" role="status">{topicText.finish}</div>}
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </>;
}
