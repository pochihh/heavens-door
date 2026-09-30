import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import type { CardResult, Snapshot } from '../shared';
import type { Session } from './session';
import { Icon, Tool } from './Icons';
import { assetPath } from './markdown';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';

function Highlight({text,ranges=[]}:{text:string;ranges?:[number,number][]}) {
  let end=0;
  return <>{ranges.map(([start,finish])=>{const before=text.slice(end,start);end=finish;return <span key={start}>{before}<mark>{text.slice(start,finish)}</mark></span>;})}{text.slice(end)}</>;
}
function SearchResult({card,selected,id,onSelect,onOpen,session}:{card:CardResult;selected:boolean;id:string;onSelect:()=>void;onOpen:()=>void;session:Session}) {
  const [failed,setFailed]=useState(false);
  let image='';try{if(card.previewImage)image=assetPath(card.path,card.previewImage);}catch{/* Malformed external image URLs cannot break search. */}
  const path=card.path.replaceAll('\\','/');
  return <button id={id} role="option" tabIndex={-1} aria-selected={selected} className="search-result" onPointerMove={onSelect} onClick={onOpen}>
    <span className="search-result-heading"><Icon name="note"/><strong><Highlight text={card.name} ranges={card.highlights?.name}/></strong><small>{path.slice(path.lastIndexOf('.'))}</small></span>
    <small className="search-result-path"><Icon name="folder" size={13}/><span><Highlight text={path} ranges={card.highlights?.path}/></span></small>
    <span className="search-result-excerpt"><Highlight text={card.snippet} ranges={card.highlights?.snippet}/></span>
    {image&&!failed&&<img className="search-result-image" src={session.bridge.assetUrl(image)} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>}
  </button>;
}
export function SearchView({session,snapshot,onOpen,onSplit,autofocus=false}:{session:Session;snapshot:Snapshot;onOpen:(key:string)=>void;onSplit:(key:string)=>void;autofocus?:boolean}) {
  const [text,setText]=useState(snapshot.preferences?.navigation?.search?.search??''),[results,setResults]=useState<CardResult[]>([]),[selected,setSelected]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null),id=useId();
  useEffect(()=>{if(autofocus)input.current?.focus();},[autofocus]);
  useEffect(()=>{
    let live=true;
    setResults([]);setSelected(0);setError('');setBusy(!!text.trim());
    const timer=setTimeout(()=>{if(!text.trim())return;
      void session.bridge.request<CardResult[]>({kind:'queryCards',query:text.startsWith('backlinks:')?{backlinksTo:text.slice(10),limit:100}:{text,limit:100}}).then(rows=>{if(live){setResults(rows);setBusy(false);}}).catch(e=>{if(live){setError(String(e));setBusy(false);}});
    },120);
    return()=>{live=false;clearTimeout(timer);};
  },[text,snapshot.cards,session]);
  useEffect(()=>{list.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView?.({block:'nearest'});},[selected]);
  const change=(value:string)=>{setText(value);session.schedulePreferences({navigation:{search:{search:value}}},snapshot.root);};
  return <section className="search-view" data-module="search" aria-label={ui.layout.search}>
    <label className="search"><Icon name="search"/><input ref={input} role="combobox" aria-autocomplete="list" aria-expanded={!!results.length} aria-controls={id} aria-activedescendant={results[selected]?id+'-'+selected:undefined} aria-label={ui.explorer.searchCards} placeholder={ui.search.placeholder} value={text} maxLength={2048} onChange={e=>change(e.target.value)} onKeyDown={e=>{
      if(e.nativeEvent.isComposing)return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSelected(i=>Math.max(0,Math.min(results.length-1,i+(e.key==='ArrowDown'?1:-1))));}
      if(e.key==='Enter'&&results[selected]){e.preventDefault();(e.metaKey||e.ctrlKey?onSplit:onOpen)('card:'+results[selected].id);}
    }}/>{text&&<Tool icon="close" label={tooltips.explorer.clearSearch} onClick={()=>{change('');input.current?.focus();}}/>}</label>
    <div className="search-results-region">
      <div className="search-results" id={id} ref={list} role="listbox" aria-label={ui.explorer.searchResults} aria-busy={busy}>
        {results.map((card,i)=><SearchResult key={card.path+card.revision} card={card} session={session} id={id+'-'+i} selected={i===selected} onSelect={()=>setSelected(i)} onOpen={()=>onOpen('card:'+card.id)}/>)}
      </div>
      {busy&&<div className="search-loading" aria-hidden="true"><span className="loading-spinner"/>{ui.search.searching}</div>}
    </div>
    <footer className="search-footer"><div className="search-status" role="status"><span>{ui.search.scope}</span><span>{error||busy?error||ui.search.searching:text.trim()?results.length?ui.search.count(results.length):ui.search.noResults:ui.search.hint}</span></div>
      {autofocus&&<div className="search-shortcuts"><span><kbd>↑ ↓</kbd>{ui.search.navigate}</span><span><kbd>↵</kbd>{ui.search.open}</span><span><kbd>{session.bridge.platform==='darwin'?'⌘':ui.search.control} ↵</kbd>{ui.search.openBeside}</span><span><kbd>{ui.search.escape}</kbd>{ui.search.close}</span></div>}
    </footer>
  </section>;
}
export function SearchDialog({session,snapshot,onOpen,onSplit,onClose}:{session:Session;snapshot:Snapshot;onOpen:(key:string)=>void;onSplit:(key:string)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{const previous=document.activeElement;return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
  return <div className="modal-shade search-shade" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="search-dialog" role="dialog" aria-modal="true" aria-label={ui.layout.search} onKeyDown={e=>{
    if(e.key==='Escape'){if(e.nativeEvent.isComposing)return;e.preventDefault();e.stopPropagation();onClose();}
    if(e.key==='Tab'){const controls=[...ref.current!.querySelectorAll<HTMLElement>('input,button')].filter(control=>control.tabIndex>=0&&!control.hasAttribute('disabled')),at=controls.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&at===0||!e.shiftKey&&at===controls.length-1){e.preventDefault();controls[e.shiftKey?controls.length-1:0]?.focus();}}
  }}><SearchView session={session} snapshot={snapshot} autofocus onOpen={key=>{onClose();onOpen(key);}} onSplit={key=>{onClose();onSplit(key);}}/></section></div>;
}
