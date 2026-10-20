import {test} from 'node:test';
import assert from 'node:assert/strict';
import {annotationPositions} from '../src/renderer/annotation-layout';
const pages=[{page:1,top:70,height:600},{page:2,top:680,height:600},{page:3,top:1290,height:600}];
test('PDF comments align to their page and overflow before a following page with notes',()=>{
 const positions=annotationPositions([{id:'a',page:1,height:300},{id:'b',page:1,height:300},{id:'c',page:1,height:80},{id:'d',page:2,height:200}],pages);
 assert.deepEqual(positions.get('a'),{top:70,column:0});assert.deepEqual(positions.get('b'),{top:70,column:1});assert.deepEqual(positions.get('c'),{top:378,column:1});assert.deepEqual(positions.get('d'),{top:680,column:0});
});
test('blank pages can hold overflow; a tall comment never overlaps later comments',()=>{
 const positions=annotationPositions([{id:'a',page:1,height:800},{id:'b',page:3,height:20}],pages);assert.deepEqual(positions.get('a'),{top:70,column:0});assert.deepEqual(positions.get('b'),{top:1290,column:0});
 const tall=annotationPositions([{id:'a',page:1,height:1200},{id:'b',page:2,height:700},{id:'c',page:3,height:80}],pages);assert.deepEqual(tall.get('a'),{top:70,column:1});assert.deepEqual(tall.get('b'),{top:680,column:2});assert.deepEqual(tall.get('c'),{top:1290,column:0});
});
