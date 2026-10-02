import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
import { useEffect, useLayoutEffect, useRef, useMemo, useState, type ReactNode } from 'react';
import {createPortal} from 'react-dom';
import {TitleContent,titleSlot} from './TitleContent';
import { EditorContent, useEditor, ReactNodeViewRenderer } from '@tiptap/react';
import type { CardInfo } from '../shared';
import { unsupported, preview } from './markdown';
import { Icon, Tool } from './Icons';
import { withCardTitle } from '../card-title';
import { ViewBlockNode } from './ViewBlockNode';
import { defaultViewSource } from './ViewBlock';
import { cardMarkdown, extensions, titleMetadata } from './editor-schema';

export interface EditorFocus { x: number; y: number; scrollTop: number }
interface Props { afterTitle?:ReactNode;path:string; body:string; cards:CardInfo[]; onEdit:(body:string)=>void; autofocus?:boolean; focusPoint?:EditorFocus }
// Changing files remounts the editor: effects must never touch a destroyed instance.
export function CardEditor(props:Props) { return <EditableCard key={props.path} {...props}/>; }
function EditableCard({afterTitle,path,body,cards,onEdit,autofocus=false,focusPoint}:Props) {
  const blocked=unsupported(body);
  const [initialContent]=useState(()=>withCardTitle(body));
  const [linkQuery,setLinkQuery]=useState('');
  const [slot]=useState(titleSlot),hasMetadata=!!afterTitle,metadataVisible=useRef(hasMetadata);metadataVisible.current=hasMetadata;
  const configuredExtensions=useMemo(() => [...extensions(path,ReactNodeViewRenderer(ViewBlockNode)),titleMetadata(slot,()=>metadataVisible.current)],[path,slot]);
  const editor=useEditor({
    extensions:configuredExtensions,
    content:initialContent,contentType:'markdown',editable:!blocked,
    editorProps:{attributes:{'aria-label':ui.editor.cardContent,spellcheck:'true'}},
    onUpdate:({editor}) => onEdit(cardMarkdown(editor)),
  });
  useLayoutEffect(()=>{if(editor&&!editor.isDestroyed)editor.view.updateState(editor.state);},[editor,hasMetadata]);
  useEffect(() => {
    if (editor && !editor.isDestroyed && cardMarkdown(editor) !== body) editor.commands.setContent(withCardTitle(body),{contentType:'markdown',emitUpdate:false});
  },[editor,body]);
  useEffect(() => { if (editor && !editor.isDestroyed) editor.setEditable(!blocked,false); },[editor,blocked]);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !autofocus || blocked) return;
    const scroll=editor.view.dom.closest('.editor-body');
    if (scroll && focusPoint) scroll.scrollTop=focusPoint.scrollTop;
    const position=focusPoint ? editor.view.posAtCoords({left:focusPoint.x,top:focusPoint.y})?.pos : undefined;
    editor.commands.focus(position ?? (focusPoint ? 'end' : 'start'),{scrollIntoView:false});
  },[editor,autofocus,blocked,focusPoint]);
  if (blocked) return <div className="editor-body"><p className="notice">{ui.editor.unsupportedMarkdown}</p><TitleContent className="prose" html={preview(body,path)} afterTitle={afterTitle}/></div>;
  if (!editor) return null;
  return <>
    <div className="editor-tools" aria-label={ui.editor.formatting}>
      <Tool icon="bold" label={tooltips.editor.bold} onClick={() => editor.chain().focus().toggleBold().run()}/>
      <Tool icon="italic" label={tooltips.editor.italic} onClick={() => editor.chain().focus().toggleItalic().run()}/>
      <Tool icon="h1" label={tooltips.editor.heading} onClick={() => editor.chain().focus().toggleHeading({level:1}).run()}/>
      <Tool icon="h2" label={tooltips.editor.subheading} onClick={() => editor.chain().focus().toggleHeading({level:2}).run()}/>
      <Tool icon="list" label={tooltips.editor.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}/>
      <Tool icon="tasks" label={tooltips.editor.checklist} onClick={() => editor.chain().focus().toggleTaskList().run()}/>
      <Tool icon="quote" label={tooltips.editor.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}/>
      <Tool icon="code" label={tooltips.editor.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}/>
      <Tool icon="database" label={tooltips.views.add} onClick={()=>editor.chain().focus().insertContent([{type:"codeBlock",attrs:{language:"view-block"},content:[{type:"text",text:defaultViewSource()}]},{type:"paragraph"}]).run()}/>
      <details className="link-picker"><summary data-tooltip={tooltips.editor.linkToAnotherCard}><Icon name="link" size={14}/>  {ui.editor.linkCard}</summary><div><input aria-label={ui.editor.findCardLabel} placeholder={ui.editor.findCardPlaceholder} value={linkQuery} onChange={e => setLinkQuery(e.target.value)}/><select aria-label={ui.editor.linkCardLabel} size={5} value="" onChange={e => {
        const card=cards.find(c => c.id === e.target.value);
        if (card) editor.chain().focus().insertContent({type:'text',text:card.name,marks:[{type:'link',attrs:{href:`card:${card.id}`}}]}).run();
        e.target.closest('details')?.removeAttribute('open');
      }}>{cards.filter(c => c.path !== path && !c.legacy && c.name.toLowerCase().includes(linkQuery.toLowerCase())).slice(0,50).map(c => <option key={c.path} value={c.id}>{c.name}</option>)}</select></div></details>
    </div>
    <EditorContent editor={editor} className="prose editor-body" />
    {afterTitle&&createPortal(afterTitle,slot)}
  </>;
}
