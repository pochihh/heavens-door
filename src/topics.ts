import type {Board,Edge} from './shared';
export const topicText={name:'Text',childKey:'Tab',siblingKey:'Enter',new:'New text',child:'Add child text',sibling:'Add sibling text',selection:'Selection actions',convertMany:(count:number)=>`Convert ${count} text ${count===1?'element to a card':'elements to cards'}`,convert:'Convert to card',edit:'Edit text',finish:'Double-click empty canvas to add text · Esc to cancel'};
// Branches describe board placements, independently of note ownership and ordinary connectors.
function branchParents(edges:Edge[]){const parents=new Map<string,string>();for(const edge of edges)if(edge.kind==='branch'){if(parents.has(edge.to))throw new Error('Text can have only one parent.');parents.set(edge.to,edge.from);}return parents;}
export function validateBranches(edges:Edge[]){
 const parents=branchParents(edges),done=new Set<string>();
 for(const id of parents.keys()){const path=new Set<string>();let node:string|undefined=id;while(node&&!done.has(node)){if(path.has(node))throw new Error('Text branches cannot contain a cycle.');path.add(node);node=parents.get(node);}for(const entry of path)done.add(entry);}
}
export function canReconnectBranch(board:Board,edge:Edge){try{validateBranches([...board.edges.filter(e=>e.id!==edge.id),edge]);return true;}catch{return false;}}

export type TextNavigation='parent'|'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight';
export function textNeighbor(board:Board,id:string,direction:TextNavigation){
 const current=board.cards.find(p=>p.id===id);if(!current)return;
 const parents=branchParents(board.edges),parent=parents.get(id);if(direction==='parent')return parent;
 const vertical=direction==='ArrowUp'||direction==='ArrowDown',sign=direction==='ArrowUp'||direction==='ArrowLeft'?-1:1;
 const linked=new Set(board.edges.flatMap(e=>e.from===id?[e.to]:e.to===id?[e.from]:[]));
 return board.cards.filter(p=>p.id!==id&&(vertical?parents.get(p.id)===parent:linked.has(p.id))&&sign*((vertical?p.y:p.x)-(vertical?current.y:current.x))>0).sort((a,b)=>Math.abs((vertical?a.y:a.x)-(vertical?current.y:current.x))-Math.abs((vertical?b.y:b.x)-(vertical?current.y:current.x))||Math.abs((vertical?a.x:a.y)-(vertical?current.x:current.y))-Math.abs((vertical?b.x:b.y)-(vertical?current.x:current.y))||a.id.localeCompare(b.id))[0]?.id;
}
