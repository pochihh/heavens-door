import '../document-links';
import {mathHtml,mathToken} from './math';
marked.use({extensions:([{name:'mathBlock',level:'block'},{name:'mathInline',level:'inline'}] as const).map(({name,level})=>({name,level,start:(source:string)=>source.indexOf(name==='mathBlock'?'$$':'$'),tokenizer:(source:string)=>mathToken(source,name==='mathBlock'),renderer:(token)=>mathHtml(token.text,name==='mathBlock')}))});
import {parseImageLayout,imageHtml} from './image-layout';
import { ui } from '../text/ui';
import { marked, type Token } from 'marked';
import { extractAbsorbedBlankLines } from '@tiptap/markdown';
import DOMPurify from 'dompurify';
import type { CardInfo } from '../shared';
import { withCardTitle } from '../card-title';

export function assetPath(notePath: string, source: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) return '';
  const parts=notePath.replaceAll('\\','/').split('/').slice(0,-1);
  let decoded:string;try{decoded=decodeURIComponent(source);}catch{return '';}
  for (const part of decoded.split('/')) {
    if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
export function unsupported(body: string) {
  let text=body;marked.walkTokens(marked.lexer(body),token=>{if(['html','code','codespan'].includes(token.type))text=text.replace(token.raw,'');});
  return /!\[\[|\[\^/m.test(text);
}
export function preview(body: string,path: string,reservedTitle=true) {
  // Match the editor's Markdown whitespace without mounting an editor for each preview.
  const tokens=extractAbsorbedBlankLines(marked.lexer(reservedTitle?withCardTitle(body):body)) as Token[];
  const first=tokens.findIndex(token=>token.type!=='space'),last=tokens.findLastIndex(token=>token.type!=='space');
  const rendered=tokens.map((token,index)=>{
    if(token.type!=='space')return token;
    const separators=(token.raw.match(/\n\n/g)??[]).length;
    const lines=Math.max(0,separators-(index>first&&index<last?1:0));
    return {type:'html',raw:'',text:'<p><br></p>'.repeat(lines),block:true} as Token;
  });
  return renderPreview(marked.parser(rendered),path,reservedTitle);
}
export function titlePreview(card:CardInfo) {
  const heading=document.createElement('h1');
  if(card.titleMarkdown!==undefined)heading.innerHTML=marked.parseInline(card.titleMarkdown,{async:false});
  else heading.textContent=card.title??'';
  return renderPreview(heading.outerHTML,card.path);
}
export function previewHtml(html:string,path:string){return renderPreview(html,path,false).replace(/<input\b/g,'<input disabled');}
function renderPreview(html:string,path:string,reservedTitle=true) {
  const clean=DOMPurify.sanitize(html,{FORBID_TAGS:['script','style','iframe','object','embed','form','button','textarea','select','video','audio','source','link','meta'],ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto):|card:[\w-]+$|wiki:[^\s]+$|[^:]*$)/i});
  const template=document.createElement('template'); template.innerHTML=clean;
  if(reservedTitle){let title=template.content.firstElementChild;
  if(title?.tagName!=='H1'){title=document.createElement('h1');template.content.prepend(title);}
  title.classList.add('card-title');
  if(!title.textContent?.trim()&&!title.querySelector('img')){title.classList.add('is-empty');title.setAttribute('aria-label',ui.editor.cardTitle);}
  }
  const taskCheckbox=(item:Element)=>item.querySelector<HTMLInputElement>(':scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox]');
  // Marked joins adjacent bullets and tasks; only task runs should lose their markers.
  for(const list of [...template.content.querySelectorAll('ul,ol')]){
    const items=[...list.children];if(!items.some(taskCheckbox)||items.every(taskCheckbox))continue;
    let group:Element|null=null,previous:boolean|undefined;
    items.forEach((item,index)=>{
      const task=!!taskCheckbox(item);
      if(task!==previous){group=list.cloneNode(false) as Element;if(list.tagName==='OL')group.setAttribute('start',String(Number(list.getAttribute('start')??1)+index));list.before(group);previous=task;}
      group!.append(item);
    });list.remove();
  }
  // Match the editor's task structure so checkbox and text geometry do not shift on focus.
  for(const item of template.content.querySelectorAll('li')){
    const checkbox=taskCheckbox(item);
    if(!checkbox)continue;
    item.dataset.checked=String(checkbox.checked);item.parentElement!.dataset.type='taskList';
    const label=document.createElement('label'),content=document.createElement('div');label.append(checkbox);
    content.append(...item.childNodes);
    if(content.firstChild?.nodeType===3)content.firstChild.textContent=content.firstChild.textContent!.trimStart();
    if(content.firstElementChild?.tagName!=='P'){
      const paragraph=document.createElement('p');
      while(content.firstChild&&!(content.firstChild.nodeType===1&&/^(UL|OL|BLOCKQUOTE|PRE|TABLE)$/.test((content.firstChild as Element).tagName)))paragraph.append(content.firstChild);
      content.prepend(paragraph);
    }
    item.replaceChildren(label,content);
  }
  // Image previews share the editor's block spacing and wrapping captions.
  // This only changes rendered DOM, never the portable HTML stored in the card.
  for(const block of template.content.querySelectorAll<HTMLElement>('[data-better-edit-image-row], [data-better-edit-image]')){
    if(block.parentElement?.closest('[data-better-edit-image-row]'))continue;
    const layout=parseImageLayout(block.outerHTML);if(!layout)continue;
    const wrapper=document.createElement('div'),content=document.createElement('div');
    wrapper.className='editor-image-layout '+(layout.kind==='row'?'is-row':'is-single');
    content.innerHTML=imageHtml(layout);
    const body=layout.kind==='row'?content.firstElementChild as HTMLElement:content;
    body.classList.add('image-layout-content');
    for(const item of body.querySelectorAll<HTMLElement>('[data-better-edit-image="filled"]')){
      item.classList.add('editor-image');
      const caption=item.querySelector('p');if(caption){const hidden=caption.style.display==='none';caption.removeAttribute('style');caption.className='image-caption';if(hidden)caption.style.display='none';}
    }
    wrapper.append(body);block.replaceWith(wrapper);
  }
  for (const image of template.content.querySelectorAll('img')) {
    const source=image.getAttribute('src') ?? '';
    const local=assetPath(path,source);
    if (local) image.src=window.door.assetUrl(local); else image.removeAttribute('src');
    image.removeAttribute('srcset');image.loading='lazy';
  }
  for(const element of template.content.querySelectorAll<HTMLElement>('[style]')){for(const property of [...element.style]){if(/url\s*\(|expression\s*\(|@import/i.test(element.style.getPropertyValue(property)))element.style.removeProperty(property);}}
  return template.innerHTML;
}
