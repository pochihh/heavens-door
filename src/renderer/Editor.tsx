import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { CardInfo } from '../shared';
import { unsupported, preview } from './markdown';
import { extensions } from './editor-schema';

export function CardEditor({path,body,cards,onEdit}:{path:string;body:string;cards:CardInfo[];onEdit:(body:string)=>void}) {
  const blocked=unsupported(body);
  const [linkQuery,setLinkQuery]=useState('');
  const editor=useEditor({
    extensions:extensions(path),
    content:body,contentType:'markdown',editable:!blocked,
    editorProps:{attributes:{'aria-label':'Card content',spellcheck:'true'}},
    onUpdate:({editor}) => onEdit(editor.getMarkdown()),
  },[path]);
  useEffect(() => {
    if (editor && editor.getMarkdown() !== body) editor.commands.setContent(body,{contentType:'markdown',emitUpdate:false});
  },[editor,body]);
  useEffect(() => { editor?.setEditable(!blocked); },[editor,blocked]);
  if (blocked) return <div className="editor-body"><p className="notice">This card contains Markdown extensions this first editor cannot preserve yet. It stays readable; edit the original file in your preferred editor.</p><div className="prose" dangerouslySetInnerHTML={{__html:preview(body,path)}} /></div>;
  if (!editor) return null;
  return <>
    <div className="editor-tools" aria-label="Formatting">
      <button title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
      <button title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
      <button title="Heading" onClick={() => editor.chain().focus().toggleHeading({level:1}).run()}>H1</button>
      <button title="Subheading" onClick={() => editor.chain().focus().toggleHeading({level:2}).run()}>H2</button>
      <button title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>☷</button>
      <button title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</button>
      <button title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>❞</button>
      <button title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>&lt;/&gt;</button>
      <details className="link-picker"><summary>↗ Link card</summary><div><input aria-label="Find a card to link" placeholder="Find a card…" value={linkQuery} onChange={e => setLinkQuery(e.target.value)}/><select aria-label="Link another card" size={5} value="" onChange={e => {
        const card=cards.find(c => c.id === e.target.value);
        if (card) editor.chain().focus().insertContent({type:'text',text:card.name,marks:[{type:'link',attrs:{href:`card:${card.id}`}}]}).run();
        e.target.closest('details')?.removeAttribute('open');
      }}>{cards.filter(c => c.path !== path && !c.legacy && c.name.toLowerCase().includes(linkQuery.toLowerCase())).slice(0,50).map(c => <option key={c.path} value={c.id}>{c.name}</option>)}</select></div></details>
    </div>
    <EditorContent editor={editor} className="prose editor-body" />
  </>;
}
