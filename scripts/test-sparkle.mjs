// Local packaged-app test: no releases or personal workspaces are touched.
import assert from 'node:assert/strict';
import {promises as fs,createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {Transform} from 'node:stream';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build as buildRenderer} from 'vite';
import {readSigningKey} from './sparkle-appcast.mjs';
import base from '../electron-builder.config.mjs';

if(process.platform!=='darwin')throw new Error('The Sparkle integration test requires macOS.');
const root=process.cwd(),signingKey=readSigningKey(root,base.mac.extendInfo.SUPublicEDKey),folder=await fs.mkdtemp(join(tmpdir(),'heavens-sparkle-'));
const events=join(folder,'events.jsonl'),notes=join(folder,'workspace'),userData=join(folder,'user-data');
await fs.mkdir(notes);await fs.mkdir(userData);
const run=(command,args,options={})=>new Promise((resolve,reject)=>{
  const {input,...spawnOptions}=options;const child=spawn(command,args,{cwd:root,stdio:input?['pipe','inherit','inherit']:'inherit',...spawnOptions});if(input)child.stdin.end(input);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${command} failed (${code}).`)));
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(predicate,label,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await predicate();if(value)return value;await pause(100);}throw new Error('Timed out: '+label);};
let corrupt=false,archive;
const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/latest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({tag_name:'v0.1.27'}));return;}
    if(req.url==='/appcast.xml'){res.setHeader('Content-Type','application/xml');res.end(await fs.readFile(join(folder,'feed','appcast.xml')));return;}
    if(req.url?.endsWith('.zip')&&archive){res.setHeader('Content-Length',(await fs.stat(archive)).size);const stream=createReadStream(archive);if(corrupt){let first=true;stream.pipe(new Transform({transform(chunk,encoding,callback){if(first){chunk[0]^=1;first=false;}callback(null,chunk);}})).pipe(res);}else stream.pipe(res);return;}
    res.statusCode=404;res.end();
  }catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const renderer=join(folder,'renderer-dist');
await buildRenderer({configFile:join(root,'vite.config.ts'),plugins:[{name:'sparkle-test-session',transform(code,id){if(id.endsWith('/src/renderer/main.tsx'))return code+'\nwindow.__sparkleTestSession=session;';}}],build:{outDir:renderer,emptyOutDir:true}});
const probe=`
const {app}=require('electron');
const testFS=require('node:fs');
const testWrite=value=>testFS.appendFileSync(${JSON.stringify(events)},JSON.stringify({...value,version:app.getVersion()})+'\\n');
const testWait=async(fn,label)=>{const end=Date.now()+120000;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out '+label);};
const testQuit=()=>{for(const d of desktops.values())d.closing=true;app.quit();};
app.whenReady().then(async()=>{
  try{
    await testWait(()=>updates&&desktops.size,'startup');
    testWrite({phase:'launched',canInstall:updates.state.canInstall});
    if(app.getVersion()==='0.1.27'){
      const one=testFS.readFileSync(${JSON.stringify(join(notes,'one.md'))},'utf8'),two=testFS.readFileSync(${JSON.stringify(join(notes,'two.md'))},'utf8');
      if(!one.includes('Saved window one before update')||!two.includes('Saved window two before update'))throw Error('Drafts were lost');
      testWrite({phase:'updated',savedBoth:true});testQuit();return;
    }
    const first=[...desktops.values()][0];
    const js=(win,code)=>win.webContents.executeJavaScript(code,true);
    const ready=win=>testWait(()=>js(win,'!!window.__sparkleTestSession?.state.snapshot'),'renderer');
    await ready(first.window);
    const check=await js(first.window,'window.door.checkUpdates()');
    if(check.status!=='available'||!check.canInstall)throw Error('Sparkle not available '+JSON.stringify(check));
    const download=await js(first.window,'window.door.downloadUpdate()');
    if(process.env.HEAVENS_SPARKLE_TEST_CASE==='corrupt'){
      if(download.status!=='error')throw Error('Tampered archive accepted '+JSON.stringify(download));
      testWrite({phase:'rejected',message:download.message});testQuit();return;
    }
    if(download.status!=='ready')throw Error('Download failed '+JSON.stringify(download));
    await createWindow(${JSON.stringify(notes)});const second=[...desktops.values()].find(d=>d!==first);await ready(second.window);
    for(const path of ['one.md','two.md'])await first.host.call({kind:'create',folder:'',stem:path.slice(0,-3),x:0,y:0});
    await js(first.window,"(async()=>{const s=window.__sparkleTestSession;await s.select('one.md');s.edit('Saved window one before update');})()");
    await js(second.window,"(async()=>{const s=window.__sparkleTestSession;await s.select('two.md');s.edit('Saved window two before update');})()");
    const original=testFS.readFileSync(${JSON.stringify(join(notes,'one.md'))},'utf8');
    testFS.writeFileSync(${JSON.stringify(join(notes,'one.md'))},original+'\\nExternal edit');
    await js(first.window,'window.door.installUpdate()');
    await testWait(()=>updates.state.status==='ready'&&updates.state.message,'save-conflict cancellation');
    if(!testFS.readFileSync(${JSON.stringify(join(notes,'one.md'))},'utf8').includes('External edit'))throw Error('External edit overwritten');
    testWrite({phase:'save-conflict-cancelled'});
    testFS.writeFileSync(${JSON.stringify(join(notes,'one.md'))},original);
    await js(first.window,"window.__sparkleTestSession.edit('Saved window one before update')");
    await js(second.window,"window.__sparkleTestSession.edit('Saved window two before update')");
    testWrite({phase:'install-requested'});await js(first.window,'window.door.installUpdate()');
  }catch(error){testWrite({phase:'failed',message:String(error)});console.error(error);testQuit();}
});
`;
async function fixture(version,build,target){
  const project=join(folder,'source-'+build),output=join(folder,'release-'+build);await fs.mkdir(project);
  const pkg=JSON.parse(await fs.readFile(join(root,'package.json'),'utf8'));pkg.version=version;pkg.buildNumber=build;
  await fs.writeFile(join(project,'package.json'),JSON.stringify(pkg));await fs.symlink(join(root,'node_modules'),join(project,'node_modules'));
  await fs.cp(join(root,'dist'),join(project,'dist'),{recursive:true});await fs.cp(renderer,join(project,'dist/renderer'),{recursive:true});
  let main=await fs.readFile(join(project,'dist/main.cjs'),'utf8');main=main.replaceAll('https://api.github.com/repos/pochihh/heavens-door/releases/latest',origin+'/latest');
  await fs.writeFile(join(project,'dist/main.cjs'),`process.on('uncaughtException',error=>{console.error(error);require('electron').app.exit(1);});require('electron').app.setPath('userData',${JSON.stringify(userData)});process.env.HEAVENS_DOOR_WORKSPACE=${JSON.stringify(notes)};\n`+main+probe);
  const configFile=join(project,'sparkle.json');await fs.writeFile(configFile,JSON.stringify({feedUrl:origin+'/appcast.xml',publicEdKey:base.mac.extendInfo.SUPublicEDKey}));
  const config={...base,appId:'com.pochihh.heavens-door.sparkle-test',productName:'Heavens Door Sparkle Test',buildVersion:build+'.0.0',extraMetadata:{version,buildNumber:build},compression:'store',files:[{from:join(project,'dist'),to:'dist'},'package.json','!dist/**/*.map',...base.files.filter(file=>typeof file==='string'&&file.startsWith('!**/'))],directories:{app:root,output,buildResources:join(root,'build')},extraResources:[{from:join(root,'build/icon.png'),to:'icon.png'},{from:configFile,to:'sparkle.json'}],mac:{...base.mac,icon:join(root,'build/icon.icns'),identity:'-',hardenedRuntime:false,notarize:false,entitlements:join(root,'build/entitlements.mac.plist'),entitlementsInherit:join(root,'build/entitlements.mac.plist'),extraFiles:base.mac.extraFiles.map(file=>({...file,from:join(root,file.from)})),extendInfo:{...base.mac.extendInfo,SUFeedURL:origin+'/appcast.xml',NSAppTransportSecurity:{NSAllowsArbitraryLoads:true}}}};
  const path=join(project,'builder.json');await fs.writeFile(path,JSON.stringify(config));
  await run(process.execPath,[join(root,'node_modules/electron-builder/out/cli/cli.js'),'--projectDir',root,'--config',path,'--mac',target,'--arm64','--publish','never']);
  return {output,bundle:join(output,'mac-arm64/Heavens Door Sparkle Test.app')};
}
const report=[];
try{
  const old=await fixture('0.1.2',1,'dir'),next=await fixture('0.1.27',2,'zip');
  await run('/usr/bin/codesign',['--verify','--deep','--strict',old.bundle]);await run('/usr/bin/codesign',['--verify','--deep','--strict',next.bundle]);
  const feed=join(folder,'feed');await fs.mkdir(feed);const name=(await fs.readdir(next.output)).find(file=>file.endsWith('.zip'));archive=join(feed,name);await fs.copyFile(join(next.output,name),archive);
  await run(join(root,'node_modules/electron-sparkle-updater/native/vendor/bin/generate_appcast'),['--ed-key-file','-','--download-url-prefix',origin+'/','--maximum-deltas','0',feed],{input:signingKey});
  const readEvents=async()=>{try{return (await fs.readFile(events,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}};
  for(const mode of ['corrupt','valid']){
    corrupt=mode==='corrupt';const log=await fs.open(join(folder,mode+'.log'),'w');
    const testEnv={...process.env,HEAVENS_SPARKLE_TEST_CASE:mode};delete testEnv.SPARKLE_PRIVATE_KEY;
    const child=spawn(join(old.bundle,'Contents/MacOS/Heavens Door Sparkle Test'),[],{env:testEnv,stdio:['ignore',log.fd,log.fd]});
    try{
      const rows=await wait(async()=>{if(child.exitCode!==null&&child.exitCode!==0)throw Error('Test app exited before finishing ('+child.exitCode+').');const rows=await readEvents();const failed=rows.find(row=>row.phase==='failed');if(failed)throw Error(failed.message);return rows.some(row=>row.phase===(mode==='corrupt'?'rejected':'updated'))?rows:false;},mode+' native update',180000);
      report.push(...rows);await pause(500);
    }catch(error){console.error(await fs.readFile(join(folder,mode+'.log'),'utf8'));throw error;}
    finally{if(child.exitCode===null)child.kill('SIGTERM');await log.close();}
  }
  const rows=await readEvents();assert.ok(rows.some(row=>row.phase==='rejected'));assert.ok(rows.some(row=>row.phase==='save-conflict-cancelled'));assert.ok(rows.some(row=>row.phase==='updated'&&row.version==='0.1.27'&&row.savedBoth));
  await fs.mkdir(join(root,'.local'),{recursive:true});await fs.writeFile(join(root,'.local/sparkle-test-report.json'),JSON.stringify({testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,events:rows},null,2)+'\n');
  console.log('PASS: tampered archive rejected; conflicting save cancelled; two windows saved; 0.1.2 updated and relaunched as 0.1.27.');
  await fs.rm(folder,{recursive:true,force:true});
}catch(error){console.error('Sparkle test files retained at '+folder);throw error;}
finally{server.closeAllConnections();server.close();}
