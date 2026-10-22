// Isolated comparison only: sampled curves are not yet a replacement for editable SVG edges.
import {edgeGeometry} from '../../src/renderer/edge-geometry';
import type {Board} from '../../src/shared';
import type {Camera} from '../../src/renderer/navigation';
export function gpuEdges(viewport:HTMLElement,board:Board,camera:()=>Camera){
 const canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';viewport.insertBefore(canvas,viewport.querySelector('.edge-layer'));
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:true});if(!gl)throw Error('WebGL2 unavailable');
 const cards=new Map(board.cards.map(p=>[p.id,p])),vertices:number[]=[];
 function line(a:{x:number;y:number},b:{x:number;y:number},width:number,color:number[],start:number,period:number){
  const length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length*width/2,ny=(b.x-a.x)/length*width/2;
  for(const [p,side,d] of [[a,1,start],[b,1,start+length],[a,-1,start],[a,-1,start],[b,1,start+length],[b,-1,start+length]] as const)vertices.push(p.x+nx*side,p.y+ny*side,...color,d,period);
 }
 for(const edge of board.edges){
  const a=cards.get(edge.from),b=cards.get(edge.to);if(!a||!b)continue;
  const geometry=edgeGeometry(edge,a,b,p=>p.height),color=(edge.strokeColor??'#9da3a6').slice(1).match(/../g)!.map(c=>parseInt(c,16)/255),width=edge.strokeWidth??2;let distance=0;
  for(let i=1;i<geometry.samples.length;i++){const a=geometry.samples[i-1],b=geometry.samples[i];line(a,b,width,color,distance,edge.strokeStyle==='dashed'?width*7:0);distance+=Math.hypot(b.x-a.x,b.y-a.y);}
  if(edge.toArrowhead==='arrow'){const end=geometry.end,previous=geometry.samples.at(-2)!,length=Math.hypot(end.x-previous.x,end.y-previous.y)||1,dx=(end.x-previous.x)/length,dy=(end.y-previous.y)/length;
   for(const sign of [-1,1])line({x:end.x-dx*8*width-dy*4*width*sign,y:end.y-dy*8*width+dx*4*width*sign},end,width,color,0,0);
  }
 }
 const data=new Float32Array(vertices);let program:WebGLProgram,buffer:WebGLBuffer;
 const shader=(type:number,source:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Shader failed');return shader;};
 function init(){
  const vertex=shader(gl!.VERTEX_SHADER,`#version 300 es
  in vec2 position;in vec3 color;in vec2 dash;uniform vec3 camera;uniform vec2 size;out vec3 ink;out vec2 pattern;
  void main(){vec2 screen=position*camera.z+camera.xy;gl_Position=vec4(screen.x/size.x*2.-1.,1.-screen.y/size.y*2.,0.,1.);ink=color;pattern=dash;}`);
  const fragment=shader(gl!.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec3 ink;in vec2 pattern;out vec4 outputColor;
  void main(){if(pattern.y>0.&&mod(pattern.x,pattern.y)>pattern.y*4./7.)discard;outputColor=vec4(ink,1.);}`);
  program=gl!.createProgram()!;gl!.attachShader(program,vertex);gl!.attachShader(program,fragment);gl!.linkProgram(program);gl!.deleteShader(vertex);gl!.deleteShader(fragment);if(!gl!.getProgramParameter(program,gl!.LINK_STATUS))throw Error(gl!.getProgramInfoLog(program)??'Link failed');
  gl!.useProgram(program);buffer=gl!.createBuffer()!;gl!.bindBuffer(gl!.ARRAY_BUFFER,buffer);gl!.bufferData(gl!.ARRAY_BUFFER,data,gl!.STATIC_DRAW);
  for(const [name,size,offset] of [['position',2,0],['color',3,2],['dash',2,5]] as const){const at=gl!.getAttribLocation(program,name);gl!.enableVertexAttribArray(at);gl!.vertexAttribPointer(at,size,gl!.FLOAT,false,28,offset*4);}
 }
 function draw(){if(gl!.isContextLost())return;const ratio=devicePixelRatio||1,w=viewport.clientWidth,h=viewport.clientHeight;if(canvas.width!==Math.ceil(w*ratio)||canvas.height!==Math.ceil(h*ratio)){canvas.width=Math.ceil(w*ratio);canvas.height=Math.ceil(h*ratio);}gl!.viewport(0,0,canvas.width,canvas.height);gl!.clearColor(0,0,0,0);gl!.clear(gl!.COLOR_BUFFER_BIT);gl!.useProgram(program);const c=camera();gl!.uniform3f(gl!.getUniformLocation(program,'camera'),c.x,c.y,c.zoom);gl!.uniform2f(gl!.getUniformLocation(program,'size'),w,h);gl!.drawArrays(gl!.TRIANGLES,0,data.length/7);}
 const style=document.createElement('style');style.textContent='.gpu-edge-comparison .edge-stroke{display:none}';document.head.append(style);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();viewport.classList.remove('gpu-edge-comparison');});
 canvas.addEventListener('webglcontextrestored',()=>{init();viewport.classList.add('gpu-edge-comparison');draw();});
 init();viewport.classList.add('gpu-edge-comparison');viewport.addEventListener('board-camera-change',draw);const observer=new ResizeObserver(draw);observer.observe(viewport);draw();
 return {bytes:data.byteLength,draw,dispose(){observer.disconnect();viewport.removeEventListener('board-camera-change',draw);viewport.classList.remove('gpu-edge-comparison');style.remove();gl.deleteBuffer(buffer);gl.deleteProgram(program);canvas.remove();}};
}
