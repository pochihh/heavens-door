import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join,basename} from 'node:path';
import {parse} from 'yaml';
import {Release,execute,releaseLock,unlock,retry} from '../scripts/release.mjs';
import {readRelease,describeFiles} from '../scripts/release-artifacts.mjs';
import {fixture,remote,checkpointFiles,publicRequest} from './release-fixture.mjs';

async function repository(t){
  const result=await fixture(t),{root}=result,git=(...args)=>execute('git',args,{cwd:root});
  await git('init','-b','main');await git('config','user.name','Release test');await git('config','user.email','release@example.invalid');
  await git('add','.');await git('commit','-m','Initial source');await fs.mkdir(join(root,'.local'),{recursive:true});await fs.writeFile(join(root,'.local/notes.md'),'Release notes\n');
  return {...result,git,driver:new Release(root,{say:()=>{}})};
}
test('prepare previews, bumps and commits exactly once; repeating resumes the same candidate',async t=>{
  const {root,git,driver}=await repository(t),before=await git('rev-parse','HEAD');
  assert.equal((await driver.plan()).version,'0.1.27');assert.equal((await readRelease(root)).version,'0.1.2');
  const state=await driver.prepare({notes:'.local/notes.md'});assert.equal(state.version,'0.1.27');assert.equal(state.buildNumber,2);
  assert.equal(await git('rev-parse','HEAD^'),before);assert.equal(await git('status','--porcelain'),'');
  assert.equal((await driver.prepare()).commit,state.commit);assert.equal(await git('rev-list','--count','HEAD'),'2');
  assert.equal((await readRelease(root)).version,'0.1.27');
  await fs.writeFile(join(root,'another.md'),'unfinished');await assert.rejects(driver.prepare(),/Commit or stash/);
});
test('prepare recovers after a failed commit without a second bump or lost notes',async t=>{
  const {root,git}=await repository(t);let failed=false;
  const driver=new Release(root,{say:()=>{},run:(program,args,options)=>{
    if(program==='git'&&args[0]==='commit'&&!failed){failed=true;throw Error('simulated commit hook failure');}return execute(program,args,options);
  }});
  await assert.rejects(driver.prepare({notes:'.local/notes.md'}),/hook failure/);assert.equal((await readRelease(root)).version,'0.1.27');
  await fs.access(join(root,'.local/releases/pending.json'));const state=await driver.prepare();assert.equal(state.version,'0.1.27');assert.equal(await git('rev-list','--count','HEAD'),'2');
  assert.equal(await fs.readFile(join(root,state.notes),'utf8'),'Release notes\n');await assert.rejects(fs.access(join(root,'.local/releases/pending.json')));
});
test('prepare blocks unrelated edits during recovery and refuses a dirty initial source',async t=>{
  const {root,driver}=await repository(t);await fs.writeFile(join(root,'unfinished.md'),'draft');
  await assert.rejects(driver.prepare({notes:'.local/notes.md'}),/Commit or stash/);assert.equal((await readRelease(root)).version,'0.1.2');await fs.rm(join(root,'unfinished.md'));
  driver.run=(program,args,options)=>program==='git'&&args[0]==='commit'?Promise.reject(Error('interrupted')):execute(program,args,options);
  await assert.rejects(driver.prepare({notes:'.local/notes.md'}),/interrupted/);
  await fs.writeFile(join(root,'another.md'),'user work');await assert.rejects(driver.prepare(),/Other files/);assert.equal(await fs.readFile(join(root,'another.md'),'utf8'),'user work');
});
test('checkpoint recovery skips completed work, detects changed artifacts and rejects another commit',async t=>{
  const {root,git,driver}=await repository(t),state=await driver.prepare({notes:'.local/notes.md'});let calls=0;
  await assert.rejects(driver.step(state,'sample',()=>{calls++;throw Error('build failed');}),/build failed/);assert.equal(state.steps.sample,undefined);
  await fs.mkdir(join(root,'release'),{recursive:true});await fs.writeFile(join(root,'release/app.zip'),'archive');
  const work=async()=>{calls++;return {files:await describeFiles(join(root,'release'),['app.zip'])};};
  await driver.step(state,'sample',work);await driver.step(await driver.load(),'sample',work);assert.equal(calls,2);
  await fs.writeFile(join(root,'release/app.zip'),'changed');await assert.rejects(driver.step(state,'sample',work),/changed/);
  await git('commit','--allow-empty','-m','New source');await assert.rejects(driver.pinned(state),/Source changed/);
});
test('release lock prevents concurrent operations and refuses to unlock a surviving build child',async t=>{
  const {root}=await fixture(t);await releaseLock(root,async()=>{await assert.rejects(releaseLock(root,()=>{}),/Another release/);await assert.rejects(unlock(root),/still running/);});
  const path=join(root,'.local/releases/lock.json');await fs.writeFile(path,JSON.stringify({pid:2147483647,child:process.pid}));
  await assert.rejects(unlock(root),/still running/);await fs.writeFile(path,JSON.stringify({pid:2147483647}));await assert.rejects(releaseLock(root,()=>{}),/stopped release/);await unlock(root);await releaseLock(root,()=>{});
});
test('uploads resume missing files, clean failed starters and never clobber changed or published assets',async t=>{
  const {root,info}=await fixture(t),files=await checkpointFiles(root,info.version),candidate={...info,commit:'a'.repeat(40)};
  let draft=remote(candidate,files),fail=true;draft.assets=[draft.assets[0],{...draft.assets[1],state:'starter'}];const commands=[];
  const driver=new Release(root,{say:()=>{},run:async(program,args)=>{
    assert.equal(program,'gh');commands.push(args);
    if(args[0]==='api')return JSON.stringify([[draft]]);
    if(args[1]==='delete-asset'){draft.assets=draft.assets.filter(a=>a.name!==args[3]);return '';}
    if(args[1]==='upload'){
      const paths=args.slice(3);for(const path of paths){const file=files.find(f=>f.name===basename(path));draft.assets.push(remote(candidate,[file]).assets[0]);if(fail){fail=false;throw Error('connection lost');}}return '';
    }throw Error('Unexpected command');
  }});
  await assert.rejects(driver.upload(candidate,files),/connection lost/);await driver.upload(candidate,files);assert.equal(draft.assets.length,files.length);
  assert.equal(commands.filter(a=>a[1]==='delete-asset').length,1);assert.equal(commands.filter(a=>a[1]==='upload')[1].length-3,files.length-2);assert.ok(commands.every(a=>!a.includes('--clobber')));
  draft.assets[0].digest='sha256:changed';await assert.rejects(driver.upload(candidate,files),/never overwrite/);
  draft=remote(candidate,files,{published:true});await assert.rejects(driver.upload(candidate,files),/immutable/);
});
test('CI must pass for the exact prepared SHA, with failures and timeouts stopping the release',async t=>{
  const {root}=await fixture(t),commit='a'.repeat(40);let count=0;
  const driver=new Release(root,{say:()=>{},sleep:async()=>{},run:async()=>JSON.stringify(++count===1?[{headSha:'b'.repeat(40),status:'completed',conclusion:'success'}]:[{headSha:commit,status:'completed',conclusion:'success',url:'passed'}])});
  assert.equal(await driver.waitCI({commit}),'passed');assert.equal(count,2);
  driver.run=async()=>JSON.stringify([{headSha:commit,status:'completed',conclusion:'failure',url:'failed'}]);await assert.rejects(driver.waitCI({commit}),/did not pass/);
  driver.run=async()=>'[]';await assert.rejects(driver.waitCI({commit}),/15 minutes/);
});
test('tag preflight skips a published release without a CI signing secret',async t=>{
  const {root,info}=await fixture(t),driver=new Release(root,{say:()=>{},run:async()=>JSON.stringify([[remote(info,[],{published:true})]])});
  const saved={...process.env};t.after(()=>{for(const key of ['GITHUB_REF_TYPE','GITHUB_REF_NAME','HAS_SPARKLE_KEY','GITHUB_OUTPUT']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
  process.env.GITHUB_REF_TYPE='tag';process.env.GITHUB_REF_NAME=info.tag;process.env.HAS_SPARKLE_KEY='false';process.env.GITHUB_OUTPUT=join(root,'output');
  assert.equal(await driver.ciPlan(),false);assert.equal(await fs.readFile(join(root,'output'),'utf8'),'build=false\n');
  driver.run=async()=>'[[]]';await assert.rejects(driver.ciPlan(),/SPARKLE_PRIVATE_KEY/);process.env.GITHUB_REF_NAME='v9.0.2';await assert.rejects(driver.ciPlan(),/Tag and package/);
});
test('publish gates all checkpoints and resumes after publication when public propagation fails',async t=>{
  const {root,info}=await fixture(t),files=await checkpointFiles(root,info.version),commit='a'.repeat(40),notes='Release notes';
  await fs.writeFile(join(root,'notes.md'),notes);
  const state={...info,schema:1,commit,notes:'notes.md',steps:{}};let draft=remote({...info,commit},files),edits=0,saves=0,tagValid=true;
  const request=publicRequest(root,info,files),driver=new Release(root,{say:()=>{},sleep:async()=>{},request:async()=>new Response('unavailable',{status:503}),run:async(program,args)=>{
    if(program==='gh'&&args[1]==='edit'){edits++;draft.draft=false;return '';}throw Error('Unexpected mutation');
  }});
  driver.load=async()=>state;driver.save=async()=>{saves++;};driver.pinned=async()=>{};driver.origin=async()=>{};driver.remote=async()=>structuredClone(draft);driver.newer=async()=>{};driver.waitCI=async()=>{};driver.tagged=async()=>{assert.ok(tagValid,'Wrong tag');};
  await assert.rejects(driver.publish(),/Missing release checkpoint/);assert.equal(edits,0);
  for(const name of ['checks','sparkle','mac','win','verified','ci','staged'])state.steps[name]={at:'now'};state.steps.verified.files=files;
  tagValid=false;await assert.rejects(driver.publish(),/Wrong tag/);assert.equal(edits,0);tagValid=true;
  await assert.rejects(driver.publish(),/unavailable/);assert.equal(edits,1);assert.ok(state.steps.published);assert.equal(state.steps.public,undefined);
  driver.request=request;await driver.publish();assert.equal(edits,1);assert.ok(state.steps.public);assert.ok(saves>=3);
  await fs.appendFile(join(root,'release',files[0].path),'tamper');await assert.rejects(driver.publish(),/changed/);assert.equal(edits,1);
});
test('release workflow gates packaging, verifies both platforms and only uploads a draft',async()=>{
  const workflow=parse(await fs.readFile(new URL('../.github/workflows/release.yml',import.meta.url),'utf8'));
  assert.equal(workflow.jobs.build.needs,'plan');assert.match(workflow.jobs.build.if,/needs.plan.outputs.build/);
  assert.ok(workflow.jobs.plan.steps.some(step=>step.run==='node scripts/release.mjs ci-plan'));
  assert.ok(workflow.jobs.build.steps.some(step=>step.run?.includes('release -- verify --platform')));
  assert.ok(workflow.jobs.draft.steps.some(step=>step.run==='npm run release -- ci-draft'));
  assert.ok(!JSON.stringify(workflow).includes('--clobber'));assert.ok(!JSON.stringify(workflow).includes('--draft=false'));
});
test('bounded retries recover transient failures and stop without an infinite retry',async()=>{
  let calls=0;assert.equal(await retry(()=>{if(++calls<3)throw Error('temporary');return 'ready';},{sleep:async()=>{}}),'ready');assert.equal(calls,3);
  calls=0;await assert.rejects(retry(()=>{calls++;throw Error('persistent');},{attempts:2,sleep:async()=>{}}),/persistent/);assert.equal(calls,2);
});

test('prepare recovers after its commit and can explicitly replace an abandoned candidate after a source fix',async t=>{
  const {root,git,driver}=await repository(t);const save=driver.save.bind(driver);let failed=false;
  driver.save=state=>{if(!failed){failed=true;throw Error('checkpoint interrupted');}return save(state);};
  await assert.rejects(driver.prepare({notes:'.local/notes.md'}),/checkpoint interrupted/);assert.equal(await git('rev-list','--count','HEAD'),'2');
  const recovered=await driver.prepare();assert.equal(recovered.version,'0.1.27');assert.equal(await git('rev-list','--count','HEAD'),'2');
  await fs.writeFile(join(root,'fix.md'),'Fixed source');await git('add','fix.md');await git('commit','-m','Fix failed candidate');
  await assert.rejects(driver.prepare(),/Source changed/);
  const replacement=await driver.prepare({next:true,notes:'.local/notes.md'});assert.equal(replacement.version,'0.1.271');assert.equal(replacement.buildNumber,3);
  assert.equal(JSON.parse(await fs.readFile(driver.statePath(recovered.version))).commit,recovered.commit);assert.equal(await git('status','--porcelain'),'');
});
test('repository, version ordering and existing tags are checked before release mutations',async t=>{
  const {root,info}=await fixture(t),driver=new Release(root,{say:()=>{},run:async()=> 'git@github.com:example/door.git'});
  await driver.origin(info);driver.run=async()=> 'https://github.com/another/repo.git';await assert.rejects(driver.origin(info),/origin does not match/);
  driver.run=async()=>JSON.stringify({tag_name:'v0.1.27'});await assert.rejects(driver.newer(info),/downgrade/);
  driver.run=async()=>JSON.stringify({tag_name:info.tag});await assert.rejects(driver.newer(info),/replace/);await driver.newer(info,{allowCurrent:true});
  const candidate={...info,commit:'a'.repeat(40)};driver.run=async()=> 'b'.repeat(40)+'\trefs/tags/'+info.tag;
  await assert.rejects(driver.tagged(candidate,{required:false}),/different commit/);
  driver.run=async()=>'';await driver.tagged(candidate,{required:false});await assert.rejects(driver.tagged(candidate),/different commit/);
});
