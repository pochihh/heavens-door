export const PDF_PAGE_PIXELS=4_000_000;
export const PDF_DETAIL_PIXELS=16_000_000;
export interface RasterBox {x:number;y:number;width:number;height:number}
interface Rect {left:number;top:number;right:number;bottom:number;width:number;height:number}
// A little headroom keeps a completed raster sharp through the next zoom step.
export function pdfPixelRatio(zoom:number,dpr:number){
 const demand=Math.max(.125,zoom*dpr*1.2);
 return 2**Math.ceil(Math.log2(demand));
}
export function pdfRasterRatio(width:number,height:number,requested:number,budget=PDF_PAGE_PIXELS){return Math.min(requested,Math.sqrt(budget/(width*height)));}
export function pdfDetailRegion(width:number,height:number,page:Rect,viewport:Rect):RasterBox|undefined{
 if(page.width<=0||page.height<=0||page.right<=viewport.left||page.left>=viewport.right||page.bottom<=viewport.top||page.top>=viewport.bottom)return;
 const scale=page.width/width,pad=128/scale,grid=128/scale;
 const x=Math.max(0,Math.floor(((viewport.left-page.left)/scale-pad)/grid)*grid),y=Math.max(0,Math.floor(((viewport.top-page.top)/scale-pad)/grid)*grid);
 const right=Math.min(width,Math.ceil(((viewport.right-page.left)/scale+pad)/grid)*grid),bottom=Math.min(height,Math.ceil(((viewport.bottom-page.top)/scale+pad)/grid)*grid);
 return {x,y,width:right-x,height:bottom-y};
}
export function containsRaster(outer:RasterBox,inner:RasterBox){return outer.x<=inner.x&&outer.y<=inner.y&&outer.x+outer.width>=inner.x+inner.width&&outer.y+outer.height>=inner.y+inner.height;}
