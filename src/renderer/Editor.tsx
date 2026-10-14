import {EditorMath} from './EditorMath';
import {ViewBlockContext} from './ViewBlock';
import {DEFAULT_EDITOR_SETTINGS} from '../editor-settings';
import {EditorCommands} from './EditorCommands';
import {imageLayout,imageHtml} from './image-layout';
import {copyImage} from './editor-images';
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
interface Props { id?:string;onTitleDone?:()=>void;afterTitle?:ReactNode;path:string; body:string; cards:CardInfo[]; onEdit:(body:string,label?:string)=>void; autofocus?:boolean; focusPoint?:EditorFocus; zoom?:number; canvas?:boolean }
// Changing files remounts the editor: effects must never touch a destroyed instance.
export function CardEditor(props:Props) { return <EditableCard key={(props.id??props.path)+':'+props.path.split('/').slice(0,-1).join('/')} {...props}/>; }
function EditableCard({onTitleDone,afterTitle,path,body,onEdit,autofocus=false,focusPoint,zoom=1,canvas=false}:Props) {
  const context=useContext(ViewBlockContext),settings=context?.snapshot.preferences?.editor??DEFAULT_EDITOR_SETTINGS;
  const links=useDocumentLinks(path),bindings=useRef(context?.snapshot.preferences?.keybindings);bindings.current=context?.snapshot.preferences?.keybindings;
  const blocked=unsupported(body);
  const [initialContent]=useState(()=>withCardTitle(body));
  const [imageError,setImageError]=useState(''),imageInput=useRef<HTMLInputElement>(null),actionLabel=useRef<string|undefined>(undefined),imageHandler=useRef<(files:File[],position?:number)=>void>(()=>{});
  const [slot]=useState(titleSlot),hasMetadata=!!afterTitle,metadataVisible=useRef(hasMetadata);metadataVisible.current=hasMetadata;
  const configuredExtensions=useMemo(() => [...extensions(path,ReactNodeViewRenderer(props=><ViewBlockNode {...props} path={path}/>),ReactNodeViewRenderer(props=><HtmlContent {...props} path={path}/>),ReactNodeViewRenderer(props=><EditorImage {...props} path={path}/>),ReactNodeViewRenderer(EditorMath),()=>bindings.current),titleMetadata(slot,()=>metadataVisible.current)],[path,slot]);
  const editor=useEditor({
    extensions:configuredExtensions,
    content:initialContent,contentType:'markdown',editable:!blocked,
    editorProps:{attributes:{'aria-label':ui.editor.cardContent,spellcheck:'true'},handlePaste:(_view,event)=>{
      const files=[...event.clipboardData?.files??[]].filter(file=>file.type.startsWith('image/'));if(!files.length)return false;event.preventDefault();imageHandler.current(files);return true;
    },handleDrop:(view,event)=>{
      const files=[...event.dataTransfer?.files??[]].filter(file=>file.type.startsWith('image/'));if(!files.length)return false;event.preventDefault();imageHandler.current(files,view.posAtCoords({left:event.clientX,top:event.clientY})?.pos);return true;
    },handleDOMEvents:{copy:(view,event)=>{
      const selection=view.state.selection;if(!(selection instanceof NodeSelection)||!imageLayout(selection.node))return false;
      const item=imageLayout(selection.node);if(item?.kind!=='single')return false;
      const source=assetPath(path,item.src);if(!source)return false;event.preventDefault();void copyImage(source,item.crop,parseFloat(item.width)).catch(error=>setImageError(String(error)));return true;
    }}},
    onUpdate:({editor}) => onEdit(cardMarkdown(editor),actionLabel.current),
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
    if (editor && !editor.isDestroyed && cardMarkdown(editor) !== body) editor.commands.setContent(withCardTitle(body),{contentType:'markdown',emitUpdate:false});
  },[editor,body]);
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
  if (blocked) return <div className="editor-body"><p className="notice">{ui.editor.unsupportedMarkdown}</p><TitleContent path={path} className="prose" html={preview(body,path)} afterTitle={afterTitle}/></div>;
  if (!editor) return null;
  return <>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" multiple hidden onChange={e=>{const files=[...e.target.files??[]];e.target.value='';void insertImages(files);}}/>
    {imageError&&<p className="editor-image-error" role="alert">{imageError}</p>}
    <EditorCommands editor={editor}/>
    {links.picker}
    <EditorMentions editor={editor} path={path} action={(label,apply)=>{actionLabel.current=label;try{apply();}finally{actionLabel.current=undefined;}}}/>
    <EditorControls path={path} zoom={zoom} canvas={canvas} editor={editor} onImage={()=>imageInput.current?.click()} action={(label,apply)=>{actionLabel.current=label;try{apply();}finally{actionLabel.current=undefined;}}}/>
    <EditorContent editor={editor} className="prose editor-body" onBlur={e=>{const title=editor.view.dom.firstElementChild;if(title?.contains(e.target as Node)&&!title.contains(e.relatedTarget as Node))onTitleDone?.();}} onClick={links.click} onPointerDownCapture={event=>{
      if(!canvas||event.button!==0||event.defaultPrevented||(event.target as HTMLElement).closest('button,a,input,[contenteditable=false]'))return;
      const last=editor.view.dom.lastElementChild;if(!last||event.clientY<=last.getBoundingClientRect().bottom)return;
      event.preventDefault();event.stopPropagation();
      if(editor.state.doc.lastChild?.type.name!=='paragraph'||editor.state.doc.lastChild.content.size)editor.commands.insertContentAt(editor.state.doc.content.size,{type:'paragraph'});
      editor.commands.focus('end',{scrollIntoView:false});
    }}/>

    {afterTitle&&createPortal(afterTitle,slot)}
  </>;
}
