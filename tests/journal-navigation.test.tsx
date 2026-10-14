import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {closeTab,mapPaneDocuments,moveTab,openJournalTab,openTab,pane,panes,removePane,restoreLayout,splitPane,tabDocument,tabHistory,travelTab,updatePane,MAX_PANES,MAX_TABS,type Layout} from '../src/layout';
import {DEFAULT_JOURNAL,journalPath,journalToday,validateJournal} from '../src/journal';
import {shiftDay} from '../src/dates';
import {systemGuidePath} from '../src/system-guides';
import type {Bridge,Card,Preferences,Request,Snapshot} from '../src/shared';

test('journal split keeps one reusable tab through history, closing, moves, renames and saved layouts',()=>{
  validateJournal({...DEFAULT_JOURNAL,reuseSplit:true});validateJournal({...DEFAULT_JOURNAL,reuseSplit:undefined});assert.throws(()=>validateJournal({...DEFAULT_JOURNAL,reuseSplit:'yes'}));
  const first=pane('board:'),initial=openJournalTab(first,first.id,'card:daily','column');
  assert.equal(panes(initial.tree).length,2);assert.equal(initial.tree.type==='split'&&initial.tree.axis,'column');assert.equal(tabDocument(panes(initial.tree)[0]),'board:');
  const id=initial.active,slot=panes(initial.tree)[1].journalTab!;
  let tree=openJournalTab(initial.tree,first.id,'card:weekly').tree;
  assert.equal(panes(tree)[1].id,id);assert.deepEqual(panes(tree)[1].tabs,[slot]);assert.equal(tabDocument(panes(tree)[1]),'card:weekly');assert.deepEqual(tabHistory(panes(tree)[1]).entries,['card:daily','card:weekly']);
  tree=travelTab(tree,id,-1);assert.equal(tabDocument(panes(tree)[1]),'card:daily');assert.deepEqual(restoreLayout(JSON.stringify(tree)),tree);
  tree=openTab(tree,id,'card:unrelated');tree=openJournalTab(tree,first.id,'card:next').tree;assert.equal(panes(tree)[1].active,slot);assert.deepEqual(panes(tree)[1].tabs,[slot,'card:unrelated']);
  tree=closeTab(tree,id,slot);assert.equal(panes(tree)[1].journalTab,'');tree=openJournalTab(tree,first.id,'card:reopened').tree;assert.equal(panes(tree).length,2);assert.equal(panes(tree)[1].id,id);assert.equal(panes(tree)[1].journalTab,'card:reopened');
  // A collision with an ordinary tab gives the moved journal slot a fresh identity.
  tree=openTab(tree,first.id,'card:reopened');tree=moveTab(tree,id,first.id,'card:reopened');assert.equal(panes(tree)[1].journalTab,undefined);const moved=panes(tree)[0];assert.ok(moved.journalTab?.startsWith('tab:'));
  tree=updatePane(tree,first.id,p=>mapPaneDocuments(p,key=>key==='card:reopened'?'card:renamed':key));tree=openJournalTab(tree,id,'card:latest').tree;assert.equal(panes(tree)[0].active,moved.journalTab);assert.equal(tabDocument(panes(tree)[0]),'card:latest');assert.deepEqual(tabHistory(panes(tree)[0]).entries,['card:renamed','card:latest']);assert.deepEqual(restoreLayout(JSON.stringify(tree)),tree);
  tree=removePane(tree,first.id)!;tree=openJournalTab(tree,id,'card:new-split').tree;assert.equal(panes(tree).length,2);assert.notEqual(panes(tree)[1].id,id);
  const broken=pane('board:');broken.journalTab='missing';assert.equal(panes(restoreLayout(JSON.stringify(broken)))[0].journalTab,undefined);
  let full:Layout=first;for(let i=1;i<MAX_PANES;i++)full=splitPane(full,first.id,'row',pane('card:'+i));assert.throws(()=>openJournalTab(full,first.id,'card:limit'),/Tab Group/);
  const fullSlot=pane();fullSlot.journalTab='';fullSlot.tabs=Array.from({length:MAX_TABS},(_,i)=>'card:'+i);fullSlot.active=fullSlot.tabs[0];assert.throws(()=>openJournalTab(fullSlot,fullSlot.id,'card:limit'),/tab/);
});

