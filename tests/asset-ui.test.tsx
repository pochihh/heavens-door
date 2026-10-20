import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import type {Editor} from '@tiptap/core';
import type {Session} from '../src/renderer/session';
import type {Card,Snapshot} from '../src/shared';
import {ConfirmationProvider} from '../src/renderer/Confirmation';
import {withAnnotations,splitAnnotations} from '../src/reading';
const observers:{target:Element;callback:ResizeObserverCallback}[]=[];
const dom=new JSDOM('<!doctype html><div id="root"></div>',{pretendToBeVisual:true});after(()=>dom.window.close());
Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,CustomEvent:dom.window.CustomEvent,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{constructor(private callback:ResizeObserverCallback){}observe(target:Element){observers.push({target,callback:this.callback});}disconnect(){}}});Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const body=withAnnotations('# My card\n\nEditable text.',[{id:'n1',kind:'note',text:'Preserve legacy note'}]),card:Card={id:'card',path:'Board/Card.md',name:'Card',revision:'r',legacy:false,body};
window.door={platform:'darwin',assetUrl:p=>'heavens-asset://vault/'+p,request:async request=>request.kind==='query'?[]:card} as typeof window.door;

test('ordinary cards retain the simple direct editor, accept typing, and preserve legacy notes without annotation UI',async()=>{
 const {NoteView}=await import('../src/renderer/DocumentViews');let edited='';const snapshot={cards:[card],boards:[],preferences:{theme:'dark'}} as unknown as Snapshot;
 const session={tagExpansion:new Map(),state:{draft:{card,body,dirty:false}},bridge:window.door,edit:(value:string)=>{edited=value;},run:async()=>{},update:()=>{}} as unknown as Session;
 const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<ConfirmationProvider><NoteView path={card.path} snapshot={snapshot} session={session} active memory={{}} onActivate={()=>{}} onOpen={()=>{}} onViewChange={()=>{}}/></ConfirmationProvider>));
  assert.equal(document.querySelector('.reading-actions,.document-reading-layout,.annotation-rail'),null);
  const element=document.querySelector<HTMLElement&{editor:Editor}>('.tiptap')!;assert.equal(element.getAttribute('contenteditable'),'true');assert.equal(element.closest('.editor-body')?.parentElement?.className,'document-editor');
  await act(async()=>element.editor.commands.insertContentAt(element.editor.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'A new sentence'}]}));
  assert.match(edited,/A new sentence/);assert.deepEqual(splitAnnotations(edited).annotations,splitAnnotations(body).annotations);
 }finally{await act(async()=>root.unmount());}
});

test('an imported article has reading actions and an asset-note rail',async()=>{
 const {NoteView}=await import('../src/renderer/DocumentViews'),asset={...card,id:'asset',source:{type:'web' as const,file:'_assets/article.html'}},snapshot={cards:[asset],boards:[],preferences:{theme:'dark'}} as unknown as Snapshot;
 const session={tagExpansion:new Map(),state:{draft:{card:asset,body,dirty:false}},bridge:window.door,run:async()=>{},update:()=>{}} as unknown as Session,root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<ConfirmationProvider><NoteView path={card.path} snapshot={snapshot} session={session} active memory={{}} onActivate={()=>{}} onOpen={()=>{}} onViewChange={()=>{}}/></ConfirmationProvider>));assert.ok(document.querySelector('.reading-actions'));assert.equal(document.querySelectorAll('.sticky-note').length,1);assert.ok(document.querySelector('.document-reading-layout'));}finally{await act(async()=>root.unmount());}
});

