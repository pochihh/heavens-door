import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {AppUpdater} from 'electron-updater';
import type {SparkleBridge,SparkleBridgeEvent} from 'electron-sparkle-updater';
import {AppUpdates,newerVersion} from '../src/updates';
import {UpdateSettings} from '../src/renderer/UpdateSettings';
import type {Bridge,UpdateState} from '../src/shared';

class FakeUpdater extends EventEmitter {
  autoDownload=true;autoInstallOnAppQuit=true;allowPrerelease=true;allowDowngrade=true;checks=0;downloads=0;installs=0;failure=false;
  async checkForUpdates(){this.checks++;await Promise.resolve();this.emit('update-available',{version:'0.1.27'});}
  async downloadUpdate(){this.downloads++;await Promise.resolve();if(this.failure)throw new Error('Download failed');this.emit('download-progress',{percent:75});this.emit('update-downloaded',{version:'0.1.27'});return [];}
  quitAndInstall(){this.installs++;}
}
test('updates coalesce requests, require explicit download, and save every window before installation',async()=>{
  const fake=new FakeUpdater(),states:UpdateState[]=[],updates=new AppUpdates(fake as unknown as AppUpdater,'0.1.2',true,async()=>null,state=>states.push(state));
  assert.equal(fake.autoDownload,false);assert.equal(fake.autoInstallOnAppQuit,false);assert.equal(fake.allowDowngrade,false);assert.equal(fake.allowPrerelease,false);
  await Promise.all([updates.check(),updates.check()]);assert.equal(fake.checks,1);assert.equal(fake.downloads,0);assert.equal(updates.state.status,'available');
  await Promise.all([updates.download(),updates.download()]);assert.equal(fake.downloads,1);assert.equal(updates.state.status,'ready');assert.ok(states.some(state=>state.progress===75));
  updates.startInstall([1,2]);assert.throws(()=>updates.install());assert.equal(updates.savedWindow(1),false);assert.equal(fake.installs,0);assert.equal(updates.savedWindow(2),true);assert.equal(updates.savedWindow(2),false);updates.install();assert.equal(fake.installs,1);
  fake.emit('update-downloaded',{version:'0.1.27'});updates.startInstall([1,2]);updates.savedWindow(1);updates.cancelInstall();assert.equal(updates.state.status,'ready');assert.match(updates.state.message!,/could not finish saving/);assert.throws(()=>updates.install());assert.equal(fake.installs,1);
  await assert.rejects(updates.download());fake.emit('error',new Error('Signature mismatch'));assert.equal(updates.state.status,'error');assert.match(updates.state.message!,/Signature/);
});
test('unsigned/development builds check public releases and always retain the website fallback',async()=>{
  const fake=new FakeUpdater();let version:string|null='0.1.27',failure=false;
  const updates=new AppUpdates(fake as unknown as AppUpdater,'0.1.2',false,async()=>{if(failure)throw new Error('Offline');return version;},()=>{});
  assert.equal((await updates.check()).status,'available');assert.equal(updates.state.canInstall,false);assert.equal(fake.checks,0);await assert.rejects(updates.download());assert.throws(()=>updates.startInstall([1]));
  version='0.1.2';assert.equal((await updates.check()).status,'up-to-date');version=null;await updates.check();assert.match(updates.state.message!,/No published release/);
  failure=true;assert.equal((await updates.check()).status,'error');assert.equal(updates.state.message,'Offline');
  assert.equal(newerVersion('0.1.271','0.1.27'),true);assert.equal(newerVersion('0.2.2','0.1.2718'),true);assert.equal(newerVersion('0.1.2','0.1.27'),false);assert.throws(()=>newerVersion('0.1.2-beta','0.1.2'));
});
test('update settings show manual fallback, download progress, install control and failures',async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  let state:UpdateState={currentVersion:'0.1.2',canInstall:false,status:'idle'},changed=(value:UpdateState)=>{state=value;},website=0,install=0,stopped=false;
  window.door={updateState:async()=>state,onUpdateChange:callback=>{changed=callback;return()=>{stopped=true;};},checkUpdates:async()=>{changed({...state,status:'available',version:'0.1.27'});return state;},openDownloadPage:async()=>{website++;},installUpdate:async()=>{install++;}} as Bridge;
  const root=createRoot(document.getElementById('root')!),click=async(text:string)=>act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===text)!.click());
  try{await act(async()=>root.render(<UpdateSettings/>));assert.match(document.body.textContent!,/Version 0.1.2/);await click('Check for updates');assert.match(document.body.textContent!,/0.1.27 is available/);assert.ok(![...document.querySelectorAll('button')].some(button=>button.textContent==='Download update'));await click('Open download page');assert.equal(website,1);
    await act(async()=>changed({...state,canInstall:true,status:'downloading',progress:55}));assert.equal(document.querySelector('progress')!.value,55);
    await act(async()=>changed({...state,canInstall:true,status:'ready'}));await click('Restart and install');assert.equal(install,1);
    await act(async()=>changed({...state,status:'error',message:'Signature mismatch'}));assert.match(document.querySelector('[role=alert]')!.textContent!,/Signature/);await click('Open download page');assert.equal(website,2);
  }finally{await act(async()=>root.unmount());dom.window.close();}assert.equal(stopped,true);
});

