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
  assert.equal(unsupported('<div>Custom block</div>'),false);
  assert.equal(unsupported('[[Obsidian link]]'),false);
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
    assert.equal(editor.state.doc.childCount,2,'new empty cards retain the initial title and body line');
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

test('previews preserve actual blank paragraphs without inventing trailing body lines',async()=>{
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

test('deleting the final blank line survives focus, saving and reopening',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema'),{withCardTitle}=await import('../src/card-title'),{preview}=await import('../src/renderer/markdown');
  const {readCard,editCard}=await import('../src/core/format');
  const {GapCursor}=await import('@tiptap/pm/gapcursor');
  const press=(editor:Editor,key:string)=>editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  for(const body of ['# Test\\_0929\n\n- sdfsdf\n- sdfsdf\n- sdfsdf','# Title only']){
    const raw='---\ncard-id: regression\n---\n'+body+'\n\n';
    const editor=new Editor({extensions:extensions('card.md'),content:withCardTitle(readCard('card.md',raw).body),contentType:'markdown'});
    try{
      assert.equal(editor.state.doc.lastChild?.type.name,'paragraph');
      editor.commands.setTextSelection(editor.state.doc.content.size-1);
      press(editor,'Backspace');
      assert.notEqual(editor.state.doc.lastChild?.type.name,'paragraph','Backspace must remove the line rather than recreate it');
      editor.commands.setTextSelection(1);
      assert.equal(cardMarkdown(editor),body,'moving the caret must not add content');
      const saved=editCard(raw,readCard('card.md',raw),cardMarkdown(editor));
      const reopened=new Editor({extensions:extensions('card.md'),content:withCardTitle(readCard('card.md',saved).body),contentType:'markdown'});
      try{
        reopened.commands.setTextSelection(reopened.state.doc.content.size-1);
        assert.equal(cardMarkdown(reopened),body,'reopening must keep the deletion');
        const shown=document.createElement('div');shown.innerHTML=preview(readCard('card.md',saved).body,'card.md');
        assert.notEqual(shown.lastElementChild?.tagName,'P','preview cannot invent the deleted paragraph');
        press(reopened,'Enter');
        if(body.includes('- sdfsdf'))press(reopened,'Enter');
        reopened.commands.insertContent('Continued');
        assert.equal(reopened.state.doc.lastChild?.type.name,'paragraph');
        assert.equal(reopened.state.doc.lastChild?.textContent,'Continued','normal Enter still creates editable body content');
      }finally{reopened.destroy();}
    }finally{editor.destroy();}
  }
  for(const block of ['```js\nconst x=1;\n```','![Image](image.png)','| A |\n| --- |\n| B |']){
    const editor=new Editor({extensions:extensions('card.md'),content:'# Title\n\n'+block,contentType:'markdown'});
    try{
      if(editor.state.doc.lastChild?.type.name==='codeBlock'){
        editor.commands.setTextSelection(editor.state.doc.content.size-1);
        editor.commands.exitCode();
      }else if(editor.state.doc.lastChild?.type.name==='table'){
        editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(editor.state.doc.content.size))));
        press(editor,'Enter');
      }else{
        editor.commands.setNodeSelection(editor.state.doc.firstChild!.nodeSize);
        press(editor,'Enter');
      }
      editor.commands.insertContent('After the block');
      assert.equal(editor.state.doc.lastChild?.type.name,'paragraph');
      assert.equal(editor.state.doc.lastChild?.textContent,'After the block','users can still type after non-text blocks');
    }finally{editor.destroy();}
  }

});

test('HTML colors and image dimensions survive editing and reopening without converting ordinary images',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema');
  const {unsupported}=await import('../src/renderer/markdown');
  const body='# Color study\n\nA <span style="color: #cc3322; background-color: #ffee99">**bold** and *warm*</span> thought.\n\n<img src="_assets/picture.png" alt="A &amp; B" width="320">\n\n![Old image](_assets/old.png)';
  assert.equal(unsupported(body),false);
  assert.equal(unsupported('<span style="position: fixed">unsafe</span>'),false);
  assert.equal(unsupported('<img src="x" onerror="alert(1)">'),false);
  const editor=new Editor({extensions:extensions('Ideas/note.md'),content:body,contentType:'markdown'});
  try{
    const first=editor.getJSON();assert.ok(JSON.stringify(first).includes('textColors'));assert.ok(JSON.stringify(first).includes('bold'));
    editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'After edit'}]});
    const saved=cardMarkdown(editor);assert.match(saved,/width="320"/);assert.match(saved,/!\[Old image\]/);assert.match(saved,/background-color: #ffee99/);
    const reopened=new Editor({extensions:extensions('Ideas/note.md'),content:saved,contentType:'markdown'});
    try{assert.deepEqual(reopened.getJSON(),editor.getJSON());}finally{reopened.destroy();}
  }finally{editor.destroy();}
});

