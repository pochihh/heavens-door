import {readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const euler='271828182845904523536028747135266249775724709369995';
export function nextVersion(version,kind='patch') {
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))throw new Error('Use a stable major.minor.patch version.');
  const [major,minor,patch]=version.split('.');let next;
  if(kind==='major')next=`${BigInt(major)+1n}.0.2`;
  else if(kind==='minor')next=`${major}.${BigInt(minor)+1n}.2`;
  else if(kind==='patch'){
    if(!euler.startsWith(patch))throw new Error('The patch must be a prefix of Euler’s number.');
    next=`${major}.${minor}.${euler.slice(0,patch.length+1)}`;
    if(patch.length>=euler.length)throw new Error('Euler digits exhausted; bump the minor version.');
  }else throw new Error('Choose patch, minor, or major.');
  if(next.split('.').some(part=>BigInt(part)>BigInt(Number.MAX_SAFE_INTEGER)))throw new Error('Version exceeds the updater’s numeric limit; bump the minor version.');
  return next;
}
export function bumpVersion(directory,kind='patch',dryRun=false) {
  const files=['package.json','package-lock.json'].map(name=>join(directory,name)),original=files.map(file=>readFileSync(file,'utf8')),data=original.map(text=>JSON.parse(text)),[pkg,lock]=data;
  if(lock.version!==pkg.version||lock.packages?.['']?.version!==pkg.version)throw new Error('Package and lock versions differ; run npm install first.');
  if(!Number.isInteger(pkg.buildNumber)||pkg.buildNumber<1||pkg.buildNumber>=9999)throw new Error('Build number must be between 1 and 9998.');
  const version=nextVersion(pkg.version,kind),result={version,buildNumber:pkg.buildNumber+1};
  if(dryRun)return result;
  pkg.version=lock.version=lock.packages[''].version=version;pkg.buildNumber=result.buildNumber;
  const temporary=files.map(file=>file+'.'+randomUUID()+'.tmp');let written=0;
  try{data.forEach((value,i)=>writeFileSync(temporary[i],JSON.stringify(value,null,2)+'\n',{flag:'wx'}));files.forEach((file,i)=>{renameSync(temporary[i],file);written++;});}
  catch(error){for(let i=0;i<written;i++)writeFileSync(files[i],original[i]);throw error;}
  finally{temporary.forEach(file=>rmSync(file,{force:true}));}
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2),dryRun=args.includes('--dry-run'),kind=args.filter(arg=>arg!=='--dry-run');if(kind.length>1)throw new Error('Usage: npm run version:bump -- [patch|minor|major] [--dry-run]');const result=bumpVersion(process.cwd(),kind[0]??'patch',dryRun);console.log(`${dryRun?'Next':'Updated'} version: ${result.version} (build ${result.buildNumber})`);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
