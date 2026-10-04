import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Editor,JSONContent} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import type {CardInfo} from '../shared';
import {DEFAULT_PALETTE} from '../colors';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
import {Icon,Tool} from './Icons';
import {ActionMenu,overlayContainer,type MenuState} from './Overlays';
import {PropertyPopover} from './PropertyValue';
import {Color} from './StyleView';
import {defaultViewSource} from './ViewBlock';
import {createDragPhantom} from './sortable';
import {editorBlocks,moveEditorBlock,type EditorBlock} from './editor-blocks';

type Action=(label:string,apply:()=>void)=>void;
export function EditorControls({editor,cards,onImage,action}:{editor:Editor;cards:CardInfo[];onImage:()=>void;action:Action}){
  const [revision,update]=useState(0),[block,setBlock]=useState<EditorBlock|null>(null),[menu,setMenu]=useState<MenuState|null>(null),[popup,setPopup]=useState<{kind:'color'|'link';anchor:HTMLElement}|null>(null),[query,setQuery]=useState('');
  const controls=useRef<HTMLDivElement>(null),bubble=useRef<HTMLDivElement>(null),cancel=useRef<()=>void>(()=>{}),dragging=useRef(false);
  const popupOpen=useRef(false);popupOpen.current=!!menu||!!popup;
  const closeMenu=useCallback(()=>setMenu(null),[]);
  const domFor=(b:EditorBlock)=>editor.view.nodeDOM(b.from) as HTMLElement|null;
  useEffect(()=>{
    const changed=()=>{update(n=>n+1);if(!dragging.current){const blocks=editorBlocks(editor.state.doc);setBlock(blocks.filter(b=>editor.state.selection.from>=b.from&&editor.state.selection.from<b.to).at(-1)??null);}};
    const hover=(event:PointerEvent)=>{
      if(dragging.current||event.buttons||popupOpen.current)return;
      const blocks=editorBlocks(editor.state.doc),target=event.target as Node;
      const found=blocks.filter(b=>domFor(b)?.contains(target)).at(-1);
      if(found)setBlock(found);
    };
    const scroll=()=>{if(!dragging.current)update(n=>n+1);};
    editor.on('transaction',changed);editor.on('blur',changed);editor.on('focus',changed);editor.view.dom.addEventListener('pointermove',hover);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);
    return()=>{editor.off('transaction',changed);editor.off('blur',changed);editor.off('focus',changed);editor.view.dom.removeEventListener('pointermove',hover);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);cancel.current();};
  },[editor]);
  useLayoutEffect(()=>{
    const target=block&&domFor(block),handle=controls.current;
    if(target&&handle){const r=target.getBoundingClientRect(),clip=editor.view.dom.closest('.editor-body')?.getBoundingClientRect();handle.style.left=Math.max(4,r.left-46)+'px';handle.style.top=r.top+'px';handle.style.visibility=!clip||r.top>=clip.top&&r.top<clip.bottom?'visible':'hidden';}
    const el=bubble.current;if(!el)return;
    const selection=window.getSelection();if(!selection?.rangeCount)return;
    const rect=selection.getRangeAt(0).getBoundingClientRect(),size=el.getBoundingClientRect();
    el.style.left=Math.max(8,Math.min(innerWidth-size.width-8,rect.left+(rect.width-size.width)/2))+'px';el.style.top=Math.max(8,rect.top-size.height-8)+'px';
  },[block,revision]);
  const apply=(next:JSONContent|null)=>{if(!next)return;try{editor.schema.nodeFromJSON(next).check();}catch{return;}action(ui.editor.moveBlock,()=>editor.commands.setContent(next));};
  function move(key:'up'|'down'|'indent'|'outdent'){
    if(!block)return;const blocks=editorBlocks(editor.state.doc),siblings=blocks.filter(b=>b.path.length===block.path.length&&b.path.slice(0,-1).every((v,i)=>v===block.path[i])),index=siblings.findIndex(b=>b.from===block.from);
    const target=key==='outdent'?blocks.find(b=>b.path.length===block.path.length-2&&b.path.every((v,i)=>v===block.path[i])):siblings[index+(key==='down'?1:-1)];
    if(target)apply(moveEditorBlock(editor.getJSON(),block.path,target.path,key==='up'?'before':'after',key==='indent'));
  }
  const selection=editor.state.selection,selectedText=!selection.empty&&!(selection instanceof NodeSelection),range={from:selection.from,to:selection.to};
  const format=(apply:()=>void)=>{editor.commands.setTextSelection(range);action(ui.editor.formatting,apply);};
  const add=(node:JSONContent)=>{setMenu(null);const position=block?block.to:editor.state.doc.content.size;action(ui.editor.addBlock,()=>editor.chain().focus().insertContentAt(position,node).run());};
  return createPortal(<>
    {block&&<div ref={controls} className="editor-block-controls" contentEditable={false}>
      <Tool icon="plus" label={ui.editor.addBlock} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setMenu({anchor:e.currentTarget,x:r.left,y:r.bottom,label:ui.editor.addBlock,actions:[
        {label:ui.editor.text,icon:'format',run:()=>add({type:'paragraph'})},
        {label:tooltips.editor.heading,icon:'h1',run:()=>add({type:'heading',attrs:{level:2}})},
        {label:tooltips.editor.bulletList,icon:'list',run:()=>add({type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph'}]}]})},
        {label:tooltips.editor.checklist,icon:'tasks',run:()=>add({type:'taskList',content:[{type:'taskItem',attrs:{checked:false},content:[{type:'paragraph'}]}]})},
        {label:tooltips.editor.quote,icon:'quote',run:()=>add({type:'blockquote',content:[{type:'paragraph'}]})},
        {label:tooltips.editor.codeBlock,icon:'code',run:()=>add({type:'codeBlock'})},
        {label:tooltips.views.add,icon:'database',run:()=>add({type:'codeBlock',attrs:{language:'view-block'},content:[{type:'text',text:defaultViewSource()}]})},
        {label:ui.editor.insertImage,icon:'image',run:()=>{editor.commands.setTextSelection(Math.min(positionAfter(editor,block),editor.state.doc.content.size));onImage();}},
        {label:ui.editor.html,icon:'source',run:()=>add({type:'htmlBlock',attrs:{source:'<div>HTML</div>'}})},
      ]});}}/>
      <Tool icon="grip" className="editor-block-grip" label={ui.editor.dragBlock} onKeyDown={e=>{if(e.altKey&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();move(e.key==='ArrowUp'?'up':e.key==='ArrowDown'?'down':e.key==='ArrowRight'?'indent':'outdent');}}} onContextMenu={e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect();setMenu({anchor:e.currentTarget,x:r.left,y:r.bottom,label:ui.editor.moveBlock,actions:[{label:ui.editor.moveUp,icon:'up',run:()=>move('up')},{label:ui.editor.moveDown,icon:'arrowDown',run:()=>move('down')},...block.item?[{label:ui.editor.indent,icon:'forward' as const,run:()=>move('indent')},{label:ui.editor.outdent,icon:'back' as const,run:()=>move('outdent')}]:[]]});}} onPointerDown={event=>{
        if(event.button!==0)return;event.preventDefault();event.stopPropagation();cancel.current();setMenu(null);setPopup(null);
        const source=domFor(block);if(!source)return;
        const before=editor.state.doc,blocks=editorBlocks(before),rect=source.getBoundingClientRect(),pointer=event.pointerId,startX=event.clientX,startY=event.clientY,offsetY=startY-rect.top,offsetX=startX-rect.left;
        let phantom:HTMLElement|null=null,marker:HTMLElement|null=null,choice:{target:EditorBlock;edge:'before'|'after';nest:boolean}|null=null,active=false;
        const transformed=new Set<HTMLElement>();
        const reset=()=>{transformed.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('transition');});transformed.clear();};
        const movePointer=(e:PointerEvent)=>{
          if(e.pointerId!==pointer)return;if(!active&&Math.hypot(e.clientX-startX,e.clientY-startY)<5)return;e.preventDefault();
          if(!active){active=true;dragging.current=true;phantom=createDragPhantom(source,rect);source.style.opacity='.2';marker=document.createElement('div');marker.className='editor-block-drop';overlayContainer(source).append(marker);document.body.classList.add('list-dragging');}
          if(!editor.state.doc.eq(before)){finish(false);return;}
          reset();phantom!.style.left=e.clientX-offsetX+'px';phantom!.style.top=e.clientY-offsetY+'px';
          const area=editor.view.dom.getBoundingClientRect();choice=null;marker!.hidden=true;
          if(e.clientX<area.left-55||e.clientX>area.right+30||e.clientY<area.top||e.clientY>area.bottom)return;
          const eligible=blocks.filter(b=>!(block.path.length<=b.path.length&&block.path.every((v,i)=>v===b.path[i])));
          let target=eligible.filter(b=>{const r=domFor(b)?.getBoundingClientRect();return r&&e.clientY>=r.top&&e.clientY<=r.bottom;}).at(-1)??eligible.reduce<EditorBlock|undefined>((best,b)=>{const r=domFor(b)?.getBoundingClientRect(),old=best&&domFor(best)?.getBoundingClientRect();return r&&(!old||Math.abs(e.clientY-(r.top+r.bottom)/2)<Math.abs(e.clientY-(old.top+old.bottom)/2))?b:best;},undefined);
          if(!target)return;
          let r=domFor(target)!.getBoundingClientRect();
          while(block.item&&target.item&&target.depth>0&&e.clientX+30<r.left-12){const parent=eligible.find(b=>b.path.length===target!.path.length-2&&b.path.every((v,i)=>v===target!.path[i]));if(!parent)break;target=parent;r=domFor(target)!.getBoundingClientRect();}
          const nest=block.item&&target.item&&e.clientX+30>r.left+24,edge=e.clientY<r.top+r.height/2&&!nest?'before':'after';
          if(!moveEditorBlock(editor.getJSON(),block.path,target.path,edge,nest))return;
          choice={target,edge,nest};marker!.hidden=false;Object.assign(marker!.style,{left:r.left+(nest?24:0)+'px',top:(edge==='before'?r.top:r.bottom)+'px',width:Math.max(30,r.width-(nest?24:0))+'px'});
          // Preview displacement without rearranging ProseMirror's managed DOM.
          if(!nest&&target.path.length===block.path.length&&target.path.slice(0,-1).every((v,i)=>v===block.path[i])){
            const from=block.path.at(-1)!,to=target.path.at(-1)!+(edge==='after'?1:0);
            for(const b of blocks){if(b.path.length!==block.path.length||!b.path.slice(0,-1).every((v,i)=>v===block.path[i]))continue;const index=b.path.at(-1)!,el=domFor(b);if(el&&((to>from&&index>from&&index<to)||(to<from&&index>=to&&index<from))){el.style.transform=`translateY(${to>from?-rect.height:rect.height}px)`;el.style.transition='transform 150ms';transformed.add(el);}}
          }
          const scroll=editor.view.dom.closest('.editor-body');if(scroll){const clip=scroll.getBoundingClientRect();if(e.clientY<clip.top+28)scroll.scrollTop-=8;else if(e.clientY>clip.bottom-28)scroll.scrollTop+=8;}
        };
        const finish=(save:boolean)=>{document.removeEventListener('pointermove',movePointer);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);reset();source.style.removeProperty('opacity');phantom?.remove();marker?.remove();document.body.classList.remove('list-dragging');dragging.current=false;cancel.current=()=>{};if(save&&choice&&editor.state.doc.eq(before))apply(moveEditorBlock(editor.getJSON(),block.path,choice.target.path,choice.edge,choice.nest));};
        const up=(e:PointerEvent)=>{if(e.pointerId===pointer)finish(true);},abort=()=>finish(false),key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();abort();}};
        cancel.current=abort;document.addEventListener('pointermove',movePointer);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
      }}/>
    </div>}
    {selectedText&&(editor.isFocused||popup)&&<div ref={bubble} className="editor-selection-tools" role="toolbar" aria-label={ui.editor.formatting} onPointerDown={e=>e.preventDefault()}>
      <Tool icon="bold" label={tooltips.editor.bold} aria-pressed={editor.isActive('bold')} onClick={()=>format(()=>editor.chain().focus().toggleBold().run())}/>
      <Tool icon="italic" label={tooltips.editor.italic} aria-pressed={editor.isActive('italic')} onClick={()=>format(()=>editor.chain().focus().toggleItalic().run())}/>
      <Tool icon="h1" label={tooltips.editor.heading} onClick={()=>format(()=>editor.chain().focus().toggleHeading({level:1}).run())}/>
      <Tool icon="h2" label={tooltips.editor.subheading} onClick={()=>format(()=>editor.chain().focus().toggleHeading({level:2}).run())}/>
      <Tool icon="list" label={tooltips.editor.bulletList} onClick={()=>format(()=>editor.chain().focus().toggleBulletList().run())}/>
      <Tool icon="tasks" label={tooltips.editor.checklist} onClick={()=>format(()=>editor.chain().focus().toggleTaskList().run())}/>
      <Tool icon="quote" label={tooltips.editor.quote} onClick={()=>format(()=>editor.chain().focus().toggleBlockquote().run())}/>
      <Tool icon="code" label={tooltips.editor.codeBlock} onClick={()=>format(()=>editor.chain().focus().toggleCodeBlock().run())}/>
      <Tool icon="link" label={tooltips.editor.linkToAnotherCard} onClick={e=>{setQuery('');setPopup({kind:'link',anchor:e.currentTarget});}}/>
      <Tool icon="art" label={ui.editor.textColor} onClick={e=>setPopup({kind:'color',anchor:e.currentTarget})}/>
    </div>}
    {menu&&<ActionMenu menu={menu} onClose={closeMenu}/>}
    {popup&&<PropertyPopover anchor={popup.anchor} label={popup.kind==='color'?ui.editor.textColor:ui.editor.linkCard} className="editor-style-popover" onClose={()=>setPopup(null)}>{popup.kind==='color'?<>
      {(['color','background'] as const).map(key=><Color key={key} label={key==='color'?ui.editor.textColor:ui.editor.highlight} palette={DEFAULT_PALETTE} value={editor.getAttributes('textColors')[key]??undefined} onChange={value=>{format(()=>{editor.chain().focus().setMark('textColors',{[key]:value??null}).run();});setPopup(null);}}/>)}
    </>:<><input aria-label={ui.editor.findCardLabel} placeholder={ui.editor.findCardPlaceholder} value={query} onChange={e=>setQuery(e.target.value)}/><div className="view-menu-list">{cards.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).slice(0,30).map(card=><button key={card.id} onClick={()=>{format(()=>editor.chain().focus().setLink({href:'card:'+card.id}).run());setPopup(null);}}><Icon name="note"/>{card.name}</button>)}</div></>}</PropertyPopover>}
  </>,overlayContainer(editor.view.dom));
}
function positionAfter(editor:Editor,block:EditorBlock|null){return block?.to??editor.state.doc.content.size;}
