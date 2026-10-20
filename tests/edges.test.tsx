import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act, useState, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { edgeStyle, type Board, type Edge } from '../src/shared';
import { readBoard, writeBoard } from '../src/core/format';
import { Workspace } from '../src/core/workspace';
import { UndoHistory } from '../src/renderer/history';
import { defaultDocks, validateDocks } from '../src/layout';
import { StyleView } from '../src/renderer/StyleView';
import { Session } from '../src/renderer/session';

test('edges and styles round-trip independently of indexed mentions, including undo and old layouts',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-edges-'));const root=join(dir,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Ideas');await w.create('Ideas','a',0,0);await w.create('Ideas','b',500,0);
  const a=await w.card('Ideas/a.md'),b=await w.card('Ideas/b.md');
  await w.saveCard(a.path,`# A\n[mention](card:${b.id})\n[again](card:${b.id})\n\n\`\`\`\n[ignored](card:${a.id})\n\`\`\``,a.revision);
  const board=w.snapshot().boards.find(b=>b.folder==='Ideas')!;
  assert.deepEqual(w.boardMentions(board.path).map(r=>({...r})),[{from:a.id,to:b.id}]);
  const edge:Edge={id:'edge',from:board.cards[0].id,to:board.cards[1].id,fromSide:'right',toSide:'left',fromArrowhead:'triangle-outline',toArrowhead:'arrow',label:'Related',labelSize:18,strokeColor:'#7950f2',strokeWidth:4,strokeStyle:'dashed'};
  const styled:Board={...board,showMentions:false,mentionStyle:{strokeColor:'#e03131',strokeStyle:'dotted'},canvasColor:'#18181b',edges:[edge,{...edge,id:'parallel',from:edge.to,to:edge.from,label:'Another relationship',strokeStyle:'dotted'}],cards:board.cards.map(p=>({...p,fillColor:'#153e75',strokeStyle:'dotted',strokeWidth:2}))};
  const decoded=readBoard(board.path,writeBoard(styled));assert.deepEqual(decoded.edges,styled.edges,'parallel and reversed edges retain independent IDs, labels and styles');assert.equal(decoded.cards[0].fillColor,'#153e75');assert.equal(decoded.showMentions,false);
  const before=await w.read(a.path),undo=new UndoHistory();const mutation=await w.saveBoard(styled,board.revision);undo.record('Style',mutation.edits);
  assert.equal(await w.read(a.path),before,'visual edges never write mentions into notes');
  assert.equal(w.boardMentions(board.path).length,1,'visibility and edges do not change indexed mentions');
  await undo.travel(false,changes=>w.write(changes));assert.equal(w.snapshot().boards.find(b=>b.path===board.path)!.edges.length,0);
  await undo.travel(true,changes=>w.write(changes));assert.deepEqual(w.snapshot().boards.find(b=>b.path===board.path)!.edges,styled.edges,'undo/redo restores both relationships independently');
  assert.throws(()=>writeBoard({...styled,edges:[{...edge,strokeColor:'url(https://example.com)'}]}),/Invalid whiteboard style/);
  assert.throws(()=>writeBoard({...styled,edges:[{...edge,strokeWidth:NaN}]}),/Invalid whiteboard style/);
  const old=defaultDocks();old.right.groups[0].tabs=['agent','history'];old.right.groups[0].active='history';
  const migrated=validateDocks(old);assert.deepEqual(migrated.right.groups[0].tabs,['agent','history','style','calendar','graph']);assert.equal(migrated.right.groups[0].active,'history');assert.equal(old.right.groups[0].tabs.length,2);
});

