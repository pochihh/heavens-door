import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {copyBoardStyle,applyBoardStyle} from '../src/board-style';
import {Workspace} from '../src/core/workspace';
import {Session} from '../src/renderer/session';
import {cardFill} from '../src/colors';
import type {Board,Bridge,CardInfo,Placement} from '../src/shared';
const text=(id:string):Placement=>({id,cardId:'',x:10,y:20,width:240,height:80,object:{type:'text',text:'Keep '+id,shape:'rounded',fontSize:32,textColor:'#8aa5c5'},strokeColor:'#c9838a',strokeStyle:'dashed',strokeWidth:4,fillColor:'#91aa8b'});
const board=():Board=>({path:'Board/Board.whiteboard',folder:'Board',name:'Board',revision:'r',cards:[text('text'),{id:'card',cardId:'note',x:400,y:20,width:340,height:280,fillColor:'#ffffff'},{id:'tile',cardId:'',folder:'Board/Child',x:800,y:20,width:300,height:200},{id:'image',cardId:'',x:20,y:300,width:340,height:280,object:{type:'image',html:'<figure>Keep image/crop/caption</figure>'}}],edges:[{id:'edge',kind:'branch',from:'text',to:'card',fromSide:'right',toSide:'left',label:'Keep this label',fromArrowhead:'none',toArrowhead:'triangle',labelSize:24,strokeColor:'#80aaa6',strokeWidth:1,strokeStyle:'dotted'}]});

test('style capture and application copy supported fields without content, geometry or relationships',()=>{
 const b=board(),copied=copyBoardStyle(b,['text'],[],[])!;const next=applyBoardStyle(b,b.cards.map(p=>p.id),['edge'],copied);
 assert.equal(next.cards[0].object?.type==='text'&&next.cards[0].object.text,'Keep text');assert.equal(next.cards[0].object?.type==='text'&&next.cards[0].object.fontSize,32);assert.equal(next.cards[0].object?.type==='text'&&next.cards[0].object.shape,'rounded');
 for(const p of next.cards){const before=b.cards.find(a=>a.id===p.id)!;assert.deepEqual([p.id,p.cardId,p.x,p.y,p.width,p.height,p.folder],[before.id,before.cardId,before.x,before.y,before.width,before.height,before.folder]);assert.equal(p.strokeColor,'#c9838a');assert.equal(p.strokeWidth,4);assert.equal(p.fillColor,'#91aa8b');}
 assert.equal(next.cards[3].object,b.cards[3].object,'image HTML, cropping and captions are not styles');assert.equal(next.edges[0].label,'Keep this label');assert.equal(next.edges[0].kind,'branch');assert.equal(next.edges[0].toSide,'left');assert.equal(next.edges[0].labelSize,32,'Text and edge labels share font-size styling');assert.equal(next.edges[0].toArrowhead,'triangle');assert.equal(next.edges[0].strokeStyle,'dashed');
 const edge=copyBoardStyle(b,[],['edge'],[])!,fromEdge=applyBoardStyle(b,b.cards.map(p=>p.id),['edge'],edge);assert.equal('fillColor' in edge,false);assert.equal(fromEdge.cards[0].fillColor,b.cards[0].fillColor);assert.deepEqual(fromEdge.cards[0].object,{...b.cards[0].object,fontSize:24},'edge labels transfer size without changing Text shape, color or content');assert.equal(fromEdge.edges[0].toArrowhead,'triangle');assert.equal(fromEdge.edges[0].label,'Keep this label');
 const edgeTarget={...b,edges:[{...b.edges[0],id:'other',fromArrowhead:'arrow' as const,toArrowhead:'none' as const,labelSize:12,label:'Target label'}]};const styledEdge=applyBoardStyle(edgeTarget,[],['other'],edge).edges[0];assert.deepEqual([styledEdge.strokeColor,styledEdge.strokeWidth,styledEdge.strokeStyle,styledEdge.fromArrowhead,styledEdge.toArrowhead,styledEdge.labelSize],['#80aaa6',1,'dotted','none','triangle',24]);assert.equal(styledEdge.label,'Target label');assert.equal(styledEdge.id,'other');
 assert.equal(copyBoardStyle(b,['text','card'],[],[]),undefined);assert.equal(copyBoardStyle(b,[],[],[]),undefined);
 const info={id:'note',fillColor:'#c99579'} as CardInfo;assert.equal(copyBoardStyle(b,['card'],[],[info])!.fillColor,'#c99579','card metadata wins over legacy placement colors');
 const defaults=copyBoardStyle({...b,cards:[{...b.cards[1],fillColor:undefined}]},['card'],[],[])!;const cleared=applyBoardStyle(b,['text'],['edge'],defaults);assert.equal(cleared.cards[0].fillColor,undefined);assert.equal(cleared.cards[0].strokeColor,undefined);assert.equal(cleared.cards[0].strokeWidth,2);assert.equal(cleared.cards[0].strokeStyle,'solid');assert.equal(defaults.fillColor,null);
});

