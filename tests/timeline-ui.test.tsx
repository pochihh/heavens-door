import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import type {TagResult,TagValue} from '../src/shared';
import {DEFAULT_DATE_DISPLAY,shiftDay} from '../src/dates';

test('Timeline click, move, resize, cancellation and range creation share the date file values',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,innerWidth:1200,innerHeight:900,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client'),{TimelineView,timelineDates}=await import('../src/renderer/TimelineView'),{DateDisplayContext}=await import('../src/renderer/DateProperty');
 dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 const root=createRoot(document.getElementById('root')!),today=new Date().toISOString().slice(0,10),range={start:today,end:shiftDay(today,2)};
 const row:TagResult={card:{id:'a',path:'A.md',name:'A',title:'Task',revision:'r',legacy:false},properties:{'project/Date':range}},writes:TagValue[]=[],created:TagValue[]=[],opened:string[]=[];
 const render=()=>root.render(<DateDisplayContext.Provider value={{display:{...DEFAULT_DATE_DISPLAY,timeZone:'UTC'},onChange:async()=>{}}}><TimelineView view={{id:'time',name:'Timeline',type:'timeline',dateBy:'project/Date'}} rows={[row]} field={{keys:['project/Date'],name:'Date',type:'date',tags:['project']}} busy={false} onEditing={()=>{}} onSave={async(_row,key,value)=>{assert.equal(key,'project/Date');writes.push(value);row.properties[key]=value;render();}} onOpen={key=>opened.push(key)} onCreate={(_anchor,_column,date)=>{created.push(date!);}} onViewChange={()=>{}}/></DateDisplayContext.Provider>);
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}});
 const setup=()=>{document.querySelector<HTMLElement>('.timeline-scroll')!.getBoundingClientRect=()=>rect(0,0,2200,500);document.querySelectorAll<HTMLElement>('.timeline-track').forEach(el=>el.getBoundingClientRect=()=>rect(180,50,1568,46));};
 const pointer=async(target:Element|Document,type:string,x:number,y=60)=>act(async()=>{target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));});
 const bar=()=>document.querySelector<HTMLElement>('.timeline-bar')!;
 try{
  await act(async()=>render());setup();const position=bar().style.left;
  assert.equal(document.querySelector('.timeline-name'),null,'The card title lives on the timeline bar, not in a duplicate fixed column');
  assert.equal(document.querySelector('.timeline-bar-label')?.textContent,'Task');
  assert.equal(document.querySelector('.timeline-day-number[aria-current=date]')?.textContent,String(new Date(today+'T00:00:00Z').getUTCDate()));
  assert.ok(document.querySelector('.timeline-today-line'));
  assert.equal(document.querySelectorAll('.timeline-day-number').length,28);
  assert.equal(document.querySelectorAll('.timeline-toolbar select').length,0,'The scale menu uses the shared anchored popover');
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Time scale"]')!.click());
  assert.equal(document.querySelector('[role=option][aria-selected=true]')?.textContent,'Week');
  await act(async()=>document.querySelector('.property-popover')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));

  await pointer(bar(),'pointerdown',600);await pointer(document,'pointerup',600);assert.deepEqual(opened,['card:a']);assert.equal(writes.length,0);
  await pointer(bar(),'pointerdown',600);await pointer(document,'pointermove',656);assert.notEqual(bar().style.left,position);assert.equal(writes.length,0);await pointer(document,'pointerup',656);assert.deepEqual(writes.at(-1),{start:shiftDay(today,1),end:shiftDay(today,3)});assert.equal(opened.length,1);
  setup();await pointer(bar().querySelector('button:last-child')!,'pointerdown',700);await pointer(document,'pointermove',756);await pointer(document,'pointerup',756);assert.deepEqual(writes.at(-1),{start:shiftDay(today,1),end:shiftDay(today,4)});assert.equal(opened.length,1);
  setup();const count=writes.length;await pointer(bar(),'pointerdown',600);await pointer(document,'pointermove',488);await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await pointer(document,'pointerup',488);assert.equal(writes.length,count);
  setup();await pointer(bar(),'pointerdown',600);await pointer(document,'pointermove',2201);await pointer(document,'pointerup',2201);assert.equal(writes.length,count,'Dropping outside does not save');
  setup();const track=document.querySelector('.timeline-new-track')!;await pointer(track,'pointerdown',180+7*56);await pointer(document,'pointermove',180+9*56);assert.equal(created.length,0);await pointer(document,'pointerup',180+9*56);assert.deepEqual(created,[range]);
  assert.equal(timelineDates({start:today,end:shiftDay(today,-1)}),null);assert.equal(timelineDates({start:today,end:today+'T12:00:00Z'}),null);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Day scheduling adds times; arrows track the viewport; row ordering never edits dates',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:true}),innerWidth:1200,innerHeight:900,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client'),{TimelineView}=await import('../src/renderer/TimelineView'),{DateDisplayContext}=await import('../src/renderer/DateProperty');
 const root=createRoot(document.getElementById('root')!),today=new Date().toISOString().slice(0,10),key='project/Date';
 const row=(id:string,value?:TagValue):TagResult=>({card:{id,path:id+'.md',name:id,title:id,revision:'r',legacy:false},properties:{[key]:value}});
 dom.window.HTMLElement.prototype.showPopover=function(){};
 const rows=[row('A',today),row('B',shiftDay(today,10)),row('C')],writes:{id:string;value:TagValue}[]=[],patches:unknown[]=[];
 let view:import('../src/view-block').BlockView={id:'day',name:'Timeline',type:'timeline',scale:'day',dateBy:key};
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}});
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get(){return this.classList.contains('timeline-scroll')?600:0;},configurable:true});
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.classList.contains('timeline-scroll'))return rect(100,20,600,300);
  if(this.classList.contains('timeline-heading'))return rect(100,20,1728,70);
  if(this.classList.contains('timeline-rows'))return rect(100,100,1728,76);
  if(this.classList.contains('timeline-row'))return rect(100,100+[...this.parentElement!.children].filter(el=>(el as HTMLElement).style.display!=='none').indexOf(this)*38,1728,38);
  return rect(100,100,1728,38);
 };
 const render=()=>root.render(<DateDisplayContext.Provider value={{display:{...DEFAULT_DATE_DISPLAY,timeZone:'UTC'},onChange:async()=>{}}}><TimelineView view={view} rows={rows} field={{keys:[key],name:'Date',type:'date',tags:['project']}} busy={false} onEditing={()=>{}} onSave={async(row,key,value)=>{writes.push({id:row.card.id,value});row.properties[key]=value;render();}} onOpen={()=>{}} onCreate={()=>{}} onViewChange={patch=>{patches.push(patch);view={...view,...patch};render();}}/></DateDisplayContext.Provider>);
 const pointer=(target:Element|Document,type:string,x:number,y=115)=>act(async()=>{target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));});
 const bar=()=>document.querySelector<HTMLElement>('[data-file-key=A] .timeline-bar')!;
 try{
  await act(async()=>render());
  assert.equal(document.querySelector('.timeline-outside')?.textContent,'');assert.equal(document.querySelector('.timeline-outside')?.getAttribute('title'),'B');
  await pointer(bar(),'pointerdown',200);await pointer(document,'pointerup',224);assert.equal(writes.at(-1)?.value,today+'T01:00:00.000Z');
  await pointer(bar().querySelector('.timeline-resize-end')!,'pointerdown',300);await pointer(document,'pointerup',324);assert.deepEqual(writes.at(-1)?.value,{start:today+'T01:00:00.000Z',end:today+'T02:00:00.000Z'});
  const count=writes.length;
  await pointer(document.querySelector('.timeline-new-track')!,'pointermove',388,200);assert.ok(document.querySelector('.timeline-ghost'));assert.ok(document.querySelector('.timeline-day[data-preview=true]'));assert.equal(writes.length,count);
  await pointer(document.querySelector('.timeline-new-track')!,'pointerleave',388,200);
  await act(async()=>document.querySelector<HTMLButtonElement>('.timeline-toolbar>button')!.click());
  await pointer(document.querySelector('.timeline-unscheduled button')!,'pointerdown',110,350);await pointer(document,'pointermove',388,150);assert.ok(document.querySelector('.timeline-ghost'));assert.equal(document.querySelector<HTMLElement>('.timeline-schedule-preview')!.style.top,'38px','schedule preview follows the visible hovered row');await pointer(document,'pointerup',388,150);assert.deepEqual(writes.at(-1),{id:'C',value:today+'T12:00:00.000Z'});
  const dates=JSON.stringify(rows.map(row=>row.properties));
  await pointer(document.querySelector('[data-file-key=A] .timeline-reorder')!,'pointerdown',110,110);await pointer(document,'pointermove',110,170);assert.ok(document.querySelector('.drag-phantom'));assert.ok(document.querySelector('.sort-placeholder'));assert.equal(patches.length,0);await pointer(document,'pointerup',110,170);
  assert.equal(view.sort,'manual');assert.equal(view.order?.rows[1],'A');assert.equal(JSON.stringify(rows.map(row=>row.properties)),dates);
  const scroller=document.querySelector<HTMLElement>('.timeline-scroll')!;await act(async()=>{scroller.scrollLeft=600;scroller.dispatchEvent(new dom.window.Event('scroll'));await new Promise(resolve=>setTimeout(resolve,30));});
  assert.equal(document.querySelector('[data-file-key=A] .timeline-bar'),null);assert.equal(document.querySelector('[data-file-key=A] .timeline-outside')?.getAttribute('title'),'A');
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
