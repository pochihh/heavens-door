import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {DEFAULT_JOURNAL,journalMonth,journalToday,formatTemplateDate,type JournalEntry,type JournalPeriod} from '../journal';
import {shiftDay,shiftMonth} from '../dates';
import type {Snapshot} from '../shared';
import type {Session} from './session';
import {ui} from '../text/ui';
import {Tool} from './Icons';
const text=ui.journal;
export function CalendarView({snapshot,session,onOpen}:{snapshot:Snapshot;session:Session;onOpen:(key:string)=>void}){
  const settings=snapshot.preferences?.journal??DEFAULT_JOURNAL,today=journalToday(snapshot.preferences?.dateDisplay),[date,setDate]=useState(today),[selected,setSelected]=useState(today),[entries,setEntries]=useState<JournalEntry[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),grid=useRef<HTMLDivElement>(null),lock=useRef(false);
  const year=Number(date.slice(0,4)),days=journalMonth(date),daily=new Map(entries.filter(e=>e.period==='daily').map(e=>[e.date,e])),weekly=new Map(entries.filter(e=>e.period==='weekly').map(e=>[e.date,e]));
  useEffect(()=>{let stale=false;void window.door.request<JournalEntry[]>({kind:'journalEntries',year}).then(value=>{if(!stale){setEntries(value);setLoading(false);}},error=>{if(!stale){setLoading(false);session.update({error:String(error)});}});return()=>{stale=true;};},[snapshot.cards,settings,year,session]);
  const open=async(day:string,period:JournalPeriod='daily')=>{if(lock.current)return;lock.current=true;setBusy(true);try{const card=await session.openJournal(day,period);setSelected(day);onOpen('card:'+card.id);}catch(error){session.update({error:String(error)});}finally{lock.current=false;setBusy(false);}};
  const move=(n:number)=>setDate(shiftMonth(date,n));
  const keyboard=(event:KeyboardEvent<HTMLButtonElement>,day:string)=>{const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(offset!==undefined){event.preventDefault();const next=shiftDay(day,offset);setSelected(next);if(!days.includes(next))setDate(next);requestAnimationFrame(()=>grid.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());}};
  return <section className="journal-calendar" aria-label={text.calendar} aria-busy={busy||loading}>
    <div className="journal-heading"><strong>{formatTemplateDate(date,'MMMM YYYY')}</strong><button onClick={()=>{setDate(today);setSelected(today);}}>{text.today}</button><Tool icon="back" label={text.previous} onClick={()=>move(-1)}/><Tool icon="forward" label={text.next} onClick={()=>move(1)}/></div>
    <div className="journal-weekdays" aria-hidden="true"><span/>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div>
    <div ref={grid} className="journal-days" role="grid" aria-label={text.month}>
      {Array.from({length:days.length/7},(_,row)=>{const week=days.slice(row*7,row*7+7),start=week[0],weekNote=weekly.get(start);return <div key={start} className="journal-week" role="row">
        <button className="journal-week-link" role="rowheader" data-exists={!!weekNote} disabled={busy} data-tooltip={text.week(formatTemplateDate(start,'GGGG-[W]WW'))} aria-label={text.week(formatTemplateDate(start,'GGGG-[W]WW'))} onClick={()=>void open(start,'weekly')}>{formatTemplateDate(start,'W')}</button>
        {week.map(day=>{const entry=daily.get(day),outside=day.slice(0,7)!==date.slice(0,7),level=entry?Math.min(4,1+Math.floor(entry.words/250)):0,label=text.date(formatTemplateDate(day,'dddd, MMMM D, YYYY'),entry?.words);return <button key={day} role="gridcell" data-day={day} data-level={level} data-outside={outside} aria-selected={selected===day} disabled={busy} tabIndex={selected===day||!days.includes(selected)&&day===(date.slice(0,7)+'-01')?0:-1} data-tooltip={label} aria-label={label} onKeyDown={e=>keyboard(e,day)} onClick={()=>void open(day)}>
          <span className="date-number" aria-current={day===today?'date':undefined}>{Number(day.slice(8))}</span>{entry&&<span className="journal-dots" aria-hidden="true">{'•'.repeat(level)}</span>}
        </button>;})}
      </div>;})}
    </div>
    <button className="journal-open-today" disabled={busy} onClick={()=>void open(today)}>{text.openToday}</button>
  </section>;
}
