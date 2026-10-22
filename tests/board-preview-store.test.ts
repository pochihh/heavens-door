import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boardPreviews,latestBoardPreviews,rememberBoardPreview,invalidateBoardSource,type BoardPreview} from '../src/renderer/board-preview-store';
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
