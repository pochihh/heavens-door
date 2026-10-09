import { ui } from '../text/ui';
import { Extension, Node as TiptapNode, type Editor, type NodeViewRenderer, type JSONContent, type MarkdownRendererHelpers } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import CodeBlock from '@tiptap/extension-code-block';
import StarterKit from '@tiptap/starter-kit';
import {wikiToken} from '../document-links';
const CardKit=StarterKit.extend({addExtensions(){return (this.parent?.()??[]).map(extension=>extension.name==='link'?extension.extend({markdownTokenizer:{name:'wikiLink',level:'inline',start:(source:string)=>source.indexOf('[['),tokenize:wikiToken},renderMarkdown(node:JSONContent,helpers:MarkdownRendererHelpers){
  const href=String(node.attrs?.href??'');if(!href.startsWith('wiki:')){const text=helpers.renderChildren(node),title=node.attrs?.title;return title?`[${text}](${href} "${title}")`:`[${text}](${href})`;}
  const target=decodeURIComponent(href.slice(5)),text=helpers.renderChildren(node);return '[['+target+(text===target?'':'|'+text)+']]';
}}):extension);}});

import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import {TextColors,htmlAttribute,inlineHtmlToken,supportedHtml} from './editor-html';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { assetPath } from './markdown';

// The reserved first heading is editable content; its empty prompt is only CSS.
const CardTitle=Extension.create({
  name:'cardTitle',
  addProseMirrorPlugins(){return [new Plugin({
    appendTransaction(transactions,_previous,state){
      if(!transactions.some(tr=>tr.docChanged))return null;
      const first=state.doc.firstChild;
      if(first?.type.name==='heading'&&first.attrs.level===1)return null;
      const tr=state.tr,heading=state.schema.nodes.heading;
      return first&&['paragraph','heading'].includes(first.type.name)?tr.setNodeMarkup(0,heading,{level:1}):tr.insert(0,heading.create({level:1}));
    },
    props:{decorations(state){
      const first=state.doc.firstChild;
      if(first?.type.name!=='heading'||first.attrs.level!==1)return null;
      return DecorationSet.create(state.doc,[Decoration.node(0,first.nodeSize,{class:'card-title'+(first.content.size?'':' is-empty'),'aria-label':ui.editor.cardTitle})]);
    }},
  })];},
});
export function cardMarkdown(editor:Editor){
  const doc=editor.getJSON(),first=editor.state.doc.firstChild;
  if(first?.type.name==='heading'&&first.attrs.level===1&&!first.content.size)doc.content?.shift();
  return editor.markdown!.serialize(doc);
}

export function titleMetadata(slot:HTMLElement,visible:()=>boolean=()=>true){return Extension.create({name:'titleMetadata',addProseMirrorPlugins(){return [new Plugin({props:{decorations(state){const first=state.doc.firstChild;return first&&visible()?DecorationSet.create(state.doc,[Decoration.widget(first.nodeSize,slot,{side:-1,stopEvent:()=>true,ignoreSelection:true})]):null;}}})];}});}
export function extensions(path: string,codeView?:NodeViewRenderer,htmlView?:NodeViewRenderer,imageView?:NodeViewRenderer) {
  // withCardTitle supplies a new card’s body line; trailingNode would recreate deleted lines.
  return [CardTitle,CardKit.configure({...codeView?{codeBlock:false}:{},undoRedo:false,trailingNode:false,link:{openOnClick:false,protocols:['card','wiki']}}),...(codeView?[CodeBlock.extend({addNodeView(){return codeView;}})]:[]),Markdown,TextColors,
    TiptapNode.create({name:'htmlBlock',group:'block',atom:true,addAttributes(){return {source:{default:''}};},parseHTML(){return [{tag:'div[data-html-source]',getAttrs:element=>({source:(element as HTMLElement).dataset.htmlSource})}];},renderHTML({node}){return ['div',{'data-html-source':node.attrs.source}];},
      markdownTokenName:'html',parseMarkdown(token,helpers){
        const template=document.createElement('template');template.innerHTML=token.raw??'';
        const image=template.content.firstElementChild;
        if(image?.tagName==='IMG'&&template.content.children.length===1&&supportedHtml(token.raw??'')&&!template.content.textContent?.trim())return helpers.createNode('image',{...Object.fromEntries(image.getAttributeNames().map(key=>[key,image.getAttribute(key)])),html:true});
        return helpers.createNode('htmlBlock',{source:(token.raw??'').replace(/\n$/,'')});
      },renderMarkdown:node=>String(node.attrs?.source??''),...(htmlView?{addNodeView:()=>htmlView}:{}),
    }),
    TiptapNode.create({name:'htmlInline',group:'inline',inline:true,atom:true,addAttributes(){return {source:{default:''}};},parseHTML(){return [{tag:'span[data-html-source]',getAttrs:element=>({source:(element as HTMLElement).dataset.htmlSource})}];},renderHTML({node}){return ['span',{'data-html-source':node.attrs.source}];},
      markdownTokenName:'htmlInline',markdownTokenizer:{name:'htmlInline',level:'inline',start:src=>src.indexOf('<'),tokenize(src){const raw=inlineHtmlToken(src);return raw?{type:'htmlInline',raw}:undefined;}},parseMarkdown:(token,helpers)=>helpers.createNode('htmlInline',{source:token.raw}),renderMarkdown:node=>String(node.attrs?.source??''),...(htmlView?{addNodeView:()=>htmlView}:{}),
    }),TaskList,TaskItem.configure({nested:true}),TableKit,Image.extend({
    addAttributes(){return {...this.parent?.(),html:{default:false,rendered:false,parseHTML:()=>true}};},
    renderMarkdown(node){
      const a=node.attrs??{};
      if(!a.html&&!a.width&&!a.height)return a.title?`![${a.alt??''}](${a.src} "${a.title}")`:`![${a.alt??''}](${a.src})`;
      return '<img '+['src','alt','title','width','height'].filter(k=>a[k]!=null).map(k=>`${k}="${htmlAttribute(a[k])}"`).join(' ')+'>';
    },
    addNodeView() { if(imageView)return imageView;return ({node}) => {
      const dom=document.createElement('img');
      const source=assetPath(path,String(node.attrs.src));
      if (source) dom.src=window.door.assetUrl(source);
      dom.alt=String(node.attrs.alt ?? '');
      if(node.attrs.width)dom.setAttribute('width',String(node.attrs.width));
      if(node.attrs.height)dom.setAttribute('height',String(node.attrs.height));
      return {dom};
    }; },
  })];
}
