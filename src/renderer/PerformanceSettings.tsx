import {useEffect,useState} from 'react';
import type {AppSettings,GraphicsDiagnostics} from '../shared';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';

export function PerformanceSettings() {
  const [settings,setSettings]=useState<AppSettings>(),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const [diagnostics,setDiagnostics]=useState<GraphicsDiagnostics>(),[loading,setLoading]=useState(false),[diagnosticError,setDiagnosticError]=useState('');
  useEffect(()=>{
    let mounted=true;
    const refresh=()=>{void window.door.appSettings().then(value=>{if(mounted)setSettings(value);}).catch(e=>{if(mounted)setError(String(e));});};
    const unsubscribe=window.door.onAppSettingsChange(refresh);refresh();
    return()=>{mounted=false;unsubscribe();};
  },[]);
  async function change(enabled:boolean) {
    setSaving(true);setError('');
    try {setSettings(await window.door.setHardwareAcceleration(enabled));}
    catch(error){setError(String(error));}
    finally{setSaving(false);}
  }
  async function refreshDiagnostics() {
    setLoading(true);setDiagnosticError('');
    try {setDiagnostics(await window.door.graphicsDiagnostics());}
    catch(error){setDiagnosticError(String(error));}
    finally{setLoading(false);}
  }
  return <>
    <section className="settings-section" aria-label={ui.settings.performance}>
      <h3>{ui.settings.performance}</h3>
      <small>{ui.settings.deviceScope}</small>
      {settings?<>
        <label className="settings-toggle"><span>{ui.settings.hardwareAcceleration}</span><input type="checkbox" role="switch" checked={settings.hardwareAcceleration} disabled={saving} aria-describedby="hardware-acceleration-help" data-tooltip={tooltips.settings.hardwareAcceleration} onChange={e=>{void change(e.target.checked);}}/></label>
        <small id="hardware-acceleration-help">{ui.settings.accelerationHelp}</small>
        {settings.restartRequired&&<p role="status">{ui.settings.restartRequired}</p>}
        {settings.warning&&<p role="alert">{settings.warning}</p>}
      </>:<small>{ui.settings.loading}</small>}
      {error&&<p role="alert">{error}</p>}
    </section>
    <details className="settings-section developer-settings" onToggle={e=>{if(e.currentTarget.open&&!diagnostics&&!loading)void refreshDiagnostics();}}>
      <summary data-tooltip={tooltips.settings.developer}>{ui.developer.title}</summary>
      <section aria-label={ui.developer.graphics}>
        <h3>{ui.developer.graphics}</h3>
        <button disabled={loading} data-tooltip={tooltips.settings.refreshGraphics} onClick={()=>{void refreshDiagnostics();}}>{ui.developer.refresh}</button>
        {loading&&<small role="status">{ui.developer.loading}</small>}
        {diagnostics&&<>
          <dl className="graphics-diagnostics">
            <div><dt>{ui.developer.hardwareAcceleration}</dt><dd>{diagnostics.hardwareAcceleration===null?ui.developer.unavailable:diagnostics.hardwareAcceleration?ui.common.on:ui.common.off}</dd></div>
            <div><dt>{ui.developer.electron}</dt><dd>{diagnostics.electron}</dd></div>
            <div><dt>{ui.developer.chromium}</dt><dd>{diagnostics.chromium}</dd></div>
            {Object.entries(diagnostics.features??{}).map(([name,status])=><div key={name}><dt>{ui.developer.feature(name)}</dt><dd>{status}</dd></div>)}
          </dl>
          {!diagnostics.features&&<small>{ui.developer.pending}</small>}
        </>}
        {diagnosticError&&<p role="alert">{diagnosticError}</p>}
      </section>
    </details>
  </>;
}
