import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import type {Bridge} from '../src/shared';
import {NoticeBanner} from '../src/renderer/NoticeBanner';

test('notice disclosure and copying retain the original failure, recovery actions and focus',async()=>{
 const dom=new JSDOM('<button id="editor">Editor</button><div id="root"></div>',{url:'https://workspace.test',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 let copied='',failCopy=false,dismissed=false,recovered=false;
 Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async(text:string)=>{if(failCopy)throw Error('Clipboard unavailable');copied=text;}}});
 window.door={updateState:async()=>({currentVersion:'0.1.2718-test.38'})} as Bridge;
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
 const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>(b.getAttribute('aria-label')??b.textContent)===name)!;
 try{
  document.getElementById('editor')!.focus();
  await act(async()=>root.render(<NoticeBanner message="Error: Save failed" document="Research/A.md" actions={<button onClick={()=>{recovered=true;}}>Recover</button>} onDismiss={()=>{dismissed=true;}}/>));
  assert.equal(document.activeElement?.id,'editor','an error does not steal the editor focus');
  assert.equal(document.querySelector('[role=alert]')?.textContent,'Save failed');
  assert.equal(document.querySelector('.context-banner-details'),null);
  await act(async()=>button('Details').click());
  assert.match(document.querySelector('.context-banner-details')?.textContent??'',/0.1.2718-test.38/);
  await act(async()=>button('Copy report').click());
  const report=JSON.parse(copied);assert.equal(report.message,'Save failed');assert.equal(report.document,'Research/A.md');assert.equal(report.appVersion,'0.1.2718-test.38');
  failCopy=true;await act(async()=>button('Copy report').click());
  assert.equal(document.querySelector<HTMLTextAreaElement>('[aria-label="Diagnostic report"]')?.value,copied,'clipboard failure leaves a selectable report');
  assert.equal(document.querySelector('[role=alert]')?.textContent,'Save failed','clipboard failure does not replace the original failure');
  await act(async()=>button('Recover').click());assert.equal(recovered,true);
  await act(async()=>button('Dismiss notice').click());assert.equal(dismissed,true);
  window.door.updateState=()=>{throw Error('Version lookup unavailable');};
  await act(async()=>root.render(<NoticeBanner key="version-failure" message="Error: Original operation failed" onDismiss={()=>{}}/>));
  assert.equal(document.querySelector('[role=alert]')?.textContent,'Original operation failed');
  await act(async()=>button('Details').click());assert.match(document.querySelector('.context-banner-details')?.textContent??'',/Unavailable/);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
