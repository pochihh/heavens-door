import MiniSearch from 'minisearch';
import { marked, type Token } from 'marked';
import { Converter } from 'opencc-js/t2cn';
import type { Card } from '../shared';
import {tagsFrom,validTag} from '../tags';

const simplify=Converter({from:'tw',to:'cn'});
export const normalizeSearch=(text:string)=>simplify(text.normalize('NFKC').toLowerCase());
const han=/\p{Script=Han}/u;
// Han unigrams allow single-character queries; bigrams match phrases without spaces.
// Query bigrams avoid requiring a dictionary's particular word boundaries.
function tokens(text:string,indexing=false) {
  return (normalizeSearch(text).match(/\p{Script=Han}+|(?:(?!\p{Script=Han})[\p{L}\p{N}_])+/gu)??[]).flatMap(word=>{
    if(!han.test(word))return [word];
    const chars=[...word],pairs=chars.slice(1).map((c,i)=>chars[i]+c);
    return indexing?[...chars,...pairs]:pairs.length?pairs:chars;
  });
}
export interface SearchHit {path:string;score:number;terms:string[]}
export class TextSearch {
  private engine=new MiniSearch({idField:'path',fields:['name','title','body','metadata'],storeFields:['name','title'],tokenize:text=>tokens(text,true),
    searchOptions:{tokenize:text=>tokens(text),combineWith:'AND',boost:{title:5,name:4,metadata:2},
      prefix:term=>!han.test(term),fuzzy:term=>!han.test(term)&&term.length>=4?.2:false,maxFuzzy:2}});
  update(card:Pick<Card,'path'|'name'|'title'|'body'>&{metadata?:string}){this.remove(card.path);this.engine.add({...card,body:searchDocument(card.body).text});}
  remove(path:string){if(this.engine.has(path))this.engine.discard(path);}
  search(text:string,allowed?:Set<string>):SearchHit[]{
    if(!text.trim())return [];
    const original=text.normalize('NFKC').toLowerCase();
    return this.engine.search(text,{filter:allowed?hit=>allowed.has(String(hit.id)):undefined})
      .map(hit=>({path:String(hit.id),score:hit.score*([hit.title,hit.name].some(v=>String(v).normalize('NFKC').toLowerCase().includes(original))?1.25:1),terms:hit.terms})).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
  }
}
// Search user metadata, never the whole frontmatter blob (IDs, styling and geometry).
// Namespaced values remain searchable even if their definition is temporarily unavailable.
export function searchProperties(properties:Record<string,unknown>) {
  const value=(v:unknown):string=>typeof v==='string'?(/^card:[\w-]+$/.test(v)?'':v):typeof v==='number'||typeof v==='boolean'?String(v):'';
  return [...tagsFrom(properties.tags).map(tag=>'#'+tag),...Object.entries(properties).flatMap(([key,v])=>{
    const slash=key.lastIndexOf('/');if(slash<1||!validTag(key.slice(0,slash)))return [];
    const text=Array.isArray(v)?v.map(value).filter(Boolean).join(', '):v&&typeof v==='object'&&'start' in v&&'end' in v?[value(v.start),value(v.end)].join(' – '):value(v);
    return text?[key+': '+text]:[];
  })].join('\n');
}
export function searchExcerpt(body:string,terms:string[]) {
  const normalized=normalizeSearch(body),positions=terms.map(t=>normalized.indexOf(t)).filter(i=>i>=0);
  // Conversion is for locating a useful area only; snippets always use original bytes/text.
  const start=Math.max(0,(positions.length?Math.min(...positions):0)-60);
  return (start?'…':'')+body.slice(start,start+220).replace(/\s+/g,' ').trim()+(body.length>start+220?'…':'');
}

// Derived display text only: never render this HTML or execute embedded content.
export function searchDocument(body:string) {
  let image:string|undefined;
  const local=(source:string)=>source&&!/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(source)&&/\.(png|jpe?g|gif|webp|avif|svg)(?:[?#].*)?$/i.test(source);
  const text=(token:Token):string=>{
    if(token.type==='image'){if(!image&&local(token.href))image=token.href;return token.text;}
    if(token.type==='html'){
      const html=token.text.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
      const labels:string[]=[];
      for(const img of html.matchAll(/<img\b[^>]*>/gi)){
        const source=/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(img[0]);
        const value=source?.[1]??source?.[2]??source?.[3]??'';
        if(!image&&local(value))image=value;
        const alt=/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(img[0]);if(alt)labels.push(alt[1]??alt[2]??alt[3]??'');
      }
      return html.replace(/<[^>]*>/g,' ')+' '+labels.join(' ');
    }
    if(token.type==='list')return token.items.map(text).join('\n');
    if(token.type==='table')return [token.header,...token.rows].map(row=>row.map((cell:{tokens:Token[]})=>cell.tokens.map(text).join('')).join(' ')).join('\n');
    if('tokens' in token&&token.tokens)return token.tokens.map(text).join(token.type==='blockquote'||token.type==='list_item'?'\n':'');
    return 'text' in token?String(token.text):' ';
  };
  return {text:marked.lexer(body).map(text).join('\n').trim(),image};
}
export function searchHighlights(text:string,terms:string[]):[number,number][] {
  if(!terms.length)return [];
  const canonical=normalizeSearch(text);
  let offsets:number[];
  if(canonical.length===text.length)offsets=Array.from({length:text.length+1},(_,i)=>i);
  else {
    offsets=[];let byCharacter='',offset=0;
    for(const char of text){const value=normalizeSearch(char);byCharacter+=value;for(let i=0;i<value.length;i++)offsets.push(offset);offset+=char.length;}
    offsets.push(text.length);
    // Length-changing phrase conversions must not highlight the wrong original characters.
    if(byCharacter!==canonical)return [];
  }
  const spans:[number,number][]=[];
  for(const term of new Set(terms)){if(!term)continue;for(let i=canonical.indexOf(term);i>=0;i=canonical.indexOf(term,i+term.length)){
    let end=i+term.length;while(end<offsets.length-1&&offsets[end]===offsets[end-1])end++;
    spans.push([offsets[i],offsets[end]]);
  }}
  spans.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];
  for(const span of spans){const last=merged.at(-1);if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push(span);}
  return merged;
}
