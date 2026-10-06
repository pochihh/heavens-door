import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,useState} from 'react';
import {MainTabs} from '../src/renderer/MainTabs';
import {documentDropTarget,dropDocumentAt,type DocumentDrop} from '../src/renderer/card-drop';
import {closeTabs,moveTab,navigateTab,panes,removeEmptyPanes,splitPane,pane,tabDocument,validateDocuments,type Pane} from '../src/layout';
import type {Bridge,Card,Snapshot,Request} from '../src/shared';

function setup(){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://workspace.test',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,innerWidth:1200,innerHeight:800,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','');};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect=()=>({x:0,y:0,top:0,left:0,bottom:0,right:0,width:0,height:0,toJSON(){}});
  return dom;
}

test('overflow tabs reveal selection and resize, scroll and search, retain drag previews and keyboard menus',async()=>{
  const dom=setup(),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);let resize=()=>{},selected='',closed='',menu='';
  Object.assign(globalThis,{ResizeObserver:class {constructor(callback:()=>void){resize=callback;} observe(){} disconnect(){}}});
  const initial=['Home','Robot arm planning and prototyping','Project','Journal','Last note'].map((title,i)=>({key:String(i),title,path:'Projects/'+title+'.md',icon:<span aria-hidden="true">◇</span>}));
  let render=()=>{};
  function Fixture(){const [active,setActive]=useState('0'),[items,setItems]=useState(initial),[dragging,setDragging]=useState(false);render=()=>setDragging(value=>!value);return <MainTabs group="one" items={items} active={active} dragging={dragging} onSelect={key=>{selected=key;setActive(key);}} onClose={key=>{closed=key;setItems(items.filter(item=>item.key!==key));}} onMenu={key=>{menu=key;}} onDrag={()=>{}}><span/></MainTabs>;}
  try{
    await act(async()=>root.render(<Fixture/>));
    const list=document.querySelector<HTMLElement>('[role=tablist]')!;let width=200;
    Object.defineProperties(list,{clientWidth:{get:()=>width},scrollWidth:{get:()=>400}});
    list.getBoundingClientRect=()=>({left:0,right:width,top:0,bottom:42,width,height:42} as DOMRect);
    for(const [index,tab] of [...list.children].entries())(tab as HTMLElement).getBoundingClientRect=()=>({left:index*80-list.scrollLeft,right:(index+1)*80-list.scrollLeft,top:0,bottom:42,width:80,height:42} as DOMRect);
    await act(async()=>resize());assert.equal(document.querySelector('[data-tab-key="1"] [role=tab]')!.getAttribute('aria-label'),initial[1].title,'icon-only tabs retain their accessible names');
    assert.equal(document.querySelector('.tab-scroll'),null,'shrinking tabs do not introduce arrow controls');
    await act(async()=>list.dispatchEvent(new dom.window.WheelEvent('wheel',{bubbles:true,deltaY:50})));assert.equal(list.scrollLeft,50);
    const last=document.querySelector<HTMLButtonElement>('[data-tab-key="4"] [role=tab]')!;
    await act(async()=>last.click());assert.equal(selected,'4');assert.equal(list.scrollLeft,200,'selection brings an overflowed tab into view');
    width=120;await act(async()=>resize());assert.equal(list.scrollLeft,280,'a narrower group retains its active tab');
    await act(async()=>render());list.scrollLeft=0;await act(async()=>resize());assert.equal(list.scrollLeft,0,'resize never fights drag edge scrolling');await act(async()=>render());assert.equal(list.scrollLeft,280);
    await act(async()=>last.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true})));assert.equal(selected,'0');assert.equal(list.scrollLeft,0);
    await act(async()=>document.querySelector<HTMLButtonElement>('[data-tab-key="0"] [role=tab]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true})));assert.equal(menu,'0');assert.equal(selected,'0');await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Search tabs"]')!.click());
    assert.equal(document.querySelectorAll('.main-tab-picker [role=option]').length,5);assert.match(document.querySelector('.main-tab-picker')!.textContent!,/Robot arm planning and prototyping/);
    const input=document.querySelector<HTMLInputElement>('.main-tab-picker input')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Robot');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});assert.equal(document.querySelectorAll('.main-tab-picker [role=option]').length,1);
    await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.equal(selected,'1');assert.equal(document.querySelector('.main-tab-picker'),null);
    await act(async()=>document.querySelector('[data-tab-key="2"]')!.dispatchEvent(new dom.window.MouseEvent('auxclick',{button:1,bubbles:true,cancelable:true})));assert.equal(closed,'2');
    width=500;list.scrollLeft=0;await act(async()=>resize());assert.equal(document.querySelector('.tab-scroll'),null,'arrow controls stay absent when all tabs fit');
  }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('committed closes and moves collapse nested empty splits while retaining a final pane and tab history',()=>{
  const first=pane('card:first'),second=pane('card:second'),third=pane('card:third');
  const tree=splitPane(splitPane(first,first.id,'row',second),second.id,'column',third);
  const closed=closeTabs(tree,second.id,second.tabs);assert.deepEqual(panes(closed).map(p=>p.id),[first.id,third.id]);assert.equal(closed.type==='split'&&closed.second.id,third.id);
  const remaining=closeTabs(closed,first.id,first.tabs);assert.equal(remaining.id,third.id);assert.equal(remaining.type,'pane');assert.equal(tabDocument(panes(remaining)[0]),'card:third');
  const last=closeTabs(remaining,third.id,third.tabs);assert.deepEqual(panes(last).map(p=>[p.id,p.tabs,p.active]),[[third.id,[],'']]);
  const visited=navigateTab(tree,first.id,'card:visited','same').tree,moved=moveTab(visited,first.id,third.id,first.active);
  assert.deepEqual(panes(moved).map(p=>p.id),[second.id,third.id]);assert.equal(tabDocument(panes(moved)[1]),'card:visited');assert.deepEqual(panes(moved)[1].history?.[first.active].entries,['card:first','card:visited']);
  const own=moveTab(first,first.id,first.id,first.active);assert.deepEqual(own,first,'a sole tab dropped back retains its source pane');
  const blank=pane(),otherBlank=pane(),emptyTree=splitPane(blank,blank.id,'column',otherBlank);assert.equal(removeEmptyPanes(emptyTree).id,blank.id);assert.equal(removeEmptyPanes(tree),tree,'occupied saved layouts keep their identities');
  const journal={...first,journalTab:first.active},journalMove=moveTab(splitPane(journal,first.id,'row',second),first.id,second.id,first.active);assert.equal(journalMove.type,'pane');assert.equal(panes(journalMove)[0].journalTab,first.active);
});

