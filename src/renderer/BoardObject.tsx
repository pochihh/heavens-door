import {readingText} from '../text/reading';
import {useEffect,useState} from 'react';
import type {Placement,BoardObject as ObjectValue} from '../shared';
import {CardEditor} from './Editor';
export function BoardObject({placement,path,onChange,onDelete,editing,onEditing,onDone}:{editing:boolean;onEditing:()=>void;onDone:()=>void;onDelete:()=>void;placement:Placement;path:string;onChange:(object:ObjectValue)=>void}){
 const value=placement.object!,[text,setText]=useState(value.type==='text'?value.text:'');
 useEffect(()=>{if(editing&&value.type==='text')setText(value.text);},[editing]);
 if(value.type==='image')return <div className="board-object-image"><CardEditor imageOnly id={placement.id} canvas path={path} body={value.html} cards={[]} onEdit={html=>{if(!html.trim())onDelete();else onChange({...value,html});}}/></div>;
 return <div className={'board-object-text shape-'+value.shape} style={{fontSize:value.fontSize??20,color:value.textColor??'var(--text)'}} tabIndex={0} role="group" aria-label={readingText.textObject} onKeyDown={e=>{if(e.key==='Enter'&&!editing){e.stopPropagation();onEditing();}}}>
  {value.shape==='diamond'&&<svg className="object-diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1 99,50 50,99 1,50" fill="var(--object-fill,var(--card))" stroke={placement.strokeColor??'var(--border)'} strokeWidth={placement.strokeWidth??1}/></svg>}{editing?<textarea autoFocus aria-label={readingText.editWhiteboardText} value={text} onPointerDown={e=>e.stopPropagation()} onChange={e=>setText(e.target.value)} onBlur={()=>{onDone();if(text!==value.text)onChange({...value,text});}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setText(value.text);onDone();}if((e.metaKey||e.ctrlKey)&&e.key==='Enter')e.currentTarget.blur();}}/>:<span>{value.text||'Double-click to write'}</span>}
 </div>;
}
