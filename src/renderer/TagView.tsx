import {ViewBlock} from './ViewBlock';
import {viewFence,viewBlockRanges,replaceViewSource,newViewBlock,writeViewBlock} from '../view-block';
import {preview} from './markdown';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,useId,type ReactNode,type ButtonHTMLAttributes,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {DEFAULT_PALETTE,cardFill,tintColor} from '../colors';
import {Color} from './StyleView';
import {Highlight} from './SearchView';
import type {CardInfo,CardProperties,Snapshot,TagField,TagInfo,TagResult,TagValue,TagSearchResult,ResolvedTagField} from '../shared';
import {TAG_FIELD_TYPES,STATUS_GROUPS} from '../shared';
import {resolveTag,cardTagFields,validateFields,validateTagValue,fieldOptions,multipleChoices,propertyType,validTag} from '../tags';
import type {Session} from './session';
import type {ViewMemory} from '../layout';
import {Icon,Tool,type IconName} from './Icons';
import {overlayContainer,ActionMenu,type MenuState} from './Overlays';
import {useConfirmation} from './Confirmation';
import {dragKanban,useBookmarkDrag} from './sortable';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {PropertyInput,PropertyPill,PropertyPopover,propertyText as display} from './PropertyValue';
export function NewTag({session,onCreated}:{session:Session;onCreated:(path:string)=>void}) {
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),input=useRef<HTMLInputElement>(null);
  return <form className="new-tag" onSubmit={e=>{e.preventDefault();if(busy)return;if(!name.trim()){input.current?.focus();return;}setBusy(true);void session.createTag(name.trim()).then(tag=>{setName('');onCreated(tag.path);}).catch(()=>undefined).finally(()=>setBusy(false));}}>
    <input ref={input} aria-label={ui.tags.name} placeholder={ui.tags.newTag} value={name} onChange={e=>setName(e.target.value)}/><Tool icon="plus" label={tooltips.tags.newTag} disabled={busy} type="submit"/>
  </form>;
}
function TagProperties({card,tag,snapshot,session,properties,onOpen}:{card:CardInfo;tag:string;snapshot:Snapshot;session:Session;properties:CardProperties;onOpen:(key:string)=>void}){
  const list=useRef<HTMLDivElement>(null),resolved=resolveTag(snapshot.tags??[],tag),fields=cardTagFields(snapshot.tags??[],tag,properties.properties),definition=snapshot.tags?.find(t=>t.tag===tag);
  const [editing,setEditing]=useState<{field:TagField;definition:TagInfo;anchor:HTMLElement}>();
  const busy=properties.revision!==card.revision||!!resolved.warnings.length;
  const reorder=(key:string,index:number|null)=>{if(index===null||busy)return;const keys=fields.map(f=>f.propertyKey),from=keys.indexOf(key);if(from===index)return;keys.splice(from,1);keys.splice(index,0,key);void session.reorderTagProperties(card.path,properties.revision,tag,keys).catch(()=>undefined);};
  const drag=useBookmarkDrag(list,(key,index)=>reorder(key,index),'vertical',true);
  return <>{resolved.warnings.map(w=><p role="alert" key={w}>{w}</p>)}<div ref={list} className="tag-properties">
    {fields.map((field,i)=><div className="tag-property-row" data-file-key={field.propertyKey} key={field.propertyKey}>
      <PropertyName field={field} disabled={busy} onRename={snapshot.tags?.find(t=>t.tag===field.sourceTag)?.fields.some(f=>f.key===field.key)?name=>{const source=snapshot.tags!.find(t=>t.tag===field.sourceTag)!;return session.renameTagProperty(source.path,source.revision,field.key,name);}:undefined} onClick={e=>{const source=snapshot.tags?.find(t=>t.tag===field.sourceTag),own=source?.fields.find(f=>f.key===field.key);if(source&&own)setEditing({field:own,definition:source,anchor:e.currentTarget});}} data-tooltip={tooltips.tags.reorder} onPointerDown={e=>drag(e,field.propertyKey,true)} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();reorder(field.propertyKey,Math.max(0,Math.min(fields.length-1,i+(e.key==='ArrowUp'?-1:1))));}}}/>
      <PropertyInput field={field} value={properties.properties[field.propertyKey]} disabled={busy} cards={snapshot.cards} boards={snapshot.boards} onOpen={onOpen} onSave={value=>session.setTagProperty(card.path,properties.revision,tag,field.propertyKey,value)}/>
    </div>)}{!fields.length&&<p className="muted">{ui.tags.emptyFields}</p>}
  </div>{definition&&!resolved.warnings.length&&<PropertyAdder key={tag} cards={snapshot.cards} boards={snapshot.boards} disabled={busy} existing={resolved.fields.filter(f=>!Object.hasOwn(properties.properties,f.propertyKey)).sort((a,b)=>Number(!!b.optional)-Number(!!a.optional))} onExisting={field=>session.setTagProperty(card.path,properties.revision,tag,field.propertyKey,field.default??null)} onCreate={(field,value)=>session.addTagProperty(card.path,properties.revision,tag,definition.revision,field,value)}/>} {editing&&<PropertyConfiguration initial={editing.field} anchor={editing.anchor} onSave={field=>session.saveTag(editing.definition.path,editing.definition.revision,editing.definition.fields.map(f=>f.key===field.key?field:f),editing.definition.inherits)} onClose={()=>setEditing(undefined)}/>}</>;
}
function InlineTagInput({tags,attached,busy,onAttach,session,label=ui.tags.add}:{label?:string;session:Session;tags:TagInfo[];attached:string[];busy:boolean;onAttach:(tag:string,create:boolean)=>Promise<boolean>}) {
  const [text,setText]=useState(''),[focused,setFocused]=useState(false),[selected,setSelected]=useState(0),input=useRef<HTMLInputElement>(null),popup=useRef<HTMLDivElement>(null),id=useId();
  const query=text.trim().replace(/^#/,''),[matches,setMatches]=useState<TagSearchResult[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(''),attachedKey=attached.join('\n');
  useEffect(()=>{
    let live=true;setMatches([]);setSearchError('');setSearching(!!query&&focused);
    if(!query||!focused)return;
    const timer=setTimeout(()=>{void session.bridge.request<TagSearchResult[]>({kind:'queryTags',text:query,exclude:attached}).then(rows=>{if(live)setMatches(rows);}).catch(error=>{if(live)setSearchError(String(error));}).finally(()=>{if(live)setSearching(false);});},100);
    return()=>{live=false;clearTimeout(timer);};
  },[query,focused,attachedKey,tags,session]);
  const choices=searching?[]:[...matches.map(t=>({tag:t.tag,create:false})),...(validTag(query)&&!tags.some(t=>t.tag===query)&&!attached.includes(query)?[{tag:query,create:true}]:[])];
  const open=focused&&!!query&&!busy,index=Math.min(selected,choices.length-1);
  useLayoutEffect(()=>{
    if(!open||!popup.current||!input.current)return;
    const el=popup.current,rect=input.current.getBoundingClientRect();el.showPopover();
    const box=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(rect.left,innerWidth-box.width-8))+'px';el.style.top=(rect.bottom+box.height+8<innerHeight?rect.bottom+4:Math.max(8,rect.top-box.height-4))+'px';
  },[open,query,matches,searching,searchError]);
  useEffect(()=>{popup.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView?.({block:'nearest'});},[selected,matches]);
  async function choose(i:number){const choice=choices[i];if(choice&&await onAttach(choice.tag,choice.create)){setText('');setSelected(0);input.current?.focus();}}
  return <><input ref={input} className="tag-inline-input" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open&&index>=0?`${id}-${index}`:undefined} autoComplete="off" spellCheck={false} readOnly={busy} aria-disabled={busy} value={text} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>{setText(e.target.value);setFocused(true);setSelected(0);}} onKeyDown={e=>{
    if(e.nativeEvent.isComposing)return;
    if(open&&['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')setFocused(false);else if(e.key==='Enter')void choose(index);else if(choices.length)setSelected((index+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length);}
  }}/>{open&&createPortal(<div ref={popup} id={id} popover="auto" role="listbox" className="context-menu tag-suggestions" aria-busy={searching} aria-label={ui.tags.suggestions} onToggle={e=>{if(e.newState==='closed')setFocused(false);}} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}>
    {searchError?<div role="alert">{searchError}</div>:searching?<div role="status">{ui.search.searching}</div>:!choices.length?<div role="status">{ui.search.noResults}</div>:null}
    {choices.map((choice,i)=><button key={choice.tag} id={`${id}-${i}`} type="button" role="option" tabIndex={-1} aria-selected={i===index} onPointerMove={()=>setSelected(i)} onClick={e=>{e.stopPropagation();void choose(i);}}><Icon name={choice.create?'plus':'tag'} size={14}/><span>{choice.create?ui.tags.create(choice.tag):<Highlight text={'#'+choice.tag} ranges={matches.find(t=>t.tag===choice.tag)?.highlights.name}/>}</span></button>)}
  </div>,overlayContainer(input.current))}</>;
}

