import {readingText} from '../text/reading';
import {DEFAULT_ANNOTATION_COLOR,annotationView,splitAnnotations,withAnnotations,type Annotation} from '../reading';
import {EditorMath} from './EditorMath';
import {ViewBlockContext} from './ViewBlock';
import {DEFAULT_EDITOR_SETTINGS} from '../editor-settings';
import {EditorCommands} from './EditorCommands';
import {imageLayout,imageHtml} from './image-layout';
import {copyImage,imageFiles} from './editor-images';
import { ui } from '../text/ui';
import { useEffect, useContext, useLayoutEffect, useRef, useMemo, useState, type ReactNode } from 'react';
import {createPortal} from 'react-dom';
import {TitleContent,titleSlot} from './TitleContent';
import { EditorContent, useEditor, ReactNodeViewRenderer } from '@tiptap/react';
import type { CardInfo } from '../shared';
import { unsupported, preview } from './markdown';
import { withCardTitle } from '../card-title';
import {EditorControls} from './EditorControls';
import {NodeSelection,Plugin,PluginKey} from '@tiptap/pm/state';
import {EditorMentions} from './EditorMentions';
import {useDocumentLinks} from './DocumentLink';
import {assetPath} from './markdown';
import {EditorImage} from './EditorImage';
import {HtmlContent} from './HtmlContent';
import { ViewBlockNode } from './ViewBlockNode';
import { cardMarkdown, extensions, titleMetadata } from './editor-schema';

