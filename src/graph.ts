import type {ReferenceTarget} from './shared';

export type GraphLinkKind='membership'|'reference'|'mention'|'edge';
export interface GraphNode extends ReferenceTarget {parent?:string;color?:string}
export interface GraphLink {from:string;to:string;kind:GraphLinkKind;length?:number}
export interface WorkspaceGraph {nodes:GraphNode[];links:GraphLink[]}
export type GraphMode='2d'|'3d';
export interface GraphPoint {x:number;y:number;z:number}
export interface GraphParticle extends GraphNode,GraphPoint {home:GraphPoint;vx:number;vy:number;vz:number;radius:number}

// Place descendants in their board's sector before applying small spring forces.
export function graphLayout(graph:WorkspaceGraph,mode:GraphMode):GraphParticle[]{
  const children=new Map<string,GraphNode[]>(),byKey=new Map(graph.nodes.map(n=>[n.key,n])),depths=new Map<string,number>();
  for(const node of graph.nodes)if(node.parent&&byKey.has(node.parent)){const list=children.get(node.parent)??[];list.push(node);children.set(node.parent,list);}
  const depth=(node:GraphNode):number=>{if(depths.has(node.key))return depths.get(node.key)!;depths.set(node.key,0);const parent=node.parent&&byKey.get(node.parent);const value=parent?depth(parent)+1:0;depths.set(node.key,value);return value;};
  graph.nodes.forEach(depth);const counts=new Map<number,number>();for(const level of depths.values())counts.set(level,(counts.get(level)??0)+1);
  const sizes=new Map<string,number>(),weight=(node:GraphNode):number=>{if(sizes.has(node.key))return sizes.get(node.key)!;sizes.set(node.key,1);const size=Math.max(1,(children.get(node.key)??[]).reduce((n,child)=>n+weight(child),0));sizes.set(node.key,size);return size;};
  const positions=new Map<string,GraphPoint>(),ring=(level:number)=>110+level*135+Math.sqrt(counts.get(level)??0)*12;
  const assign=(nodes:GraphNode[],start:number,span:number)=>{
    const total=nodes.reduce((n,node)=>n+weight(node),0);let cursor=start;
    for(const node of nodes){const arc=span*weight(node)/Math.max(1,total),angle=cursor+arc/2,radius=ring(depth(node));
      const z=mode==='3d'?Math.sin(angle*2.7+depth(node))*radius*.42:0,flat=Math.sqrt(radius*radius-z*z);
      positions.set(node.key,{x:Math.cos(angle)*flat,y:Math.sin(angle)*flat,z});assign(children.get(node.key)??[],cursor,arc);cursor+=arc;
    }
  };
  assign(graph.nodes.filter(n=>n.kind==='board'&&!n.parent),-Math.PI,Math.PI*2);
  const unowned=graph.nodes.filter(n=>n.kind==='card'&&!n.parent),neighbors=new Map<string,string[]>();
  for(const link of graph.links){for(const [a,b] of [[link.from,link.to],[link.to,link.from]]){const list=neighbors.get(a)??[];list.push(b);neighbors.set(a,list);}}
  const outer=ring(Math.max(0,...depths.values())+1),pending=new Set(unowned.map(n=>n.key));
  // Propagate outward from linked boards/cards; unlinked components remain at the rim.
  let frontier=[...positions.keys()];while(frontier.length){const next:string[]=[];for(const key of frontier)for(const other of neighbors.get(key)??[])if(pending.delete(other)){const anchor=positions.get(key)!,length=Math.hypot(anchor.x,anchor.y,anchor.z)||1,radius=Math.min(outer-55,length+100),angle=Math.atan2(anchor.y,anchor.x)+((next.length%5)-2)*.11;positions.set(other,{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,z:mode==='3d'?anchor.z*.7:0});next.push(other);}frontier=next;}
  const loose=unowned.filter(n=>pending.has(n.key));loose.forEach((node,i)=>{const angle=Math.PI*2*i/Math.max(1,loose.length),z=mode==='3d'?Math.sin(angle*3)*outer*.35:0,flat=Math.sqrt(outer*outer-z*z);positions.set(node.key,{x:Math.cos(angle)*flat,y:Math.sin(angle)*flat,z});});
  return graph.nodes.map(node=>{const home=positions.get(node.key)??{x:outer,y:0,z:0};return {...node,...home,home:{...home},vx:0,vy:0,vz:0,radius:node.kind==='board'?7:4.5};});
}

