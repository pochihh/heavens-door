// Decode through Chromium so Copy image also works for WebP, AVIF and SVG.
// A workspace-validated byte read becomes a same-origin Blob; no remote fetch or canvas taint.
export async function copyImage(path:string){
  const bytes=await window.door.imageData(path),mime=path.toLowerCase().endsWith('.svg')?'image/svg+xml':'application/octet-stream';
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:mime})),image=new Image();
  try{
    image.src=url;await image.decode();
    if(image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('This image is too large to copy.');
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');if(!context)throw new Error('This image could not be copied.');context.drawImage(image,0,0);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('This image could not be copied.')),'image/png'));
    await window.door.copyImage(new Uint8Array(await png.arrayBuffer()));
  }finally{URL.revokeObjectURL(url);}
}
