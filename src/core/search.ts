import MiniSearch from 'minisearch';
import { Converter } from 'opencc-js/t2cn';
import type { Card } from '../shared';

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
export class CardSearch {
  private engine=new MiniSearch({idField:'path',fields:['name','title','body'],storeFields:['name','title'],tokenize:text=>tokens(text,true),
    searchOptions:{tokenize:text=>tokens(text),combineWith:'AND',boost:{title:5,name:4},
      prefix:term=>!han.test(term),fuzzy:term=>!han.test(term)&&term.length>=4?.2:false,maxFuzzy:2}});
  update(card:Pick<Card,'path'|'name'|'title'|'body'>){this.remove(card.path);this.engine.add(card);}
  remove(path:string){if(this.engine.has(path))this.engine.discard(path);}
  search(text:string,allowed?:Set<string>):SearchHit[]{
    if(!text.trim())return [];
    const original=text.normalize('NFKC').toLowerCase();
    return this.engine.search(text,{filter:allowed?hit=>allowed.has(String(hit.id)):undefined})
      .map(hit=>({path:String(hit.id),score:hit.score*([hit.title,hit.name].some(v=>String(v).normalize('NFKC').toLowerCase().includes(original))?1.25:1),terms:hit.terms})).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
  }
}
export function searchExcerpt(body:string,terms:string[]) {
  const normalized=normalizeSearch(body),positions=terms.map(t=>normalized.indexOf(t)).filter(i=>i>=0);
  // Conversion is for locating a useful area only; snippets always use original bytes/text.
  const start=Math.max(0,(positions.length?Math.min(...positions):0)-60);
  return (start?'…':'')+body.slice(start,start+220).replace(/\s+/g,' ').trim()+(body.length>start+220?'…':'');
}
