import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,useState} from 'react';
import {moveCommand} from '../src/renderer/CommandSettings';
import {ActionHub,ActionHubSettings} from '../src/renderer/ActionHub';
import {SlashCommandSettings} from '../src/renderer/EditorSettings';
import {DEFAULT_EDITOR_SETTINGS,validateEditorSettings} from '../src/editor-settings';
import {validateActionHub,type HubButton} from '../src/action-hub';

test('command ordering keeps enabled/disabled groups and preserves command metadata',()=>{
 const items=[{id:'a',enabled:true,name:'A',template:'A'},{id:'b',enabled:true,name:'B',template:'B'},{id:'c',enabled:false,name:'C',template:'C'}];
 const moved=moveCommand(items,'a',true,1);assert.deepEqual(moved.map(item=>item.id),['b','a','c']);assert.equal(moved[1].template,'A');const disabled=moveCommand(moved,'b',false,1);assert.deepEqual(disabled.map(item=>item.id),['a','c','b']);assert.equal(disabled[2].enabled,false);assert.deepEqual(items.map(item=>item.enabled),[true,true,false]);
 validateEditorSettings({...DEFAULT_EDITOR_SETTINGS,slashEnabled:false,commands:[{id:'custom',name:'Custom',enabled:true,description:'Insert code',aliases:['snippet'],template:'```\n{{cursor}}\n```'}]});assert.throws(()=>validateEditorSettings({...DEFAULT_EDITOR_SETTINGS,slashEnabled:'off' as never}));assert.throws(()=>validateEditorSettings({...DEFAULT_EDITOR_SETTINGS,commands:[{...items[0],aliases:[true as never]}]}));
 validateActionHub([{command:'newCard',enabled:false,label:'Create',icon:'📝'}]);assert.throws(()=>validateActionHub([{command:'newCard',enabled:'off'}]));
});
test('both command editors use the same groups and keyboard ordering never deletes disabled hub entries',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,innerWidth:1200,innerHeight:900});dom.window.HTMLElement.prototype.showPopover=function(){};window.door={platform:'darwin'} as typeof window.door;
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!),button=(label:string)=>document.querySelector<HTMLButtonElement>('[aria-label="'+label+'"]')!;let current:HubButton[]=[{command:'newCard',label:'Create',icon:'📝'},{command:'newBoard'},{command:'save',label:'Checkpoint',enabled:false}];
 function Hub(){const [value,setValue]=useState(current);return <ActionHub value={value} onChange={next=>{current=next;setValue(next);}} onRun={()=>{}} enabled={()=>true} selected={()=>false}/>;}
 try{
  await act(async()=>root.render(<Hub/>));assert.equal(button('Checkpoint'),null);await act(async()=>button('Create').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})));assert.deepEqual(current.map(item=>item.command),['newBoard','newCard','save']);assert.equal(current[2].enabled,false);
  await act(async()=>root.render(<ActionHubSettings value={current} onChange={next=>{current=next;}}/>));assert.ok(document.querySelector('[aria-label="Enabled commands"]'));assert.ok(document.querySelector('[aria-label="Disabled commands"]'));assert.equal(document.querySelector('.command-toggle'),null);await act(async()=>button('Move Checkpoint').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true}))); assert.equal(current.find(item=>item.command==='save')?.enabled,true);assert.equal(current.find(item=>item.command==='newCard')?.icon,'📝');
  let settings={...DEFAULT_EDITOR_SETTINGS};await act(async()=>root.render(<SlashCommandSettings value={settings} onChange={next=>{settings=next;}}/>));const name=settings.commands[0].name;await act(async()=>button('Move '+name).dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}))); assert.equal(settings.commands.find(command=>command.name===name)?.enabled,false);
  await act(async()=>root.render(<SlashCommandSettings value={settings} onChange={next=>{settings=next;}}/>));await act(async()=>button('Edit '+name).click());assert.ok(document.querySelector('.command-editor-popover'));
  await act(async()=>{const input=document.querySelector<HTMLInputElement>('[aria-label="Command aliases"]')!;Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'title, main');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>document.querySelector<HTMLFormElement>('form[aria-label="Edit slash command"]')!.requestSubmit());assert.deepEqual(settings.commands.find(command=>command.name===name)?.aliases,['title','main']);assert.equal(settings.commands.find(command=>command.name===name)?.enabled,false);assert.equal(document.querySelector('.command-editor-popover'),null);
  assert.equal(document.querySelector('[draggable=true]'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});

