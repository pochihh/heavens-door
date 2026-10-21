// Only user-facing web and email links may leave the sandboxed renderer.
export function externalURL(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>8192)return;
  for(const char of value)if(char.charCodeAt(0)<32||char.charCodeAt(0)===127)return;
  try{const url=new URL(value.trim());if(['http:','https:','mailto:'].includes(url.protocol)&&url.pathname)return url.href;}catch{/* Relative document links stay in the workspace. */}
}