test('a standalone image and PDF use direct media placements with no card shell or editor',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board'),{imageHtml}=await import('../src/renderer/image-layout');document.elementFromPoint=()=>null;
 const pdf={...card,id:'pdf',source:{type:'pdf' as const,file:'_assets/paper.pdf'}},board={path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[{id:'image',cardId:'',x:0,y:0,width:340,height:280,object:{type:'image' as const,html:imageHtml({kind:'single',src:'_assets/photo.png',width:'100%',alignment:'left',caption:'My image'})}},{id:'pdf',cardId:'pdf',x:400,y:0,width:340,height:280},{id:'text',cardId:'',x:800,y:0,width:240,height:120,object:{type:'text' as const,shape:'none' as const,text:'Just text'}}],edges:[]};
 dom.window.HTMLElement.prototype.setPointerCapture=()=>{};dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
 const root=createRoot(document.getElementById('root')!);try{await act(async()=>root.render(<Whiteboard board={board} cards={[pdf]} onSave={()=>{}} onOpen={()=>{}} onCreate={()=>{}}/>));
  for(const id of ['image','pdf']){const placement=document.querySelector(`[data-placement="${id}"]`)!;assert.ok(placement.classList.contains('board-media'));assert.equal(placement.classList.contains('board-card'),false);assert.equal(placement.querySelector('.card-top-row,.card-actions,.tiptap,.card-editor,.editor-body'),null);assert.equal((placement as HTMLElement).style.height,'auto');}
  assert.equal(document.querySelector('[data-placement="image"] > .resize-handle'),null);assert.ok(document.querySelector('[data-placement="image"] .image-resize'));assert.equal(document.querySelector('.image-caption')?.textContent,'My image');assert.ok(document.querySelector('[data-placement="image"] img'));assert.ok(document.querySelector('[data-placement="pdf"] .pdf-reader'));assert.equal(document.querySelector('.board-pdf-title')?.textContent,pdf.name);assert.ok(document.querySelector('[aria-label="Next PDF page"]'));assert.ok(document.querySelector('[aria-label="PDF actions"]'));
  const text=document.querySelector<HTMLElement>('[data-placement="text"]')!;assert.ok(text.classList.contains('board-text'));assert.equal(text.querySelector('.card-top-row,.resize-handle,.card-editor'),null);
  const image=document.querySelector<HTMLElement>('[data-placement="image"]')!,media=image.querySelector<HTMLElement>('.image-media')!;Object.defineProperty(image,'offsetHeight',{value:220});Object.defineProperty(image,'offsetWidth',{value:340});Object.defineProperty(media,'offsetHeight',{value:180});
  await act(async()=>observers.find(o=>o.target===image)!.callback([],{} as ResizeObserver));
  const pointer=(target:Element,type:string)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:50,clientY:50}));await act(async()=>{pointer(media,'pointerdown');pointer(document.querySelector('.canvas')!,'pointerup');});
  assert.equal(document.querySelector('[data-anchor-card="image"][data-anchor-side="bottom"]')?.getAttribute('cy'),'180','anchors must exclude the caption height');
 }finally{await act(async()=>root.unmount());}
});

test('an asset note can highlight and drop onto the board beneath a modal reader, and cancel leaves no drag UI',async()=>{
 const {dragAssetNote}=await import('../src/renderer/asset-note-drag');document.body.insertAdjacentHTML('beforeend','<div class="canvas" data-drop-kind="board" data-drop-folder="Board"><div class="board-world"></div></div><dialog open><section class="sticky-note"><button id="grip">drag</button></section></dialog>');
 const canvas=document.querySelector<HTMLElement>('.canvas')!,grip=document.getElementById('grip')!,source=grip.closest<HTMLElement>('.sticky-note')!;canvas.getBoundingClientRect=()=>({left:0,top:0,right:900,bottom:600,width:900,height:600} as DOMRect);source.getBoundingClientRect=()=>({left:20,top:20,right:220,bottom:60,width:200,height:40} as DOMRect);document.elementsFromPoint=()=>[grip];
 Object.assign(globalThis,{DOMMatrix:class{e=0;f=0;a=1;d=1;}});let drops=0;const dropped=()=>drops++;window.addEventListener('door:document-drop',dropped);
 const event={button:0,currentTarget:grip,pointerId:1,clientX:30,clientY:30,preventDefault(){},stopPropagation(){}} as unknown as React.PointerEvent;
 try{const cancel=dragAssetNote(event,()=>({key:'asset-note:n1',path:card.path,note:{id:'n1',expected:'r'}}));const pointer=(type:string)=>{const e=new dom.window.MouseEvent(type,{bubbles:true,clientX:400,clientY:250,cancelable:true});Object.defineProperty(e,'pointerId',{value:1});document.dispatchEvent(e);};pointer('pointermove');assert.ok(canvas.classList.contains('document-drop-target'));assert.ok(document.querySelector('.drag-phantom'));pointer('pointerup');assert.equal(drops,1);assert.equal(document.querySelector('.drag-phantom'),null);assert.equal(document.body.classList.contains('asset-note-dragging'),false);cancel();
  const abort=dragAssetNote(event,()=>({key:'asset-note:n1',path:card.path,note:{id:'n1',expected:'r'}}));pointer('pointermove');abort();assert.equal(drops,1);assert.equal(document.querySelector('.drag-phantom'),null);
 }finally{window.removeEventListener('door:document-drop',dropped);canvas.remove();grip.closest('dialog')?.remove();}
});

