import {DEFAULT_PALETTE} from '../colors';
import {Color} from './StyleView';
import {cardFill,tintColor} from '../colors';
import {type CSSProperties,useLayoutEffect,useRef,useState} from 'react';
import type {Snapshot} from '../shared';
import type {NavigationMode,ViewMemory} from '../layout';
import type {Session} from './session';
import {useConfirmation} from './Confirmation';
import {NoteView} from './DocumentViews';
import {ViewBlockProvider} from './ViewBlock';
import {InlineName} from './InlineName';
import {MenuCheck,DocumentIcon,Tool} from './Icons';
import {PropertyPopover} from './PropertyValue';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';

export function CardPopup({documentKey,snapshot,session,onClose,onNavigate,onPreview}:{documentKey:string;snapshot:Snapshot;session:Session;onClose:()=>Promise<void>;onNavigate:(key:string,mode:NavigationMode)=>Promise<void>;onPreview:(key:string)=>Promise<void>}){
  const confirm=useConfirmation();
  const ref=useRef<HTMLDialogElement>(null),memory=useRef<ViewMemory>({}),pending=useRef(false);
  const [source,setSource]=useState(false),[busy,setBusy]=useState(false),[menu,setMenu]=useState<HTMLElement|null>(null),[error,setError]=useState(''),[colorAnchor,setColorAnchor]=useState<HTMLElement|null>(null);
  memory.current.source=source;
  const backdropDown=useRef(false);
  const card=snapshot.cards.find(c=>'card:'+c.id===documentKey);
  useLayoutEffect(()=>{const dialog=ref.current!,previous=document.activeElement;dialog.showModal();dialog.querySelector<HTMLButtonElement>('button')?.focus();return()=>{dialog.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
  async function perform(action:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(String(e));}finally{pending.current=false;setBusy(false);}}
  return <dialog ref={ref} className="card-popup" style={{'--document-fill':tintColor(cardFill(card))} as CSSProperties} aria-label={ui.navigation.cardPopup} aria-modal="true" onKeyDown={e=>{if(e.key==='Escape'&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();if(menu)setMenu(null);else void perform(onClose);}}} onCancel={e=>{e.preventDefault();if(menu)setMenu(null);else void perform(onClose);}} onPointerDown={e=>{backdropDown.current=e.target===e.currentTarget;}} onClick={e=>{if(e.target===e.currentTarget&&backdropDown.current)void perform(onClose);backdropDown.current=false;}}>
    <div className="card-popup-surface">
      <header className="card-popup-toolbar">
        <Tool icon="external" label={ui.common.openInSameTab} disabled={busy||!card} onClick={()=>void perform(()=>onNavigate(documentKey,'same'))}/>
        <Tool icon="window" label={ui.common.openInNewTab} disabled={busy||!card} onClick={()=>void perform(()=>onNavigate(documentKey,'new'))}/>
        {card&&<div className="card-popup-filename"><DocumentIcon value={snapshot.preferences?.icons[documentKey]} fallback="note"/><InlineName name={card.name.replace(/\.md$/,'')} suffix=".md" tooltip={card.path} onRename={name=>session.renameCard(card.id,name)}/></div>}
        <div className="toolbar-spacer"/>
        <Tool icon="art" label={ui.style.color} disabled={busy||!card} onClick={e=>setColorAnchor(colorAnchor?null:e.currentTarget)}/>
        <Tool icon="more" label={tooltips.whiteboard.cardActions} aria-expanded={!!menu} onClick={e=>setMenu(menu?null:e.currentTarget)}/>
        <Tool icon="close" label={tooltips.common.closeDialog} disabled={busy} onClick={()=>void perform(onClose)}/>
      </header>
      {card?<ViewBlockProvider snapshot={snapshot} session={session} onOpen={key=>void perform(()=>onPreview(key))} onPreview={onPreview} onNavigate={(key,mode)=>void perform(()=>onNavigate(key,mode))}>
        <NoteView metadata key={card.id} path={card.path} session={session} snapshot={snapshot} active memory={memory.current} onActivate={()=>void perform(()=>session.select(card.path))} onOpen={key=>void perform(()=>key.startsWith('card:')?onPreview(key):onNavigate(key,'same'))} onViewChange={()=>{}}/>
      </ViewBlockProvider>:<p className="notice">{ui.errors.fileMissing}</p>}
      {(error||session.state.error)&&<div className="card-popup-error" role="alert"><span>{error||session.state.error}</span>{session.state.draft?.dirty&&<><button onClick={()=>void perform(()=>session.copyDraft())}>{ui.common.copyDraft}</button><button onClick={()=>void perform(async()=>{if(await confirm({title:ui.common.reloadFromDisk,message:ui.recovery.confirmDiscard,accept:ui.common.reloadFromDisk,danger:true}))await session.reloadDraft();})}>{ui.common.reloadFromDisk}</button></>}</div>}
    </div>
    {colorAnchor&&card&&<PropertyPopover anchor={colorAnchor} align="end" label={ui.style.color} onClose={()=>setColorAnchor(null)}><Color label={ui.style.color} value={cardFill(card)??''} palette={snapshot.preferences?.palette??DEFAULT_PALETTE} onChange={color=>void perform(()=>session.fillCards([card.id],color))}/></PropertyPopover>}
    {menu&&<PropertyPopover anchor={menu} align="end" label={ui.whiteboard.cardActions} onClose={()=>setMenu(null)}><div className="view-menu-list"><button role="menuitemcheckbox" aria-checked={source} onClick={()=>{void perform(async()=>{await session.run(()=>session.flush());setSource(!source);setMenu(null);});}}><MenuCheck checked={source}/><span>{ui.editorTools.sourceMode}</span></button>{(['same','new','other'] as const).map(mode=><button key={mode} disabled={busy||!card} onClick={()=>{setMenu(null);void perform(()=>onNavigate(documentKey,mode));}}>{mode==='same'?ui.common.openInSameTab:mode==='new'?ui.common.openInNewTab:ui.common.openInAnotherTabGroup}</button>)}</div></PropertyPopover>}
  </dialog>;
}
