import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import type {Snapshot,TagResult} from '../src/shared';

test('Table grips preview row swaps, cancel safely, and preserve cell clicks while panning in both appearances',async()=>{
 const dom=new JSDOM('<div contenteditable="true"><section contenteditable="false"><div id="root"></div></section></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:true}),IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client'),{TableView}=await import('../src/renderer/TableView'),{moveCardId}=await import('../src/view-block');
 const root=createRoot(document.getElementById('root')!),snapshot:Snapshot={root:'/test',name:'Test',cards:[],boards:[],issues:[],historyAvailable:false};
 let rows:TagResult[]=['a','b','c'].map(id=>({card:{id,path:id+'.md',name:id,revision:'r',legacy:false},properties:{}})),busy=false,compact=false,opened=0,edits=0,fail=false;
 const moves:string[]=[],scroll={left:0,top:0};const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}});
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get(){return 320;},configurable:true});Object.defineProperty(dom.window.HTMLElement.prototype,'scrollWidth',{get(){return 700;},configurable:true});
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.matches('tr')){const index=[...this.parentElement!.children].filter(el=>(el as HTMLElement).style.display!=='none').indexOf(this);return rect(0,50+index*36,700,36);}
  return this.matches('tbody')?rect(0,50,700,108):rect(0,0,320,200);
 };
 const render=()=>root.render(<TableView view={{id:'table',name:'Table',type:'table'}} rows={rows} columns={[{keys:['file.title'],name:'Card name',type:'text',tags:[]},{keys:['project/Name'],name:'Name',type:'text',tags:[]}]} compact={compact} snapshot={snapshot} busy={busy} scroll={scroll} onEditing={value=>{busy=!!value;render();}} title={row=><button onClick={()=>opened++}>{row.card.name}</button>} cell={()=> <button onClick={()=>edits++}>Value</button>} onPreview={()=>opened++} onMove={async(row,position)=>{if(fail)throw new Error('Save failed');moves.push(row.card.id);const ids=moveCardId([],rows.map(r=>r.card.id),row.card.id,position.before,position.after);rows=ids.map(id=>rows.find(r=>r.card.id===id)!);render();}}/>);
 const pointer=(target:Element|Document,type:string,x:number,y:number)=>act(async()=>{target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));});
 const grip=()=>document.querySelector('[data-file-key=a] .view-row-grip')!,ids=()=>[...document.querySelectorAll('tbody>[data-file-key]')].map(el=>el.getAttribute('data-file-key'));
 try{
  await act(async()=>render());const table=document.querySelector('.view-records')!;
  await pointer(grip(),'pointerdown',12,65);await pointer(document,'pointermove',12,110);
  assert.equal(document.querySelector('.sort-placeholder')?.tagName,'TR','Preview retains valid table structure');assert.equal(document.querySelector('.sort-placeholder td')?.getAttribute('colspan'),'3');assert.equal(document.querySelector('.sort-placeholder')?.previousElementSibling?.getAttribute('data-file-key'),'b');assert.equal(moves.length,0);
  assert.equal(document.querySelector<HTMLElement>('.drag-phantom')?.style.clipPath,'inset(0 380px 0 0px)','The floating row is clipped to the table viewport');
  await pointer(document,'pointerup',12,110);assert.deepEqual(ids(),['b','a','c']);assert.equal(document.querySelector('.view-records'),table);assert.deepEqual(moves,['a']);
  for(const ending of ['Escape','blur','pointercancel','outside']){
   await pointer(grip(),'pointerdown',12,100);await pointer(document,'pointermove',12,145);
   if(ending==='outside')await pointer(document,'pointerup',-20,145);else await act(async()=>{(ending==='blur'?window:document).dispatchEvent(ending==='Escape'?new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}):new dom.window.Event(ending));});
   assert.deepEqual(ids(),['b','a','c']);assert.equal(moves.length,1);assert.equal(document.querySelector('.drag-phantom'),null);assert.equal(busy,false);
  }
  const cell=document.querySelector('tbody tr td:last-child button')!;
  await pointer(cell,'pointerdown',250,70);await pointer(document,'pointermove',170,70);assert.equal(scroll.left,80);await pointer(document,'pointerup',170,70);await act(async()=>cell.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true})));assert.equal(edits,0,'Panning does not open a cell editor');
  await new Promise(resolve=>setTimeout(resolve,1));await act(async()=>(cell as HTMLElement).click());assert.equal(edits,1,'A normal click still edits');
  await pointer(cell,'pointerdown',200,70);await pointer(document,'pointermove',150,70);await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(scroll.left,80);assert.equal((table as HTMLElement).scrollLeft,80);assert.equal(moves.length,1);
  await act(async()=>{compact=true;render();});assert.equal(document.querySelector('thead'),null);assert.equal(document.querySelector('.view-records'),table);assert.equal((table as HTMLElement).scrollLeft,80);
  await act(async()=>grip().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true})));assert.deepEqual(ids(),['a','b','c']);assert.equal(opened,0);
  fail=true;await act(async()=>grip().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})));assert.match(document.querySelector('[role=alert]')!.textContent!,/Save failed/);assert.deepEqual(ids(),['a','b','c']);assert.equal(busy,false);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Table drops switch to Manual without remounting or flashing during save, refresh and rollback',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,matchMedia:()=>({matches:true}),IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.showPopover=function(){};
 const {createRoot}=await import('react-dom/client'),{ViewBlock,ViewBlockProvider}=await import('../src/renderer/ViewBlock'),{Session}=await import('../src/renderer/session'),{newViewBlock,writeViewBlock}=await import('../src/view-block');
 const root=createRoot(document.getElementById('root')!);let snapshot:Snapshot={root:'/test',name:'Test',cards:['owner','a','b','c'].map(id=>({id,path:id+'.md',name:id,revision:'r',legacy:false})),boards:[],issues:[],historyAvailable:false};
 const block=newViewBlock();let source=writeViewBlock('',block),requests=0,finishSave=()=>{},rejectSave:(error:Error)=>void=()=>{},refresh:(rows:import('../src/shared').ViewResults)=>void=()=>{};
 const rows=snapshot.cards.slice(1).map(card=>({card,properties:{}}));
 const session=new Session({assetUrl:(s:string)=>s,request:async()=>++requests===1?{rows,total:3}:new Promise(resolve=>{refresh=resolve;})} as unknown as import('../src/shared').Bridge);session.state.snapshot=snapshot;
 const render=()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}><ViewBlock source={source} path="owner.md" onChange={()=>{}}/></ViewBlockProvider>);
 session.moveViewCard=async()=>{await new Promise<void>((resolve,reject)=>{finishSave=resolve;rejectSave=reject;});block.views[0].sort='manual';block.views[0].order={rows:['b','a','c']};source=writeViewBlock(source,block);snapshot={...snapshot,cards:snapshot.cards.map(c=>c.id==='owner'?{...c,revision:'r2'}:c)};session.state.snapshot=snapshot;render();return {snapshot,edits:[]};};
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,120));}),ids=()=>[...document.querySelectorAll('tbody>[data-file-key]')].map(el=>el.getAttribute('data-file-key'));
 const down=()=>act(async()=>document.querySelector('[data-file-key=a] .view-row-grip')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})));
 try{
  await act(async()=>render());await settle();const table=document.querySelector<HTMLElement>('.view-records')!,a=document.querySelector('[data-file-key=a]');table.scrollLeft=70;table.dispatchEvent(new dom.window.Event('scroll'));
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label=Sort]')!.click());assert.match(document.querySelector('[data-kind=sort]')!.textContent!,/Manual/);await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click());
  await down();assert.deepEqual(ids(),['b','a','c']);await act(async()=>finishSave());await settle();assert.equal(document.querySelector('.view-records'),table);assert.equal(document.querySelector('[data-file-key=a]'),a);assert.equal(table.scrollLeft,70);assert.deepEqual(ids(),['b','a','c']);assert.doesNotMatch(document.querySelector('.view-result-footer')!.textContent!,/Loading/);
  await act(async()=>refresh({rows:[rows[1],rows[0],rows[2]],total:3}));assert.deepEqual(ids(),['b','a','c']);
  await down();assert.deepEqual(ids(),['b','c','a']);await act(async()=>rejectSave(new Error('Save failed')));assert.deepEqual(ids(),['b','a','c']);assert.equal(document.querySelector('.view-records'),table);assert.match(document.querySelector('[role=alert]')!.textContent!,/Save failed/);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
