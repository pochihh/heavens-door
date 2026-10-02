import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import type {Snapshot,Bridge,ViewResults} from '../src/shared';
import {Session} from '../src/renderer/session';
import {writeViewBlock,newViewBlock,parseViewBlock} from '../src/view-block';

test('editable view blocks render without changing Markdown, commit group edits and preserve source through focus changes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,IS_REACT_ACT_ENVIRONMENT:true});
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
