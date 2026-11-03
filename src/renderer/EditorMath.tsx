import {useEffect,useRef,useState} from 'react';
import {NodeViewWrapper,type NodeViewProps} from '@tiptap/react';
import {PropertyPopover} from './PropertyValue';
import {mathHtml} from './math';
import {ui} from '../text/ui';
export function EditorMath({node,editor,updateAttributes,selected,getPos}:NodeViewProps){
  const [anchor,setAnchor]=useState<HTMLElement|null>(null),[latex,setLatex]=useState('');
  const block=node.type.name==='mathBlock',trigger=useRef<HTMLSpanElement>(null),shown=anchor?latex:node.attrs.latex;
  useEffect(()=>{if(selected&&(!block||!node.attrs.latex)&&trigger.current){setLatex(node.attrs.latex);setAnchor(trigger.current);}},[block,selected,node.attrs.latex]);
  function save(){
    updateAttributes({latex});setAnchor(null);
    const pos=getPos();if(pos===undefined){editor.commands.focus(undefined,{scrollIntoView:false});return;}
    const after=pos+node.nodeSize;
    if(block&&!editor.state.doc.nodeAt(after)?.isTextblock)editor.commands.insertContentAt(after,{type:'paragraph'});
    editor.commands.focus(after+(block?1:0),{scrollIntoView:false});
  }
  return <NodeViewWrapper as={block?'div':'span'} className={'editor-math '+(block?'is-block':'is-inline')+(anchor?' is-editing':'')} contentEditable={false}>
    <span ref={trigger} className="math-render" role="button" tabIndex={0} aria-label={ui.math.edit} aria-haspopup="dialog" aria-expanded={!!anchor} data-tooltip={anchor?undefined:ui.math.edit} onClick={e=>{setLatex(node.attrs.latex);setAnchor(e.currentTarget);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setLatex(node.attrs.latex);setAnchor(e.currentTarget);}}} dangerouslySetInnerHTML={{__html:shown?mathHtml(shown,block):'<span class="muted">'+ui.math.add+'</span>'}}/>
    {anchor&&<PropertyPopover anchor={anchor} label={ui.math.title} className="math-popover" onClose={()=>setAnchor(null)}><form onSubmit={e=>{e.preventDefault();save();}}>
      <textarea aria-label={ui.math.input} spellCheck={false} rows={2} value={latex} onChange={e=>setLatex(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
      <button type="submit" className="math-done">{ui.math.done}<span aria-hidden="true">↵</span></button>
    </form></PropertyPopover>}
  </NodeViewWrapper>;
}
