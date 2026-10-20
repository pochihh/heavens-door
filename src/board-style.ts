import type {FontSize} from './font-size';
import type {Board,BoardObject,CardInfo,Edge,Placement,Stroke} from './shared';
import {edgeStyle} from './shared';
import {cardFill} from './colors';
export interface CopiedBoardStyle extends Stroke {
 fillColor?:string|null;
 fontSize?:FontSize;
 text?:Pick<Extract<BoardObject,{type:'text'}>,'shape'|'textColor'>;
 edge?:Pick<Edge,'fromArrowhead'|'toArrowhead'>;
}
export function copyBoardStyle(board:Board,placements:string[],edges:string[],cards:CardInfo[]):CopiedBoardStyle|undefined {
 const items=board.cards.filter(p=>placements.includes(p.id)),lines=board.edges.filter(e=>edges.includes(e.id));
 if(items.length+lines.length!==1)return;
 if(lines.length){const {strokeColor,strokeWidth,strokeStyle,fromArrowhead,toArrowhead,labelSize}=edgeStyle(lines[0]);return {strokeColor,strokeWidth,strokeStyle,fontSize:labelSize,edge:{fromArrowhead,toArrowhead}};}
 const p=items[0],text=p.object?.type==='text'?p.object:undefined;
 return {strokeColor:p.strokeColor,strokeWidth:p.strokeWidth??2,strokeStyle:p.strokeStyle??'solid',fillColor:!p.object&&!p.folder?cardFill(cards.find(c=>c.id===p.cardId),p)??null:p.fillColor??null,...(text?{fontSize:text.fontSize??'m',text:{shape:text.shape,textColor:text.textColor}}:{})};
}
export function applyBoardStyle(board:Board,placements:string[],edges:string[],style:CopiedBoardStyle):Board {
 const selected=new Set(placements),lines=new Set(edges),stroke:Stroke={strokeColor:style.strokeColor,strokeWidth:style.strokeWidth,strokeStyle:style.strokeStyle};
 return {...board,cards:board.cards.map((p):Placement=>!selected.has(p.id)?p:{...p,...stroke,...('fillColor' in style?{fillColor:style.fillColor??undefined}:{}),...(p.object?.type==='text'?{object:{...p.object,...style.text,...(style.fontSize!==undefined?{fontSize:style.fontSize}:{})}}:{})}),edges:board.edges.map(e=>lines.has(e.id)?{...e,...stroke,...style.edge,...(style.fontSize!==undefined?{labelSize:style.fontSize}:{})}:e)};
}
