import {useLayoutEffect,useRef} from 'react';
import type {PdfPageBox} from './annotation-layout';

// Only the open note is traced, so a page full of highlights stays readable.
export function PdfNoteLink({id,color,pages}:{id?:string;color?:string;pages:PdfPageBox[]}){
 const svg=useRef<SVGSVGElement>(null);
 useLayoutEffect(()=>{
  const el=svg.current!,root=el.parentElement!;el.style.visibility='hidden';if(!id)return;
  let frame=0,until=0;
  const note=root.querySelector<HTMLElement>(`[data-note-id="${id}"]`),marks=[...root.querySelectorAll<HTMLElement>(`.pdf-highlight[data-annotation="${id}"]`)];
  if(!note||!marks.length)return;
  const draw=()=>{
   const origin=root.getBoundingClientRect(),ratio=origin.width/root.offsetWidth||1,n=note.getBoundingClientRect(),y=n.top+Math.min(18*ratio,n.height/2);
   const mark=marks.map(m=>m.getBoundingClientRect()).filter(r=>r.width&&r.height).sort((a,b)=>Math.abs((a.top+a.bottom)/2-y)-Math.abs((b.top+b.bottom)/2-y))[0];
   if(!mark){el.style.visibility='hidden';return;}
   const x1=(mark.right-origin.left)/ratio+root.scrollLeft,y1=((mark.top+mark.bottom)/2-origin.top)/ratio+root.scrollTop,x2=(n.left-origin.left)/ratio+root.scrollLeft-12,y2=(y-origin.top)/ratio+root.scrollTop;
   const line=el.querySelector('line')!;for(const [key,value] of Object.entries({x1,y1,x2,y2}))line.setAttribute(key,String(value));el.style.visibility='visible';
  };
  const tick=()=>{frame=0;draw();if(performance.now()<until)frame=requestAnimationFrame(tick);};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(tick);};
  const animate=()=>{until=performance.now()+400;schedule();};
  draw();const observer=new ResizeObserver(schedule);[root,note,note.parentElement!,...marks.map(m=>m.parentElement!)].forEach(target=>observer.observe(target));
  root.addEventListener('scroll',schedule,true);root.addEventListener('transitionrun',animate,true);animate();
  return()=>{observer.disconnect();cancelAnimationFrame(frame);root.removeEventListener('scroll',schedule,true);root.removeEventListener('transitionrun',animate,true);};
 },[id,pages]);
 return <svg ref={svg} className="pdf-note-link" aria-hidden="true" style={{color:color??'var(--muted)',visibility:'hidden'}}><line vectorEffect="non-scaling-stroke"/></svg>;
}
