import { app, BrowserWindow, dialog, ipcMain, protocol, net, Menu } from 'electron';
import { Worker } from 'node:worker_threads';
import { join, resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Request, Snapshot, Mutation, Card } from './shared';

app.setName("Heaven's Door");
protocol.registerSchemesAsPrivileged([{scheme:'heavens-asset',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window: BrowserWindow;
let worker: Worker;
let root = '';
let nextId = 0;
let closing = false;
const pending = new Map<number,{resolve:(value:unknown)=>void;reject:(reason:Error)=>void}>();
function call<T>(request: Request): Promise<T> {
  return new Promise((resolve,reject) => {
    const id = ++nextId;
    pending.set(id,{resolve:value => resolve(value as T),reject});
    worker.postMessage({id,request});
  });
}
async function open(folder: string) {
  const actual = await fs.realpath(folder);
  const cache = join(app.getPath('userData'),'indexes',createHash('sha256').update(actual).digest('hex'));
  const snapshot = await call<Snapshot>({kind:'open',root:actual,cache});
  root = actual;
  return snapshot;
}
function trusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted sender');
}
void app.whenReady().then(async () => {
  worker = new Worker(join(__dirname,'workspace-worker.cjs'));
  worker.on('message',message => {
    if (message.event) { window?.webContents.send('workspace:change'); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
  });
  worker.on('error',error => { for (const p of pending.values()) p.reject(error instanceof Error ? error : new Error(String(error))); pending.clear(); });
  protocol.handle('heavens-asset',async request => {
    try {
      const url = new URL(request.url);
      if (!root || url.host !== 'vault') throw new Error('No workspace');
      const target = await fs.realpath(resolve(root,decodeURIComponent(url.pathname).slice(1)));
      if (!target.startsWith(root + sep) || !['.png','.jpg','.jpeg','.gif','.webp','.avif','.svg'].includes(extname(target).toLowerCase())) throw new Error('Unsupported asset');
      return net.fetch(pathToFileURL(target).href);
    } catch { return new Response('Asset unavailable',{status:404}); }
  });
  ipcMain.handle('workspace:choose',async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(window,{title:'Open a notes folder',properties:['openDirectory','createDirectory']});
    return result.canceled ? null : open(result.filePaths[0]);
  });
  ipcMain.handle('workspace:demo',async event => {
    trusted(event);
    const parent = await fs.mkdtemp(join(app.getPath('temp'),'heavens-door-demo-'));
    const folder = join(parent,'Getting started'); await fs.mkdir(folder);
    await open(folder);
    const samples = [
      ['Welcome', '# A little room for big ideas\n\nThis is your first whiteboard. Each card is a Markdown file you own.\n\n**Double-click a card** to write. Drag its header to move it.\n\n- Pan by dragging the empty canvas\n- Scroll to move; pinch or Ctrl-scroll to zoom\n- Create a checkpoint with ⌘S / Ctrl+S\n'],
      ['Connecting ideas', '# Follow the connections\n\nA thought becomes useful when it finds a neighbor.\n\nSelect a card, then **Connect** and select another. Hold Shift to select two cards.\n\nReferences share the same card identity, even across boards.\n'],
      ['Try it', '# Make it yours\n\n- [ ] Write a small idea\n- [ ] Move a card\n- [ ] Save a checkpoint\n- [ ] Explore an earlier version\n\nYour future edits stay reachable in history.\n'],
    ];
    for (let i=0;i<samples.length;i++) {
      const result = await call<Mutation>({kind:'create',folder:'',stem:samples[i][0],x:70+i*380,y:100+(i%2)*90});
      const info = result.snapshot.cards.find(c => c.name === samples[i][0])!;
      const card = await call<Card>({kind:'card',path:info.path});
      await call({kind:'saveCard',path:card.path,body:samples[i][1],expected:card.revision});
    }
    await call({kind:'checkpoint',label:'Start a new workspace'});
    return call<Snapshot>({kind:'snapshot'});
  });
  ipcMain.handle('workspace:request',async (event,request:Request) => {
    trusted(event);
    if (!request || request.kind === 'open') throw new Error('Unsupported request');
    return call(request);
  });
  ipcMain.on('window:close',event => { trusted(event); closing=true; window.close(); });
  const createWindow = () => {
    closing=false;
    window = new BrowserWindow({width:1440,height:940,minWidth:900,minHeight:600,backgroundColor:'#f8f7f3',title:"Heaven's Door",webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate',event => event.preventDefault());
    window.on('close',event => { if (!closing) { event.preventDefault(); window.webContents.send('window:closing'); } });
    if (process.env.HEAVENS_DOOR_DEV_URL) void window.loadURL(process.env.HEAVENS_DOOR_DEV_URL);
    else void window.loadFile(join(__dirname,'renderer/index.html'));
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{label:"Heaven's Door",submenu:[{role:'about' as const},{role:'quit' as const}]}] : []),
    {label:'Edit',submenu:[{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{role:'toggleDevTools'},{role:'togglefullscreen'}]},
  ]));
  createWindow();
  app.on('activate',() => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed',() => { void worker?.terminate(); app.quit(); });
