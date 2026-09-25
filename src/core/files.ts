import {promises as fs} from 'node:fs';
import {resolve,relative,isAbsolute,sep,join,extname} from 'node:path';
import type {FileEntry,FileInspection} from '../shared';

// Browsing allows dotfiles, but never follows symlinks or escapes the selected workspace.
export async function workspacePath(root:string,path:string) {
  if(typeof path!=='string'||isAbsolute(path)||path.includes('\0')||path.split(/[\\/]/).some(p=>p==='..'))throw new Error('Invalid workspace path');
  const target=resolve(root,path);
  if(target!==root&&!target.startsWith(root+sep))throw new Error('Path leaves workspace');
  let current=root;
  for(const part of relative(root,target).split(sep).filter(Boolean)){
    current=join(current,part);
    if((await fs.lstat(current)).isSymbolicLink())throw new Error('Symbolic links are shown but cannot be opened');
  }
  return target;
}
export async function listFiles(root:string,path:string):Promise<FileEntry[]> {
  const entries=await fs.readdir(await workspacePath(root,path),{withFileTypes:true});
  return entries.map(e=>({name:e.name,path:join(path,e.name),kind:e.isSymbolicLink()?'symlink' as const:e.isDirectory()?'folder' as const:'file' as const}))
    .sort((a,b)=>Number(b.kind==='folder')-Number(a.kind==='folder')||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
}
export async function inspectFile(root:string,path:string):Promise<FileInspection> {
  const target=await workspacePath(root,path),stat=await fs.stat(target);
  if(!stat.isFile())throw new Error('Select a file');
  const extension=extname(path).toLowerCase(),size=stat.size;
  if(['.png','.jpg','.jpeg','.gif','.webp','.avif','.svg'].includes(extension))return {kind:'image',size};
  if(extension==='.pdf'||size>2*1024*1024)return {kind:'binary',size};
  const bytes=await fs.readFile(target);
  if(bytes.includes(0))return {kind:'binary',size};
  try{return {kind:'text',size,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};}
  catch{return {kind:'binary',size};}
}