test('the standalone image bar expands beyond its initial width, previews live, and scales the stored crop correctly',async()=>{
 const {ImageItemView,resized}=await import('../src/renderer/EditorImage'),item={kind:'single' as const,src:'_assets/photo.png',width:'120px',alignment:'left' as const,crop:{height:60,imgWidth:240,offsetX:20,offsetY:10}};
 const shown=resized(item,180,180);assert.equal(shown.crop?.imgWidth,360);assert.equal(shown.crop?.height,90);
 const changes:typeof item[]=[],previews:(number|undefined)[]=[],root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<ImageItemView standalone fullWidth item={item} index={0} inRow={false} path="Board/Board.whiteboard" onChange={next=>changes.push(next as typeof item)} onRemove={()=>{}} onDuplicate={()=>{}} onRow={()=>{}} onResizePreview={width=>previews.push(width)}/>));
  const image=document.querySelector<HTMLElement>('.editor-image')!,bar=image.querySelector('.image-resize')!;Object.defineProperty(image,'offsetWidth',{value:120});image.getBoundingClientRect=()=>({left:0,top:0,width:120,height:60} as DOMRect);
  const pointer=(target:EventTarget,type:string,x:number)=>{const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:30});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);};
  await act(async()=>pointer(bar,'pointerdown',110));await act(async()=>pointer(document,'pointermove',310));assert.equal(image.style.width,'320px');assert.equal(image.style.maxWidth,'none');assert.equal(previews.at(-1),320);
  await act(async()=>pointer(document,'pointerup',310));assert.equal(changes.at(-1)?.width,'320px');assert.equal(changes.at(-1)?.crop?.height,160);assert.equal(changes.at(-1)?.crop?.imgWidth,640);assert.equal(previews.at(-1),undefined);
  const before=changes.length;await act(async()=>pointer(bar,'pointerdown',110));await act(async()=>pointer(document,'pointermove',410));await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(changes.length,before,'cancel never persists a partial resize');assert.equal(previews.at(-1),undefined);
 }finally{await act(async()=>root.unmount());}
});


test('legacy crop bounds never extend past the source image, including after resize and reload',async()=>{
 const {resized}=await import('../src/renderer/EditorImage'),{imageHtml,parseImageLayout}=await import('../src/renderer/image-layout');
 const legacy={kind:'single' as const,src:'figure.png',width:'540px',alignment:'left' as const,crop:{imgWidth:317.66251815980627,offsetX:44.11290072639225,offsetY:30.250460048426145,height:231.69138014527843}};
 const fixed=resized(legacy,540,540),crop=fixed.crop!;assert.ok(Math.abs(crop.imgWidth-crop.offsetX-540)<.001);assert.ok(crop.height>450);
 const stored=parseImageLayout(imageHtml(fixed));assert.equal(stored?.kind,'single');if(stored?.kind!=='single')throw new Error('Missing image');
 const again=resized(stored,540,540);for(const key of ['imgWidth','offsetX','offsetY','height'] as const)assert.ok(Math.abs(again.crop![key]-crop[key])<.000001,'rendering again does not repeatedly enlarge the crop');
 const smaller=resized(again,270,540);assert.ok(Math.abs(smaller.crop!.height-crop.height/2)<.000001);assert.ok(Math.abs(smaller.crop!.imgWidth-smaller.crop!.offsetX-270)<.001);
 const percentage=resized({...legacy,width:'100%'},540,540);assert.deepEqual(percentage.crop,crop);
});

