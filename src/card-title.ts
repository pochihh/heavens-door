import { marked } from 'marked';

// Only a leading H1 is the card title. Later H1s remain part of the body.
export function leadingTitle(body:string) {
  const first=marked.lexer(body).find(token=>token.type!=='space');
  return first?.type==='heading'&&first.depth===1?first:undefined;
}
export function withCardTitle(body:string) {return leadingTitle(body)?body:`# \n\n${body}`;}

export function withExtractedTitle(body:string,title:string) {
  const first=marked.lexer(body).find(token=>token.type!=='space');
  if(first?.type==='heading')return first.depth===1?body:'# '+first.text+'\n\n'+body.slice(body.indexOf(first.raw)+first.raw.length).replace(/^\n+/,'');
  if(first?.type==='paragraph'&&first.tokens?.[0]?.type!=='image')return body.trimStart().replace(/^([^\n]*)(?:\n+|$)/,'# $1\n\n');
  return '# '+title.replace(/[\\`*_{}[\]()#+.!<>~|]/g,'\\$&')+'\n\n'+body;
}
