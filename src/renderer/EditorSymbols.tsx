import {ui} from '../text/ui';
import {useEffect,useMemo,useRef,useState} from 'react';
import {TextSearch} from '../core/search';
import {MATH_SYMBOLS} from './symbol-data';
export function EditorSymbols({onSelect}:{onSelect:(text:string)=>void}){
  const [tab,setTab]=useState('symbols'),[query,setQuery]=useState(''),ref=useRef<HTMLDivElement>(null),callback=useRef(onSelect);callback.current=onSelect;
  const search=useMemo(()=>{const engine=new TextSearch();MATH_SYMBOLS.forEach(s=>engine.update({path:s.char,name:s.name,title:s.name,body:s.keywords.join(' ')}));return engine;},[]);
  useEffect(()=>{if(tab!=='emoji')return;let live=true,picker:HTMLElement|undefined;void Promise.all([import('emoji-mart'),import('@emoji-mart/data')]).then(([{Picker},{default:data}])=>{if(!live)return;picker=new Picker({data,set:'native',theme:document.documentElement.dataset.theme??'auto',previewPosition:'none',maxFrequentRows:0,perLine:8,onEmojiSelect:(e:{native:string})=>callback.current(e.native)}) as unknown as HTMLElement;ref.current!.append(picker as unknown as Node);});return()=>{live=false;picker?.remove();};},[tab]);
  const matches=query?new Set(search.search(query).map(h=>h.path)):null;
  return <div className="editor-symbols"><div role="tablist"><button role="tab" aria-selected={tab==='symbols'} onClick={()=>setTab('symbols')}>{ui.editorTools.symbols}</button><button role="tab" aria-selected={tab==='emoji'} onClick={()=>setTab('emoji')}>{ui.editorTools.emoji}</button></div>{tab==='symbols'?<><input autoFocus aria-label={ui.editorTools.searchSymbols} value={query} placeholder={ui.editorTools.searchSymbolsLabel} onChange={e=>setQuery(e.target.value)}/><div className="symbol-grid">{MATH_SYMBOLS.filter(s=>!matches||matches.has(s.char)).map(s=><button key={s.char} aria-label={s.name} data-tooltip={s.name} onClick={()=>onSelect(s.char)}>{s.char}</button>)}</div></>:<div ref={ref}/>}</div>;
}
