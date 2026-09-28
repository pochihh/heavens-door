import {readFileSync,writeFileSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ui} from './text/ui';

// Synchronous startup read: Electron needs this preference before app.whenReady().
export function readAppSettings(file:string):{hardwareAcceleration:boolean;warning?:string} {
  try {
    const value:unknown=JSON.parse(readFileSync(file,'utf8'));
    if(!value||typeof value!=='object'||!('hardwareAcceleration' in value)||typeof value.hardwareAcceleration!=='boolean')throw new Error(ui.settings.invalidSettings);
    return {hardwareAcceleration:value.hardwareAcceleration};
  } catch(error) {
    if((error as NodeJS.ErrnoException).code==='ENOENT')return {hardwareAcceleration:true};
    return {hardwareAcceleration:true,warning:ui.settings.loadFailed(String(error))};
  }
}
export function writeHardwareAcceleration(file:string,enabled:unknown):boolean {
  if(typeof enabled!=='boolean')throw new Error(ui.settings.invalidAcceleration);
  mkdirSync(dirname(file),{recursive:true});
  const temporary=file+'.'+randomUUID()+'.tmp';
  try {
    writeFileSync(temporary,JSON.stringify({hardwareAcceleration:enabled},null,2)+'\n',{flag:'wx',mode:0o600});
    renameSync(temporary,file);
  } finally {rmSync(temporary,{force:true});}
  return enabled;
}
