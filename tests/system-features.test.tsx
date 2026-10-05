import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JSDOM} from 'jsdom';
import {act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Workspace} from '../src/core/workspace';
import {revision} from '../src/core/format';
import {validatePreferences,defaultPreferences} from '../src/core/preferences';
import {featureEnabled,systemEntries,navigationOrder,moduleEnabled} from '../src/features';
import {documentInfo} from '../src/renderer/documents';
import {remapPreferences} from '../src/path-remap';
import {Explorer} from '../src/renderer/Explorer';
import {SystemView} from '../src/renderer/SystemView';
import {ConfirmationProvider} from '../src/renderer/Confirmation';
import {SideDock} from '../src/renderer/Docks';
import {defaultDocks,resizeGroups} from '../src/layout';
import {Session} from '../src/renderer/session';
import type {Bridge,Preferences} from '../src/shared';

test('system roles stay file based, disable independently, and retain card access and navigation',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-system-')),root=join(dir,'Notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  for(const folder of ['Ideas','Templates','Slipbox','Journal','tags']){await w.createFolder('',folder);await w.create(folder,'Sample',0,0,false);}
  assert.deepEqual(w.snapshot().boards.map(b=>b.folder),['','Ideas'],'legacy special-folder boards are hidden without deleting their files');
  const prefs={features:{journal:false,templates:false},boardNavigation:{order:{'boards:':['system:journal','board:Ideas'],system:['system:tags']}},starred:['system:journal'],recent:['system:journal']};
  await w.setPreferences(prefs);await w.scan();const snapshot=w.snapshot();
  assert.equal(moduleEnabled('calendar',snapshot.preferences),false);assert.equal(moduleEnabled('tags',snapshot.preferences),true);
  assert.equal(featureEnabled(snapshot.preferences,'templates'),false);assert.ok(!systemEntries(snapshot.preferences).some(e=>e.id==='journal'));
  assert.equal(documentInfo('system:journal',snapshot).exists,false);assert.equal(documentInfo('system:slipbox',snapshot).title,'Slipbox');
  assert.ok(snapshot.cards.some(c=>c.path==='Journal/Sample.md'));assert.ok(w.queryCards({folder:'Templates'}).length);
  assert.ok((await fs.readFile(join(root,'Templates/Templates.whiteboard'),'utf8')).length,'no filesystem migration');
  await w.setPreferences({features:{journal:true,templates:true}});assert.equal(documentInfo('system:journal',w.snapshot()).exists,true);
  assert.deepEqual(w.snapshot().preferences?.starred,['system:journal']);assert.deepEqual(w.snapshot().preferences?.boardNavigation?.order,prefs.boardNavigation.order);
  assert.deepEqual(navigationOrder(['b','a','new'],['a','missing','b']),['a','b','new']);
  const remapped=remapPreferences({...defaultPreferences(),boardNavigation:{order:{'boards:Ideas':['board:Ideas/Child'],'boards:':['board:Ideas','system:templates']}}},'Ideas','Research');
  assert.deepEqual(remapped.boardNavigation?.order,{'boards:Research':['board:Research/Child'],'boards:':['board:Research','system:templates']});
  assert.throws(()=>validatePreferences({...defaultPreferences(),features:{journal:'yes'}}));
  assert.throws(()=>validatePreferences({...defaultPreferences(),boardNavigation:{order:{'boards:':['board:a','board:a']}}}));
});

