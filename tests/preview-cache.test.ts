import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PreviewCache} from '../scripts/performance/preview-cache';
const image=(width=4,height=4)=>({width,height,closed:0,close(){this.closed++;}});
test('preview cache keeps old pixels until a current replacement commits and rejects stale work',()=>{
 const cache=new PreviewCache<ReturnType<typeof image>>(128),old=image(),stale=image(),fresh=image();
 assert.ok(cache.commit(cache.begin('card','v1'),old));const a=cache.begin('card','v2'),b=cache.begin('card','v3');
 assert.equal(cache.get('card'),old);assert.equal(cache.get('card','v3'),undefined);
 assert.equal(cache.commit(a,stale),false);assert.equal(stale.closed,1);assert.equal(old.closed,0);
 assert.ok(cache.commit(b,fresh));assert.equal(old.closed,1);assert.equal(cache.get('card','v3'),fresh);
 const cancelled=cache.begin('other','v1');cache.clear();const late=image();assert.equal(cache.commit(cancelled,late),false);assert.equal(late.closed,1);assert.equal(fresh.closed,1);assert.equal(cache.bytes,0);
});
test('preview cache enforces decoded bytes through repeated pressure and releases each bitmap once',()=>{
 const cache=new PreviewCache<ReturnType<typeof image>>(128),a=image(),b=image(),c=image();
 cache.commit(cache.begin('a','v1'),a);cache.commit(cache.begin('b','v1'),b);cache.get('a');cache.commit(cache.begin('c','v1'),c);
 assert.equal(b.closed,1);assert.equal(a.closed,0);assert.equal(cache.get('b'),undefined);
 const huge=image(100,100);assert.equal(cache.commit(cache.begin('a','v2'),huge),false);assert.equal(huge.closed,1);assert.equal(cache.get('a'),a);
 for(const [w,h] of [[Infinity,1],[-1,-1],[0,4],[1.5,4]]){const invalid=image(w,h);assert.equal(cache.commit(cache.begin('invalid','v1'),invalid),false);assert.equal(invalid.closed,1);}
 for(let i=0;i<1000;i++){cache.commit(cache.begin('x'+i,'v1'),image());assert.ok(cache.bytes<=128);}
 cache.clear();assert.equal(cache.size,0);assert.equal(cache.bytes,0);assert.equal(a.closed,1);assert.equal(c.closed,1);assert.equal(cache.peakBytes,128);
 assert.throws(()=>new PreviewCache(-1));
});
