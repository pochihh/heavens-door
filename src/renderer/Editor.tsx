import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { CardInfo } from '../shared';
import { unsupported, preview } from './markdown';
import { Icon, Tool } from './Icons';
import { extensions } from './editor-schema';

export interface EditorFocus { x: number; y: number; scrollTop: number }
interface Props { path:string; body:string; cards:CardInfo[]; onEdit:(body:string)=>void; autofocus?:boolean; focusPoint?:EditorFocus }
// Changing files remounts the editor: effects must never touch a destroyed instance.
export function CardEditor(props:Props) { return <EditableCard key={props.path} {...props}/>; }
function EditableCard({path,body,cards,onEdit,autofocus=false,focusPoint}:Props) {
  const blocked=unsupported(body);
  const [linkQuery,setLinkQuery]=useState('');
  const configuredExtensions=useMemo(() => extensions(path),[path]);
  const editor=useEditor({
    extensions:configuredExtensions,
    content:body,contentType:'markdown',editable:!blocked,
    editorProps:{attributes:{'aria-label':'Card content',spellcheck:'true'}},
    onUpdate:({editor}) => onEdit(editor.getMarkdown()),
  });
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.getMarkdown() !== body) editor.commands.setContent(body,{contentType:'markdown',emitUpdate:false});
  },[editor,body]);
  useEffect(() => { if (editor && !editor.isDestroyed) editor.setEditable(!blocked,false); },[editor,blocked]);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !autofocus || blocked) return;
    const scroll=editor.view.dom.closest('.editor-body');
    if (scroll && focusPoint) scroll.scrollTop=focusPoint.scrollTop;
    const position=focusPoint ? editor.view.posAtCoords({left:focusPoint.x,top:focusPoint.y})?.pos : undefined;
    editor.commands.focus(position ?? (focusPoint ? 'end' : 'start'),{scrollIntoView:false});
  },[editor,autofocus,blocked,focusPoint]);
  if (blocked) return <div className="editor-body"><p className="notice">This card contains Markdown extensions this first editor cannot preserve yet. It stays readable; edit the original file in your preferred editor.</p><div className="prose" dangerouslySetInnerHTML={{__html:preview(body,path)}} /></div>;
  if (!editor) return null;
  return <>
    <div className="editor-tools" aria-label="Formatting">
      <Tool icon="bold" label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}/>
      <Tool icon="italic" label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}/>
      <Tool icon="h1" label="Heading" onClick={() => editor.chain().focus().toggleHeading({level:1}).run()}/>
      <Tool icon="h2" label="Subheading" onClick={() => editor.chain().focus().toggleHeading({level:2}).run()}/>
      <Tool icon="list" label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}/>
      <Tool icon="tasks" label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}/>
      <Tool icon="quote" label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}/>
      <Tool icon="code" label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}/>
      <details className="link-picker"><summary data-tooltip="Insert a stable link to another card"><Icon name="link" size={14}/> Link card</summary><div><input aria-label="Find a card to link" placeholder="Find a card…" value={linkQuery} onChange={e => setLinkQuery(e.target.value)}/><select aria-label="Link another card" size={5} value="" onChange={e => {
        const card=cards.find(c => c.id === e.target.value);
        if (card) editor.chain().focus().insertContent({type:'text',text:card.name,marks:[{type:'link',attrs:{href:`card:${card.id}`}}]}).run();
        e.target.closest('details')?.removeAttribute('open');
      }}>{cards.filter(c => c.path !== path && !c.legacy && c.name.toLowerCase().includes(linkQuery.toLowerCase())).slice(0,50).map(c => <option key={c.path} value={c.id}>{c.name}</option>)}</select></div></details>
    </div>
    <EditorContent editor={editor} className="prose editor-body" />
  </>;
}
