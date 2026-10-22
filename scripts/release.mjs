import assert from 'node:assert/strict';
import {promises as fs,openSync,writeFileSync,renameSync,closeSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {bumpVersion} from './version.mjs';
import {atomicJSON,readRelease,assertFiles,verifyArtifacts,verifyDownloads,addChecksums,readChecksums,verifyRemote,verifyPublic} from './release-artifacts.mjs';

const readJSON=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const exists=async path=>{try{await fs.access(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function retry(work,{attempts=10,delay=5000,sleep=pause}={}){
  for(let i=0;;i++){try{return await work();}catch(error){if(i+1>=attempts)throw error;await sleep(delay);}}
}
export async function execute(program,args,{cwd,log,onChild}={}){
  const env={...process.env};delete env.HEAVENS_DOOR_TEST_BUILD;delete env.ELECTRON_RUN_AS_NODE;
  const output=log?openSync(log,'a',0o600):null;
  try{return await new Promise((resolve,reject)=>{
    const child=spawn(program,args,{cwd,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    if(child.pid)onChild?.(child.pid);
    child.stdout.on('data',chunk=>{if(output!==null)writeFileSync(output,chunk);else stdout+=chunk;});
    child.stderr.on('data',chunk=>{if(output!==null)writeFileSync(output,chunk);else stderr+=chunk;});
    child.once('error',reject);child.once('close',code=>code===0?resolve(stdout.trimEnd()):reject(Error(program+' '+args.join(' ')+' failed ('+code+'). '+(log?'See '+log:stderr||stdout))));
  });}finally{if(output!==null)closeSync(output);onChild?.(undefined);}
}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;return true;}}
export async function releaseLock(root,work){
  const folder=join(root,'.local/releases'),path=join(folder,'lock.json');await fs.mkdir(folder,{recursive:true});
  let handle;try{handle=await fs.open(path,'wx',0o600);}catch(error){if(error.code!=='EEXIST')throw error;const owner=await readJSON(path);throw Error([owner.pid,owner.child].some(alive)?'Another release command is running.':'A stopped release left a lock. Run npm run release -- unlock, then repeat the command.',{cause:error});}
  const owner={pid:process.pid,started:new Date().toISOString()};
  await handle.writeFile(JSON.stringify(owner));await handle.close();
  const child=pid=>{owner.child=pid;const temporary=path+'.'+process.pid+'.tmp';writeFileSync(temporary,JSON.stringify(owner),{mode:0o600});renameSync(temporary,path);};
  try{return await work(child);}finally{await fs.unlink(path);}
}
export async function unlock(root){
  const path=join(root,'.local/releases/lock.json'),owner=await readJSON(path);assert.ok(![owner.pid,owner.child].some(alive),'Release process or its build child is still running');await fs.unlink(path);
}
export class Release {
  constructor(root,{run=execute,request=fetch,platform=process.platform,say=console.log,sleep=pause}={}){
    this.root=resolve(root);this.run=run;this.request=request;this.platform=platform;this.say=say;this.sleep=sleep;
  }
  command(program,args,log){return this.run(program,args,{cwd:this.root,log,onChild:this.onChild});}
  git(...args){return this.command('git',args);}
  gh(...args){return this.command('gh',args);}
  async info(){return readRelease(this.root);}
  statePath(version){return join(this.root,'.local/releases',version,'state.json');}
  async load(){
    const info=await this.info(),state=await readJSON(this.statePath(info.version));
    assert.equal(state.schema,1,'Unsupported release checkpoint');assert.equal(state.version,info.version);assert.equal(state.buildNumber,info.buildNumber);assert.equal(state.repo,info.repo);assert.match(state.commit,/^[0-9a-f]{40}$/);
    return state;
  }
  async save(state){await atomicJSON(this.statePath(state.version),state);}
  async clean(){assert.equal(await this.git('status','--porcelain','--untracked-files=all'),'','Commit or stash source changes before releasing');}
  async pinned(state){await this.clean();assert.equal(await this.git('rev-parse','HEAD'),state.commit,'Source changed after prepare. Finish the changes, then prepare --next for a new candidate.');}
  async plan(kind='patch'){
    const current=await this.info(),next=bumpVersion(this.root,kind,true);this.say(JSON.stringify({current:current.version,next,...{repo:current.repo},commands:['prepare --notes <file>','stage','publish']},null,2));return next;
  }
  async prepare({notes,kind='patch',next=false}={}){
    const pendingPath=join(this.root,'.local/releases/pending.json');let pending;
    if(await exists(pendingPath))pending=await readJSON(pendingPath);
    else{
      const info=await this.info();
      if(!next&&await exists(this.statePath(info.version))){const state=await this.load();if(!state.steps.published){await this.pinned(state);this.say('Prepared '+info.tag+' already exists; run stage or publish to resume.');return state;}}
      await this.clean();assert.ok(notes,'Provide --notes <Markdown file>; prepare commits those notes with the version bump.');
      const body=await fs.readFile(resolve(this.root,notes),'utf8');assert.ok(body.trim(),'Release notes are empty');
      const to=bumpVersion(this.root,kind,true),base=await this.git('rev-parse','HEAD'),path='docs/releases/'+to.version+'.md';
      assert.equal(await this.git('tag','--list','v'+to.version),'','That release tag already exists');
      const original={};for(const name of ['package.json','package-lock.json'])original[name]=await fs.readFile(join(this.root,name),'utf8');
      const pkg=JSON.parse(original['package.json']),lock=JSON.parse(original['package-lock.json']);pkg.version=lock.version=lock.packages[''].version=to.version;pkg.buildNumber=to.buildNumber;
      const after={'package.json':JSON.stringify(pkg,null,2)+'\n','package-lock.json':JSON.stringify(lock,null,2)+'\n',[path]:body};
      assert.ok(!await exists(join(this.root,path))||(await fs.readFile(join(this.root,path),'utf8'))===body,'Release notes already exist with different contents');
      pending={schema:1,base,...to,repo:info.repo,notes:path,original,after};await atomicJSON(pendingPath,pending);
    }
    assert.equal(pending.schema,1);assert.match(pending.version,/^\d+\.\d+\.\d+$/);assert.match(pending.base,/^[0-9a-f]{40}$/);
    assert.equal(pending.notes,'docs/releases/'+pending.version+'.md');assert.deepEqual(Object.keys(pending.after).sort(),['package-lock.json','package.json',pending.notes].sort());
    const head=await this.git('rev-parse','HEAD'),names=Object.keys(pending.after);
    for(const [path,after] of Object.entries(pending.after)){
      const actual=await exists(join(this.root,path))?await fs.readFile(join(this.root,path),'utf8'):undefined;
      assert.ok(actual===after||actual===pending.original[path],'Prepared file was edited: '+path);
    }
    if(head===pending.base){
      const changes=(await this.git('status','--porcelain','--untracked-files=all')).split('\n').filter(Boolean).map(line=>line.slice(3));
      assert.ok(changes.every(path=>names.includes(path)),'Other files changed during prepare');
      for(const [index,[path,content]] of Object.entries(pending.after).entries()){await fs.mkdir(dirname(join(this.root,path)),{recursive:true});const temporary=join(this.root,'.local/releases/prepare-'+index+'.tmp');await fs.writeFile(temporary,content);await fs.rename(temporary,join(this.root,path));}
      await this.git('add','--',...names);await this.git('commit','-m',"Release Heaven's Door "+pending.version);
    }else{
      assert.equal(await this.git('rev-parse','HEAD^'),pending.base,'Source moved during prepare');
      assert.equal(await this.git('log','-1','--format=%s'),"Release Heaven's Door "+pending.version,'Unexpected preparation commit');
    }
    for(const [path,content] of Object.entries(pending.after))assert.equal(await fs.readFile(join(this.root,path),'utf8'),content);
    await this.clean();const state={schema:1,version:pending.version,buildNumber:pending.buildNumber,repo:pending.repo,commit:await this.git('rev-parse','HEAD'),notes:pending.notes,steps:{prepared:{at:new Date().toISOString()}}};
    await this.save(state);await fs.unlink(pendingPath);this.say('Prepared v'+state.version+' at '+state.commit);return state;
  }
  async step(state,name,work){
    await this.pinned(state);
    if(state.steps[name]){if(state.steps[name].files)await assertFiles(join(this.root,'release'),state.steps[name].files);this.say('✓ '+name+' (checkpoint)');return;}
    this.say('Running '+name+'…');const result=await work();await this.pinned(state);
    state.steps[name]={at:new Date().toISOString(),...(result&&typeof result==='object'?result:{})};await this.save(state);this.say('✓ '+name);
  }
  async releases(info){
    const pages=JSON.parse(await this.gh('api','--paginate','--slurp','repos/'+info.repo+'/releases?per_page=100'));assert.ok(Array.isArray(pages));return pages.flat();
  }
  async remote(info){return (await this.releases(info)).find(release=>release.tag_name==='v'+info.version);}
  async origin(info){
    const url=await this.git('remote','get-url','--push','origin'),repo=url.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];
    assert.equal(repo,info.repo,'origin does not match the configured release repository');
  }
  async newer(info,{allowCurrent=false}={}){
    let latest;try{latest=JSON.parse(await this.gh('api','repos/'+info.repo+'/releases/latest'));}catch(error){if(!/HTTP 404/.test(error.message))throw error;return;}
    const previous=latest.tag_name?.replace(/^v/,'');assert.match(previous,/^\d+\.\d+\.\d+$/,'Unexpected latest release version');
    const a=info.version.split('.').map(BigInt),b=previous.split('.').map(BigInt);let order=0;for(let i=0;i<3&&!order;i++)order=a[i]>b[i]?1:a[i]<b[i]?-1:0;
    assert.ok(order>0||allowCurrent&&order===0,'Refuse to replace or downgrade the latest published version');
  }
  async waitCI(state){
    for(let attempt=0;attempt<60;attempt++){
      const runs=JSON.parse(await this.gh('run','list','--workflow','ci.yml','--commit',state.commit,'--limit','10','--json','headSha,status,conclusion,url'));
      const run=runs.find(run=>run.headSha===state.commit);
      if(run?.status==='completed'){assert.equal(run.conclusion,'success','Source CI did not pass: '+run.url);return run.url;}
      if(attempt===0)this.say('Waiting for source CI at '+state.commit);await this.sleep(15000);
    }
    throw Error('Source CI did not finish within 15 minutes. Repeat stage to resume.');
  }
  async draft(info,notes){
    await this.tagged(info,{required:false});let release=await this.remote(info);
    if(!release){await this.gh('release','create','v'+info.version,'--draft','--title',"Heaven's Door "+info.version,'--target',info.commit,'--notes-file',notes);release=await this.remote(info);}
    assert.ok(release,'Draft creation did not finish; repeat the command');assert.equal(release.draft,true,'Published releases are immutable');assert.equal(release.target_commitish,info.commit,'Draft belongs to another commit');
    assert.equal((release.body??'').trimEnd(),(await fs.readFile(notes,'utf8')).trimEnd(),'Draft notes differ from the committed notes');return release;
  }
  async upload(info,files){
    const release=await this.remote(info);assert.equal(release?.draft,true,'Published releases are immutable');assert.equal(release.target_commitish,info.commit);
    assert.ok(release.assets.every(a=>files.some(file=>file.name===a.name)),'Unexpected draft asset; inspect it before continuing');
    const missing=[];
    for(const file of files){
      const asset=release.assets.find(a=>a.name===file.name);
      if(!asset){missing.push(join(this.root,'release',file.path));continue;}
      if(asset.state==='starter'){await this.gh('release','delete-asset','v'+info.version,file.name,'--yes');missing.push(join(this.root,'release',file.path));continue;}
      assert.equal(asset.state,'uploaded','Upload is still active: '+file.name);assert.equal(asset.size,file.size,'Draft asset size differs: '+file.name);assert.equal(asset.digest,'sha256:'+file.sha256,'Draft asset differs; never overwrite it blindly: '+file.name);
    }
    if(missing.length)await this.gh('release','upload','v'+info.version,...missing);
    verifyRemote(await this.remote(info),{...info,tag:'v'+info.version},files);
  }
  async stage(){
    const state=await this.load();await this.pinned(state);assert.equal(this.platform,'darwin','The local release driver requires macOS; use GitHub Release builds on other systems');await this.origin(state);await this.gh('auth','status');
    const remote=await this.remote(state);assert.ok(!remote||remote.draft,'This version is already published. Use verify-public.');await this.newer(state);
    const logs=join(this.root,'.local/releases',state.version);await fs.mkdir(logs,{recursive:true});
    await this.step(state,'checks',()=>this.command('npm',['run','check'],join(logs,'checks.log')));
    await this.step(state,'sparkle',()=>this.command('npm',['run','test:sparkle'],join(logs,'sparkle.log')));
    await this.step(state,'mac',async()=>{
      await this.command('npm',['run','package:mac','--','--universal'],join(logs,'mac.log'));await this.command('npm',['run','sparkle:appcast'],join(logs,'mac.log'));
      return {files:(await verifyArtifacts(this.root,'mac')).files};
    });
    await this.step(state,'win',async()=>{await this.command('npm',['run','package:win','--','--x64'],join(logs,'win.log'));return {files:(await verifyArtifacts(this.root,'win')).files};});
    await this.step(state,'verified',async()=>{const report=await addChecksums(this.root,await verifyArtifacts(this.root));return {files:report.files};});
    await this.git('push','origin',state.commit+':refs/heads/main');
    state.steps.ci={at:new Date().toISOString(),url:await this.waitCI(state)};await this.save(state);
    const notes=join(this.root,state.notes);await this.draft(state,notes);await this.upload(state,state.steps.verified.files);
    state.steps.staged={at:new Date().toISOString()};await this.save(state);this.say('Draft verified. Review '+state.notes+', then run npm run release -- publish.');return state;
  }
  async tagged(state,{required=true}={}){
    const lines=(await this.git('ls-remote','--tags','origin','refs/tags/v'+state.version,'refs/tags/v'+state.version+'^{}')).split('\n').filter(Boolean),line=lines.find(line=>line.endsWith('^{}'))??lines[0];
    if(line||required)assert.equal(line?.split(/\s/)[0],state.commit,'Release tag points to a different commit');
  }
  async publish(){
    const state=await this.load();await this.pinned(state);await this.origin(state);
    for(const step of ['checks','sparkle','mac','win','verified','ci','staged'])assert.ok(state.steps[step],'Missing release checkpoint: '+step+'. Run stage first.');
    const files=state.steps.verified.files;await assertFiles(join(this.root,'release'),files);
    const info={...await this.info(),commit:state.commit};let release=await this.remote(state);assert.ok(release,'Draft missing. Repeat stage.');await this.newer(state,{allowCurrent:!release.draft});await this.waitCI(state);
    await this.tagged(state,{required:false});
    if(release.draft){await this.draft(state,join(this.root,state.notes));verifyRemote(release,info,files);await this.gh('release','edit',info.tag,'--draft=false','--latest');}
    release=await this.remote(state);verifyRemote(release,info,files,{published:true});await this.tagged(state);
    state.steps.published={at:new Date().toISOString(),url:release.html_url};await this.save(state);
    await retry(()=>verifyPublic(info,files,this.request),{sleep:this.sleep});
    state.steps.public={at:new Date().toISOString()};await this.save(state);this.say('Published and publicly verified: '+release.html_url);return state;
  }
  async status(){
    const info=await this.info();if(!await exists(this.statePath(info.version))){this.say('No release candidate for '+info.tag+'. Use plan, then prepare.');return;}
    const state=await this.load();this.say(JSON.stringify({version:state.version,build:state.buildNumber,commit:state.commit,checkpoints:Object.keys(state.steps),logs:dirname(this.statePath(info.version)),next:state.steps.public?'done':state.steps.staged?'publish':'stage'},null,2));return state;
  }
  async ciPlan(){
    const info=await this.info();if(process.env.GITHUB_REF_TYPE==='tag')assert.equal(process.env.GITHUB_REF_NAME,info.tag,'Tag and package version differ');
    const release=await this.remote(info),build=!release||release.draft;
    if(build)assert.equal(process.env.HAS_SPARKLE_KEY,'true','Set SPARKLE_PRIVATE_KEY for hosted release builds, or use the local Keychain release driver.');
    if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'build='+build+'\n');
    this.say(build?'Build this candidate.':'Published release already exists; skip duplicate packaging.');return build;
  }
  async ciDraft(){
    assert.equal(process.env.GITHUB_ACTIONS,'true','ci-draft is reserved for the Release workflow');
    const info={...await this.info(),commit:await this.git('rev-parse','HEAD')};assert.equal(process.env.GITHUB_SHA,info.commit);assert.equal(process.env.GITHUB_REF_NAME,info.tag);await this.origin(info);
    const report=await addChecksums(this.root,await verifyDownloads(this.root)),notes=join(this.root,'docs/releases',info.version+'.md');
    const existing=await this.remote(info);
    if(existing&&!existing.draft){verifyRemote(existing,info,report.files,{published:true});await this.tagged(info);this.say('This release was already published; verified without changes.');return;}
    await this.draft(info,notes);await this.upload(info,report.files);this.say('CI draft uploaded and verified. Publish only after release review.');
  }
}
export async function main(root,args=process.argv.slice(2)){
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{notes:{type:'string'},kind:{type:'string'},next:{type:'boolean'},platform:{type:'string'},help:{type:'boolean'}}}),command=positionals[0]??'status';
  assert.equal(positionals.length<=1,true,'Unexpected release arguments');
  const release=new Release(root),platform=values.platform??'all';
  if(values.help){console.log('release plan | prepare --notes <file> [--kind patch|minor|major] [--next] | stage | publish | status | verify [--platform all|mac|win] | verify-public | unlock');return;}
  if(command==='plan')return release.plan(values.kind);
  if(command==='status')return release.status();
  if(command==='unlock')return unlock(root);
  if(command==='verify'){const report=await verifyArtifacts(root,platform);console.log('Verified '+report.tag+' '+platform+' artifacts.');return report;}
  if(command==='verify-public'){
    const report=await readChecksums(root,await verifyDownloads(root));await retry(()=>verifyPublic(report,report.files));console.log('Public release verified: '+report.tag);return;
  }
  if(command==='ci-plan')return release.ciPlan();
  if(command==='ci-draft')return release.ciDraft();
  assert.ok(['prepare','stage','publish'].includes(command),'Unknown release command: '+command);
  return releaseLock(root,async onChild=>{release.onChild=onChild;return command==='prepare'?release.prepare({notes:values.notes,kind:values.kind,next:values.next}):release[command]();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.cwd()).catch(error=>{console.error(error.message);process.exitCode=1;});
}
