import {useMemo,useState} from 'react';
import {NodeViewWrapper,NodeViewContent,type NodeViewProps} from '@tiptap/react';
import {codeLanguage,codeLanguages,codeLabel} from './code-highlight';
import {TextSearch} from '../core/search';
import {PropertyPopover} from './PropertyValue';
import {Icon,MenuCheck} from './Icons';
import {ui} from '../text/ui';
export function CodeBlockContent({node,editor,updateAttributes}:Pick<NodeViewProps,'node'|'editor'|'updateAttributes'>){
 const language=codeLanguage(node.attrs.language??''),[anchor,setAnchor]=useState<HTMLElement|null>(null),[query,setQuery]=useState('');
 const search=useMemo(()=>{const search=new TextSearch();codeLanguages.forEach(id=>search.update({path:id,name:codeLabel(id),title:codeLabel(id),body:id}));return search;},[]);
 const options=query.trim()?search.search(query).map(hit=>hit.path):[...new Set([language,...codeLanguages])];
 const choose=(value:string)=>{updateAttributes({language:value==='plaintext'?null:value});setAnchor(null);editor.commands.focus(undefined,{scrollIntoView:false});};
 return <NodeViewWrapper className="editor-code-block">
  <div className="code-block-toolbar" contentEditable={false}><button type="button" className="code-language-trigger" aria-label={ui.editorTools.codeLanguage} aria-haspopup="listbox" aria-expanded={!!anchor} onPointerDown={e=>e.preventDefault()} onClick={e=>{setAnchor(e.currentTarget);setQuery('');}}>{codeLabel(language)}<Icon name="down" size={12}/></button></div>
  <pre><NodeViewContent<'code'> as="code"/></pre>
  {anchor&&<PropertyPopover anchor={anchor} label={ui.editorTools.codeLanguage} className="code-language-picker" onClose={()=>setAnchor(null)}><input autoFocus type="search" aria-label={ui.editorTools.searchCodeLanguages} placeholder={ui.editorTools.searchLanguages} value={query} onChange={e=>{setQuery(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&options[0]){e.preventDefault();choose(options[0]);}}}/><div className="property-choices" role="listbox" aria-label={ui.editorTools.codeLanguage}>{options.map(id=><button type="button" role="option" aria-selected={id===language} key={id} onClick={()=>choose(id)}><MenuCheck checked={id===language}/><span>{codeLabel(id)}</span></button>)}{!options.length&&<p>{ui.editorTools.noMatchingLanguages}</p>}</div></PropertyPopover>}
 </NodeViewWrapper>;
}
