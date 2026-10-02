import type { Preferences } from './shared';
import { panes, updatePane, mapPaneDocuments } from './layout';
export function remapPath(path:string,from:string,to:string) {
  const p=path.replaceAll('\\','/'),a=from.replaceAll('\\','/'),b=to.replaceAll('\\','/');
  return p===a?b:p.startsWith(a+'/')?b+p.slice(a.length):path;
}
export function remapFilePath(path:string,from:string,to:string) {
  const p=path.replaceAll('\\','/'),a=from.replaceAll('\\','/'),b=to.replaceAll('\\','/');
  return p===a+'/'+a.split('/').at(-1)+'.whiteboard'?b+'/'+b.split('/').at(-1)+'.whiteboard':remapPath(path,from,to);
}
export function remapKey(key:string,from:string,to:string) {
  return key.replace(/^(board|file|tag):(.*)$/,(_all,kind,path)=>kind+':'+(kind==='file'?remapFilePath(path,from,to):remapPath(path,from,to)));
}
export function remapPreferences(p:Preferences,from:string,to:string):Preferences {
  const key=(k:string)=>remapKey(k,from,to),documents=p.documents?structuredClone(p.documents):undefined;
  if(documents){
    for(const group of panes(documents.tree))documents.tree=updatePane(documents.tree,group.id,g=>mapPaneDocuments(g,key));
    documents.views=Object.fromEntries(Object.entries(documents.views).map(([k,v])=>{const at=k.indexOf(':');return [k.slice(0,at+1)+key(k.slice(at+1)),v];}));
  }
  return {...p,documents,starred:p.starred.map(key),recent:p.recent.map(key),icons:Object.fromEntries(Object.entries(p.icons).map(([k,v])=>[key(k),v])),navigation:p.navigation&&Object.fromEntries(Object.entries(p.navigation).map(([id,v])=>[id,{...v,expanded:v.expanded?.map(path=>remapPath(path,from,to))}]))};
}
