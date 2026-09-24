import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Session } from './session';
import { Whiteboard } from './Board';
import { CardEditor } from './Editor';
import type { Board } from '../shared';

const session=new Session(window.door);
const attempt=(promise:Promise<unknown>) => { void promise.catch(() => undefined); };
export function App() {
  const state=useSyncExternalStore(session.subscribe,session.getState);
  const {snapshot,draft}=state;
  const [boardPath,setBoardPath]=useState('');
  const [mode,setMode]=useState<'board'|'files'>('board');
  const [showHistory,setShowHistory]=useState(false);
  const [settings,setSettings]=useState(false);
  const [stem,setStem]=useState(localStorage.getItem('new-card-stem') || 'untitled');
  const [search,setSearch]=useState('');
  const [matches,setMatches]=useState<string[]|null>(null);
  const [backlinks,setBacklinks]=useState<string[]>([]);
  const board=snapshot?.boards.find(b => b.path === boardPath) ?? snapshot?.boards[0];
  useEffect(() => {
    const remove=window.door.onChange(() => { if (session.state.snapshot) attempt(session.refresh()); });
    const close=window.door.onClosing(() => attempt(session.run(async () => { await session.flush(); window.door.finishClosing(); })));
    const keyboard=(event:KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.isComposing) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); attempt(session.checkpoint()); }
      if (event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement && event.target.type !== 'checkbox')) { event.preventDefault(); attempt(session.undo(event.shiftKey)); }
    };
    window.addEventListener('keydown',keyboard,true);
    return () => { remove(); close(); session.dispose(); window.removeEventListener('keydown',keyboard,true); };
  },[]);
  useEffect(() => {
    if (!snapshot) return;
    let live=true;
    if (!search.trim()) { setMatches(null); return; }
    const timer=setTimeout(() => { void window.door.request<{path:string}[]>({kind:'query',text:search}).then(rows => { if (live) setMatches(rows.map(r => r.path)); }); },120);
    return () => { live=false; clearTimeout(timer); };
  },[search,snapshot]);
  useEffect(() => {
    let live=true;
    if (!draft) { setBacklinks([]); return; }
    void window.door.request<{path:string}[]>({kind:'query',text:`backlinks:${draft.card.id}`}).then(rows => { if (live) setBacklinks(rows.map(r => r.path)); });
    return () => { live=false; };
  },[draft?.card.id,snapshot]);
  const files=useMemo(() => snapshot?.cards.filter(c => matches === null || matches.includes(c.path)) ?? [],[snapshot,matches]);
  const openCard=useCallback((path:string) => attempt(session.select(path)),[]);
  const saveBoard=useCallback((board:Board,label:string) => attempt(session.board(board,label)),[]);
  const create=useCallback((x?:number,y?:number) => attempt(session.create(board?.folder ?? '',stem,x ?? (board?.cards.at(-1)?.x ?? -280)+380,y ?? board?.cards.at(-1)?.y ?? 100)),[board,stem]);
  const emptyBoard: Board=useMemo(() => ({path:'',folder:'',name:snapshot?.name ?? '',revision:'',cards:[],edges:[]}),[snapshot?.name]);
  return <div className="app">
    {snapshot ? <>
      <aside className="sidebar">
        <div className="brand"><span className="door-mark">H</span><div>Heaven’s Door<small>Your ideas, connected.</small></div></div>
        <button className="workspace-button" title={snapshot.root} onClick={() => attempt(session.open(false))}><span>▧</span><b>{snapshot.name}</b><span>⌄</span></button>
        <label className="search"><span>⌕</span><input aria-label="Search cards" placeholder="Search your cards" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌕</kbd></label>
        <div className="nav-buttons"><button className={mode === 'board' ? 'active' : ''} onClick={() => setMode('board')}>▦ <span>Whiteboards</span><small>{snapshot.boards.length}</small></button><button className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')}>▱ <span>All cards</span><small>{snapshot.cards.length}</small></button><button className={showHistory ? 'active' : ''} onClick={() => { setShowHistory(!showHistory); attempt(session.history()); }}>◷ <span>History</span></button></div>
        <div className="section-label">WHITEBOARDS <span>⌄</span></div>
        <div className="board-list">{snapshot.boards.map(b => <button className={board?.path === b.path && mode === 'board' ? 'current' : ''} key={b.path} onClick={() => { setBoardPath(b.path); setMode('board'); }}>▦ <span>{b.folder || b.name}</span></button>)}</div>
        <div className="section-label">{search ? 'SEARCH RESULTS' : 'CARDS'} <span>{files.length}</span></div>
        <div className="file-list">{files.slice(0,150).map(card => <button key={card.path} title={card.path} className={draft?.card.path === card.path ? 'current' : ''} onClick={() => openCard(card.path)}><span>▤</span><span>{card.path.replaceAll('\\','/').split('/').at(-1)}</span></button>)}{files.length>150 && <p className="small muted">Search to find more cards.</p>}</div>
        <div className="sidebar-bottom"><button onClick={() => setSettings(!settings)}>⚙ <span>Workspace settings</span></button><small><i className="local-dot"/> Local files · Yours to keep</small></div>
      </aside>
      <main className="workspace">
        <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> {mode === 'board' ? 'Whiteboards' : 'Cards'}</div><div className="top-actions"><span className="save-state"><i className="local-dot"/>{state.status}</span><button title="Undo (⌘Z / Ctrl+Z)" onClick={() => attempt(session.undo())} disabled={!session.undoHistory.past.length && !draft?.dirty}>↶</button><button title="Redo (⇧⌘Z / Ctrl+Shift+Z)" onClick={() => attempt(session.undo(true))} disabled={!session.undoHistory.future.length}>↷</button></div></header>
        <div className="workspace-heading"><div><div className="eyebrow">{mode === 'board' ? 'A SPACE TO THINK' : 'YOUR MARKDOWN LIBRARY'}</div><h1>{mode === 'board' ? board?.name ?? snapshot.name : 'All cards'}</h1></div><button className="primary" onClick={() => create()}>+ New card</button></div>
        <div className="content-row">
          {mode === 'board' ? <Whiteboard key={board?.path || 'empty'} board={board ?? emptyBoard} cards={snapshot.cards} onSave={saveBoard} onOpen={openCard} onCreate={create}/> : <div className="library">{files.slice(0,200).map(card => <button key={card.path} className="library-card" onClick={() => openCard(card.path)}><span>▤</span><strong>{card.name}</strong><small>{card.path}</small></button>)}{!files.length && <p>No cards yet. Start with a small idea.</p>}</div>}
          {draft && <aside className="editor-pane"><div className="pane-header"><div><small>CARD</small><strong title={draft.card.path}>{draft.card.path}</strong></div><button title="Close editor" onClick={() => attempt(session.select(null))}>×</button></div><CardEditor path={draft.card.path} body={draft.body} cards={snapshot.cards} onEdit={body => session.edit(body)}/><div className="backlinks"><span className="section-label">LINKED FROM · {backlinks.length}</span>{backlinks.map(path => <button key={path} onClick={() => openCard(path)}>↗ {path}</button>)}{board && !board.cards.some(p => p.cardId === draft.card.id) && <button disabled={draft.card.legacy} title={draft.card.legacy ? 'Edit this imported card once to give it a persistent identity' : 'Place a reference on this board'} onClick={() => saveBoard({...board,cards:[...board.cards,{id:crypto.randomUUID(),cardId:draft.card.id,x:120,y:120,width:340,height:280}]},'Place card reference')}>+ Place on this whiteboard</button>}</div></aside>}
        </div>
      </main>
      {showHistory && <aside className="history-pane"><div className="pane-header"><div><small>WORKSPACE</small><strong>History</strong></div><button onClick={() => setShowHistory(false)}>×</button></div><p className="history-hint">Return to a checkpoint. Later versions stay here; new edits start a branch.</p><button className="checkpoint-button" disabled={!snapshot.historyAvailable} onClick={() => attempt(session.checkpoint())}>+ Save checkpoint <kbd>⌘S</kbd></button>{!snapshot.historyAvailable && <p className="notice">This folder already belongs to a Git repository. Automatic history stays disabled to preserve its staging and branches.</p>}<div className="history-list">{state.checkpoints.map(item => <button key={item.id} className={`checkpoint ${item.active ? 'active' : ''}`} onClick={() => !item.active && attempt(session.restore(item.id))}><span className="history-dot"/><strong>{item.label}</strong><time>{new Date(item.time).toLocaleString()}</time><small>{item.id.slice(0,7)} {item.parents.length>0 ? `← ${item.parents.map(p => p.slice(0,7)).join(', ')}` : '· Start'} {item.active && '· You are here'}</small></button>)}{!state.checkpoints.length && <p className="muted small">Save a checkpoint to start your timeline.</p>}</div></aside>}
    </> : <main className="welcome"><span className="door-mark large">H</span><div className="eyebrow">HEAVEN’S DOOR</div><h1>Make room<br/>for your next idea.</h1><p>A quiet place for connected thoughts.<br/>Your cards. Your whiteboards. Your local files.</p><div><button className="primary" onClick={() => attempt(session.open(false))}>Open a notes folder ↗</button><button onClick={() => attempt(session.open(true))}>Try a sample workspace</button></div><small>{state.status} · Early desktop preview</small></main>}
    {settings && <div className="modal-shade"><section className="settings"><div className="pane-header"><h2>Workspace settings</h2><button onClick={() => setSettings(false)}>×</button></div><label>New card filename<input value={stem} onChange={e => { setStem(e.target.value); localStorage.setItem('new-card-stem',e.target.value); }}/><small>Creates {stem || 'untitled'}.md, then {stem || 'untitled'}_1.md. Titles stay independent.</small></label><p className="small muted">Checkpoints are automatic after five idle minutes and on ⌘S / Ctrl+S. This preview keeps every Git checkpoint; it does not prune history.</p><code>{snapshot?.root}</code></section></div>}
    {(state.error || !!snapshot?.issues.length) && <div className="error-banner" role="alert"><span>{state.error || snapshot!.issues[0]}</span>{draft?.dirty && <><button onClick={() => attempt(session.copyDraft())}>Copy draft</button><button onClick={() => { if (confirm('Discard this unsaved draft and load the file from disk?')) attempt(session.reloadDraft()); }}>Reload from disk</button></>}<button aria-label="Dismiss error" onClick={() => session.update({error:''})}>×</button></div>}
  </div>;
}
