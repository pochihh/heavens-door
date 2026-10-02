import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import type {TagResult,TagValue} from '../src/shared';
import {DEFAULT_DATE_DISPLAY,shiftDay} from '../src/dates';

test('Timeline click, move, resize, cancellation and range creation share the date file values',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client'),{TimelineView,timelineDates}=await import('../src/renderer/TimelineView'),{DateDisplayContext}=await import('../src/renderer/DateProperty');
 const root=createRoot(document.getElementById('root')!),today=new Date().toISOString().slice(0,10),range={start:today,end:shiftDay(today,2)};
 const row:TagResult={card:{id:'a',path:'A.md',name:'A',title:'Task',revision:'r',legacy:false},properties:{'project/Date':range}},writes:TagValue[]=[],created:TagValue[]=[],opened:string[]=[];
 const render=()=>root.render(<DateDisplayContext.Provider value={{display:{...DEFAULT_DATE_DISPLAY,timeZone:'UTC'},onChange:async()=>{}}}><TimelineView view={{id:'time',name:'Timeline',type:'timeline',dateBy:'project/Date'}} rows={[row]} field={{keys:['project/Date'],name:'Date',type:'date',tags:['project']}} busy={false} onEditing={()=>{}} onSave={async(_row,key,value)=>{assert.equal(key,'project/Date');writes.push(value);row.properties[key]=value;render();}} onOpen={key=>opened.push(key)} onCreate={(_anchor,_column,date)=>{created.push(date!);}} onViewChange={()=>{}}/></DateDisplayContext.Provider>);
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}});
 const setup=()=>{document.querySelector<HTMLElement>('.timeline-scroll')!.getBoundingClientRect=()=>rect(0,0,2200,500);document.querySelectorAll<HTMLElement>('.timeline-track').forEach(el=>el.getBoundingClientRect=()=>rect(180,50,1568,46));};
 const pointer=async(target:Element|Document,type:string,x:number,y=60)=>act(async()=>{target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));});
 const bar=()=>document.querySelector<HTMLElement>('.timeline-bar')!;
 try{
  await act(async()=>render());setup();const position=bar().style.left;
  await pointer(bar(),'pointerdown',600);await pointer(document,'pointerup',600);assert.deepEqual(opened,['card:a']);assert.equal(writes.length,0);
  await pointer(bar(),'pointerdown',600);await pointer(document,'pointermove',656);assert.notEqual(bar().style.left,position);assert.equal(writes.length,0);await pointer(document,'pointerup',656);assert.deepEqual(writes.at(-1),{start:shiftDay(today,1),end:shiftDay(today,3)});assert.equal(opened.length,1);
  setup();await pointer(bar().querySelector('button:last-child')!,'pointerdown',700);await pointer(document,'pointermove',756);await pointer(document,'pointerup',756);assert.deepEqual(writes.at(-1),{start:shiftDay(today,1),end:shiftDay(today,4)});assert.equal(opened.length,1);
  setup();const count=writes.length;await pointer(bar(),'pointerdown',600);await pointer(document,'pointermove',488);await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await pointer(document,'pointerup',488);assert.equal(writes.length,count);
  setup();await pointer(bar(),'pointerdown',600);await pointer(document,'pointermove',2201);await pointer(document,'pointerup',2201);assert.equal(writes.length,count,'Dropping outside does not save');
  setup();const track=document.querySelector('.timeline-new-track')!;await pointer(track,'pointerdown',180+7*56);await pointer(document,'pointermove',180+9*56);assert.equal(created.length,0);await pointer(document,'pointerup',180+9*56);assert.deepEqual(created,[range]);
  assert.equal(timelineDates({start:today,end:shiftDay(today,-1)}),null);assert.equal(timelineDates({start:today,end:today+'T12:00:00Z'}),null);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
