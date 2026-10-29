import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderToStaticMarkup} from 'react-dom/server';
import {boardShowsCards,setBoardCards} from '../src/features';
import {defaultPreferences,validatePreferences} from '../src/core/preferences';
import {remapPreferences} from '../src/path-remap';
import type {Snapshot} from '../src/shared';
import {folderNavigation,registerFolderNavigation} from '../src/renderer/folder-navigation';

test('Show cards inherits from parents, overrides descendants together and follows folder renames',()=>{
  for(const folder of ['constructor','__proto__','toString']){assert.equal(boardShowsCards(folder,{order:{},showCards:{}}),false);assert.equal(boardShowsCards(folder,setBoardCards(undefined,folder,true)),true);}
  assert.equal(boardShowsCards('Projects\\A',{order:{},showCards:{'':true,Projects:false}}),false);assert.deepEqual(setBoardCards(undefined,'Projects\\A',true).showCards,{'Projects/A':true});
  let navigation=setBoardCards(undefined,'',true);assert.equal(boardShowsCards('Projects/A',navigation),true);
  navigation=setBoardCards(navigation,'Projects',false);assert.equal(boardShowsCards('Projects/A',navigation),false);assert.equal(boardShowsCards('Research',navigation),true);
  navigation=setBoardCards(navigation,'Projects/A',true);navigation=setBoardCards(navigation,'Projects',true);
  assert.deepEqual(navigation.showCards,{'':true,Projects:true});
  const prefs={...defaultPreferences(),boardNavigation:navigation};assert.deepEqual(validatePreferences(prefs).boardNavigation,navigation);
  assert.equal(remapPreferences(prefs,'Projects','Work').boardNavigation?.showCards?.Work,true);
  for(const invalid of [[],{'../outside':true},{Projects:'yes'},null])assert.throws(()=>validatePreferences({...prefs,boardNavigation:{order:{},showCards:invalid}}),/navigation/);
});
test('all enabled system folders route through a registry, with a removable registration for future views',()=>{
  const prefs=defaultPreferences();
  for(const [folder,key] of [['Slipbox','slipbox'],['Journal','journal'],['Templates','templates'],['Inbox','reading'],['tags','tags'],['.heavens-door/trash','trash']])assert.equal(folderNavigation(folder,prefs),'system:'+key);
  assert.equal(folderNavigation('Templates',{...prefs,features:{templates:false}}),undefined);
  const remove=registerFolderNavigation({key:'custom:research',folder:()=> 'Research/Library'});
  assert.equal(folderNavigation('Research/Library',prefs),'custom:research');assert.throws(()=>registerFolderNavigation({key:'custom:research',folder:()=> 'Other'}));
  remove();assert.equal(folderNavigation('Research/Library',prefs),undefined);
});
test('breadcrumbs show ancestor icons and route Slipbox and Templates to their special pages',async()=>{
  const dom=new JSDOM('<!doctype html><html></html>');Object.assign(globalThis,{window:dom.window,document:dom.window.document});
  const {Breadcrumbs}=await import('../src/renderer/Breadcrumbs');
  const snapshot:Snapshot={root:'/workspace',name:'First Door',cards:[{id:'a',path:'Projects/Heaven/Note.md',name:'Note',revision:'r',legacy:false}],boards:['','Projects','Projects/Heaven'].map(folder=>({path:folder+'/board.whiteboard',folder,name:folder,revision:'r',cards:[],edges:[]})),tags:[],issues:[],historyAvailable:false,preferences:{...defaultPreferences(),icons:{'board:Projects':'🚀'}}};
  try{
    const render=()=>renderToStaticMarkup(<Breadcrumbs documentKey="card:a" snapshot={snapshot} onNavigate={()=>{}} onRename={async()=>{}} onIcon={()=>{}}/>);
    assert.match(render(),/🚀/);
    for(const folder of ['Slipbox','Templates','Journal']){snapshot.cards[0].path=folder+'/Note.md';const next={...snapshot};const markup=renderToStaticMarkup(<Breadcrumbs documentKey="card:a" snapshot={next} onNavigate={()=>{}} onRename={async()=>{}} onIcon={()=>{}}/>);assert.match(markup,new RegExp('<span>'+folder+'</span></button>'));}
  }finally{dom.window.close();}
});
