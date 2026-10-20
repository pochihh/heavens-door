import type { AnchorSide, Edge, Placement } from '../shared';
export interface Point {x:number;y:number}
export const sides:AnchorSide[]=['top','right','bottom','left'];
const vectors:Record<AnchorSide,Point>={top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
export const opposite:Record<AnchorSide,AnchorSide>={top:'bottom',right:'left',bottom:'top',left:'right'};
export function anchor(p:Placement,side:AnchorSide,height:number):Point {
  const gap=p.object?.type==='text'&&p.object.shape==='none'?8:0;
  return {x:p.x+(side==='left'?0:side==='right'?p.width:p.width/2)+vectors[side].x*gap,y:p.y+(side==='top'?0:side==='bottom'?height:height/2)+vectors[side].y*gap};
}
export function nearestSide(p:Placement,point:Point,height:number):AnchorSide {
  const distances=[Math.abs(point.y-p.y),Math.abs(point.x-p.x-p.width),Math.abs(point.y-p.y-height),Math.abs(point.x-p.x)];
  return sides[distances.indexOf(Math.min(...distances))];
}
function facing(p:Placement,toward:Point,height:number):AnchorSide {
  const dx=toward.x-p.x-p.width/2,dy=toward.y-p.y-height/2;
  return Math.abs(dx)>=Math.abs(dy)?dx>=0?'right':'left':dy>=0?'bottom':'top';
}
export function curve(start:Point,end:Point,fromSide:AnchorSide,toSide:AnchorSide) {
  const a=vectors[fromSide],b=vectors[toSide],bend=Math.max(72,Math.min(240,Math.hypot(end.x-start.x,end.y-start.y)*.42));
  const forward=(end.x-start.x)*a.x+(end.y-start.y)*a.y;
  // Facing anchors share the gap; distant siblings must not make the curve double back.
  const distance=toSide===opposite[fromSide]&&forward>=0?Math.min(bend,forward/2):bend;
  const c1={x:start.x+a.x*distance,y:start.y+a.y*distance},c2={x:end.x+b.x*distance,y:end.y+b.y*distance};
  const point=(t:number)=>({x:(1-t)**3*start.x+3*(1-t)**2*t*c1.x+3*(1-t)*t*t*c2.x+t**3*end.x,y:(1-t)**3*start.y+3*(1-t)**2*t*c1.y+3*(1-t)*t*t*c2.y+t**3*end.y});
  const samples=Array.from({length:25},(_,i)=>point(i/24));
  return {path:`M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,midpoint:point(.5),samples,start,end,fromSide,toSide};
}
export function edgeGeometry(edge:Edge,a:Placement,b:Placement,heightOf:(p:Placement)=>number) {
  const ah=heightOf(a),bh=heightOf(b);
  const fromSide=edge.fromSide??facing(a,{x:b.x+b.width/2,y:b.y+bh/2},ah),toSide=edge.toSide??facing(b,{x:a.x+a.width/2,y:a.y+ah/2},bh);
  return curve(anchor(a,fromSide,ah),anchor(b,toSide,bh),fromSide,toSide);
}
export function strokeDash(style:string|undefined,width:number){return style==='dashed'?`${Math.max(6,width*4)} ${Math.max(5,width*3)}`:style==='dotted'?`0 ${Math.max(5,width*3)}`:undefined;}
