import { ui } from './text/ui';
import { app, BrowserWindow, dialog, ipcMain, protocol, net, Menu, shell } from 'electron';
import { Worker } from 'node:worker_threads';
import { join, resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import {WorkspaceRegistry} from './core/registry';
import {workspacePath} from './core/files';
import type { Request, Snapshot, Mutation, Card, WindowAction } from './shared';

app.setName("Heaven's Door");
protocol.registerSchemesAsPrivileged([{scheme:'heavens-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
interface Host { root:string; key:string; worker:Worker; call<T>(request:Request):Promise<T> }
interface Desktop { window:BrowserWindow; host?:Host; closing:boolean; action:WindowAction|null; timer?:ReturnType<typeof setTimeout> }
let registry:WorkspaceRegistry;
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
  clearAction(d);if(action==='reload')d.window.webContents.reload();else{d.closing=true;d.window.close();}
}
function prepareAction(d:Desktop,action:WindowAction) {
  if(d.window.isDestroyed()||d.action)return;d.action=action;
  d.timer=setTimeout(()=>{
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
    width:1440,height:940,minWidth:760,minHeight:500,backgroundColor:'#f3f3f3',title:ui.common.appName,
    titleBarStyle:'hidden',trafficLightPosition:{x:8,y:13},
    ...(process.platform!=='darwin'?{titleBarOverlay:{color:'#f3f3f3',symbolColor:'#555555',height:42}}:{}),
    webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true},
  });
  const d:Desktop={window:win,closing:false,action:null};desktops.set(win.id,d);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('close',event=>{if(!d.closing){event.preventDefault();prepareAction(d,'close');}});
  win.on('closed',()=>{clearAction(d);desktops.delete(win.id);});
  if(folder)try{await open(d,folder);}catch(error){void dialog.showMessageBox(win,{type:'error',message:ui.desktop.couldNotOpenWorkspace,detail:String(error)});}
  if(process.env.HEAVENS_DOOR_DEV_URL)await win.loadURL(process.env.HEAVENS_DOOR_DEV_URL);
  else await win.loadFile(join(__dirname,'renderer/index.html'));
}
void app.whenReady().then(async()=>{
  registry=new WorkspaceRegistry(join(app.getPath('userData'),'workspaces.json'));
  ipcMain.handle('workspace:list',event=>{trusted(event);return registry.list();});
  ipcMain.handle('workspace:unregister',async(event,root:unknown)=>{
    const d=trusted(event);if(typeof root!=='string'||root===d.host?.root||!(await registry.list()).some(w=>w.root===root))throw new Error(ui.errors.unregisterWorkspace);
    return registry.unregister(root);
  });
  ipcMain.handle('workspace:registered',async(event,root:unknown)=>{
    const d=trusted(event);if(typeof root!=='string'||!(await registry.list()).some(w=>w.root===root))throw new Error(ui.errors.workspaceIsNotRegistered);
    return open(d,root);
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
    const d=trusted(event),parent=await fs.mkdtemp(join(app.getPath('temp'),'heavens-door-demo-')),root=join(parent,'Workspace');
    await fs.mkdir(root);await open(d,root);await d.host!.call({kind:'createFolder',parent:'',name:'Ideas'});
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
    const result=await d.host.call(request);
    if(['create','createFolder','saveCard','saveBoard','setFill','write','restore','preferences','checkpoint','migrateRoot'].includes(request.kind))broadcast(d.host);
    return result;
  });
  ipcMain.handle('workspace:current',event=>snapshot(trusted(event)));
  ipcMain.handle('window:new',async(event,same:unknown)=>{
    const d=trusted(event);if(typeof same!=='boolean')throw new Error(ui.errors.invalidWindowRequest);await createWindow(same?d.host?.root:undefined);
  });
  ipcMain.on('window:reload',event=>prepareAction(trusted(event),'reload'));
  ipcMain.on('window:ready',(event,action:unknown)=>{
    const d=trusted(event);if((action==='close'||action==='reload')&&action===d.action)finishAction(d,action);
  });
  ipcMain.on('window:cancel',(event,action:unknown)=>{const d=trusted(event);if(action===d.action)clearAction(d);});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform==='darwin'?[{label:ui.common.appName,submenu:[{role:'about' as const},{role:'quit' as const}]}]:[]),
    {label:ui.desktop.file,submenu:[
      {label:ui.desktop.newWindow,accelerator:'CmdOrCtrl+Shift+N',click:()=>{void createWindow();}},
      {label:ui.workspace.newWindow,click:()=>{void createWindow(focused()?.host?.root);}},
      {type:'separator'},{role:'close'},
    ]},
    {label:ui.desktop.edit,submenu:[{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:ui.desktop.view,submenu:[{label:ui.common.reload,accelerator:'CmdOrCtrl+R',click:()=>{const d=focused();if(d)prepareAction(d,'reload');}},{type:'separator'},{role:'toggleDevTools'},{role:'togglefullscreen'}]},
    {role:'windowMenu'},
  ]));
  await createWindow(process.env.HEAVENS_DOOR_WORKSPACE);
  app.on('activate',()=>{if(!desktops.size)void createWindow();});
});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{for(const host of assets.values())void host.worker.terminate();});
