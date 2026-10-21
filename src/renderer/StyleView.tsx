import {FONT_SIZE_PRESETS,type FontSize,type FontSizePreset} from '../font-size';
import {readingText} from '../text/reading';
import { useEffect, useState, type ReactNode } from 'react';
import type { Arrowhead, Board, BoardObject, CardInfo, Edge, PaletteColor, Placement, Stroke } from '../shared';
import { DEFAULT_PALETTE, cardFill, isHexColor } from '../colors';
import type { Session } from './session';
import { Icon, Tool, type IconName } from './Icons';
import { ui } from '../text/ui';
import { tooltips } from '../text/tooltips';
export interface BoardSelection {path:string;cards:string[];edges:string[]}
const DEFAULT_EDGE_WIDTHS=[1,2,4] as const;
const ARROWHEAD_STYLES=['arrow','triangle','triangle-outline'] as const;
const hasArrow=(value:Arrowhead|undefined):value is Exclude<Arrowhead,'none'>=>!!value&&value!=='none';
const common=<T,>(values:T[])=>values.every(value=>value===values[0])?values[0]:undefined;
export function Color({label,value,palette,onChange,emptyLabel}:{label:string;emptyLabel?:string;value:string|undefined;palette:PaletteColor[];onChange:(color:string|undefined)=>void}) {
  const [custom,setCustom]=useState(value||'#8b929e'),[editing,setEditing]=useState(false);
  useEffect(()=>{setCustom(value||'#8b929e');setEditing(false);},[value]);
  return <fieldset className="style-color" aria-label={label}><legend>{label}</legend><div className="style-swatches">
    <button className="color-swatch theme" aria-pressed={value===''} aria-label={emptyLabel??ui.style.theme} data-tooltip={emptyLabel??tooltips.style.theme} onClick={()=>onChange(undefined)}><span/></button>
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
export function FontSizeButtons({label=readingText.fontSize,values,onChange}:{label?:string;values:FontSize[];onChange:(value:FontSizePreset)=>void}) {
  const value=common(values);
  return <div className="style-buttons" role="group" aria-label={label}>{(Object.keys(FONT_SIZE_PRESETS) as FontSizePreset[]).map(size=><button key={size} type="button" aria-label={size.toUpperCase()} aria-pressed={value===size} data-tooltip={size.toUpperCase()} onClick={()=>onChange(size)}>{size.toUpperCase()}</button>)}</div>;
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
function SelectionGroup({name,icon,count,children}:{name:string;icon:IconName;count:number;children:ReactNode}){
  return <section className="style-group" aria-label={ui.style.selected(name,count)}><h3 className="style-selection"><Icon name={icon}/><span>{name}</span><small>{count}</small></h3>{children}</section>;
}
function ShapeSample({shape}:{shape:string}){
  return shape==='none'?<Icon name="text"/>:<svg viewBox="0 0 28 20" width="28" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{shape==='ellipse'?<ellipse cx="14" cy="10" rx="11" ry="7"/>:shape==='diamond'?<path d="M 14 2 L 25 10 L 14 18 L 3 10 Z"/>:<rect x="3" y="3" width="22" height="14" rx={shape==='rounded'?4:0}/>}</svg>;
}
export function StyleView({board,card,cardInfos=[],selection,session,palette=DEFAULT_PALETTE,onPalette}:{board?:Board;card?:CardInfo;cardInfos?:CardInfo[];selection?:BoardSelection;session:Pick<Session,'board'|'fillCards'>;palette?:PaletteColor[];onPalette?:(palette:PaletteColor[])=>Promise<void>}) {
  const [editingPalette,setEditingPalette]=useState(false);
  const selected=board?.cards.filter(p=>selection?.cards.includes(p.id))??[],edges=board?.edges.filter(e=>selection?.edges.includes(e.id))??[];
  const cards=selected.filter(p=>!p.folder&&!p.object),boards=selected.filter(p=>p.folder),texts=selected.filter(p=>p.object?.type==='text'),images=selected.filter(p=>p.object?.type==='image');
  const textValues=texts.flatMap(p=>p.object?.type==='text'?[p.object]:[]),shapes=texts.filter(p=>p.object?.type==='text'&&p.object.shape!=='none');
  const count=card?1:selected.length+edges.length;
  const apply=(patch:Partial<Edge>|((edge:Edge)=>Partial<Edge>))=>{if(board)void session.board({...board,edges:board.edges.map(e=>edges.includes(e)?{...e,...(typeof patch==='function'?patch(e):patch)}:e)},ui.history.styleSelection,board).catch(()=>undefined);};
  const placements=(items:Placement[],change:(p:Placement)=>Placement)=>{if(board)void session.board({...board,cards:board.cards.map(p=>items.includes(p)?change(p):p)},ui.history.styleSelection,board).catch(()=>undefined);};
  const textStyle=(patch:Partial<Extract<BoardObject,{type:'text'}>>)=>placements(texts,p=>p.object?.type==='text'?{...p,object:{...p.object,...patch}}:p);
  const arrowDirections=common(edges.map(e=>(hasArrow(e.fromArrowhead)?1:0)|(hasArrow(e.toArrowhead)?2:0)));
  const arrowheads=edges.flatMap(e=>[e.fromArrowhead,e.toArrowhead].filter(hasArrow));
  const boardStyle=(patch:Partial<Board>)=>{if(board)void session.board({...board,...patch},ui.history.styleBoard,board).catch(()=>undefined);};
  const color=(label:string,value:string|undefined,onChange:(c:string|undefined)=>void)=><Color label={label} value={value} palette={palette} onChange={onChange}/>;
  const stroke=(values:Stroke[],change:(patch:Stroke)=>void)=><>
    <Choice label={ui.style.lineStyle} value={common(values.map(p=>p.strokeStyle==='none'?'solid':p.strokeStyle??'solid'))} choices={(['solid','dashed','dotted'] as const).map(v=>[v,ui.style[v]])} onChange={strokeStyle=>change({strokeStyle:strokeStyle as Stroke['strokeStyle']})} sample={style=><LineSample style={style}/>}/>
    <Choice label={ui.style.lineWidth} value={common(values.map(p=>p.strokeWidth??2))} choices={DEFAULT_EDGE_WIDTHS.map(n=>[n,ui.style.width(n)])} tip={v=>tooltips.style.width(Number(v))} onChange={value=>change({strokeWidth:Number(value)})} sample={v=><LineSample width={Number(v)}/>}/>
  </>;
  return <div className="style-view">
    {!board&&!card?<p className="empty-label">{ui.style.empty}</p>:<>
    {!count&&board&&<>
      <div className="style-selection">{board.name}</div>
      <p className="empty-label">{ui.style.selectItems}</p>
      <label className="settings-toggle"><span>{ui.style.showMentions}</span><input type="checkbox" role="switch" checked={board.showMentions!==false} onChange={e=>boardStyle({showMentions:e.target.checked})}/></label>
    </>}
    {(card||!!cards.length)&&<SelectionGroup name={ui.style.cards} icon="note" count={card?1:cards.length}>
      {color(ui.style.fill,card?cardFill(card)??'':common(cards.map(p=>cardFill(cardInfos.find(c=>c.id===p.cardId),p)??'')),fillColor=>{void session.fillCards(card?[card.id]:cards.map(p=>p.cardId),fillColor).catch(()=>undefined);})}
      {card&&<small>{ui.style.cardFillHelp}</small>}
    </SelectionGroup>}
    {!!boards.length&&<SelectionGroup name={ui.style.whiteboards} icon="map" count={boards.length}>
      {color(ui.style.color,common(boards.map(p=>p.fillColor??'')),fillColor=>placements(boards,p=>({...p,fillColor})))}
    </SelectionGroup>}
    {!!texts.length&&<SelectionGroup name={readingText.textObjects} icon="text" count={texts.length}>
      {color(ui.style.textColor,common(textValues.map(p=>p.textColor??'')),textColor=>textStyle({textColor}))}
      <fieldset className="style-choice"><legend>{readingText.fontSize}</legend><FontSizeButtons values={textValues.map(p=>p.fontSize??'m')} onChange={fontSize=>textStyle({fontSize})}/></fieldset>
      <Choice label={readingText.shape} value={common(textValues.map(p=>p.shape==='rectangle'?'rounded':p.shape))} choices={['none','rounded','ellipse','diamond'].map(v=>[v,({none:'Text',rectangle:'Rectangle',rounded:'Rectangle',ellipse:'Ellipse',diamond:'Diamond'} as Record<string,string>)[v]])} sample={shape=><ShapeSample shape={shape}/>} onChange={shape=>textStyle({shape:shape as Extract<BoardObject,{type:'text'}>['shape']})}/>
      {!!shapes.length&&<div className="style-subgroup" role="group" aria-label={ui.style.shapeAppearance}><h4>{ui.style.shapeAppearance}<small>{shapes.length}</small></h4>
        {color(ui.style.lineColor,common(shapes.map(p=>p.strokeColor??'')),strokeColor=>placements(shapes,p=>({...p,strokeColor})))}
        {stroke(shapes,patch=>placements(shapes,p=>({...p,...patch})))}
      </div>}
    </SelectionGroup>}
    {!!images.length&&<SelectionGroup name={ui.style.images} icon="image" count={images.length}><p className="style-help">{ui.style.imageHelp}</p></SelectionGroup>}
    {!!edges.length&&<SelectionGroup name={ui.style.edges} icon="branch" count={edges.length}>
        {color(ui.style.lineColor,common(edges.map(e=>e.strokeColor??'')),strokeColor=>apply({strokeColor}))}
        <fieldset className="style-choice"><legend>{ui.style.arrows}</legend><div className="style-buttons" role="group" aria-label={ui.style.arrows}>
          {(['fromArrowhead','toArrowhead'] as const).map((key,index)=>{
            const enabled=arrowDirections!==undefined&&!!(arrowDirections&(1<<index)),other=index?'fromArrowhead':'toArrowhead',shape=common(edges.map(e=>e[key]));
            return <button key={key} type="button" aria-label={index?ui.style.targetArrow:ui.style.sourceArrow} aria-pressed={enabled} data-tooltip={index?tooltips.style.targetArrow:tooltips.style.sourceArrow} onClick={()=>apply(e=>({[key]:enabled?'none':hasArrow(e[key])?e[key]:hasArrow(e[other])?e[other]:'arrow',...(arrowDirections===undefined?{[other]:'none'}:{})}))}><LineSample arrow={hasArrow(shape)?shape:'arrow'} end={index?'end':'start'}/></button>;
          })}
        </div></fieldset>
        <Choice label={ui.style.arrowheadStyle} value={common(arrowheads)} disabled={!arrowheads.length} choices={ARROWHEAD_STYLES.map(v=>[v,ui.style.arrowheads[v]])} tip={v=>tooltips.style.arrowheads[v as typeof ARROWHEAD_STYLES[number]]} onChange={value=>apply(e=>({...(hasArrow(e.fromArrowhead)?{fromArrowhead:value as Arrowhead}:{}),...(hasArrow(e.toArrowhead)?{toArrowhead:value as Arrowhead}:{})}))} sample={v=><LineSample arrow={v as Arrowhead}/>}/>
        {stroke(edges,apply)}
        <fieldset className="style-choice"><legend>{readingText.fontSize}</legend><FontSizeButtons values={edges.map(e=>e.labelSize??'s')} onChange={labelSize=>apply({labelSize})}/></fieldset>
        {edges.length===1&&<label className="style-label"><span>{ui.style.label}</span><input key={edges[0].id+':'+(edges[0].label??'')} aria-label={ui.style.label} maxLength={2000} defaultValue={edges[0].label??''} onBlur={e=>{if(e.target.value!==(edges[0].label??''))apply({label:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>}
    </SelectionGroup>}
    </>}
    {onPalette&&(editingPalette?<PaletteEditor palette={palette} onSave={onPalette} onClose={()=>setEditingPalette(false)}/>:<button className="palette-edit" data-tooltip={tooltips.style.editPalette} onClick={()=>setEditingPalette(true)}><Icon name="art"/>{ui.style.editPalette}</button>)}
  </div>;
}
