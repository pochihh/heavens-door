import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function compareBoardBenchmarks(reports){
 assert.equal(reports.length,3,'Compare baseline, Canvas and WebGL from the same source.');
 const first=reports[0];assert.ok(first.sourceFingerprint,'Source fingerprint required');
 assert.deepEqual(reports.map(r=>r.mode),['baseline','snapshot-canvas','snapshot-webgl']);
 for(const report of reports){
  assert.equal(report.passed,true,'Harness must finish successfully');assert.equal(report.elements,10000);
  assert.equal(report.sourceFingerprint,first.sourceFingerprint,'Source changed between runs');assert.deepEqual(report.viewport,first.viewport,'Viewport changed between runs');assert.deepEqual(report.machine,first.machine,'Reference machine changed');
  assert.equal(report.overviewSource.placements,6000);assert.equal(report.overviewSource.images,1300);assert.equal(report.overviewSource.paintedPdfCanvases,80,'Wait for all PDF previews');
  if(report.snapshot){assert.ok(report.snapshot.headroom>=1.2);assert.ok(report.snapshot.bytes<=64_000_000);assert.ok(report.snapshot.visual.meanAbsoluteError<=2);assert.ok(report.snapshot.visual.changedFraction<=.02);}
 }
 return {sourceFingerprint:first.sourceFingerprint,machine:first.machine,viewport:first.viewport,rows:reports.map(r=>({mode:r.mode,readableP95:r.readablePan.p95,panP95:r.overviewPan.p95,zoomP95:r.overviewZoom.p95,panSamples:r.overviewPan.samples,zoomSamples:r.overviewZoom.samples,budgetPassed:r.budgetPassed,featureParity:r.featureParity,snapshot:r.snapshot,rendererMemory:r.rendererMemory})),adoptionGatesPassed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const labels=process.argv.slice(2);assert.equal(labels.length,3,'Usage: node scripts/compare-board-benchmarks.mjs <baseline-label> <canvas-label> <webgl-label>');for(const label of labels)assert.match(label,/^[a-z0-9-]+$/);
 const root=join(process.cwd(),'.local/board-benchmark'),reports=await Promise.all(labels.map(label=>readFile(join(root,label,'report.json'),'utf8').then(JSON.parse))),summary=compareBoardBenchmarks(reports);
 await writeFile(join(root,'comparison.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}
