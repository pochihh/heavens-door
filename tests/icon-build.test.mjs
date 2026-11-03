import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareIcons,icnsFrames,icoSizes} from '../scripts/generate-icons.mjs';
import {styledLogo,platformIconStyle} from '../src/icon-style.ts';
const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect width="500" height="500" fill="red"/></svg>';
const png=size=>{const b=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(size,16);b.writeUInt32BE(size,20);return b;};
const icns=()=>{const frames=[['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]].flatMap(([name,size])=>{const header=Buffer.alloc(8),bytes=png(size);header.write(name);header.writeUInt32BE(bytes.length+8,4);return [header,bytes];}),header=Buffer.alloc(8),body=Buffer.concat(frames);header.write('icns');header.writeUInt32BE(body.length+8,4);return Buffer.concat([header,body]);};
const ico=()=>{const sizes=[16,24,32,48,64,128,256],header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;const images=sizes.map((size,i)=>{const bytes=png(size),at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset+=bytes.length;return bytes;});return Buffer.concat([header,...images]);};
test('icon builds checkpoint every output, invalidate stale or missing assets, and preserve square sources on failure',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'heavens-icon-build-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(join(root,'assets/branding'),{recursive:true});for(const name of ['logo.svg','logo_test.svg'])await fs.writeFile(join(root,'assets/branding',name),source);
 let calls=0,fail=false;const convert=async({inputFile,outputFormat,outDir})=>{calls++;if(fail)throw Error('Conversion failed');assert.match(await fs.readFile(inputFile,'utf8'),/data:image\/svg\+xml;base64,/);await fs.mkdir(outDir,{recursive:true});if(outputFormat==='set'){for(const size of [16,24,32,48,64,128,256,512])await fs.writeFile(join(outDir,size+'x'+size+'.png'),png(size));}else await fs.writeFile(join(outDir,'icon.'+outputFormat),outputFormat==='icns'?icns():ico());};
 assert.equal((await prepareIcons(root,convert)).generated,true);const before=calls;assert.equal((await prepareIcons(root,convert)).generated,false);assert.equal(calls,before);
 await fs.writeFile(join(root,'build/icon.png'),'corrupt');assert.equal((await prepareIcons(root,convert)).generated,true);await fs.unlink(join(root,'build/icon.ico'));assert.equal((await prepareIcons(root,convert)).generated,true);
 const manifest=await fs.readFile(join(root,'build/.icons.json'),'utf8');await fs.writeFile(join(root,'assets/branding/logo.svg'),source.replace('red','blue'));fail=true;await assert.rejects(prepareIcons(root,convert),/Conversion failed/);assert.equal(await fs.readFile(join(root,'build/.icons.json'),'utf8'),manifest);assert.deepEqual((await fs.readdir(join(root,'build'))).filter(name=>name.startsWith('.icons-')),[]);
 fail=false;assert.equal((await prepareIcons(root,convert)).generated,true);assert.equal(await fs.readFile(join(root,'assets/branding/logo.svg'),'utf8'),source.replace('red','blue'));
 await fs.writeFile(join(root,'assets/branding/logo_test.svg'),source.replace('500 500','500 300'));await assert.rejects(prepareIcons(root,convert),/square/);
 assert.throws(()=>icnsFrames(Buffer.alloc(8)));assert.throws(()=>icoSizes(Buffer.alloc(8)));
});
test('icon framing accepts only image data and explicit presets',()=>{
 const uri='data:image/svg+xml;base64,'+Buffer.from(source).toString('base64');const frames=['macos','windows','linux','original'].map(style=>styledLogo(uri,style));assert.equal(new Set(frames).size,4);for(const frame of frames)assert.ok(frame.includes(uri));for(const bad of ['file:///secret','https://site/logo.png','data:image/png;base64,"><script/>'])assert.throws(()=>styledLogo(bad,'macos'));assert.throws(()=>styledLogo(uri,'unknown'));assert.equal(platformIconStyle('darwin'),'macos');assert.equal(platformIconStyle('win32'),'windows');assert.equal(platformIconStyle('linux'),'linux');
});
