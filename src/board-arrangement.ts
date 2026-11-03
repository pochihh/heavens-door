import type {Board,Placement} from './shared';
export interface ArrangementSettings {
 widths:[number,number,number,number]; boardHeights?:[number,number,number,number]; alignmentTolerance?:number; horizontalGap:number; verticalGap:number; rowWidth:number;
 resizeCards:boolean; groupLinks:boolean; collapseLong:boolean; collapseHeight:number;
}
export const DEFAULT_BOARD_HEIGHTS:[number,number,number,number]=[120,170,240,340];
export const DEFAULT_ARRANGEMENT:ArrangementSettings={widths:[240,340,480,680],boardHeights:DEFAULT_BOARD_HEIGHTS,alignmentTolerance:32,horizontalGap:48,verticalGap:48,rowWidth:1600,resizeCards:true,groupLinks:true,collapseLong:false,collapseHeight:900};
export function defaultBoardSize(settings=DEFAULT_ARRANGEMENT){return {width:settings.widths[1],height:(settings.boardHeights??DEFAULT_BOARD_HEIGHTS)[1]};}
export function validateArrangement(value:unknown):asserts value is ArrangementSettings {
 const s=value as ArrangementSettings;
 if(!s||typeof s!=='object'||Array.isArray(s)||!Array.isArray(s.widths)||s.widths.length!==4||s.widths.some((n,i)=>!Number.isFinite(n)||n<200||n>4000||i>0&&n<=s.widths[i-1])||s.boardHeights!==undefined&&(!Array.isArray(s.boardHeights)||s.boardHeights.length!==4||s.boardHeights.some((n,i,heights)=>!Number.isFinite(n)||n<120||n>4000||i>0&&n<=heights[i-1]))||s.alignmentTolerance!==undefined&&(!Number.isFinite(s.alignmentTolerance)||s.alignmentTolerance<0||s.alignmentTolerance>2000)||[s.horizontalGap,s.verticalGap].some(n=>!Number.isFinite(n)||n<0||n>2000)||!Number.isFinite(s.rowWidth)||s.rowWidth<200||s.rowWidth>20000||!Number.isFinite(s.collapseHeight)||s.collapseHeight<120||s.collapseHeight>20000||[s.resizeCards,s.groupLinks,s.collapseLong].some(v=>typeof v!=='boolean'))throw Error('Invalid board arrangement settings');
}
export type ArrangementAction='left'|'right'|'top'|'bottom'|'horizontal'|'vertical'|'auto';
export interface ArrangementBox {x:number;y:number;width:number;height:number}
export const nearestCardWidth=(width:number,widths:ArrangementSettings['widths'])=>widths.reduce((best,n)=>Math.abs(n-width)<Math.abs(best-width)?n:best);
export function fitPlacementSize(p:Placement,settings:ArrangementSettings):Placement {
 const width=nearestCardWidth(p.width,settings.widths),height=p.folder?(settings.boardHeights??DEFAULT_BOARD_HEIGHTS)[settings.widths.indexOf(width)]:p.height;
 return width===p.width&&height===p.height?p:{...p,width,height};
}
export function prepareArrangement(p:Placement,settings:ArrangementSettings,ordinaryCard:boolean):Placement {
 return ordinaryCard?{...p,autoHeight:true,width:settings.resizeCards?nearestCardWidth(p.width,settings.widths):p.width}:p;
}
// Input boxes include comments and captions so the arranged elements do not cover each other.
export function arrangeBoard(board:Board,ids:readonly string[],action:ArrangementAction,boxes:ReadonlyMap<string,ArrangementBox>,settings=DEFAULT_ARRANGEMENT):Board {
 const selected=new Set(ids),items=board.cards.filter(p=>selected.has(p.id));if(items.length<2)return board;
 const box=(p:Placement)=>boxes.get(p.id)??p;
 const left=Math.min(...items.map(p=>box(p).x)),top=Math.min(...items.map(p=>box(p).y)),right=Math.max(...items.map(p=>box(p).x+box(p).width)),bottom=Math.max(...items.map(p=>box(p).y+box(p).height)),changed=new Map<string,Placement>();
 const place=(p:Placement,x:number,y:number)=>changed.set(p.id,{...p,x:p.x+x-box(p).x,y:p.y+y-box(p).y});
 if(action==='auto'){
  const tolerance=settings.alignmentTolerance??32;
  type Line={at:number;items:Placement[]};
  const bands=(axis:'x'|'y')=>{
   const lines:Line[]=[];
   for(const p of [...items].sort((a,b)=>box(a)[axis]-box(b)[axis]||a.id.localeCompare(b.id))){
    const at=box(p)[axis],line=lines.at(-1);if(line&&at-line.at<=tolerance)line.items.push(p);else lines.push({at,items:[p]});
   }
   return lines;
  };
  const rows=bands('y'),rowOf=new Map(rows.flatMap((line,i)=>line.items.map(p=>[p.id,i] as const))),columns:Line[]=[];
  for(const band of bands('x')){
   const counts=new Map<number,number>(),lanes:Placement[][]=[];
   for(const p of band.items){const row=rowOf.get(p.id)!,lane=counts.get(row)??0;counts.set(row,lane+1);(lanes[lane]??=[]).push(p);}
   for(const lane of lanes)columns.push({at:band.at,items:lane});
  }
  // Nearby lines share an alignment; only adjacent neighbors constrain gaps, never graph traversal order.
  const tidy=(lines:Line[],across:Line[],axis:'x'|'y',size:'width'|'height',gap:number)=>{
   const lineOf=new Map(lines.flatMap((line,i)=>line.items.map(p=>[p.id,i] as const))),incoming=lines.map(()=>[] as {from:number;distance:number;close:boolean}[]),positions:number[]=[];
   for(const line of across){
    const sorted=[...line.items].sort((a,b)=>lineOf.get(a.id)!-lineOf.get(b.id)!);
    for(let i=1;i<sorted.length;i++){const a=box(sorted[i-1]),b=box(sorted[i]),from=lineOf.get(sorted[i-1].id)!,to=lineOf.get(sorted[i].id)!;if(from!==to)incoming[to].push({from,distance:a[size]+gap,close:b[axis]-a[axis]-a[size]<=gap+tolerance});}
   }
   for(let i=0;i<lines.length;i++){
    const constraints=incoming[i],near=constraints.filter(c=>c.close),preferred=near.length?Math.max(...near.map(c=>positions[c.from]+c.distance)):lines[i].at;
    positions[i]=Math.max(preferred,...constraints.map(c=>positions[c.from]+c.distance),i?positions[i-1]+Math.min(tolerance+1,Math.max(0,lines[i].at-lines[i-1].at)):-Infinity);
   }
   return new Map(lines.flatMap((line,i)=>line.items.map(p=>[p.id,positions[i]] as const)));
  };
  const xs=tidy(columns,rows,'x','width',settings.horizontalGap),ys=tidy(rows,columns,'y','height',settings.verticalGap);
  for(const p of items)place(p,xs.get(p.id)!,ys.get(p.id)!);
 }else if(action==='horizontal'||action==='vertical'){
  const horizontal=action==='horizontal',sorted=[...items].sort((a,b)=>(horizontal?box(a).x-box(b).x:box(a).y-box(b).y)||a.id.localeCompare(b.id)),size=sorted.reduce((n,p)=>n+(horizontal?box(p).width:box(p).height),0),gap=Math.max(0,((horizontal?right-left:bottom-top)-size)/(items.length-1));let cursor=horizontal?left:top;
  for(const p of sorted){const b=box(p);place(p,horizontal?cursor:b.x,horizontal?b.y:cursor);cursor+=(horizontal?b.width:b.height)+gap;}
 }else for(const p of items){const b=box(p);place(p,action==='left'?left:action==='right'?right-b.width:b.x,action==='top'?top:action==='bottom'?bottom-b.height:b.y);}
 return {...board,cards:board.cards.map(p=>changed.get(p.id)??p)};
}
