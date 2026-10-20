import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import type {AnchorSide,Placement,Edge} from '../shared';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {BOARD_CAMERA_EVENT,type Camera} from './navigation';
import {nearbyConnectors,CONNECTOR_HIT_RADIUS,type Connector} from './connector-proximity';
import type {Point} from './edge-geometry';
interface Props {
 points:Connector[];rects:{card:Placement;height:number}[];endpoints:Connector[];selected:string[];connecting:boolean;keyboard:boolean;source?:string;enabled:boolean;
 viewport:RefObject<HTMLDivElement|null>;camera:()=>Camera;
 onStart:(event:ReactPointerEvent,card:Placement,side:AnchorSide,edge?:Edge,endpoint?:'from'|'to')=>void;
 onKeyboardStart:(card:Placement,side:AnchorSide,at:Point,edge?:Edge,endpoint?:'from'|'to')=>void;
}
const KeyboardAnchors=memo(function KeyboardAnchors({points,onStart,onKeyboardStart}:{points:Connector[];onStart:Props['onStart'];onKeyboardStart:Props['onKeyboardStart']}){
 return <>{points.map(point=><circle key={point.key} className="edge-keyboard-anchor" cx={point.x} cy={point.y} data-anchor-card={point.edge?undefined:point.card.id} data-anchor-side={point.edge?undefined:point.side} data-edge-endpoint={point.endpoint} data-edge-id={point.edge?.id} tabIndex={0} role="button" aria-label={point.endpoint?ui.edges.endpoint(point.endpoint):ui.edges.anchor(point.side)} onPointerDown={e=>onStart(e,point.card,point.side,point.edge,point.endpoint)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onKeyboardStart(point.card,point.side,point,point.edge,point.endpoint);}}}/>)}</>;
});
// Cursor frames touch only nearby dots. The keyboard targets and board paths stay unchanged.
export function EdgeAnchors(props:Props){
 const latest=useRef(props);latest.current=props;
 const pointer=useRef<Point|null>(null),frame=useRef<number|null>(null),held=useRef(false);
 const [near,setNear]=useState<ReturnType<typeof nearbyConnectors>>([]),[overBody,setOverBody]=useState(false);
 const selectedPoints=useMemo(()=>{const selected=new Set(props.selected);return props.points.filter(p=>selected.has(p.card.id));},[props.points,props.selected]);
 const keyboardIdle=useMemo(()=>[...selectedPoints,...props.endpoints],[selectedPoints,props.endpoints]);
 const idlePoints=useMemo(()=>[...props.points,...props.endpoints],[props.points,props.endpoints]);
 const candidates=props.connecting?props.points:idlePoints,candidatesRef=useRef(candidates);candidatesRef.current=candidates;
 function refresh(){
  const {enabled,connecting,source,camera,viewport}=latest.current,element=viewport.current,at=pointer.current;
  let found:ReturnType<typeof nearbyConnectors>=[],blocked=false;
  if(enabled&&!held.current&&element&&at){
   const rect=element.getBoundingClientRect(),c=camera();
   if(!rect.width||!rect.height||at.x>=rect.left&&at.x<=rect.right&&at.y>=rect.top&&at.y<=rect.bottom){
    const cursor={x:(at.x-rect.left-c.x)/c.zoom,y:(at.y-rect.top-c.y)/c.zoom};
    found=nearbyConnectors(candidatesRef.current,cursor,connecting?source:undefined);
    blocked=!connecting&&latest.current.rects.some(({card,height})=>cursor.x>card.x&&cursor.x<card.x+card.width&&cursor.y>card.y&&cursor.y<card.y+height);
   }
  }
  // SVG paint order also decides which overlapping hit target receives the pointer.
  found.sort((a,b)=>a.strength-b.strength||Number(!!a.point.edge)-Number(!!b.point.edge));
  setOverBody(blocked);
  setNear(previous=>previous.length===found.length&&previous.every((p,i)=>p.point===found[i].point&&p.strength===found[i].strength)?previous:found);
 }
 useLayoutEffect(()=>{refresh();},[props.points,props.rects,props.selected,props.connecting,props.source,props.enabled,props.endpoints]);
 useEffect(()=>{
  const element=props.viewport.current!,doc=element.ownerDocument,win=doc.defaultView!;
  const schedule=()=>{if(held.current||!latest.current.enabled)return;if(frame.current===null)frame.current=win.requestAnimationFrame(()=>{frame.current=null;refresh();});};
  const move=(e:PointerEvent)=>{
   const target=e.target instanceof win.Element?e.target:null;
   pointer.current=target?.closest('.canvas-controls,input,textarea,select,[contenteditable=true]')?null:{x:e.clientX,y:e.clientY};
   schedule();
  };
  const down=(e:PointerEvent)=>{const target=e.target instanceof win.Element?e.target:null;held.current=!latest.current.connecting&&!target?.closest('.edge-anchor,.edge-keyboard-anchor')&&!!target?.closest('.canvas');move(e);if(held.current){if(frame.current!==null){win.cancelAnimationFrame(frame.current);frame.current=null;}setNear(previous=>previous.length?[]:previous);}};
  const up=()=>{if(held.current){held.current=false;schedule();}};
  const leave=()=>{pointer.current=null;schedule();},blur=()=>{held.current=false;leave();};
  doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',up,true);element.addEventListener('pointerleave',leave);element.addEventListener(BOARD_CAMERA_EVENT,schedule);doc.addEventListener('scroll',schedule,true);win.addEventListener('blur',blur);
  return()=>{doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',up,true);element.removeEventListener('pointerleave',leave);element.removeEventListener(BOARD_CAMERA_EVENT,schedule);doc.removeEventListener('scroll',schedule,true);win.removeEventListener('blur',blur);if(frame.current!==null)win.cancelAnimationFrame(frame.current);};
 },[]);
 const keyboardPoints=useMemo(()=>!props.enabled?[]:props.connecting?props.keyboard?[...props.points,...props.endpoints]:[]:keyboardIdle,[props.enabled,props.connecting,props.keyboard,props.points,props.endpoints,keyboardIdle]),c=props.camera();
 return <g className="edge-camera" transform={`translate(${c.x} ${c.y}) scale(${c.zoom})`} style={{'--edge-zoom':c.zoom,'--connector-hit-radius':`${CONNECTOR_HIT_RADIUS}px`} as CSSProperties}>
  <KeyboardAnchors points={keyboardPoints} onStart={props.onStart} onKeyboardStart={props.onKeyboardStart}/>
  {near.map(({point,strength})=><g key={point.key} className={"edge-anchor-hint"+(overBody&&!point.edge?" over-body":"")} style={{'--connector-strength':strength,'--connector-size':`${2+4*strength}px`} as CSSProperties} aria-hidden="true">
   <circle className="edge-anchor" cx={point.x} cy={point.y} data-anchor-card={point.edge?undefined:point.card.id} data-anchor-side={point.edge?undefined:point.side} data-edge-endpoint={point.endpoint} data-edge-id={point.edge?.id} data-anchor-visible="true" data-tooltip={point.edge?tooltips.edges.reconnect:tooltips.edges.anchor} onPointerDown={e=>props.onStart(e,point.card,point.side,point.edge,point.endpoint)}/>
   <circle className="edge-anchor-dot" cx={point.x} cy={point.y}/>
  </g>)}
 </g>;
}
