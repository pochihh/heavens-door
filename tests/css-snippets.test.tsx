import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {cssSnippets,importCssSnippets,snippetsFolder} from '../src/core/css-snippets';
import {defaultPreferences,validatePreferences} from '../src/core/preferences';
import {useWorkspaceAppearance,CssSnippetSettings} from '../src/renderer/WorkspaceAppearance';
import type {Bridge,Preferences} from '../src/shared';

test('CSS imports stay inside the workspace, avoid overwrites and reject unsafe or oversized files',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-css-')),root=join(dir,'workspace');await fs.mkdir(root);t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 assert.deepEqual(await cssSnippets(root),[]);const source=join(dir,'custom.css');await fs.writeFile(source,':root { --card-radius: 8px; }');
 await importCssSnippets(root,[source,source]);assert.deepEqual((await cssSnippets(root)).map(item=>item.name),['custom 2.css','custom.css']);assert.equal(await fs.readFile(source,'utf8'),':root { --card-radius: 8px; }');
 const folder=await snippetsFolder(root),external=join(dir,'secret.css');await fs.writeFile(external,'secret');await fs.symlink(external,join(folder,'escape.css'));await fs.mkdir(join(folder,'directory.css'));await fs.writeFile(join(folder,'huge.css'),Buffer.alloc(256*1024+1));
 const files=await cssSnippets(root);assert.ok(files.find(item=>item.name==='escape.css')?.error);assert.ok(files.find(item=>item.name==='directory.css')?.error);assert.ok(files.find(item=>item.name==='huge.css')?.error);
 await assert.rejects(importCssSnippets(root,[join(folder,'escape.css')]));await assert.rejects(importCssSnippets(root,[join(folder,'huge.css')]));await assert.rejects(importCssSnippets(root,Array(21).fill(source)));await assert.rejects(importCssSnippets(root,[join(dir,'custom.js')]));
 await fs.rm(join(root,'.heavens-door'),{recursive:true});await fs.symlink(dir,join(root,'.heavens-door'));await assert.rejects(snippetsFolder(root,true),/symbolic link/i);
 const prefs=defaultPreferences();assert.equal(validatePreferences({...prefs,accentColor:'#ff4400',cssSnippets:['custom.css']}).accentColor,'#ff4400');for(const cssSnippets of [['../secret.css'],['custom.css','custom.css'],['.secret.css']])assert.throws(()=>validatePreferences({...prefs,cssSnippets}));assert.throws(()=>validatePreferences({...prefs,accentColor:'red; display:none'}));
});
test('enabled CSS snippets apply in order and are removed when disabled or switching workspaces',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 let changed=()=>{},reads=0;window.door={cssSnippets:async()=>{reads++;return [{name:'one.css',css:'body { --test: one; }'},{name:'two.css',css:'body { --test: two; }'},{name:'broken.css',css:'',error:'Too large'}];},onCssSnippetsChange:(listener:()=>void)=>{changed=listener;return()=>{};}} as unknown as Bridge;
 function Appearance({root,prefs}:{root:string;prefs:Preferences}){useWorkspaceAppearance(root,prefs);return null;}
 const root=createRoot(document.getElementById('root')!),prefs=defaultPreferences(),names=()=>[...document.querySelectorAll<HTMLElement>('[data-css-snippet]')].map(style=>style.dataset.cssSnippet);
 try{
  await act(async()=>root.render(<Appearance root="/one" prefs={{...prefs,accentColor:'#ff4400',cssSnippets:['two.css','broken.css','one.css']}}/>));assert.deepEqual(names(),['two.css','one.css']);assert.equal(document.documentElement.style.getPropertyValue('--accent'),'#ff4400');
  await act(async()=>changed());assert.deepEqual(names(),['two.css','one.css']);assert.equal(reads,2);
  await act(async()=>root.render(<Appearance root="/two" prefs={prefs}/>));assert.deepEqual(names(),[]);assert.equal(document.documentElement.style.getPropertyValue('--accent'),'');
  await act(async()=>root.render(<CssSnippetSettings enabled={['missing.css']} onChange={names=>assert.deepEqual(names,[])}/>));assert.match(document.body.textContent! ,/File missing/);await act(async()=>document.querySelector<HTMLInputElement>('[aria-label="Enable missing.css"]')!.click());assert.ok(document.querySelector<HTMLInputElement>('[aria-label="Enable broken.css"]')!.disabled);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
