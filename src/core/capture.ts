import {createServer,type Server} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {webAddress} from './reading';
export interface Capture {id?:string;workspace:string;url:string;html:string;name?:string}
export function captureServer(token:string,receive:(value:Capture)=>Promise<void>):Server{
  let active=0;
  return createServer(async(req,res)=>{
    const origin=req.headers.origin;if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){res.writeHead(403).end();return;}
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
    const supplied=Buffer.from(String(req.headers.authorization??'').replace(/^Bearer /,'')),secret=Buffer.from(token);
    if(req.method!=='POST'||req.url!=='/capture'||supplied.length!==secret.length||!timingSafeEqual(supplied,secret)){res.writeHead(403).end();return;}
    if(active>=4){res.writeHead(429).end();return;}active++;req.setTimeout(30000,()=>req.destroy());
    try{const chunks:Buffer[]=[];let size=0;for await(const data of req){size+=data.length;if(size>10*1024*1024)throw new Error('Capture is too large.');chunks.push(data);}const value=JSON.parse(Buffer.concat(chunks).toString()) as Capture;if(!value||value.id!==undefined&&(typeof value.id!=='string'||!/^[a-f0-9-]{36}$/.test(value.id))||typeof value.workspace!=='string'||!/^[a-f0-9]{64}$/.test(value.workspace)||typeof value.html!=='string'||value.html.length>8*1024*1024||value.name!==undefined&&(typeof value.name!=='string'||value.name.length>1000))throw new Error('Invalid capture.');value.url=webAddress(value.url);await receive(value);res.writeHead(200,{'Content-Type':'application/json'}).end('{"saved":true}');}
    catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e instanceof Error?e.message:'Capture failed.'}));}finally{active--;}
  });
}