test('anchor clicks, dragging, reconnection, cancellation and deletion work for cards and whiteboards',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>undefined;dom.window.HTMLElement.prototype.hasPointerCapture=()=>false;
  const errors:unknown[]=[];dom.window.addEventListener('error',e=>{errors.push(e.error);e.preventDefault();});
  const {Whiteboard}=await import('../src/renderer/Board');
  let current:Board={path:'Ideas/Ideas.whiteboard',folder:'Ideas',name:'Ideas',revision:'r',cards:[0,1,2].map(i=>({id:`p${i}`,cardId:`c${i}`,x:i*500,y:0,width:340,height:280,...(i===2?{folder:'Ideas/Child'}:{})})),edges:[]};
  let writes=0;const root=createRoot(document.getElementById('root')!);
  function Harness(){const [board,setBoard]=useState(current);return <Whiteboard edgeDefaults={{strokeColor:'#80aaa6',strokeWidth:4,strokeStyle:'dashed',fromArrowhead:'arrow',toArrowhead:'arrow',labelSize:18}} board={board} cards={[]} initialCamera={{x:0,y:0,zoom:1}} onSave={b=>{current=b;writes++;setBoard(b);}} onOpen={()=>assert.fail('connecting must not edit content')} onCreate={()=>assert.fail('connecting must not create cards')}/>;}
  const pointer=(target:EventTarget,type:string,x:number,y:number,button=0)=>{const event=new dom.window.MouseEvent(type,{bubbles:true,button,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);};
  const press=async(target:EventTarget,x:number,y:number)=>act(async()=>{pointer(target,'pointerdown',x,y);pointer(document,'pointerup',x,y);});
  const anchor=(id:string,side:string)=>document.querySelector(`[data-anchor-card="${id}"][data-anchor-side="${side}"]`)!;
  const hover=async(x:number,y:number)=>act(async()=>{pointer(document,'pointermove',x,y);await new Promise(r=>setTimeout(r,25));});
  const pressAnchor=async(id:string,side:string,x:number,y:number)=>{await hover(x,y);await press(anchor(id,side),x,y);};
  try{
    await act(async()=>root.render(<Harness/>));
    await hover(340,140);assert.equal(document.querySelectorAll('.board-placement.selected').length,0,'drawing can start without selecting an element');assert.equal(document.querySelectorAll('.edge-keyboard-anchor').length,0,'idle Tab order remains limited to selected placements');
    await press(anchor('p0','right'),340,140);assert.equal(writes,0);
    assert.equal(document.querySelectorAll('.edge-anchor').length,1,'the larger reveal reaches the facing destination before snapping');
    await hover(500,140);assert.equal(document.querySelectorAll('[data-anchor-visible=true]').length,3,'only destination anchors inside the radius appear');
    await press(anchor('p1','left'),500,140);assert.equal(current.edges.length,1);assert.equal(current.edges[0].fromSide,'right');assert.equal(current.edges[0].toSide,'left');
    assert.deepEqual(edgeStyle(current.edges[0]),{strokeColor:'#80aaa6',strokeWidth:4,strokeStyle:'dashed',fromArrowhead:'arrow',toArrowhead:'arrow',labelSize:18},'new edges copy the complete cached style');
    assert.equal(current.edges[0].label,undefined);
    assert.match(document.querySelector('.edge-stroke')!.getAttribute('d')!,/ C /);
    assert.equal(document.querySelector('.edge-layer')!.closest('.board-world'),null,'vectors must not be raster-scaled with the card layer');
    const stroke=document.querySelector('.edge-stroke')!,path=stroke.getAttribute('d');
    await act(async()=>{document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();await new Promise(r=>setTimeout(r,25));});
    assert.equal(document.querySelector('.edge-stroke'),stroke,'zoom retains the same path node');assert.equal(stroke.getAttribute('d'),path,'zoom leaves world geometry unchanged');
    assert.match(document.querySelector('.edge-camera')!.getAttribute('transform')!,/scale\(1.1\)/);
    await act(async()=>{document.querySelector('.canvas')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'0',ctrlKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,25));});
    await act(async()=>{pointer(document.querySelector('[aria-label="End endpoint"]')!,'pointerdown',500,140);pointer(document,'pointermove',1000,140);pointer(document,'pointerup',1000,140);});
    assert.equal(current.edges[0].to,'p2','endpoint can reconnect to a whiteboard tile');
    await press(document.querySelector('[data-placement="p1"]')!,600,100);
    await act(async()=>{pointer(anchor('p1','right'),'pointerdown',840,140);pointer(document,'pointermove',1100,20);pointer(document,'pointerup',1100,20);});
    assert.equal(current.edges.length,2,'drag-to-body creates a second edge');assert.equal(current.edges[1].toSide,'top');
    await press(document.querySelector('[data-placement="p1"]')!,600,100);
    await press(anchor('p1','top'),670,0);await press(document.querySelector('[data-placement="p1"]')!,670,280);
    assert.equal(writes,3,'clicking the source body does not create a self-edge');
    await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('.edge-handles')!.classList.contains('connecting'),false);assert.equal(writes,3);
    await press(document.querySelector('.edge-hit')!,420,140);
    await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true})));
    assert.equal(current.edges.length,1);
    const original=current.edges[0];
    await press(document.querySelector('[data-placement="p1"]')!,600,100);
    await press(anchor('p1','right'),840,140);await pressAnchor('p2','top',1170,0);
    assert.equal(current.edges.length,2,'a repeated pair and identical anchors create a distinct edge');
    assert.deepEqual(current.edges[0],original,'creating another relationship leaves its sibling unchanged');
    await press(document.querySelector('[data-placement="p2"]')!,1100,100);
    await press(anchor('p2','top'),1170,0);await pressAnchor('p1','right',840,140);
    assert.equal(current.edges.length,3,'reversed connections also remain distinct');
    assert.equal(new Set(current.edges.map(e=>e.id)).size,3);
    const reversed=current.edges[2].id;
    for(const [x,to] of [[340,'p0'],[840,'p1']] as const){
      await act(async()=>{pointer(document.querySelector('[aria-label="End endpoint"]')!,'pointerdown',x===340?840:340,140);pointer(document,'pointermove',x,140);pointer(document,'pointerup',x,140);});
      assert.equal(current.edges.length,3);assert.equal(current.edges.find(e=>e.id===reversed)!.to,to,'reconnection allows a pair that already has other edges');
    }
    await act(async()=>document.querySelector('.canvas')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Delete',bubbles:true})));
    assert.equal(current.edges.length,2);assert.ok(current.edges.every(e=>e.id!==reversed),'deleting one edge preserves its siblings');
    assert.deepEqual(errors,[]);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});

