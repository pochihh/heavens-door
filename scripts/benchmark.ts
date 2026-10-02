import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import {newViewBlock,writeViewBlock} from '../src/view-block';
import { Workspace } from '../src/core/workspace';

const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-benchmark-'));
const root=join(folder,'notes'); await fs.mkdir(root);
// Isolate index timings from the initial Git import, which depends on asset storage.
execFileSync('git',['init','-q'],{cwd:root});
for (let start=0;start<10000;start+=100) {
  await Promise.all(Array.from({length:100},(_,offset) => {
    const i=start+offset;
    return fs.writeFile(join(root,`card-${i}.md`),`---\ncard-id: benchmark-${i}\ntags: [research]\npriority: ${i%5}\nresearch/Status: ${i%2?"Todo":"Done"}\nresearch/location: ${i%2?"臺北 Taipei":"京都 Kyoto"}\n---\n# Card ${i}\n\nResearch about ${i%2 ? 'neuroscience' : 'mathematics'}.\n\n${'A thought and its context. '.repeat(40)} ${i%2?'繁體中文機器學習筆記':'简体中文机器学习笔记'}\n\n[Related](card:benchmark-${(i+1)%10000})\n`);
  }));
}
for(let i=0;i<100;i++)await fs.writeFile(join(root,`research-${i}.tag`),`---\ntag: research-${i}\nfields: []\n---\n`);
await fs.writeFile(join(root,'research.tag'),'---\ntag: research\nfields:\n  - key: Status\n    type: select\n    options: [Todo, Done]\n---\n');
const block=newViewBlock('research');block.views=[{id:'board',name:'Board',type:'kanban',groupBy:'research/Status',order:{Todo:['benchmark-9999','benchmark-1']}}];
const kanbanSource=writeViewBlock('',block);
const begin=performance.now();
const workspace=await Workspace.open(root,join(folder,'cache'));
const indexed=performance.now();
const queries={
  kanban:()=>workspace.viewCards(kanbanSource,'board'),
  tagSuggestion:()=>workspace.queryTags('researh'),property:()=>workspace.queryCards({text:'taipai'}),global:()=>workspace.searchWorkspace('research'),
  prefix:()=>workspace.query('neurosc'),fuzzy:()=>workspace.query('neurosceince'),
  chinese:()=>workspace.query('机器学习'),mixed:()=>workspace.query('mathematics 學習'),
  structured:()=>workspace.queryCards({text:'学习',tag:'research',properties:[{field:'priority',op:'gte',value:3}]}),
  backlink:()=>workspace.query('backlinks:benchmark-100'),
};
const timings:Record<string,{medianMs:number;p95Ms:number}>={};
for(const [name,query] of Object.entries(queries)){
  const times:number[]=[];
  for(let i=0;i<40;i++){const start=performance.now();query();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);timings[name]={medianMs:Number(times[20].toFixed(2)),p95Ms:Number(times[38].toFixed(2))};
}
const start=performance.now(),snapshot=workspace.snapshot(),end=performance.now();
workspace.close();
const warmStart=performance.now(); const reopened=await Workspace.open(root,join(folder,'cache')); const warmEnd=performance.now();
console.log(JSON.stringify({cards:snapshot.cards.length,indexSeconds:Number(((indexed-begin)/1000).toFixed(2)),warmOpenSeconds:Number(((warmEnd-warmStart)/1000).toFixed(2)),queries:timings,metadataSnapshotMs:Number((end-start).toFixed(2)),snapshotKB:Math.round(JSON.stringify(snapshot).length/1024)},null,2));
reopened.close(); await fs.rm(folder,{recursive:true,force:true});