for(const kind of ['slash','hub'] as const)test(kind+' command settings follow the shared pointer drag, slot, cancel and save rules',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});let reduced=false;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:reduced}),innerWidth:800,innerHeight:800,IS_REACT_ACT_ENVIRONMENT:true});
 window.door={platform:'darwin'} as typeof window.door;dom.window.HTMLElement.prototype.showPopover=function(){};
 let writes=0,settings:typeof DEFAULT_EDITOR_SETTINGS={...DEFAULT_EDITOR_SETTINGS,commands:[{id:'a',name:'A',enabled:true,description:'Alpha',aliases:['first'],template:'A {{cursor}}'},{id:'b',name:'B',enabled:true,template:'B'},{id:'c',name:'C',enabled:false,template:'C'}]},hub:HubButton[]=[{command:'newCard',enabled:true,label:'A',icon:'📝'},{command:'newBoard',enabled:true,label:'B'},{command:'save',enabled:false,label:'C'}];
 const a=kind==='slash'?'a':'newCard',b=kind==='slash'?'b':'newBoard',c=kind==='slash'?'c':'save',animations:{duration?:number;easing?:string}[]=[];
 dom.window.HTMLElement.prototype.animate=function(_frames,options){animations.push(options as {duration?:number;easing?:string});return {cancel:()=>{}} as Animation;};
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);let unmounted=false;
 function Harness(){const [slash,setSlash]=useState(settings),[buttons,setButtons]=useState(hub);return <div className="settings-content">{kind==='slash'?<SlashCommandSettings value={slash} onChange={value=>{writes++;settings=value;setSlash(value);}}/>:<ActionHubSettings value={buttons} onChange={value=>{writes++;hub=value;setButtons(value);}}/>}</div>;}
 const entries=()=>kind==='slash'?settings.commands:hub.map(item=>({...item,id:item.command,enabled:item.enabled!==false}));
 const row=(id:string)=>document.querySelector<HTMLElement>('.command-settings [data-command="'+id+'"]')!;
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}});
 const geometry=()=>{
  document.querySelector<HTMLElement>('.settings-content')!.getBoundingClientRect=()=>rect(10,50,500,650);
  document.querySelector<HTMLElement>('.command-settings')!.getBoundingClientRect=()=>rect(20,100,460,500);
  for(const [name,top] of [['enabled',100],['disabled',350]] as const){const list=document.querySelector<HTMLElement>('[data-sort-group="'+name+'"]')!;list.parentElement!.getBoundingClientRect=()=>rect(20,top,460,220);list.getBoundingClientRect=()=>rect(20,top+30,460,180);
   for(const el of list.querySelectorAll<HTMLElement>('[data-file-key]'))el.getBoundingClientRect=()=>{const visible=[...list.children].filter(child=>(child as HTMLElement).style.display!=='none'&&((child as HTMLElement).dataset.fileKey||child.classList.contains('sort-placeholder')));return rect(20,top+30+visible.indexOf(el)*40,440,40);};
  }
 };
 const pointer=async(target:Element|Document,type:string,x:number,y:number,id=1)=>act(async()=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});target.dispatchEvent(event);});
 const clean=()=>{assert.equal(document.querySelector('.drag-phantom'),null);assert.equal(document.querySelector('.sort-placeholder'),null);assert.equal(document.body.classList.contains('list-dragging'),false);};
 try{
  await act(async()=>root.render(<Harness/>));geometry();assert.equal(document.querySelector('[draggable=true]'),null);
  await pointer(row(a).querySelector('.command-setting-meta')!,'pointerdown',50,140);await pointer(document,'pointermove',53,142);clean();assert.equal(writes,0,'click-sized movement does not lift or write');
  await pointer(document,'pointermove',200,151);assert.equal(document.querySelectorAll('.drag-phantom').length,1);assert.equal(document.querySelectorAll('.sort-placeholder').length,1);assert.equal((document.querySelector('.drag-phantom') as HTMLElement).style.left,'20px','phantom locks X');assert.equal(row(a).style.display,'none');assert.equal(document.querySelector('.command-drop-end'),null);
  await pointer(document,'pointermove',200,179);assert.equal(document.querySelector('.sort-placeholder')!.nextElementSibling?.getAttribute('data-file-key'),a,'25% threshold has not been crossed');
  await pointer(document,'pointermove',200,185);assert.equal(writes,0,'preview does not save');assert.deepEqual(entries().filter(item=>item.enabled).map(item=>item.id),[a,b]);await pointer(document,'pointerup',200,185);
  assert.equal(writes,1);assert.deepEqual(entries().filter(item=>item.enabled).map(item=>item.id),[b,a]);assert.ok(animations.some(options=>options.duration===150&&options.easing==='cubic-bezier(0.2,0,0,1)'));clean();geometry();
  await act(async()=>row(a).querySelector<HTMLButtonElement>('[aria-label="Edit A"]')!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));assert.equal(document.querySelector('.command-editor-popover'),null,'release click cannot open Edit');
  await pointer(row(a).querySelector('[data-command-handle]')!,'pointerdown',50,180);await pointer(document,'pointermove',180,390);assert.equal(writes,1);assert.ok(document.querySelector('[data-sort-group="disabled"]>.sort-placeholder'));await pointer(document,'pointerup',180,390);assert.equal(writes,2);assert.equal(entries().find(item=>item.id===a)!.enabled,false);assert.deepEqual(entries().filter(item=>!item.enabled).slice(0,2).map(item=>item.id),[a,c]);
  if(kind==='slash'){assert.deepEqual(settings.commands.find(item=>item.id===a)?.aliases,['first']);assert.equal(settings.commands.find(item=>item.id===a)?.template,'A {{cursor}}');}else assert.equal(hub.find(item=>item.command===a)?.icon,'📝');clean();geometry();
  await pointer(row(a),'pointerdown',50,390);await pointer(document,'pointermove',70,398);await pointer(document,'pointerup',70,398);assert.equal(writes,2,'returning to the same slot does not save');clean();geometry();
  const saved=JSON.stringify(entries());
  for(const cancel of ['escape','pointercancel','blur','outside','invalid'] as const){await pointer(row(b),'pointerdown',50,140);await pointer(document,'pointermove',130,390);assert.equal(writes,2);
   if(cancel==='escape')await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
   else if(cancel==='pointercancel')await pointer(document,'pointercancel',130,390);
   else if(cancel==='blur')await act(async()=>window.dispatchEvent(new dom.window.Event('blur')));
   else await pointer(document,'pointerup',cancel==='outside'?window.innerWidth+1:600,390);
   clean();assert.equal(JSON.stringify(entries()),saved);assert.equal(writes,2,cancel+' never saves');geometry();
  }
  reduced=true;const count=animations.length;await pointer(row(b),'pointerdown',50,140);await pointer(document,'pointermove',130,390);assert.equal(animations.length,count,'reduced motion disables neighbor animation');await pointer(document,'pointercancel',130,390);clean();geometry();
  const edit=row(b).querySelector<HTMLButtonElement>('[aria-label="Edit B"]')!;await pointer(edit,'pointerdown',440,140);await pointer(document,'pointermove',130,390);clean();await pointer(document,'pointerup',130,390);assert.equal(writes,2,'Edit is never a drag handle');
  await pointer(row(b),'pointerdown',50,140);await pointer(document,'pointermove',130,390);await act(async()=>root.unmount());unmounted=true;clean();assert.equal(writes,2,'unmount cancels without saving');
 }finally{if(!unmounted)await act(async()=>root.unmount());dom.window.close();}
});
