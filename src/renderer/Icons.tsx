import type { ButtonHTMLAttributes } from 'react';
const paths={
  format:'M3 19 9 5l6 14M5 14h8m2 5 4-9 4 9m-7-3h6',
  map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  note:'M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Zm0 0v7h7M7 13h10M7 17h7',
  tag:'M20 13 11 22 2 13V2h11l9 9a1.4 1.4 0 0 1 0 2ZM7 7h.01',
  star:'m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3.2 9.6l6.3-.9Z',
  clock:'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-2v6l4 2',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus:'M12 5v14M5 12h14',
  close:'m6 6 12 12M6 18 18 6',
  chevron:'m9 5 7 7-7 7',
  down:'m5 9 7 7 7-7',
  left:'M3 4h18v16H3Zm5 0v16',
  right:'M3 4h18v16H3Zm13 0v16',
  splitRight:'M3 4h18v16H3Zm9 0v16',
  splitDown:'M3 4h18v16H3Zm0 8h18',
  settings:'m9 3-.8 3-2.8 1.5L3 7l-1 3 2.5 2L4 15l-1 2 2 2 3-1 2.5 1 1 3h3l1-3 2.5-1 3 1 2-2-1-2-.5-3L24 10l-1-3-2.4.5L17.8 6 17 3Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  more:'M5 12h.01M12 12h.01M19 12h.01',
  undo:'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7',
  redo:'m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7',
  agent:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z',
  window:'M3 4h18v16H3ZM3 8h18M6 6h.01M9 6h.01',
  folder:'M3 5h6l2 3h10v12H3Z',
  check:'m4 12 5 5L20 6',
  sync:'M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5',
  table:'M3 3h18v18H3Zm0 6h18M3 15h18M9 3v18',
  kanban:'M3 4h5v16H3ZM10 4h5v10h-5ZM17 4h5v13h-5Z',
} as const;
export type IconName=keyof typeof paths;
export function Icon({name,size=16}:{name:IconName;size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
export function Tool({icon,label,...props}:{icon:IconName;label:string}&ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={'tool '+(props.className??'')} title={label} aria-label={label}><Icon name={icon}/></button>;
}
