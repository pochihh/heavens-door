import {marked} from 'marked';
import {isHexColor} from './colors';
export interface ReadingSource {type:'pdf'|'web';file?:string;url?:string;captured?:string;sha256?:string;feed?:string;entry?:string;missingImages?:string[]}
export interface ReadingProgress {state:'new'|'reading'|'done';page?:number;scroll?:number}
export interface ReadingSettings {folder:string}
export interface Annotation {id:string;kind:'highlight'|'note';text:string;quote?:string;color?:string;page?:number;rects?:number[][];anchors?:{page:number;rects:number[][]}[];source?:string;context?:string;unresolved?:boolean}
export function annotationOnPage(annotation:Annotation,page?:number){
  return page===undefined||annotation.page===page||!!annotation.anchors?.some(a=>a.page===page)||annotation.page===undefined&&!annotation.anchors?.length;
}
const marker='\n\n## Annotations\n<!-- heavens-door:annotations -->\n';
const idPattern=/^[\w-]{1,128}$/;
export function readingMetadata(front:Record<string,unknown>,strict=false){
  const rawSource=front.source as ReadingSource|undefined,rawReading=front.reading as ReadingProgress|undefined;
  const source=rawSource&&typeof rawSource==='object'&&['pdf','web'].includes(rawSource.type)?rawSource:undefined,reading=rawReading&&typeof rawReading==='object'&&['new','reading','done'].includes(rawReading.state)?rawReading:undefined;
  if(strict&&rawReading&&!reading)throw new Error('Invalid reading state.');
  if(source&&(typeof source!=='object'||!['pdf','web'].includes(source.type)||['file','url','captured','sha256','feed','entry'].some(key=>source[key as keyof ReadingSource]!==undefined&&(typeof source[key as keyof ReadingSource]!=='string'||String(source[key as keyof ReadingSource]).length>4096))))throw new Error('Invalid reading source metadata.');
  if(source?.file&&(/^(?:[a-z][\w+.-]*:|\/)/i.test(source.file)||source.file.includes('\0')))throw new Error('Attachment paths must be relative.');
  if(reading&&(!['new','reading','done'].includes(reading.state)||reading.page!==undefined&&(!Number.isInteger(reading.page)||reading.page<1)||reading.scroll!==undefined&&(!Number.isFinite(reading.scroll)||reading.scroll<0)))throw new Error('Invalid reading progress.');
  if(source?.missingImages&&(!Array.isArray(source.missingImages)||source.missingImages.length>100||source.missingImages.some(u=>typeof u!=='string'||u.length>4096)))throw new Error('Invalid image recovery list.');
  if(source?.url){const url=new URL(source.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid source URL.');}
  return {...(source?{source}:{}),...(reading?{reading}:{})};
}
export function validateAnnotation(value:Annotation){
  if(value?.anchors){if(!Array.isArray(value.anchors)||value.anchors.length>1000)throw new Error('Invalid annotation anchors.');for(const anchor of value.anchors){if(!anchor||!Number.isInteger(anchor.page)||anchor.page<1||!Array.isArray(anchor.rects)||anchor.rects.length>1000||anchor.rects.some(r=>r.length!==4||r.some(n=>!Number.isFinite(n)||n<0||n>1)))throw new Error('Invalid annotation anchor.');}}
  if(value?.source!==undefined&&(typeof value.source!=='string'||value.source.length>128)||value?.context!==undefined&&(typeof value.context!=='string'||value.context.length>100000)||value?.unresolved!==undefined&&typeof value.unresolved!=='boolean')throw new Error('Invalid annotation metadata.');
  if(!value||!idPattern.test(value.id)||!['highlight','note'].includes(value.kind)||typeof value.text!=='string'||value.text.length>100000||value.quote!==undefined&&(typeof value.quote!=='string'||value.quote.length>100000)||value.color!==undefined&&!isHexColor(value.color)||value.page!==undefined&&(!Number.isInteger(value.page)||value.page<1)||value.rects!==undefined&&(!Array.isArray(value.rects)||value.rects.length>1000||value.rects.some(r=>r.length!==4||r.some(n=>!Number.isFinite(n)||n<0||n>1))))throw new Error('Invalid annotation.');
}
export function splitAnnotations(body:string){
  let fence='',length=0,cursor=0;
  const found=[...body.matchAll(/\r?\n\r?\n## Annotations\r?\n<!-- heavens-door:annotations -->\r?\n/g)].find(candidate=>{
    for(const line of body.slice(cursor,candidate.index).split(/\r?\n/)){const match=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);if(!match)continue;if(!fence){fence=match[1][0];length=match[1].length;}else if(match[1][0]===fence&&match[1].length>=length&&!match[2].trim())fence='';}
    cursor=candidate.index!+candidate[0].length;return !fence;
  }),at=found?.index??-1;if(at<0)return {content:body,annotations:[] as Annotation[],footer:''};
  const footer=body.slice(at),annotations:Annotation[]=[];
  const blocks=[...footer.matchAll(/<!-- (annotation|card-note):([\w-]+)(?: (\{[^\n]*\}))? -->\r?\n\[\^\2\]:([^]*?)(?=\r?\n\r?\n<!-- (?:annotation|card-note):|$)/g)];
  for(const m of blocks){const attrs=m[3]?JSON.parse(m[3]):{},text=m[4].replaceAll('\r\n','\n').replace(/^ /,'').replace(/\n {4}/g,'\n').trimEnd();const value:Annotation={...attrs,id:m[2],kind:m[1]==='card-note'?'note':'highlight',text};validateAnnotation(value);if(annotations.some(a=>a.id===value.id))throw new Error('Duplicate annotation identity.');annotations.push(value);}
  if(blocks.length&&blocks[0].index!==found![0].length||!blocks.length&&footer.trim()!==found![0].trim())throw new Error('Unrecognized annotation footer. Edit the source to recover it.');
  return {content:body.slice(0,at),annotations,footer};
}
export function withAnnotations(content:string,annotations:Annotation[]){
  if(!annotations.length)return content;
  return content+marker+annotations.map(({id,kind,text,...attrs})=>{validateAnnotation({id,kind,text,...attrs});return `<!-- ${kind==='note'?'card-note':'annotation'}:${id} ${JSON.stringify(attrs).replaceAll('--','\\u002d\\u002d')} -->\n[^${id}]: ${text.replaceAll('\n','\n    ')}`;}).join('\n\n')+'\n';
}
export function updateAnnotation(body:string,value:Annotation|null,id=value?.id){
  const {content,annotations}=splitAnnotations(body),next=value?annotations.map(a=>a.id===id?value:a):annotations.filter(a=>a.id!==id);if(value&&!annotations.some(a=>a.id===id))next.push(value);
  const cleaned=value?content:content.replace(new RegExp(`<mark\\b[^>]*data-annotation=["']${id}["'][^>]*>([\\s\\S]*?)<\\/mark>(?:\\[\\^${id}\\])?`,'g'),'$1');
  const colored=value?.color?cleaned.replace(new RegExp(`(<mark\\s+data-annotation="${id}")(?:\\s+data-color="[^"]*")?`,'g'),`$1 data-color="${value.color}"`):cleaned;
  return withAnnotations(colored,next);
}
export function annotationReferences(body:string){
  const text=body.replaceAll('\r\n','\n'),protectedRanges:{start:number;end:number}[]=[];let cursor=0;
  marked.walkTokens(marked.lexer(text),token=>{if(!['code','codespan'].includes(token.type))return;const start=text.indexOf(token.raw,cursor);if(start<0)return;cursor=start+token.raw.length;protectedRanges.push({start,end:cursor});});
  return text.replace(/(<\/mark>)\[\^[\w-]+\]/g,(all,end,offset)=>protectedRanges.some(r=>offset>=r.start&&offset<r.end)?all:end);
}

// Invalid hand-edited metadata stays visible and recoverable in Source mode.
export function annotationView(body:string){try{return {...splitAnnotations(body),error:''};}catch(e){return {content:body,annotations:[] as Annotation[],footer:'',error:String(e)};}}
