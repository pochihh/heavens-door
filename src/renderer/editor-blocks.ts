import type {JSONContent} from '@tiptap/core';
import type {Node as PMNode} from '@tiptap/pm/model';
export const isList=(node:{type?:string})=>['bulletList','orderedList','taskList'].includes(node.type??'');
export const isItem=(node:{type?:string})=>node.type==='listItem'||node.type==='taskItem';
export interface EditorBlock {path:number[];from:number;to:number;depth:number;item:boolean}
export function editorDropBoundaries<T extends {target:EditorBlock;r:{top:number;bottom:number}}>(blocks:T[],depth:number){
  const groups=new Map<string,T[]>();
  for(const block of blocks){const key=block.target.path.slice(0,-1).join('/');const group=groups.get(key)??[];group.push(block);groups.set(key,group);}
  const boundaries:(T&{edge:'before'|'after';y:number})[]=[];
  for(const group of groups.values())group.forEach((block,i)=>{
    const previous=group[i-1],next=group[i+1];
    boundaries.push({...block,edge:'before',y:previous?(previous.r.bottom+block.r.top)/2:block.r.top});
    // An indented drop is a different operation, so keep its own destination.
    if(!next||block.target.item&&depth>block.target.depth)boundaries.push({...block,edge:'after',y:block.r.bottom});
  });
  return boundaries;
}
export function editorBlocks(doc:PMNode){
  const blocks:EditorBlock[]=[];
  const walk=(node:PMNode,path:number[],pos:number,depth:number)=>{
    if(isList({type:node.type.name}))node.forEach((child,offset,i)=>walk(child,[...path,i],pos+1+offset,depth));
    else{
      const item=isItem({type:node.type.name});blocks.push({path,from:pos,to:pos+node.nodeSize,depth,item});
      if(item)node.forEach((child,offset,i)=>{if(isList({type:child.type.name}))walk(child,[...path,i],pos+1+offset,depth+1);});
    }
  };
  doc.forEach((node,pos,i)=>{if(i)walk(node,[i],pos,0);});return blocks;
}
const at=(doc:JSONContent,path:number[])=>path.reduce((node,i)=>node.content![i],doc);
const prefix=(a:number[],b:number[])=>a.length<=b.length&&a.every((v,i)=>v===b[i]);
// A selection moves complete blocks. Selecting a parent also carries its descendants.
export function selectedEditorBlocks(doc:PMNode,selection:{from:number;to:number},anchor:EditorBlock){
  if(selection.from===selection.to)return [anchor];
  const selected=editorBlocks(doc).filter(block=>{
    const node=doc.nodeAt(block.from)!;
    let ownEnd=block.to;
    if(block.item)node.forEach((child,offset)=>{if(isList({type:child.type.name}))ownEnd=Math.min(ownEnd,block.from+1+offset);});
    return selection.from<ownEnd-1&&selection.to>block.from+1;
  }).filter((block,_,all)=>!all.some(parent=>parent!==block&&prefix(parent.path,block.path)));
  return selected.some(block=>prefix(block.path,anchor.path))?selected:[anchor];
}
export function moveEditorBlock(document:JSONContent,source:number[],target:number[],edge:'before'|'after',nest=false){
  return moveEditorBlocks(document,[source],target,edge,nest);
}
export function moveEditorBlocks(document:JSONContent,sources:number[][],target:number[],edge:'before'|'after',nest=false):JSONContent|null{
  const paths=sources.filter((path,i)=>!sources.some((parent,j)=>j!==i&&prefix(parent,path)&&(parent.length<path.length||j<i)))
    .sort((a,b)=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;});
  if(!paths.length||!target[0]||paths.some(path=>!path[0]||prefix(path,target)||(target.length===1&&prefix(target,path))))return null;
  const doc=structuredClone(document),destination=at(doc,target),rootTarget=doc.content![target[0]],targetParent=at(doc,target.slice(0,-1));
  const moving=paths.map(path=>({node:at(doc,path),parent:at(doc,path.slice(0,-1))}));
  if(!destination||moving.some(m=>!m.node))return null;
  const items=moving.every(m=>isItem(m.node));
  if(items&&isItem(destination)&&moving.some(m=>m.node.type!==destination.type))return null;
  if(nest&&(!items||!isItem(destination)))return null;
  for(const {node,parent} of moving)parent.content!.splice(parent.content!.indexOf(node),1);
  const prune=(node:JSONContent)=>{node.content?.forEach(prune);if(node.content)node.content=node.content.filter(child=>!isList(child)||!!child.content?.length);};prune(doc);
  if(items&&isItem(destination)){
    if(nest){
      for(const {node,parent} of moving){let list=destination.content?.at(-1);if(!list||list.type!==parent.type){list={type:parent.type,attrs:parent.attrs,content:[]};destination.content??=[];destination.content.push(list);}list.content!.push(node);}
    }else targetParent.content!.splice(targetParent.content!.indexOf(destination)+(edge==='after'?1:0),0,...moving.map(m=>m.node));
  }else{
    const index=doc.content!.indexOf(rootTarget);if(index<0)return null;
    const blocks:JSONContent[]=[];let previous:JSONContent|undefined;
    for(const {node,parent} of moving){if(isItem(node)){if(previous===parent)blocks.at(-1)!.content!.push(node);else blocks.push({type:parent.type,attrs:parent.attrs,content:[node]});previous=parent;}else{blocks.push(node);previous=undefined;}}
    doc.content!.splice(index+(edge==='after'?1:0),0,...blocks);
  }
  return JSON.stringify(doc)===JSON.stringify(document)?null:doc;
}
export function changeEditorBlock(document:JSONContent,path:number[],kind:string):JSONContent|null{
  if(!path[0])return null;
  const doc=structuredClone(document),node=at(doc,path),parent=at(doc,path.slice(0,-1)),index=path.at(-1)!;
  if(kind==='delete'){parent.content!.splice(index,1);for(let depth=path.length-1;depth>0;depth--){const p=path.slice(0,depth),value=at(doc,p);if(!isList(value)||value.content?.length)break;at(doc,p.slice(0,-1)).content!.splice(p.at(-1)!,1);}return doc;}
  if(kind==='duplicate'){parent.content!.splice(index+1,0,structuredClone(node));return doc;}
  const content=isItem(node)?node.content??[]:[node],first=content[0];
  if(!first||!['paragraph','heading'].includes(first.type??''))return null;
  const inline=first.content,paragraph:JSONContent={type:'paragraph',content:inline};
  const asList=['bulletList','orderedList','taskList'].includes(kind);
  const convertLists=(value:JSONContent):JSONContent=>isList(value)?{type:kind,content:value.content?.map(child=>({...child,type:kind==='taskList'?'taskItem':'listItem',attrs:kind==='taskList'?{checked:child.attrs?.checked??false}:undefined,content:child.content?.map(convertLists)}))}:value;
  const next:JSONContent[]=asList?[{type:kind,content:[{type:kind==='taskList'?'taskItem':'listItem',...(kind==='taskList'?{attrs:{checked:node.attrs?.checked??false}}:{}),content:[paragraph,...content.slice(1).map(convertLists)]}]}]:[{type:kind.startsWith('heading')?'heading':kind==='codeBlock'?'codeBlock':'paragraph',...(kind.startsWith('heading')?{attrs:{level:Number(kind.slice(-1))}}:{}),content:kind==='codeBlock'?inline?.map(n=>({...n,marks:undefined})):inline},...content.slice(1)];
  if(isItem(node)){
    const grand=at(doc,path.slice(0,-2)),listIndex=path.at(-2)!,before=parent.content!.slice(0,index),after=parent.content!.slice(index+1);
    grand.content!.splice(listIndex,1,...before.length?[{...parent,content:before}]:[],...next,...after.length?[{...parent,content:after}]:[]);
  }else parent.content!.splice(index,1,...next);
  return doc;
}
