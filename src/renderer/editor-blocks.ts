import type {JSONContent} from '@tiptap/core';
import type {Node as PMNode} from '@tiptap/pm/model';
export const isList=(node:{type?:string})=>['bulletList','orderedList','taskList'].includes(node.type??'');
export const isItem=(node:{type?:string})=>node.type==='listItem'||node.type==='taskItem';
export interface EditorBlock {path:number[];from:number;to:number;depth:number;item:boolean}
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
export function moveEditorBlock(document:JSONContent,source:number[],target:number[],edge:'before'|'after',nest=false):JSONContent|null{
  if(!source.length||!source[0]||!target.length||!target[0]||prefix(source,target))return null;
  const doc=structuredClone(document),moving=at(doc,source),destination=at(doc,target),origin=at(doc,source.slice(0,-1));
  if(!moving||!destination)return null;
  if(isItem(moving)&&isItem(destination)&&moving.type!==destination.type)return null;
  if(nest&&(!isItem(moving)||!isItem(destination)))return null;
  const rootTarget=doc.content![target[0]];
  origin.content!.splice(source.at(-1)!,1);
  // Prune empty list containers, retaining each item's own paragraphs and descendants.
  for(let depth=source.length-1;depth>0;depth--){const path=source.slice(0,depth),node=at(doc,path);if(!isList(node)||node.content?.length)break;at(doc,path.slice(0,-1)).content!.splice(path.at(-1)!,1);}
  if(isItem(moving)&&isItem(destination)){
    if(nest){
      let list=destination.content?.at(-1);if(!list||list.type!==origin.type){list={type:origin.type,attrs:origin.attrs,content:[]};destination.content??=[];destination.content.push(list);}list.content!.push(moving);
    }else{
      const find=(node:JSONContent):JSONContent|undefined=>node.content?.includes(destination)?node:node.content?.map(find).find(Boolean);
      const parent=find(doc);if(!parent)return null;parent.content!.splice(parent.content!.indexOf(destination)+(edge==='after'?1:0),0,moving);
    }
  }else{
    const index=doc.content!.indexOf(rootTarget);if(index<0)return null;
    const block=isItem(moving)?{type:origin.type,attrs:origin.attrs,content:[moving]}:moving;
    doc.content!.splice(index+(edge==='after'?1:0),0,block);
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
