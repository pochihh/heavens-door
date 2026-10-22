import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePreviewSnapshot,type PreviewSnapshot} from '../scripts/performance/preview-snapshot';
const viewport={width:1600,height:968,dpr:2},ids=new Set(['p0']);
const snapshot=():PreviewSnapshot=>{
 const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.writeUInt32BE(13,8);header.write('IHDR',12);header.writeUInt32BE(512,16);header.writeUInt32BE(512,20);
 // Header validation precedes native PNG decoding, which is exercised by the benchmark.
 return {version:1,signature:'source',viewport,scale:.036,geometry:[['p0',{dx:0,dy:0,width:320,height:240,anchorDx:0,anchorDy:0,anchorWidth:320,anchorHeight:240}]],tiles:[{id:'tile',box:{x:0,y:0,width:100,height:100},width:512,height:512,src:'data:image/png;base64,'+header.toString('base64')}]};
};
test('preview snapshots reject changed identity, malformed geometry and unsafe PNG sizes before decoding',()=>{
 assert.ok(validatePreviewSnapshot(snapshot(),'source',viewport,ids));
 for(const mutate of [(s:PreviewSnapshot)=>s.signature='old',(s:PreviewSnapshot)=>s.viewport={...viewport,dpr:1},(s:PreviewSnapshot)=>s.geometry.push(s.geometry[0]),(s:PreviewSnapshot)=>s.geometry[0][1].height=NaN,(s:PreviewSnapshot)=>s.tiles[0].width=511,(s:PreviewSnapshot)=>s.tiles[0].width=100000,(s:PreviewSnapshot)=>s.tiles[0].src='data:image/png;base64,invalid',(s:PreviewSnapshot)=>s.tiles.push(s.tiles[0])]){const s=snapshot();mutate(s);assert.throws(()=>validatePreviewSnapshot(s,'source',viewport,ids));}
 const tooMany=snapshot();tooMany.tiles=Array.from({length:33},(_,i)=>({...tooMany.tiles[0],id:String(i)}));assert.throws(()=>validatePreviewSnapshot(tooMany,'source',viewport,ids),/budget/);
 assert.throws(()=>validatePreviewSnapshot(snapshot(),'source',viewport,new Set()));
});