test('custom block and inline HTML remain verbatim source fragments across unrelated Markdown edits',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema');
  const {previewHtml}=await import('../src/renderer/markdown');
  const block='<details data-custom="kept"><summary>More</summary><div class="user-class"><em>HTML</em></div></details>',inline='<sup data-custom="kept">2</sup>',script='<script>alert("never")</script>';
  const editor=new Editor({extensions:extensions('note.md'),content:`# Mixed\n\nA formula x${inline}.\n\n${block}\n\n${script}\n\nTail`,contentType:'markdown'});
  try{
    editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'New text'}]});
    const saved=cardMarkdown(editor);for(const raw of [block,inline,script])assert.ok(saved.includes(raw),saved);
    const reopened=new Editor({extensions:extensions('note.md'),content:saved,contentType:'markdown'});
    try{assert.deepEqual(reopened.getJSON(),editor.getJSON());}finally{reopened.destroy();}
    assert.doesNotMatch(previewHtml(script+'<img src="x" onerror="bad()">','note.md'),/<script|onerror/);
  }finally{editor.destroy();}
});

test('Better Edit image rows and non-destructive crops retain their portable HTML',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  window.door={assetUrl:path=>`heavens-asset://vault/${path}`} as typeof window.door;
  const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema'),{previewHtml}=await import('../src/renderer/markdown');
  const crop='<div data-better-edit-image="filled" style="width: 240px; max-width: 100%; margin: 0 auto;">\n  <div style="overflow: hidden; height: 240px; border-radius: 50%;">\n    <img src="_assets/photo.png" alt="A photo" style="width: 400px; max-width: none; margin-left: -80px; margin-top: -80px; display: block;" />\n  </div>\n  <p style="font-size: 0.85em; color: #888; margin: 4px 0 0;">Caption &amp; detail</p>\n</div>';
  const row='<div data-better-edit-image-row style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; justify-content: center;">\n'+crop+'\n<div data-better-edit-image="placeholder" style="width: 160px;">Add an image</div>\n</div>';
  const editor=new Editor({extensions:extensions('Research/note.md'),content:'# Images\n\n'+row+'\n\nTail',contentType:'markdown'});
  try{
    editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'Unrelated edit'}]});
    assert.ok(cardMarkdown(editor).includes(row),'keep source, crop offsets, caption, row and placeholder unchanged');
    const html=previewHtml(row,'Research/note.md'),template=document.createElement('template');template.innerHTML=html;
    assert.equal(template.content.querySelector('img')?.getAttribute('src'),'heavens-asset://vault/Research/_assets/photo.png');
    assert.ok(html.includes('border-radius: 50%'));assert.ok(html.includes('margin-left: -80px'));assert.ok(html.includes('display: flex'));
  }finally{editor.destroy();}
});

test('portable image rows, hidden captions and crop geometry survive save and reopen',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  const {imageHtml,parseImageLayout,row}=await import('../src/renderer/image-layout'),{resizeCropRect}=await import('../src/renderer/crop-geometry'),{extensions}=await import('../src/renderer/editor-schema');
  const layout=row([{kind:'single',src:'assets/a & b.png',width:'240px',alignment:'center',alt:'A < B',caption:'hidden & readable',captionHidden:true,crop:{offsetX:20,offsetY:30,height:240,imgWidth:600,shape:'circle'}},{kind:'placeholder'}]);
  const html=imageHtml(layout),parsed=parseImageLayout(html);assert.deepEqual(parsed,{...layout,images:[{...layout.images[0],alignment:'left'},layout.images[1]]});
  const editor=new Editor({extensions:extensions('card.md'),content:'# Images\n\n'+html,contentType:'markdown'});
  try{editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'Other edit'}]});assert.ok(editor.getMarkdown().includes(html));}finally{editor.destroy();}
  const crop=resizeCropRect({x:20,y:20,w:100,h:100},-30,-30,'nw',1,{w:500,h:500});assert.equal(crop.x+crop.w,120);assert.equal(crop.y+crop.h,120);
  const legacy='<div data-better-edit-image="filled" style="width: 100px; overflow: hidden; height: 80px"><img src="a.png" style="width: 200px; margin-left: -10px; margin-top: -20px"></div>';
  assert.deepEqual((parseImageLayout(legacy) as {crop:unknown}).crop,{offsetX:10,offsetY:20,height:80,imgWidth:200});
});


