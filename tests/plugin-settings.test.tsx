import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {act,useState} from 'react';
import {Workspace} from '../src/core/workspace';
import {revision} from '../src/core/format';
import {defaultPreferences,validatePreferences} from '../src/core/preferences';
import {featureEnabled,systemPath} from '../src/features';
import {DEFAULT_JOURNAL} from '../src/journal';
import {SettingsPanel} from '../src/renderer/SettingsPanel';
import type {Snapshot} from '../src/shared';

test('custom plugin folders, required storage and ordinary file creation remain recoverable',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-plugin-folders-')),root=join(dir,'Notes');await fs.mkdir(root);
 const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.setPreferences({cardFolder:'Storage/Cards',tagsFolder:'Schemas/Tags',trashFolder:'Archive/Deleted',templates:{folder:'Resources/Templates'},journal:{...DEFAULT_JOURNAL,folder:'Writing/Journal'},features:{slipbox:false,trash:false}});
 assert.equal(featureEnabled(w.snapshot().preferences,'slipbox'),true);assert.equal(featureEnabled(w.snapshot().preferences,'trash'),true);
 assert.equal(systemPath('tags',w.snapshot().preferences),'Schemas/Tags');
 await assert.rejects(fs.access(join(root,'Archive/Deleted')));
 await w.ensureFolder('Later/Templates');assert.ok(w.snapshot().folders?.includes('Later/Templates'));await assert.rejects(fs.access(join(root,'Later/Templates/Templates.whiteboard')));
 await assert.rejects(()=>w.ensureFolder('../outside'));await w.ensureFolder('Later/Templates');
 const folder=await w.createEntry('','Documents','folder');assert.equal(folder.edits.length,0);assert.ok(w.snapshot().folders?.includes('Documents'));await assert.rejects(fs.access(join(root,'Documents/Documents.whiteboard')));
 const plainJson=await w.createEntry('Documents','00000000-0000-0000-0000-000000000000.json','file');assert.equal(await w.read(plainJson.path),'');
 const plain=await w.createEntry('Documents','Readme.txt','file');assert.equal(await w.read(plain.path),'');assert.ok(!w.snapshot().cards.some(c=>c.path===plain.path));
 const md=await w.createEntry('Documents','Markdown','file');assert.equal(md.path,'Documents/Markdown.md');assert.ok(w.snapshot().cards.some(c=>c.path===md.path));
 await assert.rejects(()=>w.createEntry('Documents','README.txt','file'));await assert.rejects(()=>w.createEntry('../outside','Bad','file'));await assert.rejects(()=>w.createEntry('Documents','.hidden','file'));
 await w.write(plain.edits.map(e=>({path:e.path,content:e.before,expected:e.after===null?null:revision(e.after)})));
 await assert.rejects(fs.access(join(root,plain.path)));
 const tag=await w.createTag('project');assert.equal(tag.edits[0].path,'Schemas/Tags/project.tag');
 const template=await w.createTemplate('daily');assert.equal(template.edits[0].path,'Resources/Templates/Daily template.md');
 await w.setPreferences({journal:{...DEFAULT_JOURNAL,folder:'Writing/Journal',dailyTemplate:template.edits[0].path}});
 const day=await w.openJournal('2026-10-05','daily');assert.match(await w.read(day.path),/## Notes/);
 const card=w.snapshot().cards.find(c=>c.path===md.path)!;await w.trashCard(card.path,card.revision);const archived=(await w.trashEntries())[0];
 assert.ok(archived.path.startsWith('Archive/Deleted/'));await w.scan();assert.ok(!w.snapshot().cards.some(c=>c.path===archived.path));assert.ok(!w.searchWorkspace('Markdown').some(c=>c.path===archived.path));
 await w.restoreTrash(archived.path,archived.revision);assert.ok(w.snapshot().cards.some(c=>c.path===md.path));
 assert.throws(()=>validatePreferences({...defaultPreferences(),trashFolder:'../private'}));assert.throws(()=>validatePreferences({...defaultPreferences(),cardFolder:'.heavens-door/trash'}));
});