test('Journal setting routes Calendar and ordinary opens to one split and its breadcrumb opens the Journal page',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://workspace.test',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,innerWidth:1200,innerHeight:800,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class {observe(){} disconnect(){}},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.scrollIntoView=()=>{};dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','');};dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;dom.window.Range.prototype.getBoundingClientRect=()=>({x:0,y:0,top:0,left:0,bottom:0,right:0,width:0,height:0,toJSON(){}});
  const {defaultDocks}=await import('../src/layout'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
  const day=journalToday(),next=shiftDay(day,1),settings={...DEFAULT_JOURNAL,folder:'Writing/Diary',reuseSplit:true},origin=pane('card:work'),docks=defaultDocks();docks.right.collapsed=false;docks.left.collapsed=true;
  const preferences:Preferences={theme:'dark',stem:'untitled',starred:[],recent:[],icons:{},journal:settings,docks,documents:{tree:origin,active:origin.id,views:{},formatting:[]}};
  const cards:Card[]=[{id:'work',path:'work.md',name:'work.md',body:'# Work\n\nOriginal draft',revision:'r1',legacy:false},...[[day,'daily'],[next,'next'],[day,'weekly']].map(([date,id])=>({id,path:journalPath(settings,date,id==='weekly'?'weekly':'daily'),name:id+'.md',body:'# '+id+'\n\nJournal body',revision:'r1',legacy:false})),{id:'guide',path:systemGuidePath('journal',preferences),name:'journal.md',body:'# Journal guide',revision:'r1',legacy:false}];
  let snapshot:Snapshot={root:'/test/journal-routing',name:'Journal routing',cards,boards:[],folders:['','Writing','Writing/Diary'],tags:[],preferences,issues:[],historyAvailable:false},rejectSave=false;
  const request=async(request:Request)=>{
    switch(request.kind){
      case 'card':return {...cards.find(c=>c.path===request.path)!};
      case 'preferences':snapshot={...snapshot,preferences:{...snapshot.preferences!,...request.patch}};return snapshot;
      case 'snapshot':return snapshot;
      case 'query':case 'listFiles':case 'history':return [];
      case 'cardProperties':return {revision:'r1',properties:{}};
      case 'journalEntries':return [];
      case 'openJournal':return {snapshot,edits:[],path:cards.find(c=>c.id===(request.period==='weekly'?'weekly':request.date===day?'daily':'next'))!.path};
      case 'ensureSystemGuide':return {snapshot,edits:[],path:cards.find(c=>c.id==='guide')!.path};
      case 'saveCard':{if(rejectSave)throw new Error('External edit conflict');const c=cards.find(c=>c.path===request.path)!,before=c.body;c.body=request.body;c.revision='saved';snapshot={...snapshot,cards:cards.map(c=>({...c}))};return {snapshot,edits:[{path:c.path,before,after:c.body}]};}
      default:throw new Error('Unexpected '+request.kind);
    }
  };
  window.door={onUpdateChange:()=>()=>{},updateState:async()=>({currentVersion:'0.1.27',status:'idle',canInstall:false}),platform:'linux',assetUrl:(path:string)=>path,currentWorkspace:async()=>snapshot,onChange:()=>()=>{},onClosing:()=>()=>{},finishClosing:()=>{},cancelClosing:()=>{},request} as unknown as Bridge;
  const {App,session}=await import('../src/renderer/App');
  const settle=()=>act(async()=>{await session.run(async()=>{});await new Promise(resolve=>setTimeout(resolve,40));});
  const click=async(selector:string)=>{const el=document.querySelector<HTMLButtonElement>(selector);assert.ok(el,selector);await act(async()=>el.click());await settle();};
  const journalPane=()=>[...document.querySelectorAll<HTMLElement>('.note-pane')].find(el=>el.dataset.pane!==origin.id)!;
  const save=async()=>{await act(async()=>session.flushPreferences());return snapshot.preferences!.documents!;};
  try{
    await act(async()=>{session.update({snapshot});root.render(<App/>);});await settle();await act(async()=>session.select('work.md'));await settle();await act(async()=>session.edit('# Work\n\nUnsaved work\n\n[Next journal](card:next)'));
    await click(`.side-dock [data-day="${day}"]`);assert.equal(document.querySelectorAll('.note-pane').length,2);assert.match(cards[0].body,/Unsaved work/);let saved=await save(),slot=panes(saved.tree).find(p=>p.journalTab)!;let id=slot.id;const tab=slot.journalTab!;assert.equal(tabDocument(slot),'card:daily');assert.equal(panes(saved.tree).find(p=>p.id===origin.id)!.tabs[0],'card:work');
    await act(async()=>session.edit('# daily\n\nUnsaved journal'));rejectSave=true;await click('.side-dock .journal-week-link');assert.equal(tabDocument(panes((await save()).tree).find(p=>p.id===id)!),'card:daily');assert.equal(session.state.draft?.dirty,true);
    rejectSave=false;await click('.side-dock .journal-week-link');saved=await save();slot=panes(saved.tree).find(p=>p.id===id)!;assert.deepEqual(slot.tabs,[tab]);assert.equal(tabDocument(slot),'card:weekly');assert.match(cards.find(c=>c.id==='daily')!.body,/Unsaved journal/);
    const crumb=[...journalPane().querySelectorAll<HTMLButtonElement>('.breadcrumb-part button')].find(button=>button.textContent==='Diary')!;assert.ok(crumb,'the configured nested Journal folder is clickable');await act(async()=>crumb.click());await settle();assert.ok(journalPane().querySelector('.system-library[aria-label="Journal and Calendar"]'));assert.equal(tabDocument(panes((await save()).tree).find(p=>p.id===id)!),'system:journal');
    await click('.system-record[data-file-key="card:daily"] button.tool');await click('[role="menuitem"]:nth-child(2)');slot=panes((await save()).tree).find(p=>p.id===id)!;assert.equal(slot.tabs.length,2,'an explicit New tab command overrides journal reuse');await click(`.note-pane[data-pane="${id}"] [data-tab-key="${slot.active}"] > button:last-child`);
    await click(`.system-calendar [data-day="${day}"]`);slot=panes((await save()).tree).find(p=>p.id===id)!;assert.equal(tabDocument(slot),'card:daily');assert.deepEqual(slot.tabs,[tab]);
    await click('.note-pane[data-pane="'+origin.id+'"] a[href="card:next"]');slot=panes((await save()).tree).find(p=>p.id===id)!;assert.equal(tabDocument(slot),'card:next');assert.deepEqual(slot.tabs,[tab],'ordinary in-note links reuse the journal split too');
    // Closing the last tab removes its split; a later journal open creates a fresh one.
    await click(`.note-pane[data-pane="${id}"] [data-tab-key] > button:last-child`);assert.equal(document.querySelectorAll('.note-pane').length,1);assert.equal((await save()).active,origin.id);await click(`.side-dock [data-day="${day}"]`);assert.equal(document.querySelectorAll('.note-pane').length,2);const reopened=panes((await save()).tree).find(p=>p.journalTab)!;assert.notEqual(reopened.id,id);id=reopened.id;
    // Workspace reopening restores the designated tab from the saved layout.
    await act(async()=>root.render(<></>));await act(async()=>root.render(<App/>));await settle();await click('.side-dock .journal-week-link');assert.equal(document.querySelectorAll('.note-pane').length,2);assert.equal(panes((await save()).tree).find(p=>p.journalTab)!.id,id);
    cards.find(c=>c.id==='daily')!.path='Archive/moved-daily.md';snapshot={...snapshot,cards:cards.map(c=>({...c}))};await act(async()=>session.update({snapshot}));await click(`.side-dock [data-day="${day}"]`);assert.equal(tabDocument(panes((await save()).tree).find(p=>p.id===id)!),'card:daily','Calendar knows the journal identity even after its file moves outside the folder');
    cards.find(c=>c.id==='daily')!.path=journalPath(settings,day,'daily');snapshot={...snapshot,cards:cards.map(c=>({...c}))};await act(async()=>session.update({snapshot}));
    await click('[aria-label="Settings"]');await click('#settings-journal');const toggle=document.querySelector<HTMLInputElement>('[aria-label="Reuse a journal split"]')!;assert.equal(toggle.checked,true);await act(async()=>toggle.click());await settle();assert.equal(snapshot.preferences?.journal?.reuseSplit,false);
    await click('.settings [aria-label="Close dialog"]');await click('.side-dock .journal-week-link');saved=await save();assert.equal(panes(saved.tree).find(p=>p.id===id)!.tabs.length,2,'turning reuse off restores ordinary new-tab behavior');
    snapshot={...snapshot,preferences:{...snapshot.preferences!,features:{journal:false}}};await act(async()=>session.update({snapshot}));assert.equal([...journalPane().querySelectorAll('.breadcrumb-part button')].some(button=>button.textContent==='Diary'),false,'disabled Journal leaves its folder as a normal breadcrumb');
  }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});
