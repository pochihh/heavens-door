import {marked,type Tokens} from 'marked';
import type {ReferenceTarget} from './shared';

// A UI mention remains a normal relative Markdown link on disk.
export function referenceHref(from:string,to:string){
  const left=from.replaceAll('\\','/').split('/').slice(0,-1),right=to.replaceAll('\\','/').split('/');
  while(left.length&&right.length&&left[0]===right[0]){left.shift();right.shift();}
  return [...left.map(()=>'..'),...right.map(encodeURIComponent)].join('/');
}
export function referencePath(from:string,href:string){
  if(/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href))return;
  let link:string;try{link=decodeURIComponent(href.split(/[?#]/)[0]);}catch{return;}
  if(!link)return;
  const parts=from.replaceAll('\\','/').split('/').slice(0,-1);
  for(const part of link.replaceAll('\\','/').split('/')){
    if(part==='..'){if(!parts.length)return;parts.pop();}else if(part&&part!=='.'){if(part.includes('\0'))return;parts.push(part);}
  }
  const path=parts.join('/');return /\.(md|whiteboard)$/i.test(path)?path:undefined;
}
export function wikiToken(source:string):Tokens.Link|undefined {
  const match=/^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(source);if(!match)return;
  const target=match[1].trim();if(!target)return;
  const text=match[2]??target;
  return {type:'link',raw:match[0],href:'wiki:'+encodeURIComponent(target),text,tokens:[{type:'text',raw:text,text}]};
}
marked.use({extensions:[{name:'wikiLink',level:'inline',start:source=>source.indexOf('[['),tokenizer:wikiToken}]});

export function referenceResolver(targets:ReferenceTarget[]){
  const stem=(path:string)=>path.replace(/\.(md|whiteboard)$/i,'').toLocaleLowerCase(),keys=new Map(targets.map(t=>[t.key,t])),paths=new Map(targets.map(t=>[t.path,t])),names=new Map<string,ReferenceTarget[]>(),full=new Map<string,ReferenceTarget[]>();
  for(const target of targets){for(const [map,name] of [[names,stem(target.path.split('/').at(-1)!)],[full,stem(target.path)]] as const){const values=map.get(name)??[];values.push(target);map.set(name,values);}}
  return (from:string,href:string):ReferenceTarget[]=>{
    if(href.startsWith('card:')||href.startsWith('board:')){const target=keys.get(href);return target?[target]:[];}
    if(!href.startsWith('wiki:')){const target=paths.get(referencePath(from,href)??'');return target?[target]:[];}
    let target:string;try{target=decodeURIComponent(href.slice(5)).split('#')[0].replaceAll('\\','/');}catch{return [];}
    const relative=referencePath(from,/\.(md|whiteboard)$/i.test(target)?target:target+'.md'),local=relative?paths.get(relative):undefined,exact=[...new Set([...(full.get(stem(target))??[]),...(local?[local]:[])])];
    return exact.length?exact:target.includes('/')?[]:names.get(stem(target))??[];
  };
}
export function referenceMatches(from:string,href:string,targets:ReferenceTarget[]){return referenceResolver(targets)(from,href);}