test('Trash preserves exact Markdown, restores safely without overwriting, and remains undoable',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-trash-library-')),root=join(dir,'Notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Ideas');await w.create('Ideas','Draft',0,0);let card=w.snapshot().cards[0];
  await w.saveCard(card.path,'# Draft\n\n![local](figure.png)\n',card.revision);card=w.snapshot().cards[0];const original=await w.read(card.path),id=card.id;
  const deletion=await w.trashCard(card.path,card.revision);assert.equal(w.snapshot().cards.length,0);assert.equal(w.snapshot().boards.find(b=>b.folder==='Ideas')!.cards.length,0);
  const entry=(await w.trashEntries())[0];assert.equal(entry.originalPath,'Ideas/Draft.md');assert.equal(await w.read(entry.path),original);assert.ok(entry.deleted>0);
  assert.ok(deletion.edits.some(e=>e.path.endsWith('.json')),'restore metadata is readable and included in the transaction');
  await assert.rejects(()=>w.restoreTrash('Ideas/Draft.md',entry.revision),/Invalid/);await assert.rejects(()=>w.restoreTrash(entry.path,'stale'),/External changes/i);
  await w.create('Ideas','Draft',0,0,false);const existing=await w.read('Ideas/Draft.md');
  const restored=await w.restoreTrash(entry.path,entry.revision),path=restored.edits.find(e=>e.before===null)!.path;
  assert.equal(path,'Ideas/Draft 2.md');assert.equal(await w.read(path),original);assert.equal(await w.read('Ideas/Draft.md'),existing);assert.equal(w.snapshot().cards.find(c=>c.path===path)!.id,id);assert.equal((await w.trashEntries()).length,0);
  await w.write(restored.edits.map(e=>({path:e.path,content:e.before,expected:e.after===null?null: revision(e.after)})));
  assert.equal((await w.trashEntries()).length,1);
});

