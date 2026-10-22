/* eslint-disable @typescript-eslint/no-explicit-any -- isolated native instrumentation */
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Whiteboard} from '../../src/renderer/Board';
import {retainedSnapshot,compareSnapshot} from './retained-snapshot';
import {gpuEdges} from './webgl-edges';
import {boardFixture} from './board-fixture';
import '../../src/renderer/styles.css';
const fixture=boardFixture(),bench:any=(window as any).__boardBench={fixture,requests:0,saves:0,errors:[],longTasks:[]};
window.addEventListener('error',e=>bench.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>bench.errors.push(String(e.reason)));
new PerformanceObserver(list=>bench.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
(window as any).door={platform:'darwin',request:async(request:any)=>{bench.requests++;if(request.kind==='card')return fixture.bodies.get(request.path);if(request.kind==='cardMentions')return [];throw Error('Unexpected fixture request '+request.kind);},attachmentData:async()=>Uint8Array.from(atob((window as any).__pdfBase64),c=>c.charCodeAt(0)).buffer,assetUrl:(path:string)=>fixture.images.get(path)??''};
bench.startSnapshot=retainedSnapshot;bench.compareSnapshot=compareSnapshot;
bench.startGpu=()=>gpuEdges(document.querySelector('.canvas')!,bench.board,()=>bench.navigation.current);
function App(){
 const [board,setBoard]=useState(fixture.board),[draft,setDraft]=useState<any>(null);
 bench.setDraft=setDraft;bench.board=board;
 return <Whiteboard adaptiveDetail={(window as any).__boardMode.startsWith('overview')} board={board} cards={fixture.cards} boards={fixture.boards} initialCamera={{x:20,y:20,zoom:.8}} onCamera={c=>bench.camera=c} onSave={b=>{bench.saves++;setBoard(b);}} onOpen={path=>setDraft({card:fixture.bodies.get(path),body:fixture.bodies.get(path)!.body})} draft={draft} onEdit={body=>setDraft((d:any)=>({...d,body}))} onFinish={()=>setDraft(null)} onCreate={()=>{}} onOpenCard={()=>{}}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