test('bulk tab closing stays in its group, saves drafts first and preserves the surviving editor and files',async()=>{
  const dom=setup(),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const first:Pane={type:'pane',id:'one',tabs:['board:','card:a','card:b','card:c'],active:'card:a',history:{'card:a':{entries:['board:','card:a'],index:1},'card:c':{entries:['card:c'],index:0}}},other=pane('board:Other');
  const tree=splitPane(first,first.id,'row',other),empty=pane(),persisted=splitPane(tree,other.id,'column',empty),cards:Card[]=['a','b','c'].map(id=>({id,path:id+'.md',name:id,body:'# '+id+'\n\nOriginal',revision:'r1',legacy:false}));
  const historyOnly=closeTabs(navigateTab(tree,first.id,'card:a','same').tree,first.id,['card:c']);assert.equal(panes(historyOnly)[0].history?.['card:c'],undefined);assert.equal(panes(historyOnly)[1].active,'board:Other');
  assert.equal(panes(closeTabs(tree,first.id,['card:a','card:b']))[0].active,'card:c','closing the active tab selects the closest surviving tab to its right');
  let snapshot:Snapshot={root:'/test/tabs',name:'Tabs',cards,boards:['','Other'].map(folder=>({path:(folder||'Tabs')+'.whiteboard',folder,name:folder||'Tabs',revision:'b1',cards:[],edges:[]})),folders:['','Other'],tags:[],preferences:{theme:'light',stem:'untitled',starred:[],recent:[],icons:{},documents:{tree:persisted,active:empty.id,views:{},formatting:[]}},issues:[],historyAvailable:false},rejectSave=false;
  const request=async(request:Request)=>{
    switch(request.kind){
      case 'card':return {...cards.find(card=>card.path===request.path)!};
      case 'preferences':snapshot={...snapshot,preferences:{...snapshot.preferences!,...request.patch}};return snapshot;
      case 'snapshot':return snapshot;
      case 'query':case 'listFiles':case 'history':return [];
      case 'saveCard':{if(rejectSave)throw new Error('External edit conflict');const card=cards.find(card=>card.path===request.path)!,before=card.body;card.body=request.body;card.revision='saved';snapshot={...snapshot,cards:cards.map(card=>({...card}))};return {snapshot,edits:[{path:card.path,before,after:card.body}]};}
      default:throw new Error('Unexpected '+request.kind);
    }
  };
  window.door={platform:'linux',assetUrl:(path:string)=>path,currentWorkspace:async()=>snapshot,onChange:()=>()=>{},onClosing:()=>()=>{},finishClosing:()=>{},cancelClosing:()=>{},request} as unknown as Bridge;
  const {App,session}=await import('../src/renderer/App');
  const settle=()=>act(async()=>{await session.run(async()=>{});await new Promise(resolve=>setTimeout(resolve,30));});
  const tab=(key:string)=>document.querySelector<HTMLElement>(`.note-pane[data-pane=one] [data-tab-key="${key}"]`)!;
  const openMenu=async(key:string)=>{await act(async()=>tab(key).dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,clientX:120,clientY:40})));};
  const action=async(label:string)=>{await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(button=>button.textContent===label)!.click());await settle();};
  const keys=()=>[...document.querySelectorAll<HTMLElement>('.note-pane[data-pane=one] [data-tab-key]')].map(tab=>tab.dataset.tabKey);
  try{
    await act(async()=>{session.update({snapshot});root.render(<App/>);});await settle();assert.equal(document.querySelectorAll('.note-pane').length,2,'restoring an older layout removes empty splits');assert.equal(document.querySelector(`[data-pane="${empty.id}"]`),null);
    await act(async()=>session.select('a.md'));await settle();const editor=document.querySelector('.note-pane[data-pane=one] .tiptap');assert.ok(editor);
    await act(async()=>session.edit('# a\n\nUnsaved draft'));rejectSave=true;
    await openMenu('card:b');await action('Close other tabs');assert.deepEqual(keys(),first.tabs);assert.equal(session.state.draft?.dirty,true,'failed saves keep every tab and the draft');
    rejectSave=false;await openMenu('card:b');await action('Close tabs to the right');assert.deepEqual(keys(),['board:','card:a','card:b']);assert.match(cards[0].body,/Unsaved draft/);assert.equal(document.querySelector('.note-pane[data-pane=one] .tiptap'),editor,'closing an inactive tab keeps the current editor mounted');
    await openMenu('card:b');assert.equal(document.querySelector<HTMLButtonElement>('[role=menuitem]:disabled')?.textContent,'Close tabs to the right');await action('Close other tabs');assert.deepEqual(keys(),['card:b']);assert.equal(tab('card:b').querySelector('[role=tab]')!.getAttribute('aria-selected'),'true');
    await act(async()=>session.flushPreferences());assert.deepEqual(panes(snapshot.preferences!.documents!.tree)[0].tabs,['card:b']);assert.deepEqual(panes(snapshot.preferences!.documents!.tree)[0].history,{});assert.equal(panes(snapshot.preferences!.documents!.tree)[1].active,'board:Other');
    await openMenu('card:b');assert.deepEqual([...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]:disabled')].map(button=>button.textContent),['Close other tabs','Close tabs to the right']);await action('Close all tabs');assert.equal(document.querySelector('.note-pane[data-pane=one]'),null,'closing its last tab removes the split');assert.equal(snapshot.cards.length,3,'tab closing never deletes files');assert.ok(document.querySelector(`[data-pane="${other.id}"] [data-tab-key="board:Other"]`));await act(async()=>session.flushPreferences());assert.equal(snapshot.preferences!.documents!.active,other.id);assert.equal(validateDocuments(snapshot.preferences!.documents).tree.type,'pane');
    await act(async()=>document.querySelector<HTMLButtonElement>(`[data-pane="${other.id}"] [data-tab-key] > button:last-child`)!.click());await settle();assert.equal(document.querySelectorAll('.note-pane').length,1);assert.ok(document.querySelector(`[data-pane="${other.id}"] .empty-pane>button`),'the final pane can reopen the root board');await act(async()=>session.flushPreferences());assert.equal(validateDocuments(snapshot.preferences!.documents).active,other.id);
  }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});


