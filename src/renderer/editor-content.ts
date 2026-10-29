import type {Editor,JSONContent} from '@tiptap/core';

// Replace only the changed range so a refresh cannot reset the caret or select the document.
export function updateEditorContent(editor:Editor,content:JSONContent|string,emitUpdate=true){
  const parsed=editor.schema.nodeFromJSON(typeof content==='string'?editor.markdown!.parse(content):content);
  const next=parsed.content.size?parsed:editor.schema.topNodeType.createAndFill()!;next.check();
  const before=editor.state.doc,start=before.content.findDiffStart(next.content);if(start===null)return false;
  const end=before.content.findDiffEnd(next.content)!;
  const overlap=start-Math.min(end.a,end.b);if(overlap>0){end.a+=overlap;end.b+=overlap;}
  editor.view.dispatch(editor.state.tr.replace(start,end.a,next.slice(start,end.b)).setMeta('preventUpdate',!emitUpdate));
  return true;
}
