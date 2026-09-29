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

test('preview and editor share compact list spacing and checkbox structure',async()=>{
  const dom=new JSDOM('<!doctype html><html><body><div class="prose" id="preview"></div><div class="prose" id="edit"></div></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  const {readFile}=await import('node:fs/promises'),{extensions}=await import('../src/renderer/editor-schema'),{preview}=await import('../src/renderer/markdown');
  const style=document.createElement('style');style.textContent=await readFile(new URL('../src/renderer/styles.css',import.meta.url),'utf8');document.head.append(style);
  const body='# Lists\n\n- First\n- Second\n  - Nested\n\n1. One\n2. Two\n\n- [x] Done\n  - [ ] Nested task\n- [ ] Pending\n';
  document.getElementById('preview')!.innerHTML=preview(body,'list.md');
  const editor=new Editor({element:document.getElementById('edit')!,extensions:extensions('list.md'),content:body,contentType:'markdown'});
  try{
    for(const p of document.querySelectorAll('#edit li>p'))assert.equal(getComputedStyle(p).marginBottom,'0px','editor-only paragraph wrappers cannot expand list items');
    for(const id of ['preview','edit']){
      const tasks=[...document.querySelectorAll(`#${id} li[data-checked]`)];
      assert.deepEqual(tasks.map(t=>t.getAttribute('data-checked')),['true','false','false']);
      assert.deepEqual(tasks.map(t=>t.querySelector(':scope>div>p')?.textContent),['Done','Nested task','Pending']);
      assert.ok(tasks.every(t=>t.querySelector(':scope>label>input[type=checkbox]')),'task text and checkbox use the same layout in both modes');
    }
  }finally{editor.destroy();}
});

test('previews preserve editor blank paragraphs and trailing body lines without changing collapsed titles',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  const {extensions}=await import('../src/renderer/editor-schema'),{withCardTitle}=await import('../src/card-title'),{preview,titlePreview}=await import('../src/renderer/markdown');
  for(const body of ['', '\n\n', '# ', '# Title only', '# Title only\n\n', '# Title only\n\n\n\n', '# Title only\r\n\r\n', '# A long title that wraps across several lines inside the card',
    '# Test\\_0929\n\n- sdfsdf\n- sdfsdf\n- sdfsdf\n\n',
    '# List\n\n- One\n- Two', '# Tasks\n\n- [ ] Task',
    '# Code\n\n```js\nconst x=1;\n```', '# Quote\n\n> Text',
    '# Table\n\n| A |\n| --- |\n| B |', '# Heading\n\n## Last section',
    '# Text\n\nParagraph', '# Text\n\nParagraph\n\n',
    '# Text\n\nFirst\n\n\n\nLast\n\n\n\n']){
    const editor=new Editor({extensions:extensions('empty.md'),content:withCardTitle(body),contentType:'markdown'});
    try{
      editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize-1);
      const shown=document.createElement('div');shown.innerHTML=preview(body,'empty.md');
      assert.deepEqual([...shown.children].map(el=>el.tagName),[...editor.view.dom.children].map(el=>el.classList.contains('tableWrapper')?'TABLE':el.tagName),'preview must reserve the same blocks as editing: '+JSON.stringify(body));
      const emptyParagraphs=(parent:Element)=>[...parent.children].filter(el=>el.tagName==='P'&&!el.textContent?.trim());
      assert.equal(emptyParagraphs(shown).length,emptyParagraphs(editor.view.dom).length,'preserve every blank body line');
      assert.ok(emptyParagraphs(shown).every(p=>p.querySelector('br')),'empty preview paragraphs occupy real text lines');
      assert.equal(shown.querySelector('h1')?.textContent,editor.view.dom.querySelector('h1')?.textContent);
      shown.innerHTML=titlePreview({id:'empty',path:'empty.md',name:'empty',revision:'r',legacy:false,title:'Title only'});
      assert.equal(shown.querySelector('p'),null,'collapsed cards still show only the title');
    }finally{editor.destroy();}
  }
});
