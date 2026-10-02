import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
// DOMPurify retains its renderer window across these tests.
const windows:JSDOM[]=[];
after(()=>windows.forEach(dom=>dom.window.close()));
import {act} from 'react';
import type {Snapshot,Bridge,ViewResults} from '../src/shared';
import {tintColor} from '../src/colors';
import {Session} from '../src/renderer/session';
import {writeViewBlock,newViewBlock,parseViewBlock} from '../src/view-block';

test('editable view blocks render without changing Markdown, commit group edits and preserve source through focus changes',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,matchMedia:()=>({matches:true}),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 const snapshot:Snapshot={root:'/test',name:'Test',cards:[],boards:[],tags:[],issues:[],historyAvailable:false};let requests=0;
 const bridge={assetUrl:(s:string)=>s,request:async()=>{requests++;return {rows:[],total:0} satisfies ViewResults;}} as unknown as Bridge;window.door=bridge;
 const {createRoot}=await import('react-dom/client');
 const session=new Session(bridge),{ViewBlockProvider,ViewBlock}=await import('../src/renderer/ViewBlock'),{CardEditor}=await import('../src/renderer/Editor'),{TitleContent}=await import('../src/renderer/TitleContent'),{preview}=await import('../src/renderer/markdown');
 const definition=newViewBlock();definition.views[0].filter={all:[{any:[{field:'file.text',op:'contains',value:'one'},{field:'file.text',op:'contains',value:'two'}]}]};
 let body='# Query card\n\n```view-block\n'+writeViewBlock('',definition)+'```\n\n```js\nconst x = 1;\n```\n',writes=0;const root=createRoot(document.getElementById('root')!);
 const render=(editable=true)=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}>{editable?<CardEditor path="note.md" body={body} cards={[]} onEdit={value=>{body=value;writes++;}}/>:<TitleContent html={preview(body,'note.md')}/>}</ViewBlockProvider>);
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,130));});
 const click=async(selector:string)=>{const element=document.querySelector<HTMLElement>(selector);assert.ok(element,selector);await act(async()=>element.click());};
 try{
   await act(async()=>render());await settle();assert.equal(writes,0);assert.equal(document.querySelectorAll('.view-block').length,1);assert.ok(document.querySelector('[data-node-view-content][hidden]'),'the YAML source must not render above the block');assert.ok(document.querySelector('pre')?.textContent?.includes('const x = 1;'));
   await click('.view-toolbar button:nth-last-child(3)'); // Filter, before Sort and More
   assert.ok(document.querySelector('.view-rule-group .view-group-heading [aria-label="Remove group"]'));
   await click('[aria-label="Remove group"]');assert.equal(document.querySelector('.view-rule-group'),null);
   await click('.view-popup-footer button');await settle();assert.equal(writes,1);assert.ok(body.includes('```view-block'));assert.ok(body.includes('const x = 1;'));const raw=body.split('```view-block\n')[1].split('```')[0];assert.deepEqual(parseViewBlock(raw).views[0].filter,{all:[]});
   const before=body;await act(async()=>render(false));await settle();assert.equal(document.querySelectorAll('.view-block').length,1);assert.equal(document.querySelector('.view-toolbar [aria-label="View options"]'),null);assert.equal(writes,1);assert.equal(body,before);
   await act(async()=>render());await settle();assert.equal(writes,1);assert.ok(requests>=2);
   const broken=writeViewBlock('',{...newViewBlock(),views:[{id:'broken',name:'Broken',type:'table'},{id:'good',name:'Good',type:'list'}]}).replace('name: Broken','name: {unexpected: value}');
   await act(async()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}><ViewBlock source={broken} onChange={()=>{writes++;}}/></ViewBlockProvider>));await settle();
   assert.match(document.querySelector('[role="alert"]')?.textContent??'',/supported layout/);assert.equal(writes,1);
   await click('[role="tab"]:last-child');await settle();assert.equal(document.querySelector('[role="alert"]'),null);assert.ok(document.querySelector('.view-list'));assert.equal(writes,1);
   const unknown=writeViewBlock('',{...newViewBlock(),views:[{id:'table',name:'Table',type:'table',filter:{field:'project/Typo',op:'eq',value:'value'}}]});
   await act(async()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}><ViewBlock source={unknown} onChange={()=>{writes++;}}/></ViewBlockProvider>));await settle();
   await click('.view-toolbar button:nth-last-child(3)');await click('[aria-label="Find a property…"]');
   await click('[role="option"][aria-selected="true"]');assert.ok(document.querySelector('.view-condition'));assert.equal(writes,1);

 }finally{await act(async()=>root.unmount());}
});