test('explorer shares system rows with Boards, Recent and Starred; libraries provide search and actions',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const prefs={...defaultPreferences(),starred:['system:templates'],recent:['system:tags'],boardNavigation:{order:{'boards:':['system:templates','board:Ideas']}}};
  const snapshot={root:'/notes',name:'Notes',cards:[{id:'one',path:'Templates/Alpha.md',name:'Alpha.md',title:'Alpha',revision:'one',legacy:false},{id:'two',path:'Templates/Beta.md',name:'Beta.md',title:'Beta',revision:'two',legacy:false}],boards:[{path:'Notes.whiteboard',folder:'',name:'Notes',revision:'r',cards:[],edges:[]},{path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[],edges:[]}],issues:[],historyAvailable:false,tags:[],preferences:prefs};
  const bridge={platform:'darwin',request:async()=>[]} as unknown as Bridge;Object.assign(window,{door:bridge});const session=new Session(bridge),opened:string[]=[];let saved:Preferences=prefs,writes=0;const root=createRoot(document.getElementById('root')!);
  function Harness({bookmarks=false}:{bookmarks?:boolean}){const [p,setPrefs]=useState<Preferences>(prefs),target=useRef<HTMLDivElement>(null);return <Explorer module={bookmarks?'bookmarks':'whiteboards'} snapshot={{...snapshot,preferences:p}} prefs={p} activeKey="system:templates" starredTarget={target} session={session} onOpen={key=>opened.push(key)} onSplit={()=>{}} onFolder={()=>{}} onCard={()=>{}} onIcon={()=>{}} onPrefs={change=>setPrefs(p=>{writes++;saved={...p,...change(p)};return saved;})}/>;}
  try{
    await act(async()=>root.render(<Harness/>));const board=document.querySelector('[data-sort-group="boards:"]')!;
    assert.deepEqual([...board.children].map(e=>(e as HTMLElement).dataset.fileKey),['system:templates','board:Ideas']);assert.ok(document.querySelector('[data-sort-group="system"] [data-file-key="system:tags"]'));
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Home whiteboard"]')!.click());assert.deepEqual(opened,['board:']);
    const pinned=document.querySelector<HTMLButtonElement>('[data-file-key="system:templates"] .file-button')!;
    await act(async()=>pinned.dispatchEvent(new dom.window.KeyboardEvent('keydown',{bubbles:true,altKey:true,key:'ArrowDown'})));
    assert.deepEqual([...board.children].map(e=>(e as HTMLElement).dataset.fileKey),['board:Ideas','system:templates']);
    const rect=(top:number,height:number)=>({left:0,top,width:260,height,right:260,bottom:top+height,x:0,y:top,toJSON(){}});
    const geometry=()=>{
      document.querySelector<HTMLElement>('.file-tree')!.getBoundingClientRect=()=>rect(0,400);
      document.querySelector<HTMLElement>('.board-sections')!.getBoundingClientRect=()=>rect(10,280);
      document.querySelector<HTMLElement>('.boards-section')!.getBoundingClientRect=()=>rect(10,110);
      document.querySelector<HTMLElement>('.system-section')!.getBoundingClientRect=()=>rect(130,160);
      for(const group of document.querySelectorAll<HTMLElement>('[data-sort-group]')){
        const top=group.dataset.sortGroup==='boards:'?40:160;group.getBoundingClientRect=()=>rect(top,[...group.children].filter(el=>(el as HTMLElement).style.display!=='none').length*30);
        for(const row of group.querySelectorAll<HTMLElement>(':scope > [data-file-key]'))row.getBoundingClientRect=()=>rect(top+[...group.children].filter(el=>(el as HTMLElement).style.display!=='none').indexOf(row)*30,28);
      }
    };
    const pointer=async(target:Element|Document,type:string,y:number)=>act(async()=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:100,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);});
    geometry();const prior=writes;
    await pointer(document.querySelector('[data-file-key="system:tags"] .file-button')!,'pointerdown',230);
    await pointer(document,'pointermove',20);
    assert.equal(writes,prior,'drag previews do not persist');
    assert.equal(Number.parseFloat((document.querySelector('.drag-phantom') as HTMLElement).style.top),40,'phantom is capped below the Boards heading');
    await pointer(document,'pointerup',20);
    assert.equal(writes,prior+1);assert.equal(saved.boardNavigation?.order['boards:'][0],'system:tags');assert.equal(document.querySelector('[data-sort-group="system"] [data-file-key="system:tags"]'),null);
    geometry();const orderBefore=JSON.stringify(saved.boardNavigation);
    await pointer(document.querySelector('[data-file-key="board:Ideas"] .file-button')!,'pointerdown',85);await pointer(document,'pointermove',110);
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(JSON.stringify(saved.boardNavigation),orderBefore,'cancel restores the original navigation');assert.equal(document.querySelector('.drag-phantom'),null);
    await act(async()=>root.render(<Harness bookmarks/>));assert.ok(document.querySelector('.starred [data-file-key="system:templates"]'));assert.ok(document.querySelector('.recent [data-file-key="system:tags"]'));
    await act(async()=>root.render(<ConfirmationProvider><SystemView id="templates" snapshot={snapshot} session={session} onOpen={key=>opened.push(key)} onPreview={key=>opened.push(key)} onTemplate={()=>{}}/></ConfirmationProvider>));
    assert.equal(document.querySelectorAll('.system-name').length,2);await act(async()=>document.querySelector<HTMLButtonElement>('.system-name')!.click());assert.equal(opened.at(-1),'card:one');
    assert.equal(document.querySelectorAll('[role=columnheader]').length,3);
    let dock=defaultDocks();dock.right.collapsed=false;
    const drawDock=()=>root.render(<SideDock side="right" docks={dock} drag={null} onTabDrag={()=>{}} onChange={next=>{dock=next;drawDock();}} onPreview={()=>{}} enabled={id=>id!=='calendar'} renderModule={id=><span>{id}</span>}/>);
    await act(async()=>drawDock());assert.equal(document.querySelector('#tab-calendar'),null);assert.ok(document.querySelector('#tab-style'));
    await act(async()=>document.querySelector<HTMLButtonElement>('#tab-agent')!.click());assert.ok(dock.right.groups[0].tabs.includes('calendar'),'switching visible tabs preserves the hidden Calendar position');
    dock.right.groups=[{id:'first',tabs:['style'],active:'style',weight:1},{id:'hidden',tabs:['calendar'],active:'calendar',weight:2},{id:'last',tabs:['history'],active:'history',weight:1}];
    const resized=resizeGroups(dock,'right',0,.7,'last');assert.equal(resized.right.groups[1].weight,2);assert.ok(Math.abs(resized.right.groups[2].weight-.6)<1e-10);

  }finally{await act(async()=>root.unmount());dom.window.close();}
});
