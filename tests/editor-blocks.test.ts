import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveEditorBlock,moveEditorBlocks,editorBlocks,selectedEditorBlocks} from '../src/renderer/editor-blocks';
import type {JSONContent} from '@tiptap/core';
const p=(text:string):JSONContent=>({type:'paragraph',content:[{type:'text',text}]}),item=(text:string,children?:JSONContent):JSONContent=>({type:'listItem',content:[p(text),...children?[children]:[]]}),list=(...items:JSONContent[]):JSONContent=>({type:'bulletList',content:items});
const doc:JSONContent={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'Title'}]},list(item('Parent',list(item('Child'))),item('Sibling'),item('Last')),p('End')]};
test('block moves retain list subtrees and nesting, reject descendant drops and never move the title',()=>{
  const moved=moveEditorBlock(doc,[1,0],[1,2],'after')!;
  assert.equal(moved.content![1].content![2].content![1].content![0].content![0].content![0].text,'Child');
  assert.equal(doc.content![1].content![0].content![0].content![0].text,'Parent');
  assert.equal(moveEditorBlock(doc,[1,0],[1,0,1,0],'after',true),null);
  assert.equal(moveEditorBlock(doc,[0],[2],'after'),null);
  const nested=moveEditorBlock(doc,[1,1],[1,0],'after',true)!;
  assert.deepEqual(nested.content![1].content![0].content![1].content!.map(n=>n.content![0].content![0].text),['Child','Sibling']);
  const out=moveEditorBlock(doc,[1,0,1,0],[1,0],'after')!;
  assert.equal(out.content![1].content![0].content!.length,1,'empty child list is removed');
  assert.equal(out.content![1].content![1].content![0].content![0].text,'Child');
  const root=moveEditorBlock(doc,[1,0],[2],'after')!;
  assert.equal(root.content!.at(-1)!.type,'bulletList');assert.equal(root.content!.at(-1)!.content![0].content![0].content![0].text,'Parent');
});

test('converting one list item keeps its descendants and surrounding siblings',async()=>{
  const {changeEditorBlock}=await import('../src/renderer/editor-blocks');
  const converted=changeEditorBlock(doc,[1,0],'taskList')!;
  assert.equal(converted.content![1].type,'taskList');
  assert.equal(converted.content![1].content![0].content![1].type,'taskList');
  assert.equal(converted.content![2].type,'bulletList');
  assert.equal(converted.content![2].content![0].content![0].content![0].text,'Sibling');
  const heading=changeEditorBlock(doc,[1,0],'heading2')!;
  assert.equal(heading.content![1].type,'heading');
  assert.equal(heading.content![2].content![0].content![0].content![0].text,'Child');
  assert.equal(changeEditorBlock(doc,[0],'delete'),null);
});


test('multiple selected blocks move once in document order and retain list children',async()=>{
  const {getSchema}=await import('@tiptap/core'),{default:StarterKit}=await import('@tiptap/starter-kit');
  const schema=getSchema([StarterKit]),pm=schema.nodeFromJSON(doc),blocks=editorBlocks(pm);
  const parent=blocks.find(b=>b.path.join('.')==='1.0')!,child=blocks.find(b=>b.path.join('.')==='1.0.1.0')!,sibling=blocks.find(b=>b.path.join('.')==='1.1')!;
  assert.deepEqual(selectedEditorBlocks(pm,{from:parent.from+2,to:sibling.to-2},child).map(b=>b.path),[[1,0],[1,1]]);
  assert.deepEqual(selectedEditorBlocks(pm,{from:child.from+2,to:child.to-2},child).map(b=>b.path),[[1,0,1,0]],'child-only selection must not pick up its parent');
  const moved=moveEditorBlocks(doc,[[1,1],[1,0],[1,0,1,0]],[2],'after')!;
  schema.nodeFromJSON(moved).check();
  assert.equal(schema.nodeFromJSON(moved).textContent,'TitleLastEndParentChildSibling');
  assert.equal(moveEditorBlocks(doc,[[1,0],[1,1]],[1,0,1,0],'after'),null);
  const mixed=moveEditorBlocks(doc,[[1,0],[2]],[1],'after');
  assert.equal(mixed,null,'a mixed selection cannot drop onto its own containing list');
  const withEnd={...doc,content:[...doc.content!,p('Destination')]};
  const grouped=moveEditorBlocks(withEnd,[[1,0],[1,1],[2]],[3],'after')!;
  schema.nodeFromJSON(grouped).check();
  assert.equal(schema.nodeFromJSON(grouped).textContent,'TitleLastDestinationParentChildSiblingEnd');
});

test('one shared gap represents adjacent sibling blocks; nesting stays distinct',async()=>{
  const {editorDropBoundaries}=await import('../src/renderer/editor-blocks');
  const blocks=[0,1,2].map(i=>({target:{path:[1,i],from:i,to:i+1,depth:0,item:true},r:{top:i*50,bottom:i*50+30}}));
  const boundaries=editorDropBoundaries(blocks,0);assert.deepEqual(boundaries.map(b=>b.y),[0,40,90,130]);
  assert.equal(editorDropBoundaries(blocks,1).filter(b=>b.edge==='after').length,3,'Nesting remains a separate operation');
});