test('style clipboard works across boards and updates mixed fills as one revision-checked Undo action',async t=>{
 const dir=await fs.mkdtemp(join(tmpdir(),'heavens-style-')),root=join(dir,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));
 await w.createFolder('','Source');await w.createFolder('','Target');await w.createFolder('Target','Child');await w.create('Source','Reference',0,0);await w.create('Target','Note',0,0);
 const reference=await w.card('Source/Reference.md'),note=await w.card('Target/Note.md');let source=w.snapshot().boards.find(b=>b.folder==='Source')!,target=w.snapshot().boards.find(b=>b.folder==='Target')!;
 await w.saveBoard({...source,cards:[...source.cards,text('source')]},source.revision);source=w.snapshot().boards.find(b=>b.folder==='Source')!;
 await w.saveBoard({...target,cards:[...target.cards,{...text('target'),object:{type:'text',text:'Target content',shape:'none'}},{id:'ref',cardId:reference.id,x:600,y:300,width:340,height:280},{id:'ref2',cardId:reference.id,x:1000,y:300,width:340,height:280}],edges:[{id:'edge',from:'target',to:target.cards.find(p=>p.cardId===note.id)!.id,label:'Unchanged',toArrowhead:'arrow'}]},target.revision);target=w.snapshot().boards.find(b=>b.folder==='Target')!;
 let fillCount=0;const bridge={request:async r=>{if(r.kind==='setFill'){fillCount++;assert.equal(new Set(r.cards.map(c=>c.path)).size,r.cards.length);return w.setFill(r.cards,r.color,r.board);}if(r.kind==='write')return w.write(r.changes);if(r.kind==='card')return w.card(r.path);if(r.kind==='snapshot')return w.snapshot();throw new Error(r.kind);}} as Bridge;
 const session=new Session(bridge);session.update({snapshot:w.snapshot()});t.after(async()=>{session.dispose();w.close();await fs.rm(dir,{recursive:true,force:true});});
 const originalNote=await w.read(note.path),originalReference=await w.read(reference.path);const copying=session.copyStyle(source,['source'],[]),pasting=session.pasteStyle(target,target.cards.map(p=>p.id),['edge']);await copying;await pasting;
 assert.equal(fillCount,1);assert.equal(session.undoHistory.past.length,1);let styled=w.snapshot().boards.find(b=>b.path===target.path)!;assert.deepEqual(styled.cards.map(p=>[p.id,p.x,p.y,p.width,p.height]),target.cards.map(p=>[p.id,p.x,p.y,p.width,p.height]));assert.equal(styled.edges[0].label,'Unchanged');assert.equal(styled.cards.find(p=>p.id==='target')!.object?.type==='text'&&(styled.cards.find(p=>p.id==='target')!.object as {text:string}).text,'Target content');
 assert.equal((await w.card(note.path)).fillColor,'#91aa8b');assert.equal((await w.card(reference.path)).fillColor,'#91aa8b');assert.equal(cardFill(w.snapshot().cards.find(c=>c.id===reference.id),source.cards.find(p=>p.cardId===reference.id)),'#91aa8b');assert.equal((await w.card(note.path)).body,note.body);assert.equal((await w.card(reference.path)).body,reference.body);
 await session.undo();assert.deepEqual(w.snapshot().boards.find(b=>b.path===target.path)!.cards,target.cards);assert.deepEqual(w.snapshot().boards.find(b=>b.path===target.path)!.edges,target.edges);assert.equal(await w.read(note.path),originalNote);assert.equal(await w.read(reference.path),originalReference);
 await session.undo(true);styled=w.snapshot().boards.find(b=>b.path===target.path)!;assert.equal(styled.cards.find(p=>p.id==='target')!.strokeWidth,4);
 const before=await w.read(note.path);await fs.appendFile(join(root,styled.path),'\nExternal change');await assert.rejects(()=>session.pasteStyle(styled,styled.cards.map(p=>p.id),[]),/External|chang/i);assert.equal(await w.read(note.path),before,'a conflicting board cannot partially change card metadata');assert.match(await w.read(styled.path),/External change/);
});
