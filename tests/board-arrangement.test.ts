import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrangeBoard,prepareArrangement,nearestCardWidth,fitPlacementSize,DEFAULT_ARRANGEMENT,validateArrangement} from '../src/board-arrangement';
import {defaultPreferences,validatePreferences} from '../src/core/preferences';
import type {Board,Placement} from '../src/shared';
const p=(id:string,x:number,y:number,width=100,height=100):Placement=>({id,cardId:id,x,y,width,height});
const board=(cards:Placement[]):Board=>({name:'Board',folder:'',path:'Board.whiteboard',revision:'r',cards,edges:[]});
test('alignment and equal spacing respect unequal element footprints, untouched elements and source data',()=>{
 const b=board([p('a',0,0,100,40),p('b',200,150,160,60),p('c',600,300,80,100),p('other',-100,-100)]),before=structuredClone(b),ids=['a','b','c'],boxes=new Map(b.cards.map(p=>[p.id,p]));
 for(const action of ['left','right','top','bottom'] as const){const next=arrangeBoard(b,ids,action,boxes);assert.equal(next.cards[3],b.cards[3]);const values=next.cards.slice(0,3).map(p=>action==='left'?p.x:action==='right'?p.x+p.width:action==='top'?p.y:p.y+p.height);assert.ok(values.every(v=>v===values[0]));}
 for(const action of ['horizontal','vertical'] as const){const next=arrangeBoard(b,ids,action,boxes),[a,c,d]=next.cards;assert.equal(action==='horizontal'?c.x-a.x-a.width:c.y-a.y-a.height,action==='horizontal'?d.x-c.x-c.width:d.y-c.y-c.height);}
 assert.deepEqual(b,before);
 const overlap=board([p('a',0,0,200),p('b',10,0,200),p('c',20,0,200)]),next=arrangeBoard(overlap,ids,'horizontal',new Map());assert.deepEqual(next.cards.map(p=>p.x),[0,200,400],'insufficient space never produces a negative gap');
});
test('automatic cleanup preserves spatial order, distant groups and links while aligning nearby rows and columns',()=>{
 const b=board([p('a',100,100,240,180),p('b',401,110,240,180),p('c',108,347,240,180),p('d',405,352,240,180),p('far',2200,1700),p('outside',-100,-100)]);b.edges=[{id:'edge',from:'far',to:'a'}];
 const ids=['a','b','c','d','far'],next=arrangeBoard(b,ids,'auto',new Map()),[a,c,d,e,far]=next.cards;
 assert.deepEqual([a.x,a.y,c.x,c.y,d.x,d.y,e.x,e.y],[100,100,388,100,100,328,388,328]);assert.deepEqual(far,b.cards[4]);assert.equal(next.cards[5],b.cards[5]);assert.equal(next.edges,b.edges);assert.deepEqual(next.cards.map(p=>p.id),b.cards.map(p=>p.id));
 assert.deepEqual(arrangeBoard(next,ids,'auto',new Map()),next,'cleanup must be stable on repeat');
 const noLinks=arrangeBoard({...b,edges:[]},ids,'auto',new Map());assert.deepEqual(next.cards,noLinks.cards,'a connection must not reorder the spatial layout');
 const prepared=prepareArrangement({...a,width:352,autoHeight:false},DEFAULT_ARRANGEMENT,true);assert.equal(prepared.width,340);assert.equal(prepared.autoHeight,true);assert.equal(prepareArrangement(a,DEFAULT_ARRANGEMENT,false),a);assert.equal(prepareArrangement(a,{...DEFAULT_ARRANGEMENT,resizeCards:false},true).width,a.width);
});
test('cleanup keeps ragged rows, column order and deliberate large gaps instead of wrapping to a new row',()=>{
 const b=board([p('right',1400,110,300,150),p('left',100,100,250,200),p('below',108,900,250,200),p('middle',700,108,300,150)]),ids=b.cards.map(p=>p.id),next=arrangeBoard(b,ids,'auto',new Map(),{...DEFAULT_ARRANGEMENT,rowWidth:600});
 assert.deepEqual(next.cards.map(p=>[p.id,p.x,p.y]),[['right',1400,100],['left',100,100],['below',100,900],['middle',700,100]]);assert.deepEqual(arrangeBoard(next,ids,'auto',new Map()),next);
 const stacked=board([p('a',0,0,240,300),p('b',2,25,240,200),p('c',4,50,240,120)]),tidy=arrangeBoard(stacked,stacked.cards.map(p=>p.id),'auto',new Map());
 for(let i=0;i<tidy.cards.length;i++)for(let j=i+1;j<tidy.cards.length;j++){const a=tidy.cards[i],b=tidy.cards[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
 assert.deepEqual(arrangeBoard(tidy,tidy.cards.map(p=>p.id),'auto',new Map()),tidy);
});
test('arrangement preferences roundtrip and reject invalid charts, bounds and booleans',()=>{
 const prefs={...defaultPreferences(),arrangement:structuredClone(DEFAULT_ARRANGEMENT)};assert.deepEqual(validatePreferences(JSON.parse(JSON.stringify(prefs))).arrangement,prefs.arrangement);const legacy={...prefs,arrangement:{...prefs.arrangement,boardHeights:undefined}};assert.deepEqual(validatePreferences(legacy).arrangement,legacy.arrangement);
 for(const patch of [{widths:[200,200,300,400]},{widths:[200,300,400]},{widths:[200,300,400,Infinity]},{boardHeights:[120,170,170,340]},{boardHeights:[120,170,240]},{boardHeights:[120,170,240,Infinity]},{boardHeights:[100,170,240,340]},{boardHeights:null},{alignmentTolerance:-1},{alignmentTolerance:Infinity},{horizontalGap:-1},{verticalGap:NaN},{rowWidth:100},{collapseHeight:0},{groupLinks:'yes'},{collapseLong:null}])assert.throws(()=>validateArrangement({...DEFAULT_ARRANGEMENT,...patch}));
});
test('automatic arrangement handles 10000 elements without an all-pairs layout pass',()=>{
 const b=board(Array.from({length:10000},(_,i)=>p(String(i),i%100*400,Math.floor(i/100)*250,240,120+i%3*40)));b.edges=b.cards.slice(1).map((p,i)=>({id:'e'+i,from:b.cards[i].id,to:p.id}));const start=performance.now(),next=arrangeBoard(b,b.cards.map(p=>p.id),'auto',new Map());assert.equal(next.cards.length,10000);assert.ok(performance.now()-start<2000);let bottom=0,row=-1;for(const p of next.cards){if(p.y!==row){assert.ok(p.y>=bottom);row=p.y;}bottom=Math.max(bottom,p.y+p.height);}
});

test('card width fitting reuses the configured chart with deterministic ties',()=>{
 for(const [width,expected] of [[100,240],[280,240],[290,240],[310,340],[510,480],[1200,680]])assert.equal(nearestCardWidth(width,DEFAULT_ARRANGEMENT.widths),expected);
 assert.equal(nearestCardWidth(330,[220,360,520,760]),360);assert.equal(nearestCardWidth(500,[220,360,520,760]),520);
});

test('board size fitting pairs height with width, accepts older settings and preserves card heights',()=>{
 const tile={...p('tile',20,30,340,800),folder:'Child'},before=structuredClone(tile);
 assert.deepEqual(fitPlacementSize(tile,DEFAULT_ARRANGEMENT),{...tile,height:170});
 assert.deepEqual(fitPlacementSize(tile,{...DEFAULT_ARRANGEMENT,boardHeights:undefined}),{...tile,height:170});
 const settings={...DEFAULT_ARRANGEMENT,widths:[220,360,520,760] as [number,number,number,number],boardHeights:[140,210,300,420] as [number,number,number,number]};
 assert.deepEqual(fitPlacementSize(tile,settings),{...tile,width:360,height:210});
 const fitted=fitPlacementSize(tile,settings);assert.equal(fitPlacementSize(fitted,settings),fitted,'matching both dimensions does not create a change');
 const card={...p('card',10,20,350,900),autoHeight:true};assert.deepEqual(fitPlacementSize(card,settings),{...card,width:360});assert.deepEqual(tile,before);
});