test('Style View groups mixed selections by type and scopes each section to its own items',async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  let board:Board={path:'b.whiteboard',folder:'',name:'B',revision:'r',cards:[{id:'a',cardId:'a',x:0,y:0,width:300,height:200},{id:'b',cardId:'b',x:500,y:0,width:300,height:200,folder:'Child'}],edges:[{id:'e',from:'a',to:'b',strokeColor:'#e03131'}]};
  let saved:Board|undefined,fill:{ids:string[];color:string|undefined}|undefined;
  const session={board:async(b:Board)=>{saved=b;board=b;},fillCards:async(ids:string[],color:string|undefined,b?:Board)=>{fill={ids,color};if(b)saved=b;}} as Pick<Session,'board'|'fillCards'>;
  const root=createRoot(document.getElementById('root')!);
  const render=async(cards:string[],edges:string[])=>act(async()=>root.render(<StyleView board={board} selection={{path:board.path,cards,edges}} session={session}/>));
  const labels=()=>[...document.querySelectorAll('legend')].map(n=>n.textContent);
  try{
    await render(['a','b'],['e']);
    assert.equal(document.querySelectorAll('select').length,0);
    const groups=()=>[...document.querySelectorAll<HTMLElement>('.style-group')];
    assert.deepEqual(groups().map(g=>g.getAttribute('aria-label')),['Cards · 1 selected','Whiteboards · 1 selected','Edges · 1 selected']);
    assert.deepEqual(labels(),['Fill color','Color','Line color','Arrows','Arrowhead style','Line style','Line width','Font size']);
    const beforeCards=board.cards;
    await act(async()=>groups()[2].querySelector<HTMLButtonElement>('[aria-label="Sage"]')!.click());
    assert.equal(board.edges[0].strokeColor,'#91aa8b');assert.deepEqual(board.cards,beforeCards);
    assert.equal(fill,undefined,'edge controls never write source card metadata');
    await render(['a','b'],['e']);
    assert.equal(document.querySelector<HTMLElement>('[aria-label="Rose"] span')!.style.background,'rgb(201, 131, 138)','swatches show the palette color without the dark card tint');
    assert.ok(!document.body.textContent?.includes('Mixed'));
    await act(async()=>{groups()[0].querySelector<HTMLButtonElement>('[aria-label="Lavender"]')!.click();});
    assert.deepEqual(fill,{ids:['a'],color:'#a699c3'},'card color targets its source file');
    assert.equal(saved!.edges[0].strokeColor,'#91aa8b','fill changes never recolor edges');assert.equal(saved!.cards[1].fillColor,undefined,'source card controls do not style whiteboards');
    await act(async()=>groups()[1].querySelector<HTMLButtonElement>('[aria-label="Lavender"]')!.click());assert.equal(saved!.cards[1].fillColor,'#a699c3','whiteboard color has its own scoped control');
    assert.deepEqual(saved?.cards[0],board.cards[0],'card placement decoration is untouched');
    for(const [ids,titles] of [[['a'],['Cards · 1 selected']],[['b'],['Whiteboards · 1 selected']],[['a','b'],['Cards · 1 selected','Whiteboards · 1 selected']]] as const){await render([...ids],[]);assert.deepEqual(labels(),titles.map(title=>title.startsWith('Cards')?'Fill color':'Color'));assert.deepEqual(groups().map(g=>g.getAttribute('aria-label')),[...titles]);}
    await render([],['e']);
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Sage"]')!.click());
    assert.equal(saved!.edges[0].strokeColor,'#91aa8b');assert.deepEqual(saved!.cards,board.cards);
    assert.ok(document.querySelector('[aria-label="4 px"] svg'),'edge thickness keeps its visual buttons');
    assert.deepEqual([...document.querySelectorAll('[aria-label="Line width"] button')].map(b=>b.getAttribute('aria-label')),['1 px','2 px','4 px']);
    assert.ok(labels().includes('Arrows'));
    assert.equal(document.querySelector('[aria-label="Line style"] [aria-label="None"]'),null);
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="4 px"]')!.click());
    assert.equal(saved?.edges[0].strokeWidth,4);assert.deepEqual(saved?.cards,board.cards);
    const toggle=async(name:string)=>{await act(async()=>document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!.click());await render([],['e']);};
    await toggle('Start arrow');assert.equal(board.edges[0].fromArrowhead,'arrow');
    await toggle('End arrow');assert.equal(board.edges[0].toArrowhead,'arrow');assert.equal(board.edges[0].fromArrowhead,'arrow','both ends can be enabled');
    await toggle('Start arrow');assert.equal(board.edges[0].fromArrowhead,'none');assert.equal(board.edges[0].toArrowhead,'arrow');
    await toggle('End arrow');assert.equal(board.edges[0].toArrowhead,'none','both ends can be disabled');
    assert.ok([...document.querySelectorAll<HTMLButtonElement>('[aria-label="Arrowhead style"] button')].every(b=>b.disabled),'shape controls never enable an arrow implicitly');
    await toggle('End arrow');
    await toggle('Filled triangle');assert.equal(board.edges[0].toArrowhead,'triangle');assert.equal(board.edges[0].fromArrowhead,'none');
    await toggle('Start arrow');assert.equal(board.edges[0].fromArrowhead,'triangle','a newly enabled end adopts the other end’s shape');
    await toggle('Outlined triangle');assert.equal(board.edges[0].fromArrowhead,'triangle-outline');assert.equal(board.edges[0].toArrowhead,'triangle-outline');
    await toggle('Open arrow');assert.equal(board.edges[0].fromArrowhead,'arrow');assert.equal(board.edges[0].toArrowhead,'arrow');
    await toggle('Start arrow');await toggle('End arrow');
    board={...board,edges:[board.edges[0],{...board.edges[0],id:'e2',fromArrowhead:'triangle',strokeColor:'#ffffff',strokeWidth:8}]};await render([],['e','e2']);
    assert.equal(document.querySelectorAll('[aria-label="Arrows"] [aria-pressed=true]').length,0,'mixed directions leave both buttons unpressed');
    assert.ok(!document.body.textContent?.includes('Mixed'));
    assert.equal(document.querySelectorAll('.style-color [aria-pressed=true]').length,0);
    assert.equal(document.querySelectorAll('[aria-label="Line width"] [aria-pressed=true]').length,0);
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Start arrow"]')!.click());
    assert.deepEqual(board.edges.map(e=>e.fromArrowhead),['arrow','triangle'],'a mixed toggle enables absent arrows and preserves existing shapes');
    assert.equal(board.edges[1].strokeWidth,8,'non-preset saved widths remain unchanged');
    await render([],['e','e2']);
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Outlined triangle"]')!.click());
    assert.ok(board.edges.every(e=>e.fromArrowhead==='triangle-outline'&&e.toArrowhead==='none'),'shape changes apply to enabled ends only across a selection');
    board={...board,edges:[board.edges[0],{...board.edges[1],toArrowhead:'triangle'}]};await render([],['e','e2']);
    assert.equal(document.querySelectorAll('[aria-label="Arrows"] [aria-pressed=true]').length,0,'even a shared start arrow is unpressed when complete directions differ');
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="End arrow"]')!.click());
    assert.ok(board.edges.every(e=>e.fromArrowhead==='none'&&e.toArrowhead!=='none'),'choosing end from mixed directions replaces the complete direction for every selected edge');
    assert.deepEqual(board.edges.map(e=>e.toArrowhead),['triangle-outline','triangle'],'direction changes preserve each edge’s arrowhead style');
    assert.equal(board.edges[1].strokeWidth,8);
    await render([],['e','e2']);
    assert.equal(document.querySelector('[aria-label="Start arrow"]')!.getAttribute('aria-pressed'),'false');
    assert.equal(document.querySelector('[aria-label="End arrow"]')!.getAttribute('aria-pressed'),'true');
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Start arrow"]')!.click());
    assert.ok(board.edges.every(e=>e.fromArrowhead!=='none'&&e.toArrowhead!=='none'),'after resolving mixed directions the two toggles remain independent');
    board={...board,cards:board.cards.map(p=>({...p,folder:undefined})),edges:[...board.edges,{...board.edges[0],id:'e3'}]};
    await render(['a','b'],['e','e2','e3']);
    assert.deepEqual(groups().map(g=>g.getAttribute('aria-label')),['Cards · 2 selected','Edges · 3 selected']);
    assert.equal(document.querySelector('[aria-label="Label"]'),null,'multiple edges have no single label editor');
    await render([],[]);assert.deepEqual(labels(),[],'canvas and mention appearance are theme-controlled');
    const mentionSwitch=document.querySelector<HTMLInputElement>('input[role=switch]')!;
    assert.equal(mentionSwitch.labels?.[0].textContent,'Show mention links');assert.equal(mentionSwitch.checked,true);
    await act(async()=>mentionSwitch.click());assert.equal(board.showMentions,false);
    await render([],[]);assert.equal(document.querySelector<HTMLInputElement>('input[role=switch]')!.checked,false);
    assert.equal(groups().length,0);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});


