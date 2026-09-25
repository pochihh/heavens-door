import {promises as fs} from 'node:fs';
import {basename,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {RegisteredWorkspace} from '../shared';

export class WorkspaceRegistry {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private file:string){}
  async list():Promise<RegisteredWorkspace[]> {
    await this.queue;
    return (await this.read()).map(root=>({root,name:basename(root)}));
  }
  private async read():Promise<string[]> {
    try{
      const value:unknown=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(!Array.isArray(value)||value.some(p=>typeof p!=='string'))throw new Error('Invalid workspace registry');
      return [...new Set(value)] as string[];
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  }
  register(root:string) {return this.update(async roots=>{const actual=await fs.realpath(root);return roots.includes(actual)?roots:[...roots,actual];});}
  async unregister(root:string){await this.update(async roots=>roots.filter(path=>path!==root));return this.list();}
  private update(change:(roots:string[])=>Promise<string[]>) {
    const task=this.queue.then(async()=>{
      const roots=await this.read(),next=await change(roots);
      if(JSON.stringify(roots)===JSON.stringify(next))return;
      await fs.mkdir(dirname(this.file),{recursive:true});
      const temporary=this.file+'.'+randomUUID()+'.tmp';
      await fs.writeFile(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
      try{await fs.rename(temporary,this.file);}finally{await fs.unlink(temporary).catch(()=>undefined);}
    });
    this.queue=task.catch(()=>undefined);return task;
  }
}
