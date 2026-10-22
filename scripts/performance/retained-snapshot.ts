// Native comparison only. A retained overview is not yet a complete interaction renderer.
import type {Camera} from '../../src/renderer/navigation';
export async function retainedSnapshot(source:string,webgl:boolean){
 const image=new Image();image.src=source;await image.decode();
 const viewport=document.querySelector<HTMLElement>('.canvas')!,bench=(window as unknown as {__boardBench:{navigation:{current:Camera;publish:(camera:Camera)=>void}}}).__boardBench;
 const navigation=bench.navigation,initial={...navigation.current},publish=navigation.publish,canvas=document.createElement('canvas'),ratio=devicePixelRatio||1,width=viewport.clientWidth,height=viewport.clientHeight;
 canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';viewport.append(canvas);
 const style=document.createElement('style');style.textContent='.snapshot-comparison .board-world{content-visibility:hidden}.snapshot-comparison .edge-layer,.snapshot-comparison .edge-handles{display:none}';document.head.append(style);viewport.classList.add('snapshot-comparison');navigation.publish=()=>{};
 let paint:()=>void,disposeGraphics=()=>{};
 if(webgl){
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false});if(!gl)throw Error('WebGL2 unavailable');
  const shader=(type:number,source:string)=>{const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Shader failed');return shader;};
  const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
   in vec2 corner;out vec2 uv;uniform vec2 size;uniform vec3 camera;
   void main(){vec2 p=corner*size*camera.z+camera.xy;gl_Position=vec4(p.x/size.x*2.-1.,1.-p.y/size.y*2.,0.,1.);uv=corner;}`);
  const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec2 uv;uniform sampler2D source;out vec4 outputColor;void main(){outputColor=texture(source,uv);}`);
  const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'Link failed');gl.useProgram(program);
  const buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);const corner=gl.getAttribLocation(program,'corner');gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  const background=getComputedStyle(viewport).backgroundColor.match(/[\d.]+/g)?.slice(0,3).map(Number)??[255,255,255];
  paint=()=>{const c=navigation.current,z=c.zoom/initial.zoom;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(background[0]/255,background[1]/255,background[2]/255,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(gl.getUniformLocation(program,'size'),width,height);gl.uniform3f(gl.getUniformLocation(program,'camera'),c.x-initial.x*z,c.y-initial.y*z,z);gl.drawArrays(gl.TRIANGLES,0,6);};
  disposeGraphics=()=>{gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);};
 }else{
  const context=canvas.getContext('2d')!,background=getComputedStyle(viewport).backgroundColor;
  paint=()=>{const c=navigation.current,z=c.zoom/initial.zoom;context.setTransform(1,0,0,1,0,0);context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);context.setTransform(ratio*z,0,0,ratio*z,ratio*(c.x-initial.x*z),ratio*(c.y-initial.y*z));context.drawImage(image,0,0,width,height);};
 }
 const restore=()=>{viewport.removeEventListener('board-camera-change',paint);viewport.classList.remove('snapshot-comparison');style.remove();canvas.remove();navigation.publish=publish;publish(navigation.current);disposeGraphics();};
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();restore();});viewport.addEventListener('board-camera-change',paint);paint();
 return {bytes:image.naturalWidth*image.naturalHeight*4,displayBytes:canvas.width*canvas.height*4,headroom:image.naturalWidth/(width*ratio),restore};
}

export async function compareSnapshot(expected:string,actual:string){
 const load=async(source:string)=>{const image=new Image();image.src=source;await image.decode();return image;};
 const [before,after]=await Promise.all([load(expected),load(actual)]),canvas=document.createElement('canvas');canvas.width=after.naturalWidth;canvas.height=after.naturalHeight;const context=canvas.getContext('2d')!;
 context.drawImage(before,0,0,canvas.width,canvas.height);const a=context.getImageData(0,0,canvas.width,canvas.height).data;
 context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(after,0,0);const b=context.getImageData(0,0,canvas.width,canvas.height).data;let total=0,bad=0,count=0;
 for(let i=0;i<a.length;i+=64){let peak=0;for(let c=0;c<3;c++){const difference=Math.abs(a[i+c]-b[i+c]);total+=difference;peak=Math.max(peak,difference);}if(peak>20)bad++;count++;}
 canvas.width=0;canvas.height=0;return {meanAbsoluteError:total/(count*3),changedFraction:bad/count};
}
