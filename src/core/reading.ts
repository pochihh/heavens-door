import {promises as fs} from 'node:fs';
import {basename,dirname,extname,join,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {workspacePath} from './files';
import {referenceHref} from '../document-links';
import {readPreferences} from './preferences';
import {DEFAULT_EDITOR_SETTINGS} from '../editor-settings';
import type {ReadingImport} from '../shared';
export {readFeeds,writeFeeds,feedArticles} from '../feeds';
export const MAX_READING_BYTES=50*1024*1024;
export function webAddress(value:string){if(typeof value!=='string'||value.length>4096)throw new Error('Invalid URL.');const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP or HTTPS URL without credentials.');return url.href;}
export async function boundedDownload(url:string,limit=MAX_READING_BYTES){const response=await fetch(webAddress(url),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Download failed (${response.status}).`);if(Number(response.headers.get('content-length'))>limit)throw new Error('The attachment is too large.');const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();if(!reader)throw new Error('Empty response.');try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('The attachment is too large.');chunks.push(value);}}finally{await reader.cancel();}return {data:Buffer.concat(chunks),type:response.headers.get('content-type')??'',url:response.url};}
export async function readingAsset(root:string,notePath:string,name:string,extension:string,data:Uint8Array,existing?:string){
  if(!['.pdf','.html','.png','.jpg','.jpeg','.webp','.gif','.svg','.avif'].includes(extension)||!(data instanceof Uint8Array)||!data.length||data.length>MAX_READING_BYTES)throw new Error('Choose an attachment smaller than 50 MB.');
  if(existing!==undefined){
    if(extension!=='.pdf'||typeof existing!=='string'||extname(existing).toLowerCase()!=='.pdf')throw new Error('Choose a workspace PDF.');
    const file=await workspacePath(root,existing),stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_READING_BYTES)throw new Error('Choose a PDF smaller than 50 MB.');
    const bytes=await fs.readFile(file);validateImport({name,type:'pdf',data:bytes});
    return {file:referenceHref(notePath,existing),sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const settings=(await readPreferences(root)).editor??DEFAULT_EDITOR_SETTINGS,folder=join(settings.imageLocation==='workspace'?'':dirname(notePath),settings.imageFolder);
  let parent=root;for(const part of folder.split(/[\\/]/).filter(p=>p&&p!=='.')){await workspacePath(root,relative(root,parent));parent=join(parent,part);await fs.mkdir(parent).catch(e=>{if(e.code!=='EEXIST')throw e;});if((await fs.lstat(parent)).isSymbolicLink())throw new Error('Attachment folders cannot be symbolic links.');}
  const safe=basename(name,extname(name)).replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70)||'source',file=join(folder,safe+'-'+randomUUID().slice(0,8)+extension),handle=await fs.open(join(await workspacePath(root,folder),basename(file)),'wx');try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
  return {file:relative(dirname(notePath),file).split('\\').join('/'),sha256:createHash('sha256').update(data).digest('hex')};
}
export function validateImport(value:ReadingImport){if(!value||value.readLater!==undefined&&typeof value.readLater!=='boolean'||!['pdf','web'].includes(value.type)||typeof value.name!=='string'||value.name.length>1000||!(value.data instanceof Uint8Array)||!value.data.length||value.data.length>MAX_READING_BYTES||value.type==='pdf'&&Buffer.from(value.data.slice(0,1024)).indexOf('%PDF-')<0||value.body!==undefined&&(typeof value.body!=='string'||value.body.length>5*1024*1024))throw new Error('Invalid reading import.');if(value.type==='web'&&value.data.length>10*1024*1024||value.missingImages&&(!Array.isArray(value.missingImages)||value.missingImages.length>100||value.missingImages.some(u=>typeof u!=='string'||u.length>4096)))throw new Error('Invalid capture size.');if(value.file!==undefined&&(value.type!=='pdf'||typeof value.file!=='string'||!value.file||value.file.length>4096))throw new Error('Invalid PDF source path.');if(value.url)webAddress(value.url);if(value.feed)webAddress(value.feed);if(value.entry!==undefined&&(typeof value.entry!=='string'||value.entry.length>4096))throw new Error('Invalid feed entry.');}

export async function localArticleImage(url:string,source:string){
  if(!url.startsWith('file:'))return boundedDownload(url,25*1024*1024);
  const folder=dirname(await fs.realpath(source)),file=await fs.realpath(fileURLToPath(url));
  if(!file.startsWith(folder+sep))throw new Error('An article image is outside the imported folder.');
  const type=({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.avif':'image/avif'} as Record<string,string>)[extname(file).toLowerCase()],stat=await fs.stat(file);
  if(!type||!stat.isFile()||stat.size>25*1024*1024)throw new Error('Unsupported article image.');
  return {data:await fs.readFile(file),type,url};
}

// Native selection/drop grants access to the chosen file; only workspace paths are retained as links.
export async function readPdfFile(root:string,source:string):Promise<ReadingImport>{
  if(typeof source!=='string'||!isAbsolute(source)||extname(source).toLowerCase()!=='.pdf')throw new Error('Choose a PDF file.');
  const file=await fs.realpath(source),workspace=await fs.realpath(root),path=relative(workspace,file),stat=await fs.stat(file);
  if(!stat.isFile()||stat.size>MAX_READING_BYTES)throw new Error('Choose a PDF smaller than 50 MB.');
  const value:ReadingImport={name:basename(source,extname(source)),type:'pdf',data:new Uint8Array(await fs.readFile(file))};validateImport(value);
  if(path&&path!=='..'&&!path.startsWith('..'+sep)&&!isAbsolute(path)){await workspacePath(workspace,path);value.file=path.split(sep).join('/');}
  return value;
}
