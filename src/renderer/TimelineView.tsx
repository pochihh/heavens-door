import {useContext,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {TagResult,TagValue} from '../shared';
import type {BlockView,QueryField} from '../view-block';
import {validTagDate} from '../tags';
import {dateDraft,dateValue,dateSummary,formatDay,shiftDay,wallTime} from '../dates';
import {DateDisplayContext} from './DateProperty';
import {cardFill,tintColor} from '../colors';
import {Icon} from './Icons';
import {ui} from '../text/ui';
const t=ui.views,DAY=86400000;
export function timelineDates(value:unknown){
  const start=typeof value==='string'?value:value&&typeof value==='object'&&'start'in value?value.start:undefined;
  const end=value&&typeof value==='object'&&'end'in value?value.end:start;
  return validTagDate(start)&&validTagDate(end)&&(start.length===10)===(end.length===10)&&Date.parse(end)>=Date.parse(start)?{start:start as string,end:end as string}:null;
}
export function TimelineView({view,rows,field,onSave,onOpen,onCreate,onViewChange,onEditing,busy}:{view:BlockView;rows:TagResult[];field?:QueryField;onSave:(row:TagResult,key:string,value:TagValue)=>Promise<void>;onOpen:(key:string)=>void;onCreate?:(anchor:HTMLElement,column?:string,date?:TagValue)=>void;onViewChange:(patch:Partial<BlockView>)=>void;onEditing:(key:string|null)=>void;busy:boolean}){
  const {display}=useContext(DateDisplayContext),today=wallTime(new Date().toISOString(),display).slice(0,10);
  const [anchor,setAnchor]=useState(today),[preview,setPreview]=useState<{id:string;value:TagValue}|null>(null),[error,setError]=useState('');
  const cancel=useRef<()=>void>(()=>{}),viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>cancel.current(),[]);
  useEffect(()=>{cancel.current();setAnchor(today);setPreview(null);setError('');},[view.id,view.scale,field?.keys.join('\0')]);
  const scale=view.scale??'week',days=scale==='day'?3:scale==='week'?28:90,dayWidth=scale==='day'?576:scale==='week'?56:24;
  const start=shiftDay(anchor,-Math.floor(days/4)),origin=Date.parse(start+'T00:00:00Z'),width=days*dayWidth,step=scale==='day'?DAY/96:DAY;
  const epoch=(date:string)=>Date.parse(wallTime(date,display)+(date.length===10?'T00:00:00Z':'Z'));
  const valueOf=(row:TagResult)=>field?.keys.map(key=>row.properties[key]).find(value=>timelineDates(value)) as TagValue|undefined;
  const dated=rows.filter(row=>timelineDates(valueOf(row))),undated=rows.filter(row=>!timelineDates(valueOf(row)));
  const geometry=(value:TagValue)=>{const dates=timelineDates(value)!;return {left:(epoch(dates.start)-origin)/DAY*dayWidth,width:Math.max(12,(epoch(dates.end)-epoch(dates.start)+(dates.end.length===10?DAY:DAY/48))/DAY*dayWidth)};};
  const timeValue=(from:number,to?:number):TagValue=>{
    const draft=dateDraft('',display),part=(epoch:number)=>{const iso=new Date(epoch).toISOString();return {day:formatDay(iso.slice(0,10),display.format),time:iso.slice(11,19)};};
    return dateValue({...draft,start:part(from),end:part(to??from),range:to!==undefined,time:scale==='day'},display);
  };
  async function save(row:TagResult,value:TagValue){if(!field)return;setError('');onEditing('@timeline');setPreview({id:row.card.id,value});try{await onSave(row,field.keys[0],value);}catch(e){setError(String(e).replace(/^Error: /,''));}finally{setPreview(null);onEditing(null);}}
  function begin(e:ReactPointerEvent<HTMLElement>,row?:TagResult,mode:'move'|'start'|'end'='move'){
    if(busy||!field||e.button!==0)return;e.preventDefault();e.stopPropagation();cancel.current();setError('');
    const target=e.currentTarget,track=target.closest<HTMLElement>('.timeline-track')!,r=track.getBoundingClientRect(),x=e.clientX,y=e.clientY,pointer=e.pointerId;
    const original=row?valueOf(row):undefined,dates=timelineDates(original),from=origin+Math.floor((x-r.left)/dayWidth*DAY/step)*step;
    let moved=false,latest:TagValue,ended=false,invalid=false;
    try{latest=original??timeValue(from);}catch(err){setError(String(err));return;}
    const shift=(delta:number):TagValue=>{
      if(!dates)return timeValue(Math.min(from,from+delta),delta?Math.max(from,from+delta):undefined);
      const allDay=dates.start.length===10,increment=allDay?Math.round(delta/DAY)*DAY:delta;
      let a=epoch(dates.start),b=epoch(dates.end);
      if(mode==='move'){a+=increment;b+=increment;}else if(mode==='start')a=Math.min(a+increment,b);else b=Math.max(a,b+increment);
      const draft=dateDraft(original,display),part=(value:number)=>{const iso=new Date(value).toISOString();return {day:formatDay(iso.slice(0,10),display.format),time:iso.slice(11,19)};};
      return dateValue({...draft,start:part(a),end:part(b),range:draft.range||mode!=='move'},display,original);
    };
    const update=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;if(!moved&&Math.hypot(event.clientX-x,event.clientY-y)<5)return;moved=true;event.preventDefault();try{invalid=false;setError('');latest=shift(Math.round((event.clientX-x)/dayWidth*DAY/step)*step);setPreview({id:row?.card.id??'@new',value:latest});}catch(err){invalid=true;setError(String(err));}};
    const finish=(event?:PointerEvent)=>{
      if(ended||event&&event.pointerId!==pointer)return;if(event)update(event);ended=true;
      document.removeEventListener('pointermove',update);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);setPreview(null);onEditing(null);
      if(!event||invalid)return;
      const area=viewport.current?.getBoundingClientRect();if(area&&(event.clientX<area.left||event.clientX>area.right||event.clientY<area.top||event.clientY>area.bottom))return;
      if(row){if(moved&&JSON.stringify(original)!==JSON.stringify(latest))void save(row,latest);else if(!moved&&mode==='move')onOpen('card:'+row.card.id);}else onCreate?.(target,undefined,latest);
    };
    const abort=()=>finish(),key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abort();}};
    cancel.current=abort;onEditing('@timeline');document.addEventListener('pointermove',update,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  }
  if(!field)return <p className="muted">{t.chooseDate}</p>;
  return <div className="timeline-view">
    <div className="timeline-toolbar"><button onClick={()=>setAnchor(shiftDay(anchor,-days))} aria-label={t.previous}><Icon name="back" size={14}/></button><strong>{formatDay(anchor,'short')}</strong><button onClick={()=>setAnchor(shiftDay(anchor,days))} aria-label={t.next}><Icon name="forward" size={14}/></button><div className="toolbar-spacer"/><select aria-label={t.timeline} value={scale} onChange={e=>onViewChange({scale:e.target.value as BlockView['scale']})}>{(['day','week','month'] as const).map(s=><option key={s} value={s}>{t[s]}</option>)}</select><button onClick={()=>setAnchor(today)}>{t.today}</button></div>
    <div className="timeline-scroll" ref={viewport}><div className="timeline-grid" style={{width:width+180,'--timeline-day':dayWidth+'px'} as React.CSSProperties}>
      <div className="timeline-row timeline-heading" data-hours={scale==='day'}><span>{t.fields.cardName}</span><div className="timeline-track">{Array.from({length:days},(_,i)=><span key={i} style={{left:i*dayWidth,width:dayWidth}}>{formatDay(shiftDay(start,i),'short').replace(/, \d{4}$/,'')}{scale==='day'&&<small className="timeline-hours">{[0,4,8,12,16,20].map(hour=><span key={hour}>{new Intl.DateTimeFormat(undefined,{hour:'numeric',hour12:display.timeFormat==='12',timeZone:'UTC'}).format(new Date(Date.UTC(2000,0,1,hour)))}</span>)}</small>}</span>)}</div></div>
      {dated.map(row=>{const value=preview?.id===row.card.id?preview.value:valueOf(row)!,g=geometry(value),outside=g.left+g.width<0||g.left>width;return <div className="timeline-row" key={row.card.id}><button className="timeline-name" onClick={()=>onOpen('card:'+row.card.id)}>{row.card.title||row.card.name}</button><div className="timeline-track">{outside?<button className="timeline-outside" style={{[g.left<0?'left':'right']:4}} onClick={()=>setAnchor(wallTime(timelineDates(value)!.start,display).slice(0,10))}>{dateSummary(value,display)} <Icon name={g.left<0?'back':'forward'} size={12}/></button>:<div className="timeline-bar" style={{left:Math.max(0,g.left),width:Math.min(width,g.left+g.width)-Math.max(0,g.left),background:tintColor(cardFill(row.card))}} role="button" tabIndex={0} aria-label={(row.card.title||row.card.name)+' · '+dateSummary(value,display)} onPointerDown={e=>begin(e,row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen('card:'+row.card.id);}}}><button className="timeline-resize" aria-label={ui.tags.startDate} onPointerDown={e=>begin(e,row,'start')} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}/><span>{row.card.title||row.card.name}</span><button className="timeline-resize" aria-label={ui.tags.endDate} onPointerDown={e=>begin(e,row,'end')} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}/></div>}{preview?.id===row.card.id&&<output className="timeline-feedback" style={{left:Math.max(0,Math.min(width-250,g.left))}}>{dateSummary(value,display)}</output>}</div></div>;})}
      {onCreate&&<div className="timeline-row"><span>{t.newCard}</span><div className="timeline-track timeline-new-track" role="button" tabIndex={0} aria-label={t.newCard} onPointerDown={e=>begin(e)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onCreate(e.currentTarget,undefined,anchor);}}}>{preview?.id==='@new'&&<div className="timeline-bar" style={geometry(preview.value)}>{dateSummary(preview.value,display)}</div>}</div></div>}
    </div></div>
    {!!undated.length&&<div className="timeline-unscheduled"><span>{t.unscheduled} · {undated.length}</span>{undated.map(row=><button key={row.card.id} onClick={()=>onOpen('card:'+row.card.id)}>{row.card.title||row.card.name}</button>)}</div>}
    {error&&<p className="change-removed" role="alert">{error}</p>}
  </div>;
}
