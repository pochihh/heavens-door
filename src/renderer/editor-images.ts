// Decode through Chromium so Copy image also works for WebP, AVIF and SVG.
// A workspace-validated byte read becomes a same-origin Blob; no remote fetch or canvas taint.
export async function copyImage(path:string,crop?:{offsetX:number;offsetY:number;height:number;imgWidth:number;shape?:'circle'},width?:number){
  const bytes=await window.door.imageData(path),mime=path.toLowerCase().endsWith('.svg')?'image/svg+xml':'application/octet-stream';
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime})),image=new Image();
  try{
    image.src=url;await image.decode();
    if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('This image is too large to copy.');
    const canvas=document.createElement('canvas');const scale=crop?image.naturalWidth/crop.imgWidth:1;const w=crop?Math.round((width??crop.imgWidth)*scale):image.naturalWidth,h=crop?Math.round(crop.height*scale):image.naturalHeight;if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w*h>40_000_000)throw new Error('This crop is too large to copy.');canvas.width=w;canvas.height=h;
    const context=canvas.getContext('2d');if(!context)throw new Error('This image could not be copied.');if(crop?.shape==='circle'){context.beginPath();context.ellipse(canvas.width/2,canvas.height/2,canvas.width/2,canvas.height/2,0,0,Math.PI*2);context.clip();}if(crop)context.drawImage(image,crop.offsetX*scale,crop.offsetY*scale,canvas.width,canvas.height,0,0,canvas.width,canvas.height);else context.drawImage(image,0,0);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This image could not be copied.')),'image/png'));
    await window.door.copyImage(new Uint8Array(await png.arrayBuffer()));
  }finally{URL.revokeObjectURL(url);}
}
