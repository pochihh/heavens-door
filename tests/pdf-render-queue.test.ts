import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pausePdfRendering,queuePdfRender} from '../src/renderer/pdf-render-queue';

test('PDFs share one paint continuation per frame, with cancellation and fair requeueing',()=>{
 const originalFrame=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame,frames=new Map<number,FrameRequestCallback>();let id=0;
 globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};globalThis.cancelAnimationFrame=id=>{frames.delete(id);};
 const tick=()=>{assert.equal(frames.size,1);const [id,callback]=frames.entries().next().value!;frames.delete(id);callback(0);},painted:string[]=[];
 try{
  queuePdfRender(()=>{painted.push('first');queuePdfRender(()=>painted.push('first continued'));});
  const cancel=queuePdfRender(()=>painted.push('cancelled'));queuePdfRender(()=>painted.push('second'));cancel();
  tick();assert.deepEqual(painted,['first']);tick();assert.deepEqual(painted,['first','second']);tick();assert.deepEqual(painted,['first','second','first continued']);assert.equal(frames.size,0);
  const cancelLast=queuePdfRender(()=>painted.push('unmounted'));cancelLast();assert.equal(frames.size,0);
 }finally{globalThis.requestAnimationFrame=originalFrame;globalThis.cancelAnimationFrame=originalCancel;}
});


test('camera motion pauses new painting until the gesture has settled',async()=>{
 const originalFrame=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame,frames=new Map<number,FrameRequestCallback>();let id=0,painted=false;
 globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};globalThis.cancelAnimationFrame=id=>{frames.delete(id);};
 try{
  queuePdfRender(()=>{painted=true;});pausePdfRendering();assert.equal(frames.size,0);
  await new Promise(resolve=>setTimeout(resolve,100));pausePdfRendering();await new Promise(resolve=>setTimeout(resolve,100));assert.equal(frames.size,0,'continued navigation postpones painting');
  await new Promise(resolve=>setTimeout(resolve,80));assert.equal(frames.size,1);const [id,callback]=frames.entries().next().value!;frames.delete(id);callback(0);assert.equal(painted,true);assert.equal(frames.size,0);
 }finally{globalThis.requestAnimationFrame=originalFrame;globalThis.cancelAnimationFrame=originalCancel;}
});
