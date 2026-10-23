// Diagnostic only: count pages that actually intersect the reading viewport.
export function pdfDensity(viewport:HTMLElement,dpr=window.devicePixelRatio||1){
 const view=viewport.getBoundingClientRect(),values:number[]=[];let textReady=0;
 for(const page of viewport.querySelectorAll<HTMLElement>('.pdf-page')){
  const p=page.getBoundingClientRect();if(p.width<=0||p.height<=0||p.right<=view.left||p.left>=view.right||p.bottom<=view.top||p.top>=view.bottom)continue;
  const base=page.querySelector<HTMLCanvasElement>(':scope>canvas');let density=(base?.dataset.benchRendered||base?.dataset.pdfPainted)?base.width/(p.width*dpr):0;
  const detail=page.querySelector<HTMLCanvasElement>('.pdf-detail-canvas');
  if(detail?.dataset.benchRendered||detail?.dataset.pdfPainted){const r=detail.getBoundingClientRect();if(r.width>0&&r.left<=Math.max(p.left,view.left)+1&&r.right>=Math.min(p.right,view.right)-1&&r.top<=Math.max(p.top,view.top)+1&&r.bottom>=Math.min(p.bottom,view.bottom)-1)density=Math.max(density,detail.width/(r.width*dpr));}
  values.push(density);const layer=page.querySelector<HTMLElement>('.textLayer');if(layer?.dataset.benchTextReady==='true'||layer?.dataset.pdfTextReady==='true')textReady++;
 }
 return {pages:values.length,minimum:values.length?Math.min(...values):0,textReady};
}
