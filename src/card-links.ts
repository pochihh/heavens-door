import {marked} from 'marked';
// Rebase only the moved note's conventional relative links and images.
export function moveCardLinks(body:string,from:string,to:string){
  from=from.replace(/\\/g,'/');to=to.replace(/\\/g,'/');
  const rewrite=(href:string)=>{
    if(/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href))return href;
    const split=href.search(/[?#]/),path=split<0?href:href.slice(0,split),suffix=split<0?'':href.slice(split);
    let decoded:string;try{decoded=decodeURIComponent(path);}catch{return href;}
    const target=from.split('/').slice(0,-1);
    for(const part of decoded.split('/')){if(part==='..'){if(!target.length)return href;target.pop();}else if(part&&part!=='.')target.push(part);}
    const destination=(target.join('/')===from?to:target.join('/')).split('/'),base=to.split('/').slice(0,-1);
    while(base.length&&base[0]===destination[0]){base.shift();destination.shift();}
    return [...base.map(()=>'..'),...destination].map(encodeURIComponent).join('/')+suffix;
  };
  let cursor=0;const edits:{start:number;end:number;text:string}[]=[];
  marked.walkTokens(marked.lexer(body),token=>{
    if(!['code','codespan','html','image','link','def'].includes(token.type))return;
    const start=body.indexOf(token.raw,cursor);if(start<0)return;cursor=start+token.raw.length;
    let next=token.raw;
    if((token.type==='image'||token.type==='link')&&token.raw.includes('](')){
      if(token.type==='link')marked.walkTokens(token.tokens??[],child=>{if(child.type==='image')next=next.replace(child.raw,child.raw.replace(']('+child.href,']('+rewrite(child.href)).replace('](<'+child.href+'>','](<'+rewrite(child.href)+'>'));});
      const href=rewrite(token.href);next=next.replace(']('+token.href,']('+href).replace('](<'+token.href+'>','](<'+href+'>');
    }else if(token.type==='html'&&!token.raw.startsWith('<!--'))next=token.raw.replace(/\b(src|href)=(['"])(.*?)\2/gi,(all,key,quote,href)=>key+'='+quote+rewrite(href)+quote);
    else if(token.type==='def')next=token.raw.replace(token.href,rewrite(token.href));
    if(next!==token.raw)edits.push({start,end:cursor,text:next});
  });
  for(const edit of edits.reverse())body=body.slice(0,edit.start)+edit.text+body.slice(edit.end);
  return body;
}