test('Style separates card, plain Text, shapes, images and edges, including mixed text sizes',async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const placement={x:0,y:0,width:300,height:200};let board:Board={path:'b.whiteboard',folder:'',name:'B',revision:'r',cards:[
    {...placement,id:'card',cardId:'source'},
    {...placement,id:'plain',cardId:'',fillColor:'#8aa5c5',object:{type:'text',shape:'none',text:'Plain',fontSize:20}},
    {...placement,id:'shape',cardId:'',fillColor:'#91aa8b',object:{type:'text',shape:'rounded',text:'Shape',fontSize:30}},
    {...placement,id:'image',cardId:'',object:{type:'image',html:'<div data-better-edit-image="placeholder"></div>'}},
  ],edges:[{id:'e',from:'card',to:'plain'}]};let filled:string[]=[];
  const session={board:async(b:Board)=>{board=b;},fillCards:async(ids:string[])=>{filled=ids;}} as Pick<Session,'board'|'fillCards'>,root=createRoot(document.getElementById('root')!);
  const render=async(ids=board.cards.map(p=>p.id))=>act(async()=>root.render(<StyleView board={board} selection={{path:board.path,cards:ids,edges:['e']}} session={session}/>));
  const group=(name:string)=>document.querySelector<HTMLElement>(`.style-group[aria-label="${name}"]`)!;
  try{
    await render();assert.deepEqual([...document.querySelectorAll('.style-group')].map(g=>g.getAttribute('aria-label')),['Cards · 1 selected','Text · 2 selected','Images · 1 selected','Edges · 1 selected']);
    assert.equal(group('Images · 1 selected').querySelector('fieldset,input'),null);
    const size=()=>group('Text · 2 selected').querySelector('[aria-label="Font size"]')!;
    assert.equal(size().querySelectorAll('[aria-pressed=true]').length,0,'mixed and legacy sizes are not converted on selection');
    assert.equal(group('Text · 2 selected').querySelector('input[type=number]'),null);
    const edgeSize=()=>group('Edges · 1 selected').querySelector('[aria-label="Font size"]')!;
    assert.deepEqual([...size().querySelectorAll('button')].map(b=>b.textContent),['S','M','L','XL']);
    assert.deepEqual([...edgeSize().querySelectorAll('button')].map(b=>b.textContent),['S','M','L','XL']);
    await act(async()=>size().querySelector<HTMLButtonElement>('[aria-label="L"]')!.click());assert.deepEqual(board.cards.flatMap(p=>p.object?.type==='text'?[p.object.fontSize]:[]),['l','l']);assert.equal(board.edges[0].labelSize,undefined);
    await render();assert.equal(size().querySelector('[aria-pressed=true]')?.textContent,'L');
    await act(async()=>edgeSize().querySelector<HTMLButtonElement>('[aria-label="L"]')!.click());assert.equal(board.edges[0].labelSize,'l');assert.deepEqual(board.cards.flatMap(p=>p.object?.type==='text'?[p.object.fontSize]:[]),['l','l']);
    await render();await act(async()=>group('Text · 2 selected').querySelector<HTMLButtonElement>('[aria-label="Text color"] [aria-label="Rose"]')!.click());
    assert.ok(board.cards.filter(p=>p.object?.type==='text').every(p=>p.object?.type==='text'&&p.object.textColor==='#c9838a'));assert.equal(board.edges[0].strokeColor,undefined);
    await render();await act(async()=>group('Cards · 1 selected').querySelector<HTMLButtonElement>('[aria-label="Sage"]')!.click());assert.deepEqual(filled,['source']);
    assert.equal(group('Text · 2 selected').querySelector('[aria-label="Fill color"]'),null,'Text has no fill editor');
    await act(async()=>group('Text · 2 selected').querySelector<HTMLButtonElement>('[aria-label="Line color"] [aria-label="Rose"]')!.click());assert.equal(board.cards[1].strokeColor,undefined);assert.equal(board.cards[2].strokeColor,'#c9838a');assert.equal(board.cards[1].fillColor,'#8aa5c5');assert.equal(board.cards[2].fillColor,'#91aa8b','editing a border preserves the saved fill');
    await render(['card','plain']);const text=group('Text · 1 selected');assert.equal(text.querySelector('[aria-label="Shape appearance"]'),null);assert.deepEqual([...text.querySelectorAll('legend')].map(n=>n.textContent),['Text color','Font size','Shape']);
    await act(async()=>text.querySelector<HTMLButtonElement>('[aria-label="Rectangle"]')!.click());await render(['card','plain']);assert.ok(group('Text · 1 selected').querySelector('[aria-label="Line color"]'));assert.equal(board.cards[1].object?.type==='text'&&board.cards[1].object.shape,'rounded');assert.equal(group('Text · 1 selected').querySelector('[aria-label="Rounded rectangle"]'),null);assert.equal(board.cards[1].fillColor,'#8aa5c5');assert.equal(group('Cards · 1 selected').querySelector('[aria-label="Line color"]'),null);assert.deepEqual(readBoard(board.path,writeBoard(board)).cards.filter(p=>p.object),board.cards.filter(p=>p.object),'both fill and border data survive the restricted UI');
  }finally{await act(async()=>root.unmount());dom.window.close();}
});


