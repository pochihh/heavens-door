// Measure native thin scrollbars once; the observer also follows OS visibility changes.
export function installScrollbarSpace(doc:Document=document){
  const probe=doc.createElement('div');
  probe.setAttribute('aria-hidden','true');
  probe.style.cssText='position:fixed;left:-1000px;top:-1000px;width:100px;height:100px;overflow:scroll;visibility:hidden;pointer-events:none;contain:strict;border:0;padding:0';
  doc.body.append(probe);
  const update=()=>doc.documentElement.style.setProperty('--scrollbar-space',`${probe.offsetWidth-probe.clientWidth}px`);
  update();
  const observer=new ResizeObserver(update);observer.observe(probe);
  return()=>{observer.disconnect();probe.remove();};
}
