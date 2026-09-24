import { Component, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from './session';

function Recovery({error,session}:{error:Error;session:Session}) {
  const {draft,error:saveError,status}=useSyncExternalStore(session.subscribe,session.getState);
  return <main className="recovery"><h1>The editor encountered a problem.</h1>
    <p>Your saved notes remain on disk. Reload will first try to save the current draft.</p>
    <pre>{error.message}</pre><p role="status">{saveError || status}</p>
    {draft?.dirty && <><p>Unsaved draft: {draft.card.path}</p><textarea aria-label="Recoverable draft" readOnly value={draft.body}/><button onClick={() => {void session.copyDraft();}}>Copy draft</button></>}
    <button className="primary" onClick={() => session.bridge.reload()}>Reload</button>
  </main>;
}
export class AppBoundary extends Component<{children:ReactNode;session:Session},{error:Error|null}> {
  state:{error:Error|null}={error:null};
  static getDerivedStateFromError(error:Error) {return {error};}
  render() {return this.state.error ? <Recovery error={this.state.error} session={this.props.session}/> : this.props.children;}
}
