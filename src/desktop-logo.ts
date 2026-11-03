import {styledLogo,type IconStyle} from './icon-style';
import {BrowserWindow,session} from 'electron';
import {validateLogo} from './app-branding';
// SVG is decoded as an image in an isolated renderer; it cannot load local or remote resources.
export async function renderLogo(data:Uint8Array,format:'png'|'svg',style:IconStyle='original'):Promise<Buffer>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 validateLogo(data,format);const isolated=session.fromPartition('app-logo-render');
 isolated.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}));
 isolated.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 const win=new BrowserWindow({show:false,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  await win.loadURL('data:text/html,'+encodeURIComponent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:"><canvas width="1024" height="1024"></canvas>`));
  const url='data:image/'+(format==='svg'?'svg+xml':'png')+';base64,'+Buffer.from(data).toString('base64');
  const framed='data:image/svg+xml;base64,'+Buffer.from(styledLogo(url,style)).toString('base64');
  const result=await Promise.race([win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify(framed)};await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('The image is empty.');const canvas=document.querySelector('canvas'),scale=Math.min(1024/image.naturalWidth,1024/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;canvas.getContext('2d').drawImage(image,(1024-w)/2,(1024-h)/2,w,h);return canvas.toDataURL('image/png');})()`),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The logo could not be rendered. Try a simpler image.')),8000);})]);
  const png=Buffer.from(result.split(',')[1],'base64');validateLogo(png,'png');return png;
 }finally{clearTimeout(timer);win.destroy();}
}
