import { ui } from '../text/ui';
import { useEffect, useRef } from 'react';
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';
import { documentIcons, Icon } from './Icons';
export default function IconPicker({onSelect}:{onSelect:(value:string)=>void}) {
  const container=useRef<HTMLDivElement>(null),select=useRef(onSelect);select.current=onSelect;
  useEffect(()=>{
    const picker=new Picker({data,set:'native',theme:document.documentElement.dataset.theme??'auto',previewPosition:'none',skinTonePosition:'search',maxFrequentRows:0,perLine:9,onEmojiSelect:(emoji:{native:string})=>select.current(emoji.native)});
    container.current!.appendChild(picker as unknown as Node);
    return()=>{(picker as unknown as HTMLElement).remove();};
  },[]);
  return <><div className="icon-options" aria-label={ui.icons.fileIcons}>{documentIcons.map(icon=><button type="button" key={icon} aria-label={ui.icons.use(ui.icons.names[icon])} data-tooltip={ui.icons.names[icon]} onClick={()=>onSelect('icon:'+icon)}><Icon name={icon} size={20}/></button>)}</div><div className="emoji-picker" ref={container}/></>;
}
