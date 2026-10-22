import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,sign} from 'node:crypto';
import {stringify} from 'yaml';
import {hashFile,readRelease,releaseFiles,describeFiles,checksumName} from '../scripts/release-artifacts.mjs';

export async function fixture(t,{artifacts=false}={}){
  const root=await fs.mkdtemp(join(tmpdir(),'heavens-release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const keys=generateKeyPairSync('ed25519'),publicEdKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  await fs.mkdir(join(root,'build'),{recursive:true});
  const pkg={name:'heavens-door',version:'0.1.2',buildNumber:1,repository:{url:'https://github.com/example/door.git'}};
  await fs.writeFile(join(root,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  await fs.writeFile(join(root,'package-lock.json'),JSON.stringify({version:pkg.version,packages:{'':{version:pkg.version}}},null,2)+'\n');
  await fs.writeFile(join(root,'build/sparkle.json'),JSON.stringify({publicEdKey,feedUrl:'https://github.com/example/door/releases/latest/download/appcast.xml'}));
  await fs.writeFile(join(root,'.gitignore'),'.local/\nrelease/\n');
  const info=await readRelease(root),result={root,keys,info};
  if(artifacts){
    const folder=join(root,'release');await fs.mkdir(join(folder,'sparkle'),{recursive:true});
    for(const path of releaseFiles(info.version))await fs.writeFile(join(folder,path),path+' fixture');
    for(const [name,path] of [['latest-mac.yml',releaseFiles(info.version)[1]],['latest.yml',releaseFiles(info.version,'win')[0]]]){
      const sha512=await hashFile(join(folder,path),'sha512'),size=(await fs.stat(join(folder,path))).size;
      await fs.writeFile(join(folder,name),stringify({version:info.version,files:[{url:path,sha512,size}],path,sha512}));
    }
    const zip=releaseFiles(info.version)[1],archive=await fs.readFile(join(folder,zip));
    result.xml='<?xml version="1.0" encoding="utf-8"?>\n<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><item><title>Heaven’s Door</title><sparkle:shortVersionString>'+info.version+'</sparkle:shortVersionString><sparkle:version>'+info.buildNumber+'.0.0</sparkle:version><enclosure url="https://github.com/'+info.repo+'/releases/download/'+info.tag+'/'+zip+'" length="'+archive.length+'" sparkle:edSignature="'+sign(null,archive,keys.privateKey).toString('base64')+'" /></item></channel></rss>\n';
    await fs.writeFile(join(folder,'sparkle/appcast.xml'),feed(result.xml,keys.privateKey));
  }
  return result;
}
export function feed(xml,key){const bytes=Buffer.from(xml);return Buffer.concat([bytes,Buffer.from('<!-- sparkle-signatures:\nedSignature: '+sign(null,bytes,key).toString('base64')+'\nlength: '+bytes.length+'\n-->\n')]);}
export function remote(info,files,{published=false}={}){return {tag_name:info.tag??'v'+info.version,target_commitish:info.commit,draft:!published,prerelease:false,body:'Release notes',html_url:'https://github.com/'+info.repo+'/releases/tag/v'+info.version,assets:files.map(file=>({name:file.name,state:'uploaded',size:file.size,digest:'sha256:'+file.sha256}))};}
export function publicRequest(root,info,files,requests=[]){
  return async(url,options={})=>{
    requests.push({url,options});
    if(url.includes('api.github.com'))return Response.json(remote(info,files,{published:true}));
    const name=url.split('/').at(-1),file=files.find(file=>file.name===name);
    if(!file)return new Response('missing',{status:404});
    if(options.method==='HEAD')return new Response(null,{headers:{'content-length':String(file.size)}});
    return new Response(await fs.readFile(join(root,'release',file.path)));
  };
}
export async function checkpointFiles(root,version){
  const paths=['appcast.xml','latest.yml','latest-mac.yml',checksumName(version),'archive.zip'];await fs.mkdir(join(root,'release'),{recursive:true});
  for(const path of paths)await fs.writeFile(join(root,'release',path),path);
  return describeFiles(join(root,'release'),paths);
}
