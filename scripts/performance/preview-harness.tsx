/* eslint-disable @typescript-eslint/no-explicit-any -- isolated native instrumentation */
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Whiteboard} from '../../src/renderer/Board';
import {BoardNavigation} from '../../src/renderer/navigation';
import {edgeGeometry,strokeDash} from '../../src/renderer/edge-geometry';
import {tintColor} from '../../src/colors';
import {PreviewCache} from './preview-cache';
import {validatePreviewSnapshot,assertTilePlan,type PreviewSnapshot,type PreviewGeometry} from './preview-snapshot';
import {boardFixture} from './board-fixture';
import {compareSnapshot} from './retained-snapshot';
import '../../src/renderer/styles.css';
const fixture=boardFixture(),positions=new Map(fixture.board.cards.map(p=>[p.id,p])),role=new URLSearchParams(location.search).get('role'),bench:any=(window as any).__preview={fixture,errors:[],requests:0,frames:0};
document.documentElement.dataset.previewRole=role??'overview';
window.addEventListener('error',e=>bench.errors.push(e.message));window.addEventListener('unhandledrejection',e=>bench.errors.push(String(e.reason)));
(window as any).door={platform:'darwin',openExternal:async(url:string)=>{(bench.opened??=[]).push(url);},request:async(r:any)=>{bench.requests++;if(r.kind==='card')return fixture.bodies.get(r.path);if(r.kind==='cardMentions')return [];throw Error('Unexpected preview request '+r.kind);},attachmentData:async()=>Uint8Array.from(atob((window as any).__previewPdf),c=>c.charCodeAt(0)).buffer,assetUrl:(path:string)=>fixture.images.get(path)??''};
function Stage(){
 const [batch,setBatch]=useState({ids:[] as string[],zoom:.5,serial:0});bench.batch=batch;bench.setBatch=(ids:string[],zoom:number)=>setBatch(previous=>({ids,zoom,serial:previous.serial+1}));
 const cards=batch.ids.map((id,i)=>({...positions.get(id)!,x:i%8*(batch.ids.includes('p5996')?700:360),y:Math.floor(i/8)*330}));
 const board={...fixture.board,cards,edges:[]};
 bench.bounds=()=>cards.map(p=>{const el=document.querySelector<HTMLElement>('[data-placement='+p.id+']')!,part=el.querySelector<HTMLElement>('.board-pdf-main')??el,r=part.getBoundingClientRect(),anchor=el.querySelector<HTMLElement>('.board-pdf-selection')?.getBoundingClientRect()??r;return {id:p.id,x:Math.floor(r.left),y:Math.floor(r.top),width:Math.ceil(r.right)-Math.floor(r.left),height:Math.ceil(r.bottom)-Math.floor(r.top),world:{dx:(Math.floor(r.left)-10)/batch.zoom-p.x,dy:(Math.floor(r.top)-10)/batch.zoom-p.y,width:(Math.ceil(r.right)-Math.floor(r.left))/batch.zoom,height:(Math.ceil(r.bottom)-Math.floor(r.top))/batch.zoom,anchorDx:(anchor.left-Math.floor(r.left))/batch.zoom,anchorDy:(anchor.top-Math.floor(r.top))/batch.zoom,anchorWidth:anchor.width/batch.zoom,anchorHeight:anchor.height/batch.zoom}};});
 bench.ready=()=>document.querySelectorAll('[data-placement]').length===batch.ids.length&&[...document.querySelectorAll<HTMLElement>('.card-preview[data-ready]')].every(e=>e.dataset.ready==='true')&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)&&(!batch.ids.includes('p5996')||document.querySelectorAll('.pdf-page canvas[data-bench-painted=true]').length===80);
 return <Whiteboard key={batch.serial} enabled={false} board={board} cards={fixture.cards} boards={fixture.boards} initialCamera={{x:10,y:10,zoom:batch.zoom}} onSave={()=>{throw Error('Staging tried to save');}} onOpen={()=>{}} onCreate={()=>{}}/>;
}
type Geometry=PreviewGeometry;
const cache=new PreviewCache<ImageBitmap>(16*1024*1024),geometry=new Map<string,Geometry>(),sources=new Map<string,{blob:Blob;world:Geometry}>();
type Box={x:number;y:number;width:number;height:number};
const paths:{path:Path2D;style:any;end:{x:number;y:number};angle:number;label?:string;middle:{x:number;y:number};bounds:Box}[]=[];
let liveIds:string[]=[],liveGeneration=0;let canvas:HTMLCanvasElement,context:CanvasRenderingContext2D,nav:BoardNavigation,scheduled=false,sourceBytes=0,tiles=new PreviewCache<ImageBitmap>(32*1024*1024),tileRects:{id:string;box:Box}[]=[];
bench.mode='direct';bench.hideEdges=false;bench.hideImages=false;bench.compareSnapshot=compareSnapshot;
const intersects=(a:Box,b:Box)=>a.x+a.width>=b.x&&a.y+a.height>=b.y&&a.x<=b.x+b.width&&a.y<=b.y+b.height;
function drawWorld(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,view:Box){
 if(!bench.hideEdges)for(const {path,style,end,angle,label,middle,bounds} of paths){if(!intersects(bounds,view))continue;ctx.strokeStyle=tintColor(style.strokeColor,'stroke')??'#777';ctx.lineWidth=style.strokeWidth??2;ctx.setLineDash(strokeDash(style.strokeStyle,ctx.lineWidth)?.split(/[ ,]+/).map(Number)??[]);ctx.stroke(path);ctx.setLineDash([]);ctx.save();ctx.translate(end.x,end.y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(-16,-8);ctx.lineTo(0,0);ctx.lineTo(-16,8);ctx.stroke();ctx.restore();if(label){ctx.fillStyle='#333';ctx.font='14px system-ui';ctx.fillText(label,middle.x-50,middle.y);}}
 if(!bench.hideImages)for(const p of fixture.board.cards){const g=geometry.get(p.id);if(!g)continue;const box={x:p.x+g.dx,y:p.y+g.dy,width:g.width,height:g.height};if(!intersects(box,view))continue;const image=cache.get(p.id);if(image)ctx.drawImage(image,box.x,box.y,box.width,box.height);else{ctx.fillStyle='#eee';ctx.fillRect(box.x,box.y,box.width,box.height);}}
}
function paint(){
 if(!canvas)return;bench.frames++;const c=nav.current,dpr=devicePixelRatio||1,view={x:-c.x/c.zoom,y:-c.y/c.zoom,width:innerWidth/c.zoom,height:innerHeight/c.zoom};
 context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);context.setTransform(dpr*c.zoom,0,0,dpr*c.zoom,dpr*c.x,dpr*c.y);
 if(bench.mode==='tiles')for(const {id,box} of tileRects){if(!intersects(box,view))continue;const image=tiles.get(id);if(!image)throw Error('Missing visible tile');context.drawImage(image,box.x,box.y,box.width,box.height);}
 else drawWorld(context,view);
 for(const id of liveIds){const p=positions.get(id)!,g=geometry.get(id);if(!p.object&&g){context.clearRect(p.x+g.dx-1,p.y+g.dy-1,g.width+2,g.height+2);}}
}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;paint();});}}
bench.installAtlas=async(source:string,items:any[],targetZoom:number,revision:string,keep:boolean)=>{
 const jobs=items.map(item=>({...item,ticket:cache.begin(item.id,revision)}));await bench.beforeDecode?.(revision);
 const snapshot=await createImageBitmap(await (await fetch(source)).blob()),ratio=snapshot.width/innerWidth,scratch=new OffscreenCanvas(1,1),ctx=scratch.getContext('2d')!;
 try{for(const item of jobs){const width=Math.max(1,Math.ceil(item.world.width*targetZoom*devicePixelRatio)),height=Math.max(1,Math.ceil(item.world.height*targetZoom*devicePixelRatio));if(width*height*4>cache.limit)throw Error('Preview could not fit budget');const image=await createImageBitmap(snapshot,Math.round(item.x*ratio),Math.round(item.y*ratio),Math.round(item.width*ratio),Math.round(item.height*ratio),{resizeWidth:width,resizeHeight:height,resizeQuality:'high'});
  let blob:Blob|undefined;if(keep){scratch.width=width;scratch.height=height;ctx.drawImage(image,0,0);blob=await scratch.convertToBlob();if(sourceBytes-(sources.get(item.id)?.blob.size??0)+blob.size>16*1024*1024){image.close();throw Error('Encoded source budget exceeded');}}
  if(!cache.commit(item.ticket,image))continue;geometry.set(item.id,item.world);
  if(blob){sourceBytes-=sources.get(item.id)?.blob.size??0;sourceBytes+=blob.size;sources.set(item.id,{blob,world:item.world});}
 }}finally{snapshot.close();scratch.width=0;scratch.height=0;}
 schedule();return {sourceBytes,count:sources.size};
};
bench.revisionRace=async()=>{
 const make=async(color:string)=>{const c=new OffscreenCanvas(1,1);const ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return new Promise<string>((resolve,reject)=>{void c.convertToBlob().then(blob=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});});};
 const [red,blue]=await Promise.all([make('red'),make('blue')]),base={id:'race',x:0,y:0,width:innerWidth,height:innerHeight,world:{dx:0,dy:0,width:320,height:240,anchorDx:0,anchorDy:0,anchorWidth:320,anchorHeight:240}};let release=()=>{};const gate=new Promise<void>(r=>release=r);bench.beforeDecode=(revision:string)=>revision==='old'?gate:undefined;
 const old=bench.installAtlas(red,[base],.036,'old',true);await bench.installAtlas(blue,[{...base,world:{...base.world,dx:2}}],.036,'new',true);release();await old;bench.beforeDecode=undefined;
 const c=new OffscreenCanvas(24,24),ctx=c.getContext('2d')!;ctx.drawImage(cache.get('race')!,0,0);const displayed=[...ctx.getImageData(0,0,1,1).data];ctx.clearRect(0,0,24,24);const source=await createImageBitmap(sources.get('race')!.blob);ctx.drawImage(source,0,0);source.close();const stored=[...ctx.getImageData(0,0,1,1).data],dx=geometry.get('race')!.dx;
 if(displayed[2]!==255||displayed[0]!==0||stored[2]!==255||stored[0]!==0||dx!==2)throw Error('Stale preview overwrote a newer revision');
 const restoreGate=new Promise<void>(r=>release=r);bench.beforeRestore=()=>restoreGate;const restore=bench.restoreSources();await bench.installAtlas(red,[{...base,world:{...base.world,dx:3}}],.036,'latest',true);release();await restore;bench.beforeRestore=undefined;ctx.clearRect(0,0,24,24);ctx.drawImage(cache.get('race')!,0,0);const afterRestore=[...ctx.getImageData(0,0,1,1).data];if(afterRestore[0]!==255||afterRestore[2]!==0||geometry.get('race')!.dx!==3)throw Error('An older source restore overwrote a newer preview');
 cache.delete('race');sourceBytes-=sources.get('race')!.blob.size;sources.delete('race');geometry.delete('race');c.width=0;c.height=0;return {displayed,stored,geometryDx:dx,afterRestore};
};
bench.restoreSources=async()=>{const jobs=[...sources].map(([id,{blob,world}])=>({id,blob,world,ticket:cache.begin(id,'overview')}));await bench.beforeRestore?.();for(const {id,blob,world,ticket} of jobs){const image=await createImageBitmap(blob);if(cache.commit(ticket,image))geometry.set(id,world);}schedule();};
bench.prepareEdges=()=>{paths.length=0;const lookup=new Map(fixture.board.cards.map(p=>{const g=geometry.get(p.id)!;return [p.id,{...p,x:p.x+g.dx+g.anchorDx,y:p.y+g.dy+g.anchorDy,width:g.anchorWidth,height:g.anchorHeight}] as const;}));for(const e of fixture.board.edges){const a=lookup.get(e.from)!,b=lookup.get(e.to)!,g=edgeGeometry(e,a,b,p=>p.height),previous=g.samples.at(-2)!,pad=e.label?150:24,x=Math.min(...g.samples.map(p=>p.x))-pad,y=Math.min(...g.samples.map(p=>p.y))-pad;paths.push({path:new Path2D(g.path),style:e,end:g.end,angle:Math.atan2(g.end.y-previous.y,g.end.x-previous.x),label:e.label,middle:g.midpoint,bounds:{x,y,width:Math.max(...g.samples.map(p=>p.x))+pad-x,height:Math.max(...g.samples.map(p=>p.y))+pad-y}});}schedule();};
bench.composeTiles=async()=>{
 const bounds=[...geometry].map(([id,g])=>{const p=positions.get(id)!;return {x:p.x+g.dx,y:p.y+g.dy,width:g.width,height:g.height};}).concat(paths.map(p=>p.bounds)),x=Math.floor(Math.min(...bounds.map(p=>p.x))),y=Math.floor(Math.min(...bounds.map(p=>p.y))),scale=.036*devicePixelRatio,width=Math.ceil((Math.max(...bounds.map(p=>p.x+p.width))-x)*scale),height=Math.ceil((Math.max(...bounds.map(p=>p.y+p.height))-y)*scale),next=new PreviewCache<ImageBitmap>(32*1024*1024),rects:{id:string;box:Box}[]=[],start=performance.now();let longest=0;
 // shortcut: whole-bounds tiles are for this fixture; use viewport scheduling before adoption.
 assertTilePlan(width,height);
 try{for(let py=0;py<height;py+=512)for(let px=0;px<width;px+=512){const begin=performance.now(),w=Math.min(512,width-px),h=Math.min(512,height-py),surface=new OffscreenCanvas(w,h),ctx=surface.getContext('2d')!,box={x:x+px/scale,y:y+py/scale,width:w/scale,height:h/scale};ctx.setTransform(scale,0,0,scale,-box.x*scale,-box.y*scale);drawWorld(ctx,box);const bitmap=await createImageBitmap(surface),id=px+':'+py;if(!next.commit(next.begin(id,'overview'),bitmap))throw Error('Tile exceeds budget');surface.width=0;surface.height=0;rects.push({id,box});longest=Math.max(longest,performance.now()-begin);await new Promise(requestAnimationFrame);}
 }catch(error){next.clear();throw error;}
 tiles.clear();tiles=next;tileRects=rects;bench.mode='tiles';schedule();return {ms:performance.now()-start,longestTileMs:longest,bytes:tiles.bytes,count:tiles.size,headroom:scale/(.024*devicePixelRatio)};
};
bench.exportTiles=async(signature:string)=>{
 const output:PreviewSnapshot={version:1,signature,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},scale:.036,geometry:[...geometry],tiles:[]};
 for(const {id,box} of tileRects){const bitmap=tiles.get(id)!;const surface=new OffscreenCanvas(bitmap.width,bitmap.height);surface.getContext('2d')!.drawImage(bitmap,0,0);const blob=await surface.convertToBlob(),src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});output.tiles.push({id,box,width:bitmap.width,height:bitmap.height,src});surface.width=0;surface.height=0;}
 return output;
};
bench.importTiles=async(value:unknown,signature:string)=>{
 const input=validatePreviewSnapshot(value,signature,{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},new Set(positions.keys())),next=new PreviewCache<ImageBitmap>(32*1024*1024),rects:{id:string;box:Box}[]=[];
 try{for(const t of input.tiles){const bitmap=await createImageBitmap(await (await fetch(t.src)).blob());if(bitmap.width!==t.width||bitmap.height!==t.height){bitmap.close();throw Error('PNG decode changed dimensions');}if(!next.commit(next.begin(t.id,'overview'),bitmap))throw Error('Tile could not fit');rects.push({id:t.id,box:t.box});}}
 catch(error){next.clear();throw error;}
 cache.clear();sources.clear();sourceBytes=0;tiles.clear();tiles=next;tileRects=rects;paths.length=0;geometry.clear();for(const [id,g] of input.geometry)geometry.set(id,g);bench.mode='tiles';schedule();
};
bench.alphaAt=(id:string)=>{const image=cache.get(id)!,c=new OffscreenCanvas(image.width,image.height),ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);const alpha=ctx.getImageData(0,0,1,1).data[3];c.width=0;c.height=0;return alpha;};
bench.rejectOversize=async()=>{const p=positions.get('p5999')!,x=p.x,previous=tiles,previousRects=tileRects;let rejected=false;p.x=1e12;try{await bench.composeTiles();}catch(error){rejected=String(error).includes('budget');}finally{p.x=x;}if(!rejected||tiles!==previous||tileRects!==previousRects)throw Error('Oversized tile plan damaged the last completed view');return true;};
bench.stats=()=>({bytes:cache.bytes,peakBytes:cache.peakBytes,entries:cache.size,released:cache.released,sourceBytes,tileBytes:tiles.bytes,tileCount:tiles.size,geometry:geometry.size,paths:paths.length,dom:document.querySelectorAll('*').length,errors:bench.errors,requests:bench.requests,frames:bench.frames});
bench.clear=()=>{cache.clear();tiles.clear();tileRects=[];sources.clear();sourceBytes=0;schedule();};bench.paint=paint;
bench.hit=(x:number,y:number)=>{const c=nav.current,wx=(x-c.x)/c.zoom,wy=(y-c.y)/c.zoom;for(let i=fixture.board.cards.length-1;i>=0;i--){const p=fixture.board.cards[i],g=geometry.get(p.id);if(g&&wx>=p.x+g.dx&&wx<=p.x+g.dx+g.width&&wy>=p.y+g.dy&&wy<=p.y+g.dy+g.height)return p.id;}};
function Overview(){
 const [live,setLive]=useState<string[]>([]),[draft,setDraft]=useState<any>(null),generation=liveGeneration;bench.setLive=setLive;bench.setDraft=setDraft;bench.draft=draft;liveIds=live;bench.closeLive=()=>{liveGeneration++;flushSync(()=>{setLive([]);setDraft(null);});nav.set({x:20,y:20,zoom:.024});nav.flush();};
 // shortcut: readable-region promotion assumes separated elements; dense overlap needs layer handling.
 const promote=(c:typeof nav.current)=>{
  const next=c.zoom<.35?[]:fixture.board.cards.filter(p=>{const g=geometry.get(p.id);return g&&(p.x+g.dx+g.width)*c.zoom+c.x>-80&&(p.x+g.dx)*c.zoom+c.x<innerWidth+80&&(p.y+g.dy+g.height)*c.zoom+c.y>-80&&(p.y+g.dy)*c.zoom+c.y<innerHeight+80;}).slice(0,64).map(p=>p.id);
  if(next.join()!==liveIds.join()){liveGeneration++;flushSync(()=>setLive(next));}
 };
 bench.promote=()=>promote(nav.current);
 return <><div className="canvas-grid" id="preview-grid"/><canvas id="preview-canvas" ref={el=>{if(!el||canvas)return;canvas=el;canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;context=canvas.getContext('2d')!;const world=document.createElement('div'),grid=document.getElementById('preview-grid')!,label=document.createElement('button');nav=new BoardNavigation(canvas.parentElement!,world,grid,label,c=>promote(c));nav.set({x:20,y:20,zoom:.024});nav.flush();canvas.parentElement!.addEventListener('board-camera-change',schedule);bench.navigation=nav;canvas.addEventListener('wheel',e=>nav.wheel(e),{passive:false});schedule();}}/>{live.length>0&&<div className="live-preview"><Whiteboard board={{...fixture.board,cards:fixture.board.cards.filter(p=>live.includes(p.id)),edges:[]}} cards={fixture.cards} boards={fixture.boards} initialCamera={nav.current} onCamera={c=>{if(generation!==liveGeneration)return;nav.set(c);nav.flush();promote(c);}} onSave={()=>{throw Error('Interaction test must not save yet');}} onOpen={path=>setDraft({card:fixture.bodies.get(path),body:fixture.bodies.get(path)!.body})} onCreate={()=>{}} draft={draft} onEdit={body=>setDraft((d:any)=>({...d,body}))} onFinish={()=>setDraft(null)}/></div>}</>;
}
createRoot(document.getElementById('root')!).render(role==='stage'?<Stage/>:<Overview/>);
