import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {noticeMessage,noticeReport,type NoticeReport} from '../notice';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {Icon,Tool} from './Icons';

export function NoticeBanner({message,document:documentPath,root,severity='error',code,actions,onDismiss}:{message:string;document?:string;root?:string;severity?:NoticeReport['severity'];code?:string;actions?:ReactNode;onDismiss:()=>void}){
  const [details,setDetails]=useState(false),[version,setVersion]=useState<string>(ui.notices.unknownVersion),[copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false);
  const occurredAt=useMemo(()=>new Date().toISOString(),[message]);
  useEffect(()=>{let live=true;void Promise.resolve().then(()=>window.door.updateState()).then(state=>{if(live)setVersion(state.currentVersion);}).catch(()=>undefined);return()=>{live=false;};},[]);
  const report=useMemo(()=>noticeReport(message,{root,document:documentPath,version,severity,code},occurredAt),[message,root,documentPath,version,severity,code,occurredAt]);
  const text=JSON.stringify(report,null,2),summary=noticeMessage(message).split('\n')[0]||ui.notices.failed;
  async function copy(){try{await navigator.clipboard.writeText(text);setCopied(true);setCopyFailed(false);}catch{setCopyFailed(true);setCopied(false);}}
  return <section className="context-banner" data-severity={severity} aria-label={ui.notices.label}>
    <div className="context-banner-heading"><Icon name="warning"/><div className="context-banner-copy"><strong role={severity==='error'?'alert':'status'}>{summary}</strong>{documentPath&&<small>{documentPath}</small>}</div><Tool icon="close" label={tooltips.recovery.dismissError} onClick={onDismiss}/></div>
    <div className="context-banner-actions">{actions}<button type="button" aria-expanded={details} onClick={()=>setDetails(!details)}>{ui.notices.details}</button><button type="button" onClick={()=>void copy()}>{ui.notices.copyReport}</button>{copied&&<span role="status">{ui.notices.copied}</span>}</div>
    {details&&<div className="context-banner-details"><dl><div><dt>{ui.notices.code}</dt><dd>{report.code}</dd></div><div><dt>{ui.notices.version}</dt><dd>{report.appVersion}</dd></div><div><dt>{ui.notices.time}</dt><dd>{report.occurredAt}</dd></div></dl><pre>{report.message}</pre></div>}
    {copyFailed&&<div className="context-banner-details"><p role="status">{ui.notices.copyFailed}</p><textarea readOnly aria-label={ui.notices.report} value={text} onFocus={e=>e.currentTarget.select()}/></div>}
  </section>;
}