test('compact subpanels keep anchors, table values edit and Kanban properties open the card',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,matchMedia:()=>({matches:true}),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 const snapshot:Snapshot={root:'/test',name:'Test',cards:[{id:'a',path:'A.md',name:'A',title:'Task A',fillColor:'#c9838a',revision:'r1',legacy:false}],boards:[],issues:[],historyAvailable:false,tags:['project','task'].map(tag=>({path:tag+'.tag',name:tag,tag,revision:'r',inherits:[],overrides:[],fields:[{key:'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:['Doing'],done:['Done']}},{key:'Date',type:'date'},{key:'Location',type:'text'},{key:'Checked',type:'boolean'}]}))};
 const row:ViewResults['rows'][number]={card:snapshot.cards[0],properties:{tags:['project','task'],'project/Status':'Todo','task/Status':'Todo','project/Date':'2026-10-01','project/Location':'Here','task/Location':'There'}};
 let queries=0,opened=0,previewed=0;const writes:{key:string;value:unknown}[]=[];
 const session=new Session({request:async request=>{if(request.kind==='viewCards'){queries++;return {rows:[row],total:1};}throw new Error(request.kind);}} as Bridge);session.state.snapshot=snapshot;
 session.setViewProperty=async(_path,_revision,key,value)=>{writes.push({key,value});row.properties={...row.properties,...Object.fromEntries(['project','task'].map(tag=>[tag+'/'+key.split('/')[1],value]))};};
 const {createRoot}=await import('react-dom/client'),{ViewBlock,ViewBlockProvider}=await import('../src/renderer/ViewBlock');const root=createRoot(document.getElementById('root')!);
 const block=newViewBlock('project');block.views[0].fields=['file.title','project/Status','project/Date','project/Location','project/Checked'];let source=writeViewBlock('',block);
 const render=()=>root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{opened++;}} onPreview={()=>{previewed++;}}><ViewBlock source={source} onChange={next=>{source=next;render();}}/></ViewBlockProvider>);
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,140));});
 const click=async(selector:string)=>{const el=document.querySelector<HTMLElement>(selector);assert.ok(el,selector);await act(async()=>el.click());};
 const textClick=async(text:string)=>{const el=[...document.querySelectorAll<HTMLButtonElement>('.property-popover button')].find(el=>el.textContent===text);assert.ok(el,text);await act(async()=>el.click());};
 const escape=async()=>act(async()=>document.querySelector('.property-popover')?.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 try{
  await act(async()=>render());await settle();assert.equal(queries,1);
  const options=document.querySelector<HTMLElement>('[aria-label="View options"]')!;options.getBoundingClientRect=()=>({left:700,right:730,top:200,bottom:230,width:30,height:30,x:700,y:200,toJSON(){}});
  await click('[aria-label="View options"]');const anchored=document.querySelector<HTMLElement>('.property-popover')!.style.left;assert.equal(document.querySelectorAll('.view-menu-list button').length,5);
  await click('.view-menu-list button');assert.ok(document.querySelector('[data-kind=layout]'));assert.equal(document.querySelector<HTMLElement>('.property-popover')!.style.left,anchored);
  await textClick('Kanban');await settle();assert.equal(parseViewBlock(source).views[0].type,'kanban');await click('[aria-label=Back]');await click('.view-menu-list button:nth-child(3)');assert.ok(document.querySelector('[data-kind=group] [role=listbox]'));await escape();assert.equal(document.querySelector('.property-popover'),null);
  // Pointer down without a drag leaves the source unchanged; real movement uses the shared phantom.
  const card=()=>document.querySelector<HTMLElement>('[data-tag-column="Todo"] .view-result-card')!;
  assert.equal(card().style.background,tintColor('#c9838a'));
  const pointer=(target:Element|Document,type:string,x:number)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:40}));
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON(){}});
  document.querySelector<HTMLElement>('.view-kanban')!.getBoundingClientRect=()=>rect(0,0,120,300);
  document.querySelectorAll<HTMLElement>('[data-tag-column]').forEach((el,i)=>{el.getBoundingClientRect=()=>rect(i*40,0,38,300);});
  card().getBoundingClientRect=()=>rect(0,30,38,80);
  await act(async()=>{pointer(card(),'pointerdown',20);pointer(document,'pointerup',20);});assert.equal(writes.length,0);
  await act(async()=>{pointer(card(),'pointerdown',20);pointer(document,'pointermove',60);});assert.ok(document.querySelector('.drag-phantom'));await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(writes.length,0);assert.equal(document.querySelector('.drag-phantom'),null);
  await act(async()=>{pointer(card().querySelector('[data-property]')!,'pointerdown',20);pointer(document,'pointermove',80);pointer(document,'pointerup',80);});await settle();assert.deepEqual(writes[0],{key:'project/Status',value:'Done'});assert.ok(document.querySelector('[data-tag-column="Done"] .view-result-card'));assert.equal(opened,0);
  assert.equal(document.querySelector('.view-result-card [aria-label^="Edit "],.view-result-card input'),null,'Kanban properties have no editing controls');const saved=writes.length;await click('.view-result-card [data-property="project/Date"]');assert.equal(previewed,1);assert.equal(writes.length,saved);
  await click('[aria-label="View options"]');await click('.view-menu-list button');await textClick('Table');await escape();await settle();
  await click('[aria-label="Edit Status"]');await textClick('Todo');await settle();assert.equal(row.properties['task/Status'],'Todo');assert.equal(opened,0);
  const count=writes.length;await click('[aria-label="Edit Location"]');await act(async()=>document.querySelector<HTMLInputElement>('.view-property input')!.blur());await settle();assert.equal(writes.length,count,'Opening and blurring mixed values never writes');
  await click('[aria-label="Edit Location"]');await act(async()=>document.querySelector<HTMLInputElement>('.view-property input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await settle();assert.equal(row.properties['task/Location'],'Here','Explicit Enter applies the common value');
  await click('[aria-label="Edit Date"]');assert.equal(document.querySelectorAll('.date-calendar [role=gridcell]').length,42);const before=queries;await act(async()=>document.querySelector<HTMLButtonElement>('[data-date="2026-10-02"]')!.click());assert.equal(queries,before,'The result query waits for the date draft to commit');await escape();await settle();assert.equal(writes.length,count+1);assert.equal(row.properties['project/Date'],'2026-10-01');
  await click('[aria-label="Edit Date"]');await act(async()=>document.querySelector<HTMLButtonElement>('[data-date="2026-10-02"]')!.click());await act(async()=>document.querySelector<HTMLInputElement>('.date-input-row input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await settle();assert.equal(row.properties['task/Date'],'2026-10-02');
  await click('.view-property input[type=checkbox]');await settle();assert.equal(row.properties['project/Checked'],true);assert.equal(row.properties['task/Checked'],true);
  row.properties['task/Status']='Done';await act(async()=>render());await click('[aria-label="View options"]');await click('.view-menu-list button');await textClick('Kanban');await escape();await settle();assert.equal(document.querySelectorAll('.view-result-card').length,2);
  await click('[data-tag-column=Todo] [data-property="project/Location"]');assert.equal(previewed,2);assert.equal(document.querySelector('.view-property input'),null);
  await click('.view-card-title');assert.equal(previewed,3);assert.equal(opened,0);await click('.view-result-card');assert.equal(previewed,4);

 }finally{await act(async()=>root.unmount());session.dispose();dom.window.close();}
});

test('Kanban slots guide without pinning the pointer and scroll the unclipped page',async()=>{
 const dom=new JSDOM('<div id="board"><section data-tag-column="Todo"><h3 style="margin-bottom:8px">Todo</h3><div data-card-id="a">A</div><div data-card-id="b">B</div><div data-card-id="c">C</div></section><section data-tag-column="Done"><h3 style="margin-bottom:12px">Done</h3></section></div>',{pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),matchMedia:()=>({matches:true})});
 const {dragKanban}=await import('../src/renderer/sortable'),board=document.getElementById('board')!,source=board.querySelector<HTMLElement>('[data-card-id=a]')!,drops:{value:string;before?:string;after?:string}[]=[];
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){const column=this.closest('[data-tag-column]'),left=column?.getAttribute('data-tag-column')==='Done'?220:0;let top=0,height=400,width=200;
  if(this===board)width=420;else if(this.tagName!=='SECTION'){const siblings=[...(this.parentElement?.children??[])].filter(el=>(el as HTMLElement).style.display!=='none');top=30+siblings.indexOf(this)*68;height=60;}
  return {left,right:left+width,top,bottom:top+height,width,height,x:left,y:top,toJSON(){}};
 };
 const event=(type:string,x:number,y:number)=>document.dispatchEvent(new dom.window.MouseEvent(type,{clientX:x,clientY:y,bubbles:true}));
 const begin=()=>dragKanban({currentTarget:source,clientX:20,clientY:110,pointerId:undefined} as unknown as Parameters<typeof dragKanban>[0],board,(value,position)=>drops.push({value,...position}),()=>true);
 try{
  begin();event('pointerup',20,110);assert.equal(drops.length,0);
  const topBefore=source.getBoundingClientRect().top;begin();event('pointermove',20,210);assert.ok(document.querySelector('.kanban-slot'));assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),topBefore+100,'Changing rows within the same column never snaps the card vertically');event('pointerup',20,210);assert.deepEqual(drops.pop(),{value:'Todo',before:'c',after:'b'});assert.equal(source.style.display,'');assert.equal(document.querySelector('.kanban-slot'),null);
  begin();event('pointermove',20,0);assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),98,'The card stops below its status heading and margin');event('pointermove',20,390);assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),340,'The whole card stops at the block bottom');event('pointermove',20,180);assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),topBefore+70,'Moving back inside resumes free vertical motion');event('pointermove',20,520);assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),340);event('pointerup',20,520);assert.equal(drops.length,0,'Clamping the preview does not make an outside drop valid');
  const sourceTop=source.getBoundingClientRect().top;begin();event('pointermove',214,110);assert.ok(board.querySelector('[data-tag-column=Done] .kanban-slot'),'Near the column snaps into its slot');event('pointermove',240,0);assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),102,'An empty destination keeps its own heading clear');event('pointermove',240,300);const freeTop=sourceTop+300-110;assert.equal(parseFloat(document.querySelector<HTMLElement>('.drag-phantom')!.style.top),freeTop,'Vertical motion follows the pointer exactly, independent of the insertion slot');event('pointermove',600,110);assert.equal(document.querySelector('.kanban-slot'),null);event('pointerup',600,110);assert.equal(drops.length,0);
  begin();event('pointermove',240,110);document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(drops.length,0);assert.equal(source.style.display,'');assert.equal(document.querySelector('.drag-phantom'),null);
  begin();event('pointermove',240,110);event('pointerup',240,110);assert.deepEqual(drops.pop(),{value:'Done',before:undefined,after:undefined});assert.deepEqual([...board.querySelectorAll('[data-card-id]')].map(el=>el.textContent),['A','B','C']);
  const page=document.createElement('div');page.className='editor-body';board.before(page);page.append(board);page.getBoundingClientRect=()=>({left:0,right:420,top:0,bottom:200,width:420,height:200,x:0,y:0,toJSON(){}});
  begin();event('pointermove',240,320);assert.equal(document.querySelector('.kanban-slot'),null,'Offscreen columns do not accept a drop');event('pointermove',240,195);await new Promise(resolve=>setTimeout(resolve,50));assert.ok(page.scrollTop>0,'Dragging near the visible page edge scrolls the outer page');document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 }finally{dom.window.close();}
});

