/* eslint-disable @typescript-eslint/no-require-imports -- Native screenshot regression. */
const fs=require('node:fs'),path=require('node:path');
module.exports=async({win,js,wait,pause,folder})=>{
 const initial=await js('window.__retainedNav.current'),results=[];
 const outside=await js('(()=>{const r=document.querySelector("[data-tab-key$=Other]").getBoundingClientRect();return {x:Math.round(r.left+20),y:Math.round(r.top+10)}})()');
 win.webContents.sendInputEvent({type:'mouseMove',...outside});
 for(const id of ['p2','p4500']){
  const entry=await js('window.__retainedSurface.entries.find(e=>e.id==='+JSON.stringify(id)+')');
  await js('(()=>{window.__retainedNav.set({x:60-'+entry.x+'*.6,y:60-'+entry.y+'*.6,zoom:.6});window.__retainedNav.flush();})()');
  await wait('(()=>{const img=document.querySelector("[data-placement='+id+'] img");return img?.complete&&img.naturalWidth>0;})()','readable '+id+' image');await pause(700);
  const point=await js('(()=>{const r=document.querySelector("[data-placement='+id+'] img").getBoundingClientRect(),v=document.querySelector(".canvas").getBoundingClientRect(),c=window.__retainedNav.current;return {x:(r.left+r.width*.65-v.left-c.x)/c.zoom,y:(r.top+r.height*.2-v.top-c.y)/c.zoom};})()');
  for(const zoom of [.06,.024,.008,.06]){
   await js('(()=>{window.__retainedNav.set({x:400-'+point.x+'*'+zoom+',y:300-'+point.y+'*'+zoom+',zoom:'+zoom+'});window.__retainedNav.flush();})()');await pause(200);
   await js('(()=>{window.__testPreviews.clear();window.__retainedSurface.tiles.clear();window.__retainedSurface.schedule();})()');await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const at=await js('(()=>{const r=document.querySelector(".canvas").getBoundingClientRect();return {x:Math.round(r.left+400),y:Math.round(r.top+300)}})()'),image=await win.capturePage({...at,width:1,height:1}),bytes=image.getBitmap(),b=bytes[0],g=bytes[1],r=bytes[2];
   results.push({id,zoom,r,g,b,stats:await js('window.__retainedSurface.stats()')});
   if(r-g<20||r-b<20){fs.writeFileSync(path.join(folder,'image-missing.png'),(await win.capturePage()).toPNG());throw Error('Previously visible image disappeared: '+JSON.stringify(results.at(-1)));}
  }
 }
 await js('(()=>{window.__retainedNav.set('+JSON.stringify(initial)+');window.__retainedNav.flush();})()');await wait('(()=>{const s=window.__retainedSurface.stats(),ready=[...document.querySelectorAll(".pdf-reader")].every(e=>e.dataset.ready==="true")&&[...document.querySelectorAll(".pdf-page>canvas")].every(c=>c.dataset.pdfPainted==="true")&&s.pending===0&&!document.querySelector("[data-retained-preparing]")&&document.querySelector(".retained-board-surface").dataset.retainedReady==="true",stamp=s.captures+":"+s.compositions;if(!ready||window.__imageStamp!==stamp){window.__imageStamp=stamp;window.__imageSettled=performance.now();}return ready&&performance.now()-window.__imageSettled>650;})()','settled board after image pressure');return results;
};
