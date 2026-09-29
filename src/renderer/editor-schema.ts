import { ui } from '../text/ui';
import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
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

export function extensions(path: string) {
  // Headings are editable already; focusing one must not append a body line.
  return [CardTitle,StarterKit.configure({undoRedo:false,trailingNode:{notAfter:['heading']},link:{openOnClick:false,protocols:['card']}}),Markdown,TaskList,TaskItem.configure({nested:true}),TableKit,Image.extend({
    addNodeView() { return ({node}) => {
      const dom=document.createElement('img');
      const source=assetPath(path,String(node.attrs.src));
      if (source) dom.src=window.door.assetUrl(source);
      dom.alt=String(node.attrs.alt ?? '');
      return {dom};
    }; },
  })];
}