test('Kanban drops keep preview and editor views mounted while saves and refreshes finish',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,matchMedia:()=>({matches:true}),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client'),{ViewBlockProvider}=await import('../src/renderer/ViewBlock'),{TitleContent}=await import('../src/renderer/TitleContent'),{CardEditor}=await import('../src/renderer/Editor'),{preview}=await import('../src/renderer/markdown');
 const root=createRoot(document.getElementById('root')!);
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,130));});
 try{for(const editable of [true,false]){
  let snapshot:Snapshot={root:'/test',name:'Test',cards:['owner','a','b'].map(id=>({id,path:id+'.md',name:id,revision:'r1',legacy:false})),boards:[],issues:[],historyAvailable:false,tags:[{path:'project.tag',name:'project',tag:'project',revision:'r',inherits:[],overrides:[],fields:[{key:'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:[],done:['Done']}}]}]};
  const definition=newViewBlock('project');definition.views=[{id:'board',name:'Board',type:'kanban',groupBy:'project/Status',fields:[]}];let source=writeViewBlock('',definition),writes=0,requests=0;
  const results:ViewResults={rows:snapshot.cards.slice(1).map(card=>({card,properties:{tags:['project'],'project/Status':'Todo'}})),total:2,columns:[{value:'Todo',ids:['a','b'],total:2},{value:'Done',ids:[],total:0}]};
  let finishSave:()=>void=()=>{},failSave:(e:Error)=>void=()=>{},finishRefresh:(rows:ViewResults)=>void=()=>{};
  const session=new Session({assetUrl:(s:string)=>s,request:async()=>{requests++;return requests===1?structuredClone(results):new Promise<ViewResults>(resolve=>{finishRefresh=resolve;});}} as unknown as Bridge);window.door=session.bridge;session.state.snapshot=snapshot;
  const render=()=>{const body='# Board\n\n```view-block\n'+source+'```\n\nAn unchanged paragraph.';root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}>{editable?<CardEditor path="owner.md" body={body} cards={snapshot.cards} onEdit={()=>{writes++;}}/>:<TitleContent path="owner.md" html={preview(body,'owner.md')}/>}</ViewBlockProvider>);};
  session.moveViewCard=async()=>{await new Promise<void>((resolve,reject)=>{finishSave=resolve;failSave=reject;});definition.views[0].order={Todo:['b','a']};source=writeViewBlock(source,definition);snapshot={...snapshot,cards:snapshot.cards.map(c=>c.id==='owner'?{...c,revision:'r2'}:c)};session.state.snapshot=snapshot;render();return {snapshot,edits:[]};};
  await act(async()=>render());await settle();const view=document.querySelector('.view-block'),board=document.querySelector<HTMLElement>('.view-kanban')!,other=document.querySelector('[data-card-id=b]'),heading=document.querySelector('h1');board.scrollLeft=52;board.dispatchEvent(new dom.window.Event('scroll',{bubbles:true}));
  const ids=()=>[...document.querySelectorAll('[data-tag-column=Todo] [data-card-id]')].map(el=>(el as HTMLElement).dataset.cardId);
  const rect=(left:number,top:number,width:number,height:number)=>({left,right:left+width,top,bottom:top+height,width,height,x:left,y:top,toJSON(){}});
  const drag=async(toDone=false)=>{board.getBoundingClientRect=()=>rect(0,0,420,500);const page=board.closest<HTMLElement>('.editor-body');if(page)page.getBoundingClientRect=()=>rect(0,0,420,500);document.querySelectorAll<HTMLElement>('[data-tag-column]').forEach((el,i)=>el.getBoundingClientRect=()=>rect(i*220,0,200,500));document.querySelectorAll<HTMLElement>('[data-card-id]').forEach(el=>el.getBoundingClientRect=()=>rect(0,el.dataset.cardId==='a'?40:130,200,70));const card=document.querySelector('[data-card-id=a]')!;const event=(target:Element|Document,type:string,x:number,y:number)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));await act(async()=>{event(card,'pointerdown',20,60);event(document,'pointermove',toDone?260:20,toDone?60:225);event(document,'pointerup',toDone?260:20,toDone?60:225);});};
  await drag();assert.deepEqual(ids(),['b','a'],'the drop is visible before the file save completes');
  await act(async()=>finishSave());await settle();assert.equal(document.querySelector('.view-block'),view,'source updates keep the view mounted in '+(editable?'editor':'preview'));assert.equal(document.querySelector('.view-kanban'),board);assert.equal(document.querySelector('[data-card-id=b]'),other);assert.equal(document.querySelector('h1'),heading);assert.deepEqual(ids(),['b','a'],'a pending query never empties or reverts the view');assert.equal(board.scrollLeft,52);assert.doesNotMatch(document.querySelector('.view-result-footer')?.textContent??'',/Loading/);assert.equal(writes,0,'external order updates do not become editor changes');
  const refreshed={...results,columns:[{value:'Todo',ids:['b','a'],total:2},{value:'Done',ids:[],total:0}]};await act(async()=>finishRefresh(refreshed));assert.deepEqual(ids(),['b','a']);
  await drag(true);assert.ok(document.querySelector('[data-tag-column=Done] [data-card-id=a]'),'cross-column drops appear immediately too');
  await act(async()=>failSave(new Error('Save failed')));assert.deepEqual(ids(),['b','a'],'a failed save restores the previous order');assert.equal(document.querySelector('[data-tag-column=Done] [data-card-id=a]'),null);assert.match(document.querySelector('[role=alert]')?.textContent??'',/Save failed/);assert.equal(document.querySelector('.view-block'),view);
  await act(async()=>root.render(null));session.dispose();
 }}finally{await act(async()=>root.unmount());}
});


