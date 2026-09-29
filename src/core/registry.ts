import { ui } from '../text/ui';
import {promises as fs,constants} from 'node:fs';
import {basename,dirname,join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {RegisteredWorkspace} from '../shared';
type Registration={root:string;lastUpdated:number|null};

// Inspect timestamps only when managing workspaces, never during rendering or quick switching.
async function latestChange(folder:string):Promise<number> {
  let latest=(await fs.stat(folder)).mtimeMs;
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    if(entry.name==='.git'||entry.name==='node_modules'||entry.isSymbolicLink())continue;
    const path=join(folder,entry.name);
    try{latest=Math.max(latest,entry.isDirectory()?await latestChange(path):(await fs.stat(path)).mtimeMs);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  return latest;
}
async function inspect(entry:Registration,refresh:boolean):Promise<RegisteredWorkspace> {
  const info={...entry,name:basename(entry.root)};
  try{
    if(!(await fs.stat(entry.root)).isDirectory())return {...info,status:'not-folder'};
    await fs.access(entry.root,constants.R_OK|constants.W_OK);
    return {...info,status:'available',lastUpdated:refresh?await latestChange(entry.root):entry.lastUpdated};
  }catch(error){return {...info,status:(error as NodeJS.ErrnoException).code==='ENOENT'?'missing':'unavailable'};}
}
export class WorkspaceRegistry {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private file:string){}
  async list(refresh=false):Promise<RegisteredWorkspace[]> {
    if(!refresh){await this.queue;return Promise.all((await this.read()).map(entry=>inspect(entry,false)));}
    let checked:RegisteredWorkspace[]=[];
    await this.update(async entries=>{
      checked=await Promise.all(entries.map(entry=>inspect(entry,true)));
      return checked.map(({root,lastUpdated})=>({root,lastUpdated}));
    });
    return checked;
  }
  private async read():Promise<Registration[]> {
    try{
      const value:unknown=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(!Array.isArray(value))throw new Error(ui.errors.invalidWorkspaceRegistry);
      const entries=value.map(item=>{
        const entry=typeof item==='string'?{root:item,lastUpdated:null}:item;
        if(!entry||typeof entry.root!=='string'||!isAbsolute(entry.root)||entry.lastUpdated!==null&&(!Number.isFinite(entry.lastUpdated)||entry.lastUpdated<0))throw new Error(ui.errors.invalidWorkspaceRegistry);
        return {root:entry.root as string,lastUpdated:entry.lastUpdated as number|null};
      });
      return [...new Map(entries.map(entry=>[entry.root,entry])).values()];
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  }
  register(root:string) {return this.update(async entries=>{const actual=await fs.realpath(root);return entries.some(entry=>entry.root===actual)?entries:[...entries,{root:actual,lastUpdated:null}];});}
  async unregister(root:string){await this.update(async entries=>entries.filter(entry=>entry.root!==root));return this.list();}
  private update(change:(entries:Registration[])=>Promise<Registration[]>) {
    const task=this.queue.then(async()=>{
      const entries=await this.read(),next=await change(entries);
      if(JSON.stringify(entries)===JSON.stringify(next))return;
      await fs.mkdir(dirname(this.file),{recursive:true});
      const temporary=this.file+'.'+randomUUID()+'.tmp';
      await fs.writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
      try{await fs.rename(temporary,this.file);}finally{await fs.unlink(temporary).catch(()=>undefined);}
    });
    this.queue=task.catch(()=>undefined);return task;
  }
}
