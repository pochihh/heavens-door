import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectorScene,nearbyConnectors,closestConnector,CONNECTOR_RADIUS} from '../src/renderer/connector-proximity';
import {connectorBenchmarkFixture} from '../scripts/connector-benchmark-fixture';
import type {Placement} from '../src/shared';
const card=(id:string,x:number,y:number):Placement=>({id,cardId:id,x,y,width:300,height:200});

test('connector radius is individual, spans elements, and uses board units while snapping stays in screen units',()=>{
 const a=card('a',0,0),b=card('b',320,0),scene=connectorScene([a,b],p=>p.height);
 const facing=scene.points.filter(p=>p.key==='a:right'||p.key==='b:left');
 const hits=nearbyConnectors(facing,{x:310,y:100});assert.deepEqual(hits.map(h=>h.point.key),['a:right','b:left']);assert.ok(hits.every(h=>h.strength>0));
 assert.deepEqual(nearbyConnectors(facing,{x:310,y:100},'a').map(h=>h.point.key),['b:left']);
 const point=scene.points.find(p=>p.key==='a:left')!;
 for(const zoom of [.2,.5,1,3]){
  assert.equal(closestConnector([point],{x:point.x+13/zoom,y:point.y},zoom),point);assert.equal(closestConnector([point],{x:point.x+15/zoom,y:point.y},zoom),undefined);
 }
 assert.ok(nearbyConnectors([point],{x:point.x+CONNECTOR_RADIUS-1,y:point.y}).length);
 assert.equal(nearbyConnectors([point],{x:point.x+CONNECTOR_RADIUS,y:point.y}).length,0);
 assert.equal(nearbyConnectors([point],{x:point.x+300,y:point.y}).length,1,'the enlarged radius includes points outside the previous 160 board units');
 const strength=[0,10,30,60].map(d=>nearbyConnectors([point],{x:point.x+d,y:point.y})[0].strength);assert.equal(strength[0],1);assert.ok(strength.every((s,i)=>i===0||s<strength[i-1]));
 assert.equal(closestConnector(scene.points,{x:318,y:100},1)?.key,'b:left','snap chooses the closest connector across neighboring elements');
});

test('large connector queries reuse measured geometry for 200 cards plus 200 Text items',()=>{
 const {board,cards}=connectorBenchmarkFixture();let reads=0;const scene=connectorScene(board.cards,p=>{reads++;return p.object?56:p.height;});assert.equal(cards.length,200);assert.equal(board.cards.filter(p=>p.object?.type==='text').length,200);assert.equal(scene.points.length,1600);assert.equal(reads,400);
 for(let i=0;i<200;i++){const point=scene.points[i*4];assert.equal(closestConnector(scene.points,point,1)?.key,point.key);assert.ok(nearbyConnectors(scene.points,point).some(h=>h.point.key===point.key));}
 assert.equal(reads,400,'pointer queries never remeasure cards or read layout');
 const measured=connectorScene([{...card('text',50,60),width:40,object:{type:'text',text:'A',shape:'none'}}],()=>28);assert.deepEqual([measured.points[1].x,measured.points[1].y],[98,74],'compact Text uses measured bounds and its normal connector gap');
});
