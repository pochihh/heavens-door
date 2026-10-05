import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {TextSearch} from '../core/search';
import {DEFAULT_TEMPLATES} from '../journal';
import {DEFAULT_CARD_FOLDER} from '../shared';
import type {Snapshot} from '../shared';
import type {Session} from './session';
import {Icon,Tool} from './Icons';
import {ui} from '../text/ui';
const text=ui.journal;
export function TemplateDialog({snapshot,session,onOpen,onClose,initialTemplate}:{initialTemplate?:string;snapshot:Snapshot;session:Session;onOpen:(key:string)=>void;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),[query,setQuery]=useState(''),[chosen,setChosen]=useState(initialTemplate??''),[stem,setStem]=useState(''),[folder,setFolder]=useState(snapshot.preferences?.cardFolder??DEFAULT_CARD_FOLDER),[busy,setBusy]=useState(false),[error,setError]=useState(''),root=(snapshot.preferences?.templates??DEFAULT_TEMPLATES).folder;
  const templates=useMemo(()=>snapshot.cards.filter(c=>c.path.startsWith(root+'/')),[snapshot.cards,root]),index=useMemo(()=>{const engine=new TextSearch();templates.forEach(c=>engine.update({...c,body:''}));return engine;},[templates]);
  const shown=query?index.search(query).map(hit=>templates.find(c=>c.path===hit.path)!):templates;
  useLayoutEffect(()=>{const previous=document.activeElement;ref.current?.showModal();return()=>{ref.current?.close();if(previous instanceof HTMLElement)previous.focus();};},[]);
  useEffect(()=>{if(!shown.some(card=>card.path===chosen))setChosen(shown[0]?.path??'');},[shown,chosen]);
  const perform=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await action();}catch(e){setError(String(e));}finally{setBusy(false);}};
  return <dialog ref={ref} className="template-dialog" aria-label={text.newFromTemplate} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div className="panel-title"><strong>{text.newFromTemplate}</strong><Tool icon="close" label={text.close} disabled={busy} onClick={onClose}/></div>
    <form onSubmit={e=>{e.preventDefault();void perform(async()=>{const card=await session.createFromTemplate(chosen,folder,stem);onOpen('card:'+card.id);onClose();});}}>
      <input aria-label={text.searchTemplates} placeholder={text.searchTemplates} autoFocus value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="template-list" role="listbox" aria-label={text.templates} onKeyDown={e=>{if(!['ArrowUp','ArrowDown'].includes(e.key)||!shown.length)return;e.preventDefault();const index=shown.findIndex(c=>c.path===chosen),next=(index+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;setChosen(shown[next].path);e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();}}>{shown.map(card=><button type="button" role="option" aria-selected={chosen===card.path} key={card.id} onClick={()=>setChosen(card.path)}><Icon name="note"/><span>{card.name}</span><small>{card.path}</small></button>)}{!shown.length&&<p className="muted">{templates.length?text.noMatches:text.noTemplates}</p>}</div>
      <div className="template-actions"><button type="button" disabled={busy} onClick={()=>void perform(async()=>{const card=await session.createTemplate();onOpen('card:'+card.id);onClose();})}><Icon name="plus"/>{text.newTemplate}</button><button type="button" disabled={!chosen||busy} onClick={()=>{const card=templates.find(c=>c.path===chosen);if(card){onOpen('card:'+card.id);onClose();}}}>{text.editTemplate}</button></div>
      <label>{text.filename}<input required value={stem} placeholder={snapshot.preferences?.stem} onChange={e=>setStem(e.target.value)}/></label>
      <label>{text.folder}<input required list="template-folders" value={folder} onChange={e=>setFolder(e.target.value)}/></label><datalist id="template-folders">{snapshot.folders?.filter(Boolean).map(path=><option key={path} value={path}/>)}</datalist>
      {error&&<p role="alert">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{text.cancel}</button><button className="primary" disabled={busy||!chosen||!stem.trim()}>{text.create}</button></div>
    </form>
  </dialog>;
}
