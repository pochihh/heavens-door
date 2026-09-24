import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge, WindowAction } from './shared';
const bridge: Bridge = {
  chooseWorkspace:() => ipcRenderer.invoke('workspace:choose'),
  demo:() => ipcRenderer.invoke('workspace:demo'),
  request:request => ipcRenderer.invoke('workspace:request',request),
  onChange:callback => { const listener=() => callback(); ipcRenderer.on('workspace:change',listener); return () => { ipcRenderer.removeListener('workspace:change',listener); }; },
  onClosing:callback => { const listener=(_event:Electron.IpcRendererEvent,action:WindowAction) => callback(action); ipcRenderer.on('window:closing',listener); return () => { ipcRenderer.removeListener('window:closing',listener); }; },
  currentWorkspace:() => ipcRenderer.invoke('workspace:current'),
  finishClosing:action => ipcRenderer.send('window:ready',action),
  cancelClosing:action => ipcRenderer.send('window:cancel',action),
  reload:() => ipcRenderer.send('window:reload'),
  assetUrl:path => `heavens-asset://vault/${path.split(/[\\/]/).map(encodeURIComponent).join('/')}`,
};
contextBridge.exposeInMainWorld('door',bridge);
