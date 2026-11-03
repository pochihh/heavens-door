import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {AppLogoDraft,AppLogoState,IconStyle} from '../shared';
import {iconStyles,platformIconStyle,styledLogo} from '../icon-style';
import {ui} from '../text/ui';
export function AppLogoSettings({children}:{children?:ReactNode}){
 const [logo,setLogo]=useState<AppLogoState>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[importing,setImporting]=useState(false);
 useEffect(()=>{let live=true;const refresh=()=>{void window.door.appLogo().then(value=>{if(live)setLogo(value);}).catch(error=>{if(live)setError(String(error));});};const off=window.door.onAppSettingsChange(refresh);refresh();return()=>{live=false;off();};},[]);
 async function reset(){setBusy(true);setError('');try{setLogo(await window.door.resetAppLogo());}catch(error){setError(String(error));}finally{setBusy(false);}}
 return <div className="app-logo-settings"><div className="app-version-header"><button className="app-logo-button" aria-label={ui.branding.choose} data-tooltip={ui.branding.choose} disabled={busy||!logo} onClick={()=>{setError('');setImporting(true);}}>{logo?.image?<img src={logo.image} alt={logo.custom?ui.branding.custom:ui.branding.default} width="64" height="64"/>:<span>{ui.branding.loading}</span>}</button>{children}</div>
  {(error||logo?.warning)&&<p role="alert">{error||logo?.warning}</p>}
  {importing&&<LogoImport logo={logo} busyReset={busy} onReset={reset} onClose={()=>setImporting(false)} onApply={value=>{setLogo(value);setImporting(false);}}/>}
 </div>;
}
function LogoImport({logo,busyReset,onReset,onClose,onApply}:{logo?:AppLogoState;busyReset:boolean;onReset:()=>Promise<void>;onClose:()=>void;onApply:(logo:AppLogoState)=>void}){
 const ref=useRef<HTMLDialogElement>(null),token=useRef(''),live=useRef(true),[draft,setDraft]=useState<AppLogoDraft>(),[style,setStyle]=useState<IconStyle>(platformIconStyle(window.door.platform)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useLayoutEffect(()=>{const dialog=ref.current!,previous=document.activeElement;dialog.showModal();dialog.querySelector<HTMLButtonElement>('button')?.focus();return()=>{live.current=false;dialog.close();if(token.current)void window.door.cancelAppLogo(token.current).catch(()=>{});if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
 async function choose(){setBusy(true);setError('');try{const value=await window.door.importAppLogo();if(value){if(!live.current){void window.door.cancelAppLogo(value.token);return;}token.current=value.token;setDraft(value);}}catch(error){if(live.current)setError(String(error));}finally{if(live.current)setBusy(false);}}
 async function apply(){if(!draft)return;setBusy(true);setError('');try{const value=await window.door.applyAppLogo(draft.token,style);if(live.current){token.current='';onApply(value);}}catch(error){if(live.current)setError(String(error));}finally{if(live.current)setBusy(false);}}
 const preview=draft?'data:image/svg+xml,'+encodeURIComponent(styledLogo(draft.image,style)):undefined;
 return createPortal(<dialog ref={ref} className="logo-import-dialog" aria-label={ui.branding.importTitle} onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <h2>{ui.branding.importTitle}</h2><p className="muted">{ui.branding.previewHelp}</p>
  <div className="logo-import-body"><div className="logo-import-preview">{preview?<img src={preview} alt={ui.branding.preview} width="192" height="192"/>:logo?.image?<img src={logo.image} alt={ui.branding.default} width="192" height="192"/>:<p>{ui.branding.empty}</p>}</div>
  <div className="logo-import-options">{draft&&<p className="logo-import-filename">{draft.name}</p>}<button disabled={busy} onClick={()=>void choose()}>{ui.branding.pick}</button>
  <p className="muted">{ui.branding.formatsShort}</p><fieldset disabled={busy||!draft} className="logo-style-options"><legend>{ui.branding.style}</legend>{iconStyles.map(value=><label key={value}><input type="radio" name="app-logo-style" value={value} checked={style===value} onChange={()=>setStyle(value)}/>{ui.branding[value]}</label>)}</fieldset>
  </div></div><p className="muted">{ui.branding.scope}</p><p className="muted">{ui.branding.limits}</p><div className="settings-actions"><button disabled={busy||busyReset||!logo?.custom&&!logo?.warning} onClick={()=>void onReset()}>{ui.branding.reset}</button><button disabled={busy} onClick={()=>{void window.door.revealBranding().catch(error=>setError(String(error)));}}>{ui.branding.folder}</button></div>{error&&<p role="alert">{error}</p>}<footer className="dialog-actions"><button disabled={busy} onClick={onClose}>{ui.common.cancel}</button><button className="primary" disabled={busy||!draft} onClick={()=>void apply()}>{ui.branding.apply}</button></footer>
 </dialog>,document.body);
}
