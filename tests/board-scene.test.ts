import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SceneIndex,intersects,overlappingLive,previewDensity,viewportPreviewDensity,sceneViewport,sceneEdges} from '../src/renderer/board-scene';
test('scene queries preserve document stacking order, negative coordinates and very large elements',()=>{const items=[{id:'large',x:-1e8,y:-1e8,width:2e8,height:2e8},{id:'back',x:-100,y:-100,width:200,height:200},{id:'front',x:-10,y:-10,width:20,height:20}];const index=new SceneIndex(items);assert.deepEqual(index.query({x:0,y:0,width:0,height:0}).map(p=>p.id),['large','back','front']);assert.deepEqual(index.query({x:1e9,y:1e9,width:1,height:1}),[]);});
test('indexed geometry matches a full scan over a 10,000 placement board',()=>{const items=Array.from({length:10000},(_,i)=>({id:String(i),x:(i%100-50)*420,y:(Math.floor(i/100)-50)*330,width:320,height:240})),index=new SceneIndex(items);for(let i=0;i<40;i++){const box={x:i*400-8000,y:i*300-6000,width:2000,height:1500};assert.deepEqual(index.query(box),items.filter(item=>intersects(item,box)));}});
test('live promotion follows transitive overlap without promoting separated objects',()=>{const items=[{id:'a',x:0,y:0,width:100,height:50},{id:'b',x:90,y:0,width:100,height:50},{id:'c',x:180,y:0,width:100,height:50},{id:'d',x:1000,y:0,width:100,height:50}];assert.deepEqual([...overlappingLive(new SceneIndex(items),['a'])],['a','b','c']);});
test('preview density retains headroom at deep zoom without an exploding tile count',()=>{for(const zoom of [.000001,.001,.024,.2,1]){const density=previewDensity(zoom,2);assert.ok(density>=zoom*2*1.5);assert.ok(density<zoom*2*3);const box=sceneViewport({x:20,y:40,zoom},1600,968);assert.ok(Math.ceil(box.width*density/512)*Math.ceil(box.height*density/512)<200);}});
test('viewport uses the same camera coordinates as the live board',()=>{assert.deepEqual(sceneViewport({x:20,y:-40,zoom:.5},1000,800,100),{x:-240,y:-120,width:2400,height:2000});});

test('tile admission fits a complete viewport at all zooms, sizes and DPRs',()=>{for(const width of [800,1600,4000])for(const height of [600,1000,2200])for(const dpr of [1,2,4])for(const zoom of [.0001,.024,.2,1,3]){const d=viewportPreviewDensity(zoom,dpr,width,height),count=(Math.ceil(width*d/zoom/512)+1)*(Math.ceil(height*d/zoom/512)+1);assert.ok(count<=64);assert.ok(d>0);}});

test('shared edge geometry reuses unchanged paths and invalidates only affected geometry or style',()=>{
 const placements=Array.from({length:4},(_,i)=>({id:'p'+i,cardId:'c'+i,x:i*400,y:0,width:300,height:200})),edges=[{id:'e1',from:'p0',to:'p1'},{id:'e2',from:'p2',to:'p3'}],height=(p:typeof placements[number])=>p.height;
 const first=sceneEdges(edges,placements,height,'geometry-check');assert.equal(sceneEdges(edges,placements,height,'geometry-check')[0],first[0]);
 const moved=placements.map(p=>p.id==='p0'?{...p,y:100}:p),second=sceneEdges(edges,moved,height,'geometry-check');assert.notEqual(second[0],first[0]);assert.equal(second[1],first[1]);
 const styled=sceneEdges(edges.map(e=>e.id==='e2'?{...e,strokeWidth:5}:e),moved,height,'geometry-check');assert.equal(styled[0],second[0]);assert.notEqual(styled[1],second[1]);
 assert.notEqual(sceneEdges(edges,placements,height,'another-workspace')[0],first[0]);assert.deepEqual(sceneEdges([{id:'missing',from:'p0',to:'absent'}],placements,height),[]);
});
