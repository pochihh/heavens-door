import {boardPreviews as previews,latestBoardPreviews,rememberBoardPreview} from './board-preview-store';
import {setRetainedEnabled} from './retained-setting';
import {useLayoutEffect,useRef} from 'react';
import type {Edge} from '../shared';
import {tintColor} from '../colors';
import {fontSizePixels,fontSizeCSS,type FontSize} from '../font-size';
import {BOARD_CAMERA_EVENT,type Camera} from './navigation';
import {strokeDash} from './edge-geometry';
import {SceneIndex,sceneViewport,viewportPreviewDensity,intersects,type SceneBox,type SceneEntry,type SceneEdge} from './board-scene';
import {PreviewCache} from './preview-cache';
import {snapshotPlacement,allowSnapshotAttempt} from './board-snapshot';

const TILE=512,PADDING=2;
export class RetainedSurface {
 entries:SceneEntry[]=[];index=new SceneIndex<SceneEntry>([]);edges:SceneEdge[]=[];edgeIndex=new SceneIndex<SceneEdge>([]);
 live=new Set<string>();edgeLive=new Set<string>();failed=new Set<string>();error='';captures=0;frames=0;compositions=0;pendingPreviews=0;pdfPages=0;images=0;
 private attempts=new Map<string,{key:string;count:number}>();private tiles=new PreviewCache<ImageBitmap>(64*1024*1024);private epoch=0;private tileBounds=new Map<string,SceneBox>();private paths=new WeakMap<SceneEdge,Path2D>();private canvas?:HTMLCanvasElement;private getCamera?:()=>Camera;private pending=0;private timer?:ReturnType<typeof setTimeout>;private disposed=false;private busy=false;private density=1;private theme='';private fontFamily='system-ui';private sizes=new Map<FontSize,number>();private motion=0;private colorProbe?:HTMLElement;private colorCache=new Map<string,string>();private colors={text:'#222',card:'#eee',muted:'#888',canvas:'#fff'};
 constructor(private namespace:string){}
 key(entry:SceneEntry,density=this.density){return this.namespace+':'+entry.id+':'+entry.revision+':'+density;}
 has(entry:SceneEntry,density=this.density){if(entry.simple&&entry.measured)return true;return !!previews.get(this.key(entry,density));}
 setScene(entries:SceneEntry[],edges:SceneEdge[],live:Set<string>,edgeLive:Set<string>){
  const old=new Map(this.entries.map(p=>[p.id,p])),oldEdges=new Map(this.edges.map(e=>[e.id,e])),dirty:SceneBox[]=[];
  for(const entry of entries){const previous=old.get(entry.id);if(previous&&previous.revision!==entry.revision){this.failed.delete(entry.id);this.attempts.delete(entry.id);}if(!previous||previous.revision!==entry.revision||previous.simple!==entry.simple||previous.x!==entry.x||previous.y!==entry.y||previous.width!==entry.width||previous.height!==entry.height||live.has(entry.id)!==this.live.has(entry.id)){if(previous)dirty.push(previous);dirty.push(entry);}old.delete(entry.id);}
  for(const id of old.keys()){this.failed.delete(id);this.attempts.delete(id);}dirty.push(...old.values());
  for(const edge of edges){const previous=oldEdges.get(edge.id);if(!previous||previous.path!==edge.path||JSON.stringify(previous.edge)!==JSON.stringify(edge.edge)||edgeLive.has(edge.id)!==this.edgeLive.has(edge.id)){if(previous)dirty.push(previous);dirty.push(edge);}oldEdges.delete(edge.id);}dirty.push(...oldEdges.values());
  if(this.entries!==entries){this.entries=entries;this.index=new SceneIndex(entries);}if(this.edges!==edges){this.edges=edges;this.edgeIndex=new SceneIndex(edges);}this.live=live;this.edgeLive=edgeLive;
  if(dirty.length){this.epoch++;for(const box of dirty)this.invalidate(box);}this.schedule();
 }
 retry(entry:SceneEntry){this.failed.delete(entry.id);this.attempts.delete(entry.id);this.invalidate(entry);}
 invalidate(box:SceneBox){for(const [id,bounds] of this.tileBounds)if(intersects(bounds,box)){this.tiles.delete(id);this.tileBounds.delete(id);}}

