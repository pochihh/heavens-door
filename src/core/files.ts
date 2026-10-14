import { ui } from '../text/ui';
import {promises as fs,constants,createReadStream} from 'node:fs';
import {resolve,relative,isAbsolute,sep,join,extname,basename,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readCard,readBoard,writeBoard,splitNote,revision} from './format';
import {remapPath} from '../path-remap';
import {moveCardLinks} from '../card-links';
import type {FileOperation,FileEntry,FileInspection,TrashEntry} from '../shared';

// Browsing allows dotfiles, but never follows symlinks or escapes the selected workspace.
export async function workspacePath(root:string,path:string) {
  if(typeof path!=='string'||isAbsolute(path)||path.includes('\0')||path.split(/[\\/]/).some(p=>p==='..'))throw new Error(ui.errors.invalidWorkspacePath);
  const target=resolve(root,path);
  if(target!==root&&!target.startsWith(root+sep))throw new Error(ui.errors.pathLeavesWorkspace);
  let current=root;
  for(const part of relative(root,target).split(sep).filter(Boolean)){
    current=join(current,part);
    if((await fs.lstat(current)).isSymbolicLink())throw new Error(ui.errors.symbolicLinkBlocked);
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
  if(!stat.isFile())throw new Error(ui.errors.selectAFile);
  const extension=extname(path).toLowerCase(),size=stat.size;
  if(['.png','.jpg','.jpeg','.gif','.webp','.avif','.svg'].includes(extension))return {kind:'image',size};
  if(extension==='.pdf'||size>2*1024*1024)return {kind:'binary',size};
  const bytes=await fs.readFile(target);
  if(bytes.includes(0))return {kind:'binary',size};
  try{return {kind:'text',size,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};}
  catch{return {kind:'binary',size};}
}

// Mutations protect app/Git internals and reject symlinks throughout a directory tree.
export async function editablePath(root:string,path:string,missing=false){
  if(typeof path!=='string'||!path||path.split(/[\\/]/).some(p=>['.git','.heavens-door','node_modules'].includes(p)))throw new Error(ui.errors.invalidWorkspacePath);
  return checkedPath(root,path,missing);
}
async function checkedPath(root:string,path:string,missing=false){
  if(typeof path!=='string'||isAbsolute(path)||path.includes('\0')||path.split(/[\\/]/).some(p=>p==='..'))throw new Error(ui.errors.invalidWorkspacePath);
  const target=resolve(root,path);if(target===root||!target.startsWith(root+sep))throw new Error(ui.errors.pathLeavesWorkspace);
  let current=root;for(const part of relative(root,target).split(sep)){current=join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw new Error(ui.errors.symbolicLinkBlocked);}catch(e){if(!missing||(e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  return target;
}
async function tree(root:string,path:string):Promise<string[]>{
  const target=await checkedPath(root,path),stat=await fs.stat(target);if(stat.isFile())return [path];if(!stat.isDirectory())throw new Error(ui.errors.invalidWorkspaceFile);
  const result=[path];for(const name of (await fs.readdir(target)).sort())result.push(...await tree(root,join(path,name)));return result;
}
export async function fileStamp(root:string,path:string){
  const hash=createHash('sha256');for(const p of await tree(root,path)){const target=await checkedPath(root,p),stat=await fs.stat(target);hash.update(JSON.stringify([relative(path,p),stat.isDirectory()]));if(stat.isFile())for await(const chunk of createReadStream(target))hash.update(chunk);}
  return hash.digest('hex');
}
export async function vacant(root:string,path:string){const target=await checkedPath(root,path,true),parent=dirname(target),names=await fs.readdir(parent);if(names.some(n=>n.toLocaleLowerCase()===basename(target).toLocaleLowerCase()))throw new Error(ui.errors.fileNameConflict);return target;}
export async function availableFilePath(root:string,path:string){const extension=extname(path),stem=path.slice(0,extension? -extension.length:undefined);for(let i=0;;i++){const next=i?stem+' '+(i+1)+extension:path;try{await vacant(root,next);return next;}catch(e){if((e as Error).message!==ui.errors.fileNameConflict)throw e;}}}
interface FileTrash {kind:'file'|'folder';path:string;name:string;deleted:string}
async function trashRecord(root:string,record:string){
  if(!/^[a-f0-9-]{36}\.json$/.test(basename(record)))throw new Error(ui.errors.invalidWorkspacePath);
  const raw=await fs.readFile(await checkedPath(root,record),'utf8'),meta=JSON.parse(raw) as FileTrash;
  if(!['file','folder'].includes(meta.kind)||typeof meta.path!=='string'||typeof meta.name!=='string'||basename(meta.path)!==meta.name||!Number.isFinite(Date.parse(meta.deleted)))throw new Error(ui.errors.invalidEdit);
  await editablePath(root,meta.path,true);
  const payload=join(record.slice(0,-5)+'.trash',meta.name);await checkedPath(root,payload);return {meta,payload,revision:revision(raw)};
}
export async function fileTrashEntries(root:string,folder:string):Promise<TrashEntry[]>{
  let names:string[];try{names=await fs.readdir(await checkedPath(root,folder));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
  const rows:TrashEntry[]=[];for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){const record=join(folder,name),raw=await fs.readFile(await checkedPath(root,record),'utf8'),meta=JSON.parse(raw);if(!meta.kind)continue;let entry;try{entry=await trashRecord(root,record);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}rows.push({id:name.slice(0,-5),path:entry.payload,name:entry.meta.name,title:entry.meta.name,legacy:false,revision:entry.revision,originalPath:entry.meta.path,deleted:Date.parse(entry.meta.deleted),kind:entry.meta.kind,archive:record});}return rows;
}
export async function operateFile(root:string,trash:string,op:FileOperation):Promise<{path:string;inverse:FileOperation}>{
  if(!['copy','move','trash','restore'].includes(op.action))throw new Error(ui.errors.invalidRequestValue);
  const record=op.action==='restore'?await trashRecord(root,op.path):null,from=record?.payload??op.path,source=record?await checkedPath(root,from):await editablePath(root,from),paths=await tree(root,from);
  if(!record)for(const path of paths)await editablePath(root,path);
  if(op.expected&&await fileStamp(root,from)!==op.expected)throw new Error(ui.errors.externalEdit(from));
  if(op.action==='trash'){
    // A native rename keeps binary bytes and complete folders intact; metadata is readable JSON.
    const folder=await checkedPath(root,trash,true);if(folder===source||folder.startsWith(source+sep))throw new Error(ui.errors.invalidWorkspacePath);
    await fs.mkdir(folder,{recursive:true});await checkedPath(root,trash);
    const id=randomUUID(),bucket=join(trash,id+'.trash'),payload=join(bucket,basename(from)),meta:FileTrash={kind:(await fs.stat(source)).isDirectory()?'folder':'file',path:from,name:basename(from),deleted:new Date().toISOString()},metadata=join(trash,id+'.json');
    await fs.mkdir(await checkedPath(root,bucket,true));await fs.writeFile(await checkedPath(root,metadata,true),JSON.stringify(meta,null,2)+'\n',{flag:'wx'});
    try{await fs.rename(source,await checkedPath(root,payload,true));}catch(e){await fs.rm(await checkedPath(root,bucket),{recursive:true});await fs.unlink(await checkedPath(root,metadata));throw e;}
    return {path:payload,inverse:{action:'restore',path:metadata,expected:await fileStamp(root,payload)}};
  }
  const requested=op.destination??record?.meta.path;if(!requested)throw new Error(ui.errors.invalidWorkspacePath);await editablePath(root,requested,true);
  // Only Restore creates missing parents. Paste targets an existing folder.
  if(record){await fs.mkdir(dirname(await editablePath(root,requested,true)),{recursive:true});}
  const to=record&&!op.destination?await availableFilePath(root,requested):requested,target=await vacant(root,to);
  if(target===source||target.startsWith(source+sep))throw new Error(ui.errors.invalidWorkspacePath);
  if(op.action==='copy'){
    const directory=(await fs.stat(source)).isDirectory(),staging=join(dirname(to),'.copy-'+randomUUID()),temporary=await checkedPath(root,staging,true);if(directory)await fs.mkdir(temporary);else await fs.copyFile(source,temporary,constants.COPYFILE_EXCL);
    try{
      if(directory)for(const name of await fs.readdir(source))await fs.cp(join(source,name),join(temporary,name),{recursive:true,errorOnExist:true,force:false});
      const ids=new Map<string,string>(),notes=new Map<string,string>(),boards=new Map<string,ReturnType<typeof readBoard>>();
      // Unrecognized or malformed documents still copy byte-for-byte like any other file.
      for(const path of paths){if(!(await fs.stat(await checkedPath(root,path))).isFile()||! /\.(md|whiteboard)$/.test(path))continue;const raw=await fs.readFile(await checkedPath(root,path),'utf8');try{if(path.endsWith('.md')){ids.set(readCard(path,raw).id,randomUUID());notes.set(path,raw);}else boards.set(path,readBoard(path,raw));}catch{/* Preserve the raw copied file. */}}
      for(const path of paths){const final=remapPath(path,from,to),next=remapPath(final,to,staging);if(!(await fs.stat(await checkedPath(root,path))).isFile())continue;
        if(notes.has(path)){const raw=notes.get(path)!,card=readCard(path,raw),{front,body}=splitNote(raw);front.set('card-id',ids.get(card.id)!);const file=front.getIn(['source','file']);if(typeof file==='string'){const target=remapPath(join(dirname(path),decodeURIComponent(file)),from,to);front.setIn(['source','file'],relative(dirname(final),target).split(sep).map(encodeURIComponent).join('/'));}await fs.writeFile(await checkedPath(root,next),'---\n'+front.toString()+'---\n'+moveCardLinks(body,path,final,p=>remapPath(p,from,to)));}
        else if(boards.has(path)){const board=boards.get(path)!,boardPath=directory&&basename(path)===basename(dirname(path))+'.whiteboard'?remapPath(join(dirname(final),basename(dirname(final))+'.whiteboard'),to,staging):next;await fs.writeFile(await checkedPath(root,next),writeBoard({...board,name:basename(remapPath(boardPath,staging,to),'.whiteboard'),cards:board.cards.map(p=>p.folder?{...p,folder:remapPath(p.folder,from,to)}:{...p,cardId:ids.get(p.cardId)??p.cardId,...(p.object?.type==='image'?{object:{...p.object,html:moveCardLinks(p.object.html,path,final,target=>remapPath(target,from,to))}}:{})})}));if(boardPath!==next)await fs.rename(await checkedPath(root,next),await vacant(root,boardPath));}
      }
    await vacant(root,to);await fs.rename(temporary,target);
    }catch(e){await fs.rm(temporary,{recursive:directory,force:true});throw e;}
    return {path:to,inverse:{action:'trash',path:to,expected:await fileStamp(root,to)}};
  }
  const directory=(await fs.stat(source)).isDirectory(),oldBoard=join(to,basename(from)+'.whiteboard'),newBoard=join(to,basename(to)+'.whiteboard'),ownedBoard=directory&&(await fs.readdir(source)).includes(basename(from)+'.whiteboard');
  if(ownedBoard&&oldBoard!==newBoard&&(await fs.readdir(source)).some(n=>n.toLocaleLowerCase()===basename(newBoard).toLocaleLowerCase()))throw new Error(ui.errors.fileNameConflict);
  await fs.rename(source,target);
  if(ownedBoard&&oldBoard!==newBoard)try{await fs.rename(await checkedPath(root,oldBoard),await vacant(root,newBoard));}catch(e){await fs.rename(target,source);throw e;}
  if(record){await fs.unlink(await checkedPath(root,op.path));await fs.rmdir(dirname(source));}
  return {path:to,inverse:{action:record?'trash':'move',path:to,...(!record?{destination:from}:{}),expected:await fileStamp(root,to)}};
}
