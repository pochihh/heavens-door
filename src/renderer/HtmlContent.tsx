import {EditorImage} from './EditorImage';
import {parseImageLayout} from './image-layout';
import {useState} from 'react';
import {NodeViewWrapper,type NodeViewProps} from '@tiptap/react';
import {PropertyPopover} from './PropertyValue';
import {previewHtml} from './markdown';
import {ui} from '../text/ui';
import {Tool} from './Icons';

export function HtmlContent(props:{path:string;standalone?:boolean}&NodeViewProps){
  const {node,updateAttributes,path}=props;
  const [anchor,setAnchor]=useState<HTMLElement|null>(null),[draft,setDraft]=useState('');
  const inline=node.type.name==='htmlInline',source=String(node.attrs.source);
  if(!inline&&parseImageLayout(source))return <EditorImage {...props}/>;
  return <NodeViewWrapper as={inline?'span':'div'} className={'html-node'+(inline?' inline':'')} contentEditable={false}>
    <span className="html-rendered" dangerouslySetInnerHTML={{__html:previewHtml(source,path)}}/>
    <Tool icon="source" className="html-source-button" label={ui.editor.editHtml} onClick={e=>{setDraft(source);setAnchor(e.currentTarget);}}/>
    {anchor&&<PropertyPopover anchor={anchor} label={ui.editor.editHtml} className="html-source-popover" onClose={()=>setAnchor(null)}><form onSubmit={e=>{e.preventDefault();updateAttributes({source:draft});setAnchor(null);}}>
      <textarea aria-label={ui.editor.htmlSource} value={draft} spellCheck={false} onChange={e=>setDraft(e.target.value)}/>
      <div className="form-actions"><button type="button" onClick={()=>setAnchor(null)}>{ui.common.cancel}</button><button type="submit" className="primary">{ui.common.save}</button></div>
    </form></PropertyPopover>}
  </NodeViewWrapper>;
}