test('last edited edge style is cached per workspace, survives restart, and ignores moves, labels and failed saves',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-edge-defaults-')),root=join(dir,'notes'),cache=join(dir,'cache');await fs.mkdir(root);
  let w=await Workspace.open(root,cache);t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Ideas');await w.create('Ideas','a',0,0);await w.create('Ideas','b',500,0);
  let board=w.snapshot().boards.find(b=>b.folder==='Ideas')!;
  board=(await w.saveBoard({...board,edges:[{id:'e',from:board.cards[0].id,to:board.cards[1].id,toArrowhead:'arrow'}]},board.revision)).snapshot.boards.find(b=>b.folder==='Ideas')!;
  const styled={...board,edges:[{...board.edges[0],strokeColor:'#80aaa6',strokeWidth:4,strokeStyle:'dashed' as const,fromArrowhead:'arrow' as const,toArrowhead:'arrow' as const,labelSize:'l' as const,label:'Do not copy me'}]};
  const result=await w.saveBoard(styled,board.revision),expected=edgeStyle(styled.edges[0]);
  assert.deepEqual(result.snapshot.lastEdgeStyle,expected);assert.ok(!('label' in expected));assert.ok(!('from' in expected));
  board=result.snapshot.boards.find(b=>b.folder==='Ideas')!;
  await assert.rejects(w.saveBoard({...board,edges:[{...board.edges[0],strokeWidth:8}]},'stale'));
  assert.deepEqual(w.snapshot().lastEdgeStyle,expected,'failed saves cannot change defaults');
  board=(await w.saveBoard({...board,cards:board.cards.map(p=>({...p,x:p.x+10})),edges:[{...board.edges[0],label:'New label',toSide:'top'}]},board.revision)).snapshot.boards.find(b=>b.folder==='Ideas')!;
  assert.deepEqual(w.snapshot().lastEdgeStyle,expected,'geometry and label text do not change defaults');
  const colored=await w.setFill([],null,{value:{...board,edges:[{...board.edges[0],strokeColor:undefined}]},expected:board.revision});
  assert.equal(colored.snapshot.lastEdgeStyle?.strokeColor,undefined,'Theme also replaces the cached color');
  assert.equal(colored.snapshot.lastEdgeStyle?.strokeWidth,4,'a color edit remembers the complete resulting style');
  w.close();w=await Workspace.open(root,cache);assert.deepEqual(w.snapshot().lastEdgeStyle,{...expected,strokeColor:undefined});
  const otherRoot=join(dir,'other');await fs.mkdir(otherRoot);const other=await Workspace.open(otherRoot,join(dir,'other-cache'));
  try{assert.equal(other.snapshot().lastEdgeStyle,undefined,'workspaces do not share defaults');}finally{other.close();}
});


