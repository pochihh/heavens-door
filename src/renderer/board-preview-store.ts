import {PreviewCache} from './preview-cache';
export interface BoardPreview {width:number;height:number;worldWidth:number;worldHeight:number;bitmap:ImageBitmap;close:()=>void}
export const boardPreviews=new PreviewCache<BoardPreview>(64*1024*1024);
export const latestBoardPreviews=new Map<string,{revision:string;key:string}>();
export const BOARD_PREVIEW_INVALIDATED='board-preview-invalidated';
export function rememberBoardPreview(slot:string,revision:string,key:string){latestBoardPreviews.delete(slot);latestBoardPreviews.set(slot,{revision,key});while(latestBoardPreviews.size>20000)latestBoardPreviews.delete(latestBoardPreviews.keys().next().value!);}
export function invalidateBoardSource(cardId:string){
 const token='"cardId":'+JSON.stringify(cardId);boardPreviews.invalidate(key=>key.includes(token));for(const [slot,value] of latestBoardPreviews)if(value.revision.includes(token))latestBoardPreviews.delete(slot);
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(BOARD_PREVIEW_INVALIDATED,{detail:cardId}));
}