test('whiteboard imports dropped and pasted images in world coordinates without hijacking text fields',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board'),{useState}=await import('react');
 const initial={path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[],edges:[]},imports:string[]=[],saves:string[]=[];
 const original=window.door;window.door={...original,importImage:async(path,name)=>{imports.push(path+':'+name);if(name==='bad.png')throw new Error('Image import failed');return {src:'_assets/'+name,alt:name};},importImageLink:async(_path,url)=>({src:'_assets/remote.png',alt:url})};
 const root=createRoot(document.getElementById('root')!);
 function Board(){const [board,setBoard]=useState<import('../src/shared').Board>(initial);return <Whiteboard board={board} cards={[]} initialCamera={{x:20,y:40,zoom:.5}} onSave={(next,label)=>{saves.push(label);setBoard({...next,revision:'r'+saves.length});}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 const file=(name:string)=>new File(['image'],name,{type:'image/png'}),transfer=(files:File[],html='')=>({files,items:files.map(f=>({kind:'file',type:f.type})),types:files.length?['Files']:['text/html'],getData:(type:string)=>type==='text/html'?html:'',dropEffect:'none'});
 const dispatch=(target:Element,type:string,data:ReturnType<typeof transfer>)=>{const event=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:180,clientY:160});Object.defineProperty(event,type==='paste'?'clipboardData':'dataTransfer',{value:data});target.dispatchEvent(event);return event;};
 try{await act(async()=>root.render(<Board/>));const canvas=document.querySelector<HTMLElement>('.canvas')!;canvas.getBoundingClientRect=()=>({left:10,top:20,width:800,height:600} as DOMRect);
  await act(async()=>{dispatch(canvas,'dragover',transfer([file('drop.png')]));});assert.ok(canvas.classList.contains('document-drop-target'));
  await act(async()=>{assert.equal(dispatch(canvas,'drop',transfer([file('drop.png')])).defaultPrevented,true);});
  assert.equal(document.querySelectorAll('.board-image').length,1);const dropped=document.querySelector<HTMLElement>('.board-image')!;assert.equal(dropped.style.left,'300px');assert.equal(dropped.style.top,'200px');assert.equal(canvas.classList.contains('document-drop-target'),false);
  await act(async()=>{dispatch(canvas,'paste',transfer([file('paste.png'),file('second.png')]));});assert.equal(document.querySelectorAll('.board-image').length,3);const pasted=[...document.querySelectorAll<HTMLElement>('.board-image')].slice(1);assert.equal(pasted[0].style.left,'760px');assert.equal(pasted[0].style.top,'520px');assert.equal(pasted[1].style.left,'1120px');assert.equal(saves.length,2,'one undo action per batch');
  const textarea=document.createElement('textarea');canvas.append(textarea);await act(async()=>{assert.equal(dispatch(textarea,'paste',transfer([file('ignored.png')])).defaultPrevented,false);});assert.equal(imports.length,3);textarea.remove();
  await act(async()=>{dispatch(canvas,'drop',transfer([], '<img src="https://example.com/photo.png">'));});assert.equal(document.querySelectorAll('.board-image').length,4);
  await act(async()=>{dispatch(canvas,'drop',transfer([file('good.png'),file('bad.png')]));});assert.match(document.querySelector('[role=alert]')!.textContent!,/Image import failed/);assert.equal(document.querySelectorAll('.board-image').length,5,'a failed later import preserves earlier images');
 }finally{await act(async()=>root.unmount());window.door=original;}
});

test('shared image transfer recognizes Finder images and browser image drags, without importing arbitrary links or HTML',async()=>{
 const {imageFiles,imageTransferUrl}=await import('../src/renderer/editor-images');
 const files=imageFiles({files:[new File(['png'],'image.PNG'),new File(['text'],'other.txt')] as unknown as FileList});assert.equal(files.length,1);assert.equal(files[0].type,'image/png');
 const url=(html:string,uri='')=>imageTransferUrl({getData:(type:string)=>type==='text/html'?html:uri} as DataTransfer);
 assert.equal(url('<img src="https://example.com/image?id=1">'),'https://example.com/image?id=1');assert.equal(url('', '# comment\nhttps://example.com/picture.webp'),'https://example.com/picture.webp');assert.equal(url('<img src="file:///private/image.png">'),undefined);assert.equal(url('<a href="https://example.com">Site</a>'),undefined);assert.equal(url('','https://example.com/page'),undefined);
});


