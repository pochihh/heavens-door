import {performance} from 'node:perf_hooks';
import {connectorBenchmarkFixture} from './connector-benchmark-fixture';
import {connectorScene,nearbyConnectors,closestConnector} from '../src/renderer/connector-proximity';
const {board,cards}=connectorBenchmarkFixture();let heightReads=0;
const start=performance.now(),scene=connectorScene(board.cards,p=>{heightReads++;return p.object?56:p.height;}),sceneMs=performance.now()-start;
const samples:number[]=[];let hits=0;
for(let i=0;i<12000;i++){
 const point=scene.points[i%scene.points.length],zoom=[.2,.5,1,3][i%4],cursor={x:point.x+Math.sin(i)*80/zoom,y:point.y+Math.cos(i*.7)*80/zoom},begin=performance.now();
 hits+=nearbyConnectors(scene.points,cursor,zoom,'card-001').length;closestConnector(scene.points,cursor,zoom,'card-001');
 if(i>=2000)samples.push(performance.now()-begin);
}
samples.sort((a,b)=>a-b);
console.log(JSON.stringify({cards:cards.length,textElements:board.cards.filter(p=>p.object?.type==='text').length,edges:board.edges.length,connectors:scene.points.length,sceneMs:+sceneMs.toFixed(3),queries:samples.length,medianMs:+samples[Math.floor(samples.length*.5)].toFixed(4),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(4),maxMs:+samples.at(-1)!.toFixed(4),heightReads,hits},null,2));
