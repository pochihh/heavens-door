export const MAX_PANES=16,MAX_TABS=200;
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
  return updatePane(layout,id,p=>!p.tabs.includes(key)&&p.tabs.length>=MAX_TABS?p:({...p,tabs:p.tabs.includes(key)?p.tabs:[...p.tabs,key],active:key}));
}
export function activeAfterRemoval(tabs:string[],active:string,key:string):string {
  if(active!==key)return active;
  const index=tabs.indexOf(key);return tabs[index+1]??tabs[index-1]??'';
}
export function closeTab(layout:Layout,id:string,key:string) {
  return updatePane(layout,id,p=>{
    const tabs=p.tabs.filter(k=>k!==key);
    return {...p,tabs,active:activeAfterRemoval(p.tabs,p.active,key)};
  });
}
export function splitPane(layout:Layout,id:string,axis:'row'|'column',next:Pane):Layout {
  if(panes(layout).length>=MAX_PANES)return layout;
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
  if(!panes(layout).some(p=>p.id===from&&p.tabs.includes(key))||from===to&&key===before)return layout;
  const target=panes(layout).find(p=>p.id===to);if(!target||!target.tabs.includes(key)&&target.tabs.length>=MAX_TABS)return layout;
  let next=closeTab(layout,from,key);
  next=updatePane(next,to,p=>{
    const tabs=p.tabs.filter(k=>k!==key),index=before?tabs.indexOf(before):-1;
    tabs.splice(index<0?tabs.length:index,0,key);
    return {...p,tabs,active:key};
  });
  return next;
}
export function restoreLayout(raw:string|null):Layout {
  const ids=new Set<string>();let count=0;
  const valid=(value:Layout,depth=0):boolean=>!!value&&++count<=31&&depth<16&&typeof value.id==='string'&&value.id.length<=100&&!ids.has(value.id)&&!!ids.add(value.id)&&(value.type==='pane'
    ?Array.isArray(value.tabs)&&value.tabs.length<=MAX_TABS&&value.tabs.every(k=>typeof k==='string'&&k.length<=2048)&&new Set(value.tabs).size===value.tabs.length&&typeof value.active==='string'&&(value.active===''||value.tabs.includes(value.active))
    :value.type==='split'&&['row','column'].includes(value.axis)&&Number.isFinite(value.ratio)&&value.ratio>=.15&&value.ratio<=.85&&valid(value.first,depth+1)&&valid(value.second,depth+1));
  try{const value=JSON.parse(raw??'null');if(valid(value)&&panes(value).length<=MAX_PANES)return value;}catch{/* start clean */}
  return pane('board:');
}