test('image placeholders share the icon bar, tabbed picker and transfer handling in notes and on boards',async()=>{
 const {preview}=await import('../src/renderer/markdown');assert.match(preview('<div data-better-edit-image="placeholder">Add an image</div>','Board/Note.md'),/image-placeholder-icon/);
 const {ImageItemView}=await import('../src/renderer/EditorImage'),{useState}=await import('react'),{parseImageLayout}=await import('../src/renderer/image-layout'),{readBoard,writeBoard}=await import('../src/core/format'),{Whiteboard}=await import('../src/renderer/Board');
 dom.window.HTMLElement.prototype.showPopover=function(){};Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});Object.assign(globalThis,{innerWidth:1000,innerHeight:800});
 const original=window.door,imports:string[]=[];window.door={...original,importImage:async(_path,name)=>{imports.push(name);return {src:'_assets/'+name,alt:name};},importImageLink:async(_path,url)=>{imports.push(url);if(url.includes('bad'))throw new Error('Cannot load image');return {src:'_assets/photo.png',alt:'Photo'};}};
 const root=createRoot(document.getElementById('root')!);let changes:import('../src/renderer/image-layout').ImageItem[]=[];
 function Note(){const [item,setItem]=useState<import('../src/renderer/image-layout').ImageItem>({kind:'placeholder'});return <ImageItemView item={item} index={0} inRow={false} path="Board/Note.md" onChange={next=>{changes.push(next);setItem(next);}} onRemove={()=>{}} onDuplicate={()=>{}} onRow={()=>{}}/>;}
 const click=async(selector:string)=>act(async()=>document.querySelector<HTMLButtonElement>(selector)!.click());
 const drop=async(target:Element,type:'drop'|'paste',files:File[],html='')=>act(async()=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,type==='drop'?'dataTransfer':'clipboardData',{value:{files,types:files.length?['Files']:['text/html'],getData:(type:string)=>type==='text/html'?html:''}});target.dispatchEvent(event);assert.equal(event.defaultPrevented,true);});
 try{
  await act(async()=>root.render(<Note/>));const bar=document.querySelector('.image-placeholder')!;assert.ok(bar.querySelector('.image-placeholder-trigger svg'));assert.equal(bar.querySelector('.image-placeholder-trigger')!.textContent,'Add an image');assert.equal(bar.querySelectorAll('button').length,2,'bar has one trigger and More; upload/link live in the picker');
  await click('.image-placeholder-trigger');assert.equal(document.querySelector('[role=tab][aria-selected=true]')!.textContent,'Upload');assert.match(document.querySelector('[role=tabpanel]')!.textContent!,/Drag an image here/);
  await click('[role=tab]:last-child');const input=document.querySelector<HTMLInputElement>('.image-picker input')!;assert.match(input.placeholder,/URL or local path/);
  await drop(document.querySelector('[role=tabpanel]')!,'drop',[],'<img src="https://example.com/bad.png">');
  assert.ok(document.querySelector('.image-placeholder'),'failed import preserves the placeholder');assert.match(document.querySelector('[role=alert]')!.textContent!,/Cannot load image/);
  await drop(document.querySelector('[role=tabpanel]')!,'drop',[],'<img src="https://example.com/photo.png">');assert.equal(changes.at(-1)?.kind,'single');assert.equal(document.querySelector('.image-placeholder,.property-popover'),null);assert.ok(document.querySelector('.image-media img'));
  let board:import('../src/shared').Board={path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[],edges:[]};changes=[];const saves:import('../src/shared').Board[]=[];
  function Board(){const [value,setValue]=useState(board);return <Whiteboard board={value} cards={[]} onSave={next=>{board=next;saves.push(next);setValue({...next,revision:String(saves.length)});}} onOpen={()=>{}} onCreate={()=>{}}/>;}
  await act(async()=>root.render(<Board/>));const before=imports.length;await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:200})));await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(n=>n.textContent==='Image or figure')!.click());assert.equal(imports.length,before,'adding an empty image does not import or create a Markdown card');assert.equal(board.cards.length,1);const id=board.cards[0].id;assert.equal(parseImageLayout(board.cards[0].object!.type==='image'?board.cards[0].object!.html:'')?.kind,'placeholder');
  assert.deepEqual(readBoard(board.path,writeBoard(board)).cards,board.cards,'placeholder survives reload');const image=document.querySelector('.board-image')!;assert.ok(image.querySelector('.image-placeholder-trigger svg'));assert.equal(image.querySelector('.card-editor,.resize-handle'),null);
  await drop(image.querySelector('.image-placeholder')!,'paste',[new File(['png'],'paste.png',{type:'image/png'})]);assert.equal(board.cards.length,1,'paste fills the target instead of appending a second image');assert.equal(board.cards[0].id,id);assert.equal(imports.at(-1),'paste.png');assert.ok(image.querySelector('.image-media img'));
  for(const html of ['<div data-better-edit-image="placeholder"><img src="bad"></div>','<div data-better-edit-image-row="true"></div>','<div data-better-edit-image="placeholder"></div><div data-better-edit-image="placeholder"></div>'])assert.throws(()=>writeBoard({...board,cards:[{...board.cards[0],object:{type:'image',html}}]}),/Invalid whiteboard object/);
 }finally{await act(async()=>root.unmount());window.door=original;}
});

