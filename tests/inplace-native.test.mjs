import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import electron from 'electron';

test('native text geometry stays stable across scrollbars and in-place edge labels',{timeout:25000},async t=>{
 const profile=await fs.mkdtemp(join(tmpdir(),'heavens-geometry-'));t.after(()=>fs.rm(profile,{recursive:true,force:true}));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 // This fixture loads only local CSS and fixed markup; headless CI has no usable Chromium sandbox.
 const args=[...process.platform==='linux'?['--no-sandbox']:[],fileURLToPath(new URL('../scripts/check-scrollbars.mjs',import.meta.url)),profile],headless=process.platform==='linux'&&!env.DISPLAY&&!env.WAYLAND_DISPLAY;
 const {stdout}=await promisify(execFile)(headless?'xvfb-run':electron,headless?['-a',electron,...args]:args,{env,timeout:20000,maxBuffer:1024*1024});
 const results=JSON.parse(stdout.trim().split('\n').at(-1));assert.deepEqual(results.map(r=>r.mode),['native','classic','zero-gutter']);assert.ok(results.every(r=>r.edgeLabels===90));
});
