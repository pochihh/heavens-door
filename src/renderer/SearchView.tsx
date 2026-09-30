import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import type { CardResult, Snapshot } from '../shared';
import type { Session } from './session';
import { Icon, Tool } from './Icons';
import { assetPath } from './markdown';
import { ActionMenu, type MenuAction, type MenuState } from './Overlays';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';

function Highlight({text,ranges=[]}:{text:string;ranges?:[number,number][]}) {
  let end=0;
  return <>{ranges.map(([start,finish])=>{const before=text.slice(end,start);end=finish;return <span key={start}>{before}<mark>{text.slice(start,finish)}</mark></span>;})}{text.slice(end)}</>;
}
function SearchResult({card,selected,id,onSelect,onOpen,onContext,session}:{card:CardResult;selected:boolean;id:string;onSelect:()=>void;onOpen:()=>void;onContext:(x:number,y:number)=>void;session:Session}) {
  const [failed,setFailed]=useState(false);
  let image='';try{if(card.previewImage)image=assetPath(card.path,card.previewImage);}catch{/* Malformed external image URLs cannot break search. */}
  const path=card.path.replaceAll('\\','/');
  return <button id={id} role="option" tabIndex={-1} aria-selected={selected} className="search-result" onPointerMove={onSelect} onClick={onOpen} onContextMenu={e=>{e.preventDefault();onSelect();onContext(e.clientX,e.clientY);}}>
    <span className="search-result-heading"><Icon name="note"/><strong><Highlight text={card.name} ranges={card.highlights?.name}/></strong><small>{path.slice(path.lastIndexOf('.'))}</small></span>
    <small className="search-result-path"><Icon name="folder" size={13}/><span><Highlight text={path} ranges={card.highlights?.path}/></span></small>
    <span className="search-result-excerpt"><Highlight text={card.snippet} ranges={card.highlights?.snippet}/></span>
    {image&&!failed&&<img className="search-result-image" src={session.bridge.assetUrl(image)} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>}
  </button>;
}
interface SearchProps {session:Session;snapshot:Snapshot;onReveal:(key:string)=>void;onOpen:(key:string)=>void;onSplit:(key:string)=>void;autofocus?:boolean}
export function SearchView({session,snapshot,onReveal,onOpen,onSplit,autofocus=false}:SearchProps) {
  const [menu,setMenu]=useState<MenuState|null>(null);
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
  const change=(value:string)=>{setMenu(null);setText(value);session.schedulePreferences({navigation:{search:{search:value}}},snapshot.root);};
  const actions=(card:CardResult):MenuAction[]=>[
    {label:ui.search.showOnBoard,icon:'map',hint:tooltips.search.showOnBoard,run:()=>onReveal('card:'+card.id)},
    {label:ui.search.openCard,icon:'note',hint:tooltips.search.openCard,run:()=>onOpen('card:'+card.id)},
    {label:ui.search.openBeside,icon:'splitRight',hint:tooltips.search.openBeside,run:()=>onSplit('card:'+card.id)},
  ];
  const context=(card:CardResult,x:number,y:number)=>setMenu({x,y,label:ui.search.resultActions,actions:actions(card)});
  return <section className="search-view" data-module="search" aria-label={ui.layout.search}>
    <label className="search"><Icon name="search"/><input ref={input} role="combobox" aria-autocomplete="list" aria-expanded={!!results.length} aria-controls={id} aria-activedescendant={results[selected]?id+'-'+selected:undefined} aria-label={ui.explorer.searchCards} placeholder={ui.search.placeholder} value={text} maxLength={2048} onChange={e=>change(e.target.value)} onKeyDown={e=>{
      if(e.nativeEvent.isComposing)return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSelected(i=>Math.max(0,Math.min(results.length-1,i+(e.key==='ArrowDown'?1:-1))));}
      if((e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')&&results[selected]){e.preventDefault();const r=list.current?.querySelector<HTMLElement>('[aria-selected=true]')?.getBoundingClientRect();if(r)context(results[selected],r.left+20,r.top+20);}
      if(e.key==='Enter'&&results[selected]){e.preventDefault();(e.metaKey||e.ctrlKey?onSplit:e.shiftKey?onOpen:onReveal)('card:'+results[selected].id);}
    }}/>{text&&<Tool icon="close" label={tooltips.explorer.clearSearch} onClick={()=>{change('');input.current?.focus();}}/>}</label>
    <div className="search-results-region">
      <div className="search-results" id={id} ref={list} role="listbox" aria-label={ui.explorer.searchResults} aria-busy={busy}>
        {results.map((card,i)=><SearchResult key={card.path+card.revision} card={card} session={session} id={id+'-'+i} selected={i===selected} onSelect={()=>setSelected(i)} onOpen={()=>onReveal('card:'+card.id)} onContext={(x,y)=>context(card,x,y)}/>)}
      </div>
      {busy&&<div className="search-loading" aria-hidden="true"><span className="loading-spinner"/>{ui.search.searching}</div>}
    </div>
    <footer className="search-footer"><div className="search-status" role="status">{error||busy?error||ui.search.searching:text.trim()?results.length?ui.search.count(results.length):ui.search.noResults:ui.search.hint}</div>
      <div className="search-actions" role="group" aria-label={ui.search.resultActions}>
        <Tool icon="map" label={tooltips.search.showOnBoard} disabled={!results[selected]} onClick={()=>onReveal('card:'+results[selected].id)}/>
        <Tool icon="note" label={tooltips.search.openCard} disabled={!results[selected]} onClick={()=>onOpen('card:'+results[selected].id)}/>
        <Tool icon="splitRight" label={tooltips.search.openBeside} disabled={!results[selected]} onClick={()=>onSplit('card:'+results[selected].id)}/>
      </div>
    </footer>
    {menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}

  </section>;
}
export function SearchDialog({session,snapshot,onReveal,onOpen,onSplit,onClose}:SearchProps&{onClose:()=>void}) {
  const ref=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{const previous=document.activeElement;return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
  return <div className="modal-shade search-shade" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} className="search-dialog" role="dialog" aria-modal="true" aria-label={ui.layout.search} onKeyDown={e=>{
    if(e.key==='Escape'){if(e.nativeEvent.isComposing)return;e.preventDefault();e.stopPropagation();onClose();}
    if(e.key==='Tab'){const controls=[...ref.current!.querySelectorAll<HTMLElement>('input,button')].filter(control=>control.tabIndex>=0&&!control.hasAttribute('disabled')),at=controls.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&at===0||!e.shiftKey&&at===controls.length-1){e.preventDefault();controls[e.shiftKey?controls.length-1:0]?.focus();}}
  }}><SearchView session={session} snapshot={snapshot} autofocus onReveal={key=>{onClose();onReveal(key);}} onOpen={key=>{onClose();onOpen(key);}} onSplit={key=>{onClose();onSplit(key);}}/></section></div>;
}
