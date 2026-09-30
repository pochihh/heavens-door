import { ui } from '../text/ui';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Checkpoint, CheckpointChange } from '../shared';
const run = promisify(execFile);
const interfaceFile='.heavens-door/settings.json';
const identity=['-c','user.name=Heaven’s Door','-c','user.email=local@heavens-door.invalid'];

export class History {
  available = false;
  constructor(private root: string) {}
  private async git(args:string[],env:NodeJS.ProcessEnv={}) {
    return (await run('git',args,{cwd:this.root,maxBuffer:32*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',...env}})).stdout;
  }
  private async value(args:string[],env?:NodeJS.ProcessEnv){return (await this.git(args,env)).trim();}
  private get journal(){return join(this.root,'.git','heavens-door-interface.json');}
  private async recoverInterface() {
    let saved:{content:string|null};
    try{saved=JSON.parse(await fs.readFile(this.journal,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
    if(saved.content!==null&&typeof saved.content!=='string')throw new Error(ui.errors.invalidHistoryRecovery);
    const folder=join(this.root,'.heavens-door');
    try{if((await fs.lstat(folder)).isSymbolicLink())throw new Error(ui.errors.symbolicLinkBlocked);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const path=join(this.root,interfaceFile);
    if(saved.content===null)await fs.rm(path,{force:true});
    else {await fs.mkdir(join(this.root,'.heavens-door'),{recursive:true});const temporary=path+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,saved.content);await fs.rename(temporary,path);}
    await fs.unlink(this.journal);
  }
  async initialize() {
    let existing = '';
    try { existing = await this.value(['rev-parse', '--show-toplevel']); } catch { /* new workspace */ }
    if (existing) {
      try { this.available = existing === this.root && await this.value(['config', '--get', 'heavensDoor.managed']) === 'true'; } catch { /* unowned repository */ }
    }else{
      await this.git(['init', '-b', 'main']);
      await this.git(['config', 'heavensDoor.managed', 'true']);
      this.available = true;
    }
    if(!this.available)return;
    await this.recoverInterface();
    const exclude=join(this.root,'.git','info','exclude');
    await fs.mkdir(join(this.root,'.git','info'),{recursive:true});
    const text=await fs.readFile(exclude,'utf8').catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return '';throw e;});
    if(!text.split('\n').includes('/'+interfaceFile))await fs.appendFile(exclude,'\n/'+interfaceFile+'\n');
  }
  private async ready() {
    if (!this.available) throw new Error(ui.errors.unmanagedHistory);
    if (['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply'].some(p => existsSync(join(this.root,'.git',p)))) throw new Error(ui.errors.gitOperationInProgress);
    if (await this.value(['diff','--cached','--name-only'])) throw new Error(ui.errors.gitStagedChanges);
  }
  async checkpoint(label: string) {
    await this.ready();
    if (!(await this.value(['status','--porcelain']))) return;
    await this.git(['add','--all','--','.']);
    // Old app versions tracked layout; remove it from new snapshots, keep its working file.
    await this.git(['rm','--cached','--ignore-unmatch','--',interfaceFile]);
    if(!(await this.value(['diff','--cached','--name-only'])))return;
    try {await this.git([...identity,'commit','-m',label.slice(0,200)]);}
    catch(error){throw new Error(ui.errors.checkpointFailed(String(error)),{cause:error});}
  }
  async list(limit=200): Promise<Checkpoint[]> {
    if(!Number.isInteger(limit)||limit<1||limit>5000)throw new Error(ui.errors.invalidRequestValue);
    if (!this.available) return [];
    let head = '';
    try { head = await this.value(['rev-parse','HEAD']); } catch { return []; }
    const lines = await this.value(['log','--all','--date-order',`-${limit}`,'--format=%H%x09%P%x09%ct%x09%s']);
    return lines.split('\n').filter(Boolean).map(line => {
      const [id, parents, time, ...label] = line.split('\t');
      return { id, parents: parents.split(' ').filter(Boolean), time: Number(time)*1000, label: label.join('\t'), active: id === head };
    });
  }
  private async known(id:string) {
    if(!/^[a-f0-9]{40,64}$/.test(id)||!(await this.value(['branch','--contains',id])).length)throw new Error(ui.errors.unknownCheckpoint);
  }
  async changes(id:string):Promise<CheckpointChange[]> {
    if(!this.available)return [];
    await this.known(id);
    // --no-renames keeps NUL-delimited filenames unambiguous, including tabs/newlines.
    const entries=(await this.git(['diff-tree','--root','--no-commit-id','--numstat','-r','-z','--no-renames',id,'--','.',':(exclude)'+interfaceFile,':(exclude).heavens-door/trash'])).split('\0').filter(Boolean);
    return entries.map(entry=>{const a=entry.indexOf('\t'),b=entry.indexOf('\t',a+1);return {path:entry.slice(b+1),added:entry.slice(0,a)==='-'?null:Number(entry.slice(0,a)),removed:entry.slice(a+1,b)==='-'?null:Number(entry.slice(a+1,b))};});
  }
  private async switchTo(id:string) {
    let content:string|null=null;
    try{content=await fs.readFile(join(this.root,interfaceFile),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const handle=await fs.open(this.journal,'wx');
    try{await handle.writeFile(JSON.stringify({content}));await handle.sync();}finally{await handle.close();}
    try {await this.git(['switch','-c',`history/${randomUUID()}`,id]);}
    finally {await this.recoverInterface();}
  }
  async restore(id: string) {
    await this.ready();await this.known(id);
    await this.checkpoint(ui.history.preserveWorkBeforeHistoryNavigation);
    await this.switchTo(id);
  }
  private async ancestor(a:string,b:string){try{await this.git(['merge-base','--is-ancestor',a,b]);return true;}catch(e){if((e as {code:number}).code===1)return false;throw e;}}
  // Temporary object/index work never puts conflicts into the live workspace.
  private async contentCommit(id:string,index:string){
    const env={GIT_INDEX_FILE:index};
    await this.git(['read-tree',id],env);
    await this.git(['update-index','--force-remove','--',interfaceFile],env);
    const tree=await this.value(['write-tree'],env);
    return this.value([...identity,'commit-tree',tree,'-m','Content merge input']);
  }
  async apply(source:string,target:string){
    await this.ready();await this.known(source);await this.known(target);
    if(await this.ancestor(source,target)||await this.ancestor(target,source))throw new Error(ui.errors.historyNotDiverged);
    const parents=(await this.value(['rev-list','--parents','-n','1',source])).split(' ').slice(1);
    if(parents.length!==1)throw new Error(ui.errors.historySingleParent);
    // Preserve unsaved working files without treating them as part of either chosen checkpoint.
    await this.checkpoint(ui.history.preserveWorkBeforeHistoryNavigation);
    const index=join(this.root,'.git','heavens-door-merge-'+randomUUID());
    try{
      const base=await this.contentCommit(parents[0],index),destination=await this.contentCommit(target,index),change=await this.contentCommit(source,index);
      let merged:string;
      try{merged=await this.value(['merge-tree','--write-tree',`--merge-base=${base}`,destination,change]);}
      catch(e){if((e as {code:number}).code===1)throw new Error(ui.errors.historyConflict,{cause:e});throw e;}
      const tree=merged.split('\n')[0];
      if(tree===await this.value(['rev-parse',destination+'^{tree}']))throw new Error(ui.errors.historyAlreadyApplied);
      const label=ui.history.applyLabel(await this.value(['show','-s','--format=%s',source]));
      const result=await this.value([...identity,'commit-tree',tree,'-p',target,'-m',label]);
      await this.switchTo(result);
      return result;
    }finally{await fs.rm(index,{force:true});}
  }
}
