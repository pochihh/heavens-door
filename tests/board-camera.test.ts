import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsBoardView} from '../scripts/performance/retained-camera';
test('experimental camera content refresh follows overscan and detail demand, not every camera position',()=>{
 const before={x:20,y:20,zoom:1};
 assert.equal(needsBoardView(before,{x:200,y:300,zoom:1},1000,800),false);
 assert.equal(needsBoardView(before,{x:421,y:20,zoom:1},1000,800),true);
 assert.equal(needsBoardView(before,{x:20,y:341,zoom:1},1000,800),true);
 assert.equal(needsBoardView(before,{x:20,y:20,zoom:1.09},1000,800),false);
 assert.equal(needsBoardView(before,{x:20,y:20,zoom:1.11},1000,800),true);
 assert.equal(needsBoardView(before,{x:20,y:20,zoom:.89},1000,800),true);
 assert.equal(needsBoardView({x:-10000,y:-10000,zoom:1},{x:-10500,y:-10500,zoom:1.05},1000,800),false,'zoom translation is compared in the new coordinate scale');
});
