import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {DEFAULT_JOURNAL,journalToday} from '../src/journal';
import type {TemplateInput,TemplateValues} from '../src/templates';
import type {Snapshot} from '../src/shared';
import type {Session} from '../src/renderer/session';

function setup(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,innerWidth:1200,innerHeight:900,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};dom.window.HTMLElement.prototype.showPopover=function(){};
 return dom;
}
const dom=setup();
after(()=>dom.window.close());
const {createRoot}=await import('react-dom/client');
const {TemplateDialog}=await import('../src/renderer/TemplateDialog');
const {CalendarView}=await import('../src/renderer/CalendarView');
const {SystemView}=await import('../src/renderer/SystemView');
const {ConfirmationProvider}=await import('../src/renderer/Confirmation');
const fields:TemplateInput[]=[{name:'project',label:'Project',type:'text',required:true,default:'Robot arm'},{name:'priority',label:'Priority',type:'number',required:true,default:3},{name:'reviewed',label:'Reviewed',type:'checkbox',required:true,default:false},{name:'due',label:'Due',type:'date',required:false}];
const snapshot={root:'/notes',name:'Notes',cards:[{id:'main',path:'Templates/Meeting.md',name:'Meeting',revision:'r',legacy:false},{id:'guide',path:'Templates/template.md',name:'template',revision:'g',legacy:false}],boards:[],issues:[],historyAvailable:false,preferences:{theme:'dark',stem:'untitled',starred:[],recent:[],icons:{},journal:{...DEFAULT_JOURNAL,dailyTemplate:'Templates/Meeting.md'}}} as Snapshot;

test('template creation gathers inputs together, hides guides, and uses the shared date picker',async()=>{
 const root=createRoot(document.getElementById('root')!);let values:TemplateValues={},closed=false;
 const session={templatePlan:async()=>({inputs:fields}),createFromTemplate:async(_template:string,_folder:string,_stem:string,input:TemplateValues)=>{values=input;return {id:'created'};}} as unknown as Session;
 try{
  await act(async()=>root.render(<TemplateDialog snapshot={snapshot} session={session} onOpen={()=>{}} onClose={()=>{closed=true;}}/>));
  assert.equal(document.querySelectorAll('.template-list [role=option]').length,1);assert.equal(document.querySelectorAll('input[aria-label="Project"]').length,1);assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Priority"]')!.value,'3');assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Reviewed"]')!.checked,false);
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Due"]')!.click());assert.ok(document.querySelector('.date-calendar'));assert.ok(document.querySelector('.date-number[aria-current=date]'));assert.equal(document.querySelectorAll('[role=switch]').length,0,'template date fields cannot add ranges or time');
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('.property-popup-actions button')].find(b=>b.textContent==='Done')!.click());
  await act(async()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(values.project,'Robot arm');assert.equal(values.priority,3);assert.equal(values.reviewed,false);assert.equal(closed,true);
 }finally{await act(async()=>root.unmount());}
});

test('Journal prompts before creating and special-folder notes stay collapsed above the list',async()=>{
 const root=createRoot(document.getElementById('root')!);let created=0,answer:TemplateValues={},preview='';
 const guide={id:'guide',path:'Templates/template.md',name:'template',revision:'g',legacy:false,body:'# My instructions\n\nEditable text.\n'};
 const bridge={request:async(request:{kind:string})=>request.kind==='journalEntries'?[]:guide};Object.assign(window,{door:bridge});
 const session={bridge,templatePlan:async()=>({inputs:fields}),openJournal:async(_day:string,_period:string,values:TemplateValues)=>{created++;answer=values;return {id:'new-journal'};},ensureSystemGuide:async()=>guide.path,update:()=>{}} as unknown as Session;
 try{
  await act(async()=>root.render(<CalendarView snapshot={snapshot} session={session} onOpen={()=>{}}/>));
  const open=()=>document.querySelector<HTMLButtonElement>(`[data-day="${journalToday()}"]`)!.click();
  await act(async()=>open());assert.equal(created,0);assert.ok(document.querySelector('dialog[open]'));
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('dialog .dialog-actions button')].find(b=>b.textContent==='Cancel')!.click());assert.equal(created,0);assert.equal(document.querySelector('dialog'),null);
  await act(async()=>open());await act(async()=>document.querySelector('dialog form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(created,1);assert.equal(answer.project,'Robot arm');
  await act(async()=>root.render(<ConfirmationProvider><SystemView id="templates" snapshot={snapshot} session={session} onOpen={()=>{}} onPreview={key=>{preview=key;}} onTemplate={()=>{}}/></ConfirmationProvider>));
  const notes=document.querySelector<HTMLDetailsElement>('.system-guide')!;assert.equal(notes.open,false);assert.equal(document.querySelectorAll('.system-name').length,1);assert.match(notes.textContent!,/Editable text/);assert.ok(notes.compareDocumentPosition(document.querySelector('.system-search')!)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  await act(async()=>document.querySelector<HTMLButtonElement>('.system-guide-edit')!.click());assert.equal(preview,'card:guide');
 }finally{await act(async()=>root.unmount());}
});
