import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const windows:JSDOM[]=[];
// DOMPurify retains its renderer window until the module is disposed.
after(()=>windows.forEach(dom=>dom.window.close()));
import { Editor } from '@tiptap/core';

test('formatted editing retains headings, tasks, tables, local images and card links',async () => {
  const dom=new JSDOM('<!doctype html><html><body></body></html>'); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path => `heavens-asset://vault/${path}`} as typeof window.door;
  const {extensions}=await import('../src/renderer/editor-schema');
  const {preview,unsupported}=await import('../src/renderer/markdown');
  const body='# Heading\n\nA **bold** and *italic* thought.\n\n- [x] Completed\n- [ ] Pending\n\n| A | B |\n| --- | --- |\n| One | Two |\n\n![Diagram](assets/diagram.png)\n\n[Other card](card:stable-id)\n\n```js\nconst x = 1;\n```';
  const editor=new Editor({extensions:extensions('note.md'),content:body,contentType:'markdown'});
  const markdown=editor.getMarkdown();
  for (const content of ['# Heading','**bold**','*italic*','[x] Completed','[ ] Pending','One','Two','assets/diagram.png','card:stable-id','const x = 1;']) assert.ok(markdown.includes(content),`Preserve ${content}: ${markdown}`);
  editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'Added through the editor'}]});
  assert.ok(editor.getMarkdown().includes('Added through the editor'));
  assert.ok(editor.getMarkdown().includes('[x] Completed'));
  const html=preview('[Card](card:stable-id)\n\n<img src="x" onerror="alert(1)">\n\n[Bad](javascript:alert(1))','note.md');
  assert.match(html,/href="card:stable-id"/); assert.doesNotMatch(html,/onerror|javascript:/);
  assert.equal(unsupported('<div>Custom block</div>'),true);
  assert.equal(unsupported('[[Obsidian link]]'),true);
  editor.destroy();
});

test('reserved H1 starts empty, persists only typed text, and preserves heading-less external bodies',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>'); windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema');
  const {withCardTitle,leadingTitle}=await import('../src/card-title');
  const {preview}=await import('../src/renderer/markdown');
  let edits=0;
  const editor=new Editor({extensions:extensions('empty.md'),content:withCardTitle(''),contentType:'markdown',onUpdate:()=>{edits++;}});
  try{
    assert.equal(editor.state.doc.firstChild?.type.name,'heading');assert.equal(editor.state.doc.firstChild?.attrs.level,1);
    assert.equal(cardMarkdown(editor),'');assert.equal(edits,0,'merely opening creates no saved edit');
    assert.ok(editor.view.dom.querySelector('h1.card-title.is-empty'));assert.equal(editor.view.dom.textContent,'','placeholder is never editable text');
    editor.commands.setTextSelection(1);editor.commands.insertContent('A real title');
    assert.equal(cardMarkdown(editor).trimEnd(),'# A real title');assert.equal(editor.view.dom.querySelector('.is-empty'),null);
    editor.commands.toggleHeading({level:2});assert.equal(editor.state.doc.firstChild?.attrs.level,1,'the reserved title remains H1');
    editor.commands.clearContent();assert.equal(cardMarkdown(editor),'');assert.ok(editor.view.dom.querySelector('h1.is-empty'));
    const original='An existing paragraph.\n\n# Later section\n\nOriginal text.';
    editor.commands.setContent(withCardTitle(original),{contentType:'markdown',emitUpdate:false});
    assert.equal(cardMarkdown(editor),original);assert.equal(leadingTitle(original),undefined,'a later H1 is not promoted into the title');
    editor.commands.setTextSelection(1);editor.commands.insertContent('New title');
    assert.equal(cardMarkdown(editor),'# New title\n\n'+original);
    const html=preview('', 'empty.md');assert.match(html,/h1 class="card-title is-empty"/);assert.doesNotMatch(html,/A new card/);
  }finally{editor.destroy();}
});