test('settings separate Core plugins and allow journal templates outside the template folder',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,innerWidth:1200,innerHeight:900,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 window.door={platform:'darwin',onUpdateChange:()=>()=>{},updateState:async()=>({currentVersion:'0.1.27',status:'idle',canInstall:false})} as unknown as typeof window.door;
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);let current=defaultPreferences(),created='',createdFolder='';
 const snapshot:Snapshot={root:'/notes',name:'Notes',cards:[{id:'a',path:'Notes/Daily outline.md',name:'Daily outline.md',title:'Daily outline',revision:'r',legacy:false}],boards:[],folders:['Notes','Resources/Templates'],tags:[],issues:[],historyAvailable:false};
 function Harness(){const [prefs,setPrefs]=useState(current);return <SettingsPanel snapshot={snapshot} prefs={prefs} rootCards={0} onResetDocks={()=>{}} onMigrate={()=>{}} onCreateTemplate={async period=>{created=period;return {id:'new',path:'Templates/'+period+'.md',name:'template',revision:'r',legacy:false};}} onCreateFolder={async path=>{createdFolder=path;}} onChange={patch=>setPrefs(p=>{current={...p,...patch};return current;})}/>;}
 try{
  await act(async()=>root.render(<Harness/>));assert.equal(document.querySelector('#settings-features'),null);assert.deepEqual([...document.querySelectorAll('.settings-nav-divider')].map(el=>el.textContent),['General','Editing','Core plugins','Advanced']);assert.match(document.getElementById('settings-content')?.textContent??'',/0.1.27/);
  await act(async()=>document.querySelector<HTMLButtonElement>('#settings-whiteboard')!.click());assert.equal(document.querySelector('[aria-label="Whiteboard Text"] h3')?.textContent,'Text');
  const textSize=document.querySelector('[aria-label="Default text font size"]')!;assert.deepEqual([...textSize.querySelectorAll('button')].map(b=>b.textContent),['S','M','L','XL']);await act(async()=>textSize.querySelector<HTMLButtonElement>('[aria-label="L"]')!.click());assert.equal(current.whiteboardText?.fontSize,'l');
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Default text color"] [aria-label="Rose"]')!.click());assert.equal(current.whiteboardText?.textColor,'#c9838a');
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Default text color"] [aria-label="Theme"]')!.click());assert.equal(current.whiteboardText?.textColor,undefined);assert.equal(current.whiteboardText?.fontSize,'l');
  assert.deepEqual([...document.querySelectorAll('[aria-label="Whiteboard Text"] kbd')].map(el=>el.textContent),['Space / F2','Enter','Tab','Alt + Enter','Esc / ⌘ Enter']);
  await act(async()=>document.querySelector<HTMLButtonElement>('#settings-files')!.click());assert.equal(document.querySelectorAll('[role=switch]').length,0);assert.ok(document.querySelector('[aria-label="Slipbox folder"]'));assert.ok(document.querySelector('[aria-label="Trash folder"]'));
  const folderInput=document.querySelector<HTMLInputElement>('input[aria-label="Slipbox folder"]')!;
  const type=async(input:HTMLInputElement,value:string)=>act(async()=>{input.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await type(folderInput,'Templtes');assert.ok([...document.querySelectorAll('[role=option]')].some(el=>el.textContent?.includes('Resources/Templates')),'Folders reuse fuzzy search');
  await type(folderInput,'Future/Cards');await act(async()=>folderInput.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.equal(current.cardFolder,'Future/Cards');assert.equal(createdFolder,'','Unknown paths can be saved without creating a folder');
  await type(folderInput,'Future/New');await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=option]')].find(el=>el.textContent?.startsWith('Create folder'))!.click());assert.equal(createdFolder,'Future/New');assert.equal(current.cardFolder,'Future/New');assert.equal(document.querySelector('.settings-path-options'),null);
  await act(async()=>document.querySelector<HTMLButtonElement>('#settings-journal')!.click());const enable=document.querySelector<HTMLInputElement>('[aria-label="Enable Journal and Calendar"]')!;assert.ok(enable);assert.ok(document.querySelector('[aria-label="Journal folder"]'));
  await act(async()=>document.querySelector<HTMLInputElement>('input[aria-label="Daily template"]')!.focus());
  assert.ok([...document.querySelectorAll('[role=option]')].some(el=>el.textContent?.includes('Daily outline')));
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=option]')].find(el=>el.textContent?.includes('Daily outline'))!.click());assert.equal(current.journal?.dailyTemplate,'Notes/Daily outline.md');
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Create weekly template"]')!.click());assert.equal(created,'weekly');assert.equal(current.journal?.weeklyTemplate,'Templates/weekly.md');
  await act(async()=>enable.click());assert.equal(current.features?.journal,false);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
