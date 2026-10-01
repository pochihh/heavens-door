import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {Board,CardInfo,TagField,TagValue} from '../shared';
import {STATUS_GROUPS} from '../shared';
import {fieldOptions,multipleChoices,propertyType,validateTagValue,validTagDate} from '../tags';
import {Icon,Tool} from './Icons';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';

export const propertyText=(value:unknown):string=>value===null||value===undefined?'':Array.isArray(value)?value.join(', '):typeof value==='object'&&'start' in value&&'end' in value?`${value.start} – ${value.end}`:String(value);

// Small editors share the app's menu placement and dismissal behavior without changing the row.
export function PropertyPopover({anchor,label,onClose,children}:{anchor:HTMLElement;label:string;onClose:(cancel:boolean)=>void;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{const el=ref.current!;el.showPopover();el.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled),textarea')?.focus();},[]);
  useLayoutEffect(()=>{const el=ref.current!,r=anchor.getBoundingClientRect(),box=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.left,innerWidth-box.width-8))+'px';el.style.top=(r.bottom+box.height+8<innerHeight?r.bottom+4:Math.max(8,r.top-box.height-4))+'px';});
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!anchor.contains(e.target as Node))close.current(false);},dismiss=()=>close.current(false);
    document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',dismiss);window.addEventListener('resize',dismiss);
    return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',dismiss);window.removeEventListener('resize',dismiss);};
  },[anchor]);
  return createPortal(<div ref={ref} popover="manual" role="dialog" aria-label={label} className="property-popover" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
    e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose(true);anchor.focus({preventScroll:true});}
    const options=[...ref.current!.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)')];
    if(options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const i=options.indexOf(document.activeElement as HTMLButtonElement);options[i<0?(e.key==='ArrowDown'?0:options.length-1):(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}
  }}>{children}</div>,document.body);
}
function localDate(value:string){if(!validTagDate(value)||value.length===10)return value;const date=new Date(value);return new Date(+date-date.getTimezoneOffset()*60000).toISOString().slice(0,-1);}
function dateDraft(value:unknown){const range=!!value&&typeof value==='object'&&'start' in value&&'end' in value,start=typeof value==='string'?value:range?String(value.start):'',end=range?String(value.end):'';return {start:localDate(start),end:localDate(end),range,time:start.includes('T')};}
function dateValue(draft:ReturnType<typeof dateDraft>):TagValue{
  const encode=(text:string)=>{if(!draft.time)return text.slice(0,10);const date=new Date(text);return Number.isFinite(+date)?date.toISOString():text;};
  return !draft.start?null:draft.range?{start:encode(draft.start),end:encode(draft.end)}:encode(draft.start);
}
function dateSummary(value:unknown){const draft=dateDraft(value),format=(s:string)=>s.replace('T',' ');return draft.start?format(draft.start)+(draft.range?' → '+format(draft.end):''):'';}
export function PropertyInput({field,value,cards,boards=[],disabled,onSave,onOpen}:{field:TagField;value:unknown;cards:CardInfo[];boards?:Board[];disabled?:boolean;onSave:(value:TagValue)=>Promise<unknown>;onOpen?:(key:string)=>void}){
  const [text,setText]=useState(propertyText(value)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[anchor,setAnchor]=useState<HTMLElement|null>(null),[query,setQuery]=useState(''),[date,setDate]=useState(()=>dateDraft(value));
  const cancelled=useRef(false),type=propertyType(field.type),label=field.label||field.key,multiple=multipleChoices(field),blocked=disabled||busy;
  useEffect(()=>{setText(propertyText(value));setError('');},[value]);
  async function save(next:TagValue){setError('');try{validateTagValue(field,next);if(JSON.stringify(next)!==JSON.stringify(value??null)){setBusy(true);await onSave(next);}return true;}catch(error){setError(String(error));return false;}finally{setBusy(false);}}
  async function close(cancel=false){if(busy)return;if(!cancel&&type==='date'&&JSON.stringify(date)!==JSON.stringify(dateDraft(value))&&!await save(dateValue(date)))return;setAnchor(null);setError('');}
  function open(button:HTMLElement){if(anchor){void close();return;}setError('');setQuery('');setDate(dateDraft(value));setAnchor(button);}
  const references=type==='link'&&anchor?[...cards.map(card=>({path:card.path,name:card.title||card.name,key:'card:'+card.id,icon:'note' as const})),...boards.map(board=>({path:board.path,name:board.name,key:'board:'+board.folder,icon:'map' as const}))].filter(r=>(r.name+' '+r.path).toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,40):[];
  const card=type==='link'?cards.find(c=>c.path===value||'card:'+c.id===value):undefined,board=type==='link'?boards.find(b=>b.path===value):undefined;
  const reference=card?{path:card.path,name:card.title||card.name,key:'card:'+card.id}:board?{path:board.path,name:board.name,key:'board:'+board.folder}:undefined,selected=Array.isArray(value)?value:typeof value==='string'?[value]:[],choices=[...new Set([...fieldOptions(field),...selected])].filter(option=>option.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const summary=type==='date'?dateSummary(value):type==='link'?(reference?.name??propertyText(value)):propertyText(value);
  const choose=async(next:TagValue)=>{if(await save(next)&&!multiple)setAnchor(null);};
  return <div className="tag-value" data-property-type={type}>
    {type==='boolean'?<span className="property-checkbox"><input type="checkbox" aria-label={label} checked={value===true} disabled={blocked} onChange={e=>void save(e.target.checked)}/></span>:
    ['date','select','status','link'].includes(type)?<button type="button" className="property-value-button" aria-label={label} aria-haspopup="dialog" aria-expanded={!!anchor} disabled={blocked} onClick={e=>open(e.currentTarget)}>
      {type==='select'||type==='status'?<span className="property-pills">{selected.slice(0,2).map(option=><span className="property-pill" key={option}>{option}</span>)}{selected.length>2&&<span className="muted">+{selected.length-2}</span>}{!selected.length&&<span className="muted">{ui.tags.emptyValue}</span>}</span>:<span className={!summary?'muted':undefined}>{summary||ui.tags.emptyValue}</span>}
    </button>:<input aria-label={label} aria-invalid={!!error} disabled={blocked} placeholder={ui.tags.emptyValue} type={type==='number'?'number':'text'} step={type==='number'?'any':undefined} value={text} onFocus={()=>{cancelled.current=false;}} onChange={e=>setText(e.target.value)} onBlur={()=>{if(!cancelled.current&&text!==propertyText(value))void save(text===''?null:type==='number'?Number(text):text);}} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing)return;if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancelled.current=true;setText(propertyText(value));setError('');e.currentTarget.blur();}}}/>}
    {anchor&&<PropertyPopover anchor={anchor} label={label} onClose={cancel=>void close(cancel)}>
      {type==='date'?<div className="property-date-editor" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void close();}}}>
        <label>{ui.tags.startDate}<input aria-label={ui.tags.dateStart(label)} type={date.time?'datetime-local':'date'} step={date.time?'any':undefined} value={date.start} onChange={e=>setDate({...date,start:e.target.value,end:date.end||e.target.value})}/></label>
        {date.range&&<label>{ui.tags.endDate}<input aria-label={ui.tags.dateEnd(label)} type={date.time?'datetime-local':'date'} step={date.time?'any':undefined} value={date.end} onChange={e=>setDate({...date,end:e.target.value})}/></label>}
        <label className="settings-toggle">{ui.tags.endDate}<input type="checkbox" role="switch" checked={date.range} onChange={e=>setDate({...date,range:e.target.checked,end:date.end||date.start})}/></label>
        <label className="settings-toggle">{ui.tags.includeTime}<input type="checkbox" role="switch" checked={date.time} onChange={e=>{const convert=(v:string)=>v?(e.target.checked?v.includes('T')?v:v+'T00:00':v.slice(0,10)):'';setDate({...date,time:e.target.checked,start:convert(date.start),end:convert(date.end)});}}/></label>
      </div>:<><input className="property-search" aria-label={type==='link'?ui.tags.findReference:ui.tags.findOption} placeholder={type==='link'?ui.tags.findReference:ui.tags.findOption} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role=option]')?.click();}}}/>
        <div className="property-choices" role="listbox" aria-label={label} aria-multiselectable={multiple||undefined}>{type==='link'?<>{!references.length&&<p className="muted">{ui.tags.noReferences}</p>}{references.map(r=><button type="button" key={r.path} role="option" aria-selected={reference?.path===r.path} disabled={blocked} onClick={()=>void choose(r.path)}><Icon name={r.icon}/><span>{r.name}<small>{r.path}</small></span></button>)}</>:(type==='status'?STATUS_GROUPS:['']).map(group=>{const options=type==='status'?choices.filter(option=>group?(field.statusGroups?.[group as typeof STATUS_GROUPS[number]]??[]).includes(option):true):choices;return <div key={group}>{group&&<div className="property-option-group">{ui.tags.statusGroups[group as typeof STATUS_GROUPS[number]]}</div>}{options.map(option=><button type="button" key={option} role="option" aria-selected={selected.includes(option)} disabled={blocked} onClick={()=>void choose(multiple?(selected.includes(option)?selected.filter(v=>v!==option):[...selected,option]):option)}><span className="property-pill">{option}</span>{selected.includes(option)&&<Icon name="check" size={14}/>}</button>)}</div>;})}</div>
      </>}
      <div className="property-popup-actions"><button type="button" disabled={blocked} onClick={()=>{void save(null).then(ok=>{if(ok)setAnchor(null);});}}>{ui.tags.clear}</button>{reference&&onOpen&&<Tool icon="external" label={tooltips.tags.openReference} onClick={()=>{setAnchor(null);onOpen(reference.key);}}/>}{type==='date'&&<button type="button" disabled={blocked} onClick={()=>void close()}>{ui.common.save}</button>}</div>
      {error&&<small role="alert" className="change-removed">{error}</small>}
    </PropertyPopover>}
    {!anchor&&error&&<small className="property-error change-removed" role="alert">{error}</small>}
  </div>;
}
