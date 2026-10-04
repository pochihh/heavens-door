import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge, Snapshot, WindowAction } from './shared';
let assetKey='';
async function adopt(promise:Promise<Snapshot|null>){const value=await promise;if(value?.assetKey)assetKey=value.assetKey;return value;}
const bridge:Bridge={
  resolveImage:(notePath,source)=>ipcRenderer.invoke('image:resolve',notePath,source),
  importImageLink:(notePath,url)=>ipcRenderer.invoke('image:link',notePath,url),
  importImage:(path,name,type,data)=>ipcRenderer.invoke('image:import',path,name,type,data),
  imageData:path=>ipcRenderer.invoke('image:read',path),
  copyImage:png=>ipcRenderer.invoke('image:copy',png),
  appSettings:()=>ipcRenderer.invoke('app:settings'),
  setHardwareAcceleration:enabled=>ipcRenderer.invoke('app:hardware-acceleration',enabled),
  onAppSettingsChange:callback=>{const listener=()=>callback();ipcRenderer.on('app:settings-change',listener);return()=>ipcRenderer.removeListener('app:settings-change',listener);},
  graphicsDiagnostics:()=>ipcRenderer.invoke('app:graphics-diagnostics'),
  listWorkspaces:refresh=>ipcRenderer.invoke('workspace:list',refresh),
  unregisterWorkspace:root=>ipcRenderer.invoke('workspace:unregister',root),
  openWorkspace:root=>adopt(ipcRenderer.invoke('workspace:registered',root)) as Promise<Snapshot>,
  revealFile:path=>ipcRenderer.invoke('workspace:reveal',path),
  chooseWorkspace:()=>adopt(ipcRenderer.invoke('workspace:choose')),
  demo:async()=>(await adopt(ipcRenderer.invoke('workspace:demo')))!,
  request:request=>ipcRenderer.invoke('workspace:request',request),
  onChange:callback=>{const listener=()=>callback();ipcRenderer.on('workspace:change',listener);return()=>{ipcRenderer.removeListener('workspace:change',listener);};},
  onClosing:callback=>{const listener=(_event:Electron.IpcRendererEvent,action:WindowAction)=>callback(action);ipcRenderer.on('window:closing',listener);return()=>{ipcRenderer.removeListener('window:closing',listener);};},
  currentWorkspace:()=>adopt(ipcRenderer.invoke('workspace:current')),
  finishClosing:action=>ipcRenderer.send('window:ready',action),
  cancelClosing:action=>ipcRenderer.send('window:cancel',action),
  reload:()=>ipcRenderer.send('window:reload'),
  assetUrl:path=>'heavens-asset://'+assetKey+'/'+path.split(/[\\/]/).map(encodeURIComponent).join('/'),
  newWindow:same=>ipcRenderer.invoke('window:new',same),
  platform:process.platform,
};
contextBridge.exposeInMainWorld('door',bridge);
