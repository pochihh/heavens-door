import type {AppUpdater} from 'electron-updater';
import type {SparkleBridge} from 'electron-sparkle-updater';
import type {UpdateState} from './shared';
import {ui} from './text/ui';

export const APP_ID='com.pochihh.heavens-door';
export const DOWNLOAD_PAGE='https://github.com/pochihh/heavens-door/releases/latest';
export const RELEASE_API='https://api.github.com/repos/pochihh/heavens-door/releases/latest';
export function newerVersion(candidate:string,current:string){
  const parse=(value:string)=>{if(value.length>64||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))throw new Error(ui.updates.invalidVersion);return value.split('.').map(BigInt);};
  const next=parse(candidate),previous=parse(current);for(let i=0;i<3;i++)if(next[i]!==previous[i])return next[i]>previous[i];return false;
}
export class AppUpdates {
  state:UpdateState;private checking?:Promise<UpdateState>;private downloading?:Promise<UpdateState>;private waiting?:Set<number>;private completedDownload?:{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
  constructor(private updater:AppUpdater,version:string,private native:boolean,private latest:()=>Promise<string|null>,private changed:(state:UpdateState)=>void,private sparkle?:SparkleBridge){
    this.state={currentVersion:version,status:'idle',canInstall:native};
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
    updater.on('update-available',info=>this.set('available',{version:info.version}));
    updater.on('update-not-available',()=>this.set('up-to-date'));
    updater.on('download-progress',info=>this.set('downloading',{version:this.state.version,progress:Math.max(0,Math.min(100,Math.floor(info.percent)))}));
    updater.on('update-downloaded',info=>this.set('ready',{version:info.version}));
    updater.on('error',error=>this.fail(error));
    sparkle?.setAutomaticChecks(false);
    sparkle?.setEventHandler(event=>{
      // This bridge downloads on a native check; only Download starts that check.
      if(event.type==='download-progress'&&this.completedDownload)this.set('downloading',{version:this.state.version,progress:Math.max(0,Math.min(100,Math.floor(event.percent??0)))});
      else if(event.type==='update-downloaded'){
        try{if(!event.version||!newerVersion(event.version,this.state.currentVersion))throw new Error(ui.updates.invalidVersion);}catch(error){this.fail(error);return;}
        this.set('ready',{version:event.version});this.finishDownload();
      }else if(event.type==='update-not-available'){
        this.set('up-to-date');this.finishDownload();
      }else if(event.type==='error')this.fail(new Error(event.message??ui.updates.downloadUnavailable));
    });
  }
  private set(status:UpdateState['status'],detail:Partial<UpdateState>={}){this.state={currentVersion:this.state.currentVersion,canInstall:this.native,status,...detail};this.changed(this.state);return this.state;}
  private finishDownload(error?:Error){const pending=this.completedDownload;if(!pending)return;this.completedDownload=undefined;clearTimeout(pending.timer);if(error)pending.reject(error);else pending.resolve();}
  private fail(error:unknown){this.finishDownload(error instanceof Error?error:new Error(String(error)));this.waiting=undefined;return this.set('error',{version:this.state.version,message:error instanceof Error?error.message:String(error)});}
  check(){
    if(this.checking)return this.checking;if(['downloading','ready','installing'].includes(this.state.status))return Promise.resolve(this.state);
    this.set('checking');this.checking=(async()=>{
      try{if(this.native&&!this.sparkle){await this.updater.checkForUpdates();if(this.state.status==='checking')this.set('up-to-date');}
        else{const version=await this.latest();this.set(version&&newerVersion(version,this.state.currentVersion)?'available':'up-to-date',{version:version??undefined,message:version?undefined:ui.updates.noRelease});}
      }catch(error){this.fail(error);}return this.state;
    })().finally(()=>{this.checking=undefined;});return this.checking;
  }
  download(){
    if(this.downloading)return this.downloading;if(!this.native||this.state.status!=='available')return Promise.reject(new Error(ui.updates.downloadUnavailable));
    const version=this.state.version;this.set('downloading',{version,progress:0});
    const download=this.sparkle?new Promise<void>((resolve,reject)=>{
      this.completedDownload={resolve,reject,timer:setTimeout(()=>this.fail(new Error(ui.updates.downloadTimeout)),10*60*1000)};
      try{this.sparkle!.discardDownloadedUpdate();this.sparkle!.checkForUpdates();}catch(error){this.fail(error);}
    }):this.updater.downloadUpdate();
    this.downloading=download.then(()=>this.state).catch(error=>this.fail(error)).finally(()=>{this.downloading=undefined;});return this.downloading;
  }
  startInstall(ids:number[]){
    if(!this.native||this.state.status!=='ready'||!ids.length)throw new Error(ui.updates.installUnavailable);
    this.waiting=new Set(ids);this.set('installing',{version:this.state.version});
  }
  savedWindow(id:number){return !!this.waiting?.delete(id)&&this.waiting.size===0;}
  cancelInstall(){if(!this.waiting)return;this.waiting=undefined;this.set('ready',{version:this.state.version,message:ui.updates.saveFailed});}
  install(){
    if(!this.waiting||this.waiting.size||this.state.status!=='installing')throw new Error(ui.updates.installUnavailable);
    this.waiting=undefined;try{if(this.sparkle)this.sparkle.installUpdateNow();else this.updater.quitAndInstall(false,true);}catch(error){this.fail(error);throw error;}
  }
}
