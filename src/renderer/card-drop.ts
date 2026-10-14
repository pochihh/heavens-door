import type {Board} from '../shared';

export interface DocumentDrag {note?:{id:string;expected:string};key:string;path?:string;source?:string;placement?:string;selection?:{ids:string[];folders:string[];board:Board;offset:{x:number;y:number}}}

export interface DocumentDrop extends DocumentDrag {folder:string;kind:'board'|'folder';intoBoard?:boolean;atPointer?:boolean;x:number;y:number;screenX:number;screenY:number}
let highlighted:HTMLElement|null=null;
let hoverTab:HTMLElement|null=null,hoverTimer:ReturnType<typeof setTimeout>|undefined,navigated=false;
export function documentDragNavigated(){return navigated;}
export function clearDocumentNavigation(){clearTimeout(hoverTimer);hoverTimer=undefined;hoverTab=null;navigated=false;}
function hoverDocumentTab(x:number,y:number){
  const tab=document.elementsFromPoint?.(x,y).map(el=>el.closest<HTMLElement>('[data-tab-family="main"] [data-tab-key]')).find(Boolean)??null;
  if(tab===hoverTab)return;clearTimeout(hoverTimer);hoverTimer=undefined;hoverTab=tab;
  if(tab&&!tab.classList.contains('active-tab'))hoverTimer=setTimeout(()=>{
    if(!tab.isConnected)return;navigated=true;
    window.dispatchEvent(new CustomEvent('door:document-hover-tab',{detail:{group:tab.closest<HTMLElement>('[data-tab-group]')?.dataset.tabGroup,key:tab.dataset.tabKey}}));
  },650);
}
export function clearDocumentDrop(){highlighted?.classList.remove('document-drop-target');highlighted=null;}
const dropKind=(target:HTMLElement,drag:DocumentDrag)=>drag.selection&&drag.selection.ids.length>1&&target.dataset.dropBoard==='true'?'board':target.dataset.dropKind;
export function documentDrag(source:HTMLElement,key=source.dataset.fileKey):DocumentDrag|null {
  const value=source.dataset.dragKey??key;
  return value&&/^(card:|board:|file:)/.test(value)?{key:value,path:source.dataset.dragPath,source:source.dataset.sourceBoard,placement:source.dataset.placement}:null;
}
export function documentDropTarget(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement):HTMLElement|null {
  if(!document.elementsFromPoint)return null;
  const board=drag.key.startsWith('board:'),path=board?drag.key.slice(6):drag.path??(drag.key.startsWith('file:')?drag.key.slice(5):undefined);
  if(board&&!path)return null;
  const targets=[...new Set(document.elementsFromPoint(x,y).filter(hit=>!exclude?.contains(hit)&&!hit.closest('.drag-phantom,.board-placement.dragging')).map(hit=>hit.closest<HTMLElement>('[data-drop-folder]')).filter((target):target is HTMLElement=>!!target&&!exclude?.contains(target)))];
  // A modal asset reader covers the board during note extraction; hit-test the board beneath it.
  if(drag.note)for(const target of document.querySelectorAll<HTMLElement>('.canvas[data-drop-folder],.board-tile[data-drop-folder]')){const r=target.getBoundingClientRect(),clip=target.closest('.canvas')?.getBoundingClientRect();if(clip&&(x<clip.left||x>clip.right||y<clip.top||y>clip.bottom))continue;if(r.width&&r.height&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&!targets.includes(target))targets.push(target);}
  // The containing canvas must not win over a child board underneath the dragged item.
  targets.sort((a,b)=>Number(a.classList.contains('canvas'))-Number(b.classList.contains('canvas')));
  for(const target of targets){
    const folder=target.dataset.dropFolder!,kind=dropKind(target,drag);
    if(drag.note&&(kind!=='board'||!folder))continue;
    if(kind!=='board'&&kind!=='folder'||folder===drag.source&&kind==='board'&&(!!drag.placement||!board||!target.classList.contains('canvas'))||kind==='board'&&!folder&&!board)continue;
    if(drag.selection&&(kind!=='board'&&drag.selection.ids.length>1||folder===drag.source||!folder&&drag.selection.ids.length!==drag.selection.folders.length||drag.selection.folders.some(p=>folder===p||folder.startsWith(p+'/'))))continue;
    if(path&&(folder===path||folder.startsWith(path+'/')||kind==='folder'&&folder===path.split('/').slice(0,-1).join('/')))continue;
    if(folder.split('/').some(part=>part.startsWith('.')||part==='node_modules'))continue;
    // Row middles mean “put inside”; the gaps keep their reorder behavior.
    if(target.classList.contains('tree-row')){const r=target.getBoundingClientRect();if(y<r.top+r.height*.25||y>r.bottom-r.height*.25)continue;}
    return target;
  }
  return null;
}
export function previewDocumentDrop(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement){
  hoverDocumentTab(x,y);
  const target=documentDropTarget(drag,x,y,exclude);
  if(target!==highlighted){clearDocumentDrop();highlighted=target;target?.classList.add('document-drop-target');}
  return !!target;
}
export function dropDocumentAt(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement){
  const target=documentDropTarget(drag,x,y,exclude),intoBoard=!!target&&target.matches('.board-tile,.canvas');
  clearDocumentDrop();clearDocumentNavigation();if(!target)return false;
  let point={x:80,y:80};
  if(target.classList.contains('canvas')){
    const world=target.querySelector<HTMLElement>('.board-world'),r=target.getBoundingClientRect();
    if(world){const m=new DOMMatrix(getComputedStyle(world).transform);point={x:(x-r.left-m.e)/m.a,y:(y-r.top-m.f)/m.d};}
  }
  window.dispatchEvent(new CustomEvent<DocumentDrop>('door:document-drop',{detail:{...drag,folder:target.dataset.dropFolder!,kind:dropKind(target,drag) as DocumentDrop['kind'],intoBoard,atPointer:target.classList.contains('canvas'),...point,screenX:x,screenY:y}}));return true;
}
