import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import type {Snapshot,Bridge,ViewResults} from '../src/shared';
import {tintColor} from '../src/colors';
import {Session} from '../src/renderer/session';
import {writeViewBlock,newViewBlock,parseViewBlock} from '../src/view-block';

test('editable view blocks render without changing Markdown, commit group edits and preserve source through focus changes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 const snapshot:Snapshot={root:'/test',name:'Test',cards:[],boards:[],tags:[],issues:[],historyAvailable:false};let requests=0;
 const bridge={assetUrl:(s:string)=>s,request:async()=>{requests++;return {rows:[],total:0} satisfies ViewResults;}} as unknown as Bridge;window.door=bridge;
 const {createRoot}=await import('react-dom/client');
 const session=new Session(bridge),{ViewBlockProvider,ViewBlock}=await import('../src/renderer/ViewBlock'),{CardEditor}=await import('../src/renderer/Editor'),{TitleContent}=await import('../src/renderer/TitleContent'),{preview}=await import('../src/renderer/markdown');
 const definition=newViewBlock();definition.views[0].filter={all:[{any:[{field:'file.text',op:'contains',value:'one'},{field:'file.text',op:'contains',value:'two'}]}]};
 let body='# Query card\n\n```view-block\n'+writeViewBlock('',definition)+'```\n\n```js\nconst x = 1;\n```\n',writes=0;const root=createRoot(document.getElementById('root')!);
 const render=(editable=true)=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}>{editable?<CardEditor path="note.md" body={body} cards={[]} onEdit={value=>{body=value;writes++;}}/>:<TitleContent html={preview(body,'note.md')}/>}</ViewBlockProvider>);
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,130));});
 const click=async(selector:string)=>{const element=document.querySelector<HTMLElement>(selector);assert.ok(element,selector);await act(async()=>element.click());};
 try{
   await act(async()=>render());await settle();assert.equal(writes,0);assert.equal(document.querySelectorAll('.view-block').length,1);assert.ok(document.querySelector('[data-node-view-content][hidden]'),'the YAML source must not render above the block');assert.ok(document.querySelector('pre')?.textContent?.includes('const x = 1;'));
   await click('.view-toolbar button:nth-last-child(3)'); // Filter, before Sort and More
   assert.ok(document.querySelector('.view-rule-group .view-group-heading [aria-label="Remove group"]'));
   await click('[aria-label="Remove group"]');assert.equal(document.querySelector('.view-rule-group'),null);
   await click('.view-popup-footer button');await settle();assert.equal(writes,1);assert.ok(body.includes('```view-block'));assert.ok(body.includes('const x = 1;'));const raw=body.split('```view-block\n')[1].split('```')[0];assert.deepEqual(parseViewBlock(raw).views[0].filter,{all:[]});
   const before=body;await act(async()=>render(false));await settle();assert.equal(document.querySelectorAll('.view-block').length,1);assert.equal(document.querySelector('.view-toolbar [aria-label="View options"]'),null);assert.equal(writes,1);assert.equal(body,before);
   await act(async()=>render());await settle();assert.equal(writes,1);assert.ok(requests>=2);
   const broken=writeViewBlock('',{...newViewBlock(),views:[{id:'broken',name:'Broken',type:'table'},{id:'good',name:'Good',type:'list'}]}).replace('name: Broken','name: {unexpected: value}');
   await act(async()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}><ViewBlock source={broken} onChange={()=>{writes++;}}/></ViewBlockProvider>));await settle();
   assert.match(document.querySelector('[role="alert"]')?.textContent??'',/supported layout/);assert.equal(writes,1);
   await click('[role="tab"]:last-child');await settle();assert.equal(document.querySelector('[role="alert"]'),null);assert.ok(document.querySelector('.view-list'));assert.equal(writes,1);
   const unknown=writeViewBlock('',{...newViewBlock(),views:[{id:'table',name:'Table',type:'table',filter:{field:'project/Typo',op:'eq',value:'value'}}]});
   await act(async()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}><ViewBlock source={unknown} onChange={()=>{writes++;}}/></ViewBlockProvider>));await settle();
   await click('.view-toolbar button:nth-last-child(3)');await click('[aria-label="Find a property…"]');
   await click('[role="option"][aria-selected="true"]');assert.ok(document.querySelector('.view-condition'));assert.equal(writes,1);

 }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('compact subpanels and result editors preserve anchors, support status/date edits and Kanban drop',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 const snapshot:Snapshot={root:'/test',name:'Test',cards:[{id:'a',path:'A.md',name:'A',title:'Task A',fillColor:'#c9838a',revision:'r1',legacy:false}],boards:[],issues:[],historyAvailable:false,tags:['project','task'].map(tag=>({path:tag+'.tag',name:tag,tag,revision:'r',inherits:[],overrides:[],fields:[{key:'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:['Doing'],done:['Done']}},{key:'Date',type:'date'},{key:'Location',type:'text'},{key:'Checked',type:'boolean'}]}))};
 const row:ViewResults['rows'][number]={card:snapshot.cards[0],properties:{tags:['project','task'],'project/Status':'Todo','task/Status':'Todo','project/Date':'2026-10-01','project/Location':'Here','task/Location':'There'}};
 let queries=0,opened=0,previewed=0;const writes:{key:string;value:unknown}[]=[];
 const session=new Session({request:async request=>{if(request.kind==='viewCards'){queries++;return {rows:[row],total:1};}throw new Error(request.kind);}} as Bridge);session.state.snapshot=snapshot;
 session.setViewProperty=async(_path,_revision,key,value)=>{writes.push({key,value});row.properties={...row.properties,...Object.fromEntries(['project','task'].map(tag=>[tag+'/'+key.split('/')[1],value]))};};
 const {createRoot}=await import('react-dom/client'),{ViewBlock,ViewBlockProvider}=await import('../src/renderer/ViewBlock');const root=createRoot(document.getElementById('root')!);
 const block=newViewBlock('project');block.views[0].fields=['file.title','project/Status','project/Date','project/Location','project/Checked'];let source=writeViewBlock('',block);
 const render=()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{opened++;}} onPreview={()=>{previewed++;}}><ViewBlock source={source} onChange={next=>{source=next;render();}}/></ViewBlockProvider>);
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,140));});
 const click=async(selector:string)=>{const el=document.querySelector<HTMLElement>(selector);assert.ok(el,selector);await act(async()=>el.click());};
 const textClick=async(text:string)=>{const el=[...document.querySelectorAll<HTMLButtonElement>('.property-popover button')].find(el=>el.textContent===text);assert.ok(el,text);await act(async()=>el.click());};
 const escape=async()=>act(async()=>document.querySelector('.property-popover')?.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 try{
  await act(async()=>render());await settle();assert.equal(queries,1);
  const options=document.querySelector<HTMLElement>('[aria-label="View options"]')!;options.getBoundingClientRect=()=>({left:700,right:730,top:200,bottom:230,width:30,height:30,x:700,y:200,toJSON(){}});
  await click('[aria-label="View options"]');const anchored=document.querySelector<HTMLElement>('.property-popover')!.style.left;assert.equal(document.querySelectorAll('.view-menu-list button').length,5);
  await click('.view-menu-list button');assert.ok(document.querySelector('[data-kind=layout]'));assert.equal(document.querySelector<HTMLElement>('.property-popover')!.style.left,anchored);
  await textClick('Kanban');await settle();assert.equal(parseViewBlock(source).views[0].type,'kanban');await click('[aria-label=Back]');await click('.view-menu-list button:nth-child(3)');assert.ok(document.querySelector('[data-kind=group] [role=listbox]'));await escape();assert.equal(document.querySelector('.property-popover'),null);
  // Pointer down without a drag leaves the source unchanged; real movement uses the shared phantom.
  const card=()=>document.querySelector<HTMLElement>('[data-tag-column="Todo"] .view-result-card')!;
  assert.equal(card().style.background,tintColor('#c9838a'));
  const pointer=(target:Element|Document,type:string,x:number)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:40}));
  document.elementFromPoint=()=>document.querySelector('[data-tag-column="Done"]');
  await act(async()=>{pointer(card(),'pointerdown',20);pointer(document,'pointerup',20);});assert.equal(writes.length,0);
  await act(async()=>{pointer(card(),'pointerdown',20);pointer(document,'pointermove',60);});assert.ok(document.querySelector('.drag-phantom'));await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(writes.length,0);assert.equal(document.querySelector('.drag-phantom'),null);
  await act(async()=>{pointer(card(),'pointerdown',20);pointer(document,'pointermove',80);pointer(document,'pointerup',80);});await settle();assert.deepEqual(writes[0],{key:'project/Status',value:'Done'});assert.ok(document.querySelector('[data-tag-column="Done"] .view-result-card'));assert.equal(opened,0);
  await click('[aria-label="Edit Status"]');await textClick('Todo');await settle();assert.equal(row.properties['task/Status'],'Todo');assert.equal(opened,0);
  const count=writes.length;await click('[aria-label="Edit Location"]');await act(async()=>document.querySelector<HTMLInputElement>('.view-property input')!.blur());await settle();assert.equal(writes.length,count,'Opening and blurring mixed values never writes');
  await click('[aria-label="Edit Location"]');await act(async()=>document.querySelector<HTMLInputElement>('.view-property input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await settle();assert.equal(row.properties['task/Location'],'Here','Explicit Enter applies the common value');
  await click('[aria-label="Edit Date"]');assert.equal(document.querySelectorAll('.date-calendar [role=gridcell]').length,42);const before=queries;await act(async()=>document.querySelector<HTMLButtonElement>('[data-date="2026-10-02"]')!.click());assert.equal(queries,before,'The result query waits for the date draft to commit');await escape();await settle();assert.equal(writes.length,count+1);assert.equal(row.properties['project/Date'],'2026-10-01');
  await click('[aria-label="Edit Date"]');await act(async()=>document.querySelector<HTMLButtonElement>('[data-date="2026-10-02"]')!.click());await act(async()=>document.querySelector<HTMLInputElement>('.date-input-row input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await settle();assert.equal(row.properties['task/Date'],'2026-10-02');
  await click('.view-property input[type=checkbox]');await settle();assert.equal(row.properties['project/Checked'],true);assert.equal(row.properties['task/Checked'],true);
  row.properties['task/Status']='Done';await act(async()=>render());assert.equal(document.querySelectorAll('.view-result-card').length,2);
  await click('[data-tag-column=Todo] [aria-label="Edit Location"]');assert.equal(document.querySelectorAll('.view-property input[type=text]').length,1,'Only the clicked appearance of a merged card opens an editor');await act(async()=>document.querySelector<HTMLInputElement>('.view-property input[type=text]')!.blur());
  await click('.view-card-title');assert.equal(previewed,1);assert.equal(opened,0);await click('.view-result-card');assert.equal(previewed,2);
 }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});
