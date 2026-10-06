import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {TextSearch} from '../core/search';
import {DEFAULT_TEMPLATES} from '../journal';
import {DEFAULT_CARD_FOLDER} from '../shared';
import type {Snapshot} from '../shared';
import type {Session} from './session';
import {Icon,Tool} from './Icons';
import {ui} from '../text/ui';
import {isSystemGuide} from '../system-guides';
import {templateDefaults,type TemplateInput,type TemplateValues} from '../templates';
import {DateProperty} from './DateProperty';
import {PropertyPopover} from './PropertyValue';
import {dateDraft,dateSummary,DEFAULT_DATE_DISPLAY,parseDay} from '../dates';
import {SettingsPathInput} from './SettingsPathInput';
const text=ui.journal;
export function TemplateDialog({snapshot,session,onOpen,onClose,initialTemplate}:{initialTemplate?:string;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),[query,setQuery]=useState(''),[chosen,setChosen]=useState(initialTemplate??''),[stem,setStem]=useState(''),[folder,setFolder]=useState(snapshot.preferences?.cardFolder??DEFAULT_CARD_FOLDER),[busy,setBusy]=useState(false),[error,setError]=useState(''),[inputs,setInputs]=useState<TemplateInput[]>([]),[values,setValues]=useState<TemplateValues>({}),[planning,setPlanning]=useState(false),[planError,setPlanError]=useState(''),root=(snapshot.preferences?.templates??DEFAULT_TEMPLATES).folder;
  const templates=useMemo(()=>snapshot.cards.filter(c=>c.path.startsWith(root+'/')&&!isSystemGuide(c.path,snapshot.preferences)),[snapshot.cards,root]),index=useMemo(()=>{const engine=new TextSearch();templates.forEach(c=>engine.update({...c,body:''}));return engine;},[templates]);
  const shown=query?index.search(query).map(hit=>templates.find(c=>c.path===hit.path)!):templates;
  useLayoutEffect(()=>{const previous=document.activeElement;ref.current?.showModal();return()=>{ref.current?.close();if(previous instanceof HTMLElement)previous.focus();};},[]);
  useEffect(()=>{if(!shown.some(card=>card.path===chosen))setChosen(shown[0]?.path??'');},[shown,chosen]);
  useEffect(()=>{let live=true;setInputs([]);setValues({});setPlanError('');if(!chosen){setPlanning(false);return;}setPlanning(true);void session.templatePlan(chosen).then(plan=>{if(live){setInputs(plan.inputs);setValues(templateDefaults(plan.inputs));}},e=>{if(live)setPlanError(String(e));}).finally(()=>{if(live)setPlanning(false);});return()=>{live=false;};},[chosen,session]);
  const perform=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setBusy(false);}};
  return <dialog ref={ref} className="template-dialog" aria-label={text.newFromTemplate} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div className="panel-title"><strong>{text.newFromTemplate}</strong><Tool icon="close" label={text.close} disabled={busy} onClick={onClose}/></div>
    <form onSubmit={e=>{e.preventDefault();void perform(async()=>{const card=await session.createFromTemplate(chosen,folder,stem,values);onOpen('card:'+card.id);onClose();});}}>
      <input aria-label={text.searchTemplates} placeholder={text.searchTemplates} autoFocus value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="template-list" role="listbox" aria-label={text.templates} onKeyDown={e=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||!shown.length)return;e.preventDefault();const index=shown.findIndex(c=>c.path===chosen),next=(index+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;setChosen(shown[next].path);e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();}}>{shown.map(card=><button type="button" role="option" aria-selected={chosen===card.path} key={card.id} onClick={()=>setChosen(card.path)}><Icon name="note"/><span>{card.name}</span><small>{card.path}</small></button>)}{!shown.length&&<p className="muted">{templates.length?text.noMatches:text.noTemplates}</p>}</div>
      <div className="template-actions"><button type="button" disabled={busy} onClick={()=>void perform(async()=>{const card=await session.createTemplate();onOpen('card:'+card.id);onClose();})}><Icon name="plus"/>{text.newTemplate}</button><button type="button" disabled={!chosen||busy} onClick={()=>{const card=templates.find(c=>c.path===chosen);if(card){onOpen('card:'+card.id);onClose();}}}>{text.editTemplate}</button></div>
      <label>{text.filename}<input required value={stem} placeholder={snapshot.preferences?.stem} onChange={e=>setStem(e.target.value)}/></label>
      <label>{text.folder}<input required list="template-folders" value={folder} onChange={e=>setFolder(e.target.value)}/></label><datalist id="template-folders">{snapshot.folders?.filter(Boolean).map(path=><option key={path} value={path}/>)}</datalist>
      <TemplateInputFields inputs={inputs} values={values} onChange={setValues} snapshot={snapshot}/>
      {(error||planError)&&<p role="alert">{error||planError}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{text.cancel}</button><button className="primary" disabled={busy||planning||!!planError||!chosen||!stem.trim()}>{text.create}</button></div>
    </form>
  </dialog>;
}

