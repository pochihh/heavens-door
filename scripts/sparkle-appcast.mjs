import {readFileSync,readdirSync,mkdirSync,copyFileSync,mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function validateSigningKey(secret,publicKey){
  const seed=Buffer.from(secret.trim(),'base64');
  if(seed.length!==32||seed.toString('base64')!==secret.trim())throw new Error('Sparkle needs a base64 Ed25519 private seed.');
  const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
  const derived=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  if(derived!==publicKey)throw new Error('The signing key does not match the public key embedded in this app.');
}
export function readSigningKey(directory,publicKey){
  let secret=process.env.SPARKLE_PRIVATE_KEY;
  if(!secret){
    if(process.env.CI)throw new Error('Set the SPARKLE_PRIVATE_KEY repository secret before building a release feed.');
    const temporary=mkdtempSync(join(tmpdir(),'heavens-sparkle-key-')),file=join(temporary,'seed');
    try{
      chmodSync(temporary,0o700);
      // Use the original key-creation tool for Keychain access; updates use current upstream Sparkle.
      const extracted=spawnSync('/usr/bin/tar',['-xf',join(directory,'node_modules/electron-sparkle-updater/native/sparkle-chain.tar.xz'),'-C',temporary,'./bin/generate_keys'],{encoding:'utf8'});
      if(extracted.status!==0)throw new Error('Unable to load the Sparkle Keychain reader.');
      const result=spawnSync(join(temporary,'bin/generate_keys'),['--account','com.pochihh.heavens-door','-x',file],{encoding:'utf8'});
      if(result.status!==0)throw new Error('Unable to read the Sparkle signing key from Keychain.');
      chmodSync(file,0o600);secret=readFileSync(file,'utf8');
    }finally{rmSync(temporary,{recursive:true,force:true});}
  }
  validateSigningKey(secret,publicKey);return secret;
}
export function generateAppcast(directory=process.cwd()){
  const pkg=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
  const config=JSON.parse(readFileSync(join(directory,'build/sparkle.json'),'utf8'));
  const secret=readSigningKey(directory,config.publicEdKey),tools=join(directory,'node_modules/electron-sparkle-updater/native/vendor/bin');
  const run=(name,args,input)=>{const result=spawnSync(join(tools,name),args,{input,encoding:'utf8',stdio:input?['pipe','inherit','inherit']:['ignore','inherit','inherit']});if(result.error)throw result.error;if(result.status!==0)throw new Error(`${name} failed (${result.status}).`);};
  const release=join(directory,'release'),archives=readdirSync(release).filter(name=>name.startsWith(`Heavens-Door-${pkg.version}-mac-`)&&name.endsWith('.zip'));
  if(archives.length!==1)throw new Error('Build exactly one macOS ZIP for this version (prefer universal).');
  const output=join(release,'sparkle');mkdirSync(output,{recursive:true});
  copyFileSync(join(release,archives[0]),join(output,archives[0]));
  run('generate_appcast',['--ed-key-file','-','--download-url-prefix',`https://github.com/pochihh/heavens-door/releases/download/v${pkg.version}/`,'--maximum-deltas','0','--maximum-versions','1',output],secret);
  console.log(`Signed Sparkle feed: ${join(output,'appcast.xml')}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{generateAppcast();}catch(error){console.error(error.message);process.exitCode=1;}}
