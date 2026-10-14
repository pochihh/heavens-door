import {matchesBinding} from '../keybindings';
import {featureEnabled} from '../features';
import {ui} from '../text/ui';
import {useContext,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Editor} from '@tiptap/core';
import {TextSearch} from '../core/search';
import {DEFAULT_EDITOR_SETTINGS,type EditorCommand} from '../editor-settings';
import {ViewBlockContext,defaultViewSource} from './ViewBlock';
import {overlayContainer} from './Overlays';
import {PropertyPopover} from './PropertyValue';
import {EditorSymbols} from './EditorSymbols';
import {imageHtml} from './image-layout';
export function EditorCommands({editor}:{editor:Editor}){
  const context=useContext(ViewBlockContext),commands=(context?.snapshot.preferences?.editor??DEFAULT_EDITOR_SETTINGS).commands.filter(c=>c.enabled&&(c.action!=='view'||featureEnabled(context?.snapshot.preferences,'views'))),[trigger,setTrigger]=useState<{from:number;to:number;query:string}|null>(null),[index,setIndex]=useState(0),[symbols,setSymbols]=useState<HTMLElement|null>(null),ref=useRef<HTMLDivElement>(null),ignored=useRef('');
  const search=useMemo(()=>{const engine=new TextSearch();commands.forEach(c=>engine.update({path:c.id,name:c.name,title:c.name,body:c.template??c.action??''}));return engine;},[JSON.stringify(commands)]);
  const hits=trigger?.query?new Set(search.search(trigger.query).map(h=>h.path)):null,shown=commands.filter(c=>!hits||hits.has(c.id));
  useEffect(()=>{const change=()=>{const {$from,empty}=editor.state.selection,query=$from.parent.textBetween(0,$from.parentOffset);if(!editor.isFocused||!empty||$from.parent.type.name!=='paragraph'||!query.startsWith('/')||query.includes('\n')||query.length>80||query===ignored.current){setTrigger(null);return;}setTrigger({from:$from.start(),to:$from.pos,query:query.slice(1)});setIndex(0);};editor.on('transaction',change);editor.on('focus',change);return()=>{editor.off('transaction',change);editor.off('focus',change);};},[editor]);
  const insert=(command:EditorCommand)=>{
    const at=trigger?trigger.from-1:editor.state.selection.from,end=trigger?editor.state.selection.$from.end()+1:editor.state.selection.to;setTrigger(null);ignored.current='';
    if(command.action==='symbols'){editor.chain().focus().deleteRange({from:trigger?.from??at,to:trigger?.to??end}).run();setSymbols(editor.view.dom);return;}
    if(command.action==='search'||command.action==='checkpoint'){editor.chain().focus().deleteRange({from:trigger?.from??at,to:trigger?.to??end}).run();if(command.action==='search')window.dispatchEvent(new Event('editor:search'));else void context?.session.checkpoint().catch(()=>undefined);return;}
    const template=command.action==='image'?imageHtml({kind:'placeholder'}):command.action==='view'?'```view-block\n'+defaultViewSource()+'\n```':command.template??'';
    const token='HEAVENS_CURSOR_'+crypto.randomUUID(),content=template.replace('{{cursor}}',token);
    editor.chain().focus().insertContentAt({from:at,to:end},content,{contentType:'markdown'}).run();
    let found=-1;editor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text?.includes(token))found=pos+node.text.indexOf(token);});if(found>=0)editor.chain().deleteRange({from:found,to:found+token.length}).setTextSelection(found).run();
  };
  useEffect(()=>{const key=(e:KeyboardEvent)=>{
    if(!editor.view.dom.contains(e.target as Node))return;
    if(matchesBinding(e,'symbols',context?.snapshot.preferences?.keybindings,window.door.platform)){e.preventDefault();e.stopPropagation();setSymbols(editor.view.dom);return;}
    if(!trigger)return;
    if(['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)&&!e.isComposing){e.preventDefault();e.stopPropagation();if(e.key==='Escape'){ignored.current='/'+trigger.query;setTrigger(null);}else if(e.key==='Enter'){if(shown[index])insert(shown[index]);}else setIndex(i=>(i+(e.key==='ArrowDown'?1:-1)+Math.max(1,shown.length))%Math.max(1,shown.length));}
  };document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);});
  useLayoutEffect(()=>{if(!trigger||!ref.current)return;const r=editor.view.coordsAtPos(trigger.to),el=ref.current,b=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(innerWidth-b.width-8,r.left))+'px';el.style.top=(r.bottom+b.height+8<innerHeight?r.bottom+6:Math.max(8,r.top-b.height-6))+'px';el.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[trigger,index]);
  useEffect(()=>{const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!editor.view.dom.contains(e.target as Node))setTrigger(null);};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[editor]);
  return <>{trigger&&createPortal(<div ref={ref} className="editor-command-menu" role="listbox" aria-label={ui.editorTools.insertBlock} onPointerDown={e=>e.preventDefault()}>{shown.length?shown.map((command,i)=><button role="option" aria-selected={i===index} key={command.id} onMouseEnter={()=>setIndex(i)} onClick={()=>insert(command)}>{command.name}</button>):<span>{ui.editorTools.noMatchingCommands}</span>}</div>,overlayContainer(editor.view.dom))}{symbols&&<PropertyPopover anchor={symbols} label={ui.editorTools.symbolsAndEmoji} onClose={()=>setSymbols(null)}><EditorSymbols onSelect={text=>{editor.chain().focus().insertContent({type:'text',text}).run();setSymbols(null);}}/></PropertyPopover>}</>;
}
