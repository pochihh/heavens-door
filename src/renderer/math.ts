import katex from 'katex';
export function mathToken(source:string,block=false){
  const match=block?/^\$\$[ \t]*\n([\s\S]+?)\n\$\$[ \t]*(?:\n|$)/.exec(source)??/^\$\$([^\n]+?)\$\$[ \t]*(?:\n|$)/.exec(source):/^\$(?!\$|\s)((?:\\.|[^$\n\\])+?)\$(?!\d)/.exec(source);
  if(!match||!block&&/\s$/.test(match[1]))return;
  return {type:block?'mathBlock':'mathInline',raw:match[0],text:match[1]};
}
export function mathHtml(latex:string,block=false){
  return katex.renderToString(latex,{displayMode:block,throwOnError:false,trust:false,maxExpand:1000,maxSize:20});
}
