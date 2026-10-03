import {useContext,useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {TagResult,TagValue} from '../shared';
import {orderedCardIds,type BlockView,type QueryField} from '../view-block';
import {validTagDate} from '../tags';
import {dateDraft,dateValue,dateSummary,formatDay,shiftDay,wallTime} from '../dates';
import {DateDisplayContext} from './DateProperty';
import {cardFill,tintColor} from '../colors';
import {crossed,createDragPhantom} from './sortable';
import {Icon,Tool} from './Icons';
import {PropertyPopover} from './PropertyValue';
import {tooltips} from '../text/tooltips';
import {ui} from '../text/ui';
const t=ui.views,DAY=86400000;
export function timelineDates(value:unknown){
  const start=typeof value==='string'?value:value&&typeof value==='object'&&'start'in value?value.start:undefined;
  const end=value&&typeof value==='object'&&'end'in value?value.end:start;
  return validTagDate(start)&&validTagDate(end)&&(start.length===10)===(end.length===10)&&Date.parse(end)>=Date.parse(start)?{start:start as string,end:end as string}:null;
}
export function TimelineView({view,rows,field,onSave,onMove,onOpen,onCreate,onViewChange,onEditing,busy}:{view:BlockView;rows:TagResult[];field?:QueryField;onSave:(row:TagResult,key:string,value:TagValue)=>Promise<void>;onMove?:(row:TagResult,position:{before?:string;after?:string;date?:TagValue})=>Promise<void>;onOpen:(key:string)=>void;onCreate?:(anchor:HTMLElement,column?:string,date?:TagValue)=>void;onViewChange:(patch:Partial<BlockView>)=>void|Promise<void>;onEditing:(key:string|null)=>void;busy:boolean}){
  const {display}=useContext(DateDisplayContext),today=wallTime(new Date().toISOString(),display).slice(0,10);
  const [anchor,setAnchor]=useState(today),[preview,setPreview]=useState<{id:string;value:TagValue;top?:number;index?:number}|null>(null),[error,setError]=useState(''),[scaleMenu,setScaleMenu]=useState<HTMLElement|null>(null);
  const [windowRange,setWindowRange]=useState({left:0,width:0}),[hover,setHover]=useState<TagValue|null>(null),[localOrder,setLocalOrder]=useState<string[]|null>(null);
  const orderRoot=useRef<HTMLDivElement>(null),gesture=useRef(false),panScroll=useRef<number|null>(null);
  const cancel=useRef<()=>void>(()=>{}),viewport=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>cancel.current(),[]);
  useEffect(()=>{cancel.current();setAnchor(today);setPreview(null);setHover(null);setLocalOrder(null);setError('');},[view.id,view.scale,field?.keys.join('\0')]);
  const scale=view.scale??'week',period=scale==='day'?3:scale==='week'?28:90,dayWidth=scale==='day'?576:scale==='week'?56:24;
  const days=Math.max(period,Math.ceil(windowRange.width/dayWidth)*3);
  const start=shiftDay(anchor,-Math.floor(days/4)),origin=Date.parse(start+'T00:00:00Z'),width=days*dayWidth,step=scale==='day'?DAY/96:DAY;
  useLayoutEffect(()=>{const el=viewport.current;if(!el)return;el.scrollLeft=panScroll.current??Math.max(0,Math.floor(days/4)*dayWidth-el.clientWidth/4);panScroll.current=null;setWindowRange({left:el.scrollLeft,width:el.clientWidth});},[anchor,scale,view.id,days]);
  useLayoutEffect(()=>{
    const el=viewport.current;if(!el)return;
    let frame=0;const read=()=>setWindowRange({left:el.scrollLeft,width:el.clientWidth});
    const update=()=>{window.cancelAnimationFrame(frame);frame=window.requestAnimationFrame(read);};
    read();el.addEventListener('scroll',update,{passive:true});const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;observer?.observe(el);
    return()=>{window.cancelAnimationFrame(frame);el.removeEventListener('scroll',update);observer?.disconnect();};
  },[anchor,scale,view.id]);
  useEffect(()=>setLocalOrder(null),[view.id,view.sort,view.order]);
  const visibleLeft=windowRange.left,visibleRight=windowRange.width?Math.min(width,visibleLeft+windowRange.width):width;
  const calendar=Array.from({length:days},(_,i)=>{const day=shiftDay(start,i),date=new Date(day+'T00:00:00Z');return {day,date,weekend:[0,6].includes(date.getUTCDay())};});
  const months: {label:string;left:number;width:number}[]=[];
  for(let i=0;i<days;i++){const day=calendar[i];if(!i||day.day.endsWith('-01'))months.push({label:new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'}).format(day.date),left:i*dayWidth,width:0});months.at(-1)!.width+=dayWidth;}
  const todayX=(Date.parse(today+'T00:00:00Z')-origin)/DAY*dayWidth+dayWidth/2;
  const epoch=(date:string)=>Date.parse(wallTime(date,display)+(date.length===10?'T00:00:00Z':'Z'));
  const valueOf=(row:TagResult)=>field?.keys.map(key=>row.properties[key]).find(value=>timelineDates(value)) as TagValue|undefined;
  const byId=new Map(rows.map(row=>[row.card.id,row])),ordered=orderedCardIds(localOrder??(view.sort==='manual'?view.order?.rows??[]:[]),rows.map(row=>row.card.id)).map(id=>byId.get(id)!);
  const shownValue=(row:TagResult)=>preview?.id===row.card.id&&preview.index===undefined?preview.value:valueOf(row);
  const dated=ordered.filter(row=>timelineDates(shownValue(row))),undated=ordered.filter(row=>!timelineDates(shownValue(row)));
  const dragging=preview?.index!==undefined,dragged=dragging?byId.get(preview.id):undefined,sourceIndex=dragged?dated.findIndex(row=>row.card.id===dragged.card.id):-1;
  const slots=dated.map(row=>row.card.id).filter(id=>id!==dragged?.card.id);
  if(dragged)slots.splice(preview!.index!,0,dragged.card.id);
  const positions=new Map(slots.map((id,index)=>[id,index]));
  async function move(row:TagResult,value:TagValue,index:number){
    if(!onMove)return;
    const id=row.card.id,ids=dated.map(row=>row.card.id).filter(key=>key!==id);ids.splice(index,0,id);
    const order=[...ids,...undated.map(row=>row.card.id).filter(key=>key!==id)];
    const date=JSON.stringify(valueOf(row))===JSON.stringify(value)?{}:{date:value};
    setLocalOrder(order);setPreview({id,value});setError('');onEditing('@timeline');
    try{await onMove(row,{before:ids[index+1],after:ids[index-1],...date});}
    catch(e){setLocalOrder(null);setError(String(e).replace(/^Error: /,''));}
    finally{setPreview(null);onEditing(null);}
  }
  const geometry=(value:TagValue)=>{const dates=timelineDates(value)!;return {left:(epoch(dates.start)-origin)/DAY*dayWidth,width:Math.max(12,(epoch(dates.end)-epoch(dates.start)+(dates.end.length===10?DAY:0))/DAY*dayWidth)};};
  const timeValue=(from:number,to?:number):TagValue=>{
    const draft=dateDraft('',display),part=(epoch:number)=>{const iso=new Date(epoch).toISOString();return {day:formatDay(iso.slice(0,10),display.format),time:iso.slice(11,19)};};
    return dateValue({...draft,start:part(from),end:part(to??from),range:to!==undefined,time:scale==='day'},display);
  };
  async function save(row:TagResult,value:TagValue){if(!field)return;setError('');onEditing('@timeline');setPreview({id:row.card.id,value});try{await onSave(row,field.keys[0],value);}catch(e){setError(String(e).replace(/^Error: /,''));}finally{setPreview(null);onEditing(null);}}
  function pan(e:ReactPointerEvent<HTMLDivElement>){
    if(e.button!==0||(e.target as Element).closest('button,[role="button"]'))return;
    e.preventDefault();cancel.current();setHover(null);
    const el=viewport.current!,x=e.clientX,pointer=e.pointerId,originalScroll=el.scrollLeft,originalAnchor=anchor;
    let startScroll=originalScroll,currentAnchor=anchor,ended=false,moved=false;
    const move=(event:PointerEvent)=>{
      if(event.pointerId!==pointer||ended)return;
      if(!moved&&Math.abs(event.clientX-x)<5)return;
      moved=true;event.preventDefault();gesture.current=true;document.body.classList.add('timeline-panning');
      let left=startScroll-(event.clientX-x);
      // Rebase the date buffer at either edge without moving the date under the pointer.
      const chunk=Math.max(1,Math.floor(days/3)),maximum=width-el.clientWidth;
      const shift=left<0?Math.floor(left/(chunk*dayWidth))*chunk:left>maximum?Math.ceil((left-maximum)/(chunk*dayWidth))*chunk:0;
      if(shift){startScroll-=shift*dayWidth;left-=shift*dayWidth;currentAnchor=shiftDay(currentAnchor,shift);panScroll.current=left;setAnchor(currentAnchor);}
      el.scrollLeft=left;setWindowRange({left,width:el.clientWidth});
    };
    const finish=(restore=false)=>{
      if(ended)return;ended=true;
      if(restore&&moved){panScroll.current=currentAnchor===originalAnchor?null:originalScroll;setAnchor(originalAnchor);el.scrollLeft=originalScroll;setWindowRange({left:originalScroll,width:el.clientWidth});}
      gesture.current=false;document.body.classList.remove('timeline-panning');cancel.current=()=>{};
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);
    };
    const up=(event:PointerEvent)=>{if(event.pointerId===pointer){move(event);finish();}},abort=(event?:Event)=>{if(event?.type!=='pointercancel'||(event as PointerEvent).pointerId===pointer)finish(true);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(true);}};
    cancel.current=abort;document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  }
  function begin(e:ReactPointerEvent<HTMLElement>,row?:TagResult,mode:'move'|'start'|'end'='move'){
    if(busy||!field||e.button!==0||row&&mode==='move'&&!onMove)return;e.preventDefault();e.stopPropagation();cancel.current();setError('');
    const target=e.currentTarget,track=target.closest<HTMLElement>('.timeline-track')??viewport.current!.querySelector<HTMLElement>('.timeline-grid')!,r=track.getBoundingClientRect(),x=e.clientX,y=e.clientY,pointer=e.pointerId;
    const original=row?valueOf(row):undefined,dates=timelineDates(original),from=origin+Math.floor((x-r.left)/dayWidth*DAY/step)*step;
    const sourceRect=target.getBoundingClientRect(),grabY=Math.max(0,Math.min(34,y-sourceRect.top)),rowIndex=row?dated.findIndex(r=>r.card.id===row.card.id):-1;
    let index=rowIndex,previousTop=rowIndex*38,entered=false,frame=0,lastEvent:PointerEvent|undefined;
    const scroller=viewport.current?.closest<HTMLElement>('.editor-body,.card-preview,.tag-view');
    let moved=false,latest:TagValue,ended=false,invalid=false,phantom:HTMLElement|null=null;
    const scheduling=!!row&&!dates,initialScroll=viewport.current?.scrollLeft??0;gesture.current=true;setHover(null);
    try{latest=original??timeValue(from);}catch(err){setError(String(err));gesture.current=false;return;}
    const shift=(delta:number):TagValue=>{
      if(dates&&mode==='move'&&delta===0)return original!;
      if(!dates)return timeValue(Math.min(from,from+delta),delta?Math.max(from,from+delta):undefined);
      const allDay=dates.start.length===10,increment=allDay&&scale!=='day'?Math.round(delta/DAY)*DAY:delta;
      let a=epoch(dates.start),b=epoch(dates.end);if(allDay&&scale==='day'&&(mode!=='move'||dateDraft(original,display).range))b+=DAY;
      if(mode==='move'){a+=increment;b+=increment;}else if(mode==='start')a=Math.min(a+increment,b);else b=Math.max(a,b+increment);
      const draft=dateDraft(original,display),part=(value:number)=>{const iso=new Date(value).toISOString();return {day:formatDay(iso.slice(0,10),display.format),time:iso.slice(11,19)};};
      return dateValue({...draft,start:part(a),end:part(b),range:draft.range||mode!=='move',time:draft.time||scale==='day'},display,original);
    };
    const inTrack=(event:PointerEvent)=>{const area=viewport.current?.getBoundingClientRect(),heading=viewport.current?.querySelector('.timeline-heading')?.getBoundingClientRect();return !!area&&event.clientX>=area.left&&event.clientX<=area.right&&event.clientY>=Math.max(area.top,heading?.bottom??area.top)&&event.clientY<=area.bottom;};
    const update=(event:PointerEvent)=>{
      if(event.pointerId!==pointer)return;lastEvent=event;if(!moved&&Math.hypot(event.clientX-x,event.clientY-y)<5)return;
      if(!moved&&scheduling){phantom=createDragPhantom(target);target.style.visibility='hidden';}moved=true;event.preventDefault();
      if(row&&mode==='move'){document.body.classList.add('timeline-dragging');if(!frame)frame=window.requestAnimationFrame(tick);}
      const inside=inTrack(event);
      if(phantom){phantom.style.left=(event.clientX-(x-sourceRect.left))+'px';phantom.style.top=(event.clientY-grabY)+'px';phantom.style.visibility=inside?'hidden':'visible';}
      try{invalid=false;setError('');
        const delta=event.clientX-x+(viewport.current?.scrollLeft??0)-initialScroll;
        latest=scheduling?timeValue(origin+Math.floor((event.clientX-r.left+(viewport.current?.scrollLeft??0)-initialScroll)/dayWidth*DAY/step)*step):shift(Math.round(delta/dayWidth*DAY/step)*step);
        if(row&&mode==='move'){
          const last=dated.length-(scheduling?0:1),top=Math.max(0,Math.min(last*38,event.clientY-grabY-orderRoot.current!.getBoundingClientRect().top-2));
          if(!entered&&scheduling)index=Math.min(last,Math.round(top/38));
          const direction=top-previousTop,center=top+19;
          while(direction>0&&index<last&&crossed(center,(index+1)*38,38,direction))index++;
          while(direction<0&&index>0&&crossed(center,(index-1)*38,38,direction))index--;
          if(inside)entered=true;previousTop=top;
          setPreview(inside?{id:row.card.id,value:latest,top,index}:null);
        }else setPreview({id:row?.card.id??'@new',value:latest});
      }catch(err){invalid=true;setError(String(err));}
    };
    const tick=()=>{
      if(ended)return;
      if(scroller&&lastEvent&&inTrack(lastEvent)){
        const rect=scroller.getBoundingClientRect(),y=lastEvent.clientY,delta=y<rect.top+22?-5:y>rect.bottom-22?5:0,old=scroller.scrollTop;
        if(delta){scroller.scrollTop+=delta;if(scroller.scrollTop!==old)update(lastEvent);}
      }
      frame=window.requestAnimationFrame(tick);
    };
    const finish=(event?:PointerEvent)=>{
      if(ended||event&&event.pointerId!==pointer)return;if(event)update(event);ended=true;window.cancelAnimationFrame(frame);
      document.removeEventListener('pointermove',update);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',abort);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',abort);phantom?.remove();if(scheduling)target.style.removeProperty('visibility');gesture.current=false;document.body.classList.remove('timeline-dragging');setPreview(null);onEditing(null);
      if(!event||invalid)return;if(scheduling&&!moved){onOpen('card:'+row!.card.id);return;}if(scheduling&&!inTrack(event))return;
      const area=viewport.current?.getBoundingClientRect();if(area&&(event.clientX<area.left||event.clientX>area.right||event.clientY<area.top||event.clientY>area.bottom))return;
      if(row){if(moved&&mode==='move'&&inTrack(event))void move(row,latest,index);else if(moved&&mode!=='move'&&JSON.stringify(original)!==JSON.stringify(latest))void save(row,latest);else if(!moved&&mode==='move')onOpen('card:'+row.card.id);}else onCreate?.(target,undefined,latest);
    };
    const abort=(event?:Event)=>{if(event?.type!=='pointercancel'||(event as PointerEvent).pointerId===pointer)finish();},key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abort();}};
    cancel.current=abort;onEditing('@timeline');document.addEventListener('pointermove',update,{passive:false});document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',abort);document.addEventListener('keydown',key,true);window.addEventListener('blur',abort);
  }
  if(!field)return <p className="muted">{t.chooseDate}</p>;
  return <div className="timeline-view">
    <div className="timeline-toolbar"><div className="toolbar-spacer"/>
      <button className="timeline-scale" aria-label={t.scale} aria-haspopup="dialog" aria-expanded={!!scaleMenu} onClick={e=>setScaleMenu(scaleMenu?null:e.currentTarget)}>{t[scale]}<Icon name="down" size={12}/></button>
      <Tool className="timeline-previous" icon="chevron" label={tooltips.views.previous} onClick={()=>setAnchor(shiftDay(anchor,-period))}/><button onClick={()=>{setAnchor(today);if(viewport.current)viewport.current.scrollLeft=Math.max(0,todayX-viewport.current.clientWidth/4);}}>{t.today}</button><Tool icon="chevron" label={tooltips.views.next} onClick={()=>setAnchor(shiftDay(anchor,period))}/>
    </div>
    {scaleMenu&&<PropertyPopover anchor={scaleMenu} align="end" label={t.scale} className="timeline-scale-menu" onClose={()=>setScaleMenu(null)}><div className="view-menu-list" role="listbox" aria-label={t.scale}>{(['day','week','month'] as const).map(s=><button key={s} role="option" aria-selected={scale===s} onClick={()=>{setScaleMenu(null);onViewChange({scale:s});}}><span>{t[s]}</span>{scale===s&&<Icon name="check"/>}</button>)}</div></PropertyPopover>}
    <div className="timeline-scroll" ref={viewport}><div className="timeline-grid" onPointerDown={pan} style={{width,'--timeline-day':dayWidth+'px'} as React.CSSProperties}>
      <div className="timeline-heading" data-scale={scale}>
        <div className="timeline-months">{months.filter(month=>month.left+month.width>visibleLeft&&month.left<visibleRight).map((month,i)=><span key={month.left} style={{left:Math.max(visibleLeft+(i?160:0),month.left),width:Math.max(160,month.left+month.width-Math.max(visibleLeft,month.left))}}><span>{month.label}</span></span>)}</div>
        <div className="timeline-days">{calendar.map(({day,date,weekend},i)=><div key={day} className="timeline-day" data-preview={!!(preview?.id==='@new'||hover)&&(()=>{const dates=timelineDates(preview?.id==='@new'?preview.value:hover)!;return day>=wallTime(dates.start,display).slice(0,10)&&day<=wallTime(dates.end,display).slice(0,10);})()} data-weekend={weekend} style={{left:i*dayWidth,width:dayWidth}}>{scale==='day'?<><span className="timeline-day-label">{new Intl.DateTimeFormat(undefined,{weekday:'short',timeZone:'UTC'}).format(date)}<span className="date-number" aria-current={day===today?'date':undefined}>{date.getUTCDate()}</span></span><div className="timeline-hours">{[0,4,8,12,16,20].map(hour=><span key={hour}>{new Intl.DateTimeFormat(undefined,{hour:'numeric',hour12:display.timeFormat==='12',timeZone:'UTC'}).format(new Date(Date.UTC(2000,0,1,hour)))}</span>)}</div></>:<span className="timeline-day-number date-number" aria-current={day===today?'date':undefined}>{date.getUTCDate()}</span>}</div>)}</div>
      </div>
      <div className="timeline-calendar" aria-hidden="true">{calendar.map(({day,weekend},i)=>weekend&&<span key={day} style={{left:i*dayWidth,width:dayWidth}}/> )}</div>
      {todayX>=0&&todayX<width&&<div className="timeline-today-line" aria-hidden="true" style={{left:todayX}}/>}
      <div className="timeline-rows" ref={orderRoot} data-dragging={dragging}>{dated.map((row,index)=>{
        const value=shownValue(row)!,g=geometry(value),outside=g.left<visibleLeft||g.left>=visibleRight;
        const left=g.left,barWidth=Math.max(12,Math.min(width,g.left+g.width)-left),title=row.card.title||row.card.name;
        const slot=positions.get(row.card.id)??index;
        return <div className="timeline-row" style={{transform:slot===index?undefined:`translateY(${(slot-index)*38}px)`,visibility:dragged?.card.id===row.card.id?'hidden':undefined}} data-file-key={row.card.id} key={row.card.id}>
          <div className="timeline-track">{outside?<button className="timeline-outside" style={{left:g.left<visibleLeft?visibleLeft+8:visibleRight-32}} data-tooltip={title} aria-label={title} onClick={()=>setAnchor(wallTime(timelineDates(value)!.start,display).slice(0,10))}><Icon name={g.left<visibleLeft?'back':'forward'} size={14}/></button>:
            <div className="timeline-bar" data-dragging={preview?.id===row.card.id} style={{left,width:barWidth,background:tintColor(cardFill(row.card))}} role="button" tabIndex={0} aria-label={title+' · '+dateSummary(value,display)} onPointerDown={e=>begin(e,row)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen('card:'+row.card.id);}else if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)&&!busy){e.preventDefault();void move(row,value,Math.max(0,Math.min(dated.length-1,index+(e.key==='ArrowDown'?1:-1))));}}}>
              <button className="timeline-resize timeline-resize-start" aria-label={ui.tags.startDate} onPointerDown={e=>begin(e,row,'start')} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}/>
              <span className="timeline-bar-label" data-tooltip={title}><Icon name="note" size={14}/><span>{title}</span></span>
              <button className="timeline-resize timeline-resize-end" aria-label={ui.tags.endDate} onPointerDown={e=>begin(e,row,'end')} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}/>
            </div>}
            {preview?.id===row.card.id&&!dragging&&<output className="timeline-feedback" style={{left:Math.max(visibleLeft,Math.min(visibleRight-250,g.left))}}>{dateSummary(value,display)}</output>}
          </div>
        </div>;
      })}
      {dragged&&sourceIndex<0&&<div className="timeline-row" aria-hidden="true"/>}
      {dragged&&<div className="timeline-row timeline-drag-preview" style={{top:preview!.top}} aria-hidden="true"><div className="timeline-track"><div className="timeline-bar" data-dragging="true" style={{...geometry(preview!.value),background:tintColor(cardFill(dragged.card))}}><span className="timeline-bar-label"><Icon name="note" size={14}/><span>{dragged.card.title||dragged.card.name}</span></span></div><output className="timeline-feedback" style={{left:Math.max(visibleLeft,Math.min(visibleRight-250,geometry(preview!.value).left))}}>{dateSummary(preview!.value,display)}</output></div></div>}
      </div>
      {onCreate&&<div className="timeline-row"><div className="timeline-track timeline-new-track" role="button" tabIndex={0} aria-label={t.newCard} onPointerDown={e=>begin(e)} onPointerMove={e=>{if(gesture.current)return;try{const rect=e.currentTarget.getBoundingClientRect();setHover(timeValue(origin+Math.floor((e.clientX-rect.left)/dayWidth*DAY/step)*step));}catch{/* A DST gap has no valid preview. */setHover(null);}}} onPointerLeave={()=>setHover(null)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onCreate(e.currentTarget,undefined,anchor);}}}>
        <span className="timeline-new-label" style={{opacity:hover||preview?.id==='@new'?0:1}}><Icon name="plus" size={14}/>{t.newCard}</span>
        {(preview?.id==='@new'||hover)&&<div className="timeline-bar timeline-ghost" style={{...geometry(preview?.id==='@new'?preview.value:hover!),minWidth:scale==='day'?24:dayWidth}}><span className="timeline-bar-label">{preview?.id==='@new'?dateSummary(preview.value,display):''}</span></div>}
      </div></div>}

    </div></div>
    {!!undated.length&&<details className="timeline-unscheduled"><summary>{t.unscheduled} · {undated.length}</summary><div>{undated.map(row=><button className="timeline-unscheduled-card" key={row.card.id} style={{background:tintColor(cardFill(row.card))}} data-tooltip={row.card.title||row.card.name} onPointerDown={e=>begin(e,row)} onClick={e=>{if(e.detail===0)onOpen('card:'+row.card.id);}}><Icon name="note" size={14}/><span>{row.card.title||row.card.name}</span></button>)}</div></details>}
    {error&&<p className="change-removed" role="alert">{error}</p>}
  </div>;
}
