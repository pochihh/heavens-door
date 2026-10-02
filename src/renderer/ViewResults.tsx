import {useContext,useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {cardFill,tintColor} from '../colors';
import type {NavigationMode} from '../layout';
import type {Snapshot,TagField,TagResult,TagValue,ViewResults} from '../shared';
import {STATUS_GROUPS} from '../shared';
import {type BlockView,type QueryField,viewPropertyTargets,DEFAULT_QUERY_PREFERENCES} from '../view-block';
import {fieldOptions,multipleChoices} from '../tags';
import {PropertyInput,PropertyPill,PropertyPopover,propertyText} from './PropertyValue';
import {DateDisplayContext} from './DateProperty';
import {dateSummary} from '../dates';
import {Icon,Tool} from './Icons';
import {dragKanban} from './sortable';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
const t=ui.views;
function cardField(field:QueryField,row:TagResult,snapshot:Snapshot){
  const targets=field.definition?viewPropertyTargets(field.keys[0],snapshot.tags??[],row.properties,snapshot.preferences?.query??DEFAULT_QUERY_PREFERENCES):[];
  const keys=targets.length?[...new Set(targets.map(t=>t.field.propertyKey))]:field.keys;
  const values=[...new Map(keys.flatMap(key=>{const value=key==='file.path'?row.card.path:key==='file.folder'?row.card.path.split('/').slice(0,-1).join('/'):row.properties[key];return value===undefined||value===null?[]:[[JSON.stringify(value),value] as const];})).values()];
  let definition:TagField|undefined=targets[0]?.field;
  if(definition&&['select','status'].includes(field.type)){
    const options=fieldOptions(definition).filter(option=>targets.every(t=>fieldOptions(t.field).includes(option)));
    definition={...definition,options,...(field.type==='status'?{statusGroups:Object.fromEntries(STATUS_GROUPS.map(group=>[group,(definition!.statusGroups?.[group]??[]).filter(o=>options.includes(o))])) as TagField['statusGroups']}: {})};
  }
  return {keys,values,definition,needsSync:keys.some(key=>JSON.stringify(row.properties[key]??null)!==JSON.stringify(values[0]??null))};
}
function Values({field,values}:{field:QueryField;values:unknown[]}){
  const {display}=useContext(DateDisplayContext);
  if(!values.length)return <span className="muted">{ui.tags.emptyValue}</span>;
  return <>{values.map((value,i)=><span key={i}>{i>0?' · ':''}{field.definition&&['status','select'].includes(field.type)?(Array.isArray(value)?value:[value]).map(v=><PropertyPill key={String(v)} field={field.definition!} value={propertyText(v)}/>):field.type==='boolean'?(value===true?'✓':'—'):field.type==='date'?dateSummary(value,display):propertyText(value)}</span>)}</>;
}
function Cell({field,row,snapshot,editing,onEditing,onSave,onOpen}:{field:QueryField;row:TagResult;snapshot:Snapshot;editing:boolean;onEditing:(editing:boolean)=>void;onSave:(value:TagValue)=>Promise<void>;onOpen:(key:string)=>void}){
  let data:ReturnType<typeof cardField>;try{data=cardField(field,row,snapshot);}catch{return <span className="muted">{t.unknown}</span>;}
  return <div className="view-property" data-property={field.keys[0]} onPointerDown={e=>e.stopPropagation()}>
    {(editing||field.type==='boolean')&&data.definition?<PropertyInput field={data.definition} value={data.values[0]??null} forceSave={data.needsSync} autoFocus={editing&&field.type!=='boolean'} onFinish={()=>onEditing(false)} cards={snapshot.cards} boards={snapshot.boards} onSave={async value=>{onEditing(true);await onSave(value);}} onOpen={onOpen}/>:
      <button type="button" aria-label={data.definition?t.editProperty(field.name):field.name} disabled={!data.definition} onClick={()=>onEditing(true)}><Values field={field} values={data.values}/></button>}
  </div>;
}
export function ViewResultContent({view,result,columns,group,snapshot,editing,onEditing,onSave,onOpen,onPreview=onOpen,onNavigate}:{view:BlockView;result:ViewResults;columns:QueryField[];group?:QueryField;snapshot:Snapshot;editing:string|null;onEditing:(key:string|null)=>void;onSave:(row:TagResult,key:string,value:TagValue)=>Promise<void>;onOpen:(key:string)=>void;onPreview?:(key:string)=>void;onNavigate?:(key:string,mode:NavigationMode)=>void}){
  const cancel=useRef<()=>void>(()=>{}),[moveMenu,setMoveMenu]=useState<{anchor:HTMLElement;row:TagResult}|null>(null),[moveError,setMoveError]=useState('');
  useEffect(()=>()=>cancel.current(),[]);
  useEffect(()=>{cancel.current();setMoveMenu(null);},[view.id,view.type,group?.keys.join('\0')]);
  function cell(row:TagResult,field:QueryField,column=''){const id=column+'\0'+row.card.path+'\0'+field.keys.join('\0');return <Cell key={field.keys.join('\0')} field={field} row={row} snapshot={snapshot} editing={editing===id} onEditing={active=>onEditing(active?id:null)} onSave={value=>onSave(row,field.keys[0],value)} onOpen={onOpen}/>;}
  function names(row:TagResult){if(!group)return [];try{return cardField(group,row,snapshot).values.map(propertyText).filter(Boolean);}catch{return [];}}
  function allowed(row:TagResult){if(!group?.definition||!['status','select'].includes(group.type)||multipleChoices(group.definition))return [];try{const f=cardField(group,row,snapshot).definition;return f?['',...fieldOptions(f)]:[];}catch{return [];}}
  async function move(row:TagResult,value:string){if(!group)return;setMoveError('');onEditing('@move');try{await onSave(row,group.keys[0],value||null);setMoveMenu(null);}catch(e){setMoveError(String(e).replace(/^Error: /,''));}finally{onEditing(null);}}
  function drag(e:ReactPointerEvent<HTMLDivElement>,row:TagResult){if(editing||e.button!==0||(e.target as HTMLElement).closest('[data-property],button.tool'))return;const options=allowed(row),root=e.currentTarget.closest<HTMLElement>('.view-kanban');if(!root||!options.length)return;cancel.current();cancel.current=dragKanban(e,root,value=>{if(names(row).length!==1||names(row)[0]!==value)void move(row,value);},value=>options.includes(value));}
  const title=(row:TagResult)=><button className="view-card-title" onClick={e=>{e.stopPropagation();(view.type==='kanban'?onPreview:onOpen)('card:'+row.card.id);}}><Icon name="note" size={14}/><span>{row.card.title||row.card.name}</span></button>;
  const properties=columns.filter(f=>f.keys[0]!=='file.title');
  const groups=group?[...new Set([...(group.definition?fieldOptions(group.definition):[]),...result.rows.flatMap(names),...(result.rows.some(row=>!names(row).length)?['']:[])])]:[];
  return <>
    {view.type==='table'?<div className="view-table"><table><thead><tr>{columns.map(f=><th key={f.keys.join('\0')}>{f.name}{!(snapshot.preferences?.query??DEFAULT_QUERY_PREFERENCES).mergeProperties&&f.definition&&<small>{f.tags.map(t=>'#'+t).join(', ')}</small>}</th>)}</tr></thead><tbody>{result.rows.map(row=><tr key={row.card.path}>{columns.map(f=><td key={f.keys.join('\0')}>{f.keys[0]==='file.title'?title(row):cell(row,f)}</td>)}</tr>)}</tbody></table></div>:
      view.type==='list'?<div className="view-list">{result.rows.map(row=><div className="view-list-row" key={row.card.path}>{title(row)}<small>{row.card.path}</small>{properties.map(f=><div className="view-list-property" key={f.keys.join('\0')}><span>{f.name}{!(snapshot.preferences?.query??DEFAULT_QUERY_PREFERENCES).mergeProperties&&!!f.tags.length&&<small>{f.tags.map(t=>'#'+t).join(', ')}</small>}</span>{cell(row,f)}</div>)}</div>)}</div>:
      !group?<p className="muted">{t.chooseGroup}</p>:<div className="view-kanban">{groups.map(name=><section key={name} data-tag-column={name}><h3>{name?<Values field={group} values={[name]}/>:t.ungrouped}<span>{result.rows.filter(row=>name?names(row).includes(name):!names(row).length).length}</span></h3>{result.rows.filter(row=>name?names(row).includes(name):!names(row).length).map(row=><div key={row.card.path} className="view-result-card" style={{background:tintColor(cardFill(row.card))}} onClick={e=>{if(!(e.target as HTMLElement).closest('button,input,a,[data-property]'))onPreview('card:'+row.card.id);}} onPointerDown={e=>drag(e,row)}>{title(row)}{(!!allowed(row).length||!!onNavigate)&&<Tool icon="more" label={tooltips.whiteboard.cardActions} onClick={e=>{setMoveError('');setMoveMenu(moveMenu?.row.card.path===row.card.path?null:{anchor:e.currentTarget,row});}}/>}{properties.map(f=><div className="view-list-property" key={f.keys.join('\0')}><span>{f.name}{!(snapshot.preferences?.query??DEFAULT_QUERY_PREFERENCES).mergeProperties&&!!f.tags.length&&<small>{f.tags.map(t=>'#'+t).join(', ')}</small>}</span>{cell(row,f,name)}</div>)}</div>)}</section>)}</div>}
    {moveError&&<p className="change-removed" role="alert">{moveError}</p>}
    {moveMenu&&<PropertyPopover anchor={moveMenu.anchor} align="end" label={ui.tags.moveTo} onClose={()=>setMoveMenu(null)}><div className="view-menu-list">{onNavigate&&<>{(['same','new','other'] as const).map(mode=><button key={mode} onClick={()=>{setMoveMenu(null);onNavigate('card:'+moveMenu.row.card.id,mode);}}>{mode==='same'?ui.common.openInSameTab:mode==='new'?ui.common.openInNewTab:ui.common.openInAnotherTabGroup}</button>)}{!!allowed(moveMenu.row).length&&<hr/>}</>}{allowed(moveMenu.row).map(value=><button key={value} disabled={!!editing} onClick={()=>void move(moveMenu.row,value)}><span>{value||t.ungrouped}</span>{names(moveMenu.row).includes(value)&&<Icon name="check"/>}</button>)}</div></PropertyPopover>}
  </>;
}
