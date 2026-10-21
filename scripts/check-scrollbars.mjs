// Run with: node_modules/.bin/electron scripts/check-scrollbars.mjs
import {app,BrowserWindow} from 'electron';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {transformSync} from 'esbuild';
const repo=fileURLToPath(new URL('..',import.meta.url));
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});try{
 await win.loadURL('data:text/html,<html><head></head><body></body></html>');
 const css=readFileSync(repo+'src/renderer/styles.css','utf8');
 const js=transformSync(readFileSync(repo+'src/renderer/scrollbar-space.ts','utf8'),{loader:'ts',format:'iife',globalName:'scrollbars'}).code;
 const result=await win.webContents.executeJavaScript(`(async()=>{
 const sheet=document.createElement('style');sheet.textContent=${JSON.stringify(css)};document.head.append(sheet);
 ${js};
 const check=(yes,message)=>{if(!yes)throw Error(message);};const results=[];
 for(const mode of ['native','classic','zero-gutter']){
  const style=document.createElement('style');style.textContent=mode==='classic'?'*{scrollbar-width:auto!important}':mode==='zero-gutter'?'*{scrollbar-width:none!important}':'';document.head.append(style);
  const dispose=scrollbars.installScrollbarSpace();
  const card=document.createElement('article');card.className='board-card';card.style.cssText='position:relative;width:340px;height:160px';
  card.innerHTML='<div class="card-preview prose"><p>Some text that wraps across more than one line on a small whiteboard card.</p></div>';document.body.append(card);
  const preview=card.firstElementChild,p=preview.firstElementChild;
  const measure=()=>({width:p.getBoundingClientRect().width,left:p.getBoundingClientRect().left,right:preview.getBoundingClientRect().right-p.getBoundingClientRect().right});
  const before=measure();p.style.height='400px';card.classList.add('selected');const after=measure();
  check(before.width===after.width&&before.left===after.left,'card selection/overflow changes text geometry '+JSON.stringify({mode,before,after,space:document.documentElement.style.getPropertyValue('--scrollbar-space'),padding:getComputedStyle(preview).paddingRight,gutter:getComputedStyle(preview).scrollbarGutter,supported:CSS.supports('scrollbar-gutter','stable')}));check(Math.abs(after.right-Math.max(20,parseFloat(document.documentElement.style.getPropertyValue('--scrollbar-space'))))<1,'scrollbar adds to card margin: '+JSON.stringify(after));
  const editor=document.createElement('div');editor.className='card-editor';editor.innerHTML='<div class="editor-body prose"><p>Editable text</p></div>';preview.replaceWith(editor);const editing=editor.querySelector('p').getBoundingClientRect();check(editing.width===after.width,'editing changes card text width');check(editing.left===after.left,'editing shifts card text');editor.replaceWith(preview);
  card.className='board-card auto-height';card.style.height='auto';const natural=measure();check(Math.abs(natural.right-10)<1,'auto-height cards keep full padding');
  results.push({mode,gutter:document.documentElement.style.getPropertyValue('--scrollbar-space'),before,after});card.remove();
  const menu=document.createElement('div');menu.className='context-menu';menu.style.cssText='position:relative;width:260px;height:150px';menu.innerHTML='<div>Menu contents</div>';document.body.append(menu);const width=menu.firstElementChild.getBoundingClientRect().width;menu.firstElementChild.style.height='400px';check(menu.firstElementChild.getBoundingClientRect().width===width,'menu scrollbar changes content width');menu.remove();
  const strip=document.createElement('div');strip.className='view-records';strip.style.cssText='width:300px;height:100px';strip.innerHTML='<div style="height:20px;width:100px"></div>';document.body.append(strip);const height=strip.clientHeight;strip.firstElementChild.style.width='600px';check(strip.clientHeight===height,'horizontal scrollbar changes viewport height');strip.remove();dispose();style.remove();
 }
 return results;
})()`);
 console.log(JSON.stringify(result));app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
