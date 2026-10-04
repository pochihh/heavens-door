import {Mark} from '@tiptap/core';

export function htmlAttribute(value:unknown){return String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
export function textColors(style:string){
  const attributes:Record<string,string>={};
  for(const declaration of style.split(';').filter(s=>s.trim())){
    const match=/^\s*(color|background-color)\s*:\s*([^;]+)\s*$/i.exec(declaration);
    if(!match||!/^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.% ,/+-]+\))$/i.test(match[2].trim()))return null;
    const probe=document.createElement('span');probe.style.setProperty(match[1].toLowerCase(),match[2].trim());
    if(!probe.style.length)return null;
    attributes[match[1].toLowerCase()==='color'?'color':'background']=match[2].trim();
  }
  return Object.keys(attributes).length?attributes:null;
}
export function supportedHtml(raw:string){
  if(/^\s*<\/span\s*>\s*$/i.test(raw))return true;
  const template=document.createElement('template');template.innerHTML=raw;
  const elements=[...template.content.querySelectorAll('*')];
  return elements.length>0&&elements.every(element=>{
    const keys=element.getAttributeNames();
    if(element.tagName==='SPAN')return keys.every(k=>k==='style')&&!!textColors(element.getAttribute('style')??'');
    if(element.tagName==='IMG')return keys.every(k=>['src','alt','title','width','height'].includes(k))&&!!element.getAttribute('src')&&['width','height'].every(k=>!element.hasAttribute(k)||/^\d+$/.test(element.getAttribute(k)!));
    return false;
  });
}
export const TextColors=Mark.create({
  name:'textColors',
  addAttributes(){return {color:{default:null,parseHTML:element=>textColors(element.getAttribute('style')??'')?.color??null},background:{default:null,parseHTML:element=>textColors(element.getAttribute('style')??'')?.background??null}};},
  parseHTML(){return [{tag:'span[style]',getAttrs:element=>textColors((element as HTMLElement).getAttribute('style')??'')?{}:false}];},
  renderHTML({mark}){return ['span',{style:colorStyle(mark.attrs)},0];},
  markdownTokenName:'textColors',
  markdownTokenizer:{name:'textColors',level:'inline',start:src=>src.indexOf('<span'),tokenize(src,_tokens,lexer){
    const open=/^<span\s+style=("[^"]*"|'[^']*')\s*>/i.exec(src);if(!open)return;
    const attrs=textColors(open[1].slice(1,-1));if(!attrs)return;
    let depth=1;
    for(const match of src.slice(open[0].length).matchAll(/<\/?span\b[^>]*>/gi)){
      depth+=match[0].startsWith('</')?-1:1;if(depth)continue;
      const end=open[0].length+match.index!,raw=src.slice(0,end+match[0].length);
      return {type:'textColors',raw,attrs,tokens:lexer.inlineTokens(src.slice(open[0].length,end))};
    }
  }},
  parseMarkdown(token,helpers){return helpers.applyMark('textColors',helpers.parseInline(token.tokens??[]),token.attrs as Record<string,string>);},
  renderMarkdown(node,helpers){const style=colorStyle(node.attrs??{}),content=helpers.renderChildren(node);return style?`<span style="${htmlAttribute(style)}">${content}</span>`:content;},
});
function colorStyle(attrs:Record<string,unknown>){return [attrs.color?`color: ${attrs.color}`:'',attrs.background?`background-color: ${attrs.background}`:''].filter(Boolean).join('; ');}

// Unknown HTML stays an opaque source fragment, never a lossy rich-text conversion.
// This tokenizer only changes inline HTML; block HTML uses Marked's complete raw token.
export function inlineHtmlToken(src:string){
  const comment=/^<!--[\s\S]*?-->/.exec(src);if(comment)return comment[0];
  const open=/^<([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(src);
  if(!open)return /^<\/[a-z][\w:-]*\s*>/i.exec(src)?.[0];
  if(/^<span\s+style=("[^"]*"|'[^']*')\s*>/i.test(open[0])&&supportedHtml(open[0]))return;
  if(/\/>$/.test(open[0])||/^(br|hr|img|input|meta|link|source|wbr)$/i.test(open[1]))return open[0];
  let depth=1;
  const tags=new RegExp(`<\\/?${open[1]}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`,'gi');
  for(const tag of src.slice(open[0].length).matchAll(tags)){
    if(tag[0].startsWith('</'))depth--;else if(!/\/>$/.test(tag[0]))depth++;
    if(!depth)return src.slice(0,open[0].length+tag.index!+tag[0].length);
  }
  return open[0];
}
