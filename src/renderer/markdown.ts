import { ui } from '../text/ui';
import { marked, type Token } from 'marked';
import { extractAbsorbedBlankLines } from '@tiptap/markdown';
import DOMPurify from 'dompurify';
import type { CardInfo } from '../shared';
import { withCardTitle } from '../card-title';

export function assetPath(notePath: string, source: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(source)) return '';
  const parts=notePath.replaceAll('\\','/').split('/').slice(0,-1);
  for (const part of decodeURIComponent(source).split('/')) {
    if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
export function unsupported(body: string) {
  let html=false;
  marked.walkTokens(marked.lexer(body),token => { if (token.type === 'html') html=true; });
  return html || /\[\[|\[\^|^\s*\$\$|\$[^\s$][^\n$]*\$/m.test(body);
}
export function preview(body: string,path: string) {
  // Match the editor's Markdown whitespace without mounting an editor for each preview.
  const tokens=extractAbsorbedBlankLines(marked.lexer(withCardTitle(body))) as Token[];
  const first=tokens.findIndex(token=>token.type!=='space'),last=tokens.findLastIndex(token=>token.type!=='space');
  const rendered=tokens.map((token,index)=>{
    if(token.type!=='space')return token;
    const separators=(token.raw.match(/\n\n/g)??[]).length;
    const lines=Math.max(0,separators-(index>first&&index<last?1:0));
    return {type:'html',raw:'',text:'<p><br></p>'.repeat(lines),block:true} as Token;
  });
  return renderPreview(marked.parser(rendered),path);
}
export function titlePreview(card:CardInfo) {
  const heading=document.createElement('h1');
  if(card.titleMarkdown!==undefined)heading.innerHTML=marked.parseInline(card.titleMarkdown,{async:false});
  else heading.textContent=card.title??'';
  return renderPreview(heading.outerHTML,card.path);
}
function renderPreview(html:string,path:string) {
  const clean=DOMPurify.sanitize(html,{ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto):|card:[\w-]+$|[^:]*$)/i});
  const template=document.createElement('template'); template.innerHTML=clean;
  let title=template.content.firstElementChild;
  if(title?.tagName!=='H1'){title=document.createElement('h1');template.content.prepend(title);}
  title.classList.add('card-title');
  if(!title.textContent?.trim()&&!title.querySelector('img')){title.classList.add('is-empty');title.setAttribute('aria-label',ui.editor.cardTitle);}
  // Match the editor's task structure so checkbox and text geometry do not shift on focus.
  for(const item of template.content.querySelectorAll('li')){
    const checkbox=item.querySelector<HTMLInputElement>(':scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox]');
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
  for (const image of template.content.querySelectorAll('img')) {
    const source=image.getAttribute('src') ?? '';
    const local=assetPath(path,source);
    if (local) image.src=window.door.assetUrl(local); else image.removeAttribute('src');
    image.loading='lazy';
  }
  return template.innerHTML;
}
