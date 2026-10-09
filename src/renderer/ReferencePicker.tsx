import {useEffect,useId,useRef,useState} from 'react';
import type {ReferenceTarget} from '../shared';
import {Icon} from './Icons';
import {ui} from '../text/ui';

export function useReferenceSearch(query:string,cardsOnly=false,exclude:string[]=[],enabled=true){
  const [state,setState]=useState<{query:string;rows:ReferenceTarget[];busy:boolean;error:string}>({query:'',rows:[],busy:true,error:''});
  const signature=JSON.stringify(exclude);
  useEffect(()=>{
    if(!enabled)return;
    let live=true;setState({query,rows:[],busy:true,error:''});
    const timer=setTimeout(()=>{void window.door.request<ReferenceTarget[]>({kind:'queryReferences',text:query,cardsOnly,exclude}).then(rows=>{if(live)setState({query,rows,busy:false,error:''});}).catch(error=>{if(live)setState({query,rows:[],busy:false,error:String(error)});});},100);
    return()=>{live=false;clearTimeout(timer);};
  },[query,cardsOnly,signature,enabled]);
  return state.query===query?state:{query,rows:[],busy:true,error:''};
}
export function ReferenceOptions({rows,index,onIndex,onSelect,create,busy=false,error='',disabled=false,id}:{rows:ReferenceTarget[];index:number;onIndex:(index:number)=>void;onSelect:(target:ReferenceTarget)=>void;create?:{name:string;run:()=>void};busy?:boolean;error?:string;disabled?:boolean;id?:string}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ref.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[index]);
  return <div ref={ref} id={id} className="reference-options" role="listbox" aria-label={ui.references.find} aria-busy={busy}>
    {error?<p role="alert">{error}</p>:busy?<p role="status">{ui.common.loading}</p>:<>{rows.map((target,i)=><button type="button" id={id?`${id}-${i}`:undefined} role="option" aria-selected={i===index} disabled={disabled} key={target.key} onMouseEnter={()=>onIndex(i)} onClick={()=>onSelect(target)}><Icon name={target.kind==='board'?'map':'note'} size={16}/><span>{target.name}<small>{target.path}</small></span></button>)}{!rows.length&&!create&&<p>{ui.references.empty}</p>}{create&&<button type="button" id={id?`${id}-${rows.length}`:undefined} role="option" aria-selected={index===rows.length} disabled={disabled} onMouseEnter={()=>onIndex(rows.length)} onClick={create.run}><Icon name="plus" size={16}/><span>{ui.references.create(create.name)}</span></button>}</>}
  </div>;
}
export function ReferencePicker({onSelect,cardsOnly=false,exclude=[],onCreate,disabled=false,onURL}:{onSelect:(target:ReferenceTarget)=>void;cardsOnly?:boolean;exclude?:string[];onCreate?:(name:string)=>Promise<void>;disabled?:boolean;onURL?:(href:string)=>void}){
  const [query,setQuery]=useState(''),[index,setIndex]=useState(0),[creating,setCreating]=useState(false),[error,setError]=useState(''),id=useId();
  const state=useReferenceSearch(query,cardsOnly,exclude),name=query.trim(),create=name&&!state.busy&&!state.error&&!state.rows.length&&onCreate?{name,run:()=>{setCreating(true);setError('');void onCreate(name).catch(error=>setError(String(error))).finally(()=>setCreating(false));}}:undefined;
  const url=onURL&&/^(https?:|mailto:)/i.test(query)?query:undefined;
  const count=url?1:state.rows.length+(create?1:0),blocked=disabled||creating;
  return <div className="reference-picker"><input className="property-search" role="combobox" aria-label={cardsOnly?ui.references.findCard:ui.references.find} aria-expanded={true} aria-controls={id} aria-activedescendant={count?`${id}-${index}`:undefined} autoComplete="off" placeholder={cardsOnly?ui.references.findCard:ui.references.find} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);setError('');}} onKeyDown={e=>{if(e.nativeEvent.isComposing||blocked)return;if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Enter'){if(url)onURL?.(url);else if(state.rows[index])onSelect(state.rows[index]);else create?.run();}else if(count)setIndex(i=>(i+(e.key==='ArrowDown'?1:-1)+count)%count);}}}/><>{url?<div className="reference-options" role="listbox"><button type="button" role="option" aria-selected={true} onClick={()=>onURL?.(url)}><Icon name="link" size={16}/><span>{url}</span></button></div>:<ReferenceOptions id={id} rows={state.rows} index={index} onIndex={setIndex} onSelect={onSelect} create={create} busy={state.busy||creating} error={error||state.error} disabled={blocked}/>}</></div>;
}
