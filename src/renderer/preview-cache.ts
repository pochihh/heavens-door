// Experimental decoded-preview budget. Source content remains owned by the workspace.
export interface PreviewPixels {width:number;height:number;close:()=>void}
export class PreviewCache<T extends PreviewPixels> {
 private entries=new Map<string,{revision:string;value:T;bytes:number}>();
 private pending=new Map<string,symbol>();
 bytes=0;peakBytes=0;released=0;
 constructor(readonly limit:number){if(!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid preview byte budget');}
 get size(){return this.entries.size;}
 get(id:string,revision?:string){const entry=this.entries.get(id);if(!entry||revision!==undefined&&entry.revision!==revision)return;this.entries.delete(id);this.entries.set(id,entry);return entry.value;}
 begin(id:string,revision:string){const token=Symbol(id);this.pending.set(id,token);return {id,revision,token};}
 commit(ticket:ReturnType<PreviewCache<T>['begin']>,value:T){
  const bytes=value.width*value.height*4;
  if(this.pending.get(ticket.id)!==ticket.token){this.release(value);return false;}
  this.pending.delete(ticket.id);
  if(!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||value.width<=0||value.height<=0||!Number.isSafeInteger(bytes)||bytes>this.limit){this.release(value);return false;}
  this.remove(ticket.id);
  while(this.bytes+bytes>this.limit)this.remove(this.entries.keys().next().value!);
  this.entries.set(ticket.id,{revision:ticket.revision,value,bytes});this.bytes+=bytes;this.peakBytes=Math.max(this.peakBytes,this.bytes);return true;
 }
 cancel(id:string,token?:symbol){if(token===undefined||this.pending.get(id)===token)this.pending.delete(id);}
 delete(id:string){this.cancel(id);this.remove(id);}
 invalidate(matches:(id:string)=>boolean){for(const id of new Set([...this.entries.keys(),...this.pending.keys()]))if(matches(id))this.delete(id);}
 clear(){this.pending.clear();for(const id of this.entries.keys())this.remove(id);}
 private release(value:T){value.close();this.released++;}
 private remove(id:string){const old=this.entries.get(id);if(old){this.entries.delete(id);this.bytes-=old.bytes;this.release(old.value);}}
}
