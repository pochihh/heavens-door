import {Fragment,useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {DEFAULT_JOURNAL,journalDays,journalMonth,journalToday,formatTemplateDate,type JournalEntry,type JournalPeriod} from '../journal';
import {shiftDay,shiftMonth} from '../dates';
import type {Preferences,Snapshot} from '../shared';
import type {Session} from './session';
import {ui} from '../text/ui';
import {Tool} from './Icons';
const text=ui.journal;
export function CalendarView({snapshot,session,onOpen,onChange}:{snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;onChange:(patch:Partial<Preferences>)=>void}){
  const settings=snapshot.preferences?.journal??DEFAULT_JOURNAL,today=journalToday(snapshot.preferences?.dateDisplay),[date,setDate]=useState(today),[selected,setSelected]=useState(today),[entries,setEntries]=useState<JournalEntry[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),grid=useRef<HTMLDivElement>(null),lock=useRef(false);
  const year=Number(date.slice(0,4)),heat=settings.calendarMode==='heatmap',days=heat?journalDays(year):journalMonth(date),daily=new Map(entries.filter(e=>e.period==='daily').map(e=>[e.date,e])),weekly=new Map(entries.filter(e=>e.period==='weekly').map(e=>[e.date,e]));
  useEffect(()=>{let stale=false;void window.door.request<JournalEntry[]>({kind:'journalEntries',year}).then(value=>{if(!stale){setEntries(value);setLoading(false);}},error=>{if(!stale){setLoading(false);session.update({error:String(error)});}});return()=>{stale=true;};},[snapshot.cards,settings,year,session]);
  useEffect(()=>{const el=grid.current,marker=el?.querySelector('[aria-current=date]');if(heat&&el&&marker)el.scrollTop+=marker.getBoundingClientRect().top-el.getBoundingClientRect().top-el.clientHeight/2;},[heat,year]);
  const open=async(day:string,period:JournalPeriod='daily')=>{if(lock.current)return;lock.current=true;setBusy(true);try{const card=await session.openJournal(day,period);setSelected(day);onOpen('card:'+card.id);}catch(error){session.update({error:String(error)});}finally{lock.current=false;setBusy(false);}};
  const move=(n:number)=>setDate(heat?`${Math.max(1001,Math.min(9997,year+n))}-01-01`:shiftMonth(date,n));
  const keyboard=(event:KeyboardEvent<HTMLButtonElement>,day:string)=>{const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(offset!==undefined){event.preventDefault();const next=shiftDay(day,offset);setSelected(next);if(!days.includes(next)||heat&&next.slice(0,4)!==date.slice(0,4))setDate(next);requestAnimationFrame(()=>grid.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());}};
  return <section className="journal-calendar" aria-label={text.calendar} aria-busy={busy||loading}>
    <div className="journal-mode" role="group" aria-label={text.calendar}>{(['month','heatmap'] as const).map(mode=><button key={mode} aria-pressed={settings.calendarMode===mode} onClick={()=>onChange({journal:{...settings,calendarMode:mode}})}>{text[mode]}</button>)}</div>
    <div className="journal-heading"><strong>{heat?year:formatTemplateDate(date,'MMMM YYYY')}</strong><button onClick={()=>{setDate(today);setSelected(today);requestAnimationFrame(()=>{const el=grid.current,marker=el?.querySelector('[aria-current=date]');if(el&&marker)el.scrollTop+=marker.getBoundingClientRect().top-el.getBoundingClientRect().top-el.clientHeight/2;});}}>{text.today}</button><Tool icon="back" label={text.previous} onClick={()=>move(-1)}/><Tool icon="forward" label={text.next} onClick={()=>move(1)}/></div>
    <div className="journal-weekdays" aria-hidden="true"><span/>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div>
    <div ref={grid} className={'journal-days '+(heat?'journal-heatmap':'')} role="grid" aria-label={heat?text.heatmap:text.month}>
      {Array.from({length:days.length/7},(_,row)=>{const week=days.slice(row*7,row*7+7),start=week[0],weekNote=weekly.get(start),monthStart=week.find(day=>day.endsWith('-01')&&day.startsWith(String(year)));return <Fragment key={start}>{heat&&monthStart&&<div className="journal-month-label" aria-hidden="true">{formatTemplateDate(monthStart,'MMMM')}</div>}<div className="journal-week" role="row">
        <button className="journal-week-link" role="rowheader" data-exists={!!weekNote} disabled={busy} data-tooltip={text.week(formatTemplateDate(start,'GGGG-[W]WW'))} aria-label={text.week(formatTemplateDate(start,'GGGG-[W]WW'))} onClick={()=>void open(start,'weekly')}>{formatTemplateDate(start,'W')}</button>
        {week.map(day=>{const entry=daily.get(day),outside=heat?day.slice(0,4)!==date.slice(0,4):day.slice(0,7)!==date.slice(0,7),level=entry?Math.min(4,1+Math.floor(entry.words/250)):0,label=text.date(formatTemplateDate(day,'dddd, MMMM D, YYYY'),entry?.words);return <button key={day} role="gridcell" data-day={day} data-level={level} data-outside={outside} aria-selected={selected===day} disabled={busy||heat&&outside} tabIndex={selected===day||!days.includes(selected)&&day===(heat?`${year}-01-01`:date.slice(0,7)+'-01')?0:-1} data-tooltip={label} aria-label={label} onKeyDown={e=>keyboard(e,day)} onClick={()=>void open(day)}>
          <span className="date-number" aria-current={day===today?'date':undefined}>{heat?'':Number(day.slice(8))}</span>{!heat&&entry&&<span className="journal-dots" aria-hidden="true">{'•'.repeat(level)}</span>}
        </button>;})}
      </div></Fragment>;})}
    </div>
    {heat&&<div className="journal-legend"><span>{text.less}</span>{[0,1,2,3,4].map(level=><i key={level} data-level={level}/>)}<span>{text.more}</span></div>}
    <button className="journal-open-today" disabled={busy} onClick={()=>void open(today)}>{text.openToday}</button>
  </section>;
}