export function CardTags({card,snapshot,session,onOpen,allowAdd=true}:{card:CardInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;allowAdd?:boolean}) {
  const tags=card.tags??[],memory=session.tagExpansion.get(card.id),active=tags.includes(memory?.active??'')?memory?.active:undefined;
  const [properties,setProperties]=useState<CardProperties>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState<MenuState|null>(null),confirm=useConfirmation(),list=useRef<HTMLDivElement>(null),id=useId();
  useEffect(()=>{let live=true;if(!active)return;void session.bridge.request<CardProperties>({kind:'cardProperties',path:card.path}).then(p=>{if(live){setProperties(p);setError('');}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[active,card.path,card.revision,session]);
  function toggle(tag?:string){session.tagExpansion.set(card.id,{active:tag===active?undefined:tag,last:tag??memory?.last});session.update({});}
  async function attach(tag:string,create=false){setBusy(true);try{await session.setCardTag(card.path,card.revision,tag,true,create);session.tagExpansion.set(card.id,{active:tag,last:tag});session.update({});return true;}catch{return false;}finally{setBusy(false);}}
  function reorder(tag:string,index:number|null){if(index===null||busy)return;session.tagExpansion.set(card.id,{active:tag,last:tag});session.update({});if(tags.indexOf(tag)===index)return;const next=tags.filter(t=>t!==tag);next.splice(index,0,tag);setBusy(true);void session.reorderCardTags(card.path,card.revision,next).catch(()=>undefined).finally(()=>setBusy(false));}
  const drag=useBookmarkDrag(list,(tag,index)=>reorder(tag,index),'horizontal',true),colors=snapshot.preferences?.tagColors;
  function actions(tag:string,anchor:HTMLElement){anchor=anchor.closest<HTMLElement>('.tag-chip')??anchor;const rect=anchor.getBoundingClientRect();setMenu({anchor,x:rect.left,y:rect.bottom,label:tag,actions:[{label:ui.tags.definition,icon:'external',run:()=>{const definition=snapshot.tags?.find(t=>t.tag===tag);if(definition)onOpen('tag:'+definition.path);}},{label:ui.tags.remove,icon:'close',danger:true,run:()=>{void confirm({title:ui.tags.remove,message:ui.tags.removeMessage(tag),accept:ui.tags.remove,danger:true}).then(ok=>{if(ok)void session.setCardTag(card.path,card.revision,tag,false).catch(()=>undefined);});}}]});}
  return <div className="card-tags" data-expanded={!!active} onDoubleClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onContextMenu={e=>e.stopPropagation()}>
    <div className="tag-row"><Tool icon="tag" label={tooltips.tags.toggleProperties} disabled={!tags.length} aria-expanded={!!active} aria-controls={active?id:undefined} onClick={()=>toggle(active??(tags.includes(memory?.last??'')?memory!.last:tags[0]))}/>
      <div className="tag-chips" ref={list} role="group" aria-label={ui.layout.tags}>{tags.map((tag,i)=><div key={tag} data-file-key={tag} className="tag-chip" data-active={active===tag} style={{backgroundColor:tintColor(colors&&Object.hasOwn(colors,tag)?colors[tag]:undefined)}} onContextMenu={e=>{e.preventDefault();actions(tag,e.currentTarget);}}><button type="button" className="tag-chip-label" id={`${id}-tab-${i}`} aria-expanded={active===tag} aria-controls={active===tag?id:undefined} disabled={busy} data-tooltip={tooltips.tags.properties} onPointerDown={e=>{if(!menu)drag(e,tag,true);}} onKeyDown={e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();reorder(tag,Math.max(0,Math.min(tags.length-1,i+(e.key==='ArrowLeft'?-1:1))));}}} onClick={()=>{if(menu)setMenu(null);else toggle(tag);}}>#{tag}</button>{active===tag&&<Tool icon="more" label={tooltips.tags.actions} aria-haspopup="menu" disabled={busy} onClick={e=>{if(menu)setMenu(null);else actions(tag,e.currentTarget);}}/>}</div>)}</div>
      {allowAdd&&<InlineTagInput session={session} tags={snapshot.tags??[]} attached={tags} busy={busy} onAttach={attach}/>}
    </div>
    {active&&<section key={active} className="tag-fields" id={id} role="region" aria-labelledby={`${id}-tab-${tags.indexOf(active)}`}>{error?<p role="alert">{error}</p>:!properties?<p>{ui.common.loading}</p>:<TagProperties card={card} tag={active} snapshot={snapshot} session={session} properties={properties} onOpen={onOpen}/>}</section>}
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}
  </div>;
}

export function TagColorSettings({snapshot,onChange}:{snapshot:Snapshot;onChange:(colors:Record<string,string>)=>void}){
  const tags=[...new Set([...(snapshot.tags??[]).map(t=>t.tag),...snapshot.cards.flatMap(c=>c.tags??[])])].sort(),[selected,setSelected]=useState('');
  const tag=tags.includes(selected)?selected:tags[0],colors=snapshot.preferences?.tagColors??{};
  return <section className="settings-section tag-color-settings" aria-label={ui.tags.colors}><h3>{ui.tags.colors}</h3><small>{ui.tags.colorsHelp}</small>{tag&&<><select aria-label={ui.tags.name} value={tag} onChange={e=>setSelected(e.target.value)}>{tags.map(tag=><option key={tag} value={tag}>#{tag}</option>)}</select><Color label={ui.style.color} value={Object.hasOwn(colors,tag)?colors[tag]:''} palette={snapshot.preferences?.palette??DEFAULT_PALETTE} onChange={color=>{const next={...colors,...(color?{[tag]:color.toLowerCase()}: {})};if(!color)delete next[tag];onChange(next);}}/></>}</section>;
}

function Options({value,onChange,label}:{value:string[];onChange:(options:string[])=>void;label?:string}) {
  const [text,setText]=useState(value.join('\n'));
  return <textarea aria-label={label} value={text} onChange={e=>setText(e.target.value)} onBlur={()=>onChange(text.split('\n').map(t=>t.trim()).filter(Boolean))}/>;
}
const propertyIcon=(type:TagField['type']):IconName=>propertyType(type)==='boolean'?'check':propertyType(type)==='date'?'calendar':propertyType(type)==='link'?'link':propertyType(type)==='select'||type==='status'?'list':'format';
function PropertyName({field,onRename,onClick,...props}:{field:TagField;onRename?:(name:string)=>Promise<unknown>}&ButtonHTMLAttributes<HTMLButtonElement>){
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),finished=useRef(false),input=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{if(editing)input.current?.focus();},[editing]);
  async function commit(){if(finished.current||!onRename)return;finished.current=true;if(name===(field.label||field.key)){setEditing(false);return;}setBusy(true);try{await onRename(name.trim());setEditing(false);}catch(error){finished.current=false;setError(String(error));input.current?.focus();}finally{setBusy(false);}}
  return <div className="property-name-cell" data-editing={editing}>
    <button type="button" {...props} className="property-label" onClick={e=>{if((e.target as Element).closest('.property-icon')||!onRename)onClick?.(e);else{finished.current=false;setName(field.label||field.key);setError('');setEditing(true);}}}><span className="property-icon"><Icon name={propertyIcon(field.type)} size={14}/><Icon name="grip" size={14}/></span><span>{field.label||field.key}</span></button>
    {editing&&<input ref={input} className="property-name-input" aria-label={ui.tags.fieldKey} aria-invalid={!!error} value={name} disabled={busy} onPointerDown={e=>e.stopPropagation()} onChange={e=>setName(e.target.value)} onBlur={()=>void commit()} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){e.preventDefault();void commit();}if(e.key==='Escape'){finished.current=true;setEditing(false);setError('');}}}/>}
    {error&&<small className="property-error change-removed" role="alert">{error}</small>}
  </div>;
}
const newField=(type:TagField['type']):TagField=>({key:'',type,...(type==='status'?{statusGroups:{todo:[ui.tags.statusGroups.todo],inProgress:[ui.tags.statusGroups.inProgress],done:[ui.tags.statusGroups.done]}}:{})});
function PropertyConfiguration({initial,anchor,onSave,onClose}:{initial:TagField;anchor:HTMLElement;onSave:(field:TagField)=>Promise<unknown>;onClose:()=>void}){
  const [field,setField]=useState(()=>structuredClone(initial)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const patch=(next:Partial<TagField>)=>setField(field=>({...field,...next}));
  return <PropertyPopover anchor={anchor} label={ui.tags.configureProperty} onClose={()=>{if(!busy)onClose();}}><form className="property-configuration" onSubmit={e=>{e.preventDefault();e.stopPropagation();if(busy)return;try{validateFields([{...field,key:field.key||'_'}]);}catch(error){setError(String(error));return;}setBusy(true);void onSave(field).then(onClose).catch(error=>setError(String(error))).finally(()=>setBusy(false));}}>
    <label>{ui.tags.fieldType}<select aria-label={ui.tags.fieldType} disabled={busy} value={propertyType(field.type)} onChange={e=>{const type=e.target.value as TagField['type'],next={...field,...newField(type),key:field.key};delete next.multiple;delete next.options;if(type!=='status')delete next.statusGroups;try{if(next.default!==undefined)validateTagValue(next,next.default);}catch{next.default=null;}setField(next);}}>{TAG_FIELD_TYPES.map(type=><option key={type} value={type}>{ui.tags.types[type]}</option>)}</select></label>
    {propertyType(field.type)==='select'&&<><label className="settings-toggle">{ui.tags.allowMultiple}<input type="checkbox" role="switch" checked={multipleChoices(field)} disabled={busy} onChange={e=>{const next={...field,type:'select' as const,multiple:e.target.checked};if(next.default!==undefined&&next.default!==null)next.default=e.target.checked?Array.isArray(next.default)?next.default:[String(next.default)]:Array.isArray(next.default)?next.default[0]??null:next.default;setField(next);}}/></label><label>{ui.tags.fieldOptions}<Options value={field.options??[]} onChange={options=>patch({options})}/></label></>}
    {field.type==='status'&&STATUS_GROUPS.map(group=><label key={group}>{ui.tags.statusGroups[group]}<Options label={ui.tags.statusGroups[group]} value={field.statusGroups?.[group]??[]} onChange={options=>patch({statusGroups:{...field.statusGroups!,[group]:options}})}/></label>)}
    <button className="primary" disabled={busy} type="submit">{ui.common.save}</button>{error&&<small role="alert" className="change-removed">{error}</small>}
  </form></PropertyPopover>;
}
function PropertyEditor({initial,cards,boards,onSave,onClose}:{initial:TagField;cards:CardInfo[];boards:Snapshot['boards'];onSave:(field:TagField,value:TagValue)=>Promise<unknown>;onClose:()=>void}){
  const [field,setField]=useState(()=>structuredClone(initial)),[value,setValue]=useState<TagValue>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[anchor,setAnchor]=useState<HTMLElement|null>(null);
  return <form className="tag-definition tag-property-row" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose();}}} onSubmit={e=>{e.preventDefault();if(busy)return;const next={...field,key:field.key.trim()};try{validateFields([next]);validateTagValue(next,value);}catch(error){setError(String(error));return;}setBusy(true);void onSave(next,value).then(onClose).catch(error=>setError(String(error))).finally(()=>setBusy(false));}}>
    <div className="property-new-name"><Tool icon={propertyIcon(field.type)} label={tooltips.tags.configureProperty} onClick={e=>setAnchor(e.currentTarget)}/><input autoFocus aria-label={ui.tags.fieldKey} placeholder={ui.tags.fieldKey} disabled={busy} value={field.key} onChange={e=>setField({...field,key:e.target.value})}/></div>
    <PropertyInput field={field} value={value} cards={cards} boards={boards} disabled={busy} onSave={async next=>setValue(next)}/><Tool icon="check" label={tooltips.tags.saveProperty} type="submit" disabled={busy}/>
    {anchor&&<PropertyConfiguration anchor={anchor} initial={field} onSave={async next=>setField(next)} onClose={()=>setAnchor(null)}/>}{error&&<small className="property-error change-removed" role="alert">{error}</small>}
  </form>;
}
function PropertyAdder({cards,boards,disabled,existing=[],onExisting,onCreate}:{cards:CardInfo[];boards:Snapshot['boards'];disabled?:boolean;existing?:ResolvedTagField[];onExisting?:(field:ResolvedTagField)=>Promise<unknown>;onCreate:(field:TagField,value:TagValue)=>Promise<unknown>}){
  const [field,setField]=useState<TagField>(),[menu,setMenu]=useState<MenuState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),button=useRef<HTMLButtonElement>(null);
  const close=()=>{setField(undefined);button.current?.focus();};
  return <div className="tag-add-property"><button ref={button} type="button" disabled={disabled||busy} aria-haspopup="menu" aria-expanded={!!field||!!menu} data-tooltip={tooltips.tags.addField} onClick={e=>{if(menu){setMenu(null);return;}const anchor=e.currentTarget,rect=anchor.getBoundingClientRect();setMenu({anchor,x:rect.left,y:rect.bottom,label:ui.tags.addField,actions:[...existing.map(f=>({label:(f.label||f.key)+(f.default!==undefined&&f.default!==null?' · '+display(f.default):''),icon:propertyIcon(f.type),run:()=>{setBusy(true);setError('');void onExisting?.(f).catch(error=>setError(String(error))).finally(()=>setBusy(false));}})),...TAG_FIELD_TYPES.map((type,i)=>({label:ui.tags.types[type],icon:propertyIcon(type),separatorBefore:i===0&&!!existing.length,run:()=>setField(newField(type))}))]});}}><Icon name="plus" size={14}/>{ui.tags.addField}</button>
    {field&&<PropertyEditor key={field.type} initial={field} cards={cards} boards={boards} onSave={onCreate} onClose={close}/>} {error&&<p role="alert">{error}</p>}{menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}</div>;
}
function SchemaProperties({tag,snapshot,session,onOpen,children}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;children:ReactNode}){
  const resolved=resolveTag(snapshot.tags??[],tag.tag),list=useRef<HTMLDivElement>(null),id=useId(),collapsed=tag.propertiesCollapsed??false;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<{field:TagField;expected:string;fields:TagField[];inherits:string[];anchor:HTMLElement}>(),[menu,setMenu]=useState<MenuState|null>(null);
  const blocked=busy||!!resolved.warnings.length;
  async function save(next:TagField[],propertiesCollapsed?:boolean){setBusy(true);setError('');try{const updated=await session.saveTag(tag.path,tag.revision,next,tag.inherits,undefined,propertiesCollapsed);if(propertiesCollapsed!==undefined)setEditing(current=>current?.expected===tag.revision?{...current,expected:updated.revision}:current);}catch(error){setError(String(error));throw error;}finally{setBusy(false);}}
  const edit=(field:ResolvedTagField,anchor:HTMLElement)=>{if(field.sourceTag!==tag.tag){const parent=snapshot.tags?.find(t=>t.tag===field.sourceTag);if(parent)onOpen('tag:'+parent.path);return;}setEditing({field:tag.fields.find(f=>f.key===field.key)!,expected:tag.revision,fields:tag.fields,inherits:tag.inherits,anchor});};
  const reorder=(key:string,index:number|null,group?:string)=>{
    if(blocked||index===null||!group)return;
    const field=tag.fields.find(f=>tag.tag+'/'+f.key===key);if(!field)return;
    const optional=group==='optional',fields=resolved.fields.filter(f=>!!f.optional===optional);
    if(!!field.optional===optional&&fields.findIndex(f=>f.propertyKey===key)===index)return;
    const visible=fields.filter(f=>f.propertyKey!==key);
    const ownIndex=visible.slice(0,index).filter(f=>f.sourceTag===tag.tag).length,next=tag.fields.filter(f=>f.key!==field.key),target=next.filter(f=>!!f.optional===optional);
    const at=target[ownIndex]?next.indexOf(target[ownIndex]):target.length?next.indexOf(target.at(-1)!)+1:next.length;
    next.splice(at,0,{...field,optional});
    if(JSON.stringify(next)!==JSON.stringify(tag.fields))void save(next).catch(()=>undefined);
  };
  const drag=useBookmarkDrag(list,(key,index,_source,group)=>reorder(key,index,group),'vertical',true);
  const actions=(field:ResolvedTagField,anchor:HTMLElement)=>{const optional=!!field.optional,rect=anchor.getBoundingClientRect();setMenu({anchor,x:rect.left,y:rect.bottom,label:field.label||field.key,actions:[{label:ui.tags.editProperty,icon:'edit',run:()=>edit(field,anchor)},...(field.sourceTag===tag.tag?[{label:optional?ui.tags.makeDefault:ui.tags.makeOptional,icon:'list' as const,run:()=>{void save(tag.fields.map(f=>f.key===field.key?{...f,optional:!optional}:f)).catch(()=>undefined);}},{label:ui.tags.removeProperty,icon:'close' as const,danger:true,run:()=>{void save(tag.fields.filter(f=>f.key!==field.key)).catch(()=>undefined);}}]:[])]});};
  return <><div className="tag-properties-heading" data-collapsed={collapsed}><h2>{ui.tags.properties}</h2><PropertyAdder cards={snapshot.cards} boards={snapshot.boards} disabled={blocked} onCreate={(field,value)=>save([...tag.fields,{...field,optional:true,default:value}])}/><Tool className="tag-properties-toggle" icon={collapsed?'down':'chevronUp'} label={collapsed?tooltips.tags.expandProperties:tooltips.tags.collapseProperties} disabled={busy} aria-expanded={!collapsed} aria-controls={id} onClick={()=>{void save(tag.fields,!collapsed).catch(()=>undefined);}}/></div><div id={id} hidden={collapsed}><div ref={list} className="tag-schema-properties">{[false,true].map(optional=>{
    const fields=resolved.fields.filter(f=>!!f.optional===optional),group=optional?'optional':'default';
    return <section key={group} className="tag-property-group" data-sort-area aria-label={optional?ui.tags.optionalProperties:ui.tags.defaultProperties}><h3>{optional?ui.tags.optionalProperties:ui.tags.defaultProperties}</h3><div className="tag-properties" data-sort-group={group}>
      {fields.map((field,i)=><div className="tag-property-row" key={field.propertyKey} data-file-key={field.propertyKey} onContextMenu={e=>{e.preventDefault();actions(field,e.currentTarget);}}><PropertyName field={field} disabled={blocked} data-tooltip={tooltips.tags.editProperty} onClick={e=>edit(field,e.currentTarget)} onRename={field.sourceTag===tag.tag?name=>session.renameTagProperty(tag.path,tag.revision,field.key,name):undefined} onPointerDown={e=>{if(field.sourceTag===tag.tag)drag(e,field.propertyKey,true);}} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();reorder(field.propertyKey,Math.max(0,Math.min(fields.length-1,i+(e.key==='ArrowUp'?-1:1))),group);}}}/><PropertyInput field={field} value={field.default} disabled={blocked||field.sourceTag!==tag.tag} cards={snapshot.cards} boards={snapshot.boards} onOpen={onOpen} onSave={value=>save(tag.fields.map(f=>f.key===field.key?{...f,default:value}:f))}/></div>)}
    </div></section>;
  })}</div>{editing&&!collapsed&&<PropertyConfiguration anchor={editing.anchor} initial={editing.field} onSave={field=>session.saveTag(tag.path,editing.expected,editing.fields.map(f=>f.key===field.key?field:f),editing.inherits)} onClose={()=>setEditing(undefined)}/>} {children}</div>
    {error&&<p role="alert">{error}</p>}{menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}</>;
}
function TagInheritance({tag,snapshot,session,onOpen}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState<MenuState|null>(null),row=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),tags=snapshot.tags??[],colors=snapshot.preferences?.tagColors;
  async function save(inherits:string[],createParent?:string){setBusy(true);setError('');try{await session.saveTag(tag.path,tag.revision,tag.fields,inherits,createParent);return true;}catch(error){setError(String(error));return false;}finally{setBusy(false);}}
  const open=(name:string)=>{const parent=tags.find(t=>t.tag===name);if(parent)onOpen('tag:'+parent.path);};
  const excluded=useMemo(()=>{
    const children=new Map<string,string[]>();for(const item of tags)for(const parent of item.inherits){if(!children.has(parent))children.set(parent,[]);children.get(parent)!.push(item.tag);}
    const blocked=new Set([tag.tag]),pending=[tag.tag];for(let i=0;i<pending.length;i++)for(const child of children.get(pending[i])??[])if(!blocked.has(child)){blocked.add(child);pending.push(child);}
    return [...new Set([...blocked,...tag.inherits])];
  },[tag.tag,tag.inherits,tags]);
  const reorder=(name:string,index:number|null)=>{if(busy||index===null||tag.inherits.indexOf(name)===index)return;const next=tag.inherits.filter(t=>t!==name);next.splice(index,0,name);void save(next);};
  const drag=useBookmarkDrag(list,(name,index)=>reorder(name,index),'horizontal',true);
  const actions=(name:string,anchor:HTMLElement)=>{const rect=anchor.getBoundingClientRect();setMenu({anchor,x:rect.left,y:rect.bottom,label:name,actions:[{label:ui.tags.definition,icon:'external',run:()=>open(name)},{label:ui.tags.removeParent,icon:'close',danger:true,run:()=>{void save(tag.inherits.filter(t=>t!==name));}}]});};
  return <div className="tag-inheritance"><div className="tag-row" ref={row}><button type="button" className="tag-parent-label" data-tooltip={tooltips.tags.inherit} onClick={()=>row.current?.querySelector<HTMLInputElement>('input')?.focus()}><Icon name="inherits" size={14}/>{ui.tags.inherits}</button>
    <div className="tag-chips" ref={list} role="group" aria-label={ui.tags.parents}>{tag.inherits.map((name,i)=><div key={name} className="tag-chip" data-file-key={name} style={{backgroundColor:tintColor(colors&&Object.hasOwn(colors,name)?colors[name]:undefined)}} onContextMenu={e=>{e.preventDefault();actions(name,e.currentTarget);}}><button type="button" className="tag-chip-label" disabled={busy} data-tooltip={tooltips.tags.parent} onPointerDown={e=>{if(!menu)drag(e,name,true);}} onClick={()=>{if(menu)setMenu(null);else open(name);}} onKeyDown={e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();reorder(name,Math.max(0,Math.min(tag.inherits.length-1,i+(e.key==='ArrowLeft'?-1:1))));}}}>#{name}</button></div>)}</div>
    <InlineTagInput session={session} tags={tags} attached={excluded} busy={busy} label={ui.tags.addParent} onAttach={(name,create)=>save([...tag.inherits,name],create?name:undefined)}/>
  </div>{error&&<p role="alert">{error}</p>}{menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}</div>;
}
function TagPageProperties({tag,snapshot,session,onOpen}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void}){
  const colors=snapshot.preferences?.tagColors??{};
  return <div className="tag-page-properties"><h1><span className="tag-chip tag-title-chip" style={{backgroundColor:tintColor(Object.hasOwn(colors,tag.tag)?colors[tag.tag]:undefined)}}>#{tag.tag}</span></h1><TagInheritance tag={tag} snapshot={snapshot} session={session} onOpen={onOpen}/><SchemaProperties tag={tag} snapshot={snapshot} session={session} onOpen={onOpen}>
    <section className="tag-property-group tag-page-color"><Color label={ui.style.color} value={Object.hasOwn(colors,tag.tag)?colors[tag.tag]:''} palette={snapshot.preferences?.palette??DEFAULT_PALETTE} onChange={color=>{const tagColors={...colors,...(color?{[tag.tag]:color.toLowerCase()}: {})};if(!color)delete tagColors[tag.tag];void session.run(async()=>{await session.flushPreferences();session.update({snapshot:await session.bridge.request<Snapshot>({kind:'preferences',patch:{tagColors}})});}).catch(()=>undefined);}}/></section></SchemaProperties>
  </div>;
}
export function TagView(props:Parameters<typeof LegacyTagView>[0]){
  const {tag,snapshot,session,onOpen}=props,body=tag.body??'',blocks=viewBlockRanges(body);
  const save=(body:string)=>session.saveTagBody(tag.path,tag.revision,body);
  const add=<button className="view-add-block" onClick={()=>void save(body+viewFence(tag.tag)).catch(()=>undefined)}><Icon name="plus" size={14}/>{ui.views.addBlock}</button>;
  if(!blocks.length)return <div className="tag-view-container"><LegacyTagView {...props}/><div className="tag-view-add">{add}</div></div>;
  return <section className="tag-view"><TagPageProperties tag={tag} snapshot={snapshot} session={session} onOpen={onOpen}/><h2 className="tag-views-heading">{ui.tags.views}</h2>{blocks.map((block,i)=><div key={i}>
    <div className="prose" dangerouslySetInnerHTML={{__html:preview(body.slice(i?blocks[i-1].end:0,block.start),tag.path,false)}}/>
    <ViewBlock path={tag.path} blockIndex={i} source={block.source} onChange={source=>save(replaceViewSource(body,i,block.source,source))} onRemove={()=>save(replaceViewSource(body,i,block.source,null))}/>
  </div>)}<div className="prose" dangerouslySetInnerHTML={{__html:preview(body.slice(blocks.at(-1)!.end),tag.path,false)}}/>{add}</section>;
}
function LegacyTagView({tag,snapshot,session,onOpen,onPreview=onOpen,memory,onViewChange}:{tag:TagInfo;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;onPreview?:(key:string)=>void;memory:ViewMemory;onViewChange:()=>void}) {
  const [rows,setRows]=useState<TagResult[]>([]),[view,setView]=useState<'table'|'list'|'kanban'>(memory.tagView??'table'),[group,setGroup]=useState(memory.tagGroup??''),[text,setText]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[menu,setMenu]=useState<MenuState|null>(null);
  const generation=useRef(0),cancel=useRef<()=>void>(()=>{});
  const resolved=useMemo(()=>resolveTag(snapshot.tags??[],tag.tag),[snapshot.tags,tag.tag]);
  const choices=resolved.fields.filter(f=>f.type==='select'&&!multipleChoices(f)||f.type==='status'),groupField=choices.find(f=>f.propertyKey===group)??choices[0];
  // Snapshots cross IPC with new array identities; only card data changes invalidate these rows.
  const cardsRevision=useMemo(()=>JSON.stringify(snapshot.cards.map(card=>[card.path,card.revision])),[snapshot.cards]);
  useEffect(()=>{const version=++generation.current;setBusy(true);const timer=setTimeout(()=>{void session.bridge.request<TagResult[]>({kind:'tagCards',tag:tag.tag,text}).then(result=>{if(generation.current===version){setRows(result);setMore(result.length===200);}}).catch(error=>session.update({error:String(error)})).finally(()=>{if(generation.current===version)setBusy(false);});},100);return()=>{clearTimeout(timer);generation.current++;};},[tag.tag,snapshot.root,cardsRevision,session,text]);
  useEffect(()=>()=>cancel.current(),[]);
  async function loadMore(){const version=generation.current;setBusy(true);try{const result=await session.bridge.request<TagResult[]>({kind:'tagCards',tag:tag.tag,text,offset:rows.length});if(version===generation.current){setRows(previous=>[...previous,...result]);setMore(result.length===200);}}catch(error){session.update({error:String(error)});}finally{if(version===generation.current)setBusy(false);}}
  const move=(row:TagResult,value:string)=>{if(groupField)void session.setViewProperty(row.card.path,row.card.revision,groupField.propertyKey,value||null).catch(()=>undefined);};
  const columns=groupField?[...(rows.some(row=>!display(row.properties[groupField.propertyKey]))?['']:[]),...new Set([...(fieldOptions(groupField)),...rows.map(row=>display(row.properties[groupField.propertyKey])).filter(Boolean)])]:[];
  function drag(e:ReactPointerEvent<HTMLDivElement>,row:TagResult){
    if(busy||resolved.warnings.length||e.button!==0||(e.target as HTMLElement).closest('button.tool'))return;cancel.current();
    cancel.current=dragKanban(e,e.currentTarget.closest<HTMLElement>('.kanban')!,(value,position)=>{
      const block=newViewBlock(tag.tag),fields=['file.title',...resolved.fields.map(f=>f.propertyKey)];
      block.query.where={any:(snapshot.tags??[]).filter(t=>t.tag===tag.tag||t.tag.startsWith(tag.tag+'/')).map(t=>({field:'tags',op:'contains',value:t.tag}))};
      block.views=[{id:'kanban',name:ui.views.kanban,type:'kanban',groupBy:groupField!.propertyKey,fields},...(['table','list'] as const).map(type=>({id:type,name:ui.views[type],type,fields}))];
      session.viewTabs.set(tag.path+'\0'+0,'kanban');
      void session.moveViewCard({owner:{path:tag.path,expected:tag.revision,source:writeViewBlock('',block),block:-1},view:'kanban',card:{path:row.card.path,expected:row.card.revision},from:display(row.properties[groupField!.propertyKey]),to:value,...position}).catch(()=>undefined);
    },value=>value===''||fieldOptions(groupField!).includes(value));
  }
  return <section className="tag-view"><TagPageProperties tag={tag} snapshot={snapshot} session={session} onOpen={onOpen}/><h2 className="tag-views-heading">{ui.tags.views}</h2><div className="tag-view-toolbar">{(['table','list','kanban'] as const).map(mode=><button key={mode} className={view===mode?'selected':''} data-tooltip={tooltips.tags[mode]} onClick={()=>{setView(mode);memory.tagView=mode;onViewChange();}}><Icon name={mode==='list'?'list':mode}/>{ui.tags[mode]}</button>)}
    {view==='kanban'&&<select aria-label={ui.tags.groupCardsByProperty} value={groupField?.propertyKey??''} data-tooltip={tooltips.tags.groupProperty} onChange={e=>{setGroup(e.target.value);memory.tagGroup=e.target.value;onViewChange();}}>{choices.map(f=><option key={f.propertyKey} value={f.propertyKey}>{f.label??f.key}</option>)}</select>}
    <input aria-label={ui.tags.filter} placeholder={ui.tags.filter} value={text} onChange={e=>setText(e.target.value)}/><span className="muted">{ui.card.count(rows.length)}</span></div>
    {resolved.warnings.map(w=><p key={w} role="alert" className="notice">{w}</p>)}
    <div className="tag-results" aria-busy={busy}>{view!=='kanban'?<table><thead><tr><th>{ui.tags.card}</th>{view==='table'&&resolved.fields.map(f=><th key={f.propertyKey}>{f.label??f.key}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.card.id}><td><button data-tooltip={tooltips.files.open(row.card.path)} onClick={()=>onOpen('card:'+row.card.id)}><Icon name="note"/>{row.card.name}</button></td>{view==='table'&&resolved.fields.map(f=><td key={f.propertyKey}><PropertyInput field={f} value={row.properties[f.propertyKey]} cards={snapshot.cards} boards={snapshot.boards} onOpen={onOpen} disabled={busy||!!resolved.warnings.length} onSave={value=>session.setTagProperty(row.card.path,row.card.revision,tag.tag,f.propertyKey,value)}/></td>)}</tr>)}</tbody></table>:
      !groupField?<p className="empty-label">{ui.tags.noGrouping}</p>:<div className="kanban">{columns.map(value=><section key={value} data-tag-column={value}><h3>{value?<PropertyPill field={groupField} value={value}/>:ui.tags.noProperty(groupField.label??groupField.key)}<span>{rows.filter(row=>display(row.properties[groupField.propertyKey])===value).length}</span></h3>{groupField.type==='status'&&STATUS_GROUPS.map(group=>groupField.statusGroups?.[group].includes(value)?<div className="kanban-progress" key={group}>{ui.tags.statusGroups[group]}</div>:null)}{rows.filter(row=>display(row.properties[groupField.propertyKey])===value).map(row=><div data-card-id={row.card.id} className="kanban-card" style={{background:tintColor(cardFill(row.card))}} key={row.card.id} onPointerDown={e=>drag(e,row)} onClick={e=>{if(!(e.target as HTMLElement).closest('button'))onPreview('card:'+row.card.id);}}><button data-tooltip={tooltips.files.open(row.card.path)} onClick={()=>onPreview('card:'+row.card.id)}><Icon name="note"/><span>{row.card.title||row.card.name}</span></button><Tool icon="more" label={tooltips.tags.move} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();setMenu({x:rect.left,y:rect.bottom,label:ui.tags.moveTo,actions:[...new Set(['',...columns])].filter(v=>(fieldOptions(groupField)).includes(v)||v==='').map(v=>({label:v||ui.tags.noProperty(groupField.key),checked:v===display(row.properties[groupField.propertyKey]),run:()=>move(row,v)}))});}}/>{resolved.fields.filter(f=>f.propertyKey!==groupField.propertyKey&&row.properties[f.propertyKey]!==undefined&&row.properties[f.propertyKey]!==null).slice(0,2).map(f=><div className="kanban-property" key={f.propertyKey}><span>{f.label||f.key}</span><span>{f.type==='status'?<PropertyPill field={f} value={display(row.properties[f.propertyKey])}/>:f.type==='boolean'?(row.properties[f.propertyKey]?ui.tags.yes:ui.tags.no):display(row.properties[f.propertyKey])}</span></div>)}</div>)}</section>)}</div>}
      {!rows.length&&!busy&&<p className="empty-label">{ui.tags.empty(tag.tag)}</p>}{busy&&<p className="empty-label" role="status">{ui.common.loading}</p>}{more&&<button disabled={busy} onClick={()=>void loadMore()}>{ui.tags.loadMore}</button>}
    </div>{menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}</section>;
}
