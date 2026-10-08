import {ui} from '../text/ui';

export interface DocumentDrag {key:string;path?:string;source?:string;placement?:string}

export interface DocumentDrop extends DocumentDrag {folder:string;kind:'board'|'folder';intoBoard?:boolean;atPointer?:boolean;x:number;y:number;screenX:number;screenY:number}
let highlighted:HTMLElement|null=null,label:HTMLElement|null=null,hold:ReturnType<typeof setTimeout>|undefined,ready=false,dragKey='';
export function clearDocumentDrop(){
  clearTimeout(hold);hold=undefined;highlighted?.classList.remove('document-drop-target','document-drop-pending');label?.remove();highlighted=null;label=null;ready=false;dragKey='';
}
const requiresHold=(target:HTMLElement)=>target.matches('.board-tile,.canvas');
export function documentDrag(source:HTMLElement,key=source.dataset.fileKey):DocumentDrag|null {
  const value=source.dataset.dragKey??key;
  return value&&/^(card:|board:|file:)/.test(value)?{key:value,path:source.dataset.dragPath,source:source.dataset.sourceBoard,placement:source.dataset.placement}:null;
}
export function documentDropTarget(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement):HTMLElement|null {
  if(!document.elementsFromPoint)return null;
  const board=drag.key.startsWith('board:'),path=board?drag.key.slice(6):drag.path??(drag.key.startsWith('file:')?drag.key.slice(5):undefined);
  if(board&&!path)return null;
  const targets=[...new Set(document.elementsFromPoint(x,y).filter(hit=>!exclude?.contains(hit)&&!hit.closest('.drag-phantom')).map(hit=>hit.closest<HTMLElement>('[data-drop-folder]')).filter((target):target is HTMLElement=>!!target&&!exclude?.contains(target)))];
  // The containing canvas must not win over a child board underneath the dragged item.
  targets.sort((a,b)=>Number(a.classList.contains('canvas'))-Number(b.classList.contains('canvas')));
  for(const target of targets){
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
  const target=documentDropTarget(drag,x,y,exclude);
  if(target!==highlighted||drag.key!==dragKey){
    clearDocumentDrop();highlighted=target;dragKey=drag.key;
    if(target){
      if(requiresHold(target)){
        const name=target.dataset.dropName??target.dataset.dropFolder??'';
        label=document.createElement('div');label.className='document-drop-label';label.setAttribute('role','status');label.textContent=ui.whiteboard.holdToMoveInto(name);label.dataset.ready='false';document.body.appendChild(label);target.classList.add('document-drop-pending');
        hold=setTimeout(()=>{
          if(highlighted!==target||!target.isConnected){clearDocumentDrop();return;}
          ready=true;target.classList.replace('document-drop-pending','document-drop-target');label!.textContent=ui.whiteboard.moveInto(name);label!.dataset.ready='true';
        },650);
      }else{ready=true;target.classList.add('document-drop-target');}
    }
  }
  if(target&&label){
    const r=target.getBoundingClientRect();
    label.style.left=Math.max(8,Math.min(r.left+12,window.innerWidth-label.offsetWidth-8))+'px';
    label.style.top=Math.max(8,Math.min(r.bottom-label.offsetHeight-12,window.innerHeight-label.offsetHeight-12))+'px';
  }
  return !!target;
}
export function dropDocumentAt(drag:DocumentDrag,x:number,y:number,exclude?:HTMLElement){
  const target=documentDropTarget(drag,x,y,exclude),intoBoard=!!target&&requiresHold(target),armed=target===highlighted&&ready&&drag.key===dragKey;
  clearDocumentDrop();if(!target||intoBoard&&!armed)return false;
  let point={x:80,y:80};
  if(target.classList.contains('canvas')){
    const world=target.querySelector<HTMLElement>('.board-world'),r=target.getBoundingClientRect();
    if(world){const m=new DOMMatrix(getComputedStyle(world).transform);point={x:(x-r.left-m.e)/m.a,y:(y-r.top-m.f)/m.d};}
  }
  window.dispatchEvent(new CustomEvent<DocumentDrop>('door:document-drop',{detail:{...drag,folder:target.dataset.dropFolder!,kind:target.dataset.dropKind as DocumentDrop['kind'],intoBoard,atPointer:target.classList.contains('canvas'),...point,screenX:x,screenY:y}}));return true;
}
