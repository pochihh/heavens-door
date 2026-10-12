import { ui } from './text/ui';
import { app, BrowserWindow, dialog, ipcMain, protocol, net, Menu, shell, clipboard, nativeImage, ClipboardItem } from 'electron';
import { Worker } from 'node:worker_threads';
import {loadSparkleBridgeForApp} from 'electron-sparkle-updater';
import {autoUpdater} from 'electron-updater';
import {AppUpdates,APP_ID,DOWNLOAD_PAGE,RELEASE_API} from './updates';
import { join, resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import {readAppSettings,writeHardwareAcceleration} from './app-settings';
import {WorkspaceRegistry} from './core/registry';
import {importImage,resolveImage,MAX_IMAGE_BYTES} from './core/images';
import {workspacePath} from './core/files';
import type { Request, Snapshot, Mutation, Card, WindowAction, AppSettings, GraphicsDiagnostics, UpdateState } from './shared';

app.setName(ui.common.appName);
if(process.platform==='win32')app.setAppUserModelId(APP_ID);
const appSettingsFile=join(app.getPath('userData'),'app-settings.json');
const initialAppSettings=readAppSettings(appSettingsFile);
let hardwareAcceleration=initialAppSettings.hardwareAcceleration,settingsWarning=initialAppSettings.warning,gpuReady=false;
if(!initialAppSettings.hardwareAcceleration)app.disableHardwareAcceleration();
app.on('gpu-info-update',()=>{gpuReady=true;});
const appSettings=():AppSettings=>({hardwareAcceleration,restartRequired:hardwareAcceleration!==initialAppSettings.hardwareAcceleration,warning:settingsWarning});
protocol.registerSchemesAsPrivileged([{scheme:'heavens-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
interface Host { root:string; key:string; worker:Worker; call<T>(request:Request):Promise<T> }
interface Desktop { window:BrowserWindow; opening?:Promise<Snapshot>; host?:Host; closing:boolean; action:WindowAction|null; timer?:ReturnType<typeof setTimeout> }
let registry:WorkspaceRegistry;
let updates:AppUpdates;
const desktops=new Map<number,Desktop>(), hosts=new Map<string,Promise<Host>>(), assets=new Map<string,Host>();
// One worker owns a workspace's index and write queue, shared by all its windows.
// ponytail: retain opened workers until quit; evict idle hosts if many workspaces become common.
async function getHost(folder:string):Promise<Host> {
  const root=await fs.realpath(folder), found=hosts.get(root); if(found) return found;
  const starting=(async()=>{
    const key=createHash('sha256').update(root).digest('hex'), worker=new Worker(join(__dirname,'workspace-worker.cjs'));
    let nextId=0;
    const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(reason:Error)=>void}>();
    const host:Host={root,key,worker,call:<T>(request:Request)=>new Promise<T>((resolve,reject)=>{
      const id=++nextId;pending.set(id,{resolve:value=>resolve(value as T),reject});worker.postMessage({id,request});
    })};
    worker.on('message',message=>{
      if(message.event){broadcast(host);return;}
      const request=pending.get(message.id);if(!request)return;pending.delete(message.id);
      if(message.error)request.reject(new Error(message.error));else request.resolve(message.result);
    });
    worker.on('error',error=>{for(const p of pending.values())p.reject(error instanceof Error?error:new Error(String(error)));pending.clear();});
    try {
      await host.call({kind:'open',root,cache:join(app.getPath('userData'),'indexes',key)});
      assets.set(key,host);return host;
    } catch(error){void worker.terminate();throw error;}
  })();
  hosts.set(root,starting);
  try{return await starting;}catch(error){hosts.delete(root);throw error;}
}
function broadcast(host:Host) {
  for(const d of desktops.values())if(d.host===host&&!d.window.isDestroyed())d.window.webContents.send('workspace:change');
}
async function snapshot(d:Desktop) {
  if(!d.host)return null;
  return {...await d.host.call<Snapshot>({kind:'snapshot'}),assetKey:d.host.key};
}
async function open(d:Desktop,folder:string){const host=await getHost(folder);await registry.register(host.root);const value=await host.call<Snapshot>({kind:'snapshot'});d.host=host;return {...value,assetKey:host.key};}
function trusted(event:Electron.IpcMainInvokeEvent|Electron.IpcMainEvent) {
  const d=[...desktops.values()].find(d=>d.window.webContents===event.sender);
  if(!d||event.senderFrame!==d.window.webContents.mainFrame)throw new Error(ui.errors.untrustedSender);return d;
}
function clearAction(d:Desktop){clearTimeout(d.timer);d.action=null;}
function finishAction(d:Desktop,action:WindowAction){
  clearAction(d);if(action==='update'){if(updates.savedWindow(d.window.id)){for(const desktop of desktops.values())desktop.closing=true;try{updates.install();}catch{for(const desktop of desktops.values())desktop.closing=false;}}return;}if(action==='reload')d.window.webContents.reload();else{d.closing=true;d.window.close();}
}
function cancelUpdate(){updates.cancelInstall();for(const desktop of desktops.values())if(desktop.action==='update')clearAction(desktop);}
function installUpdate(){
  const windows=[...desktops.values()].filter(d=>!d.window.isDestroyed());if(windows.some(d=>d.action))throw new Error(ui.updates.saveFailed);
  updates.startInstall(windows.map(d=>d.window.id));for(const d of windows)prepareAction(d,'update');
}
async function promptUpdate(state:UpdateState,manual=false){
  const d=focused()??[...desktops.values()][0];if(!d||d.window.isDestroyed())return;
  if(state.status==='available'){
    const buttons=state.canInstall?[ui.updates.download,ui.updates.later,ui.updates.website]:[ui.updates.website,ui.updates.later];
    const result=await dialog.showMessageBox(d.window,{type:'info',message:ui.updates.available(state.version!),detail:state.canInstall?ui.updates.status.available:ui.updates.manualHelp,buttons,cancelId:1,defaultId:0});
    if(result.response===(state.canInstall?2:0)){await shell.openExternal(DOWNLOAD_PAGE);return;}
    if(state.canInstall&&result.response===0){const downloaded=await updates.download();if(downloaded.status==='ready'){const choice=await dialog.showMessageBox(d.window,{type:'info',message:ui.updates.status.ready,buttons:[ui.updates.install,ui.updates.later],cancelId:1});if(choice.response===0)installUpdate();}else await promptUpdate(downloaded,true);}
  }else if(manual){const result=await dialog.showMessageBox(d.window,{type:state.status==='error'?'warning':'info',message:ui.updates.status[state.status],detail:state.message,buttons:[ui.updates.close,ui.updates.website],cancelId:0});if(result.response===1)await shell.openExternal(DOWNLOAD_PAGE);}
}
async function initializeSparkle(){
  if(!app.isPackaged||process.platform!=='darwin')return;
  try{
    const config=JSON.parse(await fs.readFile(join(process.resourcesPath,'sparkle.json'),'utf8'));
    const feed=new URL(config.feedUrl);
    if(!(feed.protocol==='https:'||feed.protocol==='http:'&&feed.hostname==='127.0.0.1')||typeof config.publicEdKey!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(config.publicEdKey))throw new Error('Invalid Sparkle configuration');
    const bridge=await loadSparkleBridgeForApp(message=>console.error('[updates]',message));
    if(bridge?.init({appcastUrl:feed.href,publicEdKey:config.publicEdKey}))return bridge;
  }catch(error){console.error('[updates] Sparkle unavailable; using download fallback.',error);}
}
async function latestRelease(){
  const response=await net.fetch(RELEASE_API,{headers:{Accept:'application/vnd.github+json','User-Agent':ui.common.appName},signal:AbortSignal.timeout(15000)});
  if(response.status===404)return null;if(!response.ok)throw new Error(ui.updates.checkFailed(response.status));
  const value:unknown=await response.json();if(!value||typeof value!=='object'||!('tag_name' in value)||typeof value.tag_name!=='string')throw new Error(ui.updates.invalidVersion);return value.tag_name.replace(/^v/,'');
}
function prepareAction(d:Desktop,action:WindowAction) {
  if(d.window.isDestroyed()||d.action)return;d.action=action;
  d.timer=setTimeout(()=>{
    if(action==='update'){cancelUpdate();void dialog.showMessageBox(d.window,{type:'warning',message:ui.updates.saveTimeout});return;}
    void dialog.showMessageBox(d.window,{
      type:'warning',message:action==='reload'?ui.desktop.reloadUnresponsive:ui.desktop.closeUnresponsive,
      detail:ui.desktop.unsavedChangesWarning,
      buttons:[ui.common.cancel,action==='reload'?ui.desktop.reloadAnyway:ui.desktop.closeAnyway],defaultId:0,cancelId:0,
    }).then(({response})=>{if(d.action!==action)return;if(response===1)finishAction(d,action);else clearAction(d);});
  },4000);
  d.window.webContents.send('window:closing',action);
}
function focused(){const win=BrowserWindow.getFocusedWindow();return win?desktops.get(win.id):undefined;}
async function createWindow(folder?:string){
  const win=new BrowserWindow({
    width:1440,height:940,minWidth:760,minHeight:500,icon:app.isPackaged?join(process.resourcesPath,'icon.png'):join(app.getAppPath(),'build/icon.png'),backgroundColor:'#f3f3f3',title:ui.common.appName,
    titleBarStyle:'hidden',trafficLightPosition:{x:8,y:13},
    ...(process.platform!=='darwin'?{titleBarOverlay:{color:'#f3f3f3',symbolColor:'#555555',height:42}}:{}),
    webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true},
  });
  const d:Desktop={window:win,closing:false,action:null};desktops.set(win.id,d);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('close',event=>{if(!d.closing){event.preventDefault();prepareAction(d,'close');}});
  win.on('closed',()=>{if(d.action==='update')cancelUpdate();clearAction(d);desktops.delete(win.id);});
  // Load the shell while the worker opens/indexes the workspace, so startup has feedback.
  if(folder){d.opening=open(d,folder);void d.opening.catch(()=>undefined);}
  if(process.env.HEAVENS_DOOR_DEV_URL)await win.loadURL(process.env.HEAVENS_DOOR_DEV_URL);
  else await win.loadFile(join(__dirname,'renderer/index.html'));
}
void app.whenReady().then(async()=>{
  app.setAboutPanelOptions({applicationName:ui.common.appName,applicationVersion:app.getVersion(),iconPath:app.isPackaged?join(process.resourcesPath,'icon.png'):join(app.getAppPath(),'build/icon.png')});
  const sparkle=await initializeSparkle();
  updates=new AppUpdates(autoUpdater,app.getVersion(),app.isPackaged&&(process.platform==='win32'||!!sparkle),latestRelease,state=>{for(const d of desktops.values()){if(state.status==='error'){d.closing=false;if(d.action==='update')clearAction(d);}if(!d.window.isDestroyed())d.window.webContents.send('app:update-change',state);}},sparkle);
  ipcMain.handle('app:update-state',event=>{trusted(event);return updates.state;});
  ipcMain.handle('app:check-updates',event=>{trusted(event);return updates.check();});
  ipcMain.handle('app:download-update',event=>{trusted(event);return updates.download();});
  ipcMain.handle('app:install-update',event=>{trusted(event);installUpdate();});
  ipcMain.handle('app:download-page',event=>{trusted(event);return shell.openExternal(DOWNLOAD_PAGE);});
  registry=new WorkspaceRegistry(join(app.getPath('userData'),'workspaces.json'));
  ipcMain.handle('app:settings',event=>{trusted(event);return appSettings();});
  ipcMain.handle('app:hardware-acceleration',(event,enabled:unknown)=>{
    trusted(event);
    hardwareAcceleration=writeHardwareAcceleration(appSettingsFile,enabled);settingsWarning=undefined;
    for(const d of desktops.values())if(!d.window.isDestroyed())d.window.webContents.send('app:settings-change');
    return appSettings();
  });
  ipcMain.handle('app:graphics-diagnostics',(event):GraphicsDiagnostics=>{
    trusted(event);
    return {hardwareAcceleration:gpuReady?app.isHardwareAccelerationEnabled():null,features:gpuReady?{...app.getGPUFeatureStatus()}:null,electron:process.versions.electron,chromium:process.versions.chrome};
  });
  ipcMain.handle('workspace:list',(event,refresh:unknown)=>{trusted(event);if(refresh!==undefined&&typeof refresh!=='boolean')throw new Error(ui.errors.invalidWorkspaceRegistry);return registry.list(refresh===true);});
  ipcMain.handle('workspace:reorder',(event,roots:unknown)=>{trusted(event);if(!Array.isArray(roots)||roots.some(root=>typeof root!=='string'))throw new Error(ui.errors.invalidWorkspaceRegistry);return registry.reorder(roots);});
  ipcMain.handle('workspace:rename',async(event,root:unknown,name:unknown)=>{
    trusted(event);if(typeof root!=='string'||typeof name!=='string'||!name.trim()||name.trim().length>120||!(await registry.list()).some(w=>w.root===root))throw new Error(ui.errors.invalidWorkspaceRegistry);
    if((await registry.list()).find(w=>w.root===root)?.status==='available'){const host=await getHost(root);await host.call({kind:'preferences',patch:{workspaceName:name.trim()}});broadcast(host);}
    return registry.rename(root,name);
  });
  ipcMain.handle('workspace:relink',async(event,root:unknown)=>{
    const d=trusted(event);if(typeof root!=='string'||!(await registry.list()).some(w=>w.root===root))throw new Error(ui.errors.invalidWorkspaceRegistry);
    const result=await dialog.showOpenDialog(d.window,{title:ui.workspace.relinkTitle,properties:['openDirectory']});
    if(result.canceled||!result.filePaths[0])return registry.list();
    const previous=(await registry.list()).find(w=>w.root===root)!;
    const host=await getHost(result.filePaths[0]);
    if((await registry.list()).some(w=>w.root===host.root&&w.root!==root))throw new Error(ui.errors.invalidWorkspaceRegistry);
    await host.call({kind:'preferences',patch:{workspaceName:previous.name}});await registry.relink(root,host.root);
    for(const desktop of desktops.values())if(desktop.host?.root===root){await open(desktop,host.root);broadcast(host);}return registry.list();
  });
  ipcMain.handle('workspace:unregister',async(event,root:unknown)=>{
    const d=trusted(event);if(typeof root!=='string'||root===d.host?.root||!(await registry.list()).some(w=>w.root===root))throw new Error(ui.errors.unregisterWorkspace);
    return registry.unregister(root);
  });
  ipcMain.handle('workspace:registered',async(event,root:unknown)=>{
    const d=trusted(event),workspace=typeof root==='string'?(await registry.list()).find(w=>w.root===root):undefined;
    if(!workspace)throw new Error(ui.errors.workspaceIsNotRegistered);
    if(workspace.status!=='available')throw new Error(ui.workspace.cannotOpen(workspace.name,ui.workspace.status[workspace.status]));
    return open(d,workspace.root);
  });
  ipcMain.handle('image:resolve',(event,notePath:string,source:string)=>{const d=trusted(event);if(!d.host)throw new Error(ui.errors.unknownWorkspace);return resolveImage(d.host.root,notePath,source);});
  ipcMain.handle('image:link',async(event,notePath:unknown,url:unknown)=>{
    const d=trusted(event);if(!d.host||typeof notePath!=='string'||typeof url!=='string'||url.length>4096)throw new Error('Invalid image link');
    if(!/^https?:\/\//i.test(url)){const matches=await resolveImage(d.host.root,notePath,url);if(matches.length!==1)throw new Error(matches.length?'Several files match. Use a full relative path.':'Image file not found.');return {src:matches[0],alt:''};}
    const address=new URL(url);if(address.username||address.password)throw new Error('Use an image URL without credentials.');
    const response=await net.fetch(address.href,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Image download failed.');
    const type=response.headers.get('content-type')?.split(';')[0]??'';if(!type.startsWith('image/'))throw new Error('The link does not point to an image.');
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty image response.');const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE_BYTES)throw new Error('Choose an image smaller than 25 MB.');chunks.push(value);}}finally{await reader.cancel();}
    return importImage(d.host.root,notePath,decodeURIComponent(address.pathname.split('/').pop()||'image'),type,Buffer.concat(chunks));
  });
  ipcMain.handle('image:import',async(event,path:string,name:string,type:string,data:Uint8Array)=>{
    const d=trusted(event);if(!d.host)throw new Error(ui.errors.unknownWorkspace);
    return importImage(d.host.root,path,name,type,data);
  });
  ipcMain.handle('image:read',async(event,path:unknown)=>{
    const d=trusted(event);if(!d.host||typeof path!=='string')throw new Error(ui.errors.invalidWorkspaceFile);
    const file=await workspacePath(d.host.root,path),stat=await fs.stat(file);
    if(!stat.isFile()||stat.size>MAX_IMAGE_BYTES||!['.png','.jpg','.jpeg','.gif','.webp','.avif','.svg'].includes(extname(file).toLowerCase()))throw new Error('Choose an image smaller than 25 MB.');
    return new Uint8Array(await fs.readFile(file));
  });
  ipcMain.handle('image:copy',async(event,png:unknown)=>{
    trusted(event);
    if(!(png instanceof Uint8Array)||!png.byteLength||png.byteLength>160*1024*1024)throw new Error('This image is too large to copy.');
    const image=nativeImage.createFromBuffer(Buffer.from(png));
    if(image.isEmpty())throw new Error('This image could not be copied.');
    await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(image.toPNG())],{type:'image/png'})})]);
  });
  ipcMain.handle('workspace:reveal',async(event,path:unknown)=>{
    const d=trusted(event);if(!d.host||typeof path!=='string')throw new Error(ui.errors.invalidWorkspaceFile);
    shell.showItemInFolder(await workspacePath(d.host.root,path));
  });
  protocol.handle('heavens-asset',async request=>{
    try{
      const url=new URL(request.url),host=assets.get(url.host);if(!host)throw new Error(ui.errors.unknownWorkspace);
      const target=await fs.realpath(resolve(host.root,decodeURIComponent(url.pathname).slice(1)));
      if(!target.startsWith(host.root+sep)||!['.png','.jpg','.jpeg','.gif','.webp','.avif','.svg'].includes(extname(target).toLowerCase()))throw new Error(ui.errors.unsupportedAsset);
      return net.fetch(pathToFileURL(target).href);
    }catch{return new Response(ui.desktop.assetUnavailable,{status:404});}
  });
  ipcMain.handle('workspace:choose',async event=>{
    const d=trusted(event),result=await dialog.showOpenDialog(d.window,{title:ui.workspace.open,properties:['openDirectory','createDirectory']});
    return result.canceled?null:open(d,result.filePaths[0]);
  });
  ipcMain.handle('workspace:demo',async event=>{
    const d=trusted(event),parent=join(app.getPath('documents'),"Heaven's Door",'Sample workspaces');
    await fs.mkdir(parent,{recursive:true});
    const root=await fs.mkdtemp(join(parent,'Sample workspace '));await open(d,root);await d.host!.call({kind:'createFolder',parent:'',name:'Ideas'});
    const samples=[
      ['Welcome','# Welcome\n\nA card is a Markdown file. Edit here or arrange it on the whiteboard.\n\n- [ ] Write an idea\n- [ ] Connect two cards\n- [ ] Save a checkpoint\n'],
      ['Connections','# Connections\n\nCards can appear on more than one whiteboard. Each reference edits the same file.\n'],
      ['Reading','# Reading list\n\nCollect sources and keep your notes beside them.\n'],
    ];
    for(let i=0;i<samples.length;i++){
      const result=await d.host!.call<Mutation>({kind:'create',folder:'Ideas',stem:samples[i][0],x:60+i*380,y:90+(i%2)*70});
      const info=result.snapshot.cards.find(c=>c.name===samples[i][0])!,card=await d.host!.call<Card>({kind:'card',path:info.path});
      await d.host!.call({kind:'saveCard',path:card.path,body:samples[i][1],expected:card.revision});
    }
    await d.host!.call({kind:'checkpoint',label:ui.history.sampleWorkspace});return snapshot(d);
  });
  ipcMain.handle('workspace:request',async(event,request:Request)=>{
    const d=trusted(event);if(!d.host||!request||request.kind==='open')throw new Error(ui.errors.unsupportedRequest);
    // Migration is an explicit UI command with a destination review, never an open side effect.
    if(request.kind==='migrateRoot'&&[...desktops.values()].filter(w=>w.host===d.host).length>1)throw new Error(ui.errors.migrationOtherWindows);
    // ponytail: block cross-window history switches until a shared draft-flush barrier exists.
    if(['restore','applyCheckpoint'].includes(request.kind)&&[...desktops.values()].filter(w=>w.host===d.host).length>1)throw new Error(ui.errors.historyOtherWindows);
    const result=await d.host.call(request);
    if(['createSlipboxCard','fileOperation','moveSelection','transfer','placeCard','ensureFolder','createEntry','createFromTemplate','createTemplate','openJournal','trashCard','restoreTrash','create','createFolder','saveCard','saveBoard','setFill','moveViewCard','setViewProperty','write','restore','applyCheckpoint','preferences','checkpoint','migrateRoot'].includes(request.kind))broadcast(d.host);
    return result;
  });
  ipcMain.handle('workspace:current',async event=>{const d=trusted(event),opening=d.opening;try{if(opening)await opening;return await snapshot(d);}finally{d.opening=undefined;}});
  ipcMain.handle('window:new',async(event,same:unknown)=>{
    const d=trusted(event);if(typeof same!=='boolean')throw new Error(ui.errors.invalidWindowRequest);await createWindow(same?d.host?.root:undefined);
  });
  ipcMain.on('window:reload',event=>prepareAction(trusted(event),'reload'));
  ipcMain.on('window:ready',(event,action:unknown)=>{
    const d=trusted(event);if((action==='close'||action==='reload'||action==='update')&&action===d.action)finishAction(d,action);
  });
  ipcMain.on('window:cancel',(event,action:unknown)=>{const d=trusted(event);if(action===d.action){if(action==='update')cancelUpdate();else clearAction(d);}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:ui.common.appName,submenu:[{label:ui.updates.about,role:'about' as const},{label:ui.updates.check,click:()=>{void updates.check().then(state=>promptUpdate(state,true)).catch(console.error);}},{type:'separator' as const},{role:'quit' as const}]}]:[]),
    {label:ui.desktop.file,submenu:[
      {label:ui.desktop.newWindow,accelerator:'CmdOrCtrl+Shift+N',click:()=>{void createWindow();}},
      {label:ui.workspace.newWindow,click:()=>{void createWindow(focused()?.host?.root);}},
      {type:'separator'},{role:'close'},
    ]},
    {label:ui.desktop.edit,submenu:[{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:ui.desktop.view,submenu:[{label:ui.common.reload,accelerator:'CmdOrCtrl+R',click:()=>{const d=focused();if(d)prepareAction(d,'reload');}},{type:'separator'},{role:'toggleDevTools'},{role:'togglefullscreen'}]},
    {role:'windowMenu'},
    ...(process.platform!=='darwin'?[{label:ui.desktop.help,submenu:[{label:ui.updates.about,click:()=>app.showAboutPanel()},{label:ui.updates.check,click:()=>{void updates.check().then(state=>promptUpdate(state,true)).catch(console.error);}}]}]:[]),
  ]));
  await createWindow(process.env.HEAVENS_DOOR_WORKSPACE);
  if(app.isPackaged)setTimeout(()=>{void updates.check().then(state=>promptUpdate(state)).catch(console.error);},15000).unref();
  app.on('activate',()=>{if(!desktops.size)void createWindow();});
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{for(const host of assets.values())void host.worker.terminate();});
