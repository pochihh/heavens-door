import {NodeViewWrapper,NodeViewContent,type NodeViewProps} from '@tiptap/react';
import {ViewBlock} from './ViewBlock';
export function ViewBlockNode({node,editor,getPos,deleteNode}:NodeViewProps){
  if(node.attrs.language!=='view-block')return <NodeViewWrapper as="pre"><code><NodeViewContent/></code></NodeViewWrapper>;
  return <NodeViewWrapper><NodeViewContent hidden aria-hidden="true" contentEditable={false} style={{display:"none"}}/><ViewBlock source={node.textContent} onRemove={deleteNode} onChange={source=>{
    const pos=getPos();if(pos===undefined)return;
    editor.view.dispatch(editor.state.tr.replaceWith(pos+1,pos+node.nodeSize-1,source?editor.schema.text(source):[]));
  }}/></NodeViewWrapper>;
}
