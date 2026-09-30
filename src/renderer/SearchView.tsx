import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import type { CardResult, Snapshot } from '../shared';
import type { Session } from './session';
import { Icon, Tool } from './Icons';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';

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
    <div className="search-results" id={id} ref={list} role="listbox" aria-label={ui.explorer.searchResults} aria-busy={busy}>
      {results.map((card,i)=><button key={card.path} id={id+'-'+i} role="option" tabIndex={-1} aria-selected={i===selected} className="search-result" data-tooltip={tooltips.files.open(card.path)} onPointerMove={()=>setSelected(i)} onClick={()=>onOpen('card:'+card.id)}>
        <strong><Icon name="note"/>{card.title||card.name}</strong><small>{card.path}</small><span>{card.snippet}</span>
      </button>)}
    </div>
    <div className="search-status" role="status">{error||busy?error||ui.search.searching:text.trim()?results.length?ui.search.count(results.length):ui.search.noResults:ui.search.hint}</div>
  </section>;
}
export function SearchDialog({session,snapshot,onOpen,onSplit,onClose}:{session:Session;snapshot:Snapshot;onOpen:(key:string)=>void;onSplit:(key:string)=>void;onClose:()=>void}) {
  const ref=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{const previous=document.activeElement;return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
  return <div className="modal-shade" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="search-dialog" role="dialog" aria-modal="true" aria-label={ui.layout.search} onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
    if(e.key==='Tab'){const controls=[...ref.current!.querySelectorAll<HTMLElement>('input,button')].filter(control=>control.tabIndex>=0&&!control.hasAttribute('disabled')),at=controls.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&at===0||!e.shiftKey&&at===controls.length-1){e.preventDefault();controls[e.shiftKey?controls.length-1:0]?.focus();}}
  }}><SearchView session={session} snapshot={snapshot} autofocus onOpen={key=>{onClose();onOpen(key);}} onSplit={key=>{onClose();onSplit(key);}}/></section></div>;
}
