import { ui } from '../text/ui';
import { Component, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from './session';

function Recovery({error,session}:{error:Error;session:Session}) {
  const {draft,error:saveError,status}=useSyncExternalStore(session.subscribe,session.getState);
  return <main className="recovery"><h1>{ui.recovery.title}</h1>
    <p>{ui.recovery.saveBeforeReload}</p>
    <pre>{error.message}</pre><p role="status">{saveError || status}</p>
    {draft?.dirty && <><p>{ui.recovery.unsavedDraft(draft.card.path)}</p><textarea aria-label={ui.recovery.recoverableDraft} readOnly value={draft.body}/><button onClick={() => {void session.copyDraft();}}>{ui.common.copyDraft}</button></>}
    <button className="primary" onClick={() => session.bridge.reload()}>{ui.common.reload}</button>
  </main>;
}
export class AppBoundary extends Component<{children:ReactNode;session:Session},{error:Error|null}> {
  state:{error:Error|null}={error:null};
  static getDerivedStateFromError(error:Error) {return {error};}
  render() {return this.state.error ? <Recovery error={this.state.error} session={this.props.session}/> : this.props.children;}
}
