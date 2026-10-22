// Profile a snapshot of an existing board. The supplied workspace is only ever read.
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {buildEngine} from './build.mjs';
const label=process.argv[3]??'review',readingZoom=Number(process.argv[4]??1);assert.ok(Number.isFinite(readingZoom)&&readingZoom>0&&readingZoom<=3,'Reading zoom must be between 0 and 3.');
assert.ok(process.argv[2],'Usage: node scripts/benchmark-reader.mjs <workspace> [run-name] [reading-zoom=1]');
assert.match(label,/^[a-z0-9-]+$/);
const source=await fs.realpath(resolve(process.argv[2]));
const root=process.cwd(),folder=join(root,'.local/reader-benchmark',label),workspace=join(folder,'workspace'),project=join(folder,'project'),report=join(folder,'report.json');
for(const diff of [relative(folder,source),relative(source,folder)])assert.ok(diff==='..'||diff.startsWith('..'+sep)||isAbsolute(diff),'Source and disposable benchmark directory must not overlap');
await fs.access(join(source,'.heavens-door/settings.json'));
await fs.mkdir(join(project,'dist'),{recursive:true});await fs.rm(workspace,{recursive:true,force:true});await fs.cp(source,workspace,{recursive:true});await fs.rm(join(folder,'profile'),{recursive:true,force:true});await fs.rm(report,{force:true});
process.env.HEAVENS_DOOR_TEST_BUILD='1';await buildEngine();
await build({configFile:join(root,'vite.config.ts'),define:{__HEAVENS_TEST__:'true'},plugins:[{name:'reader-benchmark',transform(code,id){if(id.endsWith('/src/renderer/Board.tsx'))return code.replace('navigation.current = nav;','navigation.current = nav; window.__readerBench.navigation=nav;');if(id.endsWith('/src/renderer/PdfReader.tsx'))return code.replaceAll('await render.promise;',"await render.promise;element.dataset.benchRendered='true';window.__readerBench.paints=(window.__readerBench.paints??0)+1;").replace('setLayer(null);element.replaceChildren();','setLayer(null);element.replaceChildren();delete element.dataset.benchTextReady;').replace('await textLayer.render();','await textLayer.render();element.dataset.benchTextReady="true";');if(id.endsWith('/src/renderer/main.tsx'))return 'import {pdfDensity} from '+JSON.stringify(join(root,'scripts/performance/pdf-density.ts'))+';\n'+code+`\nwindow.__readerBench={requests:{},longTasks:[],density:()=>pdfDensity(document.querySelector('.canvas'))};const benchRequest=session.bridge.request.bind(session.bridge);session.bridge={...session.bridge,request:(request)=>{const counts=window.__readerBench.requests;counts[request.kind]=(counts[request.kind]??0)+1;return benchRequest(request);}};new PerformanceObserver(list=>window.__readerBench.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});`;}}],build:{outDir:join(project,'dist/renderer'),emptyOutDir:true}});
for(const name of ['main.cjs','preload.cjs','workspace-worker.cjs'])await fs.copyFile(join(root,'dist',name),join(project,'dist',name));
try{await fs.symlink(join(root,'node_modules'),join(project,'node_modules'),'junction');}catch(error){if(error.code!=='EEXIST')throw error;}
await fs.writeFile(join(project,'package.json'),JSON.stringify({name:'heavens-door-reader-benchmark',version:'0.1.2',main:'dist/main.cjs'}));
const prefix=`require('electron').app.setPath('userData',${JSON.stringify(join(folder,'profile'))});process.env.HEAVENS_DOOR_WORKSPACE=${JSON.stringify(workspace)};\n`;
const probe=`
const benchFS=require('node:fs'),benchApp=require('electron').app,benchPause=ms=>new Promise(r=>setTimeout(r,ms));
benchApp.whenReady().then(async()=>{
 const result={passed:false},save=()=>benchFS.writeFileSync(${JSON.stringify(report)},JSON.stringify(result,null,2));
 try{
  const deadline=Date.now()+90000;while(!desktops.size&&Date.now()<deadline)await benchPause(50);
  const win=[...desktops.values()][0].window;win.webContents.setBackgroundThrottling(false);
  const js=code=>win.webContents.executeJavaScript('(async()=>('+code+'))()',true);
  const wait=async(code)=>{while(Date.now()<deadline){if(await js(code))return;await benchPause(100);}throw Error('Timed out: '+code);};
  const stats='({zoom:window.__readerBench.navigation?.current.zoom,density:window.__readerBench.density(),readers:document.querySelectorAll(".board-pdf .pdf-reader").length,pages:document.querySelectorAll(".board-pdf .pdf-page").length,painted:document.querySelectorAll(".board-pdf canvas[data-bench-rendered]").length,canvases:document.querySelectorAll(".board-pdf canvas").length,pixels:[...document.querySelectorAll(".board-pdf canvas")].reduce((n,c)=>n+c.width*c.height,0),errors:[...document.querySelectorAll(".pdf-source-error pre")].map(e=>e.textContent),textSpans:document.querySelectorAll(".board-pdf .textLayer span").length,dom:document.querySelectorAll("*").length,requests:{...window.__readerBench.requests}})';
  result.phase='load';save();await wait('document.querySelectorAll(".board-pdf .pdf-reader").length>0&&[...document.querySelectorAll(".board-pdf .pdf-reader")].every(r=>r.querySelector(".pdf-page")||r.querySelector(".pdf-source-error"))');await wait('document.querySelectorAll(".board-pdf canvas").length>0&&[...document.querySelectorAll(".board-pdf canvas")].every(c=>c.dataset.benchRendered)');await benchPause(300);
  result.initial=await js(stats);if(result.initial.errors.length)throw Error(JSON.stringify(result.initial.errors));result.loadingMs=Date.now()-(deadline-90000);save();
  const idlePaints=await js('window.__readerBench.paints??0');await benchPause(700);result.idleRepaints=(await js('window.__readerBench.paints??0'))-idlePaints;if(result.idleRepaints)throw Error('Idle reader kept repainting');
  result.phase='repaint continuity';save();
  result.continuity=await js('(async()=>{const viewport=document.querySelector(".canvas"),box=viewport.getBoundingClientRect(),seen=new WeakMap(),warmed=new WeakSet();let samples=0,blankFrames=0,replacements=0,warmSamples=0,running=true,previousVisible=new Set();const tick=()=>{samples++;const visible=new Set();for(const p of viewport.querySelectorAll(".pdf-page")){const r=p.getBoundingClientRect();if(r.right<=box.left||r.left>=box.right||r.bottom<=box.top||r.top>=box.bottom)continue;visible.add(p);if(!previousVisible.has(p))warmed.delete(p);const c=p.querySelector("canvas");if(warmed.has(p)){warmSamples++;if(!c||!c.width||!c.height||!c.dataset.benchRendered)blankFrames++;if(c&&seen.has(p)&&seen.get(p)!==c)replacements++;}if(c?.dataset.benchRendered){warmed.add(p);seen.set(p,c);}}previousVisible=visible;if(running)requestAnimationFrame(tick);};tick();for(const direction of [-1,1]){for(let i=0;i<20;i++){viewport.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:direction*4,ctrlKey:true,clientX:box.left+300,clientY:box.top+300}));await new Promise(requestAnimationFrame);}await new Promise(r=>setTimeout(r,400));}await new Promise(r=>setTimeout(r,1800));running=false;return {samples,warmSamples,blankFrames,replacements};})()');save();
  if(result.continuity.warmSamples<10||result.continuity.blankFrames||result.continuity.replacements)throw Error('PDF repaint cleared a visible page: '+JSON.stringify(result.continuity));
  await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Profiler.enable');await win.webContents.debugger.sendCommand('Profiler.start');
  for(const [name,deltaX,deltaY,ctrlKey] of [['pan',8,3,false],['zoom',0,-4,true],['readingPan',8,3,false]]){
   if(name==='readingPan')await js('(async()=>{const n=window.__readerBench.navigation;n.zoomTo('+${JSON.stringify(readingZoom)}+');n.flush();await new Promise(r=>setTimeout(r,700));})()');
   if(name==='readingPan')await wait('window.__readerBench.density().pages>0&&window.__readerBench.density().minimum>=.99&&window.__readerBench.density().textReady===window.__readerBench.density().pages');
   result.phase=name;save();await js('(()=>{window.__readerBench.requests={};window.__readerBench.longTasks=[];})()');
   result[name]=await js('(async()=>{const canvas=document.querySelector(".canvas"),r=canvas.getBoundingClientRect(),samples=[];let last=performance.now();for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;canvas.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaX:(i<30?1:-1)*'+deltaX+',deltaY:(i<30?1:-1)*'+deltaY+',ctrlKey:'+ctrlKey+',clientX:r.left+300,clientY:r.top+300}));}await new Promise(r=>setTimeout(r,700));samples.sort((a,b)=>a-b);return {p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1),longTasks:window.__readerBench.longTasks,...'+stats+'};})()');save();
  }
  if(Math.abs(result.readingPan.zoom-${JSON.stringify(readingZoom)})>1e-8)throw Error('Reading zoom changed');
  const {profile}=await win.webContents.debugger.sendCommand('Profiler.stop');benchFS.writeFileSync(${JSON.stringify(join(folder,'renderer.cpuprofile'))},JSON.stringify(profile));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(const id of profile.samples??[]){const f=nodes.get(id)?.callFrame,name=f?.functionName||f?.url||'(unknown)';counts.set(name,(counts.get(name)??0)+1);}result.cpuSamples=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,15);win.webContents.debugger.detach();
  result.phase='tabs';save();result.tabs=[];
  const otherTab=JSON.stringify('[data-tab-key="board:Other"] [role=tab]');
  const hasOther=await js('!!document.querySelector('+otherTab+')');if(!hasOther)result.tabSwitchSkipped='No Other tab open; native test:reader checks switching separately.';
  for(let i=0;i<(hasOther?3:0);i++)for(const name of ['Other','Review']){
   const tab=JSON.stringify('[data-tab-key="board:'+name+'"] [role=tab]');
   const timing=await js('(async()=>{const start=performance.now();document.querySelector('+tab+').click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return performance.now()-start;})()');
   await wait('document.querySelector('+tab+').getAttribute("aria-selected")==="true"');
   if(name==='Other')await wait('!document.querySelector(".board-pdf")');
   if(name==='Review'){const start=Date.now();await wait('document.querySelectorAll(".board-pdf .pdf-reader").length>0&&[...document.querySelectorAll(".board-pdf .pdf-reader")].every(r=>r.querySelector(".pdf-page")||r.querySelector(".pdf-source-error"))');result.tabs.push({name,frameMs:timing,pagesReadyMs:Date.now()-start});}else result.tabs.push({name,frameMs:timing});
  }
  await wait('[...document.querySelectorAll(".board-pdf canvas")].every(c=>c.dataset.benchRendered)');result.final=await js(stats);if(result.final.errors.length)throw Error(JSON.stringify(result.final.errors));result.passed=true;
 }catch(error){result.error=String(error);}
 save();for(const d of desktops.values())d.closing=true;benchApp.exit(result.passed?0:1);
});
`;
await fs.writeFile(join(project,'dist/main.cjs'),prefix+await fs.readFile(join(project,'dist/main.cjs'),'utf8')+probe);
const child=spawn(electron,[project],{cwd:root,stdio:'inherit',env:{...process.env,HEAVENS_DOOR_WORKSPACE:workspace}}),timer=setTimeout(()=>child.kill(),180000);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
const result=JSON.parse(await fs.readFile(report,'utf8'));console.log(JSON.stringify(result,null,2));assert.equal(code,0);assert.equal(result.passed,true);
