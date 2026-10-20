import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FONT_SIZE_PRESETS,fontSizeCSS,isFontSize,type FontSizePreset} from '../src/font-size';
import {copyBoardStyle,applyBoardStyle} from '../src/board-style';
import {readBoard,writeBoard,validateEdgeStyle} from '../src/core/format';
import {defaultPreferences,validatePreferences} from '../src/core/preferences';
import {edgeStyle,type Board} from '../src/shared';

test('shared font presets round-trip in Text, labels, defaults and copied styles; literal sizes stay literal',()=>{
 const board:Board={path:'B.whiteboard',name:'B',folder:'',revision:'',cards:[{id:'text',cardId:'',x:0,y:0,width:240,height:80,object:{type:'text',text:'Keep content',shape:'ellipse',fontSize:23}}],edges:[{id:'edge',from:'text',to:'text',label:'Keep label',labelSize:18}]};
 for(const size of Object.keys(FONT_SIZE_PRESETS) as FontSizePreset[]){
  const styled={...board,cards:[{...board.cards[0],object:{type:'text' as const,text:'Keep content',shape:'ellipse' as const,fontSize:size}}],edges:[{...board.edges[0],labelSize:size}]};
  const saved=readBoard(board.path,writeBoard(styled));assert.deepEqual(saved.cards,styled.cards);assert.deepEqual(saved.edges,styled.edges);
  assert.equal(validatePreferences({...defaultPreferences(),whiteboardText:{fontSize:size}}).whiteboardText?.fontSize,size);
  assert.equal(edgeStyle(styled.edges[0]).labelSize,size);
  assert.equal(fontSizeCSS(size),`var(--whiteboard-font-size-${size}, ${FONT_SIZE_PRESETS[size]}px)`);
  assert.equal(copyBoardStyle(styled,['text'],[],[])?.fontSize,size);
  const pasted=applyBoardStyle(board,['text'],['edge'],copyBoardStyle(styled,[],['edge'],[])!);
  assert.deepEqual(pasted.cards[0].object,{...board.cards[0].object,fontSize:size});assert.equal(pasted.edges[0].labelSize,size);assert.equal(pasted.edges[0].label,'Keep label');
 }
 const saved=readBoard(board.path,writeBoard(board));assert.deepEqual(saved.cards,board.cards);assert.deepEqual(saved.edges,board.edges);assert.equal(fontSizeCSS(23),23);
 for(const size of [8,12,14,18,20,23,24,120]){assert.equal(isFontSize(size),true);validateEdgeStyle({labelSize:size});}
 for(const size of [null,NaN,Infinity,7,121,'20','M','large','toString','url(test)',{},[]]){assert.equal(isFontSize(size),false);assert.throws(()=>validateEdgeStyle({labelSize:size as never}));assert.throws(()=>validatePreferences({...defaultPreferences(),whiteboardText:{fontSize:size as never}}));}
});
