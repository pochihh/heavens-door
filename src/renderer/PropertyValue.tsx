import {useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {Board,CardInfo,TagField,TagValue} from '../shared';
import {STATUS_GROUPS} from '../shared';
import {fieldOptions,multipleChoices,propertyType,validateTagValue} from '../tags';
import {overlayContainer} from './Overlays';
import {Icon,Tool} from './Icons';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {dateDraft,dateSummary,dateValue} from '../dates';
import {DateDisplayContext,DateProperty} from './DateProperty';

export const propertyText=(value:unknown):string=>value===null||value===undefined?'':Array.isArray(value)?value.join(', '):typeof value==='object'&&'start' in value&&'end' in value?`${value.start} – ${value.end}`:String(value);

export function PropertyPill({field,value}:{field:TagField;value:string}){
  const group=field.type==='status'?STATUS_GROUPS.find(group=>field.statusGroups?.[group].includes(value)):undefined;
  return <span className="property-pill" data-status-group={group}>{value}</span>;
}

// Small editors share the app's menu placement and dismissal behavior without changing the row.
export function PropertyPopover({anchor,label,onClose,children,align='start',className=''}:{anchor:HTMLElement;label:string;align?:'start'|'end';className?:string;onClose:(cancel:boolean)=>void;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{const el=ref.current!;el.showPopover();el.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled),textarea')?.focus({preventScroll:true});},[label]);
  useLayoutEffect(()=>{const el=ref.current!,r=anchor.getBoundingClientRect();el.style.maxHeight=innerHeight-16+'px';const box=el.getBoundingClientRect(),below=innerHeight-r.bottom-12,above=r.top-12,useBelow=box.height<=below||below>=above;el.style.maxHeight=Math.max(40,useBelow?below:above)+'px';const height=el.getBoundingClientRect().height;el.style.left=Math.max(8,Math.min(align==='end'?r.right-box.width:r.left,innerWidth-box.width-8))+'px';el.style.top=Math.max(8,useBelow?r.bottom+4:r.top-height-4)+'px';});
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!anchor.contains(e.target as Node))close.current(false);},dismiss=()=>close.current(false);
    const scroll=(e:Event)=>{if(!(e.target instanceof Node)||!ref.current?.contains(e.target))dismiss();};
    document.addEventListener('scroll',scroll,true);document.addEventListener('pointerdown',outside,true);window.addEventListener('blur',dismiss);window.addEventListener('resize',dismiss);
    return()=>{document.removeEventListener('scroll',scroll,true);document.removeEventListener('pointerdown',outside,true);window.removeEventListener('blur',dismiss);window.removeEventListener('resize',dismiss);};
  },[anchor]);
  return createPortal(<div ref={ref} popover="manual" role="dialog" aria-label={label} className={'property-popover '+className} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
    e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose(true);anchor.focus({preventScroll:true});}
    const options=[...ref.current!.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)')];
    if(options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const i=options.indexOf(document.activeElement as HTMLButtonElement);options[i<0?(e.key==='ArrowDown'?0:options.length-1):(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}
  }}>{children}</div>,overlayContainer(anchor));
}
export function PropertyInput({field,value,cards,boards=[],disabled,onSave,onOpen,autoFocus=false,forceSave=false,onFinish}:{autoFocus?:boolean;forceSave?:boolean;onFinish?:()=>void;field:TagField;value:unknown;cards:CardInfo[];boards?:Board[];disabled?:boolean;onSave:(value:TagValue)=>Promise<unknown>;onOpen?:(key:string)=>void}){
  const {display:preferenceDisplay,onChange:changeDisplay}=useContext(DateDisplayContext);
  const [display,setDisplay]=useState(preferenceDisplay);
  const [text,setText]=useState(propertyText(value)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[anchor,setAnchor]=useState<HTMLElement|null>(null),[query,setQuery]=useState(''),[date,setDate]=useState(()=>dateDraft(value,display));
  const button=useRef<HTMLButtonElement>(null),cancelled=useRef(false),confirmed=useRef(false),type=propertyType(field.type),label=field.label||field.key,multiple=multipleChoices(field),blocked=disabled||busy;
  useEffect(()=>{setText(propertyText(value));setError('');},[value]);
  async function save(next:TagValue){setError('');try{validateTagValue(field,next);if(forceSave||JSON.stringify(next)!==JSON.stringify(value??null)){setBusy(true);await onSave(next);}return true;}catch(error){setError(String(error));return false;}finally{setBusy(false);}}
  async function close(cancel=false){if(busy)return;try{if(!cancel&&type==='date'&&(JSON.stringify(date)!==JSON.stringify(dateDraft(value,display))||forceSave&&confirmed.current)&&!await save(dateValue(date,display,value)))return;setAnchor(null);setError('');onFinish?.();}catch(error){setError(String(error));}}
  function open(button:HTMLElement){if(anchor){void close();return;}setError('');confirmed.current=false;setQuery('');setDisplay(preferenceDisplay);setDate(dateDraft(value,preferenceDisplay));setAnchor(button);}
  const references=type==='link'&&anchor?[...cards.map(card=>({path:card.path,name:card.title||card.name,key:'card:'+card.id,icon:'note' as const})),...boards.map(board=>({path:board.path,name:board.name,key:'board:'+board.folder,icon:'map' as const}))].filter(r=>(r.name+' '+r.path).toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,40):[];
  const card=type==='link'?cards.find(c=>c.path===value||'card:'+c.id===value):undefined,board=type==='link'?boards.find(b=>b.path===value):undefined;
  const reference=card?{path:card.path,name:card.title||card.name,key:'card:'+card.id}:board?{path:board.path,name:board.name,key:'board:'+board.folder}:undefined,selected=Array.isArray(value)?value:typeof value==='string'?[value]:[],choices=[...new Set([...fieldOptions(field),...selected])].filter(option=>option.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const summary=type==='date'?dateSummary(value,preferenceDisplay):type==='link'?(reference?.name??propertyText(value)):propertyText(value);
  const choose=async(next:TagValue)=>{if(await save(next)&&!multiple){setAnchor(null);onFinish?.();}};
  useEffect(()=>{if(autoFocus&&button.current)open(button.current);},[autoFocus]);
  return <div className="tag-value" data-property-type={type}>
    {type==='boolean'?<span className="property-checkbox"><input type="checkbox" aria-label={label} checked={value===true} disabled={blocked} autoFocus={autoFocus} onChange={e=>void save(e.target.checked).then(ok=>{if(ok)onFinish?.();})} onBlur={()=>{if(!busy)onFinish?.();}}/></span>:
    ['date','select','status','link'].includes(type)?<button type="button" ref={button} className="property-value-button" aria-label={label} aria-haspopup="dialog" aria-expanded={!!anchor} disabled={blocked} onClick={e=>open(e.currentTarget)}>
      {type==='select'||type==='status'?<span className="property-pills">{selected.slice(0,2).map(option=><PropertyPill field={field} value={option} key={option}/>)}{selected.length>2&&<span className="muted">+{selected.length-2}</span>}{!selected.length&&<span className="muted">{ui.tags.emptyValue}</span>}</span>:<span className={!summary?'muted':undefined}>{summary||ui.tags.emptyValue}</span>}
    </button>:<input autoFocus={autoFocus} aria-label={label} aria-invalid={!!error} disabled={blocked} placeholder={ui.tags.emptyValue} type={type==='number'?'number':'text'} step={type==='number'?'any':undefined} value={text} onFocus={()=>{cancelled.current=false;}} onChange={e=>setText(e.target.value)} onBlur={()=>{if(!cancelled.current&&(forceSave&&confirmed.current||text!==propertyText(value)))void save(text===''?null:type==='number'?Number(text):text).then(ok=>{if(ok)onFinish?.();});else onFinish?.();}} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){confirmed.current=true;e.currentTarget.blur();}if(e.key==='Escape'){cancelled.current=true;setText(propertyText(value));setError('');e.currentTarget.blur();}}}/>}
    {anchor&&<PropertyPopover anchor={anchor} label={label} onClose={cancel=>void close(cancel)}>
      {type==='date'?<DateProperty draft={date} display={display} onDisplayChange={next=>{try{const valueNext=dateValue(date,display,value);setDate({...dateDraft(valueNext,next),time:date.time,range:date.range});setDisplay(next);setError('');void changeDisplay(next).catch(error=>setError(String(error)));}catch(error){setError(String(error));}}} onChange={next=>{confirmed.current=true;setDate(next);}} onCommit={()=>void close()}/>:<><input className="property-search" aria-label={type==='link'?ui.tags.findReference:ui.tags.findOption} placeholder={type==='link'?ui.tags.findReference:ui.tags.findOption} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role=option]')?.click();}}}/>
        <div className="property-choices" role="listbox" aria-label={label} aria-multiselectable={multiple||undefined}>{type==='link'?<>{!references.length&&<p className="muted">{ui.tags.noReferences}</p>}{references.map(r=><button type="button" key={r.path} role="option" aria-selected={reference?.path===r.path} disabled={blocked} onClick={()=>void choose(r.path)}><Icon name={r.icon}/><span>{r.name}<small>{r.path}</small></span></button>)}</>:(type==='status'?STATUS_GROUPS:['']).map(group=>{const options=type==='status'?choices.filter(option=>group?(field.statusGroups?.[group as typeof STATUS_GROUPS[number]]??[]).includes(option):true):choices;return <div key={group}>{group&&<div className="property-option-group">{ui.tags.statusGroups[group as typeof STATUS_GROUPS[number]]}</div>}{options.map(option=><button type="button" key={option} role="option" aria-selected={selected.includes(option)} disabled={blocked} onClick={()=>void choose(multiple?(selected.includes(option)?selected.filter(v=>v!==option):[...selected,option]):option)}><PropertyPill field={field} value={option}/>{selected.includes(option)&&<Icon name="check" size={14}/>}</button>)}</div>;})}</div>
      </>}
      <div className="property-popup-actions"><button type="button" className="danger" disabled={blocked} onClick={()=>{void save(null).then(ok=>{if(ok){setAnchor(null);onFinish?.();}});}}>{type==='date'?ui.tags.clearDate:ui.tags.clear}</button>{reference&&onOpen&&<Tool icon="external" label={tooltips.tags.openReference} onClick={()=>{setAnchor(null);onFinish?.();onOpen(reference.key);}}/>}</div>
      {error&&<small role="alert" className="change-removed">{error}</small>}
    </PropertyPopover>}
    {!anchor&&error&&<small className="property-error change-removed" role="alert">{error}</small>}
  </div>;
}
