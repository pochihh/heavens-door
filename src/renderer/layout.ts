export interface Pane {type:'pane';id:string;tabs:string[];active:string}
export interface Split {type:'split';id:string;axis:'row'|'column';ratio:number;first:Layout;second:Layout}
export type Layout=Pane|Split;
export function pane(document=''):Pane {return {type:'pane',id:crypto.randomUUID(),tabs:document?[document]:[],active:document};}
export function panes(layout:Layout):Pane[]{return layout.type==='pane'?[layout]:[...panes(layout.first),...panes(layout.second)];}
export function updatePane(layout:Layout,id:string,change:(pane:Pane)=>Layout):Layout {
  if(layout.type==='pane')return layout.id===id?change(layout):layout;
  return {...layout,first:updatePane(layout.first,id,change),second:updatePane(layout.second,id,change)};
}
export function openTab(layout:Layout,id:string,key:string) {
  return updatePane(layout,id,p=>({...p,tabs:p.tabs.includes(key)?p.tabs:[...p.tabs,key],active:key}));
}
export function closeTab(layout:Layout,id:string,key:string) {
  return updatePane(layout,id,p=>{
    const index=p.tabs.indexOf(key),tabs=p.tabs.filter(k=>k!==key);
    return {...p,tabs,active:p.active===key?tabs[Math.min(index,tabs.length-1)]??'':p.active};
  });
}
export function splitPane(layout:Layout,id:string,axis:'row'|'column',next:Pane):Layout {
  return updatePane(layout,id,p=>({type:'split',id:crypto.randomUUID(),axis,ratio:.5,first:p,second:next}));
}
export function removePane(layout:Layout,id:string):Layout|null {
  if(layout.type==='pane')return layout.id===id?null:layout;
  const first=removePane(layout.first,id),second=removePane(layout.second,id);
  return first&&second?{...layout,first,second}:first??second;
}
export function resizeSplit(layout:Layout,id:string,ratio:number):Layout {
  if(layout.type==='pane')return layout;
  return layout.id===id?{...layout,ratio:Math.max(.15,Math.min(.85,ratio))}:{...layout,first:resizeSplit(layout.first,id,ratio),second:resizeSplit(layout.second,id,ratio)};
}
export function moveTab(layout:Layout,from:string,to:string,key:string,before?:string):Layout {
  let next=closeTab(layout,from,key);
  next=updatePane(next,to,p=>{
    const tabs=p.tabs.filter(k=>k!==key),index=before?tabs.indexOf(before):-1;
    tabs.splice(index<0?tabs.length:index,0,key);
    return {...p,tabs,active:key};
  });
  return next;
}
export function restoreLayout(raw:string|null):Layout {
  const valid=(value:Layout,depth=0):boolean=>!!value&&depth<16&&typeof value.id==='string'&&(value.type==='pane'
    ?Array.isArray(value.tabs)&&value.tabs.length<200&&value.tabs.every(k=>typeof k==='string')&&typeof value.active==='string'
    :value.type==='split'&&['row','column'].includes(value.axis)&&Number.isFinite(value.ratio)&&value.ratio>=.15&&value.ratio<=.85&&valid(value.first,depth+1)&&valid(value.second,depth+1));
  try{const value=JSON.parse(raw??'null');if(valid(value)&&panes(value).length<=16)return value;}catch{/* start clean */}
  return pane('board:');
}
