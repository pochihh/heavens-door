import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Editor} from '@tiptap/core';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import type {ReferenceTarget} from '../shared';
import {referenceHref} from '../document-links';
import {ViewBlockContext} from './ViewBlock';
import {ReferenceOptions,useReferenceSearch} from './ReferencePicker';
import {overlayContainer} from './Overlays';
import {trackEditorOverlay} from './editor-overlay';
import {ui} from '../text/ui';

export function mentionTrigger(text:string){
  const match=/(?:^|\s)@([^@\n]{0,120})$/.exec(text);
  return match?{offset:text.length-match[1].length-1,query:match[1]}:null;
}
export function EditorMentions({editor,path,action}:{editor:Editor;path:string;action:(label:string,apply:()=>void)=>void}){
  const context=useContext(ViewBlockContext),[trigger,setTrigger]=useState<{from:number;to:number;query:string}|null>(null),[index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),ref=useRef<HTMLDivElement>(null),ignored=useRef<number|null>(null);
  const state=useReferenceSearch(trigger?.query??'',false,[path],!!context&&!!trigger),name=trigger?.query.trim()??'';
  useEffect(()=>{
    const change=()=>{
      const {empty,$from}=editor.state.selection,match=empty&&!editor.isActive('code')&&!editor.isActive('link')&&!$from.parent.type.spec.code?mentionTrigger($from.parent.textBetween(0,$from.parentOffset)):null;
      const from=match?$from.start()+match.offset:null;
      if(!match||!editor.isFocused||from===ignored.current){if(!match)ignored.current=null;setTrigger(null);return;}
      setTrigger(previous=>previous?.from===from&&previous.query===match.query&&previous.to===$from.pos?previous:{from:from!,to:$from.pos,query:match.query});
    };
    editor.on('transaction',change);editor.on('focus',change);return()=>{editor.off('transaction',change);editor.off('focus',change);};
  },[editor]);
  useEffect(()=>{setIndex(0);setError('');},[trigger?.query]);
  const select=(target:ReferenceTarget,range=trigger)=>{
    if(!range||editor.isDestroyed)return;
    ignored.current=range.from;setTrigger(null);
    action(ui.references.insert,()=>editor.chain().focus().insertContentAt({from:range.from,to:range.to},[{type:'text',text:target.name,marks:[{type:'link',attrs:{href:referenceHref(path,target.path)}}]},{type:'text',text:' '}]).run());
  };
  const create=name&&!state.busy&&!state.error&&!state.rows.length&&context?{name,run:()=>{
    if(!trigger||busy)return;setBusy(true);setError('');
    const key=new PluginKey<{from:number;to:number}>('create-mention');
    editor.registerPlugin(new Plugin({key,state:{init:()=>({from:trigger.from,to:trigger.to}),apply:(tr,range)=>({from:tr.mapping.map(range.from,-1),to:tr.mapping.map(range.to,1)})}}));
    void context.session.createSlipboxCard(name).then(card=>{if(editor.isDestroyed)return;const range=key.getState(editor.state);if(range)select({kind:'card',key:'card:'+card.id,path:card.path,name:card.title||card.name},{...range,query:name});}).catch(error=>setError(String(error))).finally(()=>{if(!editor.isDestroyed)editor.unregisterPlugin(key);setBusy(false);});
  }}:undefined;
  const count=state.rows.length+(create?1:0);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!trigger||!editor.view.dom.contains(event.target as Node)||event.isComposing||!['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();if(event.key==='Escape'){ignored.current=trigger.from;setTrigger(null);}else if(!busy){if(event.key==='Enter'){if(state.rows[index])select(state.rows[index]);else create?.run();}else if(count)setIndex(i=>(i+(event.key==='ArrowDown'?1:-1)+count)%count);}
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  });
  useLayoutEffect(()=>{
    if(!trigger||!ref.current)return;
    const element=ref.current;element.showPopover();
    return trackEditorOverlay(editor.view.dom,()=>{if(editor.isDestroyed)return;const rect=editor.view.coordsAtPos(Math.min(trigger.to,editor.state.doc.content.size)),box=element.getBoundingClientRect();element.style.left=Math.max(8,Math.min(innerWidth-box.width-8,rect.left))+'px';element.style.top=(rect.bottom+box.height+8<innerHeight?rect.bottom+5:Math.max(8,rect.top-box.height-5))+'px';});
  },[editor,trigger,state.busy,state.rows.length,busy,error]);
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node)&&!editor.view.dom.contains(event.target as Node))setTrigger(null);};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true);},[editor]);
  return context&&trigger&&createPortal(<div ref={ref} popover="manual" className="editor-command-menu reference-menu" onPointerDown={event=>{event.preventDefault();event.stopPropagation();}}><ReferenceOptions rows={state.rows} index={index} onIndex={setIndex} onSelect={target=>select(target)} create={create} busy={state.busy||busy} error={error||state.error} disabled={busy}/></div>,overlayContainer(editor.view.dom));
}
