import { useEffect, useState } from 'react';
import type { Board, Edge, Placement, Stroke } from '../shared';
import type { Session } from './session';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
export interface BoardSelection {path:string;cards:string[];edges:string[]}
const common=<T,>(values:T[])=>values.every(value=>value===values[0])?values[0]:undefined;
const palette=['#e03131','#f08c00','#f2c94c','#2f9e44','#1c7ed6','#7950f2'];
function Color({label,value,onChange}:{label:string;value:string|undefined;onChange:(color:string|undefined)=>void}) {
  const [custom,setCustom]=useState(value||'#808080');
  useEffect(()=>setCustom(value||'#808080'),[value]);
  return <fieldset className="style-color"><legend>{label}</legend><div>
    <button className={'color-swatch theme '+(value===''?'chosen':'')} aria-label={ui.style.theme} data-tooltip={tooltips.style.theme} onClick={()=>onChange(undefined)}/>
    {palette.map(color=><button key={color} className={'color-swatch '+(value===color?'chosen':'')} style={{background:color}} aria-label={color} data-tooltip={color} onClick={()=>onChange(color)}/>)}
    <input type="color" aria-label={label} data-tooltip={tooltips.style.custom} value={custom} onChange={e=>setCustom(e.target.value)} onBlur={()=>{if(custom!==(value||'#808080'))onChange(custom);}}/>
  </div>{value===undefined&&<small>{ui.style.mixed}</small>}</fieldset>;
}
function Choice({label,value,choices,onChange}:{label:string;value:string|number|boolean|undefined;choices:[string|number|boolean,string][];onChange:(value:string)=>void}) {
  return <label className="style-choice"><span>{label}</span><select aria-label={label} value={value===undefined?'mixed':String(value)} onChange={e=>onChange(e.target.value)}>
    {value===undefined&&<option value="mixed" disabled>{ui.style.mixed}</option>}{choices.map(([v,name])=><option key={String(v)} value={String(v)}>{name}</option>)}
  </select></label>;
}
export function StyleView({board,selection,session}:{board?:Board;selection?:BoardSelection;session:Pick<Session,'board'>}) {
  if(!board)return <p className="empty-label">{ui.style.empty}</p>;
  const cards=board.cards.filter(p=>selection?.cards.includes(p.id)),edges=board.edges.filter(e=>selection?.edges.includes(e.id));
  const count=cards.length+edges.length,items:(Placement|Edge)[]=[...cards,...edges];
  const apply=(patch:Partial<Placement&Edge>)=>{void session.board({...board,cards:board.cards.map(p=>cards.includes(p)?{...p,...patch}:p),edges:board.edges.map(e=>edges.includes(e)?{...e,...patch}:e)},ui.history.styleSelection,board).catch(()=>undefined);};
  const boardStyle=(patch:Partial<Board>)=>{void session.board({...board,...patch},ui.history.styleBoard,board).catch(()=>undefined);};
  const stroke=(values:Stroke[],change:(patch:Stroke)=>void,defaultWidth:number)=><>
    <Color label={ui.style.strokeColor} value={common(values.map(p=>p.strokeColor??''))} onChange={strokeColor=>change({strokeColor})}/>
    <Choice label={ui.style.strokeStyle} value={common(values.map(p=>p.strokeStyle??'solid'))} choices={(['none','solid','dashed','dotted'] as const).map(v=>[v,ui.style[v]])} onChange={strokeStyle=>change({strokeStyle:strokeStyle as Stroke['strokeStyle']})}/>
    <Choice label={ui.style.strokeWidth} value={common(values.map(p=>p.strokeWidth??('from' in p?2:defaultWidth)))} choices={[.5,1,1.5,2,4,8].map(n=>[n,String(n)])} onChange={value=>change({strokeWidth:Number(value)})}/>
  </>;
  const arrows=['none','arrow','triangle','triangle-outline'] as const;
  return <div className="style-view">
    <div className="style-selection">{count?ui.style.selected(count):board.name}</div>
    {!count?<>
      <Color label={ui.style.canvas} value={board.canvasColor??''} onChange={canvasColor=>boardStyle({canvasColor})}/>
      <Color label={ui.style.grid} value={board.gridColor??''} onChange={gridColor=>boardStyle({gridColor})}/>
      <label className="style-check"><input type="checkbox" checked={board.showMentions!==false} data-tooltip={tooltips.style.showMentions} onChange={e=>boardStyle({showMentions:e.target.checked})}/>{ui.style.showMentions}</label>
      <fieldset><legend>{ui.style.mentionLinks}</legend>{stroke([board.mentionStyle??{}],patch=>boardStyle({mentionStyle:{...board.mentionStyle,...patch}}),1.5)}</fieldset>
    </>:<>
      {!!cards.length&&!edges.length&&<Color label={ui.style.fill} value={common(cards.map(p=>p.fillColor??''))} onChange={fillColor=>apply({fillColor})}/>}
      {stroke(items,apply,edges.length&&!cards.length?2:1)}
      {!!edges.length&&!cards.length&&<>
        {(['fromArrowhead','toArrowhead'] as const).map((key,index)=><Choice key={key} label={index?ui.style.targetArrow:ui.style.sourceArrow} value={common(edges.map(e=>e[key]??'none'))} choices={arrows.map(v=>[v,v==='triangle-outline'?ui.style.outline:ui.style[v]])} onChange={value=>apply({[key]:value})}/>)}
        <Choice label={ui.style.labelSize} value={common(edges.map(e=>e.labelSize??14))} choices={[12,14,18,24].map(n=>[n,String(n)])} onChange={v=>apply({labelSize:Number(v)})}/>
        {edges.length===1&&<label className="style-choice"><span>{ui.style.label}</span><input key={edges[0].id+':'+(edges[0].label??'')} aria-label={ui.style.label} maxLength={2000} defaultValue={edges[0].label??''} onBlur={e=>{if(e.target.value!==edges[0].label)apply({label:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>}
      </>}
      {!!cards.length&&!edges.length&&cards.every(p=>!p.folder)&&<>
        <Choice label={ui.style.autoHeight} value={common(cards.map(p=>p.autoHeight!==false))} choices={[[true,ui.common.on],[false,ui.common.off]]} onChange={v=>apply({autoHeight:v==='true'})}/>
        <Choice label={ui.style.collapsed} value={common(cards.map(p=>!!p.collapsed))} choices={[[true,ui.common.on],[false,ui.common.off]]} onChange={v=>apply({collapsed:v==='true'})}/>
      </>}
    </>}
  </div>;
}
