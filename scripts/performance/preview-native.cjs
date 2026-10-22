/* global __CONFIG__ */
/* eslint-disable @typescript-eslint/no-require-imports -- Electron generated-project main entry is CommonJS */
// Replaced by the runner only inside its generated project.
const config=__CONFIG__;
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
app.setPath('userData',path.join(config.folder,'profile'));app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const result={passed:false,featureParity:false,hardwareAcceleration:app.isHardwareAccelerationEnabled(),machine:config.machine,smoke:config.smoke,sourceFingerprint:config.sourceFingerprint,cacheLimit:16*1024*1024,batches:0,maxStaged:0,maxStageDom:0,encodedBytes:0,memory:[]},save=()=>fs.writeFileSync(path.join(config.folder,'report.json'),JSON.stringify(result,null,2));let stage,view;
 try{
  const start=Date.now(),options={width:1600,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}};
  view=new BrowserWindow({...options,show:true});stage=new BrowserWindow({...options,show:true});
  for(const win of [stage,view])win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const js=(win,code)=>win.webContents.executeJavaScript('(async()=>('+code+'))()',true);
  const wait=async(win,code)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){if(await js(win,code))return;await pause(20);}throw Error('Timed out: '+code);};
  await Promise.all([view.loadFile(config.html,{query:{role:'overview'}}),stage.loadFile(config.html,{query:{role:'stage'}})]);
  await wait(view,'!!window.__preview.navigation');await wait(stage,'!!window.__preview.setBatch');
  result.viewport=await js(view,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');result.shellMs=Date.now()-start;
  await stage.webContents.debugger.attach('1.3');await stage.webContents.debugger.sendCommand('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});let preparedCount=0;const all=await js(stage,'window.__preview.fixture.board.cards.map(p=>p.id)'),regular=config.smoke?[...all.slice(0,8),...all.slice(2500,2508),...all.slice(4500,4508),...all.slice(5800,5808)]:all.slice(0,5996),pdf=all.slice(5996);
  const memory=label=>result.memory.push({label,processes:app.getAppMetrics().map(m=>({pid:m.pid,role:!stage.isDestroyed()&&m.pid===stage.webContents.getOSProcessId()?'staging':m.pid===view.webContents.getOSProcessId()?'overview':m.type,type:m.type,...m.memory}))});
  const capture=async(ids,zoom,targetZoom,revision,keep)=>{
   await js(stage,'window.__preview.setBatch('+JSON.stringify(ids)+','+zoom+')');
   await wait(stage,'window.__preview.batch.ids.join() === '+JSON.stringify(ids.join())+'&&window.__preview.ready()');
   await js(stage,'document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
   const bounds=await js(stage,'window.__preview.bounds()'),size=await js(stage,'({width:innerWidth,height:innerHeight})');
   for(const r of bounds)if(r.x<0||r.y<0||r.x+r.width>size.width||r.y+r.height>size.height)throw Error('Staging rectangle outside capture '+JSON.stringify(r));
   const {data}=await stage.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   const installed=await js(view,'window.__preview.installAtlas('+JSON.stringify('data:image/png;base64,'+data)+','+JSON.stringify(bounds)+','+targetZoom+','+JSON.stringify(revision)+','+keep+')');
   result.encodedBytes=installed.sourceBytes;preparedCount=installed.count;
   result.batches++;result.maxStaged=Math.max(result.maxStaged,ids.length);result.maxStageDom=Math.max(result.maxStageDom,await js(stage,'document.querySelectorAll("*").length'));
   if(!result.firstPreviewMs)result.firstPreviewMs=Date.now()-start;
   if(ids.includes('p5996'))result.pdfPaints=await js(stage,'document.querySelectorAll(".pdf-page canvas[data-bench-painted=true]").length');
  };
  result.phase='preparing previews';save();
  for(let i=0;i<regular.length;i+=40){await capture(regular.slice(i,i+40),.5,.036,'overview',true);if(result.batches%10===0){memory('batch '+result.batches);save();console.log('Prepared '+preparedCount+' / '+(regular.length+4));}}
  await capture(pdf,.036,.036,'overview',true);result.preparationMs=Date.now()-start;result.previewCount=preparedCount;
  await js(stage,'window.__preview.setBatch([],.5)');await wait(stage,'document.querySelectorAll("[data-placement]").length===0');
  stage.webContents.debugger.detach();stage.hide();view.show();if(!config.smoke)await js(view,'window.__preview.prepareEdges()');
  await pause(300);result.overview=await js(view,'window.__preview.stats()');memory('prepared');
  if(result.overview.entries!==regular.length+4||result.pdfPaints!==80)throw Error('Incomplete previews '+JSON.stringify(result.overview));
  const setCamera=async c=>{await js(view,'(()=>{const n=window.__preview.navigation;n.set('+JSON.stringify(c)+');n.flush();window.__preview.paint();})()');};
  const initial={x:20,y:20,zoom:.024};await setCamera(initial);
  result.textCornerAlpha=await js(view,'window.__preview.alphaAt("p2500")');if(result.textCornerAlpha!==0)throw Error('A transparent Text preview baked in a background');
  const reference=await js(view,'document.querySelector("canvas").toDataURL()');await fs.promises.writeFile(path.join(config.folder,'overview.png'),Buffer.from(reference.split(',')[1],'base64'));
  result.phase='gestures';save();
  const gesture=async(name,mode,kind,frames,hideEdges=false,hideImages=false)=>{
   await js(view,'(()=>{const b=window.__preview;b.mode='+JSON.stringify(mode)+';b.hideEdges='+hideEdges+';b.hideImages='+hideImages+';})()');await setCamera(initial);await pause(200);
   result[name]=await js(view,'(async()=>{const n=window.__preview.navigation,samples=[];let last=performance.now();for(let i=0;i<'+frames+';i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;if('+JSON.stringify(kind)+'==="zoom")n.zoomTo(n.current.zoom*(i<'+frames+'/2?Math.pow(1.12,2/'+frames+'):Math.pow(1.12,-2/'+frames+')));else n.set({...n.current,x:n.current.x+(i<'+frames+'/2?60/'+frames+':-60/'+frames+'),y:n.current.y+(i<'+frames+'/2?30/'+frames+':-30/'+frames+')});}await new Promise(r=>setTimeout(r,300));samples.sort((a,b)=>a-b);return {p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)],max:samples.at(-1),stats:window.__preview.stats()};})()');save();console.log(name+' p95 '+result[name].p95.toFixed(1)+' ms');
  };
  await gesture('directPan','direct','pan',30);await gesture('imagesPan','direct','pan',30,true);await gesture('edgesPan','direct','pan',30,false,true);
  await js(view,'(()=>{window.__preview.hideImages=false;window.__preview.hideEdges=false;})()');await setCamera(initial);
  result.phase='compose tiles';save();result.tiles=await js(view,'window.__preview.composeTiles()');await setCamera(initial);
  const tiled=await js(view,'document.querySelector("canvas").toDataURL()');result.tiles.visual=await js(view,'window.__preview.compareSnapshot('+JSON.stringify(reference)+','+JSON.stringify(tiled)+',true)');
  if(result.tiles.visual.meanAbsoluteError>4||result.tiles.visual.changedFraction>.05)throw Error('Tiling changed the preview image '+JSON.stringify(result.tiles.visual));
  await fs.promises.writeFile(path.join(config.folder,'tiles.png'),Buffer.from(tiled.split(',')[1],'base64'));
  await fs.promises.writeFile(path.join(config.folder,'tiles-screen.png'),(await view.webContents.capturePage()).toPNG());
  result.phase='tile gestures';save();await gesture('pan','tiles','pan',180);await gesture('zoom','tiles','zoom',180);
  await setCamera(initial);const hit=await js(view,'(()=>{const samples=[];for(let i=0;i<1000;i++){const start=performance.now();window.__preview.hit(i%innerWidth,i%innerHeight);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {p95:samples[950],max:samples.at(-1)};})()');result.hit=hit;
  await pause(200);const frames=await js(view,'window.__preview.frames');await pause(500);result.idleFrames=await js(view,'window.__preview.frames')-frames;if(result.idleFrames)throw Error('Idle preview kept repainting');
  result.phase='pressure cycles';result.cycles=[];save();
  stage.showInactive();await stage.webContents.debugger.attach('1.3');await stage.webContents.debugger.sendCommand('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});for(let cycle=0;cycle<(config.soak?20:3);cycle++){
   for(let i=0;i<6;i+=2)await capture(all.slice(i,i+2),2,2,'detail-'+cycle,false);
   const pressured=await js(view,'window.__preview.stats()');
   await js(view,'window.__preview.restoreSources()');await js(view,'window.__preview.mode="direct"');
   await setCamera(initial);const restored=await js(view,'document.querySelector("canvas").toDataURL()');
   const stats=await js(view,'window.__preview.stats()');if(stats.bytes>result.cacheLimit||stats.entries!==preparedCount||restored!==reference)throw Error('Cache restoration changed pixels or exceeded budget');
   result.cycles.push({pressured,restored:stats,pixelHash:crypto.createHash('sha256').update(restored).digest('hex')});memory('cycle '+cycle);await js(view,'window.__preview.mode="tiles"');save();
  }
  await js(stage,'window.__preview.setBatch([],.5)');await wait(stage,'document.querySelectorAll("[data-placement]").length===0');
  stage.webContents.debugger.detach();stage.hide();
  result.phase='live handoff';save();view.show();view.focus();view.webContents.focus();await setCamera({x:20,y:20,zoom:1});await js(view,'window.__preview.promote()');
  const beforeCamera=await js(view,'JSON.stringify(window.__preview.navigation.current)'),point={x:60,y:115},click=point=>{view.webContents.sendInputEvent({type:'mouseMove',...point});view.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});view.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});};
  const clickStarted=Date.now();click(point);await wait(view,'!!document.querySelector("[data-placement=p0] .tiptap")?.editor.isFocused');result.focusMs=Date.now()-clickStarted;
  result.firstClick=await js(view,'(()=>{const e=document.querySelector("[data-placement=p0] .tiptap").editor;return {focused:e.isFocused,selection:e.state.selection.from,parent:e.state.selection.$from.parent.type.name,parentText:e.state.selection.$from.parent.textContent,live:document.querySelectorAll("[data-placement]").length,camera:JSON.stringify(window.__preview.navigation.current)};})()');
  if(!result.firstClick.focused||result.firstClick.camera!==beforeCamera||result.firstClick.live>64||!result.firstClick.parentText.includes('readable idea'))throw Error('First-click editor handoff failed '+JSON.stringify(result.firstClick));
  view.webContents.insertText('preview-probe');await wait(view,'window.__preview.draft.body.includes("preview-probe")');
  result.firstClick.typing=true;result.firstClick.undoVerified=false;await js(view,'(()=>{const b=window.__preview,d=b.draft;b.setDraft({...d,body:d.card.body});})()');await wait(view,'!window.__preview.draft.body.includes("preview-probe")');
  await js(view,'window.__preview.setDraft(null)');await wait(view,'!!document.querySelector("[data-placement=p0] .card-preview a")');
  const link=await js(view,'(()=>{const r=document.querySelector("[data-placement=p0] .card-preview a").getClientRects()[0];return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()');click(link);await wait(view,'window.__preview.opened?.length===1');result.firstClick.externalLinks=await js(view,'window.__preview.opened');
  await fs.promises.writeFile(path.join(config.folder,'live-card.png'),(await view.webContents.capturePage()).toPNG());
  await js(view,'window.__preview.closeLive()');await wait(view,'!document.querySelector(".live-preview")');result.cameraAfterClose=await js(view,'window.__preview.navigation.current');if(JSON.stringify(result.cameraAfterClose)!==JSON.stringify(initial))throw Error('Retired live view restored its camera');
  result.final=await js(view,'window.__preview.stats()');result.stageErrors=await js(stage,'window.__preview.errors');result.remainingStageDom=await js(stage,'document.querySelectorAll("*").length');
  result.oversizeRejected=await js(view,'window.__preview.rejectOversize()');
  result.revisionRace=await js(view,'window.__preview.revisionRace()');
  const tileSnapshot=await js(view,'window.__preview.exportTiles('+JSON.stringify(config.sourceFingerprint)+')');const cachePath=path.join(config.folder,'tile-cache.json');fs.writeFileSync(cachePath,JSON.stringify(tileSnapshot));result.cacheFileBytes=fs.statSync(cachePath).size;
  await js(view,'window.__preview.clear()');result.afterClear=await js(view,'window.__preview.stats()');if(result.afterClear.bytes||result.afterClear.entries||result.afterClear.tileBytes||result.afterClear.sourceBytes||result.final.errors.length||result.stageErrors.length)throw Error('Resource/error check failed');
  result.phase='warm cache';save();const old=view,warmStart=Date.now();view=new BrowserWindow({...options,show:true});stage.destroy();old.destroy();await view.loadFile(config.html,{query:{role:'overview'}});await wait(view,'!!window.__preview.navigation');
  const saved=JSON.parse(fs.readFileSync(cachePath,'utf8'));
  result.rejectStale=await js(view,'window.__preview.importTiles('+JSON.stringify({...saved,signature:'stale'})+','+JSON.stringify(config.sourceFingerprint)+').then(()=>false,()=>true)');if(!result.rejectStale)throw Error('Stale tile cache was accepted');
  await js(view,'window.__preview.importTiles('+JSON.stringify(saved)+','+JSON.stringify(config.sourceFingerprint)+')');await setCamera(initial);await js(view,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  result.warm={ms:Date.now()-warmStart,stats:await js(view,'window.__preview.stats()')};const warmImage=await js(view,'document.querySelector("canvas").toDataURL()');if(warmImage!==tiled)throw Error('Warm cache changed rendered pixels');
  await fs.promises.writeFile(path.join(config.folder,'warm.png'),Buffer.from(warmImage.split(',')[1],'base64'));memory('warm cache');await js(view,'window.__preview.clear()');result.warmAfterClear=await js(view,'window.__preview.stats()');if(result.warmAfterClear.tileBytes||result.warmAfterClear.bytes)throw Error('Warm cache did not release pixels');
  result.budgetPassed=result.pan.p95<=20&&result.pan.p99<=33&&result.zoom.p95<=20&&result.zoom.p99<=33;result.passed=true;result.phase='complete';memory('complete');
 }catch(error){result.error=String(error);console.error(error);if(view&&!view.isDestroyed()){result.viewDiagnostic=await view.webContents.executeJavaScript('({focused:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,400),errors:window.__preview?.errors})').catch(()=>null);await view.webContents.capturePage().then(i=>fs.writeFileSync(path.join(config.folder,'view-failure.png'),i.toPNG())).catch(()=>{});}if(stage&&!stage.isDestroyed()){result.stageDiagnostic=await stage.webContents.executeJavaScript('({batch:window.__preview?.batch,errors:window.__preview?.errors,dom:document.querySelectorAll("*").length})').catch(()=>null);await stage.webContents.capturePage(undefined,{stayHidden:true}).then(i=>fs.writeFileSync(path.join(config.folder,'stage-failure.png'),i.toPNG())).catch(()=>{});}}
 save();for(const win of [view,stage])if(win&&!win.isDestroyed())win.destroy();app.exit(result.passed?0:1);
});
