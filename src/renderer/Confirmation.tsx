import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icons';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';

interface Confirmation { title:string; message:string; accept:string; danger?:boolean }
type Ask=(options:Confirmation)=>Promise<boolean>;
const Context=createContext<Ask|null>(null);
export function useConfirmation(){const ask=useContext(Context);if(!ask)throw new Error('ConfirmationProvider is required');return ask;}
export function ConfirmationProvider({children}:{children:ReactNode}) {
  const [options,setOptions]=useState<Confirmation|null>(null),pending=useRef<((answer:boolean)=>void)|null>(null);
  const finish=useCallback((answer:boolean)=>{const resolve=pending.current;pending.current=null;setOptions(null);resolve?.(answer);},[]);
  const ask=useCallback<Ask>(options=>{
    if(pending.current)return Promise.resolve(false);
    return new Promise(resolve=>{pending.current=resolve;setOptions(options);});
  },[]);
  useEffect(()=>()=>{pending.current?.(false);pending.current=null;},[]);
  return <Context.Provider value={ask}>{children}{options&&<ConfirmationDialog options={options} onAnswer={finish}/>}</Context.Provider>;
}
function ConfirmationDialog({options,onAnswer}:{options:Confirmation;onAnswer:(answer:boolean)=>void}) {
  const ref=useRef<HTMLDialogElement>(null),id=useId();
  useLayoutEffect(()=>{
    const dialog=ref.current!,previous=document.activeElement;
    dialog.showModal();dialog.querySelector<HTMLButtonElement>('button')?.focus();
    return()=>{dialog.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <dialog ref={ref} className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby={id} aria-describedby={id+'-body'}
    onCancel={e=>{e.preventDefault();onAnswer(false);}} onPointerDown={e=>{if(e.target===e.currentTarget)e.preventDefault();}} onClick={e=>{if(e.target===e.currentTarget)onAnswer(false);}}>
    <div className="confirmation-content"><div className={'confirmation-symbol '+(options.danger?'danger':'warning')}><Icon name={options.danger?'trash':'warning'} size={22}/></div>
      <h2 id={id}>{options.title}</h2><p id={id+'-body'}>{options.message}</p>
      <div className="confirmation-actions"><button data-tooltip={tooltips.common.cancel} onClick={()=>onAnswer(false)}>{ui.common.cancel}</button><button className={options.danger?'destructive':'primary'} onClick={()=>onAnswer(true)}>{options.accept}</button></div>
    </div>
  </dialog>;
}
