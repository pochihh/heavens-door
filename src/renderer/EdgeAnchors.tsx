import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent,type RefObject} from 'react';
import type {AnchorSide,Placement} from '../shared';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {BOARD_CAMERA_EVENT,type Camera} from './navigation';
import {nearbyConnectors,type Connector} from './connector-proximity';
import type {Point} from './edge-geometry';
interface Props {
 points:Connector[];selected:string[];connecting:boolean;keyboard:boolean;source?:string;enabled:boolean;
 viewport:RefObject<HTMLDivElement|null>;camera:()=>Camera;
 onStart:(event:ReactPointerEvent,card:Placement,side:AnchorSide)=>void;
 onKeyboardStart:(card:Placement,side:AnchorSide,at:Point)=>void;
}
const KeyboardAnchors=memo(function KeyboardAnchors({points,onStart,onKeyboardStart}:{points:Connector[];onStart:Props['onStart'];onKeyboardStart:Props['onKeyboardStart']}){
 return <>{points.map(point=><circle key={point.key} className="edge-keyboard-anchor" cx={point.x} cy={point.y} data-anchor-card={point.card.id} data-anchor-side={point.side} tabIndex={0} role="button" aria-label={ui.edges.anchor(point.side)} onPointerDown={e=>onStart(e,point.card,point.side)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onKeyboardStart(point.card,point.side,point);}}}/>)}</>;
});
// Cursor frames touch only nearby dots. The keyboard targets and board paths stay unchanged.
export function EdgeAnchors(props:Props){
 const latest=useRef(props);latest.current=props;
 const pointer=useRef<Point|null>(null),frame=useRef<number|null>(null),held=useRef(false);
 const [near,setNear]=useState<ReturnType<typeof nearbyConnectors>>([]);
 const selectedPoints=useMemo(()=>{const selected=new Set(props.selected);return props.points.filter(p=>selected.has(p.card.id));},[props.points,props.selected]);
 const candidates=props.connecting?props.points:selectedPoints,candidatesRef=useRef(candidates);candidatesRef.current=candidates;
 function refresh(){
  const {enabled,connecting,source,camera,viewport}=latest.current,element=viewport.current,at=pointer.current;
  let found:ReturnType<typeof nearbyConnectors>=[];
  if(enabled&&!held.current&&element&&at){
   const rect=element.getBoundingClientRect(),c=camera();
   if(!rect.width||!rect.height||at.x>=rect.left&&at.x<=rect.right&&at.y>=rect.top&&at.y<=rect.bottom)found=nearbyConnectors(candidatesRef.current,{x:(at.x-rect.left-c.x)/c.zoom,y:(at.y-rect.top-c.y)/c.zoom},c.zoom,connecting?source:undefined);
  }
  setNear(previous=>previous.length===found.length&&previous.every((p,i)=>p.point===found[i].point&&p.strength===found[i].strength)?previous:found);
 }
 useLayoutEffect(()=>{refresh();},[props.points,props.selected,props.connecting,props.source,props.enabled]);
 useEffect(()=>{
  const element=props.viewport.current!,doc=element.ownerDocument,win=doc.defaultView!;
  const schedule=()=>{if(held.current||!latest.current.enabled||!latest.current.connecting&&!latest.current.selected.length)return;if(frame.current===null)frame.current=win.requestAnimationFrame(()=>{frame.current=null;refresh();});};
  const move=(e:PointerEvent)=>{
   const target=e.target instanceof win.Element?e.target:null;
   pointer.current=target?.closest('.canvas-controls,input,textarea,select,[contenteditable=true]')?null:{x:e.clientX,y:e.clientY};
   if(latest.current.connecting||latest.current.selected.length)schedule();
  };
  const down=(e:PointerEvent)=>{const target=e.target instanceof win.Element?e.target:null;held.current=!latest.current.connecting&&!target?.closest('.edge-anchor,.edge-keyboard-anchor,.edge-endpoint')&&!!target?.closest('.canvas');move(e);if(held.current){if(frame.current!==null){win.cancelAnimationFrame(frame.current);frame.current=null;}setNear(previous=>previous.length?[]:previous);}};
  const up=()=>{if(held.current){held.current=false;schedule();}};
  const leave=()=>{pointer.current=null;schedule();},blur=()=>{held.current=false;leave();};
  doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointerup',up,true);doc.addEventListener('pointercancel',up,true);element.addEventListener('pointerleave',leave);element.addEventListener(BOARD_CAMERA_EVENT,schedule);doc.addEventListener('scroll',schedule,true);win.addEventListener('blur',blur);
  return()=>{doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointerup',up,true);doc.removeEventListener('pointercancel',up,true);element.removeEventListener('pointerleave',leave);element.removeEventListener(BOARD_CAMERA_EVENT,schedule);doc.removeEventListener('scroll',schedule,true);win.removeEventListener('blur',blur);if(frame.current!==null)win.cancelAnimationFrame(frame.current);};
 },[]);
 const keyboardPoints=!props.enabled?[]:props.connecting?props.keyboard?props.points:[]:selectedPoints,c=props.camera();
 return <g className="edge-camera" transform={`translate(${c.x} ${c.y}) scale(${c.zoom})`} style={{'--edge-zoom':c.zoom} as CSSProperties}>
  <KeyboardAnchors points={keyboardPoints} onStart={props.onStart} onKeyboardStart={props.onKeyboardStart}/>
  {near.map(({point,strength})=><g key={point.key} className="edge-anchor-hint" style={{'--connector-strength':strength,'--connector-size':`${2+4*strength}px`} as CSSProperties} aria-hidden="true">
   <circle className="edge-anchor" cx={point.x} cy={point.y} data-anchor-card={point.card.id} data-anchor-side={point.side} data-anchor-visible="true" data-tooltip={tooltips.edges.anchor} onPointerDown={e=>props.onStart(e,point.card,point.side)}/>
   <circle className="edge-anchor-dot" cx={point.x} cy={point.y}/>
  </g>)}
 </g>;
}
