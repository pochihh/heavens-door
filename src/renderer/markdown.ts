import { marked } from 'marked';
import DOMPurify from 'dompurify';

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
  const clean=DOMPurify.sanitize(marked.parse(body,{async:false}),{ALLOWED_URI_REGEXP:/^(?:(?:https?|mailto):|card:[\w-]+$|[^:]*$)/i});
  const template=document.createElement('template'); template.innerHTML=clean;
  for (const image of template.content.querySelectorAll('img')) {
    const source=image.getAttribute('src') ?? '';
    const local=assetPath(path,source);
    if (local) image.src=window.door.assetUrl(local); else image.removeAttribute('src');
    image.loading='lazy';
  }
  return template.innerHTML;
}
