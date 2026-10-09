import {featureEnabled} from '../features';
import {trackEditorOverlay} from './editor-overlay';
import {EditorSymbols} from './EditorSymbols';
import {imageHtml} from './image-layout';
import {useContext,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Editor,JSONContent} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import {ReferencePicker} from './ReferencePicker';
import {referenceHref} from '../document-links';
import {DEFAULT_PALETTE} from '../colors';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {Tool} from './Icons';
import {ActionMenu,overlayContainer,type MenuState} from './Overlays';
import {PropertyPopover} from './PropertyValue';
import {Color} from './StyleView';
import {ViewBlockContext,defaultViewSource} from './ViewBlock';
import {createDragPhantom} from './sortable';
import {editorDropBoundaries,editorBlocks,selectedEditorBlocks,moveEditorBlock,moveEditorBlocks,changeEditorBlock,type EditorBlock} from './editor-blocks';

type Action=(label:string,apply:()=>void)=>void;
export function EditorControls({editor,path,onImage,action,zoom=1,canvas=false}:{editor:Editor;path:string;onImage:()=>void;action:Action;zoom?:number;canvas?:boolean}){
  const context=useContext(ViewBlockContext);
  const [revision,update]=useState(0),[block,setBlock]=useState<EditorBlock|null>(null),[menu,setMenu]=useState<MenuState|null>(null),[popup,setPopup]=useState<{kind:'color'|'link'|'symbols';anchor:HTMLElement}|null>(null);
  const controls=useRef<HTMLDivElement>(null),bubble=useRef<HTMLDivElement>(null),cancel=useRef<()=>void>(()=>{}),dragging=useRef(false);
  const popupOpen=useRef(false);popupOpen.current=!!menu||!!popup;
  const closeMenu=useCallback(()=>setMenu(null),[]);
  const domFor=(b:EditorBlock)=>editor.view.nodeDOM(b.from) as HTMLElement|null;
  useEffect(()=>{
    const changed=()=>{update(n=>n+1);if(!dragging.current){const blocks=editorBlocks(editor.state.doc);setBlock(blocks.filter(b=>editor.state.selection.from>=b.from&&editor.state.selection.from<b.to).at(-1)??null);}};
    const hover=(event:PointerEvent)=>{
      if(dragging.current||event.buttons||popupOpen.current)return;
      const blocks=editorBlocks(editor.state.doc),target=event.target as Node;
      let found=blocks.filter(b=>domFor(b)?.contains(target)).at(-1);
      if(found?.item){
        // The path to the shared gutter crosses ancestor list padding. Keep the
        // deepest item on this row, even when the pointer is left of its text.
        const path=found.path;
        found=blocks.filter(b=>path.every((v,i)=>b.path[i]===v)).filter(b=>{const r=domFor(b)?.getBoundingClientRect();return r&&event.clientY>=r.top&&event.clientY<r.bottom;}).at(-1)??found;
      }
      if(found)setBlock(found);
    };
    editor.on('transaction',changed);editor.on('blur',changed);editor.on('focus',changed);editor.view.dom.addEventListener('pointermove',hover);
    return()=>{editor.off('transaction',changed);editor.off('blur',changed);editor.off('focus',changed);editor.view.dom.removeEventListener('pointermove',hover);cancel.current();};
  },[editor]);
  useLayoutEffect(()=>{
    if(!block&&!bubble.current)return;
    return trackEditorOverlay(editor.view.dom,()=>{
      const target=block&&domFor(block),handle=controls.current;
      if(target&&handle){
        const area=editor.view.dom.getBoundingClientRect(),clip=editor.view.dom.closest('.editor-body')?.getBoundingClientRect(),viewport=editor.view.dom.closest('.canvas')?.getBoundingClientRect();
        const scale=canvas&&editor.view.dom.offsetWidth?area.width/editor.view.dom.offsetWidth:zoom;
        const line=target.matches('li')?target.querySelector('p')??target:target,first=line.getBoundingClientRect(),lineHeight=parseFloat(getComputedStyle(line).lineHeight)||24;
        const center=first.top+Math.min(first.height,lineHeight*scale)/2;
        handle.style.left=Math.max(4,area.left-(canvas?24:46))+'px';handle.style.top=(center-13)+'px';
        handle.style.visibility=(!canvas||scale>=.65)&&(!clip||center>=clip.top&&center<clip.bottom)&&(!viewport||center>=viewport.top&&center<viewport.bottom&&area.left>=viewport.left&&area.left<viewport.right)?'visible':'hidden';
      }
      const el=bubble.current,selection=window.getSelection();if(!el||!selection?.rangeCount)return;
      const rect=selection.getRangeAt(0).getBoundingClientRect(),size=el.getBoundingClientRect();
      el.style.left=Math.max(8,Math.min(innerWidth-size.width-8,rect.left+(rect.width-size.width)/2))+'px';el.style.top=Math.max(8,rect.top-size.height-8)+'px';
    });
  },[block,revision,zoom,canvas]);
  const apply=(next:JSONContent|null)=>{if(!next)return;try{editor.schema.nodeFromJSON(next).check();}catch{return;}action(ui.editor.moveBlock,()=>editor.commands.setContent(next));};
  function move(key:'up'|'down'|'indent'|'outdent'){
    if(!block)return;const blocks=editorBlocks(editor.state.doc),siblings=blocks.filter(b=>b.path.length===block.path.length&&b.path.slice(0,-1).every((v,i)=>v===block.path[i])),index=siblings.findIndex(b=>b.from===block.from);
    const target=key==='outdent'?blocks.find(b=>b.path.length===block.path.length-2&&b.path.every((v,i)=>v===block.path[i])):siblings[index+(key==='down'?1:-1)];
    if(target)apply(moveEditorBlock(editor.getJSON(),block.path,target.path,key==='up'?'before':'after',key==='indent'));
  }
  function openBlockMenu(anchor:HTMLElement){
    if(!block)return;if(menu){setMenu(null);return;}const r=anchor.getBoundingClientRect();
    const change=(kind:string)=>{const next=changeEditorBlock(editor.getJSON(),block.path,kind);if(next){try{editor.schema.nodeFromJSON(next).check();action(kind==='delete'?'Delete block':kind==='duplicate'?'Duplicate block':'Turn into',()=>editor.commands.setContent(next));}catch{/* Complex structures keep their source. */}}};
    const node=editor.state.doc.nodeAt(block.from),convertible=node&&(['paragraph','heading'].includes(node.type.name)||block.item);
    setMenu({anchor,x:r.left,y:r.bottom,label:ui.editorTools.blockOptions,actions:[{label:ui.editorTools.duplicateBlock,icon:'copy',run:()=>change('duplicate')},{label:ui.editorTools.deleteBlock,icon:'trash',danger:true,run:()=>change('delete')},...(convertible?[{label:ui.editorTools.turnInto,icon:'format' as const,run:()=>setMenu({anchor,x:r.left,y:r.bottom,label:ui.editorTools.turnIntoLabel,actions:[['paragraph','Text'],['heading1','Heading 1'],['heading2','Heading 2'],['heading3','Heading 3'],['bulletList','Bullet list'],['orderedList','Numbered list'],['taskList','Checklist'],['codeBlock','Code block']].map(([kind,label])=>({label,run:()=>change(kind)}))})}]:[]),{label:ui.editor.moveUp,icon:'up',separatorBefore:true,run:()=>move('up')},{label:ui.editor.moveDown,icon:'arrowDown',run:()=>move('down')},...block.item?[{label:ui.editor.indent,icon:'forward' as const,run:()=>move('indent')},{label:ui.editor.outdent,icon:'back' as const,run:()=>move('outdent')}]:[],{label:ui.editorTools.symbolsAndEmoji,icon:'text',run:()=>setPopup({kind:'symbols',anchor})}]});
  }
  const selection=editor.state.selection,selectedText=!selection.empty&&!(selection instanceof NodeSelection),range={from:selection.from,to:selection.to};
  const format=(apply:()=>void)=>{editor.commands.setTextSelection(range);action(ui.editor.formatting,apply);};
  const addAbove=useRef(false);
  const add=(node:JSONContent)=>{setMenu(null);const position=block?(addAbove.current?block.from:block.to):editor.state.doc.content.size;action(ui.editor.addBlock,()=>editor.chain().focus().insertContentAt(position,node).run());};
  return createPortal(<>
    {block&&(!canvas||zoom>=.65)&&<div ref={controls} className="editor-block-controls" contentEditable={false}>
      <Tool hidden={canvas} icon="plus" label={ui.editor.addBlock} onClick={e=>{addAbove.current=e.altKey;const r=e.currentTarget.getBoundingClientRect();setMenu({anchor:e.currentTarget,x:r.left,y:r.bottom,label:ui.editor.addBlock,actions:[
        {label:ui.editor.text,icon:'format',run:()=>add({type:'paragraph'})},
        {label:tooltips.editor.heading,icon:'h1',run:()=>add({type:'heading',attrs:{level:2}})},
        {label:tooltips.editor.bulletList,icon:'list',run:()=>add({type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph'}]}]})},
        {label:tooltips.editor.checklist,icon:'tasks',run:()=>add({type:'taskList',content:[{type:'taskItem',attrs:{checked:false},content:[{type:'paragraph'}]}]})},
        {label:tooltips.editor.quote,icon:'quote',run:()=>add({type:'blockquote',content:[{type:'paragraph'}]})},
        {label:tooltips.editor.codeBlock,icon:'code',run:()=>add({type:'codeBlock'})},
        ...(featureEnabled(context?.snapshot.preferences,'views')?[{label:tooltips.views.add,icon:'database' as const,run:()=>add({type:'codeBlock',attrs:{language:'view-block'},content:[{type:'text',text:defaultViewSource()}]})}]:[]),
        {label:ui.editor.insertImage,icon:'image',run:()=>add({type:'htmlBlock',attrs:{source:imageHtml({kind:'placeholder'})}})},
        {label:ui.editorTools.uploadImage,icon:'image',run:()=>{editor.commands.setTextSelection(Math.min(positionAfter(editor,block),editor.state.doc.content.size));onImage();}},
        {label:ui.editorTools.symbolsAndEmoji,icon:'text',run:()=>setPopup({kind:'symbols',anchor:controls.current!})},
        {label:ui.editor.html,icon:'source',run:()=>add({type:'htmlBlock',attrs:{source:'<div>HTML</div>'}})},
      ]});}}/>
      <Tool icon="grip" className="editor-block-grip" label={ui.editor.dragBlock} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();move(e.key==='ArrowUp'?'up':e.key==='ArrowDown'?'down':e.key==='ArrowRight'?'indent':'outdent');}}} onClick={e=>openBlockMenu(e.currentTarget)} onContextMenu={e=>{e.preventDefault();openBlockMenu(e.currentTarget);}} onPointerDown={event=>{
        if(event.button!==0)return;event.preventDefault();event.stopPropagation();cancel.current();setMenu(null);setPopup(null);
        const source=domFor(block);if(!source)return;
        const before=editor.state.doc,blocks=editorBlocks(before),sources=selectedEditorBlocks(before,editor.state.selection,block),paths=sources.map(b=>b.path),elements=sources.map(domFor).filter((el):el is HTMLElement=>!!el);
        const rects=elements.map(el=>el.getBoundingClientRect()),rect=new DOMRect(Math.min(...rects.map(r=>r.left)),Math.min(...rects.map(r=>r.top)),Math.max(...rects.map(r=>r.right))-Math.min(...rects.map(r=>r.left)),Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.top)));
        const pointer=event.pointerId,startX=event.clientX,startY=event.clientY,offsetY=startY-rect.top,offsetX=startX-rect.left;
        const allItems=sources.every(b=>b.item),targets:EditorBlock[]=allItems?blocks:[];
        if(!allItems)before.forEach((node,from,index)=>{if(index)targets.push({path:[index],from,to:from+node.nodeSize,depth:0,item:false});});
        let phantom:HTMLElement|null=null,marker:HTMLElement|null=null,choice:{target:EditorBlock;edge:'before'|'after';nest:boolean}|null=null,active=false,frame=0,lastPointer:PointerEvent|null=null;
        const transformed=new Set<HTMLElement>();
        const reset=()=>{transformed.forEach(el=>{el.style.transition='none';el.style.removeProperty('transform');});transformed.clear();};
        const movePointer=(e:PointerEvent)=>{
          lastPointer=e;if(e.pointerId!==pointer)return;if(!active&&Math.hypot(e.clientX-startX,e.clientY-startY)<5)return;e.preventDefault();
          if(!active){active=true;dragging.current=true;phantom=document.createElement('div');Object.assign(phantom.style,{position:'fixed',width:rect.width+'px',height:rect.height+'px',pointerEvents:'none',zIndex:'1000'});phantom.className='editor-block-phantom';overlayContainer(source).append(phantom);
            elements.forEach((el,i)=>{const copy=createDragPhantom(el,rects[i]);Object.assign(copy.style,{position:'absolute',left:(rects[i].left-rect.left)+'px',top:(rects[i].top-rect.top)+'px',background:'transparent'});phantom!.append(copy);el.style.opacity='.2';});marker=document.createElement('div');marker.className='editor-block-drop';overlayContainer(source).append(marker);document.body.classList.add('list-dragging');frame=requestAnimationFrame(autoScroll);}
          if(!editor.state.doc.eq(before)){finish(false);return;}
          reset();phantom!.style.left=e.clientX-offsetX+'px';phantom!.style.top=e.clientY-offsetY+'px';
          const area=editor.view.dom.getBoundingClientRect();choice=null;marker!.hidden=true;
          if(e.clientX<area.left-55||e.clientX>area.right+30||e.clientY<area.top||e.clientY>area.bottom)return;
          const eligible=targets.filter(b=>!paths.some(path=>path.length<=b.path.length&&path.every((v,i)=>v===b.path[i])));
          // Use real block boundaries, never the animated phantom or displaced preview.
          // Horizontal movement selects hierarchy depth; staying in the gutter keeps siblings.
          const depth=Math.max(0,Math.min(...sources.map(b=>b.depth))+Math.round((e.clientX-startX)/(24*zoom)));
          const candidates=editorDropBoundaries(eligible.flatMap(target=>{const r=domFor(target)?.getBoundingClientRect();return r?[{target,r}]:[];}),depth);
          candidates.sort((a,b)=>Math.abs(e.clientY-a.y)+Math.abs(a.target.depth-depth)*12-Math.abs(e.clientY-b.y)-Math.abs(b.target.depth-depth)*12);
          const candidate=candidates[0];if(!candidate)return;
          let target=candidate.target,r=candidate.r;
          while(allItems&&target.item&&target.depth>depth){const parent=eligible.find(b=>b.path.length===target.path.length-2&&b.path.every((v,i)=>v===target.path[i]));if(!parent)break;target=parent;r=domFor(target)!.getBoundingClientRect();}
          const edge=candidate.edge,nest=allItems&&target.item&&depth>target.depth&&edge==='after';
          if(!moveEditorBlocks(editor.getJSON(),paths,target.path,edge,nest))return;
          choice={target,edge,nest};marker!.hidden=false;Object.assign(marker!.style,{left:r.left+(nest?24:0)+'px',top:(target===candidate.target&&!nest?candidate.y:edge==='before'?r.top:r.bottom)+'px',width:Math.max(30,r.width-(nest?24:0))+'px'});
          // Preview displacement without rearranging ProseMirror's managed DOM.
          if(!nest&&sources.every(b=>b.path.length===target.path.length&&b.path.slice(0,-1).every((v,i)=>v===target.path[i]))){
            const first=Math.min(...sources.map(b=>b.path.at(-1)!)),last=Math.max(...sources.map(b=>b.path.at(-1)!)),to=target.path.at(-1)!+(edge==='after'?1:0);
            for(const b of blocks){if(b.path.length!==block.path.length||!b.path.slice(0,-1).every((v,i)=>v===block.path[i]))continue;const index=b.path.at(-1)!,el=domFor(b);if(el&&((to>last&&index>last&&index<to)||(to<first&&index>=to&&index<first))){el.style.transform=`translateY(${to>last?-rect.height/zoom:rect.height/zoom}px)`;el.style.transition='transform 150ms';transformed.add(el);}}
          }
        };
        const autoScroll=()=>{if(!active)return;const scroll=editor.view.dom.closest('.editor-body');if(scroll&&lastPointer){const clip=scroll.getBoundingClientRect(),before=scroll.scrollTop;if(lastPointer.clientY<clip.top+28)scroll.scrollTop-=8;else if(lastPointer.clientY>clip.bottom-28)scroll.scrollTop+=8;if(before!==scroll.scrollTop)movePointer(lastPointer);}if(active)frame=requestAnimationFrame(autoScroll);};
        const finish=(save:boolean)=>{cancelAnimationFrame(frame);document.removeEventListener('pointermove',movePointer);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);reset();elements.forEach(el=>el.style.removeProperty('opacity'));phantom?.remove();marker?.remove();document.body.classList.remove('list-dragging');dragging.current=false;cancel.current=()=>{};if(active){const suppress=(event:MouseEvent)=>{event.preventDefault();event.stopPropagation();};document.addEventListener('click',suppress,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',suppress,true),0);}active=false;if(save&&choice&&editor.state.doc.eq(before))apply(moveEditorBlocks(editor.getJSON(),paths,choice.target.path,choice.edge,choice.nest));};
        const up=(e:PointerEvent)=>{if(e.pointerId===pointer)finish(true);},abort=()=>finish(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
        cancel.current=abort;document.addEventListener('pointermove',movePointer);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
      }}/>
    </div>}
    {selectedText&&(editor.isFocused||popup)&&<div ref={bubble} className="editor-selection-tools" role="toolbar" aria-label={ui.editor.formatting} onPointerDown={e=>e.preventDefault()}>
      <Tool icon="bold" label={tooltips.editor.bold} aria-pressed={editor.isActive('bold')} onClick={()=>format(()=>editor.chain().focus().toggleBold().run())}/>
      <Tool icon="italic" label={tooltips.editor.italic} aria-pressed={editor.isActive('italic')} onClick={()=>format(()=>editor.chain().focus().toggleItalic().run())}/>
      <Tool icon="strike" label={ui.editorTools.strikethrough} aria-pressed={editor.isActive('strike')} onClick={()=>format(()=>editor.chain().focus().toggleStrike().run())}/>
      <Tool icon="code" label={ui.editorTools.inlineCode} aria-pressed={editor.isActive('code')} onClick={()=>format(()=>editor.chain().focus().toggleCode().run())}/>
      <Tool icon="link" label={tooltips.editor.linkToAnotherCard} onClick={e=>{setPopup({kind:'link',anchor:e.currentTarget});}}/>
      <Tool icon="art" label={ui.editor.textColor} onClick={e=>setPopup({kind:'color',anchor:e.currentTarget})}/>
    </div>}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
    {popup&&<PropertyPopover anchor={popup.anchor} label={popup.kind==='color'?ui.editor.textColor:popup.kind==='symbols'?'Symbols and emoji':ui.editor.linkCard} className="editor-style-popover" onClose={()=>setPopup(null)}>{popup.kind==='symbols'?<EditorSymbols onSelect={text=>{format(()=>editor.chain().focus().insertContent({type:'text',text}).run());setPopup(null);}}/>:popup.kind==='color'?<>
      {(['color','background'] as const).map(key=><Color key={key} label={key==='color'?ui.editor.textColor:ui.editor.highlight} palette={DEFAULT_PALETTE} value={editor.getAttributes('textColors')[key]??undefined} onChange={value=>{format(()=>{editor.chain().focus().setMark('textColors',{[key]:value??null}).run();});setPopup(null);}}/>)}
    </>:<><ReferencePicker exclude={[path]} onCreate={context?async name=>{const card=await context.session.createSlipboxCard(name);format(()=>editor.chain().focus().setLink({href:referenceHref(path,card.path)}).run());setPopup(null);}:undefined} onSelect={target=>{format(()=>editor.chain().focus().setLink({href:referenceHref(path,target.path)}).run());setPopup(null);}} onURL={href=>{format(()=>editor.chain().focus().setLink({href}).run());setPopup(null);}}/><div className="property-popup-actions"><button type="button" className="danger" onClick={()=>{format(()=>editor.chain().focus().unsetLink().run());setPopup(null);}}>{ui.editorTools.removeLink}</button></div></>}</PropertyPopover>}
  </>,overlayContainer(editor.view.dom));
}
function positionAfter(editor:Editor,block:EditorBlock|null){return block?.to??editor.state.doc.content.size;}
