import {useEffect,useMemo,useRef,useState,useId,type PointerEvent as ReactPointerEvent} from 'react';
import type {CardInfo,CardProperties,Snapshot,TagField,TagInfo,TagResult,TagValue} from '../shared';
import {TAG_FIELD_TYPES,STATUS_GROUPS} from '../shared';
import {resolveTag,validateTagValue,fieldOptions,validTagDate} from '../tags';
import type {Session} from './session';
import type {ViewMemory} from '../layout';
import {Icon,Tool} from './Icons';
import {ActionMenu,type MenuState} from './Overlays';
import {useConfirmation} from './Confirmation';
import {createDragPhantom,useBookmarkDrag} from './sortable';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
const display=(value:unknown)=>value===null||value===undefined?'':Array.isArray(value)?value.join(', '):typeof value==='object'&&'start' in value&&'end' in value?`${value.start} – ${value.end}`:String(value);

function dateInput(value:string){if(!validTagDate(value)||value.length===10)return value;const date=new Date(value);return new Date(+date-date.getTimezoneOffset()*60000).toISOString().slice(0,-1);}
function DateProperty({value,label,disabled,onSave}:{value:unknown;label:string;disabled?:boolean;onSave:(value:TagValue)=>Promise<unknown>}){
  const read=()=>{const range=!!value&&typeof value==='object'&&'start' in value&&'end' in value,start=typeof value==='string'?value:range?String(value.start):'',end=range?String(value.end):'';return {start:dateInput(start),end:dateInput(end),range,time:start.includes('T')};};
  const [draft,setDraft]=useState(read);
  useEffect(()=>setDraft(read()),[value]); // External revisions replace only the persisted value.
  function commit(next:typeof draft){
    setDraft(next);if(JSON.stringify(next)===JSON.stringify(read()))return;const encode=(text:string)=>{if(!next.time)return text.slice(0,10);const date=new Date(text);return Number.isFinite(+date)?date.toISOString():text;};
    const result=!next.start?null:next.range?{start:encode(next.start),end:encode(next.end)}:encode(next.start);
    if(JSON.stringify(result)!==JSON.stringify(value??null))void onSave(result);
  }
  const control=(end:boolean)=><input aria-label={end?ui.tags.dateEnd(label):ui.tags.dateStart(label)} disabled={disabled} type={draft.time?'datetime-local':'date'} step={draft.time?'any':undefined} value={end?draft.end:draft.start} onChange={e=>setDraft({...draft,[end?'end':'start']:e.target.value})} onBlur={()=>commit(draft)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(read());e.stopPropagation();}}}/>;
  return <div className="tag-date"><div className="tag-date-inputs">{control(false)}{draft.range&&<><span aria-hidden="true">–</span>{control(true)}</>}</div><div className="tag-date-options">
    <label className="settings-toggle" data-tooltip={tooltips.tags.dateRange}>{ui.tags.endDate}<input type="checkbox" role="switch" disabled={disabled} checked={draft.range} onChange={e=>commit({...draft,range:e.target.checked,end:draft.end||draft.start})}/></label>
    <label className="settings-toggle" data-tooltip={tooltips.tags.dateTime}>{ui.tags.includeTime}<input type="checkbox" role="switch" disabled={disabled} checked={draft.time} onChange={e=>{const convert=(date:string)=>date?(e.target.checked?date.includes('T')?date:date+'T00:00':date.slice(0,10)):'';commit({...draft,time:e.target.checked,start:convert(draft.start),end:convert(draft.end)});}}/></label>
  </div></div>;
}

