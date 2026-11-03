import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AppBranding,validateLogo,MAX_LOGO_BYTES} from '../src/app-branding';
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="red"/></svg>');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('app logos share a profile folder, preserve imports through defaults updates and keep reset recoverable',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'heavens-branding-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const folder=join(root,'branding'),store=new AppBranding(folder);
 await store.initialize(svg.toString(),png);assert.deepEqual(await store.active(),{path:join(folder,'default.png'),custom:false});
 await store.import(svg,'svg',png,'macos');const choice=JSON.parse(await fs.readFile(join(folder,'selection.json'),'utf8'));assert.equal((await store.active()).style,'macos');assert.equal(choice.style,'macos');assert.equal((await store.active()).custom,true);assert.deepEqual(await fs.readFile(join(folder,choice.source)),svg);assert.deepEqual(await fs.readFile(join(folder,choice.icon)),png);
 const reopened=new AppBranding(folder);await reopened.initialize('<svg/>',png);assert.equal((await reopened.active()).path,join(folder,choice.icon));assert.equal(await fs.readFile(join(folder,'default.svg'),'utf8'),'<svg/>');
 await reopened.reset();assert.equal((await reopened.active()).custom,false);assert.deepEqual(await fs.readFile(join(folder,choice.source)),svg,'reset keeps the imported original');
 await reopened.import(png,'png',png);await assert.rejects(fs.access(join(folder,choice.source)));await assert.rejects(fs.access(join(folder,choice.icon)));assert.equal((await fs.readdir(folder)).length,5,'only defaults, latest import, normalized icon and selection remain');
});
test('invalid logos, path escapes and symlinks cannot replace the current icon',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'heavens-branding-invalid-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new AppBranding(join(root,'branding'));await store.initialize(svg.toString(),png);await store.import(svg,'svg',png);const before=await fs.readFile(join(store.folder,'selection.json'),'utf8');
 for(const [data,format] of [[Buffer.from('not an image'),'png'],[Buffer.from('<!DOCTYPE svg><svg/>'),'svg'],[Buffer.alloc(MAX_LOGO_BYTES+1),'svg']] as const)await assert.rejects(store.import(data,format,png));assert.equal(await fs.readFile(join(store.folder,'selection.json'),'utf8'),before);
 await assert.rejects(store.import(svg,'svg',png,'bad' as never),/Invalid icon style/);
 const huge=Buffer.from(png);huge.writeUInt32BE(1000000,16);assert.throws(()=>validateLogo(huge,'png'));
 await fs.writeFile(join(store.folder,'selection.json'),JSON.stringify({custom:true,source:'../private.svg',icon:'../private-icon.png'}));assert.equal((await store.active()).custom,false);assert.match((await store.active()).warning!,/invalid/);
 const outside=join(root,'outside');await fs.mkdir(outside);await fs.symlink(outside,join(root,'link'));await assert.rejects(new AppBranding(join(root,'link')).initialize(svg.toString(),png),/symbolic link/);assert.deepEqual(await fs.readdir(outside),[]);
 await fs.writeFile(join(store.folder,'selection.json'),before);const choice=JSON.parse(before);await fs.unlink(join(store.folder,choice.icon));await fs.symlink(join(store.folder,'default.png'),join(store.folder,choice.icon));assert.equal((await store.active()).custom,false);assert.match((await store.active()).warning!,/unavailable/);
});
test('failed commits leave the previous logo active and concurrent replacements serialize',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'heavens-branding-atomic-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new AppBranding(join(root,'branding'));await store.initialize(svg.toString(),png);await store.import(svg,'svg',png);const before=await fs.readFile(join(store.folder,'selection.json'),'utf8'),files=(await fs.readdir(store.folder)).sort(),rename=fs.rename;
 try{fs.rename=async(from,to)=>{if(String(to).endsWith('selection.json'))throw Error('Disk full');return rename(from,to);};await assert.rejects(store.import(png,'png',png),/Disk full/);}finally{fs.rename=rename;}
 assert.equal(await fs.readFile(join(store.folder,'selection.json'),'utf8'),before);assert.deepEqual((await fs.readdir(store.folder)).sort(),files);
 await Promise.all([store.import(svg,'svg',png),store.import(png,'png',png),store.reset()]);assert.equal((await store.active()).custom,false);assert.equal((await fs.readdir(store.folder)).length,5);
});
test('logo settings stage images and styles until Apply, while Cancel leaves the current icon intact',async()=>{
 const {JSDOM}=await import('jsdom'),{act}=await import('react'),{createRoot}=await import('react-dom/client'),{AppLogoSettings}=await import('../src/renderer/AppLogoSettings');
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let custom=false,cancel=false,fail=false,revealed=false,changed=()=>{},applied='',discarded=0;const state=()=>({custom,image:'data:image/png;base64,'+png.toString('base64')});
 window.door={platform:'darwin',appLogo:async()=>state(),importAppLogo:async()=>{if(fail)throw Error('Unreadable logo');return cancel?null:{token:'draft',image:state().image,name:'Logo.png'};},applyAppLogo:async(token,style)=>{assert.equal(token,'draft');if(fail)throw Error('Disk full');applied=style;custom=true;return {...state(),style};},cancelAppLogo:async()=>{discarded++;},resetAppLogo:async()=>{custom=false;return state();},revealBranding:async()=>{revealed=true;},onAppSettingsChange:fn=>{changed=fn;return()=>{};}} as Pick<typeof window.door,'platform'|'appLogo'|'importAppLogo'|'applyAppLogo'|'cancelAppLogo'|'resetAppLogo'|'revealBranding'|'onAppSettingsChange'> as typeof window.door;
 const root=createRoot(document.getElementById('root')!),button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text||b.getAttribute('aria-label')===text)!,click=async(text:string)=>act(async()=>button(text).click());
 try{
  await act(async()=>root.render(<AppLogoSettings/>));await click('Choose logo…');assert.equal(button('Reset to default').disabled,true);assert.ok(document.querySelector('dialog[open]'));assert.equal(button('Apply icon').disabled,true);
  cancel=true;await click('Choose image…');assert.equal(custom,false);assert.equal(button('Apply icon').disabled,true);cancel=false;await click('Choose image…');const preview=document.querySelector<HTMLImageElement>('[alt="Icon preview"]')!,before=preview.src;
  await act(async()=>document.querySelector<HTMLInputElement>('[value="windows"]')!.click());assert.notEqual(preview.src,before);assert.equal(custom,false);assert.equal(applied,'');await click('Cancel');assert.equal(discarded,1);assert.equal(custom,false);assert.equal(document.querySelector('dialog'),null);
  await click('Choose logo…');await click('Choose image…');await act(async()=>document.querySelector<HTMLInputElement>('[value="linux"]')!.click());fail=true;await click('Apply icon');assert.match(document.querySelector('dialog [role=alert]')!.textContent!,/Disk full/);assert.equal(custom,false);fail=false;await click('Apply icon');assert.equal(applied,'linux');assert.equal(document.querySelector('dialog'),null);assert.equal(document.querySelector('.app-logo-settings img')?.getAttribute('alt'),'Custom logo');
  await click('Choose logo…');await click('Show logo folder');assert.equal(revealed,true);await click('Reset to default');assert.equal(custom,false);custom=true;await act(async()=>changed());assert.equal(button('Reset to default').disabled,false);
  fail=true;await click('Choose image…');assert.match(document.querySelector('dialog [role=alert]')!.textContent!,/Unreadable/);await act(async()=>document.querySelector('dialog')!.dispatchEvent(new dom.window.Event('cancel',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('dialog'),null);assert.equal(custom,true);
 }finally{await act(async()=>root.unmount());dom.window.close();}
});
