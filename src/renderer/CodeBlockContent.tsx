import {NodeViewWrapper,NodeViewContent,type NodeViewProps} from '@tiptap/react';
import {codeLanguage,codeLanguages,codeLabel} from './code-highlight';
import {ui} from '../text/ui';
export function CodeBlockContent({node,editor,updateAttributes}:Pick<NodeViewProps,'node'|'editor'|'updateAttributes'>){
 const language=codeLanguage(node.attrs.language??'');
 return <NodeViewWrapper className="editor-code-block">
  <div className="code-block-toolbar" contentEditable={false}><select aria-label={ui.editorTools.codeLanguage} value={language} onChange={e=>{updateAttributes({language:e.target.value==='plaintext'?null:e.target.value});editor.commands.focus();}}>
   {!codeLanguages.includes(language)&&<option value={language}>{codeLabel(language)}</option>}
   {codeLanguages.map(id=><option key={id} value={id}>{codeLabel(id)}</option>)}
  </select></div>
  <pre><NodeViewContent<'code'> as="code"/></pre>
 </NodeViewWrapper>;
}
