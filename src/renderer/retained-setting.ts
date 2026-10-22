import {useSyncExternalStore} from 'react';
import {TEST_BUILD} from '../identity';
const key='heavens:retained-board',event='heavens-retained-change';
export const retainedEnabled=()=>TEST_BUILD&&localStorage.getItem(key)==='1';
export function setRetainedEnabled(enabled:boolean){localStorage.setItem(key,enabled?'1':'0');window.dispatchEvent(new Event(event));}
const subscribe=(notify:()=>void)=>{window.addEventListener(event,notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener(event,notify);window.removeEventListener('storage',notify);};};
export const useRetainedEnabled=()=>useSyncExternalStore(subscribe,retainedEnabled,()=>false);
