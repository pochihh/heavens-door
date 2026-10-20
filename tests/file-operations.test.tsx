import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JSDOM} from 'jsdom';
import {act,useRef,useState,useSyncExternalStore} from 'react';
import {Workspace} from '../src/core/workspace';
import {listFiles} from '../src/core/files';
import {readBoard} from '../src/core/format';
import {remapPreferences} from '../src/path-remap';
import {Session} from '../src/renderer/session';
import {Explorer} from '../src/renderer/Explorer';
import {SystemView} from '../src/renderer/SystemView';
import {ConfirmationProvider} from '../src/renderer/Confirmation';
import type {Bridge,Preferences} from '../src/shared';

test('file operations preserve binary bytes, card identities, board layouts, references and recoverable Trash',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-file-ops-')),root=join(dir,'Notes'),cache=join(dir,'cache');await fs.mkdir(root);
 let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
 await w.createFolder('','Project');await w.create('Project','Note',120,80);await w.ensureFolder('Project/assets');await w.ensureFolder('Destination');
 const bytes=Buffer.from([0,255,0,1,2,3,4]);await fs.writeFile(join(root,'Project/assets/photo.png'),bytes);
 let card=w.snapshot().cards.find(c=>c.path==='Project/Note.md')!;await w.saveCard(card.path,'# Note\n\n![Local image](assets/photo.png)\n',card.revision);card=w.snapshot().cards.find(c=>c.path===card.path)!;
 await w.setPreferences({starred:['board:Project'],cardFolder:'Slipbox',trashFolder:'Archive/Deleted'});
 const copied=await w.fileOperation({action:'copy',path:'Project',destination:'Project'});assert.equal(copied.path,'Project 2');
 const duplicate=w.snapshot().cards.find(c=>c.path==='Project 2/Note.md')!;assert.notEqual(duplicate.id,card.id);assert.deepEqual(await fs.readFile(join(root,'Project 2/assets/photo.png')),bytes);assert.match(await w.read(duplicate.path),/assets\/photo.png/);
 const duplicateBoard=w.snapshot().boards.find(b=>b.folder==='Project 2')!;assert.equal(duplicateBoard.cards.find(p=>p.cardId===duplicate.id)?.x,120);assert.equal(duplicateBoard.cards.find(p=>p.cardId===duplicate.id)?.y,80);
 const boardCopy=await w.fileOperation({action:'copy',path:'Project/Project.whiteboard',destination:'Destination/Pasted.whiteboard'});assert.equal(readBoard(boardCopy.path,await w.read(boardCopy.path)).name,'Pasted');
 const moved=await w.fileOperation({action:'move',path:'Project 2',destination:'Destination/Renamed'});assert.ok(w.snapshot().boards.some(b=>b.folder==='Destination/Renamed'));assert.equal(w.snapshot().cards.find(c=>c.id===duplicate.id)?.path,'Destination/Renamed/Note.md');assert.ok(w.snapshot().pathMoves?.some(m=>m.to==='Destination/Renamed'));
 await w.fileOperation(moved.inverse);assert.equal(w.snapshot().cards.find(c=>c.id===duplicate.id)?.path,'Project 2/Note.md');
 await fs.writeFile(join(root,'Destination/photo.png'),'keep');const fileCopy=await w.fileOperation({action:'copy',path:'Project/assets/photo.png',destination:'Destination/photo.png'});assert.equal(fileCopy.path,'Destination/photo 2.png');assert.equal(await fs.readFile(join(root,'Destination/photo.png'),'utf8'),'keep');
 await assert.rejects(()=>w.fileOperation({action:'move',path:'Project',destination:'Project/assets/Inside'}));await assert.rejects(()=>w.fileOperation({action:'trash',path:''}));await assert.rejects(()=>w.fileOperation({action:'copy',path:'.git',destination:'Git copy'}));await assert.rejects(()=>w.fileOperation({action:'copy',path:'Project',destination:'../escape'}));
 await fs.symlink(join(dir,'outside'),join(root,'Project/link'));await assert.rejects(()=>w.fileOperation({action:'copy',path:'Project',destination:'Unsafe'}),/Symbolic/);await fs.unlink(join(root,'Project/link'));await assert.rejects(fs.access(join(root,'Unsafe')));
 await assert.rejects(()=>w.fileOperation({action:'move',path:'Project 2',destination:'Project'}),/already/);assert.equal(w.snapshot().cards.find(c=>c.id===duplicate.id)?.path,'Project 2/Note.md','a failed move leaves the workspace usable');
 const trashed=await w.fileOperation({action:'trash',path:'Project 2'});const row=(await w.trashEntries()).find(e=>e.kind==='folder')!;assert.ok(row.archive?.startsWith('Archive/Deleted/'));assert.equal(row.originalPath,'Project 2');assert.ok(!w.snapshot().cards.some(c=>c.path.startsWith('Archive/Deleted/')));assert.ok(!w.snapshot().boards.some(b=>b.folder==='Project 2'));
 assert.deepEqual(await fs.readFile(join(root,row.path,'assets/photo.png')),bytes);const restored=await w.fileOperation(trashed.inverse);assert.equal(restored.path,'Project 2');assert.equal(w.snapshot().cards.find(c=>c.id===duplicate.id)?.path,'Project 2/Note.md');assert.ok(!(await w.trashEntries()).some(e=>e.kind==='folder'));
 const binaryTrash=await w.fileOperation({action:'trash',path:fileCopy.path});await fs.writeFile(join(root,fileCopy.path),'occupied');const recovered=await w.fileOperation({action:'restore',path:binaryTrash.inverse.path});assert.equal(recovered.path,'Destination/photo 2 2.png');assert.deepEqual(await fs.readFile(join(root,recovered.path)),bytes);assert.equal(await fs.readFile(join(root,fileCopy.path),'utf8'),'occupied');
 const conflict=await w.fileOperation({action:'copy',path:'Project/assets/photo.png',destination:'Destination/change.png'});await fs.writeFile(join(root,conflict.path),'external edit');await assert.rejects(()=>w.fileOperation(conflict.inverse),/changes/);assert.equal(await fs.readFile(join(root,conflict.path),'utf8'),'external edit');
 const malformed='---\n[broken yaml\n---\nKeep these bytes\n';await fs.writeFile(join(root,'Destination/Malformed.md'),malformed);await w.fileOperation({action:'copy',path:'Destination/Malformed.md',destination:'Destination/Malformed copy.md'});assert.equal(await fs.readFile(join(root,'Destination/Malformed copy.md'),'utf8'),malformed);
 await w.ensureFolder('Templates');const templateMove=await w.fileOperation({action:'move',path:'Templates',destination:'Destination/My templates'});assert.equal(w.snapshot().preferences?.templates?.folder,'Destination/My templates');await w.fileOperation(templateMove.inverse);assert.equal(w.snapshot().preferences?.templates?.folder,'Templates');
 const preferences=w.snapshot().preferences!,before=await w.read('Project/Note.md'),after=before+'\nPending edit\n';await fs.writeFile(join(root,'Project/Note.md'),after);await fs.rename(join(root,'Project'),join(root,'Interrupted'));await fs.rename(join(root,'Interrupted/Project.whiteboard'),join(root,'Interrupted/Interrupted.whiteboard'));
 await fs.writeFile(join(cache,'file-move.json'),JSON.stringify({from:'Project',to:'Interrupted',edits:[{path:'Project/Note.md',before,after}],preferences,nextPreferences:remapPreferences(preferences,'Project','Interrupted')}));w.close();w=await Workspace.open(root,cache);assert.equal(await w.read('Project/Note.md'),before);assert.deepEqual(await fs.readFile(join(root,'Project/assets/photo.png')),bytes);assert.ok(w.snapshot().boards.some(b=>b.folder==='Project'));
 const boardBefore=await w.read('Project/Project.whiteboard');await fs.rename(join(root,'Project'),join(root,'Half moved'));await fs.writeFile(join(cache,'file-move.json'),JSON.stringify({from:'Project',to:'Half moved',edits:[{path:'Project/Project.whiteboard',before:boardBefore,after:boardBefore}],preferences:w.snapshot().preferences!,nextPreferences:remapPreferences(w.snapshot().preferences!,'Project','Half moved')}));w.close();w=await Workspace.open(root,cache);assert.equal(await w.read('Project/Project.whiteboard'),boardBefore);
});

