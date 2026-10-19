import type {Board,Edge} from './shared';
export const topicText={name:'Text',childKey:'Tab',siblingKey:'Enter',new:'New text',child:'Add child text',sibling:'Add sibling text',convert:'Convert to card',edit:'Edit text',finish:'Double-click empty canvas to add text · Esc to cancel'};
// Branches describe board placements, independently of note ownership and ordinary connectors.
function branchParents(edges:Edge[]){const parents=new Map<string,string>();for(const edge of edges)if(edge.kind==='branch'){if(parents.has(edge.to))throw new Error('Text can have only one parent.');parents.set(edge.to,edge.from);}return parents;}
export function validateBranches(edges:Edge[]){
 const parents=branchParents(edges),done=new Set<string>();
 for(const id of parents.keys()){const path=new Set<string>();let node:string|undefined=id;while(node&&!done.has(node)){if(path.has(node))throw new Error('Text branches cannot contain a cycle.');path.add(node);node=parents.get(node);}for(const entry of path)done.add(entry);}
}
export function canReconnectBranch(board:Board,edge:Edge){try{validateBranches([...board.edges.filter(e=>e.id!==edge.id),edge]);return true;}catch{return false;}}
