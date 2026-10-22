// All readers share one painting budget; a board of PDFs must still leave time for input.
const pending=new Set<()=>void>();
let frame=0,resume:ReturnType<typeof setTimeout>|undefined;
function paint(){
 frame=0;const next=pending.values().next().value;
 try{if(next){pending.delete(next);next();}}
 finally{if(pending.size&&!frame&&!resume)frame=requestAnimationFrame(paint);}
}
export function queuePdfRender(continuation:()=>void){
 pending.add(continuation);if(!frame&&!resume)frame=requestAnimationFrame(paint);
 return()=>{pending.delete(continuation);if(!pending.size){cancelAnimationFrame(frame);frame=0;}};
}

export function pausePdfRendering(){
 cancelAnimationFrame(frame);frame=0;clearTimeout(resume);
 resume=setTimeout(()=>{resume=undefined;if(pending.size&&!frame)frame=requestAnimationFrame(paint);},150);
}
