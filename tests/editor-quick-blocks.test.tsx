import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Editor} from '@tiptap/core';
import {act} from 'react';
import {NodeSelection} from '@tiptap/pm/state';
const windows:JSDOM[]=[];after(()=>windows.forEach(w=>w.window.close()));
function setup(){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 Object.assign(dom.window.HTMLElement.prototype,{showPopover(this:HTMLElement){this.dataset.open='true';},hidePopover(this:HTMLElement){delete this.dataset.open;}});dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect();Object.assign(globalThis,{innerWidth:1400,innerHeight:900});window.door={platform:'darwin',assetUrl:p=>p} as typeof window.door;return dom;
}
function type(editor:Editor,text:string){for(const ch of text){const {from,to}=editor.state.selection;let handled=false;editor.view.someProp('handleTextInput',fn=>{handled=fn(editor.view,from,to,ch,()=>editor.state.tr.insertText(ch))===true;return handled;});if(!handled)editor.view.dispatch(editor.state.tr.insertText(ch));}}
const empty={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'Quick blocks'}]},{type:'paragraph'}]};
test('fence shortcuts accept language aliases and focus code; equation shortcut selects a portable empty block',async()=>{
 setup();const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema');const editor=new Editor({extensions:extensions('Quick.md'),content:empty});
 try{
  for(const fence of ['```','```c++','```c#','```objective-c','~~~typescript']){editor.commands.setContent(empty);editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,fence+' ');assert.equal(editor.state.selection.$from.parent.type.name,'codeBlock');assert.equal(editor.state.doc.lastChild!.attrs.language,fence.slice(3)||null);type(editor,'int answer = 42;');assert.match(cardMarkdown(editor),/int answer = 42;/);assert.doesNotMatch(cardMarkdown(editor),/hljs-/);if(fence==='```c++')assert.ok(editor.view.dom.querySelector('.hljs-type'));}
  editor.commands.setContent(empty);editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,'$$ ');assert.ok(editor.state.selection instanceof NodeSelection);assert.equal(editor.state.selection.node.type.name,'mathBlock');assert.equal(editor.state.doc.lastChild!.type.name,'paragraph');const source=cardMarkdown(editor);assert.match(source,/\$\$\n\n\$\$/);editor.commands.setContent(source,{contentType:'markdown'});assert.equal(editor.state.doc.child(1).type.name,'mathBlock');
  editor.commands.setContent(empty);editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,'cost $$ ');assert.equal(editor.state.doc.lastChild!.type.name,'paragraph');assert.equal(editor.state.doc.lastChild!.textContent,'cost $$ ');
 }finally{editor.destroy();}
});
test('code language picker updates the fence and syntax colors without altering the program, including unknown languages',async()=>{
 const dom=setup(),{createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),{preview}=await import('../src/renderer/markdown'),root=createRoot(document.getElementById('root')!),edits:string[]=[];
 try{await act(async()=>root.render(<CardEditor path="Code.md" body={'# Code\n\n```c++\nint answer = 42;\n```'} cards={[]} onEdit={body=>edits.push(body)}/>));const select=document.querySelector<HTMLSelectElement>('[aria-label="Code language"]')!;assert.ok(select);assert.equal(select.value,'cpp');assert.ok(document.querySelector('.hljs-type'));assert.deepEqual(edits,[]);
  const original=document.querySelector('pre code')!.textContent;await act(async()=>{select.value='python';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(document.querySelector('pre code')!.textContent,original);assert.match(edits.at(-1)!,/```python\nint answer = 42;/);
  const el=document.querySelector('.tiptap') as HTMLElement&{editor:Editor};await act(async()=>el.editor.commands.setContent('# Code\n\n```my-language\nUnchanged <script>alert(1)</script>\n```',{contentType:'markdown'}));assert.equal(document.querySelector<HTMLSelectElement>('[aria-label="Code language"]')!.value,'my-language');const shown=document.createElement('div');shown.innerHTML=preview('# Code\n\n```c++\nint answer = 42; // <script>x</script>\n```','Code.md');assert.ok(shown.querySelector('.hljs-type'));assert.equal(shown.querySelector('script'),null);assert.match(shown.textContent!,/<script>x<\/script>/);
 }finally{await act(async()=>root.unmount());}
});
test('a fresh equation opens its focused editor immediately and saves normal LaTeX',async()=>{
 const dom=setup(),{createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),root=createRoot(document.getElementById('root')!),edits:string[]=[];
 try{await act(async()=>root.render(<CardEditor path="Math.md" body="# Math\n\nType here" cards={[]} onEdit={body=>edits.push(body)}/>));const el=document.querySelector('.tiptap') as HTMLElement&{editor:Editor},editor=el.editor;await act(async()=>{editor.commands.setContent(empty);editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,'$$ ');});const input=document.querySelector<HTMLTextAreaElement>('[aria-label="LaTeX equation"]')!;assert.ok(input,'Space opens the equation editor without another click');assert.equal(document.activeElement,input);
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'x^2 + y^2');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>document.querySelector('.math-popover form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('.math-popover'),null);assert.equal(editor.state.doc.child(1).attrs.latex,'x^2 + y^2');assert.match(edits.at(-1)!,/\$\$\nx\^2 \+ y\^2\n\$\$/);assert.ok(document.querySelector('.katex'));assert.equal(editor.state.selection.$from.parent.type.name,'paragraph');await act(async()=>type(editor,'After the equation'));assert.equal(editor.state.doc.child(1).attrs.latex,'x^2 + y^2');assert.equal(editor.state.doc.lastChild!.textContent,'After the equation');
 }finally{await act(async()=>root.unmount());}
});
