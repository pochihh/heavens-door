export interface CardDrop {id:string;folder:string;x:number;y:number;screenX:number;screenY:number;source?:string}
export function dropCardAt(id:string,x:number,y:number,source?:string){
  if(!document.elementsFromPoint)return false;
  const zones=[...new Set(document.elementsFromPoint(x,y).map(el=>el.closest<HTMLElement>('[data-card-drop-folder]')).filter((el):el is HTMLElement=>!!el))];
  const target=zones.find(el=>el.dataset.cardDropFolder&&el.dataset.cardDropFolder!==source);if(!target)return false;
  let point={x:80,y:80};
  if(target.classList.contains('canvas')){
    const world=target.querySelector<HTMLElement>('.board-world'),r=target.getBoundingClientRect();
    if(world){const m=new DOMMatrix(getComputedStyle(world).transform);point={x:(x-r.left-m.e)/m.a,y:(y-r.top-m.f)/m.d};}
  }
  window.dispatchEvent(new CustomEvent<CardDrop>('door:card-drop',{detail:{id,folder:target.dataset.cardDropFolder!,...point,screenX:x,screenY:y,source}}));return true;
}
