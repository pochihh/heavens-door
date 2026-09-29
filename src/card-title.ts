import { marked } from 'marked';

// Only a leading H1 is the card title. Later H1s remain part of the body.
export function leadingTitle(body:string) {
  const first=marked.lexer(body).find(token=>token.type!=='space');
  return first?.type==='heading'&&first.depth===1?first:undefined;
}
export function withCardTitle(body:string) {return leadingTitle(body)?body:body.trim()?`# \n\n${body}`:'# ';}
