import type { Snapshot } from '../shared';
import type { IconName } from './Icons';
export const portable=(path:string)=>path.replaceAll('\\','/');
export const parent=(path:string)=>portable(path).split('/').slice(0,-1).join('/');
export const leaf=(path:string)=>portable(path).split('/').at(-1)??path;
export function fileIcon(path:string):IconName {
  if(/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path))return 'image';
  if(/\.(json|js|ts|tsx|css|html|yml|yaml|toml)$/i.test(path))return 'source';
  return 'file';
}
interface DocumentInfo {key:string;kind:string;id:string;title:string;path:string;icon:IconName;exists:boolean}
// Build once per snapshot, rather than searching 10,000 cards for every visible row/tab.
const indexes=new WeakMap<Snapshot,{documents:Map<string,DocumentInfo>;paths:Map<string,string>}>();
export function documentIndex(snapshot:Snapshot) {
  let index=indexes.get(snapshot);if(index)return index;
  const documents=new Map<string,DocumentInfo>(),paths=new Map<string,string>();
  for(const board of snapshot.boards){const key='board:'+portable(board.folder);documents.set(key,{key,kind:'board',id:board.folder,title:board.folder?leaf(board.folder):snapshot.name,path:board.folder,icon:'map',exists:true});paths.set(portable(board.path),key);}
  for(const card of snapshot.cards){const key='card:'+card.id;documents.set(key,{key,kind:'card',id:card.id,title:leaf(card.path),path:card.path,icon:'note',exists:true});paths.set(portable(card.path),key);}
  for(const tag of snapshot.tags??[]){const key='tag:'+portable(tag.path);documents.set(key,{key,kind:'tag',id:tag.path,title:tag.name,path:tag.path,icon:'tag',exists:true});paths.set(portable(tag.path),key);}
  index={documents,paths};indexes.set(snapshot,index);return index;
}
export function documentInfo(key:string,snapshot:Snapshot):DocumentInfo {
  const info=documentIndex(snapshot).documents.get(portable(key));if(info)return info;
  const split=key.indexOf(':'),kind=key.slice(0,split),id=key.slice(split+1);
  return {key,kind,id,title:kind==='card'?'Missing card':leaf(id),path:kind==='card'?'':id,icon:kind==='file'?fileIcon(id):kind==='board'?'map':kind==='tag'?'tag':'note',exists:kind==='file'};
}
