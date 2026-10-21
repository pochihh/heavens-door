import {useCallback,useEffect,useId,useRef,useState} from 'react';
import type {Snapshot,ReferenceTarget} from '../shared';
import type {GraphMode,GraphLinkKind,WorkspaceGraph} from '../graph';
import {GraphCanvas} from './graph-canvas';
import {ReferenceOptions,useReferenceSearch} from './ReferencePicker';
import {ActionMenu,type MenuState} from './Overlays';
import {Tool} from './Icons';
import {ui} from '../text/ui';
import type {NavigationMode} from '../layout';

export function GraphView({snapshot,onOpen,onNavigate,onMode,onMain}:{snapshot:Snapshot;onOpen:(key:string)=>void;onNavigate:(key:string,mode:NavigationMode)=>void;onMode:(mode:GraphMode)=>void;onMain?:()=>void}){
  const mode=snapshot.preferences?.graphMode??'2d',[data,setData]=useState<WorkspaceGraph>({nodes:[],links:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[hovered,setHovered]=useState<string>(),[menu,setMenu]=useState<MenuState|null>(null),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),[index,setIndex]=useState(0),[hidden,setHidden]=useState<GraphLinkKind[]>([]);
  const instructions=useId(),resultsId=useId();
  const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<GraphCanvas>(null),open=useRef(onOpen);open.current=onOpen;
  const signature=JSON.stringify([snapshot.cards.map(c=>[c.id,c.path,c.revision]),snapshot.boards.map(b=>[b.path,b.revision]),snapshot.preferences?.cardFolder,snapshot.preferences?.templates,snapshot.preferences?.journal,snapshot.preferences?.trashFolder]);
  useEffect(()=>{let live=true;const timer=setTimeout(()=>{void window.door.request<WorkspaceGraph>({kind:'workspaceGraph'}).then(graph=>{if(live){setData(graph);setLoading(false);setError('');}}).catch(e=>{if(live){setError(String(e));setLoading(false);}});},100);return()=>{live=false;clearTimeout(timer);};},[signature,snapshot.root]);
  useEffect(()=>{if(!canvas.current)return;const view=new GraphCanvas(canvas.current,mode,key=>open.current(key),setHovered);engine.current=view;return()=>{view.dispose();engine.current=null;};},[mode]);
  useEffect(()=>{engine.current?.setData({...data,links:data.links.filter(link=>!hidden.includes(link.kind))});},[data,hidden,mode]);
  const known=new Set(data.nodes.map(n=>n.path)),exclude=snapshot.cards.filter(c=>!known.has(c.path)).map(c=>c.path),results=useReferenceSearch(query,false,exclude,searching),rows=results.rows.filter(r=>known.has(r.path));
  const choose=(target:ReferenceTarget)=>{engine.current?.focus(target.key);setSearching(false);setQuery('');};
  const dismiss=useCallback(()=>setMenu(null),[]),node=data.nodes.find(n=>n.key===hovered);
  const options=(anchor:HTMLElement)=>{const rect=anchor.getBoundingClientRect();setMenu({anchor,x:rect.left,y:rect.bottom,label:ui.graph.options,actions:[...(['membership','reference','mention','edge'] as const).map(kind=>({label:ui.graph[kind],checked:!hidden.includes(kind),checkType:'checkbox' as const,run:()=>setHidden(previous=>previous.includes(kind)?previous.filter(k=>k!==kind):[...previous,kind])})),{label:ui.graph.reset,icon:'sync',separatorBefore:true,run:()=>engine.current?.reset()}]});};
  return <section className="graph-view" aria-label={ui.graph.title}>
    <div className="graph-toolbar"><div className="graph-modes" role="group" aria-label={ui.graph.appearance}>{(['2d','3d'] as const).map(value=><button key={value} aria-pressed={mode===value} onClick={()=>onMode(value)}>{value.toUpperCase()}</button>)}</div><span className="toolbar-spacer"/>{onMain&&<Tool icon="external" label={ui.graph.openMain} onClick={onMain}/>}<Tool icon="search" label={ui.graph.find} aria-expanded={searching} onClick={()=>setSearching(v=>!v)}/><Tool icon="target" label={ui.graph.fit} onClick={()=>engine.current?.fit()}/><Tool icon="more" label={ui.graph.options} onClick={e=>options(e.currentTarget)}/></div>
    {searching&&<div className="graph-search"><input autoFocus role="combobox" aria-label={ui.graph.find} aria-expanded="true" aria-controls={resultsId} aria-activedescendant={rows[index]?`${resultsId}-${index}`:undefined} placeholder={ui.graph.search} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Escape'){e.stopPropagation();setSearching(false);}else if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();if(e.key==='Enter'){if(rows[index])choose(rows[index]);}else if(rows.length)setIndex(i=>(i+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length);}}}/><ReferenceOptions id={resultsId} rows={rows} index={index} onIndex={setIndex} onSelect={choose} busy={results.busy} error={results.error}/></div>}
    <div className="graph-canvas-wrap"><canvas ref={canvas} className="graph-canvas" tabIndex={0} title={node?.name} aria-label={node?ui.graph.canvas+' · '+node.name:ui.graph.canvas} aria-describedby={instructions} onContextMenu={e=>{e.preventDefault();const key=engine.current?.nodeAt(e.nativeEvent);if(!key)return;const n=data.nodes.find(n=>n.key===key);setMenu({x:e.clientX,y:e.clientY,label:n?.name,actions:[{label:n?.kind==='card'?ui.common.openInPopup:ui.common.openInSameTab,icon:n?.kind==='card'?'popup':'map',run:()=>onOpen(key)},{label:ui.common.openInNewTab,icon:'external',run:()=>onNavigate(key,'new')},{label:ui.common.openInAnotherTabGroup,icon:'splitRight',run:()=>onNavigate(key,'other')}]});}}/>{loading&&<p className="graph-message" role="status">{ui.graph.loading}</p>}{error&&<p className="graph-message" role="alert">{error}</p>}</div>
    <div className="graph-status" role="status"><span>{node?.name??ui.graph.counts(data.nodes.length,data.links.filter(l=>!hidden.includes(l.kind)).length)}</span><small aria-hidden={!node}>{node?.path??'\u00a0'}</small></div><p id={instructions} className="graph-help">{mode==='2d'?ui.graph.help2d:ui.graph.help3d}</p>
    {menu&&<ActionMenu menu={menu} onClose={dismiss}/>}
  </section>;
}