export interface EditorFocus { x: number; y: number; scrollTop: number; append?:boolean }
interface Props {noteOnly?:boolean;onAnnotation?:(id:string)=>void; id?:string;onTitleDone?:()=>void;afterTitle?:ReactNode;path:string; body:string; cards:CardInfo[]; onEdit:(body:string,label?:string)=>void; autofocus?:boolean; focusPoint?:EditorFocus; zoom?:number; canvas?:boolean }
// Changing files remounts the editor: effects must never touch a destroyed instance.
export function CardEditor(props:Props) { return <EditableCard key={(props.id??props.path)+':'+props.path.split('/').slice(0,-1).join('/')} {...props}/>; }
function EditableCard({noteOnly=false,onAnnotation,onTitleDone,afterTitle,path,body,onEdit,autofocus=false,focusPoint,zoom=1,canvas=false}:Props) {
  const context=useContext(ViewBlockContext),settings=context?.snapshot.preferences?.editor??DEFAULT_EDITOR_SETTINGS;
  const links=useDocumentLinks(path),bindings=useRef(context?.snapshot.preferences?.keybindings);bindings.current=context?.snapshot.preferences?.keybindings;
  const parsed=annotationView(body),footer=useRef(parsed.footer);footer.current=parsed.footer;
  const content=parsed.content,blocked=!!parsed.error||unsupported(content);const initial=(text:string)=>noteOnly?text:withCardTitle(text);
  const [initialContent]=useState(()=>initial(content));
  const [imageError,setImageError]=useState(''),imageInput=useRef<HTMLInputElement>(null),actionLabel=useRef<string|undefined>(undefined),imageHandler=useRef<(files:File[],position?:number)=>void>(()=>{});
  const [slot]=useState(titleSlot),hasMetadata=!!afterTitle,metadataVisible=useRef(hasMetadata);metadataVisible.current=hasMetadata;
  const configuredExtensions=useMemo(() => [...extensions(path,ReactNodeViewRenderer(props=><ViewBlockNode {...props} path={path}/>),ReactNodeViewRenderer(props=><HtmlContent {...props} path={path}/>),ReactNodeViewRenderer(props=><EditorImage {...props} path={path}/>),ReactNodeViewRenderer(EditorMath),()=>bindings.current),titleMetadata(slot,()=>metadataVisible.current)].filter(e=>!noteOnly||e.name!=='cardTitle'),[path,slot,noteOnly]);
  const editor=useEditor({
    extensions:configuredExtensions,
    content:initialContent,contentType:'markdown',editable:!blocked,
    editorProps:{attributes:{'aria-label':ui.editor.cardContent,spellcheck:'true'},handlePaste:(_view,event)=>{
      const files=imageFiles(event.clipboardData);if(!files.length)return false;event.preventDefault();imageHandler.current(files);return true;
    },handleDrop:(view,event)=>{
      const files=imageFiles(event.dataTransfer);if(!files.length)return false;event.preventDefault();imageHandler.current(files,view.posAtCoords({left:event.clientX,top:event.clientY})?.pos);return true;
    },handleDOMEvents:{copy:(view,event)=>{
      const selection=view.state.selection;if(!(selection instanceof NodeSelection)||!imageLayout(selection.node))return false;
      const item=imageLayout(selection.node);if(item?.kind!=='single')return false;
      const source=assetPath(path,item.src);if(!source)return false;event.preventDefault();void copyImage(source,item.crop,parseFloat(item.width)).catch(error=>setImageError(String(error)));return true;
    }}},
    onUpdate:({editor}) => onEdit(cardMarkdown(editor)+footer.current,actionLabel.current),
  });
  // Map the insertion bookmark through edits made while a file is being imported.
  async function insertImages(files:File[],position?:number){
    if(!editor||editor.isDestroyed||!files.length)return;setImageError('');
    const key=new PluginKey('imageImport'),initial=position??editor.state.selection.to;
    editor.registerPlugin(new Plugin({key,state:{init:()=>initial,apply:(tr,pos)=>tr.mapping.map(pos,1)}}));
    try{
      for(const file of files){
        const image=await window.door.importImage(path,file.name,file.type,new Uint8Array(await file.arrayBuffer()));
        if(editor.isDestroyed)return;
        const at=key.getState(editor.state) as number;
        actionLabel.current=ui.editor.insertImage;
        try{editor.chain().focus().insertContentAt(at,{type:'htmlBlock',attrs:{source:imageHtml({kind:'single',...image,width:settings.imageWidth,alignment:settings.imageAlignment})}}).run();}finally{actionLabel.current=undefined;}
      }
    }catch(error){if(!editor.isDestroyed)setImageError(String(error));}
    finally{if(!editor.isDestroyed)editor.unregisterPlugin(key);}
  }
  imageHandler.current=(files,position)=>{void insertImages(files,position);};
  useLayoutEffect(()=>{if(editor&&!editor.isDestroyed)editor.view.updateState(editor.state);},[editor,hasMetadata]);
  useEffect(() => {
    if (editor && !editor.isDestroyed && cardMarkdown(editor) !== content) editor.commands.setContent(initial(content),{contentType:'markdown',emitUpdate:false});
  },[editor,content]);
  useEffect(() => { if (editor && !editor.isDestroyed) editor.setEditable(!blocked,false); },[editor,blocked]);
  useEffect(() => {
    if (!editor || editor.isDestroyed || !autofocus || blocked) return;
    const scroll=editor.view.dom.closest('.editor-body');
    if (scroll && focusPoint) scroll.scrollTop=focusPoint.scrollTop;
    if(focusPoint?.append){
      const last=editor.state.doc.lastChild;
      if(last?.type.name!=='paragraph'||last.content.size)editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph'});
      editor.commands.focus('end',{scrollIntoView:false});return;
    }
    const position=focusPoint ? editor.view.posAtCoords({left:focusPoint.x,top:focusPoint.y})?.pos : undefined;
    editor.commands.focus(position ?? (focusPoint ? 'end' : 'start'),{scrollIntoView:false});
  },[editor,autofocus,blocked,focusPoint]);
  if(parsed.error)return <div className="editor-body"><p className="reader-message">{parsed.error} {readingText.repairAnnotationFooter}</p><pre>{body}</pre></div>;
  if (blocked) return <div className="editor-body"><p className="notice">{ui.editor.unsupportedMarkdown}</p><TitleContent path={path} className="prose" html={preview(body,path)} afterTitle={afterTitle}/></div>;
  if (!editor) return null;
  return <>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" multiple hidden onChange={e=>{const files=[...e.target.files??[]];e.target.value='';void insertImages(files);}}/>
    {imageError&&<p className="editor-image-error" role="alert">{imageError}</p>}
    <EditorCommands editor={editor}/>
    {links.picker}
    <EditorMentions editor={editor} path={path} action={(label,apply)=>{actionLabel.current=label;try{apply();}finally{actionLabel.current=undefined;}}}/>
    <EditorControls onAnnotate={!noteOnly&&onAnnotation?()=>{const selection=editor.state.selection;if(selection.empty)return;const id='a-'+crypto.randomUUID(),quote=editor.state.doc.textBetween(selection.from,selection.to,' '),value:Annotation={id,kind:'highlight',text:'',quote,color:DEFAULT_ANNOTATION_COLOR};footer.current=splitAnnotations(withAnnotations(cardMarkdown(editor),[...splitAnnotations(body).annotations,value])).footer;actionLabel.current='Add annotation';try{editor.chain().focus().setMark('annotation',{id,color:value.color}).run();}finally{actionLabel.current=undefined;}onAnnotation?.(id);}:undefined} path={path} zoom={zoom} canvas={canvas} editor={editor} onImage={()=>imageInput.current?.click()} action={(label,apply)=>{actionLabel.current=label;try{apply();}finally{actionLabel.current=undefined;}}}/>
    <EditorContent editor={editor} className="prose editor-body" onBlur={e=>{const title=editor.view.dom.firstElementChild;if(title?.contains(e.target as Node)&&!title.contains(e.relatedTarget as Node))onTitleDone?.();}} onClick={links.click} onContextMenu={links.onContextMenu} onPointerDownCapture={event=>{
      if(!canvas||event.button!==0||event.defaultPrevented||(event.target as HTMLElement).closest('button,a,input,[contenteditable=false]'))return;
      const last=editor.view.dom.lastElementChild;if(!last||event.clientY<=last.getBoundingClientRect().bottom)return;
      event.preventDefault();event.stopPropagation();
      if(editor.state.doc.lastChild?.type.name!=='paragraph'||editor.state.doc.lastChild.content.size)editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph'});
      editor.commands.focus('end',{scrollIntoView:false});
    }}/>

    {afterTitle&&createPortal(afterTitle,slot)}
  </>;
}
