import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {createReadStream,promises as fs} from 'node:fs';
import {join,basename,dirname} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';

export async function atomicJSON(path,value){
  await fs.mkdir(dirname(path),{recursive:true});
  const temporary=path+'.'+process.pid+'.tmp';
  try{await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(temporary,path);}
  finally{await fs.rm(temporary,{force:true});}
}
export async function readRelease(root){
  const pkg=JSON.parse(await fs.readFile(join(root,'package.json'),'utf8')),lock=JSON.parse(await fs.readFile(join(root,'package-lock.json'),'utf8'));
  assert.match(pkg.version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'A stable version is required');
  assert.ok(pkg.version.split('.').every(n=>Number.isSafeInteger(Number(n))),'Version exceeds numeric limits');
  assert.equal(lock.version,pkg.version,'Package and lock versions differ');assert.equal(lock.packages?.['']?.version,pkg.version,'Root lock version differs');
  assert.ok(Number.isInteger(pkg.buildNumber)&&pkg.buildNumber>0&&pkg.buildNumber<=9999,'Invalid native build number');
  const repo=pkg.repository?.url?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];assert.ok(repo,'Use a GitHub repository URL in package.json');
  const sparkle=JSON.parse(await fs.readFile(join(root,'build/sparkle.json'),'utf8'));
  assert.equal(sparkle.feedUrl,'https://github.com/'+repo+'/releases/latest/download/appcast.xml','Unexpected update feed');
  assert.match(sparkle.publicEdKey,/^[A-Za-z0-9+/]{43}=$/,'Invalid Sparkle public key');
  return {version:pkg.version,buildNumber:pkg.buildNumber,repo,sparkle,tag:'v'+pkg.version};
}
export function releaseFiles(version,platform='all'){
  assert.ok(['all','mac','win'].includes(platform),'Choose all, mac or win');
  const mac='Heavens-Door-'+version+'-mac-universal',win='Heavens-Door-'+version+'-win-x64.exe';
  return [...(platform!=='win'?[mac+'.dmg',mac+'.zip',mac+'.zip.blockmap','latest-mac.yml','sparkle/appcast.xml']:[]),...(platform!=='mac'?[win,win+'.blockmap','latest.yml']:[])];
}
export function checksumName(version){return 'Heavens-Door-'+version+'-SHA256SUMS.txt';}
export async function hashFile(path,algorithm='sha256'){
  assert.ok((await fs.lstat(path)).isFile(),'Missing regular artifact: '+path);
  const hash=createHash(algorithm);for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest(algorithm==='sha512'?'base64':'hex');
}
export async function describeFiles(folder,files){
  return Promise.all(files.map(async path=>({path,name:basename(path),size:(await fs.stat(join(folder,path))).size,sha256:await hashFile(join(folder,path))})));
}
export async function assertFiles(folder,files){
  for(const file of files){assert.equal((await fs.stat(join(folder,file.path))).size,file.size,'Artifact size changed: '+file.name);assert.equal(await hashFile(join(folder,file.path)),file.sha256,'Artifact changed: '+file.name);}
}
export function publicKey(value){
  const bytes=Buffer.from(value,'base64');assert.equal(bytes.length,32,'Invalid public key');
  return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),bytes]),format:'der',type:'spki'});
}
// Sparkle signs exactly the prefix whose byte length is recorded in its final signature comment.
export function signedFeed(bytes,key){
  assert.ok(bytes.length<1024*1024,'Oversized appcast');
  const start=bytes.lastIndexOf('<!-- sparkle-signatures:'),footer=start<0?'':bytes.subarray(start).toString();
  const signature=footer.match(/^<!-- sparkle-signatures:\nedSignature: ([A-Za-z0-9+/]{86}==)\nlength: (\d+)\n-->\n?$/);
  assert.ok(signature,'Missing or malformed appcast signature');assert.equal(Number(signature[2]),start,'Unsigned appcast data');
  assert.ok(verify(null,bytes.subarray(0,start),publicKey(key),Buffer.from(signature[1],'base64')),'Invalid appcast signature');
  const xml=bytes.subarray(0,start).toString();assert.ok(!/<!DOCTYPE|<!ENTITY/i.test(xml),'Unsupported appcast entities');return xml;
}
async function boundedText(path){const stat=await fs.stat(path);assert.ok(stat.size<=1024*1024,'Oversized metadata: '+path);return fs.readFile(path,'utf8');}
async function manifest(folder,name,filename,version){
  const {parse}=await import('yaml'),data=parse(await boundedText(join(folder,name)));
  assert.equal(data.version,version,'Wrong update version: '+name);assert.equal(data.files?.length,1,'Unexpected update files: '+name);
  const entry=data.files[0];assert.equal(entry.url,filename,'Wrong update URL: '+name);assert.equal(data.path,filename,'Wrong legacy update URL: '+name);
  const file=join(folder,filename),hash=await hashFile(file,'sha512');assert.equal(entry.size,(await fs.stat(file)).size,'Wrong update size');
  assert.equal(entry.sha512,hash,'Wrong update checksum');assert.equal(data.sha512,hash,'Wrong legacy update checksum');
}
export async function verifyDownloads(root,platform='all'){
  const info=await readRelease(root),folder=join(root,'release'),files=releaseFiles(info.version,platform);
  for(const file of files)assert.ok((await fs.lstat(join(folder,file))).isFile(),'Missing artifact: '+file);
  if(platform!=='win'){
    const zip='Heavens-Door-'+info.version+'-mac-universal.zip';await manifest(folder,'latest-mac.yml',zip,info.version);
    const bytes=await fs.readFile(join(folder,'sparkle/appcast.xml')),xml=signedFeed(bytes,info.sparkle.publicEdKey),{XMLParser}=await import('fast-xml-parser');
    const item=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(xml).rss?.channel?.item;
    assert.ok(item&&!Array.isArray(item),'Expected one appcast update');assert.equal(String(item['sparkle:shortVersionString']),info.version);
    assert.equal(item['sparkle:version'],info.buildNumber+'.0.0','Wrong native update version');
    const enclosure=item.enclosure;assert.equal(enclosure?.['@_url'],'https://github.com/'+info.repo+'/releases/download/'+info.tag+'/'+zip,'Wrong appcast download URL');
    assert.equal(Number(enclosure['@_length']),(await fs.stat(join(folder,zip))).size,'Wrong archive length');
    assert.ok(verify(null,await fs.readFile(join(folder,zip)),publicKey(info.sparkle.publicEdKey),Buffer.from(enclosure['@_sparkle:edSignature']??'','base64')),'Invalid update archive signature');
  }
  if(platform!=='mac')await manifest(folder,'latest.yml','Heavens-Door-'+info.version+'-win-x64.exe',info.version);
  return {...info,files:await describeFiles(folder,files)};
}
async function inspectBundle(archive,info){
  const {extractFile,uncache}=await import('@electron/asar');uncache(archive);const pkg=JSON.parse(extractFile(archive,'package.json'));
  assert.equal(pkg.name,'heavens-door','Test app cannot be released');assert.equal(pkg.version,info.version,'Wrong packaged version');assert.equal(pkg.buildNumber,info.buildNumber,'Wrong packaged build number');
  for(const file of ['dist/main.cjs','dist/preload.cjs','dist/workspace-worker.cjs'])assert.ok(extractFile(archive,file).length,'Missing engine file: '+file);
  const html=extractFile(archive,'dist/renderer/index.html').toString(),script=html.match(/<script[^>]+src="\.\/(assets\/[\w.-]+\.js)"/)?.[1];
  assert.ok(script,'Missing renderer entry');assert.ok(extractFile(archive,'dist/renderer/'+script).length,'Missing renderer bundle');
}
async function zipHash(zip,path){
  const child=spawn('unzip',['-p',zip,path],{stdio:['ignore','pipe','pipe']}),hash=createHash('sha256');let error='';
  child.stderr.on('data',chunk=>{error+=chunk.toString();});child.stdout.on('data',chunk=>hash.update(chunk));
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Cannot read update ZIP: '+error)));});return hash.digest('hex');
}
export async function verifyArtifacts(root,platform='all'){
  const report=await verifyDownloads(root,platform),folder=join(root,'release');
  if(platform!=='win'){
    assert.equal(process.platform,'darwin','Mac bundle validation requires macOS');
    const app=join(folder,"mac-universal/Heaven's Door.app"),plist=join(app,'Contents/Info.plist'),value=key=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist],{encoding:'utf8'}).trim();
    for(const [key,expected] of Object.entries({CFBundleShortVersionString:report.version,CFBundleVersion:report.buildNumber+'.0.0',CFBundleIdentifier:'com.pochihh.heavens-door',SUPublicEDKey:report.sparkle.publicEdKey,SUFeedURL:report.sparkle.feedUrl}))assert.equal(value(key),expected,key);
    execFileSync('codesign',['--verify','--deep','--strict',app]);execFileSync('lipo',[join(app,"Contents/MacOS/Heaven's Door"),'-verify_arch','arm64','x86_64']);
    const archive=join(app,'Contents/Resources/app.asar');await inspectBundle(archive,report);
    const zip=join(folder,'Heavens-Door-'+report.version+'-mac-universal.zip');
    for(const [member,path] of [["Heaven's Door.app/Contents/Info.plist",plist],["Heaven's Door.app/Contents/Resources/app.asar",archive]])assert.equal(await zipHash(zip,member),await hashFile(path),'Update ZIP differs from the verified app: '+member);
  }
  if(platform!=='mac')await inspectBundle(join(folder,'win-unpacked/resources/app.asar'),report);
  return report;
}
export async function addChecksums(root,report){
  assert.equal(report.files.length,8,'Both platforms must be verified');
  const name=checksumName(report.version),folder=join(root,'release');
  await fs.writeFile(join(folder,name),report.files.map(f=>f.sha256+'  '+f.name).join('\n')+'\n');
  return readChecksums(root,report);
}
export async function readChecksums(root,report){
  const name=checksumName(report.version),folder=join(root,'release'),text=await boundedText(join(folder,name));
  const lines=text.trimEnd().split('\n');assert.equal(lines.length,report.files.length,'Unexpected checksum entries');const names=new Set();
  for(const line of lines){
    const match=line.match(/^([a-f0-9]{64}) {2}([^/\\]+)$/);assert.ok(match,'Malformed checksum entry');const [,hash,name]=match,file=report.files.find(file=>file.name===name);
    assert.ok(file&&!names.has(name),'Unexpected or duplicate checksum file: '+name);assert.equal(hash,file.sha256,'Checksum differs: '+name);names.add(name);
  }
  return {...report,files:[...report.files,...await describeFiles(folder,[name])]};
}
export function verifyRemote(release,info,files,{published=false}={}){
  assert.ok(release,'Release not found');assert.equal(release.tag_name,info.tag,'Wrong remote release');assert.equal(release.prerelease,false,'Prereleases are not stable updates');
  assert.equal(release.draft,!published,published?'Release is not published':'Published releases are immutable');
  if(!published)assert.equal(release.target_commitish,info.commit,'Draft targets another commit');
  assert.equal(release.assets.length,files.length,'Unexpected release assets');
  for(const file of files){const asset=release.assets.find(a=>a.name===file.name);assert.ok(asset,'Missing upload: '+file.name);assert.equal(asset.state,'uploaded','Incomplete upload: '+file.name);assert.equal(asset.size,file.size,'Uploaded size differs: '+file.name);assert.equal(asset.digest,'sha256:'+file.sha256,'Uploaded bytes differ: '+file.name);}
}
export async function verifyPublic(info,files,request=fetch){
  const api=await request('https://api.github.com/repos/'+info.repo+'/releases/latest',{headers:{'User-Agent':'Heavens-Door-release-verification'},signal:AbortSignal.timeout(30000)});assert.equal(api.status,200,'Latest-release API unavailable');
  verifyRemote(await api.json(),info,files,{published:true});
  const base='https://github.com/'+info.repo+'/releases';
  for(const file of files){
    if(['appcast.xml','latest.yml','latest-mac.yml',checksumName(info.version)].includes(file.name)){
      const res=await request(base+'/latest/download/'+file.name,{signal:AbortSignal.timeout(30000)});assert.equal(res.status,200,'Public metadata unavailable: '+file.name);
      assert.ok(Number(res.headers.get('content-length'))<=1024*1024,'Oversized public metadata');const bytes=Buffer.from(await res.arrayBuffer());assert.ok(bytes.length<=1024*1024,'Oversized public metadata');
      assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,'Public metadata differs: '+file.name);
    }else if(/\.(dmg|exe|zip)$/.test(file.name)){
      const res=await request(base+'/download/'+info.tag+'/'+file.name,{method:'HEAD',signal:AbortSignal.timeout(30000)});assert.equal(res.status,200,'Public download unavailable: '+file.name);assert.equal(Number(res.headers.get('content-length')),file.size,'Public download size differs: '+file.name);
    }
  }
}
