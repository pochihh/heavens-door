import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';

test('formatted editing retains headings, tasks, tables, local images and card links',async () => {
  const dom=new JSDOM('<!doctype html><html><body></body></html>');
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
  editor.destroy(); dom.window.close();
});
