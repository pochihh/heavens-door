import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveEditorBlock} from '../src/renderer/editor-blocks';
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
