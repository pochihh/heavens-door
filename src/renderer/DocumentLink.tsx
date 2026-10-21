import {useContext,useState,type MouseEvent} from 'react';
import type {ReferenceTarget} from '../shared';
import {annotationFragment,referenceMatches} from '../document-links';
import {ViewBlockContext} from './ViewBlock';
import {PropertyPopover} from './PropertyValue';
import {ReferenceOptions} from './ReferencePicker';
import {ui} from '../text/ui';
export function useDocumentLinks(path:string){
  const context=useContext(ViewBlockContext),[choice,setChoice]=useState<{anchor:HTMLElement;targets:ReferenceTarget[]}|null>(null),[index,setIndex]=useState(0);
  const open=(target:ReferenceTarget,popup=true,annotation?:string)=>{setChoice(null);if(popup&&target.kind==='card'&&context?.onPreview)context.onPreview(target.key,annotation);else context?.onOpen(target.key);};
  const click=(event:MouseEvent)=>{
    const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');if(!link||!context)return false;
    const targets:ReferenceTarget[]=[...context.snapshot.cards.map(c=>({kind:'card' as const,key:'card:'+c.id,path:c.path,name:c.title||c.name})),...context.snapshot.boards.map(b=>({kind:'board' as const,key:'board:'+b.folder,path:b.path,name:b.name}))];
    const href=link.getAttribute('href')??'',matches=referenceMatches(path,href,targets);
    if(!matches.length){if(/^(card:|wiki:)/.test(href)){event.preventDefault();event.stopPropagation();}return false;}
    event.preventDefault();event.stopPropagation();if(matches.length===1)open(matches[0],!href.startsWith('card:'),annotationFragment(href));else{setChoice({anchor:link,targets:matches});setIndex(0);}return true;
  };
  const picker=choice&&<PropertyPopover anchor={choice.anchor} label={ui.references.find} onClose={()=>setChoice(null)}><ReferenceOptions rows={choice.targets} index={index} onIndex={setIndex} onSelect={target=>open(target)}/></PropertyPopover>;
  return {click,picker};
}
