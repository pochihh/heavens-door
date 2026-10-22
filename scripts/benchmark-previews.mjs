// Isolated, bounded DOM-to-preview comparison. Never opens a user workspace.
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import electron from 'electron';
import {build} from 'vite';
import {readerPdf} from './reader-fixture.mjs';
import {preparePdfAssets} from './build.mjs';
const root=process.cwd(),label=process.argv[2]??'bounded',smoke=process.argv.includes('--smoke'),soak=process.argv.includes('--soak');assert.match(label,/^[a-z0-9-]+$/);
const folder=join(root,'.local/preview-benchmark',label),project=join(folder,'project'),output=join(project,'renderer');await fs.mkdir(project,{recursive:true});await preparePdfAssets();
const sourceHash=createHash('sha256'),renderer=(await fs.readdir(join(root,'src'),{recursive:true})).filter(p=>/\.(tsx?|css)$/.test(p)).sort().map(p=>'src/'+p);for(const path of [...renderer,'scripts/benchmark-previews.mjs','scripts/performance/preview-harness.tsx','scripts/performance/preview-cache.ts','scripts/performance/preview-snapshot.ts','scripts/performance/preview-native.cjs','scripts/performance/preview.html','scripts/performance/board-fixture.ts','package-lock.json'])sourceHash.update(path+'\n').update(await fs.readFile(join(root,path)));
await build({configFile:false,root:join(root,'scripts/performance'),base:'./',publicDir:join(root,'public'),define:{__HEAVENS_TEST__:'true'},plugins:[{name:'preview-paint-probe',transform(code,id){if(id.endsWith('/src/renderer/PdfReader.tsx'))return code.replaceAll('await render.promise;',"await render.promise;element.dataset.benchPainted='true';");}}],build:{outDir:output,emptyOutDir:true,rollupOptions:{input:join(root,'scripts/performance/preview.html')}}});
const html=join(output,'preview.html');await fs.writeFile(html,(await fs.readFile(html,'utf8')).replace('<head>','<head><script>window.__previewPdf='+JSON.stringify(Buffer.from(readerPdf()).toString('base64'))+'</script>'));
await fs.writeFile(join(project,'package.json'),JSON.stringify({name:'bounded-preview-benchmark',version:'0.0.1',main:'main.cjs'}));
const config={folder,html,smoke,soak,machine:{platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model},sourceFingerprint:sourceHash.digest('hex')};await fs.writeFile(join(project,'main.cjs'),(await fs.readFile(join(root,'scripts/performance/preview-native.cjs'),'utf8')).replace('const config=__CONFIG__;','const config='+JSON.stringify(config)+';'));
const report=join(folder,'report.json');await fs.rm(report,{force:true});const child=spawn(electron,[project],{stdio:'inherit'}),timer=setTimeout(()=>child.kill(),600000);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);const result=JSON.parse(await fs.readFile(report,'utf8'));console.log(JSON.stringify(result,null,2));assert.equal(code,0);assert.equal(result.passed,true);
