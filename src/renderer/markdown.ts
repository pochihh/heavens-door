import { ui } from '../text/ui';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { CardInfo } from '../shared';

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
export function preview(body: string,path: string) {return renderPreview(marked.parse(body,{async:false}),path);}
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
  for (const image of template.content.querySelectorAll('img')) {
    const source=image.getAttribute('src') ?? '';
    const local=assetPath(path,source);
    if (local) image.src=window.door.assetUrl(local); else image.removeAttribute('src');
    image.loading='lazy';
  }
  return template.innerHTML;
}