test('facing edge curves stay inside their gap for deep sibling fans in every direction',async()=>{
 const {curve}=await import('../src/renderer/edge-geometry');
 for(const gap of [0,1,20,74,400])for(const offset of [-800,-100,0,100,800])for(const side of ['right','left','top','bottom'] as const){
  const horizontal=side==='right'||side==='left',sign=side==='right'||side==='bottom'?1:-1,opposite={right:'left',left:'right',top:'bottom',bottom:'top'} as const;
  const start={x:100,y:200},end={x:100+(horizontal?sign*gap:offset),y:200+(horizontal?offset:sign*gap)},geometry=curve(start,end,side,opposite[side]),axis=horizontal?'x':'y';
  let previous=0;for(const point of geometry.samples){const distance=(point[axis]-start[axis])*sign;assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));assert.ok(distance>=previous-1e-8&&distance<=gap+1e-8,'the curve progresses toward the child without overshoot');previous=distance;}
  assert.deepEqual(geometry.samples[0],start);assert.deepEqual(geometry.samples.at(-1),end);
 }
 const backward=curve({x:100,y:0},{x:0,y:300},'right','left');assert.ok(backward.samples.some(p=>p.x>100),'backward connections retain room to turn');
 const sameSide=curve({x:0,y:0},{x:0,y:300},'right','right');assert.ok(sameSide.samples.some(p=>p.x>0),'same-side manual connections keep their outside curve');
});