class FakeSparkle implements SparkleBridge {
  checks=0;installs=0;discards=0;automatic=true;handler:((event:SparkleBridgeEvent)=>void)|null=null;
  init(){return true;}checkForUpdates(){this.checks++;}installUpdateNow(){this.installs++;}installUpdateOnQuit(){throw new Error('Must never install on quit');}
  discardDownloadedUpdate(){this.discards++;}setAutomaticChecks(value:boolean){this.automatic=value;}setEventHandler(handler:((event:SparkleBridgeEvent)=>void)|null){this.handler=handler;}
  emit(event:SparkleBridgeEvent){this.handler?.(event);}
}
test('Sparkle uses release checks without downloading and waits for explicit install and every saved window',async()=>{
  const native=new FakeUpdater(),sparkle=new FakeSparkle();const updates=new AppUpdates(native as unknown as AppUpdater,'0.1.2',true,async()=>'0.1.27',()=>{},sparkle);
  await updates.check();assert.equal(updates.state.status,'available');assert.equal(sparkle.checks,0);assert.equal(native.checks,0);assert.equal(sparkle.automatic,false);
  const download=updates.download(),same=updates.download();assert.equal(download,same);assert.equal(sparkle.checks,1);assert.equal(sparkle.discards,1);
  sparkle.emit({type:'update-available',version:'0.1.27'});assert.equal(updates.state.status,'downloading');
  sparkle.emit({type:'download-progress',percent:65});assert.equal(updates.state.progress,65);sparkle.emit({type:'update-downloaded',version:'0.1.27'});await download;
  assert.equal(updates.state.status,'ready');assert.equal(sparkle.installs,0);updates.startInstall([1,2]);updates.savedWindow(1);updates.cancelInstall();assert.equal(updates.state.status,'ready');assert.equal(sparkle.installs,0);
  updates.startInstall([1,2]);updates.savedWindow(1);assert.throws(()=>updates.install());updates.savedWindow(2);updates.install();assert.equal(sparkle.installs,1);assert.equal(native.installs,0);
});
test('Sparkle rejects download failures and malformed versions without installing',async()=>{
  const sparkle=new FakeSparkle(),updates=new AppUpdates(new FakeUpdater() as unknown as AppUpdater,'0.1.2',true,async()=>'0.1.27',()=>{},sparkle);
  await updates.check();let download=updates.download();sparkle.emit({type:'error',message:'Invalid EdDSA signature'});await download;assert.equal(updates.state.status,'error');assert.match(updates.state.message!,/signature/);assert.equal(sparkle.installs,0);
  await updates.check();download=updates.download();sparkle.emit({type:'update-downloaded',version:'invalid'});await download;assert.equal(updates.state.status,'error');assert.equal(sparkle.installs,0);
});
