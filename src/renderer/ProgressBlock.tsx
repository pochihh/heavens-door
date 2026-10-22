import {ui} from '../text/ui';
import {useEffect,useRef} from 'react';
import {NodeViewWrapper,NodeViewContent,type NodeViewProps} from '@tiptap/react';
import {updateCardProgress} from './progress-bar';
export function ProgressBlock({editor,node}:Pick<NodeViewProps,'editor'|'node'>){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{let live=true,queued=false;const update=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(live&&!editor.isDestroyed)updateCardProgress(editor.view.dom);});};update();editor.on('transaction',update);return()=>{live=false;editor.off('transaction',update);};},[editor,node.textContent]);
 return <NodeViewWrapper ref={ref} className="card-progress" data-progress-bar=""><div className="card-progress-heading"><NodeViewContent className="card-progress-label"/><span data-progress-count="" contentEditable={false}/></div><div className="card-progress-track" contentEditable={false} role="progressbar" aria-label={node.textContent||ui.editorTools.taskProgress} aria-valuemin={0} aria-valuemax={100}><div className="card-progress-fill"/></div></NodeViewWrapper>;
}
