import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nextVersion,nextTestBuild,bumpVersion} from '../scripts/version.mjs';

test('Euler versions increase, reset on minor/major changes, and reject invalid or unsafe versions',()=>{
  let version='0.1.2';for(const patch of ['27','271','2718','27182']){version=nextVersion(version);assert.equal(version,`0.1.${patch}`);}
  assert.equal(nextVersion(version,'minor'),'0.2.2');assert.equal(nextVersion(version,'major'),'1.0.2');
  for(const value of ['0.1.3','0.1.02','0.1.2-beta','garbage'])assert.throws(()=>nextVersion(value));
  assert.throws(()=>nextVersion('0.1.2718281828459045'),/numeric limit/);assert.throws(()=>nextVersion('0.1.2','unknown'));
});
test('version bump keeps package and lock versions aligned and supports a read-only preview',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'heavens-version-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const pkg={version:'0.1.2',buildNumber:1,scripts:{start:'electron .'}},lock={version:'0.1.2',packages:{'':{version:'0.1.2'},'node_modules/example':{version:'7.0.0'}}};
  await writeFile(join(dir,'package.json'),JSON.stringify(pkg));await writeFile(join(dir,'package-lock.json'),JSON.stringify(lock));
  assert.deepEqual(bumpVersion(dir,'patch',true),{version:'0.1.27',buildNumber:2});assert.deepEqual(JSON.parse(await readFile(join(dir,'package.json'),'utf8')),pkg);
  assert.deepEqual(bumpVersion(dir),{version:'0.1.27',buildNumber:2});const changed=JSON.parse(await readFile(join(dir,'package-lock.json'),'utf8'));
  assert.equal(changed.packages[''].version,'0.1.27');assert.equal(changed.packages['node_modules/example'].version,'7.0.0');
  changed.version='0.1.2';await writeFile(join(dir,'package-lock.json'),JSON.stringify(changed));assert.throws(()=>bumpVersion(dir),/versions differ/);assert.equal(JSON.parse(await readFile(join(dir,'package.json'),'utf8')).version,'0.1.27');
});

test('temporary builds increment within a stable version and restart after every kind of version bump',()=>{
  assert.deepEqual(nextTestBuild('0.1.2718'),{number:1,version:'0.1.2718-test.1'});
  const previous={number:79,version:'0.1.2718-test.79'};
  assert.deepEqual(nextTestBuild('0.1.2718',previous),{number:80,version:'0.1.2718-test.80'});
  for(const kind of ['patch','minor','major']){
    const version=nextVersion('0.1.2718',kind),first=nextTestBuild(version,previous);
    assert.deepEqual(first,{number:1,version:version+'-test.1'});
    assert.deepEqual(nextTestBuild(version,first),{number:2,version:version+'-test.2'});
  }
  assert.deepEqual(previous,{number:79,version:'0.1.2718-test.79'});
  assert.equal(nextTestBuild('0.1.27182',{number:9999,version:'0.1.2718-test.9999'}).number,1);
});
test('temporary builds reject unstable versions and invalid or exhausted counters for the current version',()=>{
  for(const version of ['0.1.2718-test.1','0.1.02','garbage'])assert.throws(()=>nextTestBuild(version),/stable/);
  for(const number of [-1,1.5,'2',9999])assert.throws(()=>nextTestBuild('0.1.2718',{number,version:'0.1.2718-test.'+number}),/counter/);
  assert.throws(()=>nextTestBuild('0.1.2718',{number:79,version:'0.1.2718-test.80'}),/counter/);
});
