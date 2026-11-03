import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Editor} from '@tiptap/core';
import {act,useState} from 'react';
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
 setup();const {createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),{preview}=await import('../src/renderer/markdown'),root=createRoot(document.getElementById('root')!),edits:string[]=[];
 try{await act(async()=>root.render(<CardEditor path="Code.md" body={'# Code\n\n```c++\nint answer = 42;\n```'} cards={[]} onEdit={body=>edits.push(body)}/>));const select=document.querySelector<HTMLButtonElement>('[aria-label="Code language"]')!;assert.ok(select);assert.equal(select.textContent,'C++');assert.ok(document.querySelector('.hljs-type'));assert.deepEqual(edits,[]);
  const original=document.querySelector('pre code')!.textContent;await act(async()=>select.click());await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=option]')].find(b=>b.textContent==='Python')!.click());assert.equal(document.querySelector('pre code')!.textContent,original);assert.match(edits.at(-1)!,/```python\nint answer = 42;/);
  const el=document.querySelector('.tiptap') as HTMLElement&{editor:Editor};await act(async()=>el.editor.commands.setContent('# Code\n\n```my-language\nUnchanged <script>alert(1)</script>\n```',{contentType:'markdown'}));assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Code language"]')!.textContent,'My-language');const shown=document.createElement('div');shown.innerHTML=preview('# Code\n\n```c++\nint answer = 42; // <script>x</script>\n```','Code.md');assert.ok(shown.querySelector('.hljs-type'));assert.equal(shown.querySelector('script'),null);assert.match(shown.textContent!,/<script>x<\/script>/);
 }finally{await act(async()=>root.unmount());}
});
test('a fresh equation opens its focused editor immediately and saves normal LaTeX',async()=>{
 const dom=setup(),{createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),root=createRoot(document.getElementById('root')!),edits:string[]=[];
 try{await act(async()=>root.render(<CardEditor path="Math.md" body="# Math\n\nType here" cards={[]} onEdit={body=>edits.push(body)}/>));const el=document.querySelector('.tiptap') as HTMLElement&{editor:Editor},editor=el.editor;await act(async()=>{editor.commands.setContent(empty);editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,'$$ ');});const input=document.querySelector<HTMLTextAreaElement>('[aria-label="LaTeX equation"]')!;assert.ok(input,'Space opens the equation editor without another click');assert.equal(document.activeElement,input);
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'x^2 + y^2');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});assert.match(document.querySelector('.editor-math.is-editing .math-render')!.textContent!,/x2.*y2/);assert.equal(editor.state.doc.child(1).attrs.latex,'','preview does not save early');assert.equal(document.querySelector('.math-popover .katex'),null,'the source panel does not duplicate the preview');await act(async()=>document.querySelector('.math-popover form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('.math-popover'),null);assert.equal(editor.state.doc.child(1).attrs.latex,'x^2 + y^2');assert.match(edits.at(-1)!,/\$\$\nx\^2 \+ y\^2\n\$\$/);assert.ok(document.querySelector('.katex'));assert.equal(editor.state.selection.$from.parent.type.name,'paragraph');await act(async()=>type(editor,'After the equation'));assert.equal(editor.state.doc.child(1).attrs.latex,'x^2 + y^2');assert.equal(editor.state.doc.lastChild!.textContent,'After the equation');
 }finally{await act(async()=>root.unmount());}
});

test('the floating formatting toolbar converts selected text to inline math with in-place preview and keyboard save',async()=>{
 const dom=setup(),{createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),{cardMarkdown}=await import('../src/renderer/editor-schema'),root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<CardEditor path="Math.md" body={"# Math\n\nBefore x^2 after."} cards={[]} onEdit={()=>{}}/>));
  const editor=(document.querySelector('.tiptap') as HTMLElement&{editor:Editor}).editor;
  await act(async()=>{const from=editor.state.doc.firstChild!.nodeSize+1+'Before '.length;editor.commands.setTextSelection({from,to:from+3});editor.view.focus();});
  const action=document.querySelector<HTMLButtonElement>('.editor-selection-tools [aria-label="Inline equation"]')!;assert.ok(action);assert.equal(action.disabled,false);
  await act(async()=>action.click());
  const input=document.querySelector<HTMLTextAreaElement>('.math-popover textarea')!;assert.equal(input.value,'x^2');assert.equal(document.activeElement,input);assert.ok(document.querySelector('.editor-math.is-inline.is-editing'));
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'y^2');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  assert.match(document.querySelector('.editor-math .math-render')!.textContent!,/y/);assert.match(cardMarkdown(editor),/Before \$x\^2\$ after/);
  await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true})));assert.ok(document.querySelector('.math-popover'),'Shift+Enter keeps the editor open');
  await act(async()=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.equal(document.querySelector('.math-popover'),null);assert.match(cardMarkdown(editor),/Before \$y\^2\$ after/);assert.equal(editor.state.selection.empty,true);
  await act(async()=>{editor.commands.setTextSelection({from:editor.state.doc.firstChild!.nodeSize+1,to:editor.state.doc.content.size-1});editor.view.focus();});assert.equal(document.querySelector<HTMLButtonElement>('.editor-selection-tools [aria-label="Inline equation"]')!.disabled,true,'conversion must not discard existing equation atoms');
  await act(async()=>document.querySelector<HTMLElement>('.math-render')!.click());const reopened=document.querySelector<HTMLTextAreaElement>('.math-popover textarea')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value')!.set!.call(reopened,'discard me');reopened.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>reopened.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.querySelector('.math-popover'),null);assert.match(cardMarkdown(editor),/Before \$y\^2\$ after/);assert.doesNotMatch(document.querySelector('.math-render')!.textContent!,/discard/);
  await act(async()=>{editor.commands.setContent('# Math\n\nFirst\n\nSecond',{contentType:'markdown'});editor.commands.setTextSelection({from:editor.state.doc.firstChild!.nodeSize+1,to:editor.state.doc.content.size-1});editor.view.focus();});
  assert.equal(document.querySelector<HTMLButtonElement>('.editor-selection-tools [aria-label="Inline equation"]')!.disabled,true,'cross-block selections must not silently lose their structure');
 }finally{await act(async()=>root.unmount());}
});

