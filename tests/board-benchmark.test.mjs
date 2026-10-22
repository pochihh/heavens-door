import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareBoardBenchmarks} from '../scripts/compare-board-benchmarks.mjs';
const reports=()=>['baseline','snapshot-canvas','snapshot-webgl'].map(mode=>({mode,passed:true,elements:10000,sourceFingerprint:'same',machine:{platform:'darwin',arch:'arm64'},viewport:{width:1600,height:968,dpr:2},overviewSource:{placements:6000,images:1300,paintedPdfCanvases:80},readablePan:{p95:18},overviewPan:{p95:19,samples:180},overviewZoom:{p95:19,samples:180},budgetPassed:true,featureParity:false,...(mode==='baseline'?{}:{snapshot:{bytes:56_000_000,headroom:1.5,visual:{meanAbsoluteError:.01,changedFraction:0}}})}));
test('renderer comparisons require matching sources and completely painted assets',()=>{
 const input=reports();assert.equal(compareBoardBenchmarks(input).adoptionGatesPassed,false,'smooth warmed frames do not establish production readiness');
 input[1].sourceFingerprint='different';assert.throws(()=>compareBoardBenchmarks(input),/Source changed/);
 input[1].sourceFingerprint='same';input[2].overviewSource.paintedPdfCanvases=0;assert.throws(()=>compareBoardBenchmarks(input),/PDF previews/);
 input[2].overviewSource.paintedPdfCanvases=80;input[1].snapshot.visual.meanAbsoluteError=20;assert.throws(()=>compareBoardBenchmarks(input));
});
