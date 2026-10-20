import {useEffect,useMemo} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import {extensions} from './editor-schema';
import {readingText} from '../text/reading';
export function AnnotationEditor({path,text,onChange}:{path:string;text:string;onChange:(text:string)=>void}){
 const schema=useMemo(()=>extensions(path).filter(e=>!['cardTitle','cardKeyboard'].includes(e.name)),[path]);
 const editor=useEditor({extensions:schema,content:text,contentType:'markdown',editorProps:{attributes:{'aria-label':readingText.comment,spellcheck:'true'},handleDrop:()=>true},onUpdate:({editor})=>onChange(editor.markdown!.serialize(editor.getJSON()))});
 useEffect(()=>{if(editor&&!editor.isDestroyed&&editor.markdown!.serialize(editor.getJSON())!==text)editor.commands.setContent(text,{contentType:'markdown',emitUpdate:false});},[editor,text]);
 return <EditorContent editor={editor} className="annotation-editor prose"/>;
}