test('typing a heading-like prefix in a nested bullet survives each saved-content echo without crashing',async()=>{
  const dom=setup(),{createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor');
  const errors:unknown[]=[],saved:string[]=[];const root=createRoot(document.getElementById('root')!,{onUncaughtError:error=>errors.push(error)});
  function Fixture(){const [body,setBody]=useState('# Card\n\n- Parent\n  - seed');return <CardEditor path="Nested.md" body={body} cards={[]} onEdit={next=>{saved.push(next);setBody(next);}}/>;}
  try{
    await act(async()=>root.render(<Fixture/>));const element=document.querySelector('.tiptap') as HTMLElement&{editor:Editor},editor=element.editor;let pos=0;editor.state.doc.descendants((node,at)=>{if(node.isText&&node.text==='seed')pos=at;});
    await act(async()=>editor.commands.setTextSelection({from:pos,to:pos+4}));
    for(const char of '# Test nested list')await act(async()=>type(editor,char));
    assert.deepEqual(errors,[]);assert.equal(document.querySelector('.tiptap'),element);editor.state.doc.check();assert.match(editor.state.doc.textContent,/# Test nested list/);assert.match(saved.at(-1)!,/\\# Test nested list/);
    const reopened=editor.schema.nodeFromJSON(editor.markdown!.parse(saved.at(-1)!));reopened.check();assert.match(reopened.textContent,/# Test nested list/);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Turn into checks the selected block type and leaves mixed selections unchecked',async()=>{
 const dom=setup(),{createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<CardEditor path="Types.md" body={"# Types\n\n## Heading\n\nParagraph\n\n- Item"} cards={[]} onEdit={()=>{}}/>));const editor=(document.querySelector('.tiptap') as HTMLElement&{editor:Editor}).editor;
  const open=async()=>{await act(async()=>document.querySelector<HTMLButtonElement>('.editor-block-grip')!.click());await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Turn into…')!.click());};
  await act(async()=>{editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize+1);});await open();assert.equal(document.querySelector('[role=menuitemradio][aria-checked=true]')?.textContent,'Heading 2');
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')].find(b=>b.textContent==='Heading 3')!.click());assert.equal(editor.state.doc.child(1).attrs.level,3);
  await act(async()=>{editor.commands.setTextSelection({from:editor.state.doc.firstChild!.nodeSize+1,to:editor.state.doc.child(0).nodeSize+editor.state.doc.child(1).nodeSize+2});});await open();assert.equal(document.querySelector('[role=menuitemradio][aria-checked=true]'),null);
  await act(async()=>document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await act(async()=>document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>{editor.commands.setTextSelection(editor.state.doc.content.size-3);});await open();assert.equal(document.querySelector('[role=menuitemradio][aria-checked=true]')?.textContent,'Bullet list');
 }finally{await act(async()=>root.unmount());}
});

test('slash commands search custom aliases and stop intercepting input when disabled',async()=>{
 const dom=setup();dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const {createRoot}=await import('react-dom/client'),{CardEditor}=await import('../src/renderer/Editor'),{ViewBlockProvider}=await import('../src/renderer/ViewBlock'),{DEFAULT_EDITOR_SETTINGS}=await import('../src/editor-settings'),root=createRoot(document.getElementById('root')!);
 const settings={...DEFAULT_EDITOR_SETTINGS,commands:[{id:'custom',name:'Snippet',enabled:true,aliases:['insert'],template:'Hello {{cursor}}'}]},snapshot={root:'/notes',name:'Notes',cards:[],boards:[],tags:[],issues:[],historyAvailable:false,preferences:{theme:'dark' as const,stem:'untitled',starred:[],recent:[],icons:{},editor:settings}};
 const render=(enabled:boolean)=><ViewBlockProvider snapshot={{...snapshot,preferences:{...snapshot.preferences,editor:{...settings,slashEnabled:enabled}}}} session={{} as import('../src/renderer/session').Session} onOpen={()=>{}}><CardEditor path="Slash.md" body="# Slash\n\n" cards={[]} onEdit={()=>{}}/></ViewBlockProvider>;
 try{
  await act(async()=>root.render(render(true)));const editor=(document.querySelector('.tiptap') as HTMLElement&{editor:Editor}).editor;
  await act(async()=>{editor.commands.setContent(empty);editor.view.dom.focus();editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,'/insert');});assert.equal(document.querySelector('.editor-command-menu [role=option]')?.textContent,'Snippet');
  await act(async()=>editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.match(editor.state.doc.textContent,/Hello/);assert.doesNotMatch(editor.state.doc.textContent,/insert/);
  await act(async()=>root.render(render(false)));await act(async()=>{editor.commands.setContent(empty);editor.view.dom.focus();editor.commands.setTextSelection(editor.state.doc.content.size-1);type(editor,'/insert');});assert.equal(document.querySelector('.editor-command-menu'),null);assert.match(editor.state.doc.textContent,/insert/);
 }finally{await act(async()=>root.unmount());}
});