test('preview setup stays editable, configured properties stay available, and view tabs reorder within their block',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true});windows.push(dom);
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),innerWidth:1200,innerHeight:900,matchMedia:()=>({matches:true}),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});dom.window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','true');};
 const snapshot:Snapshot={root:'/test',name:'Test',cards:['owner','a'].map(id=>({id,path:id+'.md',name:id,revision:'r1',legacy:false})),boards:[],issues:[],historyAvailable:false,tags:[{path:'project.tag',name:'project',tag:'project',revision:'r',inherits:[],overrides:[],fields:[{key:'Status',type:'status',statusGroups:{todo:['Todo'],inProgress:[],done:['Done']}},{key:'priority',type:'number'},{key:'Due',type:'date'}]}]};
 let results:ViewResults={rows:[],total:0},writes=0;
 const session=new Session({assetUrl:(s:string)=>s,request:async()=>results} as unknown as Bridge);window.door=session.bridge;session.state.snapshot=snapshot;
 const {createRoot}=await import('react-dom/client'),{ViewBlockProvider}=await import('../src/renderer/ViewBlock'),{TitleContent}=await import('../src/renderer/TitleContent'),{preview}=await import('../src/renderer/markdown');
 const definition=newViewBlock();definition.query.where={field:'file.folder',op:'under',value:'Notes'};definition.views=[{id:'board',name:'Board',type:'kanban',groupBy:'project/Status',fields:['project/priority','project/Due']},{id:'table',name:'Table',type:'table'},{id:'list',name:'List',type:'list'}];let source=writeViewBlock('',definition);
 const root=createRoot(document.getElementById('root')!),render=()=>{const body='# Dashboard\n\n'+(source?'```view-block\n'+source+'```\n':'');root.render(<ViewBlockProvider snapshot={snapshot} session={session} onOpen={()=>{}}><TitleContent path="owner.md" html={preview(body,'owner.md')}/><TitleContent path="owner.md" html={preview(body,'owner.md')}/></ViewBlockProvider>);};
 session.saveViewBlock=async(path,revision,index,previous,next)=>{assert.equal(path,'owner.md');assert.equal(revision,'r1');assert.equal(index,0);assert.equal(previous.trim(),source.trim());writes++;source=next??'';render();};
 const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,130));}),click=async(selector:string)=>{const element=document.querySelector<HTMLElement>(selector);assert.ok(element,selector);await act(async()=>element.click());},escape=()=>act(async()=>{document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
 const property=(name:string)=>[...document.querySelectorAll<HTMLLabelElement>('.view-menu-properties label')].find(el=>el.textContent===name)?.querySelector('input');
 const order=()=>parseViewBlock(source).views.map(v=>v.id);
 try{
  await act(async()=>render());await settle();
  assert.equal(document.querySelector<HTMLButtonElement>('.view-query-line button')?.disabled,false);assert.ok(document.querySelector('.view-tabs > [aria-label="Add view"]'));
  await click('[aria-label="View options"]');await click('.view-menu-list button:nth-child(2)');assert.equal(property('priority')?.checked,true);assert.equal(property('Due')?.checked,true,'configured fields appear even before any query results');await escape();
  results={rows:[{card:snapshot.cards[1],properties:{tags:['project'],'project/priority':3,'project/Due':'2026-10-18','project/Status':'Todo'}}],total:1};snapshot.cards=[...snapshot.cards.map(c=>({...c,revision:c.id==='a'?'r2':c.revision}))];await act(async()=>render());await settle();
  await click('[aria-label="View options"]');await click('.view-menu-list button:nth-child(2)');await act(async()=>property('priority')!.click());await settle();assert.equal(property('priority')?.checked,false,'hidden properties remain available to enable');await act(async()=>property('priority')!.click());await settle();assert.equal(property('priority')?.checked,true);await escape();
  await click('.view-query-line button');assert.ok(document.querySelector('.view-condition'));await click('.view-popup-footer button');await settle();
  await click('.view-toolbar > button');assert.equal(document.querySelector('.view-popup')?.getAttribute('data-kind'),'filter');await escape();
  const strips=[...document.querySelectorAll<HTMLElement>('[data-tab-strip]')],rect=(left:number,top:number,width:number)=>({left,top,width,height:34,right:left+width,bottom:top+34,x:left,y:top,toJSON(){}});
  const original=dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){const strip=this.hasAttribute('data-tab-strip')?this:this.parentElement;if(!strip||!strips.includes(strip))return original.call(this);const top=strips.indexOf(strip)*100+40;if(this===strip)return rect(10,top,300);const siblings=[...strip.children].filter(e=>(e as HTMLElement).style.display!=='none');return rect(10+siblings.indexOf(this)*92,top,90);};
  const pointer=(target:Element|Document,type:string,x:number,y=50)=>act(async()=>{target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y}));});
  const board=()=>strips[0].querySelector<HTMLElement>('[data-tab-key=board]')!,before=writes;
  await pointer(board(),'pointerdown',30);await pointer(document,'pointermove',250);assert.ok(document.querySelector('.tab-phantom'));assert.equal(writes,before);await escape();assert.deepEqual(order(),['board','table','list']);
  await pointer(board(),'pointerdown',30);await pointer(document,'pointermove',140,150);await pointer(document,'pointerup',140,150);assert.equal(writes,before,'view tabs cannot move into another block instance');
  await pointer(board(),'pointerdown',30);await pointer(document,'pointermove',250);await pointer(document,'pointerup',250);await settle();assert.deepEqual(order(),['table','list','board']);assert.equal(strips[0].querySelector('[aria-selected=true]')?.getAttribute('data-tab-key'),'board');
  await act(async()=>board().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true})));await settle();assert.deepEqual(order(),['table','board','list']);assert.equal(document.querySelector('.tab-phantom'),null);assert.equal(document.querySelector('.view-popup'),null,'dragging never opens a tab menu');
  const contextClick=async(id:string)=>act(async()=>strips[0].querySelector('[data-tab-key="'+id+'"]')!.dispatchEvent(new dom.window.MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true})));
  await click('[data-tab-key=table]');assert.equal(strips[0].querySelector('[aria-selected=true]')?.getAttribute('data-tab-key'),'table');assert.equal(document.querySelector('.view-popup'),null,'left-click only activates an inactive tab');
  await click('[data-tab-key=table]');assert.equal(document.querySelector('.view-popup'),null,'left-clicking the active tab does not open its menu');
  await contextClick('board');assert.ok(document.querySelector('.view-menu-list'));await click('.view-menu-list button:nth-child(2)');await click('[data-tab-key=board]');assert.equal(document.querySelector('.view-popup'),null,'left-click dismisses an open context menu even in a subpanel');
  const action=async(name:string)=>{const button=[...document.querySelectorAll<HTMLElement>('.view-menu-list button')].find(el=>el.textContent===name);assert.ok(button,name);await act(async()=>button.click());};
  await contextClick('list');await action('Rename view');
  const input=document.querySelector<HTMLInputElement>('.view-popup input')!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'Renamed list');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await act(async()=>document.querySelector('.view-popup form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await settle();assert.equal(parseViewBlock(source).views.find(v=>v.id==='list')!.name,'Renamed list');
  await contextClick('list');await action('Duplicate view');await settle();assert.equal(parseViewBlock(source).views.length,4);assert.equal(parseViewBlock(source).views.at(-1)!.name,'Renamed list copy');
  await contextClick('list');await action('Delete view');await settle();assert.equal(parseViewBlock(source).views.some(v=>v.id==='list'),false);assert.equal(parseViewBlock(source).views.length,3,'delete applies to the clicked view, not the previously active copy');
  while(source){const id=order()[0];await contextClick(id);await action('Delete view');await settle();}assert.equal(document.querySelector('.view-block'),null,'deleting the last view removes its block');
 }finally{await act(async()=>root.unmount());session.dispose();}
});
