// Keep the exact YAML header, including comments and whitespace.
export function splitCardSource(source:string){
  const header=/^(---\r?\n)[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)?.[0]??'';
  return {header,body:source.slice(header.length)};
}
