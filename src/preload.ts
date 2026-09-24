import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from './shared';
const bridge: Bridge = {
  chooseWorkspace:() => ipcRenderer.invoke('workspace:choose'),
  demo:() => ipcRenderer.invoke('workspace:demo'),
  request:request => ipcRenderer.invoke('workspace:request',request),
  onChange:callback => { const listener=() => callback(); ipcRenderer.on('workspace:change',listener); return () => { ipcRenderer.removeListener('workspace:change',listener); }; },
  onClosing:callback => { const listener=() => callback(); ipcRenderer.on('window:closing',listener); return () => { ipcRenderer.removeListener('window:closing',listener); }; },
  finishClosing:() => ipcRenderer.send('window:close'),
  assetUrl:path => `heavens-asset://vault/${path.split(/[\\/]/).map(encodeURIComponent).join('/')}`,
};
contextBridge.exposeInMainWorld('door',bridge);
