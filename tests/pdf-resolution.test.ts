import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pdfPixelRatio,pdfRasterRatio,pdfDetailRegion,containsRaster,needsPdfDetail,PDF_PAGE_PIXELS,PDF_DETAIL_PIXELS} from '../src/renderer/pdf-resolution';
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height});
test('PDF density covers screen pixels at high zoom on Retina instead of capping at four',()=>{
 for(const dpr of [1,2,3])for(const zoom of [.01,.1,.5,1,2,3]){
  const ratio=pdfPixelRatio(zoom,dpr);assert.ok(ratio>=dpr*zoom);assert.ok(ratio<Math.max(.125,dpr*zoom*1.2)*2+1e-8);
 }
 assert.ok(pdfPixelRatio(3,2)>=6);
 assert.equal(pdfPixelRatio(1,2),pdfPixelRatio(1.05,2),'small zoom changes reuse one density bucket');
});
test('large PDF pages use a bounded detail region covering the visible page',()=>{
 const width=1200,height=1600,page=rect(-900,-1500,3600,4800),view=rect(0,0,1400,900);
 const detail=pdfDetailRegion(width,height,page,view)!;assert.ok(detail);assert.ok(detail.x<=300&&detail.y<=500);assert.ok(detail.x+detail.width>=(1400+900)/3);assert.ok(detail.y+detail.height>=800);
 assert.ok(detail.x>=0&&detail.y>=0&&detail.x+detail.width<=width&&detail.y+detail.height<=height);
 const base=pdfRasterRatio(width,height,pdfPixelRatio(3,2));assert.ok(width*height*base**2<=PDF_PAGE_PIXELS+1);
 const dense=pdfRasterRatio(detail.width,detail.height,pdfPixelRatio(3,2),PDF_DETAIL_PIXELS);assert.ok(dense>=6,'visible crop can reach display resolution');assert.ok(detail.width*detail.height*dense**2<=PDF_DETAIL_PIXELS+1);
 assert.equal(pdfDetailRegion(width,height,page,rect(5000,5000,100,100)),undefined);
 assert.equal(containsRaster(detail,{x:detail.x+1,y:detail.y+1,width:10,height:10}),true);assert.equal(containsRaster(detail,{...detail,x:detail.x-1}),false);
});

test('already-sharp PDF previews do not allocate duplicate detail just for extra headroom',()=>{
 for(const [width,height] of [[440,570],[480,621],[700,906]])assert.equal(needsPdfDetail(pdfRasterRatio(width,height,4),4,2),false);
 assert.equal(needsPdfDetail(pdfRasterRatio(1200,1600,8),8,6),true);
 assert.equal(needsPdfDetail(.125,.125,.05),false);
});
