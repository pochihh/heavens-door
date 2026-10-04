// Canvas navigation paints transforms without rerendering the editor tree.
// Keep fixed editor controls in that same frame, including during pan/zoom inertia.
export function trackEditorOverlay(anchor:HTMLElement,position:()=>void){
  const world=anchor.closest('.board-world'),win=anchor.ownerDocument.defaultView!,doc=anchor.ownerDocument;
  const movement=new MutationObserver(position);if(world)movement.observe(world,{attributes:true,attributeFilter:['style']});
  const resize=new ResizeObserver(position);resize.observe(anchor);
  doc.addEventListener('scroll',position,true);win.addEventListener('resize',position);position();
  return()=>{movement.disconnect();resize.disconnect();doc.removeEventListener('scroll',position,true);win.removeEventListener('resize',position);};
}
