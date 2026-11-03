import {ui} from '../text/ui';
import {SettingsGroup} from './SettingsGroup';
import {useEffect,useState} from 'react';
import type {Preferences} from '../shared';

export function useWorkspaceAppearance(root:string|undefined,prefs:Preferences){
 useEffect(()=>{const style=document.documentElement.style;if(prefs.accentColor)style.setProperty('--accent',prefs.accentColor);else style.removeProperty('--accent');return()=>{style.removeProperty('--accent');};},[prefs.accentColor]);
 const enabled=JSON.stringify(prefs.cssSnippets??[]);
 useEffect(()=>{
  if(!root||!(JSON.parse(enabled) as string[]).length)return;let live=true,revision=0;const styles:HTMLStyleElement[]=[];
  const refresh=async()=>{const current=++revision;try{const snippets=await window.door.cssSnippets();if(!live||current!==revision)return;styles.splice(0).forEach(style=>style.remove());for(const name of JSON.parse(enabled) as string[]){const item=snippets.find(item=>item.name===name);if(!item||item.error)continue;const style=document.createElement('style');style.dataset.cssSnippet=name;style.textContent=item.css;document.head.append(style);styles.push(style);}}catch(error){console.error('Could not load CSS snippets',error);}};
  void refresh();const off=window.door.onCssSnippetsChange(()=>void refresh());return()=>{live=false;off();styles.forEach(style=>style.remove());};
 },[root,enabled]);
}
export function CssSnippetSettings({enabled=[],onChange}:{enabled?:string[];onChange:(names:string[])=>void}){
 const [files,setFiles]=useState<Awaited<ReturnType<typeof window.door.cssSnippets>>>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;const refresh=()=>{void window.door.cssSnippets().then(value=>{if(live)setFiles(value);}).catch(error=>{if(live)setError(String(error));});};refresh();const off=window.door.onCssSnippetsChange(refresh);return()=>{live=false;off();};},[]);
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();setFiles(await window.door.cssSnippets());}catch(error){setError(String(error));}finally{setBusy(false);}};
 const names=[...new Set([...files.map(file=>file.name),...enabled])];
 return <SettingsGroup title={ui.snippets.title} scope={ui.settings.workspaceScope}><p className="muted">{ui.snippets.help}</p><div className="settings-actions"><button disabled={busy} onClick={()=>void run(()=>window.door.importCssSnippets())}>{ui.snippets.import}</button><button disabled={busy} onClick={()=>void run(()=>window.door.cssSnippets(true))}>{ui.snippets.reload}</button><button disabled={busy} onClick={()=>void run(()=>window.door.revealCssSnippets())}>{ui.snippets.folder}</button></div>
  {!names.length&&<p className="muted">{ui.snippets.empty}</p>}{names.map(name=>{const file=files.find(file=>file.name===name),problem=file?.error??(!file?ui.snippets.missing:undefined);return <div key={name} className="snippet-setting"><label className="settings-toggle"><span>{name}</span><input type="checkbox" role="switch" aria-label={ui.snippets.enable(name)} checked={enabled.includes(name)} disabled={!enabled.includes(name)&&!!problem} onChange={e=>onChange(e.target.checked?[...enabled,name]:enabled.filter(item=>item!==name))}/></label>{problem&&<small role="alert">{problem}</small>}</div>;})}{error&&<p role="alert">{error}</p>}
 </SettingsGroup>;
}