test('arrowheads have a continuous straight shaft in deep fans, with bounded leads and unchanged anchors',async()=>{
 const {curve,edgeGeometry,anchor,opposite}=await import('../src/renderer/edge-geometry');
 for(const side of ['right','left','top','bottom'] as const)for(const width of [.5,1,2,4,8])for(const head of ['arrow','triangle','triangle-outline'] as const){
  const horizontal=side==='right'||side==='left',sign=side==='right'||side==='bottom'?1:-1,start={x:100,y:200},end={x:100+(horizontal?sign*400:800),y:200+(horizontal?800:sign*400)};
  const g=curve(start,end,side,opposite[side],{strokeWidth:width,fromArrowhead:head,toArrowhead:head}),first=g.samples[1],last=g.samples.at(-2)!;
  assert.equal(horizontal?first.y:first.x,horizontal?start.y:start.x);assert.equal(horizontal?last.y:last.x,horizontal?end.y:end.x);
  assert.ok(Math.abs(Math.hypot(first.x-start.x,first.y-start.y)-width*10)<1e-8);assert.ok(Math.abs(Math.hypot(last.x-end.x,last.y-end.y)-width*10)<1e-8);
  assert.match(g.path,/ L /);assert.ok(g.path.endsWith(`L ${end.x} ${end.y}`));assert.deepEqual(g.samples[0],start);assert.deepEqual(g.samples.at(-1),end);
 }
 for(const gap of [0,1,16,66,74])for(const width of [.5,2,8])for(const dy of [-800,0,336,800]){
  const start={x:0,y:0},end={x:gap,y:dy},g=curve(start,end,'right','left',{strokeWidth:width,fromArrowhead:'arrow',toArrowhead:'arrow'});
  let x=0;for(const p of g.samples){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x>=x-1e-8&&p.x<=gap+1e-8,'tight gaps remain monotone instead of looping outside their anchors');x=p.x;}
 }
 const a={id:'a',cardId:'',x:0,y:0,width:70,height:28,object:{type:'text' as const,text:'original',shape:'none' as const}},b={...a,id:'b',x:152,y:336},edge:Edge={id:'e',from:'a',to:'b',fromSide:'right',toSide:'left',toArrowhead:'arrow',strokeWidth:2};
 const g=edgeGeometry(edge,a,b,p=>p.height);assert.deepEqual(g.start,anchor(a,'right',28));assert.deepEqual(g.end,anchor(b,'left',28));assert.equal(g.samples.at(-2)!.y,g.end.y);assert.equal(g.end.x-g.samples.at(-2)!.x,20,'the reported short, deep branch gets a full 20-unit approach');
 const bare=curve(g.start,g.end,'right','left');assert.ok(!bare.path.includes(' L '),'edges without arrowheads retain the original cubic');
});


