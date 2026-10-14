import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent} from 'react';
import type {Snapshot,TagResult} from '../shared';
import {DEFAULT_QUERY_PREFERENCES,sameField,type BlockView,type QueryField,type FieldRef} from '../view-block';
import {panRecords} from './records-pan';
import {useBookmarkDrag} from './sortable';
import {Icon,Tool} from './Icons';
import {ui} from '../text/ui';
import {tooltips} from '../text/tooltips';
const t=ui.views;

export function TableView({view,rows,columns,compact,snapshot,scroll,busy,onEditing,cell,title,onPreview,onSort,onCreate,onMove}:{
  view:BlockView;rows:TagResult[];columns:QueryField[];compact:boolean;snapshot:Snapshot;scroll?:{left:number;top:number};busy:boolean;
  onEditing:(key:string|null)=>void;cell:(row:TagResult,field:QueryField)=>ReactNode;title:(row:TagResult)=>ReactNode;onPreview:(key:string)=>void;
  onSort?:(field:FieldRef,direction:'asc'|'desc')=>void;onCreate?:(anchor:HTMLElement)=>void;
  onMove?:(row:TagResult,position:{before?:string;after?:string})=>Promise<void>;
}){
  const viewport=useRef<HTMLDivElement>(null),body=useRef<HTMLTableSectionElement>(null),cancel=useRef<()=>void>(()=>{}),[error,setError]=useState('');
  useLayoutEffect(()=>{if(viewport.current&&scroll)viewport.current.scrollLeft=scroll.left;},[view.id,scroll]);
  useEffect(()=>()=>cancel.current(),[]);
  async function move(id:string,index:number|null){
    const row=rows.find(row=>row.card.id===id);if(!onMove||!row||index===null||rows.indexOf(row)===index)return;
    const others=rows.filter(r=>r!==row);setError('');onEditing('@move');
    try{await onMove(row,{before:others[index]?.card.id,after:others[index-1]?.card.id});}
    catch(e){setError(String(e).replace(/^Error: /,''));}finally{onEditing(null);}
  }
  const drag=useBookmarkDrag(body,(id,index)=>void move(id,index),'vertical',true,active=>onEditing(active?'@drag':null));
  function pan(event:ReactPointerEvent){
    const el=viewport.current!,target=event.target as HTMLElement;
    if(event.button!==0||busy||el.scrollWidth<=el.clientWidth||target.closest('.view-row-grip,input,textarea,select')||target.closest('[contenteditable]')?.getAttribute('contenteditable')==='true')return;
    cancel.current();cancel.current=panRecords(event,el,scroll);
  }
  const widths=columns.map(f=>f.keys[0]==='file.title'?280:f.type==='number'||f.type==='boolean'?120:f.type==='date'?220:f.type==='status'||f.type==='select'?160:180);
  return <>{error&&<p className="change-removed" role="alert">{error}</p>}<div ref={viewport} className={'view-records '+(compact?'view-compact':'view-table')} onPointerDownCapture={pan} onScroll={e=>{if(scroll)scroll.left=e.currentTarget.scrollLeft;}}>
    <table style={{width:widths.reduce((sum,width)=>sum+width,0)+(onMove?28:0)}}><colgroup>{onMove&&<col style={{width:28}}/>}{columns.map((f,i)=><col key={f.keys.join('\0')} style={{width:widths[i]}}/>)}</colgroup>
      {!compact&&<thead><tr>{onMove&&<th className="view-row-grip-cell" aria-label={t.manual}/>}
      {columns.map(f=><th scope="col" key={f.keys.join('\0')} aria-sort={typeof view.sort==='object'&&sameField(view.sort.field,f.keys)?view.sort.direction==='asc'?'ascending':'descending':undefined}>
        <div className="view-column-heading"><Icon name={f.type==='date'?'calendar':f.type==='boolean'?'checkbox':f.type==='number'?'number':f.type==='status'||f.type==='select'?'list':f.type==='tags'?'tag':f.type==='link'?'link':'format'} size={14}/><span>{f.name}</span>{onSort&&<span className="view-column-sort">{(['asc','desc'] as const).map(direction=><button key={direction} aria-label={(direction==='asc'?t.ascending:t.descending)+' · '+f.name} aria-pressed={typeof view.sort==='object'&&sameField(view.sort.field,f.keys)&&view.sort.direction===direction} onClick={()=>onSort(f.keys,direction)}><Icon name={direction==='asc'?'up':'arrowDown'} size={12}/></button>)}</span>}</div>
        {!(snapshot.preferences?.query??DEFAULT_QUERY_PREFERENCES).mergeProperties&&f.definition&&<small>{f.tags.map(t=>'#'+t).join(', ')}</small>}
      </th>)}</tr></thead>}
      <tbody ref={body}>{rows.map((row,index)=><tr key={row.card.id} data-file-key={row.card.id} data-drag-key={'card:'+row.card.id} data-drag-path={row.card.path} className={compact?'view-compact-row':undefined} onClick={compact?()=>onPreview('card:'+row.card.id):undefined}>
        {onMove&&<td className="view-row-grip-cell"><Tool icon="grip" className="view-row-grip" label={tooltips.views.reorder} disabled={busy} onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.stopPropagation();if(!busy)drag(e,row.card.id,true);}} onKeyDown={e=>{if(!busy&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();void move(row.card.id,Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowUp'?-1:1))));}}}/></td>}
        {columns.map(f=><td key={f.keys.join('\0')} aria-label={compact?f.name:undefined}>{f.keys[0]==='file.title'?title(row):cell(row,f)}</td>)}
      </tr>)}</tbody>
      {onCreate&&<tfoot><tr className="view-new-row"><td colSpan={columns.length+(onMove?1:0)}><button className="view-new-card" onClick={e=>onCreate(e.currentTarget)}><Icon name="plus" size={14}/>{t.newCard}</button></td></tr></tfoot>}
    </table>
  </div></>;
}
