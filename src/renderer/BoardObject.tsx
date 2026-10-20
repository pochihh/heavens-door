import {topicText} from '../topics';
import {readingText} from '../text/reading';
import {useEffect,useRef,useState} from 'react';
import type {Placement,BoardObject as ObjectValue} from '../shared';
import {ImageItemView,resized} from './EditorImage';
import {parseImageLayout,imageHtml} from './image-layout';
export function BoardObject({placement,path,onChange,onDelete,editing,onEditing,onDone,onResizePreview,onRelated}:{onRelated:(mode:'child'|'sibling',object:ObjectValue)=>void;onResizePreview?:(width?:number)=>void;editing:boolean;onEditing:()=>void;onDone:(focus?:boolean)=>void;onDelete:()=>void;placement:Placement;path:string;onChange:(object:ObjectValue,width?:number)=>void}){
 const cancelEdit=useRef(false),value=placement.object!,[text,setText]=useState(value.type==='text'?value.text:'');
 useEffect(()=>{if(editing&&value.type==='text'){cancelEdit.current=false;setText(value.text);}},[editing]);
 if(value.type==='image'){const item=parseImageLayout(value.html);return item&&item.kind!=='row'?<div className="board-object-image"><ImageItemView onResizePreview={onResizePreview} standalone fullWidth item={item.kind==='single'?resized(item,placement.width,placement.width):item} index={0} inRow={false} path={path} onChange={next=>onChange({...value,html:imageHtml(next)},next.kind==='single'&&next.width.endsWith('px')?parseFloat(next.width):undefined)} onRemove={onDelete} onDuplicate={()=>{}} onRow={()=>{}}/></div>:null;}
 return <div className={'board-object-text shape-'+value.shape} style={{fontSize:value.fontSize??20,color:value.textColor??'var(--text)'}} tabIndex={0} role="group" aria-label={readingText.textObject} onKeyDown={e=>{if(e.key==='Enter'&&!editing&&value.type==='text'&&value.shape!=='none'){e.stopPropagation();onEditing();}}}>
  {value.shape==='diamond'&&<svg className="object-diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1 99,50 50,99 1,50" fill="var(--object-fill,var(--card))" stroke={placement.strokeColor??'var(--border)'} strokeWidth={placement.strokeWidth??1}/></svg>}{(!editing||value.shape==='none')&&<span className={editing?'topic-measure':undefined} aria-hidden={editing||undefined}>{((editing?text:value.text)||topicText.name)+((editing?text:value.text).endsWith('\n')?'\u200b':'')}</span>}{editing&&<textarea autoFocus aria-label={readingText.editWhiteboardText} value={text} onPointerDown={e=>e.stopPropagation()} onChange={e=>setText(e.target.value)} onBlur={()=>{if(cancelEdit.current)return;onDone();if(text!==value.text)onChange({...value,text});}} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();cancelEdit.current=true;setText(value.text);onDone(true);}if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();e.currentTarget.blur();onDone(true);return;}
    if(e.key==='Enter'&&e.altKey){e.preventDefault();const input=e.currentTarget,start=input.selectionStart,end=input.selectionEnd;setText(text.slice(0,start)+'\n'+text.slice(end));requestAnimationFrame(()=>{if(input.isConnected)input.setSelectionRange(start+1,start+1);});return;}
    if((e.key==='Tab'||e.key==='Enter')&&!e.altKey&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey){e.preventDefault();if(e.repeat)return;cancelEdit.current=true;onRelated(e.key==='Tab'?'child':'sibling',{...value,text});}
  }}/>}
 </div>;
}