test('inactive board tabs accept documents without activating the tab or becoming file-reference targets',async()=>{
  const dom=setup(),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);let selected=0;
  const drops:DocumentDrop[]=[];window.addEventListener('door:document-drop',event=>drops.push((event as CustomEvent<DocumentDrop>).detail));Object.assign(globalThis,{CustomEvent:dom.window.CustomEvent});
  try{
    await act(async()=>root.render(<MainTabs group="main" active="note-tab" items={[
      {key:'note-tab',title:'Note',icon:<span/>},
      {key:'visited-tab',title:'Destination',boardFolder:'Boards/Destination',icon:<span/>},
      {key:'home-tab',title:'Home',boardFolder:'',icon:<span/>},
    ]} dragging={false} onSelect={()=>selected++} onClose={()=>{}} onMenu={()=>{}} onDrag={()=>{}}><span/></MainTabs>));
    const board=document.querySelector<HTMLElement>('[data-tab-key="visited-tab"]')!,home=document.querySelector<HTMLElement>('[data-tab-key="home-tab"]')!,note=document.querySelector<HTMLElement>('[data-tab-key="note-tab"]')!;
    let hit=board.querySelector<HTMLElement>('[role=tab]')!;document.elementsFromPoint=()=>[hit];
    assert.equal(documentDropTarget({key:'card:c',path:'Slipbox/C.md'},100,20),board);
    assert.equal(dropDocumentAt({key:'card:c',path:'Slipbox/C.md'},100,20),true);assert.equal(drops[0].folder,'Boards/Destination');assert.equal(drops[0].atPointer,false);assert.equal(selected,0);assert.equal(board.querySelector('[role=tab]')!.getAttribute('aria-selected'),'false');
    assert.equal(documentDropTarget({key:'board:Boards/Destination'},100,20),null);assert.equal(documentDropTarget({key:'board:Boards'},100,20),null);
    hit=home;assert.equal(documentDropTarget({key:'card:c'},100,20),null);assert.equal(documentDropTarget({key:'board:Other'},100,20),home);
    hit=note;assert.equal(documentDropTarget({key:'card:c'},100,20),null);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