export function graphStep(nodes:GraphParticle[],links:GraphLink[],held?:string){
  const byKey=new Map(nodes.map(n=>[n.key,n])),cells=new Map<string,GraphParticle[]>(),cellSize=48;
  for(const node of nodes){const key=[node.x,node.y,node.z].map(v=>Math.floor(v/cellSize)).join(',');const list=cells.get(key)??[];list.push(node);cells.set(key,list);}
  for(const node of nodes){
    if(node.key===held){node.vx=node.vy=node.vz=0;continue;}
    node.vx+=(node.home.x-node.x)*.014;node.vy+=(node.home.y-node.y)*.014;node.vz+=(node.home.z-node.z)*.014;
    const [cx,cy,cz]=[node.x,node.y,node.z].map(v=>Math.floor(v/cellSize));
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const other of cells.get([cx+x,cy+y,cz+z].join(','))??[]){if(other===node)continue;let dx=node.x-other.x,dy=node.y-other.y,dz=node.z-other.z;const distance=Math.hypot(dx,dy,dz);if(distance>48)continue;if(distance<.01){dx=node.key<other.key?1:-1;dy=1;dz=0;}const force=Math.min(.7,28/(distance*distance+16));node.vx+=dx/(distance||1)*force;node.vy+=dy/(distance||1)*force;node.vz+=dz/(distance||1)*force;}
  }
  for(const link of links){const a=byKey.get(link.from),b=byKey.get(link.to);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,distance=Math.hypot(dx,dy,dz)||1,rest=link.length??(Math.hypot(b.home.x-a.home.x,b.home.y-a.home.y,b.home.z-a.home.z)||90),force=Math.max(-.4,Math.min(.4,(distance-rest)*.002));if(a.key!==held){a.vx+=dx/distance*force;a.vy+=dy/distance*force;a.vz+=dz/distance*force;}if(b.key!==held){b.vx-=dx/distance*force;b.vy-=dy/distance*force;b.vz-=dz/distance*force;}}
  let energy=0;for(const node of nodes)if(node.key!==held){node.vx*=.87;node.vy*=.87;node.vz*=.87;node.x+=node.vx;node.y+=node.vy;node.z+=node.vz;energy+=Math.abs(node.vx)+Math.abs(node.vy)+Math.abs(node.vz);}
  return energy;
}

export interface GraphCamera {x:number;y:number;zoom:number;yaw:number;pitch:number;distance:number}
export function graphRotate(point:GraphPoint,camera:GraphCamera){const x=point.x*Math.cos(camera.yaw)+point.z*Math.sin(camera.yaw),z=-point.x*Math.sin(camera.yaw)+point.z*Math.cos(camera.yaw);return {x,y:point.y*Math.cos(camera.pitch)-z*Math.sin(camera.pitch),z:point.y*Math.sin(camera.pitch)+z*Math.cos(camera.pitch)};}
export function graphProject(point:GraphPoint,camera:GraphCamera,width:number,height:number,mode:GraphMode){const p=mode==='3d'?graphRotate(point,camera):point,scale=camera.zoom*(mode==='3d'?camera.distance/Math.max(camera.distance*.2,camera.distance+p.z):1);return {x:width/2+camera.x+p.x*scale,y:height/2+camera.y+p.y*scale,z:p.z,scale};}
export function graphUnproject(x:number,y:number,depth:number,camera:GraphCamera,width:number,height:number,mode:GraphMode):GraphPoint{const scale=camera.zoom*(mode==='3d'?camera.distance/Math.max(camera.distance*.2,camera.distance+depth):1),p={x:(x-width/2-camera.x)/scale,y:(y-height/2-camera.y)/scale,z:depth};if(mode==='2d')return {...p,z:0};const worldY=p.y*Math.cos(camera.pitch)+p.z*Math.sin(camera.pitch),worldZ=-p.y*Math.sin(camera.pitch)+p.z*Math.cos(camera.pitch);return {x:p.x*Math.cos(camera.yaw)-worldZ*Math.sin(camera.yaw),y:worldY,z:p.x*Math.sin(camera.yaw)+worldZ*Math.cos(camera.yaw)};}
