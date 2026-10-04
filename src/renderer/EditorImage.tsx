import {useCallback,useEffect,useRef,useState,type MouseEvent} from 'react';
import {NodeViewWrapper,type NodeViewProps} from '@tiptap/react';
import {assetPath} from './markdown';
import {PropertyPopover} from './PropertyValue';
import {ActionMenu,type MenuState} from './Overlays';
import {Tool} from './Icons';
import {copyImage} from './editor-images';
import {ui} from '../text/ui';

export function EditorImage({node,updateAttributes,path,selected,editor,getPos,deleteNode}:{path:string}&NodeViewProps){
  const [menu,setMenu]=useState<MenuState|null>(null),[anchor,setAnchor]=useState<HTMLElement|null>(null),[alt,setAlt]=useState(''),[error,setError]=useState(''),[width,setWidth]=useState<number>();
  const cancel=useRef<()=>void>(()=>{}),source=assetPath(path,String(node.attrs.src)),ref=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>cancel.current(),[]);
  const closeMenu=useCallback(()=>setMenu(null),[]);
  const copy=()=>{setError('');void copyImage(source).catch(error=>setError(String(error)));};
  const open=(button:HTMLElement)=>{if(menu){setMenu(null);return;}setError('');const rect=button.getBoundingClientRect();setMenu({anchor:button,label:ui.editor.imageOptions,x:rect.right,y:rect.bottom+4,actions:[
    {label:ui.editor.copyImage,icon:'copy',disabled:!source,run:copy},
    {label:ui.editor.imageDescription,icon:'edit',run:()=>{setAlt(String(node.attrs.alt??''));setAnchor(button);}},
    {label:ui.editor.originalImageSize,icon:'resize',run:()=>updateAttributes({width:null,height:null,html:true})},
    {label:ui.editor.duplicateImage,icon:'copy',separatorBefore:true,run:()=>{const position=getPos();if(position!==undefined)editor.commands.insertContentAt(position+node.nodeSize,node.toJSON());}},
    {label:ui.editor.removeImage,icon:'trash',danger:true,run:deleteNode},
  ]});};
  return <NodeViewWrapper ref={ref} className={'editor-image'+(selected?' selected':'')} contentEditable={false} style={{width:width??node.attrs.width??undefined,maxWidth:'100%'}} onContextMenu={(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();open(ref.current!);}}>
    <img src={source?window.door.assetUrl(source):undefined} alt={String(node.attrs.alt??'')} title={node.attrs.title??undefined} width={width??node.attrs.width??undefined} height={width?undefined:node.attrs.height??undefined} draggable={false}/>
    <Tool icon="more" className="image-options" label={ui.editor.imageOptions} onClick={e=>open(e.currentTarget)}/>
    <button className="image-resize" aria-label={ui.editor.resizeImage} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();updateAttributes({width:Math.max(40,Number(node.attrs.width??ref.current?.clientWidth??320)+(e.key==='ArrowLeft'?-10:10)),height:null,html:true});}}} onPointerDown={e=>{
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();cancel.current();
      const rect=ref.current!.getBoundingClientRect(),scale=rect.width/ref.current!.offsetWidth,start=e.clientX,pointer=e.pointerId,max=(ref.current!.parentElement?.clientWidth??rect.width);
      let next=rect.width/scale;
      const move=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;event.preventDefault();next=Math.round(Math.max(40,Math.min(max,rect.width/scale+(event.clientX-start)/scale)));setWidth(next);};
      const finish=(save:boolean)=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);setWidth(undefined);cancel.current=()=>{};if(save)updateAttributes({width:next,height:null,html:true});};
      const up=(event:PointerEvent)=>{if(event.pointerId===pointer)finish(true);},abort=()=>finish(false),key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abort();}};
      cancel.current=abort;document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
    }}/>
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
    {anchor&&<PropertyPopover anchor={anchor} label={ui.editor.imageDescription} className="image-popover" onClose={()=>setAnchor(null)}><form onSubmit={e=>{e.preventDefault();updateAttributes({alt,html:true});setAnchor(null);}}>
      <label>{ui.editor.imageDescription}<input value={alt} onChange={e=>setAlt(e.target.value)}/></label>
      <div className="form-actions"><button type="button" onClick={()=>setAnchor(null)}>{ui.common.cancel}</button><button type="submit" className="primary">{ui.common.save}</button></div>
    </form></PropertyPopover>}
    {error&&<small className="editor-image-error" role="alert">{error}</small>}
  </NodeViewWrapper>;
}
