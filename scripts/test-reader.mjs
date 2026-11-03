import {readerPdf} from './reader-fixture.mjs';
// Native renderer checks in an isolated workspace and app profile; never opens personal files.
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import electron from 'electron';
import {build} from 'vite';
import {buildEngine} from './build.mjs';
process.env.HEAVENS_DOOR_TEST_BUILD='1';
await buildEngine();
const uiOnly=process.argv.includes('--ui-only'),settingsOnly=process.argv.includes('--settings-only'),extractionOnly=process.argv.includes('--extraction-only'),brandingOnly=process.argv.includes('--branding-only'),arrangementOnly=process.argv.includes('--arrangement-only'),cardOnly=process.argv.includes('--card-only'),navigationOnly=uiOnly||settingsOnly||extractionOnly||brandingOnly||arrangementOnly||cardOnly||process.argv.includes('--navigation-only'),retina=process.argv.includes('--retina'),retained=process.argv.includes('--retained'),root=process.cwd(),folder=join(root,retained?'.local/reader-retained-check':'.local/reader-check'),project=join(folder,'project'),workspace=join(folder,'workspace'),report=join(folder,'report.json');
await fs.rm(workspace,{recursive:true,force:true});await fs.rm(join(folder,'profile'),{recursive:true,force:true});
await fs.mkdir(join(project,'dist'),{recursive:true});await fs.mkdir(join(workspace,'Review'),{recursive:true});await fs.mkdir(join(workspace,'Other'),{recursive:true});await fs.mkdir(join(workspace,'.heavens-door'),{recursive:true});await fs.rm(report,{force:true});
// Each page has text plus vector work, so the test exercises raster and text-layer costs.
await fs.writeFile(join(workspace,'Review/paper.pdf'),readerPdf());
await fs.writeFile(join(workspace,'Review/Paper.md'),'---\ncard-id: reader-paper\nsource:\n  type: pdf\n  file: paper.pdf\n---\n# Twenty-page PDF\n');
await fs.writeFile(join(workspace,'Review/Editor.md'),'---\ncard-id: reader-editor\n---\n# Editor checks\n\n```cpp\nint answer = 42;\nreturn answer;\n```\n\n- [x] Done\n- [ ] Next\n- [ ] \n\n```sp-bar\nTask progress\n```\n\nAlpha paragraph to extract.\n\nBeta paragraph to extract.\n');
const board=(name,cards)=>`---\nwhiteboard: true\n---\n# ${name}\n\n## Cards\n${cards.map(p=>`- [Card](card:${p.cardId}) ^${p.id}`).join('\n')}\n\n%% whiteboard-layout\n${JSON.stringify({version:1,cards:cards.map(p=>({...p,cardId:undefined})),edges:[]})}\n%%\n`;
await fs.writeFile(join(workspace,'Review/Review.whiteboard'),board('Review',[{id:'pdf',cardId:'reader-paper',x:20,y:20,width:440,height:280,pdf:{expanded:true}},{id:'editor',cardId:'reader-editor',x:740,y:20,width:380,height:280}]));await fs.writeFile(join(workspace,'Other/Other.whiteboard'),board('Other',[]));
await fs.writeFile(join(workspace,'.heavens-door/settings.json'),JSON.stringify({theme:'dark',stem:'untitled',starred:[],recent:[],icons:{},features:{reading:false},documents:{tree:{type:'pane',id:'reader',tabs:['board:Review','board:Other'],active:'board:Review'},active:'reader',views:{'reader:board:Review':{camera:{x:20,y:20,zoom:.8}}},formatting:[]}}));
await build({configFile:join(root,'vite.config.ts'),define:{__HEAVENS_TEST__:'true'},plugins:[{name:'reader-test-session',enforce:'pre',transform(code,id){if(settingsOnly&&id.endsWith('/src/renderer/UpdateSettings.tsx'))return code.replace('APP_NAME,TEST_BUILD','APP_NAME').replaceAll('TEST_BUILD','false');if(id.endsWith('/src/renderer/PdfReader.tsx'))return code+'\nwindow.__readerPdfCache=pagePreviews;window.__readerPdfCacheHits=0;const readerCachedPage=pagePreviews.get.bind(pagePreviews);pagePreviews.get=(key)=>{const value=readerCachedPage(key);if(value)window.__readerPdfCacheHits++;return value;};';if(retained&&id.endsWith('/src/renderer/retained-setting.ts'))return code.replace("localStorage.getItem(key)==='1'","localStorage.getItem(key)!=='0'");if(id.endsWith('/src/renderer/Board.tsx'))return code.replace('navigation.current = nav;','navigation.current = nav; window.__readerTestNavigation=nav;');if(id.endsWith('/src/renderer/main.tsx'))return code+'\nwindow.__readerTestSession=session;';}}],build:{outDir:join(project,'dist/renderer'),emptyOutDir:true}});
for(const name of ['main.cjs','preload.cjs','workspace-worker.cjs'])await fs.copyFile(join(root,'dist',name),join(project,'dist',name));
try{await fs.symlink(join(root,'node_modules'),join(project,'node_modules'),'junction');}catch(error){if(error.code!=='EEXIST')throw error;}
await fs.writeFile(join(project,'package.json'),JSON.stringify({name:'heavens-door-reader-check',version:'0.1.2',main:'dist/main.cjs'}));
const prefix=`require('electron').app.setPath('userData',${JSON.stringify(join(folder,'profile'))});process.env.HEAVENS_DOOR_WORKSPACE=${JSON.stringify(workspace)};\n`;
const probe=`
const readerFS=require('node:fs'),readerApp=require('electron').app;
const fsPreview=async win=>readerFS.writeFileSync(${JSON.stringify(join(folder,'editor.png'))},(await win.capturePage()).toPNG());
const readerPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const readerWait=async(fn,label)=>{const end=Date.now()+90000;while(Date.now()<end){const result=await fn();if(result)return result;await readerPause(60);}throw Error('Timed out: '+label);};
readerApp.whenReady().then(async()=>{
 const result={passed:false},save=()=>readerFS.writeFileSync(${JSON.stringify(report)},JSON.stringify(result,null,2));
 const phase=value=>{result.phase=value;save();};
 try{
  const desktop=await readerWait(()=>[...desktops.values()][0],'window'),win=desktop.window,js=async code=>{const value=await Promise.race([win.webContents.executeJavaScript('(async()=>{try{return {ok:true,value:await ('+code+')}}catch(error){return {ok:false,error:error.stack}}})()',true),readerPause(12000).then(()=>{throw Error('Renderer timed out: '+code.slice(0,120));})]);if(!value.ok)throw Error(value.error);return value.value;};
  win.webContents.setBackgroundThrottling(false);if(${retina}){const display=require('electron').screen.getAllDisplays().find(d=>d.scaleFactor===2);if(!display)throw Error('No Retina reference display');win.setPosition(display.workArea.x+10,display.workArea.y+10);win.setContentSize(1710,1073);}result.display=await js('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  const wait=(code,label)=>readerWait(()=>js(code),label);
  if(!${navigationOnly}){
  phase('loading');
  await wait('document.querySelectorAll(".board-pdf .pdf-page").length===20 && [...document.querySelectorAll(".pdf-page canvas")].some(c=>c.width>0)','20-page reader');await readerPause(700);
  result.initial=await js('({pages:document.querySelectorAll(".pdf-page").length,canvases:document.querySelectorAll(".pdf-page canvas").length,pixels:[...document.querySelectorAll(".pdf-page canvas")].reduce((sum,c)=>sum+c.width*c.height,0)})');
  if(result.initial.canvases>5)throw Error('Offscreen pages rasterized: '+JSON.stringify(result.initial));
  phase('pdf pointer checks');
  const rect=await js('(()=>{const r=document.querySelector(".pdf-page").getBoundingClientRect();return {x:Math.round(r.right-25),y:Math.round(r.top+220)}})()');
  const point=await js('(()=>{const p=window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf");return {x:p.x,y:p.y}})()');
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...rect});win.webContents.sendInputEvent({type:'mouseMove',x:rect.x+48,y:rect.y+32});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:rect.x+48,y:rect.y+32});
  await wait('window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf").x>'+point.x,'drag PDF on blank page');result.dragPdf=true;
  const camera=await js('document.querySelector(".board-world").style.transform');
  win.webContents.sendInputEvent({type:'mouseDown',button:'middle',clickCount:1,...rect});win.webContents.sendInputEvent({type:'mouseMove',x:rect.x+36,y:rect.y+24});win.webContents.sendInputEvent({type:'mouseUp',button:'middle',clickCount:1,x:rect.x+36,y:rect.y+24});
  await wait('document.querySelector(".board-world").style.transform!=='+JSON.stringify(camera),'middle-button pan on PDF');result.panPdf=true;
  phase('PDF search, selection and repaint');
  const searchCamera=await js('document.querySelector(".board-world").style.transform');
  await js('document.querySelector(".board-pdf .pdf-search input").focus()');win.webContents.insertText('passage');
  await wait('document.querySelectorAll(".board-pdf .pdf-find-match").length>1','PDF search marks');
  if(await js('document.querySelector(".board-world").style.transform')!==searchCamera)throw Error('Typing a PDF query moved the camera');
  result.pdfSearch=await js('({matches:document.querySelectorAll(".board-pdf .pdf-find-match").length,focused:document.querySelectorAll(".board-pdf .pdf-find-match.current").length})');
  await js('document.querySelector(".board-pdf .pdf-search button[aria-label^=Next]").click()');
  await wait('!!document.querySelector(".board-pdf .pdf-find-match.current")','focused PDF match');
  await js('document.querySelector(".board-pdf .pdf-search button[aria-label^=Clear]").click()');
  await js('(()=>{const span=[...document.querySelectorAll(".board-pdf .textLayer span")].find(el=>el.textContent.includes("Reader performance")),range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);span.closest(".pdf-reader").dispatchEvent(new MouseEvent("mouseup",{bubbles:true}));})()');
  await wait('!!document.querySelector(".reader-selection-tools button")','selected PDF text');await js('document.querySelector(".reader-selection-tools button").click()');
  await wait('!!document.querySelector(".board-pdf .pdf-highlight")&&!!document.activeElement.closest(".sticky-note.expanded")','highlight with focused comment');win.webContents.insertText('Native annotation check');result.pdfHighlight=true;
  await js('document.querySelector(".board-pdf-more").click()');await wait('!!document.querySelector("[role=menuitemcheckbox]")','PDF menu');await js('[...document.querySelectorAll("[role=menuitemcheckbox]")].find(b=>b.textContent==="Expand PDF preview").click()');
  await wait('document.querySelectorAll(".board-pdf .pdf-page").length===1','single-page preview');
  const pdfWidth=await js('window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf").width');
  await js('window.__pdfResizeCanvas=document.querySelector(".board-pdf canvas")');
  const resize=await js('(()=>{const r=document.querySelector(".board-pdf-main>.resize-handle").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...resize});win.webContents.sendInputEvent({type:'mouseMove',x:resize.x+32,y:resize.y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:resize.x+32,y:resize.y});
  await wait('window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf").width>'+pdfWidth,'resize PDF');
  result.pdfResize=await js('({sameCanvas:document.querySelector(".board-pdf canvas")===window.__pdfResizeCanvas,opaque:window.__pdfResizeCanvas.getContext("2d").getImageData(0,0,1,1).data[3]===255})');if(!result.pdfResize.sameCanvas||!result.pdfResize.opaque)throw Error('Resizing replaced or cleared the displayed PDF');
  await js('document.querySelector(".board-pdf-more").click()');await wait('!!document.querySelector("[role=menuitemcheckbox]")','PDF menu');await js('[...document.querySelectorAll("[role=menuitemcheckbox]")].find(b=>b.textContent==="Expand PDF preview").click()');await wait('document.querySelectorAll(".board-pdf .pdf-page").length===20','continuous preview');await wait('window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf").pdf.expanded===true','saved continuous preview');
  phase('Retina PDF detail');
  const qualityBefore=await js('(()=>{const s=window.__readerTestSession,p=s.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf");return {width:p.width,camera:window.__readerTestNavigation.current};})()');
  await js('(async()=>{const s=window.__readerTestSession,b=s.state.snapshot.boards.find(b=>b.folder==="Review");await s.board({...b,cards:b.cards.map(p=>p.id==="pdf"?{...p,width:1200}:p)},"Test large PDF");const p=b.cards.find(p=>p.id==="pdf");window.__readerTestNavigation.set({x:20-p.x*3,y:60-p.y*3,zoom:3});window.__readerTestNavigation.flush();})()');
  await wait('[...document.querySelectorAll(".board-pdf .pdf-detail-canvas")].some(c=>c.width>0)','high-resolution PDF crop');
  await readerPause(350);
  result.pdfQuality=await js('(()=>{const c=[...document.querySelectorAll(".board-pdf .pdf-detail-canvas")].find(c=>c.width>0),r=c.getBoundingClientRect(),p=c.closest(".pdf-page").getBoundingClientRect(),v=document.querySelector(".canvas").getBoundingClientRect(),dpr=devicePixelRatio;window.__qualityCanvas=c;return {density:c.width/r.width/dpr,pixels:c.width*c.height,opaque:c.getContext("2d").getImageData(0,0,1,1).data[3]===255,coverage:r.left<=Math.max(p.left,v.left)+1&&r.right>=Math.min(p.right,v.right)-1&&r.top<=Math.max(p.top,v.top)+1&&r.bottom>=Math.min(p.bottom,v.bottom)-1};})()');
  if(result.pdfQuality.density<.99||!result.pdfQuality.coverage||!result.pdfQuality.opaque||result.pdfQuality.pixels>16_020_000)throw Error('PDF zoom detail is undersized or unbounded '+JSON.stringify(result.pdfQuality));
  await readerFS.promises.writeFile(${JSON.stringify(join(folder,'pdf-quality.png'))},(await win.capturePage()).toPNG());
  await js('(()=>{const n=window.__readerTestNavigation;n.set({...n.current,x:n.current.x+64});n.flush();})()');await readerPause(500);
  result.pdfQuality.sameCanvas=await js('document.contains(window.__qualityCanvas)');if(!result.pdfQuality.sameCanvas)throw Error('Panning replaced the detail canvas');
  await js('(async()=>{const s=window.__readerTestSession,b=s.state.snapshot.boards.find(b=>b.folder==="Review");await s.board({...b,cards:b.cards.map(p=>p.id==="pdf"?{...p,width:'+qualityBefore.width+'}:p)},"Restore PDF size");window.__readerTestNavigation.set('+JSON.stringify(qualityBefore.camera)+');window.__readerTestNavigation.flush();})()');await readerPause(500);
  phase('Retina card text');
  await js('(()=>{const p=window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="editor"),n=window.__readerTestNavigation;n.set({x:30-p.x*3,y:30-p.y*3,zoom:3});n.flush();})()');await readerPause(350);
  result.cardQuality=await js('(()=>{const c=document.querySelector("[data-placement=editor]"),r=c.getBoundingClientRect();return {scale:r.width/c.offsetWidth,liveCode:c.querySelector("pre").textContent,canvases:c.querySelectorAll("canvas").length};})()');
  if(Math.abs(result.cardQuality.scale-3)>.01||result.cardQuality.canvases||!result.cardQuality.liveCode.includes('int answer = 42;'))throw Error('Card zoom lost live text '+JSON.stringify(result.cardQuality));
  await readerFS.promises.writeFile(${JSON.stringify(join(folder,'card-quality.png'))},(await win.capturePage()).toPNG());
  await js('(()=>{const n=window.__readerTestNavigation;n.set('+JSON.stringify(qualityBefore.camera)+');n.flush();})()');await readerPause(250);
  phase('card focus, wrapping and block geometry');
  result.cardFeedback=await require(${JSON.stringify(join(root,'scripts/performance/card-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});
  phase('editor geometry');
  result.codePreview=await js('(()=>{const b=document.querySelector("[data-placement=editor] .editor-code-block"),p=b.querySelector("pre");return {height:b.offsetHeight,code:p.textContent,checkboxes:document.querySelectorAll("[data-placement=editor] input[type=checkbox]").length}})()');
  const code=await js('(()=>{const r=document.querySelector("[data-placement=editor] pre").getBoundingClientRect();return {x:Math.round(r.left+35),y:Math.round(r.top+12)}})()');
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...code});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...code});
  await wait('!!document.querySelector("[data-placement=editor] .tiptap")','edit code card');
  result.codeEditor=await js('(()=>{const b=document.querySelector("[data-placement=editor] .editor-code-block"),p=b.querySelector("pre");return {height:b.offsetHeight,code:p.textContent,checkboxes:document.querySelectorAll("[data-placement=editor] input[type=checkbox]").length}})()');
  if(result.codeEditor.height!==result.codePreview.height||result.codeEditor.code!==result.codePreview.code||result.codePreview.checkboxes!==3)throw Error('Code/checkbox geometry changed '+JSON.stringify({before:result.codePreview,after:result.codeEditor}));
  await fsPreview(win);
  result.progress=await js('document.querySelector("[data-progress-count]").textContent');if(result.progress!=='1/3 (33%)')throw Error('Wrong card progress '+result.progress);
  await js('document.querySelector("button.code-language-trigger").click()');await wait('!!document.querySelector(".code-language-picker input")','code language search');await js('[...document.querySelectorAll(".code-language-picker [role=option]")].find(b=>b.textContent==="Python").click()');result.languagePicker=true;
  phase('block extraction');
  const paragraphs=await js('(()=>{const editor=document.querySelector("[data-placement=editor] .tiptap").editor,positions=[];editor.state.doc.forEach((node,pos)=>{if(node.type.name==="paragraph"&&node.textContent.includes("paragraph to extract"))positions.push({from:pos+1,to:pos+node.nodeSize-1});});editor.commands.setTextSelection({from:positions[0].from,to:positions.at(-1).to});return positions.length;})()');if(paragraphs!==2)throw Error('Missing extraction paragraphs');
  await readerPause(120);const grip=await js('(()=>{const r=document.querySelector(".editor-block-grip").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()'),drop=await js('(()=>{const r=document.querySelector(".canvas").getBoundingClientRect();return {x:Math.round(r.right-300),y:Math.round(r.bottom-80)}})()');
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...grip});win.webContents.sendInputEvent({type:'mouseMove',button:'left',x:drop.x,y:drop.y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...drop});
  await wait('window.__readerTestSession.state.snapshot.cards.some(c=>c.id!=="reader-editor"&&c.title?.includes("Alpha paragraph"))','extract selected blocks onto board');
  result.extraction=await js('(async()=>{const s=window.__readerTestSession,source=await window.door.request({kind:"card",path:"Review/Editor.md"}),created=s.state.snapshot.cards.find(c=>c.id!=="reader-editor"&&c.title?.includes("Alpha paragraph")),card=await window.door.request({kind:"card",path:created.path});return {reference:source.body.includes("[Alpha paragraph"),paragraphs:(card.body.match(/paragraph to extract/g)||[]).length,placements:s.state.snapshot.boards.find(b=>b.folder==="Review").cards.filter(p=>p.cardId===created.id).length};})()');
  if(!result.extraction.reference||result.extraction.paragraphs!==2||result.extraction.placements!==1)throw Error('Extraction duplicated or lost content '+JSON.stringify(result.extraction));
  await js('(()=>{document.querySelector(".canvas").focus();document.querySelector(".canvas").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));})()');
  phase('named block extraction and retained PDF note mentions');
  result.extractionFeedback=await require(${JSON.stringify(join(root,'scripts/performance/extraction-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});
  phase('zoom performance');
  result.zoom=await js('(async()=>{const canvas=document.querySelector(".canvas"),r=canvas.getBoundingClientRect(),samples=[];let last=performance.now();for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;canvas.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,ctrlKey:true,deltaY:10,clientX:r.left+100,clientY:r.top+100}));}await new Promise(r=>setTimeout(r,500));samples.sort((a,b)=>a-b);return {percent:Number.parseFloat(document.querySelector(".zoom-level").textContent),p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1),canvases:document.querySelectorAll(".pdf-page canvas").length,pixels:[...document.querySelectorAll(".pdf-page canvas")].reduce((sum,c)=>sum+c.width*c.height,0),textLayers:document.querySelectorAll(".pdf-page .textLayer span").length};})()');
  if(result.zoom.percent>=20)throw Error('Board zoom still stops at 20 percent');
  phase('deep zoom persistence');
  result.savedZoom=await js('(async()=>{const s=window.__readerTestSession;await s.flushPreferences();const snapshot=await s.bridge.request({kind:"snapshot"});if(s.state.error)throw Error(s.state.error);return snapshot.preferences.documents.views["reader:board:Review"].camera.zoom;})()');
  if(!(result.savedZoom>=.0001&&result.savedZoom<.2))throw Error('Deep camera did not save: '+result.savedZoom);
  const savedCamera=await js('document.querySelector(".board-world").style.transform');
  phase('tab switching');
  const switches=[];for(let i=0;i<4;i++)for(const name of ['Other','Review'])switches.push(await js('(async()=>{const start=performance.now();document.querySelector('+JSON.stringify('[data-tab-key="board:'+name+'"] [role=tab]')+').click();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return performance.now()-start;})()'));
  result.tabSwitchMs=switches;if(!${retained})await wait('document.querySelectorAll(".pdf-page").length===20','return to PDF');
  if(await js('document.querySelector(".board-world").style.transform')!==savedCamera)throw Error('Returning to a board lost its deep camera');
  if(await js('window.__readerTestSession.state.error'))throw Error('Reader checks left an app error');
  if(${retained}){await js('(()=>{const p=window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review").cards.find(p=>p.id==="pdf");window.__readerTestNavigation.set({x:20-p.x,y:40-p.y,zoom:1});window.__readerTestNavigation.flush();})()');await wait('document.querySelectorAll(".board-pdf .pdf-page").length===20','promote readable PDF');}
  phase('PDF overlap stacking');
  const beforeOverlap=await js('window.__readerTestSession.state.snapshot.boards.find(b=>b.folder==="Review")');
  await js('(async()=>{const s=window.__readerTestSession,b=s.state.snapshot.boards.find(b=>b.folder==="Review"),p=b.cards.find(p=>p.id==="pdf");await s.board({...b,cards:[{...p,x:180,y:120,width:440,pdf:{expanded:false,notes:false}},{...p,id:"pdf-front",x:20,y:20,width:440,pdf:{expanded:false,notes:false}}],edges:[]},"Test overlapping PDFs");window.__readerTestNavigation.set({x:20,y:20,zoom:1});window.__readerTestNavigation.flush();})()');
  await wait('document.querySelectorAll(".board-pdf .pdf-page").length===2&&[...document.querySelectorAll(".board-pdf .pdf-reader")].every(e=>e.dataset.ready==="true")&&[...document.querySelectorAll(".board-pdf canvas")].every(c=>c.dataset.pdfPainted==="true")','two overlapping PDF readers');
  const overlapHit=async(under,over,expected)=>{
   const hit=await js('(()=>{const a=document.querySelector('+JSON.stringify(under)+').getBoundingClientRect(),b=document.querySelector('+JSON.stringify(over)+').getBoundingClientRect(),left=Math.max(a.left,b.left),right=Math.min(a.right,b.right),top=Math.max(a.top,b.top),bottom=Math.min(a.bottom,b.bottom);if(right-left<4||bottom-top<4)throw Error("Missing overlap");const x=Math.round((left+right)/2),y=Math.round((top+bottom)/2),e=document.elementFromPoint(x,y);return {x,y,placement:e?.closest("[data-placement]")?.dataset.placement,tag:e?.tagName,className:e?.className};})()');
   if(hit.placement!==expected)throw Error('PDF layers interleaved: '+JSON.stringify({under,over,expected,hit}));return hit;
  };
  const selectPdf=async id=>{
   const at=await js('(()=>{const r=document.querySelector("[data-placement='+id+'] .board-pdf-heading").getBoundingClientRect();return {x:Math.round(r.left+'+(id==='pdf'?300:100)+'),y:Math.round(r.top+r.height/2)}})()');
   win.webContents.sendInputEvent({type:'mouseMove',...at});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...at});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...at});await readerPause(100);
   await wait('document.querySelector("[data-placement='+id+']").classList.contains("selected")','selected overlapping PDF');await wait('document.querySelectorAll(".board-pdf-placement.selected").length===1','PDF selection count');
  };
  const emptyCanvas=await js('(()=>{const r=document.querySelector(".canvas").getBoundingClientRect();return {x:Math.round(r.right-40),y:Math.round(r.top+40)}})()');
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...emptyCanvas});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...emptyCanvas});
  await wait('document.querySelectorAll(".board-pdf-placement.selected").length===0','unselected PDFs');
  result.overlap={unselected:await overlapHit('[data-placement=pdf] .pdf-reader-toolbar','[data-placement=pdf-front] .pdf-page','pdf-front')};
  await selectPdf('pdf-front');result.overlap.frontSelected=await overlapHit('[data-placement=pdf] .pdf-reader-toolbar','[data-placement=pdf-front] .pdf-page','pdf-front');
  await selectPdf('pdf');result.overlap.backSelected=await overlapHit('[data-placement=pdf-front] .pdf-page','[data-placement=pdf] .pdf-reader-toolbar','pdf');
  const region=await js('(()=>{const a=document.querySelector("[data-placement=pdf]").getBoundingClientRect(),b=document.querySelector("[data-placement=pdf-front]").getBoundingClientRect();return {x:Math.round(Math.min(a.left,b.left)-15),y:Math.round(Math.min(a.top,b.top)-15),right:Math.round(Math.max(a.right,b.right)+15),bottom:Math.round(Math.max(a.bottom,b.bottom)+15)}})()');
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:region.x,y:region.y});win.webContents.sendInputEvent({type:'mouseMove',button:'left',x:region.right,y:region.bottom});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:region.right,y:region.bottom});
  await wait('document.querySelectorAll(".board-pdf-placement.selected").length===2','marquee-selected PDFs');result.overlap.bothSelected=await overlapHit('[data-placement=pdf] .pdf-reader-toolbar','[data-placement=pdf-front] .pdf-page','pdf-front');
  readerFS.writeFileSync(${JSON.stringify(join(folder,'overlap.png'))},(await win.capturePage()).toPNG());
  await js('(async()=>{const s=window.__readerTestSession;await s.board('+JSON.stringify(beforeOverlap)+',"Restore reader fixture");const p='+JSON.stringify(beforeOverlap)+'.cards.find(p=>p.id==="pdf");window.__readerTestNavigation.set({x:20-p.x,y:40-p.y,zoom:1});window.__readerTestNavigation.flush();})()');
  await wait('!document.querySelector("[data-placement=pdf-front]")&&document.querySelectorAll(".board-pdf .pdf-page").length===20','restored reader fixture');
  phase('PDF note hit areas and single-page comments');
  result.noteHits=await require(${JSON.stringify(join(root,'scripts/performance/pdf-note-hits.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});
  phase('popup');
  await js('document.querySelector(".board-pdf-actions button").click()');await wait('document.querySelectorAll(".pdf-reading-layout .pdf-page").length===20','PDF popup');await readerPause(700);
  result.pageCache=await js('({hits:window.__readerPdfCacheHits,bytes:window.__readerPdfCache.bytes,limit:window.__readerPdfCache.limit})');if(!result.pageCache.hits||result.pageCache.bytes>result.pageCache.limit)throw Error('PDF page images were not reused within their budget');
  result.popup=await js('({canvases:document.querySelectorAll(".pdf-reading-layout .pdf-page canvas").length,pages:document.querySelectorAll(".pdf-reading-layout .pdf-page").length})');if(result.popup.canvases>4)throw Error('Popup rendered offscreen pages '+JSON.stringify(result.popup));
  }
  phase('root board, icons, explorer and graph docks');
  if(${uiOnly})result.ui=await require(${JSON.stringify(join(root,'scripts/performance/ui-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});else
  if(${settingsOnly})result.settings=await require(${JSON.stringify(join(root,'scripts/performance/settings-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});else
  if(${extractionOnly})result.extractionFeedback=await require(${JSON.stringify(join(root,'scripts/performance/extraction-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});else
  if(${brandingOnly})result.branding=await require(${JSON.stringify(join(root,'scripts/performance/branding-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});else
  if(${arrangementOnly})result.arrangement=await require(${JSON.stringify(join(root,'scripts/performance/arrangement-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});else
  if(${cardOnly})result.cardFeedback=await require(${JSON.stringify(join(root,'scripts/performance/card-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});else
  result.navigation=await require(${JSON.stringify(join(root,'scripts/performance/navigation-feedback.cjs'))})({win,js,wait,pause:readerPause,folder:${JSON.stringify(folder)}});
  result.passed=true;
 }catch(error){result.error=String(error);console.error(error);const desktop=[...desktops.values()][0];if(desktop){await desktop.window.capturePage().then(image=>readerFS.writeFileSync(${JSON.stringify(join(folder,'failure.png'))},image.toPNG())).catch(()=>{});}}
 readerFS.writeFileSync(${JSON.stringify(report)},JSON.stringify(result,null,2));for(const d of desktops.values())d.closing=true;readerApp.exit(result.passed?0:1);
});
`;
await fs.writeFile(join(project,'dist/main.cjs'),prefix+await fs.readFile(join(project,'dist/main.cjs'),'utf8')+probe);
const child=spawn(electron,[project],{cwd:root,stdio:'inherit',env:{...process.env,HEAVENS_DOOR_WORKSPACE:workspace}}),timer=setTimeout(()=>child.kill(),120000);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
const result=JSON.parse(await fs.readFile(report,'utf8'));console.log(JSON.stringify(result,null,2));assert.equal(code,0,'Native reader checks failed; see '+report);assert.equal(result.passed,true,'Native reader checks did not finish; see '+report);
