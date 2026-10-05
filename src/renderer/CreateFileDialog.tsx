import {useLayoutEffect,useRef,useState} from 'react';
import type {Mutation} from '../shared';
import type {Session} from './session';
import {ui} from '../text/ui';
export function CreateFileDialog({folder,type,session,onCreated,onClose}:{folder:string;type:'file'|'folder';session:Session;onCreated:(path:string,type:'file'|'folder')=>void;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),[name,setName]=useState(type==='file'?'untitled.md':'New folder'),[error,setError]=useState(''),[busy,setBusy]=useState(false),title=type==='file'?ui.system.newFile:ui.system.newFolder;
  useLayoutEffect(()=>{const previous=document.activeElement;ref.current!.showModal();ref.current!.querySelector('input')!.select();return()=>{ref.current?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  async function create(){setBusy(true);try{await session.run(async()=>{await session.flush();const result=await session.bridge.request<Mutation&{path:string}>({kind:'createEntry',folder,name:name.trim(),type});if(result.edits.length)session.undoHistory.record(title,result.edits);session.update({snapshot:result.snapshot,error:''});onCreated(result.path,type);});onClose();}catch(e){setError(String(e));setBusy(false);}}
  return <dialog ref={ref} className="template-dialog file-creation-dialog" aria-label={title} onCancel={onClose}><form onSubmit={e=>{e.preventDefault();void create();}}><h2>{title}</h2><label>{type==='file'?ui.system.filename:ui.whiteboard.folderName}<input autoFocus value={name} onChange={e=>setName(e.target.value)}/></label>{type==='file'&&<small className="muted">{ui.system.fileExtension}</small>}{error&&<p role="alert">{error}</p>}<div className="template-actions"><button type="button" onClick={onClose}>{ui.common.cancel}</button><button type="submit" disabled={busy||!name.trim()}>{ui.system.create}</button></div></form></dialog>;
}
