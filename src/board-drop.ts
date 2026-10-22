import type {Board,CardInfo} from './shared';
// Use a new column: auto-height cards and expanded PDFs can be taller than their saved height.
export function boardDropPosition(board:Board|undefined,cards:CardInfo[]){
 const pdfs=new Set(cards.filter(c=>c.source?.type==='pdf').map(c=>c.id));
 return {x:board?.cards.length?Math.max(...board.cards.map(p=>p.x+p.width+(!p.collapsed&&pdfs.has(p.cardId)&&p.pdf?.notes!==false?480:0)))+80:80,y:80};
}
