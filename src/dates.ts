import type {DateDisplay,TagValue} from './shared';
import {validTagDate} from './tags';
import {ui} from './text/ui';

export const DEFAULT_DATE_DISPLAY:DateDisplay={format:'mdy',timeFormat:'12',timeZone:'local'};
export function validateDateDisplay(value:unknown):asserts value is DateDisplay {
  const p=value as DateDisplay;
  if(!p||typeof p!=='object'||Array.isArray(p)||!['full','short','mdy','dmy','ymd'].includes(p.format)||!['12','24'].includes(p.timeFormat)||typeof p.timeZone!=='string')throw new Error(ui.tags.invalidDateDisplay);
  try{new Intl.DateTimeFormat('en',{timeZone:dateZone(p)});}catch{throw new Error(ui.tags.invalidDateDisplay);}
}
export const dateZone=(display:DateDisplay)=>display.timeZone==='local'?Intl.DateTimeFormat().resolvedOptions().timeZone:display.timeZone;
const pad=(value:number)=>String(value).padStart(2,'0');
export const isoDay=(date:Date)=>date.toISOString().slice(0,10);
export function shiftDay(day:string,days:number){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return isoDay(date);}
export function shiftMonth(day:string,months:number){const date=new Date(day+'T12:00:00Z'),d=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);const end=new Date(+date);end.setUTCMonth(end.getUTCMonth()+1,0);date.setUTCDate(Math.min(d,end.getUTCDate()));return isoDay(date);}
export function calendarDays(month:string){const first=month.slice(0,7)+'-01',start=shiftDay(first,-new Date(first+'T12:00:00Z').getUTCDay());return Array.from({length:42},(_,i)=>shiftDay(start,i));}
export function wallTime(value:string,display:DateDisplay){
  if(value.length===10||!validTagDate(value))return value;
  const date=new Date(value),parts=new Intl.DateTimeFormat('en-CA',{timeZone:dateZone(display),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${String(date.getUTCMilliseconds()).padStart(3,'0')}`;
}
export function formatDay(day:string,format:DateDisplay['format']){
  if(!validTagDate(day)||day.length!==10)return day;
  const [y,m,d]=day.split('-');
  if(format==='mdy')return `${m}/${d}/${y}`;
  if(format==='dmy')return `${d}/${m}/${y}`;
  if(format==='ymd')return `${y}/${m}/${d}`;
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:format==='full'?'long':'short',day:'numeric',year:'numeric'}).format(new Date(day+'T12:00:00Z'));
}
export function parseDay(text:string,format:DateDisplay['format']):string|null{
  const s=text.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return validTagDate(s)?s:null;
  let y:string,m:string,d:string;const numeric=s.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  if(numeric){const parts=numeric.slice(1);[y,m,d]=format==='ymd'?parts:format==='dmy'?[parts[2],parts[1],parts[0]]:[parts[2],parts[0],parts[1]];}
  else{const named=s.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i),months=['january','february','march','april','may','june','july','august','september','october','november','december'];if(!named)return null;const month=months.findIndex(name=>name===named[1].toLowerCase()||name.slice(0,3)===named[1].toLowerCase());if(month<0)return null;[y,m,d]=[named[3],String(month+1),named[2]];}
  const day=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;return y.length===4&&validTagDate(day)?day:null;
}
function formatTime(time:string,display:DateDisplay){const [hour,...rest]=time.split(':'),h=Number(hour),tail=rest.join(':').replace(/:00(?:\.000)?$/,'').replace(/\.000$/,'');return display.timeFormat==='24'?`${hour}:${tail}`:`${h%12||12}:${tail} ${h<12?'AM':'PM'}`;}
function parseTime(text:string):string|null{
  const match=text.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d)(\.\d{1,3})?)?\s*(AM|PM)?$/i);if(!match)return null;
  let h=Number(match[1]);if(match[5]){if(h<1||h>12)return null;h=h%12+(match[5].toUpperCase()==='PM'?12:0);}else if(h>23)return null;
  return `${pad(h)}:${match[2]}:${match[3]||'00'}${(match[4]||'.').padEnd(4,'0')}`;
}
export interface DateDraft {start:{day:string;time:string};end:{day:string;time:string};range:boolean;time:boolean}
export function dateDraft(value:unknown,display:DateDisplay):DateDraft{
  const range=!!value&&typeof value==='object'&&'start' in value&&'end' in value,start=typeof value==='string'?value:range?String(value.start):'',end=range?String(value.end):start;
  const part=(s:string)=>{const [day,time='00:00:00.000']=wallTime(s,display).split('T');return {day:formatDay(day,display.format),time:formatTime(time,display)};};
  return {start:part(start),end:part(end),range,time:start.includes('T')};
}
function encodeWall(day:string,time:string,display:DateDisplay,original?:string){
  const target=day+'T'+time;
  if(original&&wallTime(original,display)===target)return original;
  const naive=Date.parse(target+'Z'),offsets=new Set<number>();
  // Probe both sides of a clock change; reject nonexistent times instead of silently shifting them.
  for(const hours of [-36,0,36]){const instant=naive+hours*3600000;offsets.add(Date.parse(wallTime(new Date(instant).toISOString(),display)+'Z')-instant);}
  const candidates=[...offsets].map(offset=>new Date(naive-offset).toISOString()).filter(instant=>wallTime(instant,display)===target).sort();
  if(!candidates.length)throw new Error(ui.tags.missingLocalTime);
  return candidates[0]; // A repeated local time chooses its first occurrence; unchanged values retain their exact offset.
}
export function dateValue(draft:DateDraft,display:DateDisplay,original?:unknown):TagValue{
  const previous=typeof original==='string'?{start:original,end:original}:original&&typeof original==='object'&&'start' in original&&'end' in original?original:undefined;
  const encode=(part:DateDraft['start'],old:unknown)=>{const day=parseDay(part.day,display.format);if(!day)throw new Error(ui.tags.invalidDate);if(!draft.time)return day;const time=parseTime(part.time);if(!time)throw new Error(ui.tags.invalidTime);return encodeWall(day,time,display,typeof old==='string'?old:undefined);};
  if(!draft.start.day.trim()&&!draft.range)return null;
  const start=encode(draft.start,previous?.start);return draft.range?{start,end:encode(draft.end,previous?.end)}:start;
}
export function dateSummary(value:unknown,display:DateDisplay){const draft=dateDraft(value,display),format=(part:DateDraft['start'])=>part.day+(draft.time?' '+part.time:'');return draft.start.day?format(draft.start)+(draft.range?' → '+format(draft.end):''):'';}
