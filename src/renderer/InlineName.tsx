import { useLayoutEffect, useRef, useState } from 'react';

export function InlineName({name:current,suffix='',tooltip,onRename,onStart}:{name:string;suffix?:string;tooltip:string;onRename?:(stem:string)=>Promise<void>;onStart?:()=>void}) {
  const [editing,setEditing]=useState(false),[name,setName]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const input=useRef<HTMLInputElement>(null),finished=useRef(false);
  useLayoutEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
  useLayoutEffect(()=>{if(error&&!pending)input.current?.focus();},[error,pending]);
  async function commit(){
    if(finished.current||!onRename)return;
    finished.current=true;
    const value=name.trim(),stem=suffix&&value.toLowerCase().endsWith(suffix)?value.slice(0,-suffix.length):value;
    if(stem===current){setEditing(false);return;}
    setPending(true);setError('');
    try{await onRename(stem);setEditing(false);}
    catch(error){setError(String(error));finished.current=false;}
    finally{setPending(false);}
  }
  return <div className="card-filename" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    {editing?<><div className="card-filename-input"><input ref={input} aria-label="Filename" aria-invalid={!!error} value={name} disabled={pending} onChange={e=>{setName(e.target.value);setError('');}}
      onBlur={()=>void commit()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();void commit();}if(e.key==='Escape'){e.preventDefault();finished.current=true;setEditing(false);}}}/><span>{suffix}</span></div>
      {error&&<span className="card-rename-error" role="alert">{error}</span>}</>:
      <button type="button" disabled={!onRename} aria-label={'Rename '+current+suffix} data-tooltip={tooltip} onClick={()=>{onStart?.();finished.current=false;setName(current);setError('');setEditing(true);}}>{current}{suffix}</button>}
  </div>;
}
