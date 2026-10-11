import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {newNote} from '../src/core/format';
import {graphLayout,graphProject,graphUnproject,graphRotate,graphStep,type WorkspaceGraph} from '../src/graph';
import {defaultDocks,validateDocks} from '../src/layout';
import {defaultPreferences,validatePreferences} from '../src/core/preferences';
import {documentInfo} from '../src/renderer/documents';

test('workspace graph derives ownership, references, drawn edges and unambiguous mentions without editing files',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'door-graph-')),root=join(dir,'Workspace');await fs.mkdir(root);const w=await Workspace.open(root,join(dir,'cache'));t.after(async()=>{w.close();await fs.rm(dir,{recursive:true,force:true});});
  await w.createFolder('','Ideas');await w.createFolder('Ideas','Nested');for(const folder of ['Slipbox','Journal','Templates','Elsewhere'])await w.ensureFolder(folder);
  await w.write([{path:'Ideas/A.md',content:newNote()+'# A\n\n[[B|Alias]] [Nested](Nested/Nested.whiteboard) `[[Hidden]]`',expected:null},{path:'Ideas/Nested/B.md',content:newNote()+'# B\n\n[A](../A.md)',expected:null},{path:'Slipbox/C.md',content:newNote()+'# C\n',expected:null},{path:'Journal/2026-10-11.md',content:newNote()+'# Journal\n',expected:null},{path:'Templates/T.md',content:newNote()+'# Template\n\n[[A]]',expected:null},{path:'Slipbox/slipbox.md',content:newNote()+'# Guide\n',expected:null}]);
  const a=await w.card('Ideas/A.md'),b=await w.card('Ideas/Nested/B.md'),c=await w.card('Slipbox/C.md');let board=w.snapshot().boards.find(n=>n.folder==='Ideas')!;
  const placed=await w.placeCard(c.id,c.revision,'Ideas',board.revision,0,0,'reference');board=placed.snapshot.boards.find(n=>n.folder==='Ideas')!;
  const own=board.cards.find(p=>p.cardId===a.id)!,reference=board.cards.find(p=>p.cardId===c.id)!,child=board.cards.find(p=>p.folder==='Ideas/Nested')!;child.fillColor='#80aaa6';
  await w.saveBoard({...board,cards:board.cards,edges:[{id:'line',from:own.id,to:reference.id}]},board.revision);await w.setFill([{path:a.path,expected:a.revision}],'#c9838a');
  const before=await w.read(a.path),graph=w.workspaceGraph(),node=(key:string)=>graph.nodes.find(n=>n.key===key)!,has=(from:string,to:string,kind:string)=>graph.links.some(l=>l.from===from&&l.to===to&&l.kind===kind);
  assert.equal(node('card:'+a.id).parent,'board:Ideas');assert.equal(node('board:Ideas/Nested').parent,'board:Ideas');assert.equal(node('board:Ideas/Nested').color,'#80aaa6');assert.equal(node('card:'+a.id).color,'#c9838a');
  assert.ok(has('board:Ideas','card:'+c.id,'reference'));assert.equal(node('card:'+c.id).parent,undefined);assert.ok(has('card:'+a.id,'card:'+c.id,'edge'));assert.ok(has('card:'+a.id,'card:'+b.id,'mention'));assert.ok(has('card:'+b.id,'card:'+a.id,'mention'));assert.ok(has('card:'+a.id,'board:Ideas/Nested','mention'));
  assert.ok(graph.nodes.some(n=>n.path.startsWith('Journal/')));assert.ok(!graph.nodes.some(n=>n.path==='Templates/T.md'||n.path==='Slipbox/slipbox.md'));assert.equal(await w.read(a.path),before);
  await w.write([{path:'Elsewhere/B.md',content:newNote()+'# B\n',expected:null}]);assert.ok(!w.workspaceGraph().links.some(l=>l.from==='card:'+a.id&&l.to==='card:'+b.id&&l.kind==='mention'),'ambiguous wiki names are never guessed');
  const prefs=defaultPreferences();assert.equal(documentInfo('graph:',{...w.snapshot(),preferences:prefs}).exists,true);assert.equal(documentInfo('graph:',{...w.snapshot(),preferences:{...prefs,features:{graph:false}}}).exists,false);assert.throws(()=>validatePreferences({...prefs,graphMode:'4d'}));
  const old=defaultDocks();old.right.groups[0].tabs=old.right.groups[0].tabs.filter(id=>id!=='graph');assert.ok(validateDocks(old).right.groups[0].tabs.includes('graph'),'saved docks migrate without losing their other views');
});

test('radial hierarchy, 3D picking and spring motion keep their positions finite and reversible',()=>{
  const graph:WorkspaceGraph={nodes:[{key:'board:',kind:'board',path:'Root.whiteboard',name:'Root'},{key:'board:A',kind:'board',path:'A/A.whiteboard',name:'A',parent:'board:'},{key:'card:a',kind:'card',path:'A/a.md',name:'A card',parent:'board:A'},{key:'card:linked',kind:'card',path:'Slipbox/linked.md',name:'Linked'},{key:'card:loose',kind:'card',path:'Slipbox/loose.md',name:'Loose'}],links:[{from:'board:',to:'board:A',kind:'membership'},{from:'board:A',to:'card:a',kind:'membership'},{from:'card:a',to:'card:linked',kind:'mention'}]};
  const flat=graphLayout(graph,'2d'),space=graphLayout(graph,'3d');assert.deepEqual(flat,graphLayout(graph,'2d'));assert.ok(flat.every(n=>n.z===0));assert.ok(space.some(n=>n.z!==0));
  const radius=(key:string)=>Math.hypot(...Object.values(flat.find(n=>n.key===key)!.home));assert.ok(radius('board:')<radius('board:A'));assert.ok(radius('board:A')<radius('card:a'));assert.ok(radius('card:a')<radius('card:loose'));assert.ok(radius('card:linked')<radius('card:loose'));
  const camera={x:60,y:-40,zoom:.7,yaw:.8,pitch:-.4,distance:1800};for(const mode of ['2d','3d'] as const)for(const node of mode==='2d'?flat:space){const projected=graphProject(node,camera,900,600,mode),world=graphUnproject(projected.x,projected.y,mode==='3d'?graphRotate(node,camera).z:0,camera,900,600,mode);assert.ok(Math.hypot(world.x-node.x,world.y-node.y,world.z-node.z)<1e-8);}
  space[2].x+=70;const held={x:space[2].x,y:space[2].y,z:space[2].z};graphStep(space,graph.links,'card:a');assert.deepEqual({x:space[2].x,y:space[2].y,z:space[2].z},held);for(let i=0;i<300;i++)graphStep(space,graph.links);assert.ok(space.every(n=>[n.x,n.y,n.z,n.vx,n.vy,n.vz].every(Number.isFinite)));assert.ok(Math.abs(space[2].x-space[2].home.x)<1);
});