test('PDF board actions preserve width, show notes by default and collapse to the ordinary compact card',async()=>{
 const {Whiteboard}=await import('../src/renderer/Board'),{useState}=await import('react');let saved:import('../src/shared').Board|undefined;
 const pdf={...card,id:'pdf',source:{type:'pdf' as const,file:'_assets/paper.pdf'}},initial={path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[{id:'pdf',cardId:'pdf',x:10,y:20,width:340,height:480}],edges:[]};
 function Board(){const [board,setBoard]=useState<import('../src/shared').Board>(initial);return <Whiteboard board={board} cards={[pdf]} onSave={next=>{saved=next;setBoard({...next,revision:crypto.randomUUID()});}} onOpen={()=>{}} onCreate={()=>{}}/>;}
 const root=createRoot(document.getElementById('root')!);
 const action=async(label:string)=>{await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="PDF actions"]')!.click());await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')].find(b=>b.textContent===label)!.click());};
 try{await act(async()=>root.render(<Board/>));await action('Expand PDF preview');assert.equal(saved!.cards[0].pdf?.expanded,true);assert.equal(saved!.cards[0].width,340);assert.ok(document.querySelector('.board-pdf.continuous'));
  const reader=document.querySelector<HTMLElement>('.board-pdf .pdf-reader')!;Object.defineProperties(reader,{scrollHeight:{value:1400,configurable:true},clientHeight:{value:600,configurable:true}});
  const scroll=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:80});await act(async()=>reader.dispatchEvent(scroll));assert.equal(scroll.defaultPrevented,false,'scrollable PDF keeps native vertical reading instead of canvas navigation');
  const zoom=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:0,ctrlKey:true});await act(async()=>reader.dispatchEvent(zoom));assert.equal(zoom.defaultPrevented,true,'modified wheel still reaches canvas zoom');
  await action('Show notes');assert.equal(saved!.cards[0].pdf?.notes,false);await action('Show one page');assert.equal(saved!.cards[0].pdf?.expanded,false);
  await act(async()=>document.querySelector<HTMLButtonElement>('.board-pdf [aria-label="Collapse card"]')!.click());assert.equal(saved!.cards[0].collapsed,true);assert.ok(document.querySelector('.board-card.collapsed'));assert.equal(document.querySelector('.pdf-reader'),null);
  await act(async()=>document.querySelector<HTMLButtonElement>('.card-actions [aria-label="Expand card"]')!.click());assert.equal(saved!.cards[0].collapsed,false);assert.ok(document.querySelector('.pdf-reader'));
 }finally{await act(async()=>root.unmount());}
});

test('the continuous PDF reader tracks the page occupying most of its visible height, including the last page',async()=>{
 const {visiblePdfPage}=await import('../src/renderer/PdfReader');const reader=document.createElement('div');reader.innerHTML='<div class="pdf-reader-toolbar"></div><div data-pdf-page="1"></div><div data-pdf-page="2"></div>';
 const rect=(top:number,bottom:number)=>({top,bottom,left:0,right:340,width:340,height:bottom-top} as DOMRect);
 reader.getBoundingClientRect=()=>rect(100,700);reader.firstElementChild!.getBoundingClientRect=()=>rect(100,130);
 const pages=reader.querySelectorAll<HTMLElement>('[data-pdf-page]');pages[0].getBoundingClientRect=()=>rect(-180,260);pages[1].getBoundingClientRect=()=>rect(270,700);assert.equal(visiblePdfPage(reader),2,'last page is current even when the preceding page has a visible tail');
 pages[0].getBoundingClientRect=()=>rect(130,570);pages[1].getBoundingClientRect=()=>rect(580,1020);assert.equal(visiblePdfPage(reader),1);reader.replaceChildren();assert.equal(visiblePdfPage(reader),undefined);
});
