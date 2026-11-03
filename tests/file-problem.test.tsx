import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {FileProblem} from '../src/renderer/FileProblem';
import {ConfirmationProvider} from '../src/renderer/Confirmation';
import type {Session} from '../src/renderer/session';
import type {Bridge,Snapshot} from '../src/shared';

test('unreadable file offers scoped recovery and confirms trash using its observed stamp',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://workspace.test'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  window.door={request:async()=>({kind:'text',size:12,text:'--- broken source'})} as unknown as Bridge;
  const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);
  let histories=0,refreshes=0;const removed:unknown[]=[];
  const session={bridge:{request:async(request:unknown)=>{assert.deepEqual(request,{kind:'fileStamp',path:'Broken.md'});return 'observed-stamp';}},refresh:async()=>{refreshes++;},fileOperation:async(operation:unknown)=>{removed.push(operation);}} as unknown as Session;
  const click=async(label:string,scope:ParentNode=document)=>{const button=[...scope.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label);await act(async()=>{button.click();});};
  try{
    await act(async()=>{root.render(<ConfirmationProvider><FileProblem path="Broken.md" message="Invalid YAML" snapshot={{} as Snapshot} session={session} onHistory={()=>histories++}/></ConfirmationProvider>);});
    assert.match(document.querySelector('[role=alert]')!.textContent!,/Broken.md.*Invalid YAML/);
    await click('View source');assert.equal(document.querySelector('.file-preview pre')?.textContent,'--- broken source');assert.equal(document.querySelector('.file-preview textarea'),null);
    await click('History');assert.equal(histories,1);await click('Reload');assert.equal(refreshes,1);
    await click('Move to Trash');await click('Cancel',document.querySelector('dialog')!);assert.equal(removed.length,0);
    await click('Move to Trash');await click('Move to Trash',document.querySelector('dialog')!);assert.deepEqual(removed,[{action:'trash',path:'Broken.md',expected:'observed-stamp'}]);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