test('math is editable portable Markdown and renders without enabling unsafe LaTeX links',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});window.door={platform:'darwin',assetUrl:path=>path} as typeof window.door;
  const {extensions,cardMarkdown}=await import('../src/renderer/editor-schema'),{preview,unsupported}=await import('../src/renderer/markdown');
  const body='# Math\n\nInline $x^2 + y^2 = z^2$ and `literal $x$`.\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$';
  const editor=new Editor({extensions:extensions('Math.md'),content:body,contentType:'markdown'});
  try{assert.equal(editor.state.doc.child(1).child(1).type.name,'mathInline');assert.equal(editor.state.doc.lastChild!.type.name,'mathBlock');assert.equal(cardMarkdown(editor),body);assert.equal(unsupported(body),false);assert.match(preview(body,'Math.md'),/katex/);assert.match(preview('Cost $20 and $30.','Math.md'),/\$20 and \$30/);assert.doesNotMatch(preview('$\\href{javascript:alert(1)}{x}$','Math.md'),/href="javascript/);editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'Next'}]});assert.ok(cardMarkdown(editor).startsWith(body));}finally{editor.destroy();}
});

test('Tab changes only current or selected list lines, retains caret and never focuses other UI',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});window.door={platform:'darwin',assetUrl:path=>path} as typeof window.door;
  const {extensions}=await import('../src/renderer/editor-schema');
  for(const task of [false,true]){
    const prefix=task?'- [ ] ':'- ',body='# Title\n\n'+prefix+'Alpha\n'+prefix+'Beta\n  '+prefix+'Child\n'+prefix+'Gamma';
    const editor=new Editor({extensions:extensions('List.md'),content:body,contentType:'markdown'});
    const pos=(text:string)=>{let found=0;editor.state.doc.descendants((node,p)=>{if(node.isText&&node.text===text)found=p;});return found;};
    const press=(key:string,shiftKey=false)=>editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));
    try{editor.commands.setTextSelection(pos('Alpha')+2);const before=editor.getJSON();assert.equal(press('Tab'),false);assert.deepEqual(editor.getJSON(),before,'the first item has no preceding parent to indent under');assert.equal(editor.state.selection.$from.parentOffset,2);editor.commands.setTextSelection(pos('Beta')+2);assert.equal(press('Tab'),false);assert.equal(editor.state.selection.$from.parent.textContent,'Beta');assert.equal(editor.state.selection.$from.parentOffset,2);const list=editor.state.doc.child(1),nested=list.child(0).lastChild!;assert.equal(nested.childCount,2);assert.equal(nested.child(0).firstChild!.textContent,'Beta');assert.equal(nested.child(1).firstChild!.textContent,'Child','unselected child stays at its old depth');press('Tab',true);assert.equal(editor.state.selection.$from.parent.textContent,'Beta');
      editor.commands.setContent(body,{contentType:'markdown'});editor.commands.setTextSelection({from:pos('Beta'),to:pos('Child')+5});press('Tab');const both=editor.state.doc.child(1).child(0).lastChild!;assert.equal(both.childCount,1);assert.equal(both.child(0).lastChild!.firstChild!.textContent,'Child','explicitly selected child indents with its parent');
    }finally{editor.destroy();}
  }
});

test('Home and End use displayed line boundaries and Shift extends selection',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');windows.push(dom);Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});window.door={platform:'darwin',assetUrl:p=>p} as typeof window.door;
  const {extensions}=await import('../src/renderer/editor-schema'),editor=new Editor({extensions:extensions('Line.md'),content:'# T\n\nabcdefghij',contentType:'markdown'}),start=editor.state.doc.firstChild!.nodeSize+1;
  editor.view.coordsAtPos=(pos,side=1)=>({left:0,right:0,top:Math.floor(Math.max(0,pos-start+(side<0?-1:0))/5)*20,bottom:20});
  const press=(key:string,shiftKey=false,metaKey=false)=>editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,shiftKey,metaKey,bubbles:true,cancelable:true}));
  try{editor.commands.setTextSelection(start+2);press('End');assert.equal(editor.state.selection.head,start+5);press('Home');assert.equal(editor.state.selection.head,start+5);editor.commands.setTextSelection(start+7);press('Home',true);assert.equal(editor.state.selection.anchor,start+7);assert.equal(editor.state.selection.head,start+5);press('Home',false,true);assert.equal(editor.state.selection.head,1);press('End',false,true);assert.equal(editor.state.selection.head,start+10);}finally{editor.destroy();}
});
