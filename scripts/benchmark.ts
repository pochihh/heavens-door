import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { Workspace } from '../src/core/workspace';

const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-benchmark-'));
const root=join(folder,'notes'); await fs.mkdir(root);
// Isolate index timings from the initial Git import, which depends on asset storage.
execFileSync('git',['init','-q'],{cwd:root});
for (let start=0;start<10000;start+=100) {
  await Promise.all(Array.from({length:100},(_,offset) => {
    const i=start+offset;
    return fs.writeFile(join(root,`card-${i}.md`),`---\ncard-id: benchmark-${i}\n---\n# Card ${i}\n\nResearch about ${i%2 ? 'neuroscience' : 'mathematics'}.\n\n${'A thought and its context. '.repeat(40)}\n\n[Related](card:benchmark-${(i+1)%10000})\n`);
  }));
}
const begin=performance.now();
const workspace=await Workspace.open(root,join(folder,'cache'));
const indexed=performance.now();
const times:number[]=[];
for (let i=0;i<100;i++) { const start=performance.now(); workspace.query(i%2 ? 'neuroscience' : 'backlinks:benchmark-100'); times.push(performance.now()-start); }
times.sort((a,b) => a-b);
const start=performance.now(),snapshot=workspace.snapshot(),end=performance.now();
workspace.close();
const warmStart=performance.now(); const reopened=await Workspace.open(root,join(folder,'cache')); const warmEnd=performance.now();
console.log(JSON.stringify({cards:snapshot.cards.length,indexSeconds:Number(((indexed-begin)/1000).toFixed(2)),warmOpenSeconds:Number(((warmEnd-warmStart)/1000).toFixed(2)),queryMedianMs:Number(times[50].toFixed(2)),queryP95Ms:Number(times[95].toFixed(2)),metadataSnapshotMs:Number((end-start).toFixed(2)),snapshotKB:Math.round(JSON.stringify(snapshot).length/1024)},null,2));
reopened.close(); await fs.rm(folder,{recursive:true,force:true});
