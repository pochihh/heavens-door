import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nextVersion,bumpVersion} from '../scripts/version.mjs';

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
