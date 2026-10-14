import {useState} from 'react';
import {NodeViewWrapper,type NodeViewProps} from '@tiptap/react';
import {PropertyPopover} from './PropertyValue';
import {mathHtml} from './math';
import {ui} from '../text/ui';
export function EditorMath({node,editor,updateAttributes}:NodeViewProps){
  const [anchor,setAnchor]=useState<HTMLElement|null>(null),[latex,setLatex]=useState('');
  const block=node.type.name==='mathBlock';
  return <NodeViewWrapper as={block?'div':'span'} className={'editor-math '+(block?'is-block':'is-inline')} contentEditable={false}>
    <span className="math-render" role="button" tabIndex={0} aria-label={ui.math.edit} data-tooltip={ui.math.edit} onClick={e=>{setLatex(node.attrs.latex);setAnchor(e.currentTarget);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setLatex(node.attrs.latex);setAnchor(e.currentTarget);}}} dangerouslySetInnerHTML={{__html:node.attrs.latex?mathHtml(node.attrs.latex,block):'<span class="muted">'+ui.math.add+'</span>'}}/>
    {anchor&&<PropertyPopover anchor={anchor} label={ui.math.title} className="math-popover" onClose={()=>setAnchor(null)}><form onSubmit={e=>{e.preventDefault();updateAttributes({latex});setAnchor(null);editor.commands.focus();}}><label>{ui.math.latex}<textarea aria-label={ui.math.input} spellCheck={false} value={latex} onChange={e=>setLatex(e.target.value)}/></label><div className="math-preview" dangerouslySetInnerHTML={{__html:mathHtml(latex,block)}}/><div className="form-actions"><button type="button" onClick={()=>setAnchor(null)}>{ui.common.cancel}</button><button type="submit">{ui.common.save}</button></div></form></PropertyPopover>}
  </NodeViewWrapper>;
}
