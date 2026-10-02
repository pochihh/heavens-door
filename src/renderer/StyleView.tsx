import { useEffect, useState, type ReactNode } from 'react';
import type { Arrowhead, Board, CardInfo, Edge, PaletteColor, Stroke } from '../shared';
import { DEFAULT_PALETTE, cardFill, isHexColor } from '../colors';
import type { Session } from './session';
import { Icon, Tool } from './Icons';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
export interface BoardSelection {path:string;cards:string[];edges:string[]}
const DEFAULT_EDGE_WIDTHS=[1,2,4] as const;
const ARROWHEAD_STYLES=['arrow','triangle','triangle-outline'] as const;
const hasArrow=(value:Arrowhead|undefined):value is Exclude<Arrowhead,'none'>=>!!value&&value!=='none';
const common=<T,>(values:T[])=>values.every(value=>value===values[0])?values[0]:undefined;
export function Color({label,value,palette,onChange}:{label:string;value:string|undefined;palette:PaletteColor[];onChange:(color:string|undefined)=>void}) {
  const [custom,setCustom]=useState(value||'#8b929e'),[editing,setEditing]=useState(false);
  useEffect(()=>{setCustom(value||'#8b929e');setEditing(false);},[value]);
  return <fieldset className="style-color" aria-label={label}><legend>{label}</legend><div className="style-swatches">
    <button className="color-swatch theme" aria-pressed={value===''} aria-label={ui.style.theme} data-tooltip={tooltips.style.theme} onClick={()=>onChange(undefined)}><span/></button>
    {palette.map(color=><button key={color.id} className="color-swatch" aria-pressed={value?.toLowerCase()===color.color.toLowerCase()} aria-label={color.name} data-tooltip={color.name} onClick={()=>onChange(color.color)}><span style={{background:color.color}}/></button>)}
    <Tool icon="plus" className={editing?'selected':''} label={tooltips.style.custom} aria-expanded={editing} onClick={()=>setEditing(!editing)}/>
  </div>
    {editing&&<div className="custom-color" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setEditing(false);}if(e.key==='Enter'&&isHexColor(custom)){e.preventDefault();onChange(custom);setEditing(false);}}}>
      <input type="color" aria-label={ui.style.custom} value={isHexColor(custom)?custom:'#8b929e'} onChange={e=>setCustom(e.target.value)}/>
      <input aria-label={ui.style.colorValue} value={custom} maxLength={7} aria-invalid={!isHexColor(custom)} onChange={e=>setCustom(e.target.value)} spellCheck={false}/>
      <Tool icon="check" label={tooltips.style.applyColor} disabled={!isHexColor(custom)} onClick={()=>{onChange(custom);setEditing(false);}}/>
    </div>}
  </fieldset>;
}
function Choice({label,value,choices,onChange,sample,tip,disabled=false}:{label:string;value:string|number|boolean|undefined;choices:[string|number|boolean,string][];onChange:(value:string)=>void;sample?:(value:string)=>ReactNode;tip?:(value:string)=>string;disabled?:boolean}) {
  return <fieldset className="style-choice"><legend>{label}</legend><div className="style-buttons" role="group" aria-label={label}>
    {choices.map(([v,name])=><button key={String(v)} type="button" disabled={disabled} aria-label={name} aria-pressed={value!==undefined&&String(value)===String(v)} data-tooltip={tip?.(String(v))??name} onClick={()=>onChange(String(v))}>{sample?sample(String(v)):name}</button>)}
  </div></fieldset>;
}
function LineSample({width=2,style='solid',arrow,end='end'}:{width?:number;style?:string;arrow?:Arrowhead;end?:'start'|'end'}) {
  return <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><g transform={end==='start'?'translate(28 0) scale(-1 1)':undefined}>
    <path d={`M 3 10 H ${hasArrow(arrow)?(arrow==='arrow'?23:17):25}`} stroke="currentColor" strokeWidth={width} strokeDasharray={style==='dashed'?'5 3':style==='dotted'?'0 4':undefined} strokeLinecap={style==='dotted'?'round':'butt'}/>
    {hasArrow(arrow)&&<path d={arrow==='arrow'?'M 17 5 L 24 10 L 17 15':'M 17 5 L 24 10 L 17 15 Z'} fill={arrow==='triangle'?'currentColor':'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>}
  </g></svg>;
}
function PaletteEditor({palette,onSave,onClose}:{palette:PaletteColor[];onSave:(palette:PaletteColor[])=>Promise<void>;onClose:()=>void}) {
  const [draft,setDraft]=useState(()=>palette.map(c=>({...c}))),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const update=(id:string,patch:Partial<PaletteColor>)=>setDraft(colors=>colors.map(c=>c.id===id?{...c,...patch}:c));
  const move=(i:number,delta:number)=>setDraft(colors=>{const next=[...colors];[next[i],next[i+delta]]=[next[i+delta],next[i]];return next;});
  const valid=draft.every(c=>c.name.trim()&&isHexColor(c.color));
  return <form className="palette-editor" aria-label={ui.style.palette} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!busy)onClose();}}} onSubmit={e=>{
    e.preventDefault();if(!valid||busy)return;setBusy(true);setError('');
    void onSave(draft.map(c=>({...c,name:c.name.trim(),color:c.color.toLowerCase()}))).then(onClose).catch(e=>{setError(String(e));setBusy(false);});
  }}><div className="style-section-title">{ui.style.palette}</div><small>{ui.style.paletteHelp}</small>
    <fieldset disabled={busy}>
      {draft.map((color,i)=><div className="palette-row" key={color.id}>
        <input type="color" aria-label={`${color.name} · ${ui.style.custom}`} value={isHexColor(color.color)?color.color:'#8b929e'} onChange={e=>update(color.id,{color:e.target.value})}/>
        <input aria-label={ui.style.colorName} value={color.name} maxLength={32} onChange={e=>update(color.id,{name:e.target.value})}/>
        <input className="palette-hex" aria-label={`${color.name} · ${ui.style.colorValue}`} value={color.color} maxLength={7} aria-invalid={!isHexColor(color.color)} spellCheck={false} onChange={e=>update(color.id,{color:e.target.value})}/>
        <div className="palette-row-actions"><Tool icon="up" label={tooltips.style.moveUp} disabled={i===0} onClick={()=>move(i,-1)}/><Tool icon="arrowDown" label={tooltips.style.moveDown} disabled={i===draft.length-1} onClick={()=>move(i,1)}/><Tool icon="close" className="danger" label={tooltips.style.removeColor} onClick={()=>setDraft(draft.filter(c=>c.id!==color.id))}/></div>
      </div>)}
      <div className="palette-actions"><button type="button" data-tooltip={tooltips.style.addColor} disabled={draft.length>=24} onClick={()=>setDraft([...draft,{id:crypto.randomUUID(),name:ui.style.newColor,color:'#8b929e'}])}><Icon name="plus"/>{ui.style.addColor}</button><button type="button" data-tooltip={tooltips.style.resetPalette} onClick={()=>setDraft(DEFAULT_PALETTE.map(c=>({...c})))}>{ui.style.resetPalette}</button></div>
      {!valid&&<small role="status">{ui.style.invalidColor}</small>}
      <div className="palette-actions"><button type="button" data-tooltip={tooltips.style.cancelPalette} onClick={onClose}>{ui.common.cancel}</button><button type="submit" className="primary" disabled={!valid} data-tooltip={tooltips.style.savePalette}>{ui.common.save}</button></div>
    </fieldset>{error&&<small role="alert">{error}</small>}
  </form>;
}
export function StyleView({board,card,cardInfos=[],selection,session,palette=DEFAULT_PALETTE,onPalette}:{board?:Board;card?:CardInfo;cardInfos?:CardInfo[];selection?:BoardSelection;session:Pick<Session,'board'|'fillCards'>;palette?:PaletteColor[];onPalette?:(palette:PaletteColor[])=>Promise<void>}) {
  const [editingPalette,setEditingPalette]=useState(false);
  const cards=board?.cards.filter(p=>selection?.cards.includes(p.id))??[],edges=board?.edges.filter(e=>selection?.edges.includes(e.id))??[];
  const count=card?1:cards.length+edges.length;
  const fillTitle=ui.style.selected(card||cards.every(p=>!p.folder)?ui.style.cards:cards.every(p=>p.folder)?ui.style.whiteboards:ui.style.cardsAndWhiteboards,card?1:cards.length);
  const edgeTitle=ui.style.selected(ui.style.edges,edges.length);
  const apply=(patch:Partial<Edge>|((edge:Edge)=>Partial<Edge>))=>{if(board)void session.board({...board,edges:board.edges.map(e=>edges.includes(e)?{...e,...(typeof patch==='function'?patch(e):patch)}:e)},ui.history.styleSelection,board).catch(()=>undefined);};
  const arrowDirections=common(edges.map(e=>(hasArrow(e.fromArrowhead)?1:0)|(hasArrow(e.toArrowhead)?2:0)));
  const arrowheads=edges.flatMap(e=>[e.fromArrowhead,e.toArrowhead].filter(hasArrow));
  const boardStyle=(patch:Partial<Board>)=>{if(board)void session.board({...board,...patch},ui.history.styleBoard,board).catch(()=>undefined);};
  const color=(label:string,value:string|undefined,onChange:(c:string|undefined)=>void)=><Color label={label} value={value} palette={palette} onChange={onChange}/>;
  const stroke=(values:Stroke[],change:(patch:Stroke)=>void)=><>
    <Choice label={ui.style.strokeStyle} value={common(values.map(p=>p.strokeStyle==='none'?'solid':p.strokeStyle??'solid'))} choices={(['solid','dashed','dotted'] as const).map(v=>[v,ui.style[v]])} onChange={strokeStyle=>change({strokeStyle:strokeStyle as Stroke['strokeStyle']})} sample={style=><LineSample style={style}/>}/>
    <Choice label={ui.style.strokeWidth} value={common(values.map(p=>p.strokeWidth??2))} choices={DEFAULT_EDGE_WIDTHS.map(n=>[n,ui.style.width(n)])} tip={v=>tooltips.style.width(Number(v))} onChange={value=>change({strokeWidth:Number(value)})} sample={v=><LineSample width={Number(v)}/>}/>
  </>;
  const fill=(fillColor:string|undefined)=>{
    const ids=card?[card.id]:cards.filter(p=>!p.folder).map(p=>p.cardId);
    const updated=board&&cards.some(p=>p.folder)?{...board,cards:board.cards.map(p=>p.folder&&cards.includes(p)?{...p,fillColor}:p)}:undefined;
    void session.fillCards(ids,fillColor,updated,board).catch(()=>undefined);
  };
  return <div className="style-view">
    {!board&&!card?<p className="empty-label">{ui.style.empty}</p>:<>
    {!count&&board&&<>
      <div className="style-selection">{board.name}</div>
      <p className="empty-label">{ui.style.selectItems}</p>
      <label className="settings-toggle"><span>{ui.style.showMentions}</span><input type="checkbox" role="switch" checked={board.showMentions!==false} onChange={e=>boardStyle({showMentions:e.target.checked})}/></label>
    </>}
    {(card||!!cards.length)&&<section className="style-group" aria-label={fillTitle}>
      <h3 className="style-selection">{fillTitle}</h3>
      {color(ui.style.color,card?cardFill(card)??'':common(cards.map(p=>p.folder?p.fillColor??'':cardFill(cardInfos.find(c=>c.id===p.cardId),p)??'')),fill)}
      {card&&<small>{ui.style.cardFillHelp}</small>}
    </section>}
    {!!edges.length&&<section className="style-group" aria-label={edgeTitle}>
      <h3 className="style-selection">{edgeTitle}</h3>
        {color(ui.style.color,common(edges.map(e=>e.strokeColor??'')),strokeColor=>apply({strokeColor}))}
        <fieldset className="style-choice"><legend>{ui.style.arrows}</legend><div className="style-buttons" role="group" aria-label={ui.style.arrows}>
          {(['fromArrowhead','toArrowhead'] as const).map((key,index)=>{
            const enabled=arrowDirections!==undefined&&!!(arrowDirections&(1<<index)),other=index?'fromArrowhead':'toArrowhead',shape=common(edges.map(e=>e[key]));
            return <button key={key} type="button" aria-label={index?ui.style.targetArrow:ui.style.sourceArrow} aria-pressed={enabled} data-tooltip={index?tooltips.style.targetArrow:tooltips.style.sourceArrow} onClick={()=>apply(e=>({[key]:enabled?'none':hasArrow(e[key])?e[key]:hasArrow(e[other])?e[other]:'arrow',...(arrowDirections===undefined?{[other]:'none'}:{})}))}><LineSample arrow={hasArrow(shape)?shape:'arrow'} end={index?'end':'start'}/></button>;
          })}
        </div></fieldset>
        <Choice label={ui.style.arrowheadStyle} value={common(arrowheads)} disabled={!arrowheads.length} choices={ARROWHEAD_STYLES.map(v=>[v,ui.style.arrowheads[v]])} tip={v=>tooltips.style.arrowheads[v as typeof ARROWHEAD_STYLES[number]]} onChange={value=>apply(e=>({...(hasArrow(e.fromArrowhead)?{fromArrowhead:value as Arrowhead}:{}),...(hasArrow(e.toArrowhead)?{toArrowhead:value as Arrowhead}:{})}))} sample={v=><LineSample arrow={v as Arrowhead}/>}/>
        {stroke(edges,apply)}
        <Choice label={ui.style.labelSize} value={common(edges.map(e=>e.labelSize??14))} choices={[12,14,18,24].map((n,i)=>[n,ui.style.labelSizes[i]])} tip={v=>tooltips.style.size(Number(v))} onChange={v=>apply({labelSize:Number(v)})}/>
        {edges.length===1&&<label className="style-label"><span>{ui.style.label}</span><input key={edges[0].id+':'+(edges[0].label??'')} aria-label={ui.style.label} maxLength={2000} defaultValue={edges[0].label??''} onBlur={e=>{if(e.target.value!==(edges[0].label??''))apply({label:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>}
    </section>}
    </>}
    {onPalette&&(editingPalette?<PaletteEditor palette={palette} onSave={onPalette} onClose={()=>setEditingPalette(false)}/>:<button className="palette-edit" data-tooltip={tooltips.style.editPalette} onClick={()=>setEditingPalette(true)}><Icon name="art"/>{ui.style.editPalette}</button>)}
  </div>;
}
