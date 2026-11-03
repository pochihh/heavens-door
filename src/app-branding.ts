import {iconStyles,type IconStyle} from './icon-style';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export const MAX_LOGO_BYTES=5*1024*1024;
const png=Buffer.from([137,80,78,71,13,10,26,10]);
export function validateLogo(data:Uint8Array,format:'png'|'svg'){
 if(!(data instanceof Uint8Array)||!data.length||data.length>MAX_LOGO_BYTES)throw Error('Choose a PNG or SVG smaller than 5 MB.');
 if(format==='png'){
  const b=Buffer.from(data);if(b.length<24||!b.subarray(0,8).equals(png)||b.toString('ascii',12,16)!=='IHDR')throw Error('This file is not a PNG image.');
  const width=b.readUInt32BE(16),height=b.readUInt32BE(20);if(!width||!height||width>8192||height>8192||width*height>16_777_216)throw Error('Use an image with at most 16 million pixels and sides up to 8192 pixels.');
 }else if(format!=='svg'||!/<svg\b/i.test(Buffer.from(data).toString('utf8'))||/<!DOCTYPE|<!ENTITY/i.test(Buffer.from(data).toString('utf8')))throw Error('This file is not a supported SVG image.');
}
interface Choice {custom:boolean;source?:string;icon?:string;style?:IconStyle}
export class AppBranding {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(readonly folder:string){}
 private async directory(){await fs.mkdir(this.folder,{recursive:true,mode:0o700});if((await fs.lstat(this.folder)).isSymbolicLink())throw Error('The branding folder cannot be a symbolic link.');}
 private async write(name:string,data:string|Uint8Array){const temporary=join(this.folder,'.'+randomUUID()+'.tmp');try{await fs.writeFile(temporary,data,{flag:'wx',mode:0o600});await fs.rename(temporary,join(this.folder,name));}finally{await fs.rm(temporary,{force:true});}}
 private async read(name:string,limit:number){const file=join(this.folder,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error('The saved logo is unavailable or too large.');return fs.readFile(file);}
 async initialize(svg:string,png:Uint8Array){await this.directory();await this.write('default.svg',svg);await this.write('default.png',png);}
 private async choice():Promise<Choice>{
  try{const value=JSON.parse((await this.read('selection.json',4096)).toString());
   if(!value||typeof value.custom!=='boolean'||value.style!==undefined&&!iconStyles.includes(value.style)||value.source!==undefined&&(!/^custom-[0-9a-f-]{36}\.(svg|png)$/.test(value.source)||value.icon!==value.source.replace(/\.(svg|png)$/,'-icon.png'))||value.icon!==undefined&&value.source===undefined||value.custom&&!value.source)throw Error('The saved logo selection is invalid.');return value;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {custom:false};throw error;}
 }
 async active():Promise<{path:string;custom:boolean;style?:IconStyle;warning?:string}>{
  try{const choice=await this.choice();if(choice.custom){validateLogo(await this.read(choice.icon!,MAX_LOGO_BYTES),'png');return {path:join(this.folder,choice.icon!),custom:true,style:choice.style??'original'};}}
  catch(error){return {path:join(this.folder,'default.png'),custom:false,warning:String(error)};}
  return {path:join(this.folder,'default.png'),custom:false};
 }
 private run<T>(action:()=>Promise<T>):Promise<T>{const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;}
 import(data:Uint8Array,format:'png'|'svg',normalized:Uint8Array,style:IconStyle='original'){return this.run(async()=>{
  if(!iconStyles.includes(style))throw Error('Invalid icon style.');
  validateLogo(data,format);validateLogo(normalized,'png');await this.directory();
  const previous=await this.choice().catch(()=>({custom:false} as Choice)),id='custom-'+randomUUID(),source=id+'.'+format,icon=id+'-icon.png';let committed=false;
  try{await this.write(source,data);await this.write(icon,normalized);await this.write('selection.json',JSON.stringify({custom:true,source,icon,style}));committed=true;}
  finally{if(!committed)await Promise.all([source,icon].map(name=>fs.rm(join(this.folder,name),{force:true})));}
  // Remove superseded imported copies only after the new selection is safely committed.
  for(const name of [previous.source,previous.icon])if(name)await fs.rm(join(this.folder,name),{force:true}).catch(()=>{});
 });}
 reset(){return this.run(async()=>{await this.directory();const previous=await this.choice().catch(()=>({custom:false} as Choice));await this.write('selection.json',JSON.stringify({...previous,custom:false}));});}
}
