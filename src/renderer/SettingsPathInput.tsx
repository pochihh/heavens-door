import {useEffect,useMemo,useRef,useState} from 'react';
import {TextSearch} from '../core/search';
import {PropertyPopover} from './PropertyValue';
import {MenuCheck,Icon} from './Icons';
import {ui} from '../text/ui';
export function SettingsPathInput({label,value,choices,onChange,onCreate,empty=false,displayValue}:{displayValue?:string;label:string;value:string;choices:{path:string;name:string}[];onChange:(path:string)=>void;onCreate?:(path:string)=>Promise<void>;empty?:boolean}){
 const [draft,setDraft]=useState(value),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),anchor=useRef<HTMLInputElement>(null),options=useRef<HTMLDivElement>(null);
 useEffect(()=>setDraft(value),[value]);
 const index=useMemo(()=>{const index=new TextSearch();for(const c of choices)index.update({path:c.path,name:c.name,title:c.name,body:c.path});return index;},[choices]);
 const path=draft.trim(),hits=path&&draft!==value?index.search(path).map(h=>h.path):choices.map(c=>c.path),shown=hits.slice(0,60).map(path=>choices.find(c=>c.path===path)!),exists=choices.some(c=>c.path===path);
 function save(path= draft.trim()){if((path||empty)&&path!==value)onChange(path);else if(!path&&!empty)setDraft(value);}
 function choose(path:string){setDraft(path);save(path);anchor.current?.focus();setOpen(false);}
 async function create(){setBusy(true);try{await onCreate!(path);choose(path);setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
 return <div className="settings-path-input"><input ref={anchor} aria-label={label} aria-expanded={open} aria-haspopup="listbox" value={draft===value&&displayValue!==undefined?displayValue:draft} placeholder={empty?ui.journal.none:label} onFocus={()=>setOpen(true)} onChange={e=>{setDraft(e.target.value);setOpen(true);}} onBlur={e=>{if(!options.current?.contains(e.relatedTarget)){save();setOpen(false);}}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();save();setOpen(false);}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDraft(value);setOpen(false);}if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);options.current?.querySelector<HTMLButtonElement>('button')?.focus();}}}/>
 {open&&anchor.current&&<PropertyPopover autoFocus={false} anchor={anchor.current} label={label} className="settings-path-options" onClose={cancel=>{if(cancel)setDraft(value);else save();setOpen(false);}}><div ref={options} role="listbox" aria-label={label} onMouseDown={e=>e.preventDefault()}>
 {empty&&<button role="option" aria-selected={!value} onClick={()=>choose('')}>{ui.journal.none}</button>}
 {shown.map(c=><button key={c.path} role="option" aria-selected={c.path===value} onClick={()=>choose(c.path)}><MenuCheck checked={c.path===value}/><span>{c.name}{c.path!==c.name&&<small>{c.path}</small>}</span></button>)}
 {!exists&&path&&<><button role="option" aria-selected={false} onClick={()=>choose(path)}>{ui.system.usePath(path)}</button>{onCreate&&<button role="option" aria-selected={false} disabled={busy} onClick={()=>void create()}><Icon name="plus" size={14}/>{ui.system.createFolder(path)}</button>}</>}
 {error&&<p role="alert">{error}</p>}
 </div></PropertyPopover>}
 </div>;
}
