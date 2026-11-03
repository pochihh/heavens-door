import {promises as fs,constants} from 'node:fs';
import {basename,join} from 'node:path';
import {workspacePath} from './files';

const folder='.heavens-door/snippets',MAX_BYTES=256*1024,MAX_TOTAL=1024*1024,MAX_FILES=50;
export const snippetName=(name:string)=>/^[-\w .]{1,120}\.css$/i.test(name)&&!name.startsWith('.');
export async function snippetsFolder(root:string,create=false){
 for(const path of ['.heavens-door',folder]){
  try{await workspacePath(root,path);}catch(error){if(!create||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await fs.mkdir(join(root,path));}
 }
 return workspacePath(root,folder);
}
async function readCss(file:string){
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Use a CSS file smaller than 256 KB.');
  const bytes=Buffer.alloc(MAX_BYTES+1);let size=0;
  while(size<bytes.length){const {bytesRead}=await handle.read(bytes,size,bytes.length-size,null);if(!bytesRead)break;size+=bytesRead;}
  if(size>MAX_BYTES)throw Error('Use a CSS file smaller than 256 KB.');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size));
 }finally{await handle.close();}
}
export async function cssSnippets(root:string){
 let directory:string;try{directory=await snippetsFolder(root);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
 const names=(await fs.readdir(directory)).filter(snippetName).sort((a,b)=>a.localeCompare(b));
 if(names.length>MAX_FILES)throw Error('Keep at most 50 CSS snippets in this workspace.');
 let total=0;const result:{name:string;css:string;error?:string}[]=[];
 for(const name of names){try{
  const css=await readCss(await workspacePath(root,folder+'/'+name));total+=Buffer.byteLength(css);if(total>MAX_TOTAL)throw Error('CSS snippets must total less than 1 MB.');
  result.push({name,css});
 }catch(error){result.push({name,css:'',error:String(error)});}}
 return result;
}
export async function importCssSnippets(root:string,files:string[]){
 if(files.length>20)throw Error('Import at most 20 CSS snippets at a time.');
 // Read and validate before creating anything; never overwrite a workspace file.
 const sources=await Promise.all(files.map(async file=>{const name=basename(file);if(!snippetName(name))throw Error('Choose CSS files with simple names.');return {name,css:await readCss(file)};}));
 const existing=await cssSnippets(root);if(existing.length+sources.length>MAX_FILES)throw Error('Keep at most 50 CSS snippets in this workspace.');
 if([...existing,...sources].reduce((bytes,item)=>bytes+Buffer.byteLength(item.css),0)>MAX_TOTAL)throw Error('CSS snippets must total less than 1 MB.');
 const directory=await snippetsFolder(root,true),names=new Set((await fs.readdir(directory)).map(name=>name.toLowerCase()));
 for(const source of sources){let name=source.name;for(let i=2;names.has(name.toLowerCase());i++)name=source.name.slice(0,-4)+' '+i+'.css';names.add(name.toLowerCase());
  const target=join(directory,name),handle=await fs.open(target,'wx',0o600);
  try{await handle.writeFile(source.css);}catch(error){await fs.unlink(target);throw error;}finally{await handle.close();}
 }
}
