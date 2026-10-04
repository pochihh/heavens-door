import {readPreferences} from './preferences';
import {DEFAULT_EDITOR_SETTINGS} from '../editor-settings';
import {promises as fs} from 'node:fs';
import {dirname,join,extname,basename,relative,posix} from 'node:path';
import {randomUUID} from 'node:crypto';
import {workspacePath} from './files';

const formats:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp','image/avif':'.avif','image/svg+xml':'.svg'};
export const MAX_IMAGE_BYTES=25*1024*1024;
export async function importImage(root:string,notePath:string,name:string,type:string,data:Uint8Array){
  if(typeof notePath!=='string'||typeof name!=='string'||!formats[type]||!(data instanceof Uint8Array)||!data.byteLength||data.byteLength>MAX_IMAGE_BYTES)throw new Error('Choose an image smaller than 25 MB.');
  const note=await workspacePath(root,notePath);
  if(extname(note).toLowerCase()!=='.md'||!(await fs.stat(note)).isFile())throw new Error('The destination card is unavailable.');
  const settings=(await readPreferences(root)).editor??DEFAULT_EDITOR_SETTINGS;
  const folder=join(settings.imageLocation==='workspace'?'':dirname(notePath),settings.imageFolder);
  // Validate the parent and refuse an existing symlink before writing any bytes.
  // Validate every existing ancestor before creating the configured destination.
  let parent=root;for(const segment of folder.split('/').filter(Boolean)){parent=join(parent,segment);await fs.mkdir(parent).catch(error=>{if(error.code!=='EEXIST')throw error;});if((await fs.lstat(parent)).isSymbolicLink())throw new Error('Image folders cannot be symbolic links.');}
  const target=await workspacePath(root,folder);
  const stem=basename(name,extname(name)).replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70)||'image';
  const filename=`${stem}-${randomUUID().slice(0,8)}${formats[type]}`;
  const file=await fs.open(join(target,filename),'wx');
  try{await file.writeFile(data);await file.sync();}finally{await file.close();}
  return {src:relative(dirname(note),join(target,filename)).split('\\').join('/'),alt:basename(name,extname(name))||'Image'};
}

export async function resolveImage(root:string,notePath:string,source:string):Promise<string[]>{
  if(typeof source!=='string'||source.length>4096||typeof notePath!=='string')throw new Error('Invalid image path');
  await workspacePath(root,notePath);let decoded:string;try{decoded=decodeURIComponent(source);}catch{throw new Error('Invalid image path');}
  if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decoded))return [];
  const local=posix.normalize(posix.join(posix.dirname(notePath),decoded)),vault=posix.normalize(decoded.replace(/^\//,''));
  const exists=async(p:string)=>{try{return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(p)&&(await fs.stat(await workspacePath(root,p))).isFile();}catch{return false;}};
  if(await exists(local))return [posix.relative(posix.dirname(notePath),local)];
  if(vault!==local&&await exists(vault))return [posix.relative(posix.dirname(notePath),vault)];
  const matches:string[]=[],name=posix.basename(decoded);
  const walk=async(folder:string)=>{for(const entry of await fs.readdir(join(root,folder),{withFileTypes:true})){if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;const p=posix.join(folder,entry.name);if(entry.isDirectory())await walk(p);else if(entry.isFile()&&entry.name===name&&await exists(p))matches.push(posix.relative(posix.dirname(notePath),p));}};
  await walk('');return matches.sort();
}