test('selected edge endpoints share zoom-aware proximity hints and retain pointer and keyboard reconnection',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true}),win=dom.window;
 Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const frames=new Map<number,FrameRequestCallback>();let number=0;win.requestAnimationFrame=callback=>{frames.set(++number,callback);return number;};win.cancelAnimationFrame=id=>{frames.delete(id);};
 const step=async()=>act(async()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(0);});
 const {Edges}=await import('../src/renderer/Edges'),{BOARD_CAMERA_EVENT,zoomAt}=await import('../src/renderer/navigation');
 const board:Board={path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[0,1,2].map(i=>({id:'p'+i,cardId:'c'+i,x:i*500,y:0,width:340,height:280})),edges:[{id:'edge',from:'p0',to:'p1',fromSide:'right',toSide:'left'}]};
 const viewport=createRef<HTMLDivElement>(),saved:Board[]=[],camera={x:0,y:0,zoom:1},root=createRoot(document.getElementById('root')!);
 const pointer=(target:EventTarget,type:string,x:number,y=140)=>{const event=new win.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);};
 const hover=async(x:number,y=140)=>{await act(async()=>pointer(document,'pointermove',x,y));await step();};
 const endpoints=()=>[...document.querySelectorAll('[data-anchor-visible=true][data-edge-endpoint]')].map(n=>n.getAttribute('data-edge-endpoint')).sort();
 const key=(target:Element)=>target.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 try{
  const render=async(selectedEdges:string[])=>act(async()=>root.render(<div ref={viewport}><Edges board={board} mentions={[]} heightOf={p=>p.height} camera={()=>camera} viewport={viewport} selectedCards={['p0','p1']} selectedEdges={selectedEdges} enabled onSelect={()=>{}} onSave={next=>saved.push(next)} onFinish={()=>{}} onStyle={()=>{}}/></div>));
  await render([]);await hover(500);assert.deepEqual(endpoints(),[],'unselected edges never contribute reconnection handles');assert.ok(document.querySelector('[data-anchor-visible=true][data-anchor-card="p1"][data-anchor-side="left"]'));assert.equal(document.querySelector('.edge-anchor-hint:last-child .edge-anchor')!.getAttribute('data-anchor-card'),'p1','the nearest overlapping element anchor receives the pointer');
  await hover(518);assert.ok([...document.querySelectorAll('.edge-anchor-hint')].every(n=>n.classList.contains('over-body')),'element targets yield to card bodies without hiding their dots');
  await render(['edge']);await hover(500);const shared=[...document.querySelectorAll('[data-anchor-visible=true][cx="500"][cy="140"]')];assert.equal(shared.at(-1)!.getAttribute('data-edge-endpoint'),'to','a selected edge endpoint is painted and hit-tested above the selected placement anchor');
  await hover(518);assert.ok(!document.querySelector('[data-anchor-visible=true][data-edge-endpoint="to"]')!.parentElement!.classList.contains('over-body'),'selected edge handles keep priority inside a card body');
  await hover(1400);assert.deepEqual(endpoints(),[]);assert.equal(document.querySelectorAll('.edge-keyboard-anchor[data-edge-endpoint]').length,2,'distant endpoints remain keyboard accessible');
  await hover(800);assert.deepEqual(endpoints(),['to']);assert.ok(document.querySelector('[data-anchor-visible=true]')!.parentElement!.style.getPropertyValue('--connector-strength'));
  const path=document.querySelector('.edge-stroke')!,geometry=path.getAttribute('d');
  camera.zoom=2;await act(async()=>viewport.current!.dispatchEvent(new win.Event(BOARD_CAMERA_EVENT)));await step();assert.deepEqual(endpoints(),['from','to'],'zoom refreshes the radius and world cursor without another pointer event');assert.equal(path.getAttribute('d'),geometry);
  Object.assign(camera,{x:0,y:0,zoom:1});await hover(420);assert.deepEqual(endpoints(),['from','to']);
  const strengths=()=>[...document.querySelectorAll<SVGElement>('.edge-anchor-hint')].map(n=>Number(n.style.getPropertyValue('--connector-strength'))),before=strengths();
  for(const zoom of [.2,.5,1,2,3]){
   Object.assign(camera,zoomAt(camera,420,140,zoom));await act(async()=>viewport.current!.dispatchEvent(new win.Event(BOARD_CAMERA_EVENT)));await step();
   assert.deepEqual(endpoints(),['from','to'],'zooming around a stationary cursor preserves the connector set');assert.ok(strengths().every((s,i)=>Math.abs(s-before[i])<1e-12),'distance strength stays stable across zoom');assert.equal(path.getAttribute('d'),geometry);
  }
  Object.assign(camera,{x:0,y:0,zoom:1});
  await hover(500);const end=document.querySelector('[data-anchor-visible=true][data-edge-endpoint="to"]')!;
  await act(async()=>{pointer(end,'pointerdown',518);pointer(document,'pointermove',982);pointer(document,'pointerup',982);});assert.equal(saved.length,1);assert.equal(saved[0].edges[0].to,'p2');assert.equal(saved[0].edges[0].id,'edge');assert.equal(saved[0].edges[0].toSide,'left','dropping 18 screen pixels outside the card snaps to its connector');
  await hover(800);const keyboardEnd=document.querySelector('.edge-keyboard-anchor[data-edge-endpoint="to"]')!;await act(async()=>key(keyboardEnd));assert.equal(keyboardEnd.isConnected,true,'focused endpoints survive keyboard-started reconnection');
  await act(async()=>key(document.querySelector('.edge-keyboard-anchor[data-anchor-card="p2"][data-anchor-side="left"]')!));assert.equal(saved.length,2);assert.equal(saved[1].edges[0].to,'p2');assert.equal(saved[1].edges.length,1);
 }finally{await act(async()=>root.unmount());win.close();}
});
