import {useContext,useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {TagResult,TagValue} from '../shared';
import type {BlockView,QueryField} from '../view-block';
import {validTagDate} from '../tags';
import {dateDraft,dateValue,dateSummary,formatDay,shiftDay,wallTime} from '../dates';
import {DateDisplayContext} from './DateProperty';
import {cardFill,tintColor} from '../colors';
import {Icon,Tool} from './Icons';
import {PropertyPopover} from './PropertyValue';
import {tooltips} from '../text/tooltips';
import {ui} from '../text/ui';
const t=ui.views,DAY=86400000;
export function timelineDates(value:unknown){
  const start=typeof value==='string'?value:value&&typeof value==='object'&&'start'in value?value.start:undefined;
  const end=value&&typeof value==='object'&&'end'in value?value.end:start;
  return validTagDate(start)&&validTagDate(end)&&(start.length===10)===(end.length===10)&&Date.parse(end)>=Date.parse(start)?{start:start as string,end:end as string}:null;
}
export function TimelineView({view,rows,field,onSave,onOpen,onCreate,onViewChange,onEditing,busy}:{view:BlockView;rows:TagResult[];field?:QueryField;onSave:(row:TagResult,key:string,value:TagValue)=>Promise<void>;onOpen:(key:string)=>void;onCreate?:(anchor:HTMLElement,column?:string,date?:TagValue)=>void;onViewChange:(patch:Partial<BlockView>)=>void;onEditing:(key:string|null)=>void;busy:boolean}){
  const {display}=useContext(DateDisplayContext),today=wallTime(new Date().toISOString(),display).slice(0,10);
  const [anchor,setAnchor]=useState(today),[preview,setPreview]=useState<{id:string;value:TagValue}|null>(null),[error,setError]=useState(''),[scaleMenu,setScaleMenu]=useState<HTMLElement|null>(null);
  const cancel=useRef<()=>void>(()=>{}),viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>cancel.current(),[]);
  useEffect(()=>{cancel.current();setAnchor(today);setPreview(null);setError('');},[view.id,view.scale,field?.keys.join('\0')]);
  const scale=view.scale??'week',days=scale==='day'?3:scale==='week'?28:90,dayWidth=scale==='day'?576:scale==='week'?56:24;
  const start=shiftDay(anchor,-Math.floor(days/4)),origin=Date.parse(start+'T00:00:00Z'),width=days*dayWidth,step=scale==='day'?DAY/96:DAY;
  useLayoutEffect(()=>{if(viewport.current)viewport.current.scrollLeft=Math.max(0,Math.floor(days/4)*dayWidth-viewport.current.clientWidth/4);},[anchor,scale,view.id]);
  const calendar=Array.from({length:days},(_,i)=>{const day=shiftDay(start,i),date=new Date(day+'T00:00:00Z');return {day,date,weekend:[0,6].includes(date.getUTCDay())};});
  const months: {label:string;left:number;width:number}[]=[];
  for(let i=0;i<days;i++){const day=calendar[i];if(!i||day.day.endsWith('-01'))months.push({label:new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'}).format(day.date),left:i*dayWidth,width:0});months.at(-1)!.width+=dayWidth;}
  const todayX=(Date.parse(today+'T00:00:00Z')-origin)/DAY*dayWidth+dayWidth/2;
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
    <div className="timeline-toolbar"><strong>{new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(anchor+'T00:00:00Z'))}</strong><div className="toolbar-spacer"/>
      <button className="timeline-scale" aria-label={t.scale} aria-haspopup="dialog" aria-expanded={!!scaleMenu} onClick={e=>setScaleMenu(scaleMenu?null:e.currentTarget)}>{t[scale]}<Icon name="down" size={12}/></button>
      <Tool className="timeline-previous" icon="chevron" label={tooltips.views.previous} onClick={()=>setAnchor(shiftDay(anchor,-days))}/><button onClick={()=>{setAnchor(today);if(viewport.current)viewport.current.scrollLeft=Math.max(0,todayX-viewport.current.clientWidth/4);}}>{t.today}</button><Tool icon="chevron" label={tooltips.views.next} onClick={()=>setAnchor(shiftDay(anchor,days))}/>
    </div>
    {scaleMenu&&<PropertyPopover anchor={scaleMenu} align="end" label={t.scale} className="timeline-scale-menu" onClose={()=>setScaleMenu(null)}><div className="view-menu-list" role="listbox" aria-label={t.scale}>{(['day','week','month'] as const).map(s=><button key={s} role="option" aria-selected={scale===s} onClick={()=>{setScaleMenu(null);onViewChange({scale:s});}}><span>{t[s]}</span>{scale===s&&<Icon name="check"/>}</button>)}</div></PropertyPopover>}
    <div className="timeline-scroll" ref={viewport}><div className="timeline-grid" style={{width,'--timeline-day':dayWidth+'px'} as React.CSSProperties}>
      <div className="timeline-heading" data-scale={scale}>
        <div className="timeline-months">{months.map(month=><span key={month.left} style={{left:month.left,width:month.width}}><span>{month.label}</span></span>)}</div>
        <div className="timeline-days">{calendar.map(({day,date,weekend},i)=><div key={day} className="timeline-day" data-weekend={weekend} style={{left:i*dayWidth,width:dayWidth}}>{scale==='day'?<><span>{new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(date)}</span><div className="timeline-hours">{[0,4,8,12,16,20].map(hour=><span key={hour}>{new Intl.DateTimeFormat(undefined,{hour:'numeric',hour12:display.timeFormat==='12',timeZone:'UTC'}).format(new Date(Date.UTC(2000,0,1,hour)))}</span>)}</div></>:<span className="timeline-day-number" aria-current={day===today?'date':undefined}>{date.getUTCDate()}</span>}</div>)}</div>
      </div>
      <div className="timeline-calendar" aria-hidden="true">{calendar.map(({day,weekend},i)=>weekend&&<span key={day} style={{left:i*dayWidth,width:dayWidth}}/> )}</div>
      {todayX>=0&&todayX<width&&<div className="timeline-today-line" aria-hidden="true" style={{left:todayX}}/>}
      {dated.map(row=>{const value=preview?.id===row.card.id?preview.value:valueOf(row)!,g=geometry(value),outside=g.left+g.width<=0||g.left>=width,left=Math.max(0,g.left),barWidth=Math.min(width,g.left+g.width)-left;return <div className="timeline-row" key={row.card.id}><div className="timeline-track">{outside?<button className="timeline-outside" style={{[g.left<0?'left':'right']:4}} onClick={()=>setAnchor(wallTime(timelineDates(value)!.start,display).slice(0,10))}><Icon name={g.left<0?'back':'forward'} size={12}/><span>{row.card.title||row.card.name}</span><small>{dateSummary(value,display)}</small></button>:<div className="timeline-bar" data-dragging={preview?.id===row.card.id} style={{left,width:barWidth,background:tintColor(cardFill(row.card))}} role="button" tabIndex={0} aria-label={(row.card.title||row.card.name)+' · '+dateSummary(value,display)} onPointerDown={e=>begin(e,row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen('card:'+row.card.id);}}}><button className="timeline-resize timeline-resize-start" aria-label={ui.tags.startDate} onPointerDown={e=>begin(e,row,'start')} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}/><span className="timeline-bar-label" style={{width:Math.max(0,Math.min(width-left-8,Math.max(barWidth-16,240)))}}><Icon name="note" size={14}/><span>{row.card.title||row.card.name}</span></span><button className="timeline-resize timeline-resize-end" aria-label={ui.tags.endDate} onPointerDown={e=>begin(e,row,'end')} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}/></div>}{preview?.id===row.card.id&&<output className="timeline-feedback" style={{left:Math.max(0,Math.min(width-250,g.left))}}>{dateSummary(value,display)}</output>}</div></div>;})}
      {onCreate&&<div className="timeline-row"><div className="timeline-track timeline-new-track" role="button" tabIndex={0} aria-label={t.newCard} onPointerDown={e=>begin(e)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onCreate(e.currentTarget,undefined,anchor);}}}><span className="timeline-new-label"><Icon name="plus" size={14}/>{t.newCard}</span>{preview?.id==='@new'&&<div className="timeline-bar" style={geometry(preview.value)}><span className="timeline-bar-label">{dateSummary(preview.value,display)}</span></div>}</div></div>}
    </div></div>
    {!!undated.length&&<details className="timeline-unscheduled"><summary>{t.unscheduled} · {undated.length}</summary><div>{undated.map(row=><button key={row.card.id} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note" size={14}/>{row.card.title||row.card.name}</button>)}</div></details>}
    {error&&<p className="change-removed" role="alert">{error}</p>}
  </div>;
}
