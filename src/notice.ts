export interface NoticeReport {
  schemaVersion:1;
  severity:'error'|'warning';
  code:string;
  message:string;
  document?:string;
  occurredAt:string;
  appVersion:string;
}
export function noticeMessage(value:string){
  return value.replace(/^(?:Error:\s*)+/,'').replace(/^Error invoking remote method '[^']+':\s*/,'').replace(/^(?:Error:\s*)+/,'').trim();
}
export function noticeReport(message:string,context:{root?:string;document?:string;version:string;severity?:NoticeReport['severity'];code?:string},occurredAt=new Date().toISOString()):NoticeReport {
  const clean=(value:string)=>{
    let text=context.root?value.replaceAll(context.root,'<workspace>'):value;
    text=text.replace(/\bhttps?:\/\/[^\s<>"']+/gi,link=>{try{const url=new URL(link);url.username='';url.password='';if(url.search)url.search='?redacted';url.hash='';return url.toString();}catch{return '[url]';}});
    return text.replace(/\b(authorization|cookie|set-cookie|password|secret|token|api[-_]?key)\s*[:=]\s*[^\r\n]+/gi,'$1: [redacted]');
  };
  return {schemaVersion:1,severity:context.severity??'error',code:context.code??'OPERATION_FAILED',message:clean(noticeMessage(message)),...(context.document?{document:clean(context.document)}:{}),occurredAt,appVersion:context.version};
}
