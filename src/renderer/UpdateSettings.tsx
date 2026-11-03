import {APP_NAME,TEST_BUILD} from '../identity';
import {useEffect,useState} from 'react';
import type {UpdateState} from '../shared';
import {ui} from '../text/ui';
import {AppLogoSettings} from './AppLogoSettings';
import {SettingsGroup} from './SettingsGroup';

export function UpdateSettings(){
 const [state,setState]=useState<UpdateState>(),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{let mounted=true;const accept=(value:UpdateState)=>{if(mounted)setState(value);};const stop=window.door.onUpdateChange(accept);void window.door.updateState().then(accept).catch(error=>{if(mounted)setError(String(error));});return()=>{mounted=false;stop();};},[]);
 const run=async(action:()=>Promise<unknown>)=>{setError('');setSaving(true);try{await action();}catch(error){setError(String(error));}finally{setSaving(false);}};
 const status=state?.status,manual=!!state&&!state.canInstall&&!TEST_BUILD,ready=!TEST_BUILD&&status==='ready',available=!TEST_BUILD&&status==='available'&&!manual;
 const title=TEST_BUILD?ui.updates.testTitle:manual&&status==='available'?ui.updates.manualTitle:status==='available'?ui.updates.available(state!.version!):status==='up-to-date'?ui.updates.currentTitle:status==='idle'?ui.updates.idleTitle:status==='error'?ui.updates.errorTitle:state?ui.updates.status[state.status]:ui.updates.loading;
 const help=TEST_BUILD?ui.updates.testHelp:manual?(status==='available'?ui.updates.available(state!.version!)+' ':'')+ui.updates.manualHelp:state?ui.updates.stateHelp[state.status]:ui.updates.loading;
 return <SettingsGroup title={ui.updates.title} scope={ui.settings.computerScope} className="settings-updates" data-update-status={TEST_BUILD?'test':manual&&status==='available'?'manual':status??'loading'}>
  <AppLogoSettings><div className="app-version-label"><strong>{APP_NAME}</strong><span>{state?ui.updates.version(state.currentVersion):ui.updates.loading}</span><small>{ui.settings.deviceScope}</small></div></AppLogoSettings>

  <div className="update-status"><div className="update-status-copy" role="status"><strong>{title}</strong><p className="muted">{help}</p></div>
   {!TEST_BUILD&&status==='downloading'&&<div className="update-progress"><progress max={100} value={state?.progress??0} aria-label={ui.updates.downloading}/><span>{Math.round(state?.progress??0)}%</span></div>}
   {state?.message&&<p role={status==='error'||status==='ready'?'alert':'status'}>{state.message}</p>}
   <div className="settings-actions app-update-actions">
    {ready&&<button className="primary" disabled={saving} onClick={()=>void run(()=>window.door.installUpdate())}>{ui.updates.install}</button>}
    {available&&<button className="primary" disabled={saving} onClick={()=>void run(async()=>setState(await window.door.downloadUpdate()))}>{ui.updates.download}</button>}
    {manual&&status==='available'&&<button className="primary" disabled={saving} onClick={()=>void run(()=>window.door.openDownloadPage())}>{ui.updates.installer}</button>}
    {!ready&&<button disabled={TEST_BUILD||!state||saving||['checking','downloading','installing'].includes(state.status)} onClick={()=>void run(async()=>setState(await window.door.checkUpdates()))}>{ui.updates.check}</button>}
   </div>
  </div>
  <div className="app-update-policy"><label className="settings-toggle"><span>{ui.updates.automaticDownloads}</span><input type="checkbox" role="switch" disabled={!state||saving} checked={state?.automaticDownloads!==false} onChange={e=>{const enabled=e.target.checked;void run(async()=>setState(await window.door.setAutomaticDownloads(enabled)));}}/></label><p className="muted">{TEST_BUILD?ui.updates.testAutomaticHelp:manual?ui.updates.manualAutomaticHelp:ui.updates.automaticHelp}</p></div>
  <footer className="app-update-footer"><button className="settings-link" onClick={()=>void run(()=>window.door.openDownloadPage())}>{ui.updates.releases}</button><small>{ui.updates.preferences}</small></footer>{error&&<p role="alert">{error}</p>}
 </SettingsGroup>;
}
