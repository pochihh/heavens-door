import { defineConfig } from 'vite';
export default defineConfig({ define:{__HEAVENS_TEST__:JSON.stringify(process.env.HEAVENS_DOOR_TEST_BUILD==='1')},root: 'src/renderer', publicDir:'../../public', base: './', build: { outDir: '../../dist/renderer', emptyOutDir: false } });
