import {promises as fs} from 'node:fs';
import {dirname,join,extname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {workspacePath} from './files';

const formats:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif','image/svg+xml':'.svg'};
export const MAX_IMAGE_BYTES=25*1024*1024;
export async function importImage(root:string,notePath:string,name:string,type:string,data:Uint8Array){
  if(typeof notePath!=='string'||typeof name!=='string'||!formats[type]||!(data instanceof Uint8Array)||!data.byteLength||data.byteLength>MAX_IMAGE_BYTES)throw new Error('Choose an image smaller than 25 MB.');
  const note=await workspacePath(root,notePath);
  if(extname(note).toLowerCase()!=='.md'||!(await fs.stat(note)).isFile())throw new Error('The destination card is unavailable.');
  const folder=join(dirname(notePath),'_assets');
  // Validate the parent and refuse an existing symlink before writing any bytes.
  await fs.mkdir(join(dirname(note),'_assets')).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const target=await workspacePath(root,folder);
  const stem=basename(name,extname(name)).replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70)||'image';
  const filename=`${stem}-${randomUUID().slice(0,8)}${formats[type]}`;
  const file=await fs.open(join(target,filename),'wx');
  try{await file.writeFile(data);await file.sync();}finally{await file.close();}
  return {src:'_assets/'+filename,alt:basename(name,extname(name))||'Image'};
}
