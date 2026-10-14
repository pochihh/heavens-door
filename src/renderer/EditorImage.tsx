import {NodeSelection,Selection} from '@tiptap/pm/state';
import {ui} from '../text/ui';
import {useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {NodeViewWrapper,type NodeViewProps} from '@tiptap/react';
import {createPortal} from 'react-dom';
import {trackEditorOverlay} from './editor-overlay';
import {assetPath} from './markdown';
import {PropertyPopover} from './PropertyValue';
import {ActionMenu,overlayContainer,type MenuState} from './Overlays';
import {Tool} from './Icons';
import {copyImage} from './editor-images';
import {ImageCrop} from './ImageCrop';
import {dragImage,suppressDragClick} from './image-drag';
import {imageLayout,imageHtml,row,rowPicture,type Picture,type ImageItem,type ImageLayout} from './image-layout';
import {ViewBlockContext} from './ViewBlock';

export function EditorImage(props:{path:string;standalone?:boolean}&NodeViewProps){
  const {node,editor,getPos}=props,layout=imageLayout(node);
  const ref=useRef<HTMLDivElement>(null),toolbar=useRef<HTMLDivElement>(null),[hovered,setHovered]=useState(false),[anchor,setAnchor]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      if(!(editor.state.selection instanceof NodeSelection)||editor.state.selection.from!==getPos())return;
      const target=event.target as HTMLElement;
      if(target.closest('[data-image-item],.image-row-toolbar,[role=menu],.image-crop-dialog,.property-popover,.editor-block-controls,.editor-selection-tools'))return;
      // Blank space in the image row must not let ProseMirror select the atom again.
      if(ref.current?.contains(target)){event.preventDefault();event.stopPropagation();}
      const position=editor.state.doc.resolve(Math.min(editor.state.doc.content.size,(getPos()??0)+node.nodeSize));
      const selection=Selection.findFrom(position,1,true)??Selection.findFrom(position,-1,true);
      if(selection)editor.view.dispatch(editor.state.tr.setSelection(selection));else if(props.standalone)editor.commands.blur();
    };
    document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);
  },[editor,getPos,node.nodeSize]);
  useEffect(()=>{
    if(layout?.kind!=='row')return;
    const hover=(event:PointerEvent)=>{
      if(event.buttons)return;
      const r=ref.current!.getBoundingClientRect(),target=event.target as Node;
      setHovered(!!toolbar.current?.contains(target)||(event.clientX>=r.left-64&&event.clientX<=r.right+10&&event.clientY>=r.top-8&&event.clientY<=r.bottom+10));
    };
    document.addEventListener('pointermove',hover);return()=>document.removeEventListener('pointermove',hover);
  },[layout?.kind]);
  useLayoutEffect(()=>{
    const tools=toolbar.current;if(!tools)return;
    return trackEditorOverlay(ref.current!,()=>{
      const r=ref.current!.getBoundingClientRect(),area=editor.view.dom.getBoundingClientRect(),clip=editor.view.dom.closest('.editor-body')?.getBoundingClientRect(),viewport=editor.view.dom.closest('.canvas')?.getBoundingClientRect();
      tools.dataset.compact='false';tools.dataset.compact=String(!!editor.view.dom.closest('.board-card')&&r.height<tools.scrollHeight+32);
      tools.style.left=Math.max(4,area.left-12-tools.offsetWidth)+'px';tools.style.top=r.top+28+'px';
      tools.style.visibility=(!clip||r.top+28>=clip.top&&r.top+28<clip.bottom)&&(!viewport||r.top+28>=viewport.top&&r.top+28<viewport.bottom&&area.left>=viewport.left&&area.left<viewport.right)?'visible':'hidden';
    });
  },[hovered,anchor,node,editor,props.selected]);
  if(!layout)return null;
  const save=(value:ImageLayout)=>{const pos=getPos();if(pos===undefined)return;editor.view.dispatch(editor.state.tr.replaceWith(pos,pos+node.nodeSize,editor.schema.nodes.htmlBlock.create({source:imageHtml(value)})));};
  const items=layout.kind==='row'?layout.images:[layout];
  return <NodeViewWrapper ref={ref} className={'editor-image-layout '+(layout.kind==='row'?'is-row':'is-single')} data-image-position={getPos()} contentEditable={false}>
    {layout.kind==='row'&&(hovered||anchor||props.selected)&&createPortal(<div ref={toolbar} className="image-row-toolbar" role="toolbar" aria-label={ui.editorTools.imageRowOptions} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}}>
      <Tool icon="image" label={ui.editorTools.addImage} onClick={()=>save({...layout,images:[...layout.images,{kind:'placeholder'}]})}/><span className="image-toolbar-divider"/>
      {(['flex-start','center','space-between'] as const).map(value=><Tool key={value} icon={value==='flex-start'?'imageLeft':value==='center'?'imageCenter':'imageBetween'} label={'Justify: '+({'flex-start':'start',center:'center','space-between':'space between'} as const)[value]} aria-pressed={layout.justify===value} onClick={()=>save({...layout,justify:value})}/>)}
      <span className="image-toolbar-divider"/><Tool icon="more" label={ui.editorTools.imageRowOptions} className="image-row-more" onClick={e=>setAnchor(anchor?null:e.currentTarget)}/>
    </div>,overlayContainer(ref.current??editor.view.dom))}
    <div className="image-layout-content" style={layout.kind==='row'?{display:'flex',gap:layout.gap,justifyContent:layout.justify,alignItems:layout.alignItems,flexWrap:layout.wrap as CSSProperties['flexWrap']}:{}}>
      {items.map((item,index)=><ImageItemView key={index} item={item} index={index} selected={props.selected} path={props.path} onDrag={e=>{const pos=getPos();if(pos!==undefined)return dragImage(e,editor,pos,index);}} inRow={layout.kind==='row'} onChange={next=>save(layout.kind==='row'?{...layout,images:items.map((v,i)=>i===index?next:v)}:next)} onDuplicate={()=>{if(layout.kind==='row')save({...layout,images:items.flatMap((v,i)=>i===index?[v,structuredClone(v)]:[v])});else {const pos=getPos();if(pos!==undefined)editor.commands.insertContentAt(pos+node.nodeSize,node.toJSON());}}} onRemove={()=>{if(layout.kind==='row'&&items.length>1)save({...layout,images:items.filter((_,i)=>i!==index)});else props.deleteNode();}} onRow={()=>save(row([rowPicture(item),{kind:'placeholder'}]))} onExtract={layout.kind==='row'?()=>{const pos=getPos();if(pos===undefined)return;const remaining=items.filter((_,i)=>i!==index),html=(v:ImageLayout)=>editor.schema.nodes.htmlBlock.create({source:imageHtml(v)});editor.view.dispatch(editor.state.tr.replaceWith(pos,pos+node.nodeSize,[...(remaining.length?[html({...layout,images:remaining})]:[]),html(item)]));}:undefined}/>)}
    </div>
    {anchor&&layout.kind==='row'&&<PropertyPopover anchor={anchor} label={ui.editorTools.imageRow} onClose={()=>setAnchor(null)}><div className="image-row-settings">{([['justify','Justify',['flex-start','center','flex-end','space-between','space-around','space-evenly']],['alignItems','Align',['flex-start','center','flex-end','stretch']],['wrap','Wrap',['wrap','nowrap']]] as const).map(([key,label,options])=><label key={key}>{label}<select value={layout[key]} onChange={e=>save({...layout,[key]:e.target.value})}>{options.map(option=><option key={option}>{option}</option>)}</select></label>)}<label>{ui.editorTools.gap}<input type="number" min="0" max="80" value={layout.gap} onChange={e=>save({...layout,gap:Math.max(0,Math.min(80,Number(e.target.value)))})}/></label><button onClick={()=>save({...row(layout.images)})}>{ui.editorTools.resetLayout}</button><button onClick={()=>save({...layout,images:[...layout.images,{kind:'placeholder'}]})}>{ui.editorTools.addImage}</button><button onClick={()=>void navigator.clipboard.writeText(imageHtml(layout))}>{ui.editorTools.copyHTML}</button><button onClick={()=>{const pos=getPos();if(pos!==undefined)editor.commands.insertContentAt(pos+node.nodeSize,node.toJSON());setAnchor(null);}}>{ui.editorTools.duplicateRow}</button><button className="danger" onClick={()=>{setAnchor(null);props.deleteNode();}}>{ui.editorTools.removeRow}</button></div></PropertyPopover>}
  </NodeViewWrapper>;
}
export function ImageItemView({standalone,item,index,inRow,onChange,onRemove,onDuplicate,onRow,onExtract,path,onDrag,selected,fullWidth,onResizePreview}:{standalone?:boolean;fullWidth?:boolean;onResizePreview?:(width?:number)=>void;selected?:boolean;onDrag?:(e:React.PointerEvent)=>void|(()=>void);item:ImageItem;index:number;inRow:boolean;onChange:(item:ImageItem)=>void;onRemove:()=>void;onDuplicate:()=>void;onRow:()=>void;onExtract?:()=>void;path:string}){
  const context=useContext(ViewBlockContext),defaults=context?.snapshot.preferences?.editor;
  const ref=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null),cancel=useRef<()=>void>(()=>{}),[small,setSmall]=useState(false),[measured,setMeasured]=useState(0),[width,setWidth]=useState<number>(),[menu,setMenu]=useState<MenuState|null>(null),[popup,setPopup]=useState<{kind:'alt'|'replace'|'resolve';anchor:HTMLElement}|null>(null),[draft,setDraft]=useState(''),[crop,setCrop]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[matches,setMatches]=useState<string[]>([]);
  const source=item.kind==='single'?assetPath(path,item.src):'',closeMenu=useCallback(()=>setMenu(null),[]);
  useEffect(()=>{const el=ref.current!,observer=new ResizeObserver(()=>{setSmall(el.getBoundingClientRect().width<280);setMeasured(el.offsetWidth);});observer.observe(el);return()=>{observer.disconnect();cancel.current();};},[]);
  const task=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(String(e));}finally{setBusy(false);}};
  const replace=(src:string,alt:string)=>{onChange(item.kind==='single'?{...item,src,alt:item.alt||alt,crop:undefined}:{kind:'single',src,alt,width:inRow?'220px':defaults?.imageWidth??'100%',alignment:defaults?.imageAlignment??'center'});setPopup(null);};
  const upload=(chosen:File)=>void task(async()=>{const image=await window.door.importImage(path,chosen.name,chosen.type,new Uint8Array(await chosen.arrayBuffer()));replace(image.src,image.alt);});
  const openMenu=(anchor:HTMLElement)=>{if(menu){setMenu(null);return;}const r=anchor.getBoundingClientRect();setMenu({anchor,x:r.left,y:r.bottom,label:ui.editorTools.imageOptions,actions:[
    ...(item.kind==='single'?[
      ...(['left','center','right'] as const).map(value=>({label:'Align '+value,icon:({left:'imageLeft',center:'imageCenter',right:'imageRight'} as const)[value],checked:item.alignment===value,run:()=>onChange({...item,alignment:value})})),
      {label:item.caption!==undefined&&!item.captionHidden?'Hide caption':'Show caption',icon:'text' as const,run:()=>onChange({...item,caption:item.caption??'',captionHidden:item.caption!==undefined&&!item.captionHidden})},
      {label:ui.editorTools.cropImage,icon:'crop' as const,run:()=>setCrop(true)},
      {label:ui.editorTools.replaceImage,icon:'sync' as const,run:()=>{setDraft('');setPopup({kind:'replace',anchor});}},
      {label:ui.editorTools.description,icon:'edit' as const,run:()=>{setDraft(item.alt??'');setPopup({kind:'alt',anchor});}},
      {label:ui.editorTools.copyImage,icon:'copy' as const,separatorBefore:true,run:()=>void task(()=>copyImage(source,item.crop,parseFloat(item.width)))},
      {label:ui.editorTools.copyOriginalImage,icon:'copy' as const,run:()=>void task(()=>copyImage(source))},
      {label:ui.editorTools.originalSize,icon:'resize' as const,run:()=>onChange({...item,width:(ref.current?.querySelector('img')?.naturalWidth||ref.current?.offsetWidth||320)+'px',crop:undefined})},
      {label:ui.editorTools.findImageFile,icon:'folder' as const,run:()=>void task(async()=>{setMatches(await window.door.resolveImage(path,item.src));setPopup({kind:'resolve',anchor});})},
    ]:[]),
    {label:ui.editorTools.copyHTML,icon:'source',run:()=>void task(()=>navigator.clipboard.writeText(imageHtml(item)))},
    ...(!standalone?[{label:ui.editorTools.duplicateImage,icon:'copy' as const,run:onDuplicate}]:[]),
    ...(!standalone&&!inRow?[{label:ui.editorTools.addToRow,icon:'splitRight' as const,run:onRow}]:onExtract?[{label:ui.editorTools.moveOutOfRow,icon:'external' as const,run:onExtract}]:[]),
    {label:ui.editorTools.removeImage,icon:'trash',danger:true,run:onRemove},
  ]});};
  const align=item.kind==='single'?item.alignment:'left',cropScale=item.kind==='single'&&item.crop&&(width||measured)?(width||measured)/parseFloat(item.width):1;
  return <div ref={ref} data-image-item={index} className={'editor-image '+(selected&&!inRow?'selected ':'')+(item.kind==='placeholder'?'image-placeholder':'')} style={{width:width??(fullWidth?'100%':item.kind==='single'?item.width:inRow?'160px':'100%'),maxWidth:standalone?'none':'100%',flex:'0 0 auto',marginLeft:!inRow&&(align==='center'||align==='right')?'auto':undefined,marginRight:!inRow&&(align==='center'||align==='left')?'auto':undefined}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();openMenu(ref.current!);}} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{const image=[...e.dataTransfer.files].find(f=>f.type.startsWith('image/'));if(image){e.preventDefault();e.stopPropagation();upload(image);}}}>
    <input type="file" ref={file} hidden accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml" onChange={e=>{const chosen=e.target.files?.[0];e.target.value='';if(chosen)upload(chosen);}}/>
    {item.kind==='single'?<><div className="image-media" data-shape={item.crop?.shape??'rectangle'}><div className="image-clip" style={item.crop?{overflow:'hidden',height:item.crop.height*cropScale,borderRadius:item.crop.shape==='circle'?'50%':4}:undefined} onPointerDown={e=>{if(onDrag)cancel.current=onDrag(e)??(()=>{});}}><img src={source?window.door.assetUrl(source):undefined} alt={item.alt??''} draggable={false} onError={()=>setError('Image unavailable. Use Find image file in More.')} style={item.crop?{width:item.crop.imgWidth*cropScale,maxWidth:'none',height:'auto',marginLeft:-item.crop.offsetX*cropScale,marginTop:-item.crop.offsetY*cropScale}:undefined}/></div>
      <div className="image-toolbar" role="toolbar" aria-label={ui.editorTools.imageControls}>{!small&&<>{(['left','center','right'] as const).map(value=><Tool key={value} icon={({left:'imageLeft',center:'imageCenter',right:'imageRight'} as const)[value]} label={'Align '+value} aria-pressed={item.alignment===value} onClick={()=>onChange({...item,alignment:value})}/>)}<span className="image-toolbar-divider"/><Tool icon="caption" label={item.caption!==undefined&&!item.captionHidden?'Hide caption':'Show caption'} aria-pressed={item.caption!==undefined&&!item.captionHidden} onClick={()=>{const visible=item.caption!==undefined&&!item.captionHidden;onChange({...item,caption:item.caption??'',captionHidden:visible});if(!visible)requestAnimationFrame(()=>ref.current?.querySelector<HTMLTextAreaElement>('.image-caption')?.focus());}}/><Tool icon="crop" label={ui.editorTools.cropImage} onClick={()=>setCrop(true)}/><Tool icon="sync" label={ui.editorTools.replaceImage} onClick={e=>{setDraft('');setPopup({kind:'replace',anchor:e.currentTarget});}}/><span className="image-toolbar-divider"/></>}<Tool icon="more" label={ui.editorTools.imageOptions} onClick={e=>openMenu(e.currentTarget)}/></div>
      <button className="image-resize" aria-label={ui.editorTools.resizeImage} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const w=Math.max(40,(ref.current?.offsetWidth??320)+(e.key==='ArrowLeft'?-10:10));onChange(resized(item,w,ref.current?.offsetWidth??w));}}} onPointerDown={e=>{
        if(e.button!==0)return;e.preventDefault();e.stopPropagation();cancel.current();const element=ref.current!,r=element.getBoundingClientRect(),scale=r.width/element.offsetWidth,x=e.clientX,start=element.offsetWidth,pointer=e.pointerId;let next=start;
        const move=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;event.preventDefault();next=Math.round(Math.max(40,standalone?start+(event.clientX-x)/scale:Math.min(element.parentElement?.clientWidth??1000,start+(event.clientX-x)/scale)));setWidth(next);onResizePreview?.(next);};
        const end=(save:boolean)=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);setWidth(undefined);onResizePreview?.();cancel.current=()=>{};suppressDragClick();if(save)onChange(resized(item,next,start));};
        const up=(event:PointerEvent)=>{if(event.pointerId===pointer)end(true);},abort=()=>end(false),key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abort();}};cancel.current=abort;document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
      }}/></div>
      {item.caption!==undefined&&!item.captionHidden&&<textarea rows={1} className="image-caption" aria-label={ui.editorTools.imageCaption} placeholder={ui.editorTools.addACaption} value={item.caption} onPointerDown={e=>e.stopPropagation()} onChange={e=>onChange({...item,caption:e.target.value})}/>}
    </>:<><span onPointerDown={e=>{if(onDrag)cancel.current=onDrag(e)??(()=>{});}}>{ui.editorTools.addAnImage}</span><div><button disabled={busy} onClick={()=>file.current?.click()}>{ui.editorTools.upload}</button><button onClick={e=>{setDraft('');setPopup({kind:'replace',anchor:e.currentTarget});}}>{ui.editorTools.link}</button><Tool icon="more" label={ui.editorTools.imageOptions} onClick={e=>openMenu(e.currentTarget)}/></div></>}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
    {popup&&<PropertyPopover anchor={popup.anchor} label={popup.kind==='alt'?'Description':'Image'} className="image-popover" onClose={()=>setPopup(null)}>{popup.kind==='resolve'?<div className="view-menu-list">{matches.length?matches.map(match=><button key={match} onClick={()=>{if(item.kind==='single')onChange({...item,src:match});setError('');setPopup(null);}}>{match}</button>):<p>{ui.editorTools.noMatchingImageFileFound}</p>}</div>:<form onSubmit={e=>{e.preventDefault();if(popup.kind==='alt'&&item.kind==='single'){onChange({...item,alt:draft});setPopup(null);}else void task(async()=>{const result=await window.door.importImageLink(path,draft);replace(result.src,result.alt);});}}>
      {popup.kind==='replace'&&<button type="button" onClick={()=>file.current?.click()}>{ui.editorTools.uploadImage}</button>}<label>{popup.kind==='alt'?'Description':'Image URL or local path'}<input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}/></label><div className="form-actions"><button type="button" onClick={()=>setPopup(null)}>{ui.editorTools.cancel}</button><button type="submit" disabled={busy||popup.kind!=='alt'&&!draft.trim()}>{busy?'Loading…':'Save'}</button></div>
    </form>}</PropertyPopover>}
    {crop&&item.kind==='single'&&<ImageCrop picture={standalone?resized(item,measured||parseFloat(item.width),measured||parseFloat(item.width)):item} path={path} onSave={onChange} onClose={()=>setCrop(false)}/>}
    {error&&<small role="alert" className="editor-image-error">{error}</small>}
  </div>;
}
export function resized(item:Picture,width:number,previous:number):Picture{const scale=width/(item.width.endsWith('px')?parseFloat(item.width):previous);return {...item,width:width+'px',...(item.crop?{crop:{...item.crop,imgWidth:item.crop.imgWidth*scale,height:item.crop.height*scale,offsetX:item.crop.offsetX*scale,offsetY:item.crop.offsetY*scale}}:{})};}