export const MODULE_IDS=['whiteboards','files','bookmarks','tags','search','agent','history'] as const;
export type ModuleId=typeof MODULE_IDS[number];
export type DockSide='left'|'right';
export interface PanelGroup {id:string;tabs:ModuleId[];active:ModuleId;weight:number}
export interface Dock {collapsed:boolean;width:number;groups:PanelGroup[]}
export interface Docks {version:1;left:Dock;right:Dock}
export interface ViewMemory {camera?:{x:number;y:number;zoom:number};scroll?:number;tagView?:'table'|'kanban';tagGroup?:string}
export interface DocumentsLayout {tree:Layout;active:string;views:Record<string,ViewMemory>;formatting:string[]}
export interface NavigationMemory {expanded?:string[];search?:string;scroll?:number}
export function defaultDocks():Docks {
  return {version:1,left:{collapsed:false,width:232,groups:[{id:'navigation',tabs:['whiteboards','files','tags','search'],active:'whiteboards',weight:62},{id:'saved',tabs:['bookmarks'],active:'bookmarks',weight:38}]},right:{collapsed:true,width:280,groups:[{id:'tools',tabs:['agent','history'],active:'agent',weight:1}]}};
}
export function validateDocks(value:unknown):Docks {
  if(!value||typeof value!=='object'||(value as Docks).version!==1)throw new Error('Invalid dock layout');
  const docks=value as Docks,ids=new Set<string>(),modules=new Set<string>();
  for(const side of ['left','right'] as const){
    const dock=docks[side];
    if(!dock||typeof dock.collapsed!=='boolean'||!Number.isFinite(dock.width)||dock.width<180||dock.width>520||!Array.isArray(dock.groups)||dock.groups.length>MODULE_IDS.length)throw new Error('Invalid side dock');
    for(const group of dock.groups){
      if(!group||typeof group.id!=='string'||!group.id||group.id.length>100||ids.has(group.id)||!Number.isFinite(group.weight)||group.weight<=0||group.weight>10000||!Array.isArray(group.tabs)||!group.tabs.length||!group.tabs.includes(group.active))throw new Error('Invalid panel group');
      ids.add(group.id);
      for(const module of group.tabs){if(!MODULE_IDS.includes(module)||modules.has(module))throw new Error('Duplicate or unknown module');modules.add(module);}
    }
  }
  if(modules.size!==MODULE_IDS.length)throw new Error('Missing workspace module');
  return docks;
}
export function findModule(docks:Docks,module:ModuleId) {
  for(const side of ['left','right'] as const){const group=docks[side].groups.find(g=>g.tabs.includes(module));if(group)return {side,group};}
  throw new Error('Module is not placed');
}
export function revealModule(docks:Docks,module:ModuleId):Docks {
  const {side,group}=findModule(docks,module);
  return {...docks,[side]:{...docks[side],collapsed:false,groups:docks[side].groups.map(g=>g.id===group.id?{...g,active:module}:g)}};
}
export type DockDrag={module:ModuleId}|{group:string};
export type DockDrop={side:DockSide;group?:string;position:'tab'|'before'|'after';beforeTab?:ModuleId};
export function moveModule(docks:Docks,drag:DockDrag,drop:DockDrop):Docks {
  const source='module' in drag?findModule(docks,drag.module):(['left','right'] as const).flatMap(side=>docks[side].groups.map(group=>({side,group}))).find(g=>g.group.id===drag.group);
  if(!source||'module' in drag&&drop.beforeTab===drag.module)return docks;
  if(drop.group===source.group.id&&('group' in drag||source.group.tabs.length===1))return docks;
  if(drop.group&&!docks[drop.side].groups.some(g=>g.id===drop.group))return docks;
  const next=structuredClone(docks),moving='module' in drag?[drag.module]:source.group.tabs;
  const active='module' in drag?drag.module:source.group.active;
  next[source.side].groups=next[source.side].groups.flatMap(g=>{
    if(g.id!==source.group.id)return [g];
    const tabs=g.tabs.filter(m=>!moving.includes(m));return tabs.length?[{...g,tabs,active:('module' in drag?activeAfterRemoval(g.tabs,g.active,drag.module):tabs[0]) as ModuleId}]:[];
  });
  const target=next[drop.side],index=target.groups.findIndex(g=>g.id===drop.group);
  target.collapsed=false;
  if(drop.position==='tab'&&index>=0){
    const group=target.groups[index],tabs=group.tabs.filter(m=>!moving.includes(m)),before=drop.beforeTab?tabs.indexOf(drop.beforeTab):-1;
    tabs.splice(before<0?tabs.length:before,0,...moving);target.groups[index]={...group,tabs,active};
  }else{
    const weight=index>=0?target.groups[index].weight/2:1;if(index>=0)target.groups[index].weight=weight;
    const group={id:'group' in drag?source.group.id:crypto.randomUUID(),tabs:[...moving],active,weight};
    target.groups.splice(index<0?target.groups.length:index+(drop.position==='after'?1:0),0,group);
  }
  return next;
}
export function resizeGroups(docks:Docks,side:DockSide,index:number,fraction:number):Docks {
  const next=structuredClone(docks),groups=next[side].groups,a=groups[index],b=groups[index+1];
  if(!a||!b)return docks;
  const total=a.weight+b.weight,ratio=Math.max(.12,Math.min(.88,fraction));a.weight=total*ratio;b.weight=total*(1-ratio);return next;
}
export function validateDocuments(value:unknown):DocumentsLayout {
  if(!value||typeof value!=='object')throw new Error('Invalid document layout');
  const d=value as DocumentsLayout,tree=restoreLayout(JSON.stringify(d.tree));
  if(JSON.stringify(tree)!==JSON.stringify(d.tree)||!panes(tree).some(p=>p.id===d.active)||!d.views||typeof d.views!=='object'||Array.isArray(d.views)||Object.keys(d.views).length>3200||!Array.isArray(d.formatting)||d.formatting.some(id=>typeof id!=='string')||d.formatting.length>16)throw new Error('Invalid document layout');
  for(const [key,v] of Object.entries(d.views)){
    if(key.length>2300||!v||typeof v!=='object'||Array.isArray(v)||v.scroll!==undefined&&(!Number.isFinite(v.scroll)||v.scroll<0)||v.camera!==undefined&&(!v.camera||typeof v.camera!=='object'||![v.camera.x,v.camera.y,v.camera.zoom].every(Number.isFinite)||v.camera.zoom<.2||v.camera.zoom>3)||v.tagView!==undefined&&!['table','kanban'].includes(v.tagView)||v.tagGroup!==undefined&&(typeof v.tagGroup!=='string'||v.tagGroup.length>2048))throw new Error('Invalid document view');
  }
  return d;
}
