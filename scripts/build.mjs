import { build as bundle } from 'esbuild';
import { build } from 'vite';
import {promises as fs} from 'node:fs';
export async function buildEngine() {
  await fs.mkdir('public/pdf-assets',{recursive:true});await fs.copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','public/pdf-assets/pdf.worker.min.mjs');for(const folder of ['cmaps','standard_fonts','wasm'])await fs.cp('node_modules/pdfjs-dist/'+folder,'public/pdf-assets/'+folder,{recursive:true});
  await bundle({ entryPoints: ['src/main.ts', 'src/preload.ts', 'src/workspace-worker.ts'],
    define:{__HEAVENS_TEST__:JSON.stringify(process.env.HEAVENS_DOOR_TEST_BUILD==='1')},bundle: true, platform: 'node', target: 'node24', format: 'cjs', outdir: 'dist',
    outExtension: { '.js': '.cjs' }, external: ['electron'], packages: 'external', sourcemap: true });
}
if (process.argv[1]?.endsWith('build.mjs')) { await buildEngine(); await build(); }
