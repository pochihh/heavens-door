import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';

if(process.platform!=='darwin')throw new Error('Sparkle builds require macOS.');
const version='2.10.0',sha='c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c';
const require=createRequire(import.meta.url),root=process.cwd(),cache=join(root,'.local'),archive=join(cache,`Sparkle-${version}.tar.xz`);
await fs.mkdir(cache,{recursive:true});
let bytes;
try{bytes=await fs.readFile(archive);}catch(error){if(error.code!=='ENOENT')throw error;}
if(!bytes){const response=await fetch(`https://github.com/sparkle-project/Sparkle/releases/download/${version}/Sparkle-${version}.tar.xz`,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Sparkle download failed: '+response.status);bytes=Buffer.from(await response.arrayBuffer());}
if(createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('The official Sparkle archive checksum does not match.');
await fs.writeFile(archive,bytes);
const extracted=join(cache,`sparkle-${version}`);await fs.rm(extracted,{recursive:true,force:true});await fs.mkdir(extracted);
const run=(command,args,cwd=root)=>{const result=spawnSync(command,args,{cwd,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`${command} failed (${result.status}).`);};
run('/usr/bin/tar',['-xf',archive,'-C',extracted]);
const native=join(dirname(require.resolve('electron-sparkle-updater')),'../native'),vendor=join(native,'vendor');
// Compile the bridge against current upstream Sparkle, bypassing its older patched framework.
await fs.rm(vendor,{recursive:true,force:true});await fs.mkdir(vendor);
for(const name of ['Sparkle.framework','bin'])await fs.cp(join(extracted,name),join(vendor,name),{recursive:true,verbatimSymlinks:true});
const gyp=require.resolve('node-gyp/bin/node-gyp.js',{paths:[native]}),electron=require('electron/package.json').version;
const binary=join(native,'build/Release/sparkle_bridge.node'),arm=join(cache,'sparkle-bridge-arm64.node');
for(const arch of ['arm64','x64']){run(process.execPath,[gyp,'rebuild',`--target=${electron}`,`--arch=${arch}`,'--dist-url=https://electronjs.org/headers'],native);if(arch==='arm64')await fs.copyFile(binary,arm);}
run('/usr/bin/lipo',['-create',arm,binary,'-output',join(cache,'sparkle-bridge-universal.node')]);
await fs.copyFile(join(cache,'sparkle-bridge-universal.node'),binary);
run('/usr/bin/lipo',[binary,'-verify_arch','arm64','x86_64']);
console.log(`Sparkle ${version}: official framework verified; universal bridge ready.`);
