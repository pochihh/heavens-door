import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitsBoardSnapshot,allowSnapshotAttempt} from '../src/renderer/board-snapshot';
test('snapshot admission bounds decoded pixels and dimensions before allocating a bitmap',()=>{
 assert.ok(fitsBoardSnapshot(1000,4000,1));assert.ok(fitsBoardSnapshot(1000,16000,.25));
 for(const [width,height,density] of [[1001,4000,1],[1,9000,1],[0,100,1],[100,100,0],[100,100,-1],[Infinity,100,1],[100,NaN,1],[100,100,Infinity]])assert.equal(fitsBoardSnapshot(width,height,density),false);
});

test('repeated eviction falls back instead of regenerating the same preview forever',()=>{
 const attempts=new Map<string,{key:string;count:number}>();assert.ok(allowSnapshotAttempt(attempts,'pdf','revision-1:.25'));assert.ok(allowSnapshotAttempt(attempts,'pdf','revision-1:.25'));
 for(let i=0;i<10;i++)assert.equal(allowSnapshotAttempt(attempts,'pdf','revision-1:.25'),false);
 assert.ok(allowSnapshotAttempt(attempts,'other-pdf','revision-1:.25'));assert.ok(allowSnapshotAttempt(attempts,'pdf','revision-2:.25'));assert.ok(allowSnapshotAttempt(attempts,'pdf','revision-2:.5'));
 attempts.delete('pdf');assert.ok(allowSnapshotAttempt(attempts,'pdf','revision-2:.5'));
});
