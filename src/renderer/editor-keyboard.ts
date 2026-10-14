import {Extension,type Editor} from '@tiptap/core';
import {Plugin,TextSelection} from '@tiptap/pm/state';
import {Fragment,type Node as PMNode} from '@tiptap/pm/model';
import {binding,matchesBinding,type Keybindings} from '../keybindings';
import {editorBlocks,isList} from './editor-blocks';

// Change selected item lines, retaining the original depth of unselected children.
export function indentEditorLines(editor:Editor,delta:1|-1){
  const {doc,selection}=editor.state,blocks=editorBlocks(doc),selected=new Set<number>();
  for(const b of blocks.filter(b=>b.item)){
    const item=doc.nodeAt(b.from)!;let end=b.to-1;
    item.forEach((node,offset)=>{if(isList({type:node.type.name}))end=Math.min(end,b.from+1+offset);});
    if(selection.empty?selection.from>b.from&&selection.from<end:selection.from<end&&selection.to>b.from+1)selected.add(b.from);
  }
  if(!selected.size)return false;
  type Item={node:PMNode;list:PMNode;own:PMNode[];depth:number;selected:boolean};
  type Group={list:PMNode;items:{item:Item;children:Group[]}[]};
  const content:PMNode[]=[];
  doc.forEach((node,pos)=>{
    if(!isList({type:node.type.name})){content.push(node);return;}
    const items:Item[]=[];
    const flatten=(list:PMNode,start:number,depth:number)=>list.forEach((item,offset)=>{const at=start+1+offset,own:PMNode[]=[];item.forEach(child=>{if(!isList({type:child.type.name}))own.push(child);});items.push({node:item,list,own,depth,selected:selected.has(at)});item.forEach((child,offset)=>{if(isList({type:child.type.name}))flatten(child,at+1+offset,depth+1);});});
    flatten(node,pos,0);if(!items.some(i=>i.selected)){content.push(node);return;}
    const roots:(Group|PMNode)[]=[],stack:Group[]=[];
    for(const item of items){
      let depth=item.depth+(item.selected?delta:0);
      if(depth<0){roots.push(...item.own);stack.length=0;continue;}
      depth=Math.min(depth,stack.length);
      if(depth&& !stack[depth-1]?.items.length)depth--;
      stack.length=Math.min(stack.length,depth+1);
      let group=stack[depth];
      if(!group||group.list.type!==item.list.type){group={list:item.list,items:[]};stack[depth]=group;if(depth)stack[depth-1].items.at(-1)!.children.push(group);else roots.push(group);}
      group.items.push({item,children:[]});
    }
    const build=(group:Group):PMNode=>group.list.copy(Fragment.from(group.items.map(({item,children})=>item.node.copy(Fragment.from([...item.own,...children.map(build)])))));
    content.push(...roots.map(root=>'items' in root?build(root):root));
  });
  const next=doc.copy(Fragment.from(content));next.check();if(next.eq(doc))return true;
  const locate=(node:PMNode,offset:number,fallback:number)=>{let found=fallback;next.descendants((child,pos)=>{if(child===node)found=pos+1+offset;});return Math.max(1,Math.min(next.content.size-1,found));};
  const from=locate(selection.$anchor.parent,selection.$anchor.parentOffset,selection.anchor),to=locate(selection.$head.parent,selection.$head.parentOffset,selection.head);
  const tr=editor.state.tr.replaceWith(0,doc.content.size,next.content);tr.setSelection(TextSelection.create(tr.doc,from,to));editor.view.dispatch(tr.scrollIntoView());return true;
}
function lineBoundary(editor:Editor,end:boolean){
  const {$head}=editor.state.selection,start=$head.start(),finish=$head.end();let low=start,high=finish;
  try{const top=editor.view.coordsAtPos($head.pos).top;while(low<high){const mid=Math.floor((low+high+(end?1:0))/2),y=editor.view.coordsAtPos(mid,end?-1:1).top;if(end?y<=top+1:y<top-1){if(end)low=mid;else low=mid+1;}else{if(end)high=mid-1;else high=mid;}}return low;}catch{return end?finish:start;}
}
export function cardKeyboard(getBindings:()=>Keybindings|undefined=()=>undefined){return Extension.create({name:'cardKeyboard',priority:10000,addProseMirrorPlugins(){const editor=this.editor;return [new Plugin({props:{handleKeyDown(_view,event){
  if(event.isComposing)return false;const prefs=getBindings(),platform=window.door?.platform??'darwin',match=(id:Parameters<typeof binding>[0],extend=false)=>matchesBinding(event,id,prefs,platform,extend);
  if(match('indent')||match('outdent')){
    if(indentEditorLines(editor,match('indent')?1:-1))return true;
    if(editor.state.selection.$from.parent.isTextblock&&!editor.isActive('table')){if(match('indent'))editor.commands.insertContent('  ');return true;}return false;
  }
  for(const [id,mark] of [['bold','bold'],['italic','italic'],['strike','strike'],['code','code']] as const)if(match(id))return editor.commands.toggleMark(mark);
  if(match('lineStart',true)||match('lineEnd',true)||match('cardStart',true)||match('cardEnd',true)){
    const end=match('lineEnd',true)||match('cardEnd',true),document=match('cardStart',true)||match('cardEnd',true),target=document?(end?TextSelection.atEnd(editor.state.doc).head:TextSelection.atStart(editor.state.doc).head):lineBoundary(editor,end);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc,event.shiftKey?editor.state.selection.anchor:target,target)).scrollIntoView());return true;
  }
  // Block a replaced built-in shortcut instead of silently retaining both bindings.
  if((['bold','italic','strike','code'] as const).some(id=>matchesBinding(event,id,undefined,platform)&&binding(id,prefs)!==binding(id)))return true;
  return false;
}}})];}});}