test('explorer menus copy, paste, rename and trash files; undo and app Trash restore the same files',async()=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-file-ui-')),rootPath=join(dir,'Notes');await fs.mkdir(rootPath);const w=await Workspace.open(rootPath,join(dir,'cache'));await w.createEntry('','Documents','folder');await w.createEntry('Documents','Readme.txt','file');await fs.writeFile(join(rootPath,'Documents/Readme.txt'),'hello');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://local.test',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Node:dom.window.Node,Element:dom.window.Element,innerWidth:1200,innerHeight:900,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLElement.prototype.showPopover=function(){};dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let trashRead:ReturnType<Workspace['trashEntries']>|undefined;
 const bridge={platform:'darwin',request:async request=>{switch(request.kind){case 'fileOperation':return w.fileOperation(request.operation);case 'listFiles':return listFiles(w.root,request.path);case 'snapshot':return w.snapshot();case 'trashEntries':return trashRead=w.trashEntries();case 'preferences':return w.setPreferences(request.patch);default:throw new Error(request.kind);}}} as Bridge;
 Object.assign(window,{door:bridge});const session=new Session(bridge);session.update({snapshot:w.snapshot()});const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);let settings='';
 function Harness(){const state=useSyncExternalStore(session.subscribe,session.getState),[prefs,setPrefs]=useState<Preferences>({...w.snapshot().preferences!,navigation:{files:{expanded:['','Documents']}}}),starred=useRef<HTMLDivElement>(null);return <Explorer module="files" snapshot={state.snapshot!} prefs={prefs} session={session} starredTarget={starred} activeKey="" onOpen={()=>{}} onSplit={()=>{}} onCard={()=>{}} onFolder={()=>{}} onIcon={()=>{}} onSettings={page=>{settings=page;}} onPrefs={change=>setPrefs(p=>({...p,...change(p)}))}/>;}
 const settle=async()=>{await act(async()=>session.run(async()=>{}));await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));};
 const menu=async(path:string)=>{await settle();await act(async()=>document.querySelector<HTMLElement>('[data-file-path="'+path+'"]')!.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));};
 const click=async(label:string)=>{await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menu] button')].find(b=>b.textContent===label)!.click());await settle();};
 try{
  await act(async()=>root.render(<ConfirmationProvider><Harness/></ConfirmationProvider>));await settle();await menu('Documents/Readme.txt');await click('Copy');await menu('Documents');await click('Paste');assert.equal(await fs.readFile(join(rootPath,'Documents/Readme 2.txt'),'utf8'),'hello');
  await act(async()=>session.undo());await assert.rejects(fs.access(join(rootPath,'Documents/Readme 2.txt')));await act(async()=>session.undo(true));assert.equal(await fs.readFile(join(rootPath,'Documents/Readme 2.txt'),'utf8'),'hello');
  await menu('Documents/Readme 2.txt');await click('Rename');const input=document.querySelector<HTMLInputElement>('.file-creation-dialog input')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Renamed.txt');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>document.querySelector('.file-creation-dialog form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await settle();assert.equal(await fs.readFile(join(rootPath,'Documents/Renamed.txt'),'utf8'),'hello');
  await menu('Documents/Renamed.txt');await click('Cut');await menu('');await click('Paste');assert.equal(await fs.readFile(join(rootPath,'Renamed.txt'),'utf8'),'hello');await assert.rejects(fs.access(join(rootPath,'Documents/Renamed.txt')));
  await menu('Renamed.txt');await click('Move to Trash');await assert.rejects(fs.access(join(rootPath,'Renamed.txt')));
  await act(async()=>root.render(<ConfirmationProvider><SystemView id="trash" snapshot={session.state.snapshot!} session={session} onOpen={()=>{}} onPreview={()=>{}} onTemplate={()=>{}}/></ConfirmationProvider>));await settle();
  // Wait for the actual read; a fixed render delay races disk I/O in the full suite.
  assert.ok(trashRead);await act(async()=>{await trashRead;});assert.ok(document.querySelector('.system-name')!.textContent!.includes('Renamed.txt'));
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Actions for Renamed.txt"]')!.click());await click('Restore');assert.equal(await fs.readFile(join(rootPath,'Renamed.txt'),'utf8'),'hello');assert.equal(settings,'');
 }finally{await act(async()=>root.unmount());dom.window.close();w.close();await fs.rm(dir,{recursive:true,force:true});}
});


test('file moves retain text entered while the filesystem operation is pending',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-file-draft-')),root=join(dir,'Notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});await w.ensureFolder('Moved');await w.create('','Draft',0,0,false);const card=await w.card('Draft.md');
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{started=resolve;});
 const bridge={request:async request=>{if(request.kind==='fileOperation'){started();await gate;return w.fileOperation(request.operation);}if(request.kind==='card')return w.card(request.path);throw new Error(request.kind);}} as Bridge;
 const session=new Session(bridge);session.update({snapshot:w.snapshot(),draft:{card,body:card.body,dirty:false}});const pending=session.fileOperation({action:'move',path:card.path,destination:'Moved/Draft.md'},'Move');await ready;session.edit('# Draft\n\nTyped while moving');release();await pending;assert.equal(session.state.draft?.body,'# Draft\n\nTyped while moving');assert.equal(session.state.draft?.dirty,true);assert.equal(session.state.draft?.card.path,'Moved/Draft.md');session.dispose();
});
