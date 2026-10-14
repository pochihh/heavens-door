import {ui} from '../text/ui';
import {useState} from 'react';
import {KEY_COMMANDS,binding,recordBinding,validateKeybindings,type Keybindings} from '../keybindings';
export function KeyboardSettings({value,onChange}:{value?:Keybindings;onChange:(value:Keybindings)=>void}){
  const [query,setQuery]=useState(''),[error,setError]=useState('');
  const apply=(next:Keybindings)=>{try{validateKeybindings(next);setError('');onChange(next);}catch(e){setError((e as Error).message);}};
  return <><input aria-label={ui.keyboard.find} placeholder={ui.keyboard.search} value={query} onChange={e=>setQuery(e.target.value)}/><p className="muted">{ui.keyboard.help}</p>{error&&<p role="alert">{error}</p>}{KEY_COMMANDS.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).map(c=><div className="setting-row" key={c.id}><div><label>{c.name}</label><p>{c.scope}</p></div><div className="keyboard-binding"><input data-shortcut-record aria-label={c.name+' shortcut'} readOnly value={binding(c.id,value).replaceAll('Mod-',window.door.platform==='darwin'?'⌘ ':'Ctrl ').replaceAll('Shift-','⇧ ').replaceAll('Ctrl-','Ctrl ').replaceAll('Alt-','Alt ')||'Disabled'} onKeyDown={e=>{e.preventDefault();e.stopPropagation();if(e.nativeEvent.isComposing)return;const key=recordBinding(e.nativeEvent,window.door.platform);if(key)apply({...value,[c.id]:key});}}/><button onClick={()=>apply({...value,[c.id]:''})}>{ui.keyboard.clear}</button><button onClick={()=>{const next={...value};delete next[c.id];apply(next);}}>{ui.keyboard.reset}</button></div></div>)}</>;
}
