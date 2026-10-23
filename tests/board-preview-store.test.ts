import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boardPreviews,boardThumbnails,latestBoardPreviews,rememberBoardPreview,invalidateBoardSource,type BoardPreview} from '../src/renderer/board-preview-store';
const preview=()=>({width:4,height:4,worldWidth:4,worldHeight:4,bitmap:{} as ImageBitmap,closed:0,close(){this.closed++;}} satisfies BoardPreview&{closed:number});
test('PDF reload invalidates every reference and pending density while preserving other cards',()=>{
 boardPreviews.clear();latestBoardPreviews.clear();
 const revision=JSON.stringify({cardId:'pdf',revision:1}),keys=['board-a:p1:'+revision+':.25','board-b:p2:'+revision+':.5'],old=keys.map(key=>{const image=preview();boardPreviews.commit(boardPreviews.begin(key,revision),image);rememberBoardPreview(key,revision,key);return image;});
 const otherKey='board-a:p3:'+JSON.stringify({cardId:'pdf-other'})+':.5',other=preview();boardPreviews.commit(boardPreviews.begin(otherKey,'other'),other);rememberBoardPreview('other','{"cardId":"pdf-other"}',otherKey);
 const pending=boardPreviews.begin('board-c:p4:'+revision+':1',revision);invalidateBoardSource('pdf');
 for(const image of old)assert.equal(image.closed,1);for(const key of keys)assert.equal(boardPreviews.get(key),undefined);
 const stale=preview();assert.equal(boardPreviews.commit(pending,stale),false);assert.equal(stale.closed,1);
 assert.equal(boardPreviews.get(otherKey),other);assert.deepEqual([...latestBoardPreviews.keys()],['other']);
 boardPreviews.clear();latestBoardPreviews.clear();
});

test('image thumbnails survive detail eviction, obey revision changes, and invalidate with their source',async()=>{
 const {RetainedSurface}=await import('../src/renderer/RetainedSurface');
 boardPreviews.clear();boardThumbnails.clear();latestBoardPreviews.clear();
 const entry={id:'p',revision:JSON.stringify({cardId:'image-card',revision:1}),simple:false,measured:true,x:0,y:0,width:64,height:64,placement:{id:'p',cardId:'image-card',x:0,y:0,width:64,height:64},title:'Image card'};
 const surface=new RetainedSurface('image-check'),small=preview(),detail=preview(),key=surface.key(entry,1);
 boardThumbnails.commit(boardThumbnails.begin(surface.key(entry,0),entry.revision),small);boardPreviews.commit(boardPreviews.begin(key,entry.revision),detail);rememberBoardPreview('image-check:p',entry.revision,key);
 boardPreviews.clear();assert.equal(detail.closed,1);assert.ok(surface.available(entry,.05));assert.ok(surface.has(entry,.05));assert.equal(surface.has(entry,1),false);assert.equal(small.closed,0);
 assert.equal(surface.available({...entry,revision:JSON.stringify({cardId:'image-card',revision:2})},.05),false);
 invalidateBoardSource('image-card');assert.equal(surface.available(entry,.05),false);assert.equal(small.closed,1);assert.equal(boardThumbnails.bytes,0);latestBoardPreviews.clear();
});
