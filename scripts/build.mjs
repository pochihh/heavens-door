import { build as bundle } from 'esbuild';
import { build } from 'vite';
export async function buildEngine() {
  await bundle({ entryPoints: ['src/main.ts', 'src/preload.ts', 'src/workspace-worker.ts'],
    bundle: true, platform: 'node', target: 'node24', format: 'cjs', outdir: 'dist',
    outExtension: { '.js': '.cjs' }, external: ['electron'], packages: 'external', sourcemap: true });
}
if (process.argv[1]?.endsWith('build.mjs')) { await buildEngine(); await build(); }
