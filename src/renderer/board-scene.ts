import type {Edge,Placement} from '../shared';
import {edgeGeometry} from './edge-geometry';
// Drawing geometry is derived from the board. Commands and files remain owned by Whiteboard.
export interface SceneBox {x:number;y:number;width:number;height:number}
export const intersects=(a:SceneBox,b:SceneBox)=>a.x+a.width>=b.x&&a.y+a.height>=b.y&&a.x<=b.x+b.width&&a.y<=b.y+b.height;
export class SceneIndex<T extends SceneBox> {
 private cells=new Map<string,number[]>();private large:number[]=[];
 constructor(readonly items:readonly T[],readonly cellSize=1024){
  items.forEach((item,i)=>{const [left,top,right,bottom]=this.range(item);if((right-left+1)*(bottom-top+1)>256){this.large.push(i);return;}for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const key=x+':'+y,list=this.cells.get(key)??[];list.push(i);this.cells.set(key,list);}});
 }
 private range(b:SceneBox){return [Math.floor(b.x/this.cellSize),Math.floor(b.y/this.cellSize),Math.floor((b.x+b.width)/this.cellSize),Math.floor((b.y+b.height)/this.cellSize)];}
 query(box:SceneBox){const [left,top,right,bottom]=this.range(box);if((right-left+1)*(bottom-top+1)>4096)return this.items.filter(item=>intersects(item,box));const found=new Set(this.large);for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)for(const i of this.cells.get(x+':'+y)??[])found.add(i);return [...found].sort((a,b)=>a-b).map(i=>this.items[i]).filter(item=>intersects(item,box));}
}
export function previewDensity(zoom:number,dpr:number){return 2**Math.ceil(Math.log2(Math.max(2**-32,Math.min(4,zoom*dpr*1.5))));}
export function sceneViewport(camera:{x:number;y:number;zoom:number},width:number,height:number,padding=0):SceneBox{return {x:(-camera.x-padding)/camera.zoom,y:(-camera.y-padding)/camera.zoom,width:(width+padding*2)/camera.zoom,height:(height+padding*2)/camera.zoom};}
// shortcut: cached/live regions share one layer; promote overlaps together until ordered layers are justified by dense-scene measurements.
export function overlappingLive<T extends SceneBox&{id:string}>(index:SceneIndex<T>,ids:Iterable<string>){const found=new Set(ids),lookup=new Map(index.items.map(p=>[p.id,p])),queue=[...found];for(let i=0;i<queue.length;i++){const item=lookup.get(queue[i]);if(item)for(const next of index.query(item))if(!found.has(next.id)){found.add(next.id);queue.push(next.id);}}return found;}

export function viewportPreviewDensity(zoom:number,dpr:number,width:number,height:number){let density=previewDensity(zoom,Math.min(dpr,Math.sqrt(16_000_000/Math.max(1,width*height))));while((Math.ceil(width*density/zoom/512)+1)*(Math.ceil(height*density/zoom/512)+1)>63)density/=2;return density;}

export interface SceneEntry extends SceneBox {id:string;revision:string;simple:boolean;measured:boolean;placement:Placement;title:string;fill?:string}
export type SceneEdge=ReturnType<typeof edgeGeometry>&SceneBox&{id:string;edge:Edge};
const geometryCache=new Map<string,{signature:string;value:SceneEdge}>();
export function sceneEdges(edges:Edge[],placements:Placement[],heightOf:(p:Placement)=>number,namespace=''):SceneEdge[]{const byId=new Map(placements.map(p=>[p.id,p]));return edges.flatMap(edge=>{const a=byId.get(edge.from),b=byId.get(edge.to);if(!a||!b)return [];const ah=heightOf(a),bh=heightOf(b),key=namespace+':'+edge.id,signature=JSON.stringify(edge)+':'+[a.x,a.y,a.width,ah,a.object?.type==='text'?a.object.shape:'',b.x,b.y,b.width,bh,b.object?.type==='text'?b.object.shape:''].join(':'),cached=geometryCache.get(key);if(cached?.signature===signature){geometryCache.delete(key);geometryCache.set(key,cached);return [cached.value];}const g=edgeGeometry(edge,a,b,p=>p===a?ah:bh),pad=120,x=Math.min(...g.samples.map(p=>p.x))-pad,y=Math.min(...g.samples.map(p=>p.y))-pad,value={...g,id:edge.id,edge,x,y,width:Math.max(...g.samples.map(p=>p.x))+pad-x,height:Math.max(...g.samples.map(p=>p.y))+pad-y};geometryCache.set(key,{signature,value});while(geometryCache.size>16000)geometryCache.delete(geometryCache.keys().next().value!);return [value];});}
