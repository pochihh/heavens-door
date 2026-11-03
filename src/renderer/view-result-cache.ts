import type {ViewResults} from '../shared';
// A small per-workspace cache bridges editor/preview handoffs without retaining every visited dashboard.
export class ViewResultCache {
 private entries=new Map<string,{identity:string;result:ViewResults;bytes:number}>();
 private bytes=0;
 get size(){return this.entries.size;}
 get(key:string,identity?:string){const entry=this.entries.get(key);if(!entry||identity!==undefined&&entry.identity!==identity)return;this.entries.delete(key);this.entries.set(key,entry);return entry.result;}
 set(key:string,identity:string,result:ViewResults){
  this.remove(key);const bytes=(key.length+identity.length+JSON.stringify(result).length)*2;
  if(bytes>16*1024*1024)return;
  while(this.entries.size>=16||this.bytes+bytes>16*1024*1024)this.remove(this.entries.keys().next().value!);
  this.entries.set(key,{identity,result,bytes});this.bytes+=bytes;
 }
 clear(){this.entries.clear();this.bytes=0;}
 private remove(key:string){const entry=this.entries.get(key);if(entry){this.bytes-=entry.bytes;this.entries.delete(key);}}
}