export function TemplateInputFields({inputs,values,onChange,snapshot}:{inputs:TemplateInput[];values:TemplateValues;onChange:(values:TemplateValues)=>void;snapshot:Snapshot}){
  return <div className="template-inputs">{inputs.map(field=>{
    const value=values[field.name]??'',change=(value:string|number|boolean)=>onChange({...values,[field.name]:value});
    const choices=field.type==='note'?snapshot.cards.filter(c=>!isSystemGuide(c.path,snapshot.preferences)).map(c=>({path:'card:'+c.id,name:c.title||c.name})):field.type==='tag'?(snapshot.tags??[]).map(t=>({path:t.tag,name:'#'+t.tag})):[];
    return field.type==='note'||field.type==='tag'?<div key={field.name} className="template-input-row"><span>{field.label}</span><SettingsPathInput label={field.label} value={String(value)} displayValue={field.type==='note'?snapshot.cards.find(c=>'card:'+c.id===value)?.title||snapshot.cards.find(c=>'card:'+c.id===value)?.name:undefined} choices={choices} empty={!field.required} onChange={change}/></div>:field.type==='date'?<div key={field.name} className="template-input-row"><span>{field.label}</span><TemplateDateInput field={field} value={String(value)} onChange={change} snapshot={snapshot}/></div>:<label key={field.name}><span>{field.label}</span>{field.type==='choice'?<select aria-label={field.label} required={field.required} value={String(value)} onChange={e=>change(e.target.value)}><option value="">{text.choose}</option>{field.options!.map(option=><option key={option}>{option}</option>)}</select>:field.type==='checkbox'?<input aria-label={field.label} type="checkbox" checked={value===true} onChange={e=>change(e.target.checked)}/>:<input aria-label={field.label} type={field.type==='number'?'number':'text'} step={field.type==='number'?'any':undefined} required={field.required} value={String(value)} onChange={e=>change(field.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value)}/>}</label>;
  })}</div>;
}
export function TemplateInputDialog({inputs,snapshot,title,onSubmit,onClose}:{inputs:TemplateInput[];snapshot:Snapshot;title:string;onSubmit:(values:TemplateValues)=>Promise<void>;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),[values,setValues]=useState(()=>templateDefaults(inputs)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useLayoutEffect(()=>{const previous=document.activeElement;ref.current?.showModal();return()=>{ref.current?.close();if(previous instanceof HTMLElement)previous.focus();};},[]);
  return <dialog ref={ref} className="template-dialog" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div className="panel-title"><strong>{title}</strong><Tool icon="close" label={text.close} disabled={busy} onClick={onClose}/></div><form onSubmit={e=>{e.preventDefault();setBusy(true);void onSubmit(values).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}>
    <TemplateInputFields inputs={inputs} values={values} onChange={setValues} snapshot={snapshot}/>{error&&<p role="alert">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{text.cancel}</button><button className="primary" disabled={busy}>{text.create}</button></div>
  </form></dialog>;
}

function TemplateDateInput({field,value,onChange,snapshot}:{field:TemplateInput;value:string;onChange:(value:string)=>void;snapshot:Snapshot}){
  const preference=snapshot.preferences?.dateDisplay??DEFAULT_DATE_DISPLAY,[display,setDisplay]=useState(preference),[draft,setDraft]=useState(()=>dateDraft(value,preference)),[anchor,setAnchor]=useState<HTMLElement|null>(null),[error,setError]=useState('');
  function close(cancel:boolean){if(cancel){setAnchor(null);setError('');return;}const day=parseDay(draft.start.day,display.format);if(!day&&draft.start.day){setError(ui.tags.invalidDate);return;}onChange(day||'');setAnchor(null);setError('');}
  return <div className="template-date-input"><button type="button" aria-label={field.label} aria-haspopup="dialog" aria-expanded={!!anchor} onClick={e=>{setDisplay(preference);setDraft(dateDraft(value,preference));setAnchor(e.currentTarget);}}>{dateSummary(value,preference)||text.chooseDate}</button>{anchor&&<PropertyPopover anchor={anchor} label={field.label} onClose={close}>
    <DateProperty dateOnly draft={draft} display={display} onDisplayChange={next=>{const day=parseDay(draft.start.day,display.format);setDisplay(next);setDraft(dateDraft(day||'',next));}} onChange={setDraft} onCommit={()=>close(false)}/>{error&&<p role="alert">{error}</p>}<div className="property-popup-actions"><button type="button" className="danger" onClick={()=>{onChange('');setAnchor(null);}}>{text.clear}</button><button type="button" onClick={()=>close(false)}>{text.done}</button></div>
  </PropertyPopover>}</div>;
}
