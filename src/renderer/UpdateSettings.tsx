import {useEffect,useState} from 'react';
import type {UpdateState} from '../shared';
import {ui} from '../text/ui';

export function UpdateSettings(){
  const [state,setState]=useState<UpdateState>(),[error,setError]=useState('');
  useEffect(()=>{let mounted=true;const accept=(value:UpdateState)=>{if(mounted)setState(value);};const stop=window.door.onUpdateChange(accept);void window.door.updateState().then(accept).catch(error=>{if(mounted)setError(String(error));});return()=>{mounted=false;stop();};},[]);
  const run=async(action:()=>Promise<unknown>)=>{setError('');try{await action();}catch(error){setError(String(error));}};
  return <section className="settings-section" aria-label={ui.updates.title}>
    <h3>{ui.common.appName}</h3>
    {state?<>
      <p>{ui.updates.version(state.currentVersion)}</p>
      <p role="status">{state.status==='available'?ui.updates.available(state.version!):ui.updates.status[state.status]}</p>
      {state.status==='downloading'&&<progress max={100} value={state.progress??0} aria-label={ui.updates.downloading}/>}
      {!state.canInstall&&<small>{ui.updates.manualHelp}</small>}
      {state.message&&<p role={state.status==='error'?'alert':'status'}>{state.message}</p>}
      <div className="settings-section">
        {!['ready','installing'].includes(state.status)&&<button disabled={['checking','downloading'].includes(state.status)} onClick={()=>void run(()=>window.door.checkUpdates())}>{ui.updates.check}</button>}
        {state.status==='available'&&state.canInstall&&<button onClick={()=>void run(()=>window.door.downloadUpdate())}>{ui.updates.download}</button>}
        {state.status==='ready'&&<button onClick={()=>void run(()=>window.door.installUpdate())}>{ui.updates.install}</button>}
        <button onClick={()=>void run(()=>window.door.openDownloadPage())}>{ui.updates.website}</button>
      </div>
    </>:<small>{ui.updates.loading}</small>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
