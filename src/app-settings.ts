import {readFileSync,writeFileSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ui} from './text/ui';

// Synchronous startup read: Electron needs this preference before app.whenReady().
export function readAppSettings(file:string):{hardwareAcceleration:boolean;automaticDownloads:boolean;warning?:string} {
  try {
    const value:unknown=JSON.parse(readFileSync(file,'utf8'));
    if(!value||typeof value!=='object'||!('hardwareAcceleration' in value)||typeof value.hardwareAcceleration!=='boolean')throw new Error(ui.settings.invalidSettings);
    if('automaticDownloads' in value&&typeof value.automaticDownloads!=='boolean')throw new Error(ui.settings.invalidSettings);
    return {hardwareAcceleration:value.hardwareAcceleration,automaticDownloads:!('automaticDownloads' in value)||value.automaticDownloads===true};
  } catch(error) {
    if((error as NodeJS.ErrnoException).code==='ENOENT')return {hardwareAcceleration:true,automaticDownloads:true};
    return {hardwareAcceleration:true,automaticDownloads:true,warning:ui.settings.loadFailed(String(error))};
  }
}
function writeSetting(file:string,key:'hardwareAcceleration'|'automaticDownloads',enabled:unknown):boolean {
  if(typeof enabled!=='boolean')throw new Error(key==='hardwareAcceleration'?ui.settings.invalidAcceleration:ui.updates.invalidAutomatic);
  mkdirSync(dirname(file),{recursive:true});
  let previous:Record<string,unknown>={};try{const raw=JSON.parse(readFileSync(file,'utf8'));if(raw&&typeof raw==='object'&&!Array.isArray(raw))previous=raw;}catch{/* An explicit change can replace unreadable preferences. */}
  const temporary=file+'.'+randomUUID()+'.tmp';
  try {
    writeFileSync(temporary,JSON.stringify({...previous,...readAppSettings(file),warning:undefined,[key]:enabled},null,2)+'\n',{flag:'wx',mode:0o600});
    renameSync(temporary,file);
  } finally {rmSync(temporary,{force:true});}
  return enabled;
}

export const writeHardwareAcceleration=(file:string,enabled:unknown)=>writeSetting(file,'hardwareAcceleration',enabled);
export const writeAutomaticDownloads=(file:string,enabled:unknown)=>writeSetting(file,'automaticDownloads',enabled);
