import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Editor} from '@tiptap/core';
test('sp-bar counts only actual tasks in its card section and live checkboxes update it without changing Markdown syntax',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});window.door={platform:'darwin',assetUrl:p=>p} as typeof window.door;
 const {CardEditor}=await import('../src/renderer/Editor'),{preview}=await import('../src/renderer/markdown');const root=createRoot(document.getElementById('root')!),body='# Tasks\n\n```sp-bar\nAll tasks\n```\n\n## One\n\n```sp-bar\nSection\n```\n\n- [x] Done\n- [ ] Next\n\n```md\n- [x] Example only\n```\n\n## Two\n\n- [ ] Later',edits:string[]=[];
 try{const other=document.createElement('div');other.innerHTML=preview('# Other\n\n- [x] Outside','Other.md');document.body.append(other);await act(async()=>root.render(<CardEditor path="Tasks.md" body={body} cards={[]} onEdit={body=>edits.push(body)}/>));const counts=()=>[...document.querySelectorAll('#root [data-progress-count]')].map(el=>el.textContent);assert.deepEqual(counts(),['1/3 (33%)','1/2 (50%)']);
 const rendered=document.createElement('div');rendered.innerHTML=preview(body,'Tasks.md');assert.deepEqual([...rendered.querySelectorAll('[data-progress-count]')].map(el=>el.textContent),counts());assert.equal(rendered.querySelectorAll('pre').length,1);
 const editor=(document.querySelector('.tiptap') as HTMLElement&{editor:Editor}).editor;let task=0;editor.state.doc.descendants((node,pos)=>{if(node.type.name==='taskItem'&&!node.attrs.checked&&!task)task=pos;});await act(async()=>editor.view.dispatch(editor.state.tr.setNodeMarkup(task,undefined,{checked:true})));assert.deepEqual(counts(),['2/3 (67%)','2/2 (100%)']);assert.match(edits.at(-1)!,/```sp-bar/);assert.doesNotMatch(edits.at(-1)!,/progressbar|card-progress/);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
