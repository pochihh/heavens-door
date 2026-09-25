import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JSDOM} from 'jsdom';
import {act,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Workspace} from '../src/core/workspace';
import {WorkspaceRegistry} from '../src/core/registry';
import {listFiles,inspectFile} from '../src/core/files';
import {crossed,insertBookmark,useBookmarkDrag} from '../src/renderer/sortable';

test('Explorer identifies real whiteboards, lists physical assets and confines inspection to the workspace',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-explorer-')),root=join(dir,'Notes');
  await fs.mkdir(join(root,'assets'),{recursive:true});await fs.mkdir(join(root,'.hidden'));
  await fs.writeFile(join(root,'assets','figure.svg'),'<svg/>');await fs.writeFile(join(root,'assets','paper.pdf'),'%PDF-1.4');await fs.writeFile(join(root,'.hidden','config.json'),'{}');
  await fs.writeFile(join(dir,'outside.txt'),'private');await fs.symlink(join(dir,'outside.txt'),join(root,'outside-link'));
  const workspace=await Workspace.open(root,join(dir,'cache'));
  t.after(async()=>{workspace.close();await fs.rm(dir,{recursive:true,force:true});});
  await workspace.createFolder('','Ideas');await workspace.createFolder('Ideas','Nested');
  await workspace.create('assets','ordinary',0,0,false);
  assert.deepEqual(workspace.snapshot().boards.map(b=>b.folder).sort(),['','Ideas',join('Ideas','Nested')]);
  assert.deepEqual(workspace.snapshot().boards.find(b=>b.folder==='')!.cards.map(c=>c.folder),['Ideas']);
  const files=await listFiles(root,'');assert.ok(files.some(f=>f.name==='.hidden'));assert.ok(files.some(f=>f.name==='assets'&&f.kind==='folder'));
  assert.equal(files.find(f=>f.name==='outside-link')?.kind,'symlink');
  assert.deepEqual((await listFiles(root,'assets')).map(f=>f.name),['figure.svg','ordinary.md','paper.pdf']);
  assert.equal((await inspectFile(root,'assets/figure.svg')).kind,'image');assert.equal((await inspectFile(root,'assets/paper.pdf')).kind,'binary');
  assert.equal((await inspectFile(root,'.hidden/config.json')).text,'{}');
  await assert.rejects(()=>inspectFile(root,'../outside.txt'),/Invalid/);
  await assert.rejects(()=>inspectFile(root,'outside-link'),/Symbolic/);
  await assert.rejects(()=>listFiles(root,dir),/Invalid/);
  const registryFile=join(dir,'app','workspaces.json'),registry=new WorkspaceRegistry(registryFile);
  await Promise.all([registry.register(root),registry.register(root),registry.register(dir)]);
  assert.deepEqual((await new WorkspaceRegistry(registryFile).list()).map(w=>w.root),[await fs.realpath(root),await fs.realpath(dir)]);
  await fs.writeFile(registryFile,'corrupt');await assert.rejects(()=>registry.register(root));assert.equal(await fs.readFile(registryFile,'utf8'),'corrupt','invalid registry is not overwritten');
});

test('bookmark drags use one axis-locked phantom and placeholder, reorder, unstar, and cancel without persistence',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:false}),IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root')!);
  let stored=['a','b','c'],writes=0;
  function Harness(){
    const [keys,setKeys]=useState(stored),target=useRef<HTMLDivElement>(null);
    const drag=useBookmarkDrag(target,(key,index,source)=>{stored=insertBookmark(stored,key,index,source);writes++;setKeys(stored);});
    return <><div id="starred" ref={target}>{keys.map(k=><div key={k} data-file-key={k}><button onPointerDown={e=>drag(e,k,true)}>{k}</button></div>)}</div><div id="recent" data-file-key="d"><button onPointerDown={e=>drag(e,'d',false)}>d</button></div></>;
  }
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}});
  const geometry=()=>{
    const list=document.querySelector<HTMLElement>('#starred')!;list.getBoundingClientRect=()=>rect(20,100,220,150);
    for(const row of document.querySelectorAll<HTMLElement>('[data-file-key]'))row.getBoundingClientRect=()=>{
      const visible=[...list.children].filter(el=>(el as HTMLElement).style.display!=='none');return rect(28,row.id==='recent'?300:105+visible.indexOf(row)*30,204,28);
    };
  };
  const pointer=async(target:Element|Document,type:string,x:number,y:number)=>{
    await act(async()=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);});
  };
  const button=(key:string)=>document.querySelector<HTMLElement>(`#starred [data-file-key="${key}"] button`)!;
  try{
    await act(async()=>root.render(<Harness/>));geometry();
    await pointer(button('a'),'pointerdown',50,115);await pointer(document,'pointermove',160,148);
    assert.equal(document.querySelectorAll('.drag-phantom').length,1);assert.equal(document.querySelectorAll('.sort-placeholder').length,1);
    assert.equal((document.querySelector('.drag-phantom') as HTMLElement).style.left,'28px','cross axis is fixed');
    assert.deepEqual(stored,['a','b','c'],'pointer movement does not persist');
    await pointer(document,'pointermove',160,185);await pointer(document,'pointerup',160,185);
    assert.deepEqual(stored,['b','c','a']);assert.equal(writes,1);assert.equal(document.querySelector('.drag-phantom'),null);geometry();
    await pointer(button('b'),'pointerdown',50,115);await pointer(document,'pointermove',500,150);
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.deepEqual(stored,['b','c','a']);assert.equal(writes,1);assert.equal(document.querySelector('.sort-placeholder'),null);
    await pointer(button('b'),'pointerdown',50,115);await pointer(document,'pointermove',500,150);await pointer(document,'pointerup',500,150);
    assert.deepEqual(stored,['c','a']);geometry();
    const recent=document.querySelector('#recent button')!;
    await pointer(recent,'pointerdown',50,310);await pointer(document,'pointermove',120,110);await pointer(document,'pointerup',120,110);
    assert.deepEqual(stored,['d','c','a']);assert.equal(document.querySelector('#recent')?.textContent,'d');geometry();
    await pointer(button('d'),'pointerdown',50,115);await pointer(document,'pointermove',80,160);await pointer(document,'pointercancel',80,160);
    assert.deepEqual(stored,['d','c','a']);assert.equal(document.body.classList.contains('list-dragging'),false);
    assert.equal(crossed(26,0,100,1),true);assert.equal(crossed(24,0,100,1),false);assert.equal(crossed(74,0,100,-1),true);assert.equal(crossed(76,0,100,-1),false);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
