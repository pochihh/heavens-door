import {graphLayout,graphStep,graphProject,graphUnproject,graphRotate,type WorkspaceGraph,type GraphParticle,type GraphMode,type GraphCamera} from '../graph';
import {normalizedWheelDelta} from './navigation';

export class GraphCanvas {
  private nodes:GraphParticle[]=[];
  private moved=new Set<string>();
  private graph:WorkspaceGraph={nodes:[],links:[]};
  private width=1;private height=1;private frame=0;private ticks=0;private settled=0;private hovered?:string;
  private camera:GraphCamera={x:0,y:0,zoom:1,yaw:.15,pitch:.2,distance:1200};
  private projected=new Map<string,ReturnType<typeof graphProject>&{radius:number}>();
  private gesture?:{pointer:number;x:number;y:number;lastX:number;lastY:number;moved:boolean;key?:string;depth:number;offsetX:number;offsetY:number};
  private colors={text:'#ddd',muted:'#999',border:'#444',background:'#222'};
  private resize:ResizeObserver;private theme:MutationObserver;
  private context:CanvasRenderingContext2D|null;private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private canvas:HTMLCanvasElement,private mode:GraphMode,private onOpen:(key:string)=>void,private onHover:(key:string|undefined)=>void){
    this.context=canvas.getContext('2d');
    this.resize=new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect();this.width=rect.width||1;this.height=rect.height||1;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(this.width*ratio);canvas.height=Math.round(this.height*ratio);this.context?.setTransform(ratio,0,0,ratio,0,0);this.paint();});this.resize.observe(canvas);
    const theme=()=>{const style=getComputedStyle(canvas);this.colors={text:style.getPropertyValue('--text').trim()||'#ddd',muted:style.getPropertyValue('--muted').trim()||'#999',border:style.getPropertyValue('--border').trim()||'#444',background:style.getPropertyValue('--card').trim()||'#222'};this.paint();};
    this.theme=new MutationObserver(theme);this.theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','style','class']});theme();
    canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.cancel);canvas.addEventListener('pointerleave',this.leave);canvas.addEventListener('wheel',this.wheel,{passive:false});canvas.addEventListener('keydown',this.key);document.addEventListener('visibilitychange',this.visibility);
  }
  setData(graph:WorkspaceGraph){
    const previous=new Map(this.nodes.map(n=>[n.key,n])),layout=graphLayout(graph,this.mode),anchors=new Map(layout.map(n=>[n.key,n.home]));this.graph={...graph,links:graph.links.map(link=>{const a=anchors.get(link.from),b=anchors.get(link.to);return {...link,length:a&&b?Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z):90};})};this.nodes=layout.map(node=>{const saved=previous.get(node.key);return saved?{...node,x:saved.x,y:saved.y,z:saved.z,home:this.moved.has(node.key)?saved.home:node.home,vx:saved.vx,vy:saved.vy,vz:saved.vz}:node;});
    if(!previous.size)this.fit();if(this.hovered&&!this.nodes.some(n=>n.key===this.hovered))this.hover(undefined);this.wake();
  }
  fit(){const rect=this.canvas.getBoundingClientRect();this.width=rect.width||this.width;this.height=rect.height||this.height;const radius=Math.max(180,...this.nodes.map(n=>Math.hypot(n.x,n.y,n.z)))+65;this.camera={x:0,y:0,zoom:Math.max(.015,Math.min(2,Math.min(this.width,this.height)/(radius*2))),yaw:.15,pitch:.2,distance:radius*3};this.paint();}
  reset(){this.moved.clear();this.nodes=graphLayout(this.graph,this.mode);this.fit();this.wake();}
  focus(key:string){const node=this.nodes.find(n=>n.key===key);if(!node)return;const p=graphProject(node,this.camera,this.width,this.height,this.mode);this.camera.x-=p.x-this.width/2;this.camera.y-=p.y-this.height/2;this.hover(key);this.paint();this.canvas.focus();}
  private hover(key:string|undefined){if(key===this.hovered)return;this.hovered=key;this.onHover(key);this.paint();}
  private wake(){this.ticks=0;this.settled=0;if(!this.frame&&!document.hidden)this.frame=requestAnimationFrame(this.tick);}
  private tick=()=>{this.frame=0;if(document.hidden)return;const energy=this.reduced?0:graphStep(this.nodes,this.graph.links,this.gesture?.key);this.paint();this.ticks++;this.settled=energy<Math.max(.002,this.nodes.length*.003)?this.settled+1:0;if(!this.reduced&&(this.gesture||this.ticks<60||this.settled<15))this.frame=requestAnimationFrame(this.tick);};
  private paint(){
    const ctx=this.context;if(!ctx)return;ctx.clearRect(0,0,this.width,this.height);
    this.projected=new Map(this.nodes.map(node=>{const p=graphProject(node,this.camera,this.width,this.height,this.mode);return [node.key,{...p,radius:Math.max(2.5,Math.min(18,node.radius*Math.sqrt(p.scale)))}];}));
    const neighbors=new Set<string>(this.hovered?[this.hovered]:[]);if(this.hovered)for(const link of this.graph.links)if(link.from===this.hovered||link.to===this.hovered){neighbors.add(link.from);neighbors.add(link.to);}
    for(const link of this.graph.links){const a=this.projected.get(link.from),b=this.projected.get(link.to);if(!a||!b)continue;const active=this.hovered&&(link.from===this.hovered||link.to===this.hovered);ctx.globalAlpha=active?.85:this.hovered?.08:link.kind==='membership'?.48:.26;ctx.strokeStyle=this.colors.muted;ctx.lineWidth=active?1.6:1;ctx.setLineDash(link.kind==='membership'?[]:link.kind==='mention'?[2,4]:link.kind==='reference'?[5,4]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    ctx.setLineDash([]);
    for(const node of [...this.nodes].sort((a,b)=>this.projected.get(b.key)!.z-this.projected.get(a.key)!.z)){const p=this.projected.get(node.key)!;if(p.x<-100||p.y<-100||p.x>this.width+100||p.y>this.height+100)continue;const selected=node.key===this.hovered,connected=neighbors.has(node.key);ctx.globalAlpha=this.hovered&&!connected?.25:Math.max(.45,Math.min(1,p.scale/this.camera.zoom));const color=/^#[a-f0-9]{6}$/i.test(node.color??'')?node.color!:this.colors.muted;ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=selected?2.8:2;ctx.beginPath();ctx.arc(p.x,p.y,p.radius+(selected?1.8:0),0,Math.PI*2);if(node.kind==='board'){const alpha=ctx.globalAlpha;ctx.globalAlpha=1;ctx.fillStyle=this.colors.background;ctx.fill();ctx.globalAlpha=alpha;ctx.stroke();}else ctx.fill();
    }
    const labels:{x:number;y:number;width:number}[]=[];
    for(const node of [...this.nodes].sort((a,b)=>Number(b.key===this.hovered)-Number(a.key===this.hovered))){const p=this.projected.get(node.key)!,selected=node.key===this.hovered;if(p.x<0||p.y<0||p.x>this.width||p.y>this.height||!(selected||neighbors.has(node.key)||node.kind==='board'&&this.camera.zoom>.28))continue;
      ctx.font=(selected?'500 ':'')+'12px system-ui';const width=ctx.measureText(node.name).width,y=Math.min(this.height-10,Math.max(18,p.y+4)),offset=p.radius+7,free=(x:number)=>!labels.some(r=>x<r.x+r.width+4&&x+width+4>r.x&&Math.abs(y-r.y)<18);let x=Math.min(this.width-width-8,Math.max(8,p.x+offset));
      if(!selected&&!free(x)){const left=p.x-offset-width;if(left<8||!free(left))continue;x=left;}
      labels.push({x,y,width});ctx.globalAlpha=selected?1:.8;ctx.lineWidth=4;ctx.strokeStyle=this.colors.background;ctx.strokeText(node.name,x,y);ctx.fillStyle=this.colors.text;ctx.fillText(node.name,x,y);
    }ctx.globalAlpha=1;
  }
  private point(event:PointerEvent|WheelEvent){const rect=this.canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  hit(x:number,y:number){return [...this.projected].sort((a,b)=>a[1].z-b[1].z).find(([,p])=>Math.hypot(p.x-x,p.y-y)<=Math.max(10,p.radius+4))?.[0];}
  nodeAt(event:PointerEvent|MouseEvent){const rect=this.canvas.getBoundingClientRect();return this.hit(event.clientX-rect.left,event.clientY-rect.top);}
  private down=(event:PointerEvent)=>{if(event.button!==0)return;event.preventDefault();this.canvas.focus();const p=this.point(event),key=this.hit(p.x,p.y),node=this.nodes.find(n=>n.key===key),projected=key?this.projected.get(key):undefined;this.gesture={pointer:event.pointerId,x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:false,key,depth:node&&this.mode==='3d'?graphRotate(node,this.camera).z:0,offsetX:projected?p.x-projected.x:0,offsetY:projected?p.y-projected.y:0};this.canvas.setPointerCapture(event.pointerId);this.canvas.classList.add('dragging');this.hover(key);};
  private move=(event:PointerEvent)=>{const p=this.point(event),g=this.gesture;if(!g){this.hover(this.hit(p.x,p.y));return;}if(g.pointer!==event.pointerId)return;event.preventDefault();if(!g.moved&&Math.hypot(p.x-g.x,p.y-g.y)<4)return;g.moved=true;const dx=p.x-g.lastX,dy=p.y-g.lastY;g.lastX=p.x;g.lastY=p.y;if(g.key){const node=this.nodes.find(n=>n.key===g.key);if(node){this.moved.add(node.key);const world=graphUnproject(p.x-g.offsetX,p.y-g.offsetY,g.depth,this.camera,this.width,this.height,this.mode);Object.assign(node,world);node.home={...world};}}else if(this.mode==='3d'&&!event.shiftKey){this.camera.yaw+=dx*.007;this.camera.pitch=Math.max(-1.4,Math.min(1.4,this.camera.pitch+dy*.007));}else{this.camera.x+=dx;this.camera.y+=dy;}this.wake();this.paint();};
  private up=(event:PointerEvent)=>{const g=this.gesture;if(!g||g.pointer!==event.pointerId)return;this.gesture=undefined;this.canvas.classList.remove('dragging');this.wake();if(g.key&&!g.moved)this.onOpen(g.key);};
  private cancel=()=>{this.gesture=undefined;this.canvas.classList.remove('dragging');this.wake();};
  private leave=()=>{if(!this.gesture)this.hover(undefined);};
  private wheel=(event:WheelEvent)=>{event.preventDefault();event.stopPropagation();const p=this.point(event),before=this.camera.zoom,next=Math.max(.015,Math.min(5,before*Math.exp(-normalizedWheelDelta(event.deltaY,event.deltaMode)*.002))),factor=next/before;this.camera.x=p.x-this.width/2-(p.x-this.width/2-this.camera.x)*factor;this.camera.y=p.y-this.height/2-(p.y-this.height/2-this.camera.y)*factor;this.camera.zoom=next;this.paint();};
  private key=(event:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const index=this.nodes.findIndex(n=>n.key===this.hovered),next=(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+this.nodes.length)%this.nodes.length;if(this.nodes[next])this.focus(this.nodes[next].key);}else if(event.key==='Enter'&&this.hovered){event.preventDefault();this.onOpen(this.hovered);}else if(event.key==='Home'){event.preventDefault();this.fit();}else if(event.key==='Escape')this.hover(undefined);};
  private visibility=()=>{if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;}else this.wake();};
  dispose(){cancelAnimationFrame(this.frame);this.resize.disconnect();this.theme.disconnect();this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.cancel);this.canvas.removeEventListener('pointerleave',this.leave);this.canvas.removeEventListener('wheel',this.wheel);this.canvas.removeEventListener('keydown',this.key);document.removeEventListener('visibilitychange',this.visibility);}
}
