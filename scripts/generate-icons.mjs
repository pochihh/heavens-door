import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {runIconsTool} from 'app-builder-lib/out/toolsets/icons.js';
import {styledLogo} from '../src/icon-style.ts';
const require=createRequire(import.meta.url),repo=fileURLToPath(new URL('..',import.meta.url)),builderVersion=require('app-builder-lib/package.json').version;
const names=['icon','test-icon'],styles=['macos','windows','linux'],linuxSizes=[16,24,32,48,64,128,256,512];
const base=(name,style)=>name+(style==='macos'?'':'-'+style),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const outputs=names.flatMap(name=>[...styles.flatMap(style=>[base(name,style)+'.svg',base(name,style)+'.png']),name+'.icns',name+'.ico',...linuxSizes.map(size=>(name==='icon'?'icons':'test-icons')+'/'+size+'x'+size+'.png')]);
export function pngSize(bytes){assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Invalid icon PNG');return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];}
export function icnsFrames(bytes){
 assert.equal(bytes.toString('ascii',0,4),'icns');assert.equal(bytes.readUInt32BE(4),bytes.length);const frames=new Map();
 for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset+4);assert.ok(size>=8&&offset+size<=bytes.length,'Invalid ICNS frame');frames.set(bytes.toString('ascii',offset,offset+4),bytes.subarray(offset+8,offset+size));offset+=size;}
 return frames;
}
export function icoSizes(bytes){
 assert.equal(bytes.readUInt32LE(0),65536);const count=bytes.readUInt16LE(4),sizes=[];assert.ok(count>0&&6+count*16<=bytes.length);
 for(let i=0;i<count;i++){const at=6+i*16,size=bytes[at]||256,length=bytes.readUInt32LE(at+8),offset=bytes.readUInt32LE(at+12);assert.ok(offset>=6+count*16&&offset+length<=bytes.length);assert.deepEqual(pngSize(bytes.subarray(offset,offset+length)),[size,size]);sizes.push(size);}return sizes;
}
export async function prepareIcons(root=repo,convert=runIconsTool){
 const sources=await Promise.all(['logo.svg','logo_test.svg'].map(name=>fs.readFile(join(root,'assets/branding',name))));
 for(const source of sources){const text=source.toString();assert.ok(!/<!DOCTYPE|<!ENTITY/i.test(text)&&XMLValidator.validate(text)===true,'Invalid logo SVG');const svg=new XMLParser({ignoreAttributes:false}).parse(text).svg,box=String(svg?.['@_viewBox']).trim().split(/[\s,]+/).map(Number);assert.ok(box.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[2]===box[3],'Logo source must have a square SVG viewBox');}
 const key=digest(Buffer.concat([...sources,await fs.readFile(fileURLToPath(import.meta.url)),await fs.readFile(new URL('../src/icon-style.ts',import.meta.url)),Buffer.from(builderVersion)])),build=join(root,'build'),manifest=join(build,'.icons.json');
 try{const saved=JSON.parse(await fs.readFile(manifest,'utf8'));if(saved?.key===key&&saved.files&&await Promise.all(outputs.map(async file=>saved.files[file]===digest(await fs.readFile(join(build,file))))).then(values=>values.every(Boolean)))return {generated:false,files:outputs.length};}catch(error){if(!['ENOENT'].includes(error.code)&&!(error instanceof SyntaxError))throw error;}
 await fs.mkdir(build,{recursive:true});const temporary=await fs.mkdtemp(join(build,'.icons-'));
 try{
  for(const [index,name] of names.entries())for(const style of styles){
   const stem=base(name,style),svgFile=join(temporary,stem+'.svg'),work=join(temporary,stem+'-work');await fs.writeFile(svgFile,styledLogo('data:image/svg+xml;base64,'+sources[index].toString('base64'),style));
   // The converter exposes its full-resolution PNG in the ICNS ic10 frame.
   await convert({inputFile:svgFile,outputFormat:'icns',outDir:work});const icns=await fs.readFile(join(work,'icon.icns')),frames=icnsFrames(icns),png=frames.get('ic10');assert.ok(png,'Converter did not produce a 1024px frame');assert.deepEqual(pngSize(png),[1024,1024]);await fs.writeFile(join(temporary,stem+'.png'),png);
   if(style==='macos'){for(const type of ['icp4','icp5','icp6','ic07','ic08','ic09','ic10'])assert.ok(frames.has(type),'Missing Mac icon size: '+type);await fs.writeFile(join(temporary,name+'.icns'),icns);}
   if(style==='windows'){await convert({inputFile:svgFile,outputFormat:'ico',outDir:work});const ico=await fs.readFile(join(work,'icon.ico'));assert.deepEqual(icoSizes(ico),[16,24,32,48,64,128,256]);await fs.writeFile(join(temporary,name+'.ico'),ico);}
   if(style==='linux'){await convert({inputFile:svgFile,outputFormat:'set',outDir:work});for(const size of linuxSizes){const png=await fs.readFile(join(work,size+'x'+size+'.png'));assert.deepEqual(pngSize(png),[size,size]);const target=join(temporary,name==='icon'?'icons':'test-icons');await fs.mkdir(target,{recursive:true});await fs.writeFile(join(target,size+'x'+size+'.png'),png);}}
  }
  const files={};for(const file of outputs){const bytes=await fs.readFile(join(temporary,file));files[file]=digest(bytes);}
  // Commit only after every variant validates; the manifest is the final checkpoint.
  for(const file of outputs){await fs.mkdir(dirname(join(build,file)),{recursive:true});await fs.rename(join(temporary,file),join(build,file));}
  const pending=manifest+'.'+randomUUID();await fs.writeFile(pending,JSON.stringify({key,files},null,2)+'\n');await fs.rename(pending,manifest);
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
 return {generated:true,files:outputs.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await prepareIcons());
