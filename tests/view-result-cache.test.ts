import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ViewResultCache} from '../src/renderer/view-result-cache';

test('view results require the exact data identity and retain only bounded recent queries',()=>{
 const cache=new ViewResultCache(),result={rows:[],total:0};
 for(let i=0;i<16;i++)cache.set(String(i),'revision-a',result);
 assert.equal(cache.get('0','revision-a'),result);
 assert.equal(cache.get('0','revision-b'),undefined,'a file/schema/settings change cannot reuse stale rows');assert.equal(cache.get('0'),result,'the last completed rows remain available as a temporary visual while a new revision is queried');
 cache.set('new','revision-a',result);assert.equal(cache.size,16);assert.equal(cache.get('1','revision-a'),undefined);assert.equal(cache.get('0','revision-a'),result);
 cache.set('huge','revision-a',{rows:[],total:0,scopeTags:['x'.repeat(8*1024*1024)]});assert.equal(cache.get('huge','revision-a'),undefined,'oversized results do not exceed the serialized-data budget');
 cache.clear();assert.equal(cache.size,0);assert.equal(cache.get('new','revision-a'),undefined);
});
