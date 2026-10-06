export interface DocumentDrag {key:string;path?:string;source?:string;placement?:string}
export interface DocumentDrop extends DocumentDrag {folder:string;kind:'board'|'folder';atPointer?:boolean;x:number;y:number;screenX:number;screenY:number}
let highlighted:HTMLElement|null=null;
export function clearDocumentDrop(){highlighted?.classList.remove('document-drop-target');highlighted?.removeAttribute('data-drop-label');highlighted=null;}
export function documentDrag(source:HTMLElement,key=source.dataset.fileKey):DocumentDrag|null {
  const value=source.dataset.dragKey??key;
  return value&&/^(card:|board:|file:)/.test(value)?{key:value,path:source.dataset.dragPath,source:source.dataset.sourceBoard,placement:source.dataset.placement}:null;
}
export function documentDropTarget(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement):HTMLElement|null {
  if(!document.elementsFromPoint)return null;
  const board=drag.key.startsWith('board:'),path=board?drag.key.slice(6):drag.path??(drag.key.startsWith('file:')?drag.key.slice(5):undefined);
  if(board&&!path)return null;
  for(const hit of document.elementsFromPoint(x,y)){
    if(exclude?.contains(hit)||hit.closest('.drag-phantom'))continue;
    const target=hit.closest<HTMLElement>('[data-drop-folder]');if(!target)continue;
    const folder=target.dataset.dropFolder!,kind=target.dataset.dropKind;
    if(kind!=='board'&&kind!=='folder'||folder===drag.source&&kind==='board'&&(!!drag.placement||!board||!target.classList.contains('canvas'))||kind==='board'&&!folder&&!board)continue;
    if(path&&(folder===path||folder.startsWith(path+'/')||kind==='folder'&&folder===path.split('/').slice(0,-1).join('/')))continue;
    if(folder.split('/').some(part=>part.startsWith('.')||part==='node_modules'))continue;
    // Row middles mean “put inside”; the gaps keep their reorder behavior.
    if(target.classList.contains('tree-row')){const r=target.getBoundingClientRect();if(y<r.top+r.height*.25||y>r.bottom-r.height*.25)continue;}
    return target;
  }
  return null;
}
export function previewDocumentDrop(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement){
  const target=documentDropTarget(drag,x,y,exclude);if(target!==highlighted){clearDocumentDrop();highlighted=target;target?.classList.add('document-drop-target');if(target)target.dataset.dropLabel=target.dataset.dropName??target.dataset.dropFolder??'';}
  return !!target;
}
export function dropDocumentAt(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement){
  const target=documentDropTarget(drag,x,y,exclude);clearDocumentDrop();if(!target)return false;
  let point={x:80,y:80};
  if(target.classList.contains('canvas')){
    const world=target.querySelector<HTMLElement>('.board-world'),r=target.getBoundingClientRect();
    if(world){const m=new DOMMatrix(getComputedStyle(world).transform);point={x:(x-r.left-m.e)/m.a,y:(y-r.top-m.f)/m.d};}
  }
  window.dispatchEvent(new CustomEvent<DocumentDrop>('door:document-drop',{detail:{...drag,folder:target.dataset.dropFolder!,kind:target.dataset.dropKind as DocumentDrop['kind'],atPointer:target.classList.contains('canvas'),...point,screenX:x,screenY:y}}));return true;
}
