import {createContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {DateDisplay} from '../shared';
import {calendarDays,dateDraft,DEFAULT_DATE_DISPLAY,formatDay,parseDay,shiftDay,shiftMonth,wallTime,type DateDraft} from '../dates';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {Icon,Tool} from './Icons';

export const DateDisplayContext=createContext<{display:DateDisplay;onChange:(display:DateDisplay)=>Promise<unknown>}>({display:DEFAULT_DATE_DISPLAY,onChange:async()=>undefined});
const zones=['local','UTC',...Intl.supportedValuesOf('timeZone')];
export function DateProperty({draft,display,onDisplayChange,onChange,onCommit,dateOnly=false}:{dateOnly?:boolean;draft:DateDraft;display:DateDisplay;onDisplayChange:(display:DateDisplay)=>void;onChange:(draft:DateDraft)=>void;onCommit:()=>void}){
  const today=wallTime(new Date().toISOString(),display).slice(0,10);
  const start=parseDay(draft.start.day,display.format),end=parseDay(draft.end.day,display.format),[active,setActive]=useState<'start'|'end'>('start');
  const [month,setMonth]=useState((start||today).slice(0,7)+'-01'),[focused,setFocused]=useState(start||today);
  const grid=useRef<HTMLDivElement>(null),focusPending=useRef(false),days=calendarDays(month);
  useLayoutEffect(()=>{if(focusPending.current){grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();focusPending.current=false;}},[focused,month]);
  function focusPart(part:'start'|'end'){setActive(part);const day=parseDay(draft[part].day,display.format);if(day){setMonth(day.slice(0,7)+'-01');setFocused(day);}}
  useEffect(()=>{focusPart(active);},[display.timeZone]);
  function select(day:string){
    const next={...draft,[active]:{...draft[active],day:formatDay(day,display.format)}};
    if(draft.range){if(active==='start'){if(!end||day>end)next.end={...next.end,day:next.start.day};setActive('end');}else if(start&&day<start){next.start={...next.start,day:next.end.day};next.end={...next.end,day:draft.start.day};}}
    onChange(next);setFocused(day);setMonth(day.slice(0,7)+'-01');
  }
  function navigate(day:string){focusPending.current=true;setFocused(day);setMonth(day.slice(0,7)+'-01');}
  const row=(part:'start'|'end')=><div className="date-input-row" data-active={active===part} key={part}>
    <input aria-label={part==='start'?ui.tags.startDate:ui.tags.endDate} placeholder={ui.tags.datePlaceholders[display.format]} value={draft[part].day} onFocus={()=>focusPart(part)} onChange={e=>{onChange({...draft,[part]:{...draft[part],day:e.target.value}});const day=parseDay(e.target.value,display.format);if(day){setMonth(day.slice(0,7)+'-01');setFocused(day);}}}/>
    {draft.time&&<input className="date-time-input" aria-label={part==='start'?ui.tags.dateTimeStart(ui.tags.types.date):ui.tags.dateTimeEnd(ui.tags.types.date)} value={draft[part].time} onFocus={()=>focusPart(part)} onChange={e=>onChange({...draft,[part]:{...draft[part],time:e.target.value}})}/>}
  </div>;
  return <div className="property-date-editor" onKeyDown={e=>{if(e.key==='Enter'&&e.target instanceof HTMLInputElement){e.preventDefault();onCommit();}}}>
    <div className="date-inputs">{row('start')}{draft.range&&row('end')}</div>
    <div className="date-month"><strong aria-live="polite">{new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(month+'T12:00:00Z'))}</strong><button type="button" className="date-today" onClick={()=>{if(draft.time){const instant=new Date();instant.setSeconds(0,0);const now=dateDraft(instant.toISOString(),display).start;onChange({...draft,[active]:now,...(draft.range&&active==='start'&&(!end||today>end)?{end:now}:{})});setMonth(today.slice(0,7)+'-01');setFocused(today);}else select(today);}}>{draft.time?ui.tags.now:ui.tags.today}</button><Tool icon="chevron" className="date-previous" label={tooltips.tags.previousMonth} onClick={()=>{const next=shiftMonth(month,-1);setMonth(next);setFocused(next);}}/><Tool icon="chevron" label={tooltips.tags.nextMonth} onClick={()=>{const next=shiftMonth(month,1);setMonth(next);setFocused(next);}}/></div>
    <div className="date-calendar" role="grid" aria-label={ui.tags.calendar} aria-multiselectable={draft.range||undefined} ref={grid}>
      <div className="date-week" role="row">{days.slice(0,7).map(day=><span role="columnheader" key={day} aria-label={new Intl.DateTimeFormat(undefined,{weekday:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}>{new Intl.DateTimeFormat(undefined,{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')).slice(0,2)}</span>)}</div>
      {Array.from({length:6},(_,week)=><div role="row" className="date-week" key={week}>{days.slice(week*7,week*7+7).map(day=>{
        const selected=day===start||draft.range&&day===end,inside=!!(draft.range&&start&&end&&day>start&&day<end);
        return <button type="button" role="gridcell" aria-label={formatDay(day,'full')} aria-selected={selected||inside} aria-current={day===today?'date':undefined} key={day} data-date={day} data-outside={day.slice(0,7)!==month.slice(0,7)} data-endpoint={selected} data-between={inside} tabIndex={day===focused?0:-1} onClick={()=>select(day)} onKeyDown={e=>{
          const move=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[e.key];
          if(move){e.preventDefault();navigate(shiftDay(day,move));}
          if(e.key==='Home'||e.key==='End'){e.preventDefault();const weekday=new Date(day+'T12:00:00Z').getUTCDay();navigate(shiftDay(day,e.key==='Home'?-weekday:6-weekday));}
          if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();navigate(shiftMonth(day,(e.key==='PageUp'?-1:1)*(e.shiftKey?12:1)));}
        }}><span className="date-number" aria-current={day===today?'date':undefined}>{Number(day.slice(-2))}</span></button>;
      })}</div>)}
    </div>
    <div className="date-options">
      {!dateOnly&&<label className="settings-toggle">{ui.tags.endDate}<input type="checkbox" role="switch" checked={draft.range} onChange={e=>{const start=draft.start.day?draft.start:{...draft.start,day:formatDay(today,display.format)};onChange({...draft,start,range:e.target.checked,end:start});setActive(e.target.checked?'end':'start');}}/></label>}
      <label className="date-option">{ui.tags.dateFormat}<span><select aria-label={ui.tags.dateFormat} value={display.format} onChange={e=>onDisplayChange({...display,format:e.target.value as DateDisplay['format']})}>{Object.entries(ui.tags.dateFormats).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><Icon name="chevron" size={13}/></span></label>
      {!dateOnly&&<label className="settings-toggle">{ui.tags.includeTime}<input type="checkbox" role="switch" checked={draft.time} onChange={e=>onChange({...draft,time:e.target.checked})}/></label>}
      {draft.time&&<><label className="date-option">{ui.tags.timeFormat}<span><select aria-label={ui.tags.timeFormat} value={display.timeFormat} onChange={e=>onDisplayChange({...display,timeFormat:e.target.value as DateDisplay['timeFormat']})}>{Object.entries(ui.tags.timeFormats).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><Icon name="chevron" size={13}/></span></label>
      <label className="date-option">{ui.tags.timeZone}<span><select aria-label={ui.tags.timeZone} value={display.timeZone} onChange={e=>onDisplayChange({...display,timeZone:e.target.value})}>{[...new Set([...zones,display.timeZone])].map(zone=><option key={zone} value={zone}>{zone==='local'?ui.tags.localTimeZone:zone.replaceAll('_',' ')}</option>)}</select><Icon name="chevron" size={13}/></span></label></>}
    </div>
  </div>;
}
