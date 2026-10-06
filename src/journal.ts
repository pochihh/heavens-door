import {shiftDay,wallTime,DEFAULT_DATE_DISPLAY} from './dates';
import type {DateDisplay} from './shared';
export type JournalPeriod='daily'|'weekly';
export interface JournalSettings {folder:string;dailyFormat:string;weeklyFormat:string;dailyTemplate:string;weeklyTemplate:string;reuseSplit?:boolean}
export interface TemplateSettings {folder:string}
export interface JournalEntry {date:string;period:JournalPeriod;path:string;id:string;words:number}
export const DEFAULT_TEMPLATES:TemplateSettings={folder:'Templates'};
export const DEFAULT_JOURNAL:JournalSettings={folder:'Journal',dailyFormat:'YYYY/MM/YYYY-MM-DD',weeklyFormat:'[Weekly]/GGGG-[W]WW',dailyTemplate:'',weeklyTemplate:'',reuseSplit:false};
export function validNotePath(value:unknown){return typeof value==='string'&&value.length>0&&value.length<=600&&value.split('/').every(p=>!!p&&!p.startsWith('.')&&!/[<>:"\\|?*]/.test(p)&&!/[. ]$/.test(p)&&![...p].some(c=>c.charCodeAt(0)<32)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));}
export function validJournalDay(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number(day.slice(0,4))>=1000&&Number(day.slice(0,4))<=9998&&!Number.isNaN(Date.parse(day))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;}
export function journalWeek(day:string){return shiftDay(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));}
export function journalToday(display:DateDisplay=DEFAULT_DATE_DISPLAY,now=new Date()){return wallTime(now.toISOString(),display).slice(0,10);}
export function formatTemplateDate(day:string,format:string,time='00:00:00'){
  if(/[a-z]/i.test(format.replace(/\[[^\]]*\]|YYYY|GGGG|MMMM|dddd|MMM|ddd|YY|MM|DD|WW|HH|hh|mm|ss|M|D|W|H|h|A/g,'')))throw new Error('Unsupported date format. Put literal text in [brackets].');
  const date=new Date(day+'T12:00:00Z'),thursday=shiftDay(journalWeek(day),3),year=thursday.slice(0,4),first=journalWeek(year+'-01-04'),week=1+Math.round((Date.parse(journalWeek(day))-Date.parse(first))/604800000),[h,m,s]=time.split(':'),pad=(v:number|string)=>String(v).padStart(2,'0');
  const names=(options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en',{...options,timeZone:'UTC'}).format(date);
  const values:Record<string,string>={YYYY:day.slice(0,4),YY:day.slice(2,4),MM:day.slice(5,7),M:String(Number(day.slice(5,7))),DD:day.slice(8),D:String(Number(day.slice(8))),MMMM:names({month:'long'}),MMM:names({month:'short'}),dddd:names({weekday:'long'}),ddd:names({weekday:'short'}),GGGG:year,WW:pad(week),W:String(week),HH:h,H:String(Number(h)),hh:pad(Number(h)%12||12),h:String(Number(h)%12||12),mm:m,ss:(s??'00').slice(0,2),A:Number(h)<12?'AM':'PM'};
  return format.replace(/\[[^\]]*\]|YYYY|GGGG|MMMM|dddd|MMM|ddd|YY|MM|DD|WW|HH|hh|mm|ss|M|D|W|H|h|A/g,t=>t.startsWith('[')?t.slice(1,-1):values[t]);
}
export function expandTemplate(value:string,title:string,day:string,time:string){return value.replace(/\{\{(title|date|time)(?::([^}]+))?\}\}/g,(_,key,format)=>key==='title'?title:formatTemplateDate(day,format??(key==='date'?'YYYY-MM-DD':'HH:mm'),time));}
export function journalPath(settings:JournalSettings,day:string,period:JournalPeriod){return settings.folder+'/'+formatTemplateDate(day,period==='daily'?settings.dailyFormat:settings.weeklyFormat)+'.md';}
export function journalDays(year:number){const start=journalWeek(`${year}-01-01`),end=shiftDay(journalWeek(`${year}-12-31`),6);return Array.from({length:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1},(_,i)=>shiftDay(start,i));}
export function journalMonth(day:string){const first=day.slice(0,7)+'-01',start=journalWeek(first);return Array.from({length:42},(_,i)=>shiftDay(start,i));}
export function validateTemplates(value:unknown):asserts value is TemplateSettings {if(!value||typeof value!=='object'||!validNotePath((value as TemplateSettings).folder))throw new Error('Invalid template folder');}
export function validateJournal(value:unknown):asserts value is JournalSettings {
  const p=value as JournalSettings;
  if(!p||typeof p!=='object'||p.reuseSplit!==undefined&&typeof p.reuseSplit!=='boolean'||!validNotePath(p.folder)||[p.dailyTemplate,p.weeklyTemplate].some(v=>typeof v!=='string'||v!==''&&(!validNotePath(v)||!v.endsWith('.md'))))throw new Error('Invalid journal settings');
  for(const [format,period] of [[p.dailyFormat,'daily'],[p.weeklyFormat,'weekly']] as const){
    if(typeof format!=='string'||format.length>150||!validNotePath(formatTemplateDate('2026-10-05',format)))throw new Error('Invalid journal filename format');
    const tokens=format.replace(/\[[^\]]*\]/g,'');
    if(period==='daily'&&(!tokens.includes('YYYY')||!tokens.includes('M')||!tokens.includes('D'))||period==='weekly'&&!(tokens.includes('GGGG')&&tokens.includes('W')||tokens.includes('YYYY')&&tokens.includes('M')&&tokens.includes('D')))throw new Error('Include a full date for daily notes, and a full date or GGGG-[W]WW for weekly notes');
  }
}
