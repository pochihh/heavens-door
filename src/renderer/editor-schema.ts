import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { assetPath } from './markdown';

export function extensions(path: string) {
  return [StarterKit.configure({undoRedo:false,link:{openOnClick:false,protocols:['card']}}),Markdown,TaskList,TaskItem.configure({nested:true}),TableKit,Image.extend({
    addNodeView() { return ({node}) => {
      const dom=document.createElement('img');
      const source=assetPath(path,String(node.attrs.src));
      if (source) dom.src=window.door.assetUrl(source);
      dom.alt=String(node.attrs.alt ?? '');
      return {dom};
    }; },
  })];
}
