import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {createPackage} from '@electron/asar';
import {fixture,feed,remote,publicRequest} from './release-fixture.mjs';
import {readRelease,releaseFiles,signedFeed,verifyDownloads,verifyArtifacts,addChecksums,readChecksums,assertFiles,verifyRemote,verifyPublic} from '../scripts/release-artifacts.mjs';

test('release metadata rejects inconsistent versions, unsafe build numbers and another update host',async t=>{
  const {root}=await fixture(t),path=join(root,'package.json'),original=JSON.parse(await fs.readFile(path));
  for(const patch of [{version:'0.1.27'},{version:'0.1.02'},{version:'0.1.2-test.1'},{buildNumber:10000},{repository:{url:'https://elsewhere.invalid/repo'}}]){
    await fs.writeFile(path,JSON.stringify({...original,...patch}));await assert.rejects(readRelease(root));
  }
  await fs.writeFile(path,JSON.stringify(original));assert.equal((await readRelease(root)).repo,'example/door');
  const sparkle=join(root,'build/sparkle.json'),config=JSON.parse(await fs.readFile(sparkle));config.feedUrl='https://example.org/appcast.xml';await fs.writeFile(sparkle,JSON.stringify(config));await assert.rejects(readRelease(root),/Unexpected update feed/);
});
test('signed appcast authenticates Unicode byte lengths and rejects tampering, wrong keys and unsigned tails',async t=>{
  const {keys,info}=await fixture(t),xml='<rss>Heaven’s Door</rss>\n',bytes=feed(xml,keys.privateKey);
  assert.equal(signedFeed(bytes,info.sparkle.publicEdKey),xml);
  const changed=Buffer.from(bytes);changed[6]^=1;
  const other=generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  for(const candidate of [changed,Buffer.concat([bytes,Buffer.from('<evil/>')]),Buffer.from(bytes.toString().replace(/length: \d+/,'length: 0'))])assert.throws(()=>signedFeed(candidate,info.sparkle.publicEdKey));
  assert.throws(()=>signedFeed(bytes,other),/signature/);assert.throws(()=>signedFeed(feed('<!DOCTYPE rss><rss/>',keys.privateKey),info.sparkle.publicEdKey),/entities/);
});
test('both update manifests and signed feed agree with installer bytes; checksums pin every upload',async t=>{
  const {root}=await fixture(t,{artifacts:true}),report=await addChecksums(root,await verifyDownloads(root));assert.equal(report.files.length,9);
  assert.equal((await fs.readFile(join(root,'release',report.files.at(-1).path),'utf8')).trim().split('\n').length,8);
  await assertFiles(join(root,'release'),report.files);
  const zip=join(root,'release',releaseFiles(report.version)[1]);await fs.appendFile(zip,'tampered');
  await assert.rejects(verifyDownloads(root),/size|checksum/);await assert.rejects(assertFiles(join(root,'release'),report.files),/changed/);
});
test('an authenticated feed still rejects stale versions, native builds and wrong download URLs',async t=>{
  const {root,keys,xml}=await fixture(t,{artifacts:true}),path=join(root,'release/sparkle/appcast.xml');
  for(const stale of [xml.replace('0.1.2</sparkle:shortVersionString>','0.1.27</sparkle:shortVersionString>'),xml.replace('1.0.0</sparkle:version>','2.0.0</sparkle:version>'),xml.replace('/download/v0.1.2/','/download/v0.1.27/')]){
    await fs.writeFile(path,feed(stale,keys.privateKey));await assert.rejects(verifyDownloads(root));
  }
});
test('Windows bundle validation follows index.html and rejects Test or incomplete apps',async t=>{
  const {root,info}=await fixture(t,{artifacts:true}),source=join(root,'.local/app'),output=join(root,'release/win-unpacked/resources/app.asar');
  await fs.mkdir(join(source,'dist/renderer/assets'),{recursive:true});await fs.mkdir(join(root,'release/win-unpacked/resources'),{recursive:true});
  const pkg={name:'heavens-door',version:info.version,buildNumber:info.buildNumber};
  await fs.writeFile(join(source,'package.json'),JSON.stringify(pkg));
  for(const name of ['main','preload','workspace-worker'])await fs.writeFile(join(source,'dist',name+'.cjs'),'engine');
  await fs.writeFile(join(source,'dist/renderer/index.html'),'<script type="module" src="./assets/current.js"></script>');
  await fs.writeFile(join(source,'dist/renderer/assets/stale.js'),'old');await fs.writeFile(join(source,'dist/renderer/assets/current.js'),'current');
  await createPackage(source,output);await verifyArtifacts(root,'win');
  await fs.rm(join(source,'dist/renderer/assets/current.js'));await createPackage(source,output);await assert.rejects(verifyArtifacts(root,'win'));
  await fs.writeFile(join(source,'package.json'),JSON.stringify({...pkg,name:'heavens-door-test'}));await createPackage(source,output);await assert.rejects(verifyArtifacts(root,'win'),/Test app/);
});
test('remote checks reject changed, missing, extra, incomplete or already-published draft assets',async t=>{
  const {root,info}=await fixture(t,{artifacts:true}),report=await verifyDownloads(root),candidate={...info,commit:'a'.repeat(40)},release=remote(candidate,report.files);
  verifyRemote(release,candidate,report.files);
  for(const mutate of [r=>r.assets.pop(),r=>r.assets.push({...r.assets[0],name:'extra'}),r=>r.assets[0].digest='sha256:bad',r=>r.assets[0].state='starter',r=>r.draft=false,r=>r.target_commitish='b'.repeat(40)]){
    const changed=structuredClone(release);mutate(changed);assert.throws(()=>verifyRemote(changed,candidate,report.files));
  }
});
test('public verification uses anonymous latest links and checks downloads, metadata and the live feed',async t=>{
  const {root,info}=await fixture(t,{artifacts:true}),report=await addChecksums(root,await verifyDownloads(root)),requests=[];
  await verifyPublic(info,report.files,publicRequest(root,info,report.files,requests));assert.equal(requests.length,8);
  assert.ok(requests.every(({options})=>!options.headers?.Authorization));assert.equal(requests.filter(({options})=>options.method==='HEAD').length,3);
  await assert.rejects(verifyPublic(info,report.files,async()=>new Response('no',{status:403})),/unavailable/);
  const fetch=publicRequest(root,info,report.files);await assert.rejects(verifyPublic(info,report.files,(url,options)=>url.endsWith('appcast.xml')?new Response('wrong feed'):fetch(url,options)),/metadata differs/);
});


test('existing checksum manifests validate in any order without rewriting published bytes',async t=>{
  const {root}=await fixture(t,{artifacts:true}),report=await verifyDownloads(root);await addChecksums(root,report);
  const path=join(root,'release/Heavens-Door-'+report.version+'-SHA256SUMS.txt'),original=await fs.readFile(path,'utf8'),reordered=original.trimEnd().split('\n').reverse().join('\n')+'\n';
  await fs.writeFile(path,reordered);const checked=await readChecksums(root,report);assert.equal(checked.files.length,9);assert.equal(await fs.readFile(path,'utf8'),reordered);
  const lines=reordered.trimEnd().split('\n');lines[1]=lines[0];await fs.writeFile(path,lines.join('\n'));await assert.rejects(readChecksums(root,report),/duplicate/);
  await fs.writeFile(path,reordered.replace(/^[a-f0-9]{64}/,'0'.repeat(64)));await assert.rejects(readChecksums(root,report),/Checksum differs/);
});
