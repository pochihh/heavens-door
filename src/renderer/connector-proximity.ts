import type {AnchorSide,Placement,Edge} from '../shared';
import {anchor,sides,type Point} from './edge-geometry';
export const CONNECTOR_RADIUS=160;
export const CONNECTOR_SNAP_RADIUS=14;
export interface Connector extends Point {key:string;card:Placement;side:AnchorSide;edge?:Edge;endpoint?:'from'|'to'}
export function connectorScene(cards:Placement[],heightOf:(card:Placement)=>number){
 const rects=cards.map(card=>({card,height:heightOf(card)}));
 return {rects,points:rects.flatMap(({card,height})=>sides.map(side=>({...anchor(card,side,height),key:card.id+':'+side,card,side})))};
}
export function nearbyConnectors(points:Connector[],cursor:Point,skip?:string){
 const radius=CONNECTOR_RADIUS,radius2=radius*radius,found:{point:Connector;strength:number}[]=[];
 for(const point of points){
  if(point.card.id===skip)continue;
  const dx=point.x-cursor.x,dy=point.y-cursor.y;if(Math.abs(dx)>=radius||Math.abs(dy)>=radius)continue;
  const distance2=dx*dx+dy*dy;if(distance2>=radius2)continue;
  const t=1-Math.sqrt(distance2)/radius,strength=t*t*(3-2*t);
  if(strength)found.push({point,strength});
 }
 return found;
}
export function closestConnector(points:Connector[],cursor:Point,zoom:number,skip?:string){
 let nearest:Connector|undefined,distance2=(CONNECTOR_SNAP_RADIUS/zoom)**2;
 for(const point of points){if(point.card.id===skip)continue;const dx=point.x-cursor.x,dy=point.y-cursor.y,d=dx*dx+dy*dy;if(d<=distance2){distance2=d;nearest=point;}}
 return nearest;
}
