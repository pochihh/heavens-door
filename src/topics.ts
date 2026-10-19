import type {Board,Edge} from './shared';
export const topicText={name:'Topic',childKey:'Tab',siblingKey:'Enter',new:'New topic',child:'Add child topic',sibling:'Add sibling topic',convert:'Convert to card',edit:'Edit topic',finish:'Double-click empty canvas to add a topic · Esc to cancel'};
// Branches describe board placements, independently of note ownership and ordinary connectors.
function branchParents(edges:Edge[]){const parents=new Map<string,string>();for(const edge of edges)if(edge.kind==='branch'){if(parents.has(edge.to))throw new Error('A topic can have only one parent.');parents.set(edge.to,edge.from);}return parents;}
export function validateBranches(edges:Edge[]){
 const parents=branchParents(edges),done=new Set<string>();
 for(const id of parents.keys()){const path=new Set<string>();let node:string|undefined=id;while(node&&!done.has(node)){if(path.has(node))throw new Error('Topic branches cannot contain a cycle.');path.add(node);node=parents.get(node);}for(const entry of path)done.add(entry);}
}
export function canReconnectBranch(board:Board,edge:Edge){try{validateBranches([...board.edges.filter(e=>e.id!==edge.id),edge]);return true;}catch{return false;}}
