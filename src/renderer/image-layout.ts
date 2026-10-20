export const imagePlaceholderIcon='<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>';
import type {Node as PMNode} from '@tiptap/pm/model';
import {htmlAttribute as escape} from './editor-html';
export interface Crop {offsetX:number;offsetY:number;height:number;imgWidth:number;shape?:'circle'}
export interface Picture {kind:'single';src:string;alt?:string;width:string;alignment:'left'|'center'|'right'|'float-left'|'float-right';caption?:string;captionHidden?:boolean;crop?:Crop}
export interface Placeholder {kind:'placeholder'}
export type ImageItem=Picture|Placeholder;
export interface ImageRow {kind:'row';images:ImageItem[];gap:number;justify:string;wrap:string;alignItems:string}
export type ImageLayout=ImageItem|ImageRow;
export const row=(images:ImageItem[]):ImageRow=>({kind:'row',images,gap:8,justify:'flex-start',wrap:'wrap',alignItems:'flex-start'});
export function parseImageLayout(source:string):ImageLayout|null{
  const template=document.createElement('template');template.innerHTML=source;
  const element=template.content.firstElementChild as HTMLElement|null;
  if(!element||template.content.children.length!==1)return null;
  const parse=(el:HTMLElement):ImageItem|null=>{
    if(el.dataset.betterEditImage==='placeholder')return {kind:'placeholder'};
    if(el.dataset.betterEditImage!=='filled')return null;
    const img=el.querySelector('img');if(!img)return null;
    const s=el.style,clip=s.overflow==='hidden'?el:[...el.children].find(c=>(c as HTMLElement).style.overflow==='hidden') as HTMLElement|undefined;
    const caption=el.querySelector('p');
    const crop=clip?{offsetX:Math.max(0,-parseFloat(img.style.marginLeft)||0),offsetY:Math.max(0,-parseFloat(img.style.marginTop)||0),height:parseFloat(clip.style.height),imgWidth:parseFloat(img.style.width),...(clip.style.borderRadius==='50%'?{shape:'circle' as const}:{})}:undefined;
    if(crop&&(!Number.isFinite(crop.height)||crop.height<=0||!Number.isFinite(crop.imgWidth)||crop.imgWidth<=0))return null;
    return {kind:'single',src:img.getAttribute('src')??'',alt:img.getAttribute('alt')??'',width:s.width||img.style.width||'100%',alignment:s.float==='left'?'float-left':s.float==='right'?'float-right':s.marginLeft==='auto'&&s.marginRight==='auto'?'center':s.marginLeft==='auto'?'right':s.textAlign==='center'?'center':'left',...(caption?{caption:caption.textContent??'',captionHidden:caption.style.display==='none'}:{}),...(crop?{crop}:{})};
  };
  if(element.hasAttribute('data-better-edit-image-row')){
    const images=[...element.children].map(e=>parse(e as HTMLElement));if(images.some(i=>!i))return null;
    return {kind:'row',images:images as ImageItem[],gap:Math.max(0,parseFloat(element.style.gap)||0),justify:element.style.justifyContent||'flex-start',wrap:element.style.flexWrap||'wrap',alignItems:element.style.alignItems||'flex-start'};
  }
  return parse(element);
}
export function imageLayout(node:PMNode):ImageLayout|null{
  if(node.type.name==='htmlBlock')return parseImageLayout(String(node.attrs.source));
  if(node.type.name!=='image')return null;
  return {kind:'single',src:String(node.attrs.src),alt:node.attrs.alt??'',width:node.attrs.width?`${parseFloat(node.attrs.width)}px`:'100%',alignment:'left'};
}
export function imageHtml(layout:ImageLayout,inRow=false):string{
  if(layout.kind==='row')return `<div data-better-edit-image-row style="display: flex; gap: ${layout.gap}px; flex-wrap: ${escape(layout.wrap)}; align-items: ${escape(layout.alignItems)}; justify-content: ${escape(layout.justify)};">\n${layout.images.map(i=>imageHtml(i,true)).join('\n')}\n</div>`;
  if(layout.kind==='placeholder')return '<div data-better-edit-image="placeholder" style="min-width: 160px; min-height: 80px; border: 1px dashed #888; text-align: center;">Add an image</div>';
  const {src,alt,width,alignment,caption,captionHidden,crop}=layout;
  const alignmentCss=inRow?'flex: 0 0 auto;':alignment==='center'?'margin: 0 auto;':alignment==='right'?'margin-left: auto;':alignment.startsWith('float-')?`float: ${alignment.slice(6)}; margin: 0 12px 12px;`:'margin-right: auto;';
  const img=`<img src="${escape(src)}" alt="${escape(alt??'')}" style="${crop?`width: ${crop.imgWidth}px; max-width: none; margin-left: -${crop.offsetX}px; margin-top: -${crop.offsetY}px;`:'width: 100%; max-width: 100%;'} display: block;" />`;
  return `<div data-better-edit-image="filled" style="width: ${escape(width)}; max-width: 100%; ${alignmentCss}">\n${crop?`<div style="overflow: hidden; height: ${crop.height}px;${crop.shape==='circle'?' border-radius: 50%;':''}">${img}</div>`:img}\n${caption!==undefined?`<p style="${captionHidden?'display: none; ':''}font-size: 0.85em; color: #888; margin: 4px 0 0;">${escape(caption)}</p>\n`:''}</div>`;
}
export function rowPicture(item:ImageItem):ImageItem{if(item.kind!=='single'||item.width.endsWith('px')&&parseFloat(item.width)<=600)return item;const scale=220/(parseFloat(item.width)||220);return {...item,width:'220px',...(item.crop?{crop:{...item.crop,imgWidth:item.crop.imgWidth*scale,height:item.crop.height*scale,offsetX:item.crop.offsetX*scale,offsetY:item.crop.offsetY*scale}}:{})};}
