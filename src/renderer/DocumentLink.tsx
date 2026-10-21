import {useContext,useState,type MouseEvent} from 'react';
import type {ReferenceTarget} from '../shared';
import {annotationFragment,referenceMatches} from '../document-links';
import {externalURL} from '../external-links';
import {ViewBlockContext} from './ViewBlock';
import {PropertyPopover} from './PropertyValue';
import {ReferenceOptions} from './ReferencePicker';
import {ActionMenu,type MenuAction,type MenuState} from './Overlays';
import {ui} from '../text/ui';
export function useDocumentLinks(path:string){
  const context=useContext(ViewBlockContext),[choice,setChoice]=useState<{anchor:HTMLElement;targets:ReferenceTarget[]}|null>(null),[index,setIndex]=useState(0),[menu,setMenu]=useState<MenuState|null>(null);
  const attempt=(work:Promise<unknown>)=>{void work.catch(error=>context?.session.update({error:String(error)}));};
  const open=(target:ReferenceTarget,popup=true,annotation?:string)=>{setChoice(null);if(popup&&target.kind==='card'&&context?.onPreview)context.onPreview(target.key,annotation);else context?.onOpen(target.key);};
  const matches=(href:string)=>referenceMatches(path,href,context?[...context.snapshot.cards.map(c=>({kind:'card' as const,key:'card:'+c.id,path:c.path,name:c.title||c.name})),...context.snapshot.boards.map(b=>({kind:'board' as const,key:'board:'+b.folder,path:b.path,name:b.name}))]:[]);
  const follow=(link:HTMLAnchorElement)=>{
    const href=link.getAttribute('href')??'',url=externalURL(href);if(url){attempt((context?.session.bridge??window.door).openExternal(url));return true;}
    const targets=matches(href);if(!targets.length)return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
    if(targets.length===1)open(targets[0],!href.startsWith('card:'),annotationFragment(href));else{setChoice({anchor:link,targets});setIndex(0);}return true;
  };
  const click=(event:MouseEvent)=>{
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!link||!follow(link))return false;
    event.preventDefault();event.stopPropagation();return true;
  };
  const onContextMenu=(event:MouseEvent)=>{
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!link)return false;
    event.preventDefault();event.stopPropagation();const href=link.getAttribute('href')??'',url=externalURL(href),targets=url?[]:matches(href),target=targets.length===1?targets[0]:undefined;
    const actions:MenuAction[]=[];
    if(url||targets.length)actions.push({label:url?ui.links.browser:ui.links.open,icon:'external',run:()=>follow(link)});
    if(target&&context?.onNavigate)actions.push({label:ui.common.openInNewTab,icon:'file',run:()=>context.onNavigate!(target.key,'new')});
    actions.push({label:ui.links.copy,icon:'copy',separatorBefore:!!actions.length,run:()=>attempt(navigator.clipboard.writeText(href))});
    setChoice(null);setMenu({anchor:link,x:event.clientX,y:event.clientY,label:ui.links.actions,actions});return true;
  };
  const picker=<>{choice&&<PropertyPopover anchor={choice.anchor} label={ui.references.find} onClose={()=>setChoice(null)}><ReferenceOptions rows={choice.targets} index={index} onIndex={setIndex} onSelect={target=>open(target)}/></PropertyPopover>}{menu&&<ActionMenu menu={menu} onClose={()=>setMenu(null)}/>}</>;
  return {click,onContextMenu,picker};
}