 attach(canvas:HTMLCanvasElement,camera:()=>Camera){this.canvas=canvas;this.getCamera=camera;this.colorProbe=document.createElement('span');Object.assign(this.colorProbe.style,{position:'absolute',visibility:'hidden',pointerEvents:'none'});canvas.parentElement!.appendChild(this.colorProbe);this.refreshTheme('initial');this.schedule();}
 refreshTheme(key:string){if(key===this.theme||!this.colorProbe)return;this.theme=key;this.sizes.clear();this.fontFamily=getComputedStyle(this.colorProbe).fontFamily;this.colorCache.clear();this.colors={text:this.color('var(--text)'),card:this.color('var(--card)'),muted:this.color('var(--muted)'),canvas:this.color('var(--canvas)')};this.tiles.clear();this.tileBounds.clear();this.epoch++;}
 async capture(entry:SceneEntry,node:HTMLElement,density:number){
  if(entry.simple||this.busy||this.disposed||performance.now()-this.motion<150)return false;
  if(node.querySelector('[data-snapshot-unavailable="true"]')){this.failed.add(entry.id);this.error='PDF exceeds the preview budget; using its live reader.';return true;}
  if(node.querySelector('[data-ready="false"]')||[...node.querySelectorAll('img')].some(i=>!i.complete)||[...node.querySelectorAll('.pdf-page')].some(page=>!page.querySelector('canvas[data-pdf-painted="true"]')))return false;
  const key=this.key(entry,density);if(!allowSnapshotAttempt(this.attempts,entry.id,key)){this.failed.add(entry.id);this.error='Preview cache is full; using the existing live element.';return true;}
  this.busy=true;const ticket=previews.begin(key,entry.revision);
  try{const bitmap=await snapshotPlacement(node,density);const value={width:bitmap.width,height:bitmap.height,worldWidth:node.offsetWidth,worldHeight:node.offsetHeight,bitmap,close:()=>bitmap.close()};if(this.disposed||this.entries.find(e=>e.id===entry.id)?.revision!==entry.revision){value.close();previews.cancel(key,ticket.token);return false;}if(!previews.commit(ticket,value))return false;rememberBoardPreview(this.namespace+':'+entry.id,entry.revision,key);this.captures++;this.pdfPages+=node.querySelectorAll('.pdf-page canvas[data-pdf-painted=true]').length;this.images+=node.querySelectorAll('img').length;this.epoch++;this.invalidate(entry);this.schedule();return true;}
  catch(error){previews.cancel(key,ticket.token);if(!this.disposed){this.failed.add(entry.id);this.error=String(error);}return true;}
  finally{this.busy=false;}
 }
 private fontSize(size:FontSize){if(typeof size==='number')return size;const cached=this.sizes.get(size);if(cached)return cached;const probe=this.colorProbe;if(!probe)return fontSizePixels(size);probe.style.fontSize=String(fontSizeCSS(size));const value=parseFloat(getComputedStyle(probe).fontSize)||fontSizePixels(size);this.sizes.set(size,value);return value;}
 private color(value:string){const cached=this.colorCache.get(value);if(cached)return cached;const probe=this.colorProbe;if(!probe)return value;probe.style.color=value;const color=getComputedStyle(probe).color;this.colorCache.set(value,color);return color;}
 available(entry:SceneEntry,density:number){return !!this.source(entry,density);}
 private source(entry:SceneEntry,density:number){for(const scale of [density,density/2,density/4,density*2]){const image=previews.get(this.key(entry,scale));if(image)return image;}const last=latestBoardPreviews.get(this.namespace+':'+entry.id);if(last?.revision===entry.revision)return previews.get(last.key);}
 private drawEdge(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,g:SceneEdge){const edge=g.edge,width=edge.strokeWidth??2;ctx.strokeStyle=this.color(tintColor(edge.strokeColor,'stroke')??this.colors.muted);ctx.lineWidth=width;ctx.setLineDash(strokeDash(edge.strokeStyle,width)?.split(/[ ,]+/).map(Number)??[]);ctx.lineCap=edge.strokeStyle==='dotted'?'round':'butt';let path=this.paths.get(g);if(!path){path=new Path2D(g.path);this.paths.set(g,path);}ctx.stroke(path);ctx.setLineDash([]);
  const head=(kind:Edge['toArrowhead'],end:{x:number;y:number},previous:{x:number;y:number})=>{if(!kind||kind==='none')return;ctx.save();ctx.translate(end.x,end.y);ctx.rotate(Math.atan2(end.y-previous.y,end.x-previous.x));ctx.beginPath();ctx.moveTo(-8*width,-4*width);ctx.lineTo(0,0);ctx.lineTo(-8*width,4*width);if(kind!=='arrow'){ctx.closePath();ctx.fillStyle=kind==='triangle'?ctx.strokeStyle:this.colors.canvas;ctx.fill();}ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke();ctx.restore();};head(edge.fromArrowhead,g.start,g.samples[1]);head(edge.toArrowhead,g.end,g.samples.at(-2)!);

 }
 private drawWorld(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,box:SceneBox,density:number){
  for(const edge of this.edgeIndex.query(box))if(!this.edgeLive.has(edge.id))this.drawEdge(ctx,edge);
  for(const entry of this.index.query(box)){if(this.live.has(entry.id))continue;const image=entry.simple?undefined:this.source(entry,density);if(image){ctx.drawImage(image.bitmap,entry.x,entry.y,entry.width,entry.height);continue;}
   const object=entry.placement.object,text=object?.type==='text',plain=text&&object.shape==='none';ctx.save();ctx.fillStyle=this.color(tintColor(entry.fill)??this.colors.card);ctx.lineWidth=entry.placement.strokeWidth??2;ctx.strokeStyle=entry.placement.strokeColor??this.colors.muted;ctx.setLineDash(strokeDash(entry.placement.strokeStyle,ctx.lineWidth)?.split(/[ ,]+/).map(Number)??[]);ctx.beginPath();
   if(text&&object.shape==='ellipse')ctx.ellipse(entry.x+entry.width/2,entry.y+entry.height/2,Math.max(0,entry.width-ctx.lineWidth)/2,Math.max(0,entry.height-ctx.lineWidth)/2,0,0,Math.PI*2);
   else if(text&&object.shape==='diamond'){ctx.moveTo(entry.x+entry.width/2,entry.y);ctx.lineTo(entry.x+entry.width,entry.y+entry.height/2);ctx.lineTo(entry.x+entry.width/2,entry.y+entry.height);ctx.lineTo(entry.x,entry.y+entry.height/2);ctx.closePath();}
   else ctx.roundRect(entry.x,entry.y,entry.width,entry.height,text?12:6);
   if(!text)ctx.fill();else if(!plain&&entry.placement.strokeStyle!=='none')ctx.stroke();ctx.setLineDash([]);
   ctx.beginPath();ctx.rect(entry.x,entry.y,entry.width,entry.height);ctx.clip();ctx.fillStyle=text?object.textColor??this.colors.text:this.colors.text;const size=text?this.fontSize(object.fontSize??'m'):18;ctx.font=size+'px '+this.fontFamily;ctx.textAlign=text&&!plain?'center':'left';ctx.textBaseline='top';const lines=entry.title.split('\n'),lineHeight=size*1.4,startY=text?entry.y+(entry.height-lines.length*lineHeight)/2:entry.y+10;for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],text&&!plain?entry.x+entry.width/2:entry.x+(plain?0:10),startY+i*lineHeight);ctx.restore();
  }
 }
 cameraChanged=()=>{this.motion=performance.now();this.schedule();};
 schedule=()=>{if(this.disposed||!this.canvas||this.pending)return;this.pending=requestAnimationFrame(()=>{this.pending=0;this.paint();});};
 private paint(){
  const canvas=this.canvas,nav=this.getCamera;if(!canvas||!nav||this.disposed)return;this.frames++;const c=nav(),w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,Math.sqrt(16_000_000/Math.max(1,w*h)));if(canvas.width!==Math.ceil(w*dpr)||canvas.height!==Math.ceil(h*dpr)){canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);}const ctx=canvas.getContext('2d');if(!ctx){setRetainedEnabled(false);return;}ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  const density=viewportPreviewDensity(c.zoom,dpr,w,h);this.density=density;const box=sceneViewport(c,w,h),step=TILE/density;ctx.setTransform(dpr*c.zoom,0,0,dpr*c.zoom,dpr*c.x,dpr*c.y);
  const missing:{id:string;box:SceneBox;epoch:number}[]=[];
  for(let y=Math.floor(box.y/step);y<=Math.floor((box.y+box.height)/step);y++)for(let x=Math.floor(box.x/step);x<=Math.floor((box.x+box.width)/step);x++){
   const tileBox={x:x*step,y:y*step,width:step,height:step},id=density+':'+x+':'+y,image=this.tiles.get(id);
   const left=Math.round((tileBox.x*c.zoom+c.x)*dpr),top=Math.round((tileBox.y*c.zoom+c.y)*dpr),right=Math.round(((tileBox.x+step)*c.zoom+c.x)*dpr),bottom=Math.round(((tileBox.y+step)*c.zoom+c.y)*dpr);
   // Integer device-pixel clips and padded source pixels prevent transparent tile seams.
   ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.setTransform(dpr*c.zoom,0,0,dpr*c.zoom,dpr*c.x,dpr*c.y);
   if(image)ctx.drawImage(image,tileBox.x-PADDING/density,tileBox.y-PADDING/density,step+2*PADDING/density,step+2*PADDING/density);
   else{this.drawWorld(ctx,tileBox,density);missing.push({id,box:tileBox,epoch:this.epoch});}
   ctx.restore();
  }
  canvas.dataset.retainedReady=String(missing.length===0);canvas.dataset.previewCount=String(this.captures);
  if(missing.length&&!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;if(this.disposed)return;const tile=missing[0];if(tile.epoch!==this.epoch){this.schedule();return;}const surface=new OffscreenCanvas(TILE+2*PADDING,TILE+2*PADDING),context=surface.getContext('2d')!;const padded={x:tile.box.x-PADDING/density,y:tile.box.y-PADDING/density,width:tile.box.width+2*PADDING/density,height:tile.box.height+2*PADDING/density};context.setTransform(density,0,0,density,PADDING-tile.box.x*density,PADDING-tile.box.y*density);this.drawWorld(context,padded,density);const image=surface.transferToImageBitmap();surface.width=surface.height=0;this.tiles.commit(this.tiles.begin(tile.id,String(tile.epoch)),image);this.tileBounds.set(tile.id,padded);if(this.tileBounds.size>128)for(const id of this.tileBounds.keys())if(!this.tiles.get(id))this.tileBounds.delete(id);this.compositions++;this.schedule();},0);
 }
 hit(x:number,y:number){return this.index.query({x,y,width:0,height:0}).at(-1);}
 edgeHit(x:number,y:number,zoom:number){const radius=10/zoom;let found:SceneEdge|undefined,best=radius;for(const g of this.edgeIndex.query({x:x-radius,y:y-radius,width:radius*2,height:radius*2}))for(let i=1;i<g.samples.length;i++){const a=g.samples[i-1],b=g.samples[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);if(distance<best){best=distance;found=g;}}return found;}
 stats(){return {pending:this.pendingPreviews,pdfPages:this.pdfPages,images:this.images,frames:this.frames,captures:this.captures,compositions:this.compositions,sourceBytes:previews.bytes,tileBytes:this.tiles.bytes,live:this.live.size,failed:[...this.failed],error:this.error};}
 dispose(){this.disposed=true;cancelAnimationFrame(this.pending);clearTimeout(this.timer);this.tiles.clear();this.tileBounds.clear();this.colorProbe?.remove();this.canvas=undefined;}
}
export function RetainedCanvas({surface,viewport,camera}:{surface:RetainedSurface;viewport:React.RefObject<HTMLDivElement|null>;camera:()=>Camera}){
 const ref=useRef<HTMLCanvasElement>(null),latest=useRef(camera);latest.current=camera;
 useLayoutEffect(()=>{const root=viewport.current??ref.current!.parentElement!;surface.attach(ref.current!,()=>latest.current());const fail=()=>setRetainedEnabled(false);ref.current!.addEventListener('contextlost',fail);root.addEventListener(BOARD_CAMERA_EVENT,surface.cameraChanged);const resize=new ResizeObserver(surface.schedule);resize.observe(root);return()=>{ref.current?.removeEventListener('contextlost',fail);resize.disconnect();root.removeEventListener(BOARD_CAMERA_EVENT,surface.cameraChanged);surface.dispose();};},[surface]);
 return <canvas className="retained-board-surface" ref={ref} aria-hidden="true"/>;
}