export function PropertyInput({field,value,cards,disabled,onSave}:{field:TagField;value:unknown;cards:CardInfo[];disabled?:boolean;onSave:(value:TagValue)=>Promise<unknown>}) {
  const [text,setText]=useState(display(value)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{setText(display(value));setError('');},[value]);
  const label=field.label||field.key,id=useId();
  const [focused,setFocused]=useState(false);
  async function save(next:TagValue){setError('');try{validateTagValue(field,next);setBusy(true);await onSave(next);}catch(error){setError(String(error));}finally{setBusy(false);}}
  const blocked=disabled||busy;
  return <div className="tag-value">{field.type==='date'?<DateProperty value={value} label={label} disabled={blocked} onSave={save}/>:field.type==='boolean'?<span className="settings-toggle"><input type="checkbox" role="switch" aria-label={label} checked={value===true} disabled={blocked} onChange={e=>void save(e.target.checked)}/></span>:
    field.type==='select'||field.type==='status'?<select aria-label={label} value={typeof value==='string'?value:''} disabled={blocked} onChange={e=>void save(e.target.value||null)}><option value="">{ui.tags.clear}</option>
      {value&&!fieldOptions(field).includes(String(value))?<option value={String(value)}>{String(value)}</option>:null}
      {field.type==='status'?STATUS_GROUPS.map(group=><optgroup key={group} label={ui.tags.statusGroups[group]}>{field.statusGroups?.[group].map(o=><option key={o}>{o}</option>)}</optgroup>):field.options?.map(o=><option key={o}>{o}</option>)}
    </select>:field.type==='multi-select'?<div className="tag-multi" role="group" aria-label={label}>{field.options?.map(o=><button type="button" key={o} disabled={blocked} aria-pressed={Array.isArray(value)&&value.includes(o)} onClick={()=>void save(Array.isArray(value)&&value.includes(o)?value.filter(v=>v!==o):[...(Array.isArray(value)?value:[]),o])}>{o}</button>)}</div>:
    <><input aria-label={label} disabled={blocked} list={field.type==='link'?id:undefined} onFocus={()=>setFocused(true)} type={field.type==='number'?'number':field.type==='email'?'email':field.type==='url'?'url':field.type==='phone'?'tel':'text'} step={field.type==='number'?'any':undefined} value={text} onChange={e=>setText(e.target.value)} onBlur={()=>{setFocused(false);if(text!==display(value))void save(text===''?null:field.type==='number'?Number(text):text);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setText(display(value));e.stopPropagation();}}}/>{field.type==='link'&&focused&&<datalist id={id}>{cards.filter(c=>[c.name,c.path,'card:'+c.id].some(v=>v.toLowerCase().includes(text.toLowerCase()))).slice(0,40).map(c=><option key={c.id} value={'card:'+c.id}>{c.name}</option>)}</datalist>}</>}
    {error&&<small role="alert" className="change-removed">{error}</small>}
  </div>;
}
export function NewTag({session,onCreated}:{session:Session;onCreated:(path:string)=>void}) {
  const [name,setName]=useState(''),[busy,setBusy]=useState(false);
  return <form className="new-tag" onSubmit={e=>{e.preventDefault();if(busy||!name.trim())return;setBusy(true);void session.createTag(name.trim()).then(tag=>{setName('');onCreated(tag.path);}).catch(()=>undefined).finally(()=>setBusy(false));}}>
    <input aria-label={ui.tags.name} placeholder={ui.tags.newTag} value={name} onChange={e=>setName(e.target.value)}/><Tool icon="plus" label={tooltips.tags.newTag} disabled={busy||!name.trim()} type="submit"/>
  </form>;
}
function TagProperties({card,tag,snapshot,session,properties}:{card:CardInfo;tag:string;snapshot:Snapshot;session:Session;properties:CardProperties}){
  const list=useRef<HTMLDivElement>(null),resolved=resolveTag(snapshot.tags??[],tag),order=Object.keys(properties.properties);
  const fields=[...resolved.fields].sort((a,b)=>(order.includes(a.propertyKey)?order.indexOf(a.propertyKey):Infinity)-(order.includes(b.propertyKey)?order.indexOf(b.propertyKey):Infinity));
  const busy=properties.revision!==card.revision||!!resolved.warnings.length;
  const reorder=(key:string,index:number|null)=>{if(index===null||busy)return;const keys=fields.map(f=>f.propertyKey),from=keys.indexOf(key);if(from===index)return;keys.splice(from,1);keys.splice(index,0,key);void session.reorderTagProperties(card.path,properties.revision,tag,keys).catch(()=>undefined);};
  const drag=useBookmarkDrag(list,(key,index)=>reorder(key,index),'vertical',true);
  return <>{resolved.warnings.map(w=><p role="alert" key={w}>{w}</p>)}<div ref={list} className="tag-properties">
    {fields.map((field,i)=><div className="tag-property-row" data-file-key={field.propertyKey} key={field.propertyKey}>
      <button type="button" className="property-label" disabled={busy} data-tooltip={tooltips.tags.reorder} onPointerDown={e=>drag(e,field.propertyKey,true)} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();reorder(field.propertyKey,Math.max(0,Math.min(fields.length-1,i+(e.key==='ArrowUp'?-1:1))));}}}><span className="property-icon"><Icon name={field.type==='boolean'?'check':field.type==='date'?'calendar':field.type==='link'||field.type==='url'?'link':field.type==='select'||field.type==='status'||field.type==='multi-select'?'list':'format'} size={14}/><Icon name="grip" size={14}/></span><span>{field.label||field.key}</span></button>
      <PropertyInput field={field} value={properties.properties[field.propertyKey]} disabled={busy} cards={snapshot.cards} onSave={value=>session.setTagProperty(card.path,properties.revision,tag,field.propertyKey,value)}/>
    </div>)}{!fields.length&&<p className="muted">{ui.tags.emptyFields}</p>}
  </div></>;
}
export function CardTags({card,snapshot,session,onOpen,allowAdd=true}:{card:CardInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;allowAdd?:boolean}) {
  const expanded=session.tagExpansion.get(card.id)??[],active=expanded.join('\n');
  const [properties,setProperties]=useState<CardProperties>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState<MenuState|null>(null),confirm=useConfirmation();
  useEffect(()=>{let live=true;if(!active)return;void session.bridge.request<CardProperties>({kind:'cardProperties',path:card.path}).then(p=>{if(live){setProperties(p);setError('');}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[active,card.path,card.revision,session]);
  async function attach(tag:string){setBusy(true);try{await session.setCardTag(card.path,card.revision,tag,true);session.tagExpansion.set(card.id,[...expanded,tag]);session.update({});}catch{/* Session presents write errors. */}finally{setBusy(false);}}
  function actions(tag:string,anchor:HTMLElement){const rect=anchor.getBoundingClientRect();setMenu({anchor,x:rect.left,y:rect.bottom,label:tag,actions:[{label:ui.tags.definition,icon:'external',run:()=>{const definition=snapshot.tags?.find(t=>t.tag===tag);if(definition)onOpen('tag:'+definition.path);}},{label:ui.tags.remove,icon:'close',danger:true,run:()=>{void confirm({title:ui.tags.remove,message:ui.tags.removeMessage(tag),accept:ui.tags.remove,danger:true}).then(ok=>{if(ok)void session.setCardTag(card.path,card.revision,tag,false).catch(()=>undefined);});}}]});}
  return <div className="card-tags" onDoubleClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onContextMenu={e=>e.stopPropagation()}>
    <div className="tag-chips">{card.tags?.map(tag=><button key={tag} className="tag-chip" aria-expanded={expanded.includes(tag)} data-tooltip={tooltips.tags.properties} onContextMenu={e=>{e.preventDefault();actions(tag,e.currentTarget);}} onClick={()=>{session.tagExpansion.set(card.id,expanded.includes(tag)?expanded.filter(t=>t!==tag):[...expanded,tag]);session.update({});}}><Icon name="tag" size={12}/>{tag}<Icon name={expanded.includes(tag)?'chevronUp':'down'} size={12}/></button>)}
      {allowAdd&&<select className="tag-add" aria-label={ui.tags.add} data-tooltip={tooltips.tags.add} disabled={busy} value="" onChange={e=>void attach(e.target.value)}><option value="" disabled>{ui.tags.add}</option>{snapshot.tags?.filter(t=>!card.tags?.includes(t.tag)).map(t=><option key={t.path} value={t.tag}>{t.tag}</option>)}</select>}
    </div>
    {card.tags?.filter(tag=>expanded.includes(tag)).map(tag=><section className="tag-fields" key={tag}><div className="tag-fields-heading"><span>{tag}</span><Tool icon="more" label={tooltips.tags.actions} onClick={e=>actions(tag,e.currentTarget)}/></div>{error?<p role="alert">{error}</p>:!properties?<p>{ui.common.loading}</p>:<TagProperties card={card} tag={tag} snapshot={snapshot} session={session} properties={properties}/>}</section>)}
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </div>;
}

function Options({value,onChange,label}:{value:string[];onChange:(options:string[])=>void;label?:string}) {
  const [text,setText]=useState(value.join('\n'));
  return <textarea aria-label={label} value={text} onChange={e=>setText(e.target.value)} onBlur={()=>onChange(text.split('\n').map(t=>t.trim()).filter(Boolean))}/>;
}
function Definition({tag,snapshot,session}:{tag:TagInfo;snapshot:Snapshot;session:Session}) {
  const [fields,setFields]=useState(()=>structuredClone(tag.fields)),[inherits,setInherits]=useState(tag.inherits.join(', ')),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expected,setExpected]=useState(tag.revision);
  const update=(i:number,patch:Partial<TagField>)=>setFields(items=>items.map((f,j)=>j===i?{...f,...patch}:f));
  return <form className="tag-definition" onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void session.saveTag(tag.path,expected,fields,inherits.split(',').map(t=>t.trim()).filter(Boolean)).then(()=>setExpected(session.state.snapshot!.tags!.find(t=>t.path===tag.path)!.revision)).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}>
    <label>{ui.tags.inherits}<input value={inherits} onChange={e=>setInherits(e.target.value)} data-tooltip={tooltips.tags.inherit}/></label>
    {fields.map((field,i)=><fieldset key={i}><div className="tag-field-heading"><input aria-label={ui.tags.fieldKey} placeholder={ui.tags.fieldKey} value={field.key} disabled={tag.fields.some(f=>f.key===field.key)} onChange={e=>update(i,{key:e.target.value})}/><select aria-label={ui.tags.fieldType} value={field.type} onChange={e=>update(i,{type:e.target.value as TagField['type'],default:null,...(e.target.value==='status'?{statusGroups:field.statusGroups??{todo:[ui.tags.statusGroups.todo],inProgress:[ui.tags.statusGroups.inProgress],done:[ui.tags.statusGroups.done]}}:{})})}>{TAG_FIELD_TYPES.map(type=><option key={type} value={type}>{ui.tags.types[type]}</option>)}</select><Tool icon="close" label={tooltips.tags.removeField} onClick={()=>setFields(list=>list.filter((_,j)=>j!==i))}/></div>
      <label>{ui.tags.fieldLabel}<input value={field.label??''} onChange={e=>update(i,{label:e.target.value})}/></label>
      {(field.type==='select'||field.type==='multi-select')&&<label>{ui.tags.fieldOptions}<Options key={field.key} value={field.options??[]} onChange={options=>update(i,{options})}/></label>}
      {field.type==='status'&&STATUS_GROUPS.map(group=><label key={group} data-tooltip={tooltips.tags.statusGroups}>{ui.tags.statusGroups[group]}<Options label={ui.tags.statusGroups[group]} value={field.statusGroups?.[group]??[]} onChange={options=>update(i,{statusGroups:{...field.statusGroups!,[group]:options}})}/></label>)}
      <div className="tag-default"><span>{ui.tags.fieldDefault}</span><PropertyInput field={field} value={field.default} cards={snapshot.cards} onSave={async value=>update(i,{default:value})}/></div>
    </fieldset>)}
    <div className="dialog-actions"><button type="button" data-tooltip={tooltips.tags.definition} onClick={()=>setFields(list=>[...list,{key:'',type:'text'}])}><Icon name="plus"/>{ui.tags.addField}</button><button type="submit" className="primary" disabled={busy} data-tooltip={tooltips.tags.save}>{ui.tags.save}</button></div>{error&&<p role="alert">{error}</p>}
  </form>;
}
export function TagView({tag,snapshot,session,onOpen,memory,onViewChange}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;memory:ViewMemory;onViewChange:()=>void}) {
  const [rows,setRows]=useState<TagResult[]>([]),[view,setView]=useState<'table'|'list'|'kanban'>(memory.tagView??'table'),[group,setGroup]=useState(memory.tagGroup??''),[text,setText]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[menu,setMenu]=useState<MenuState|null>(null);
  const generation=useRef(0),cancel=useRef<()=>void>(()=>{});
  const resolved=useMemo(()=>resolveTag(snapshot.tags??[],tag.tag),[snapshot.tags,tag.tag]);
  const choices=resolved.fields.filter(f=>f.type==='select'||f.type==='status'),groupField=choices.find(f=>f.propertyKey===group)??choices[0];
  useEffect(()=>{const version=++generation.current;setBusy(true);const timer=setTimeout(()=>{void session.bridge.request<TagResult[]>({kind:'tagCards',tag:tag.tag,text}).then(result=>{if(generation.current===version){setRows(result);setMore(result.length===200);}}).catch(error=>session.update({error:String(error)})).finally(()=>{if(generation.current===version)setBusy(false);});},100);return()=>{clearTimeout(timer);generation.current++;};},[tag.tag,tag.revision,snapshot.cards,session,text]);
  useEffect(()=>()=>cancel.current(),[]);
  async function loadMore(){const version=generation.current;setBusy(true);try{const result=await session.bridge.request<TagResult[]>({kind:'tagCards',tag:tag.tag,text,offset:rows.length});if(version===generation.current){setRows(previous=>[...previous,...result]);setMore(result.length===200);}}catch(error){session.update({error:String(error)});}finally{if(version===generation.current)setBusy(false);}}
  const move=(row:TagResult,value:string)=>{if(groupField)void session.setTagProperty(row.card.path,row.card.revision,tag.tag,groupField.propertyKey,value||null).catch(()=>undefined);};
  const columns=groupField?[...(rows.some(row=>!display(row.properties[groupField.propertyKey]))?['']:[]),...new Set([...(fieldOptions(groupField)),...rows.map(row=>display(row.properties[groupField.propertyKey])).filter(Boolean)])]:[];
  function drag(e:ReactPointerEvent<HTMLDivElement>,row:TagResult){
    if(busy||resolved.warnings.length||e.button!==0||(e.target as HTMLElement).closest('button.tool'))return;cancel.current();
    const source=e.currentTarget,rect=source.getBoundingClientRect(),start={x:e.clientX,y:e.clientY},pointer=e.pointerId;let phantom:HTMLElement|null=null,target:HTMLElement|null=null;
    const finish=(save:boolean)=>{const dragged=!!phantom,value=target?.dataset.tagColumn;target?.classList.remove('kanban-drop');phantom?.remove();source.style.removeProperty('opacity');document.body.classList.remove('list-dragging');document.removeEventListener('pointermove',motion);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);cancel.current=()=>{};if(dragged){const suppress=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}if(save&&value!==undefined&&value!==display(row.properties[groupField!.propertyKey]))move(row,value);};
    const motion=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;if(!phantom&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<5)return;event.preventDefault();if(!phantom){phantom=createDragPhantom(source,rect);source.style.opacity='.35';document.body.classList.add('list-dragging');}phantom.style.left=rect.left+event.clientX-start.x+'px';phantom.style.top=rect.top+event.clientY-start.y+'px';target?.classList.remove('kanban-drop');target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-tag-column]')??null;if(target&&(!source.closest('.kanban')?.contains(target)||target.dataset.tagColumn!==''&&!(groupField?fieldOptions(groupField):[]).includes(target.dataset.tagColumn!)))target=null;target?.classList.add('kanban-drop');};
    const up=(event:PointerEvent)=>{if(event.pointerId===pointer)finish(true);},abort=()=>finish(false),key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abort();}};
    cancel.current=abort;document.addEventListener('pointermove',motion,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  }
  return <section className="tag-view"><div className="tag-view-toolbar">{(['table','list','kanban'] as const).map(mode=><button key={mode} className={view===mode?'selected':''} data-tooltip={tooltips.tags[mode]} onClick={()=>{setView(mode);memory.tagView=mode;onViewChange();}}><Icon name={mode==='list'?'list':mode}/>{ui.tags[mode]}</button>)}
    {view==='kanban'&&<select aria-label={ui.tags.groupCardsByProperty} value={groupField?.propertyKey??''} data-tooltip={tooltips.tags.groupProperty} onChange={e=>{setGroup(e.target.value);memory.tagGroup=e.target.value;onViewChange();}}>{choices.map(f=><option key={f.propertyKey} value={f.propertyKey}>{f.label??f.key}</option>)}</select>}
    <input aria-label={ui.tags.filter} placeholder={ui.tags.filter} value={text} onChange={e=>setText(e.target.value)}/><span className="muted">{ui.card.count(rows.length)}</span></div>
    <details className="tag-schema"><summary data-tooltip={tooltips.tags.definition}>{ui.tags.definition}</summary><Definition key={tag.path} tag={tag} snapshot={snapshot} session={session}/></details>
    {resolved.warnings.map(w=><p key={w} role="alert" className="notice">{w}</p>)}
    <div className="tag-results" aria-busy={busy}>{view!=='kanban'?<table><thead><tr><th>{ui.tags.card}</th>{view==='table'&&resolved.fields.map(f=><th key={f.propertyKey}>{f.label??f.key}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.card.id}><td><button data-tooltip={tooltips.files.open(row.card.path)} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/>{row.card.name}</button></td>{view==='table'&&resolved.fields.map(f=><td key={f.propertyKey}><PropertyInput field={f} value={row.properties[f.propertyKey]} cards={snapshot.cards} disabled={busy||!!resolved.warnings.length} onSave={value=>session.setTagProperty(row.card.path,row.card.revision,tag.tag,f.propertyKey,value)}/></td>)}</tr>)}</tbody></table>:
      !groupField?<p className="empty-label">{ui.tags.noGrouping}</p>:<div className="kanban">{columns.map(value=><section key={value} data-tag-column={value}><h3>{value||ui.tags.noProperty(groupField.label??groupField.key)}<span>{rows.filter(row=>display(row.properties[groupField.propertyKey])===value).length}</span></h3>{groupField.type==='status'&&STATUS_GROUPS.map(group=>groupField.statusGroups?.[group].includes(value)?<div className="kanban-progress" key={group}>{ui.tags.statusGroups[group]}</div>:null)}{rows.filter(row=>display(row.properties[groupField.propertyKey])===value).map(row=><div className="kanban-card" key={row.card.id} onPointerDown={e=>drag(e,row)} onDoubleClick={()=>onOpen('card:'+row.card.id)}><button data-tooltip={tooltips.files.open(row.card.path)} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/><span>{row.card.title||row.card.name}</span></button><Tool icon="more" label={tooltips.tags.move} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();setMenu({x:rect.left,y:rect.bottom,label:ui.tags.moveTo,actions:[...new Set(['',...columns])].filter(v=>(fieldOptions(groupField)).includes(v)||v==='').map(v=>({label:v||ui.tags.noProperty(groupField.key),checked:v===display(row.properties[groupField.propertyKey]),run:()=>move(row,v)}))});}}/>{resolved.fields.filter(f=>f.propertyKey!==groupField.propertyKey&&row.properties[f.propertyKey]!==undefined&&row.properties[f.propertyKey]!==null).slice(0,2).map(f=><div className="kanban-property" key={f.propertyKey}><span>{f.label||f.key}</span><span>{f.type==='boolean'?(row.properties[f.propertyKey]?ui.tags.yes:ui.tags.no):display(row.properties[f.propertyKey])}</span></div>)}</div>)}</section>)}</div>}
      {!rows.length&&!busy&&<p className="empty-label">{ui.tags.empty(tag.tag)}</p>}{busy&&<p className="empty-label" role="status">{ui.common.loading}</p>}{more&&<button disabled={busy} onClick={()=>void loadMore()}>{ui.tags.loadMore}</button>}
    </div>{menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}</section>;
}
