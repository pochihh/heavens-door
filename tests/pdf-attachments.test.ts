import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {readPdfFile} from '../src/core/reading';
import {importImage} from '../src/core/images';
import {DEFAULT_EDITOR_SETTINGS} from '../src/editor-settings';
import {revision} from '../src/core/format';
import {splitAnnotations,withAnnotations} from '../src/reading';
import {Session} from '../src/renderer/session';
import type {Bridge} from '../src/shared';
const bytes=Buffer.from('%PDF-1.4\nSelected PDF source\n%%EOF');

test('attaching and relinking workspace PDFs retains the original files and never creates another asset copy',async t=>{
 const base=await fs.mkdtemp(join(tmpdir(),'heavens-linked-pdf-')),root=join(base,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(base,'cache'));t.after(async()=>{w.close();await fs.rm(base,{recursive:true,force:true});});await w.createFolder('','Board');await fs.mkdir(join(root,'Sources'));await fs.mkdir(join(root,'_assets'));const source=join(root,'Sources','Local % 1.pdf');await fs.writeFile(source,bytes);await fs.writeFile(join(root,'_assets','Kept.pdf'),bytes);
 const value=await readPdfFile(root,source);assert.equal(value.file,'Sources/Local % 1.pdf');const board=w.snapshot().boards.find(b=>b.folder==='Board')!,result=await w.importReading({...value,folder:'Board',placement:{expected:board.revision,x:120,y:240}});let card=await w.card(result.path);
 assert.equal(resolve(root,dirname(card.path),decodeURIComponent(card.source!.file!)),source);assert.deepEqual(await fs.readdir(join(root,'_assets')),['Kept.pdf']);const placement=result.snapshot.boards.find(b=>b.folder==='Board')!.cards[0];assert.equal(placement.cardId,card.id);assert.deepEqual([placement.x,placement.y],[120,240]);
 await w.write(result.edits.map(e=>({path:e.path,expected:e.after===null?null:revision(e.after),content:e.before})));assert.equal(w.snapshot().boards.find(b=>b.folder==='Board')!.cards.length,0);assert.equal(w.snapshot().cards.some(c=>c.id===card.id),false);assert.deepEqual(await fs.readFile(source),bytes,'undo removes the wrapper and placement, never the original PDF');
 const imported=await w.importReading({...value,folder:'Board'});card=await w.card(imported.path);const body=withAnnotations('# Paper',[{id:'saved',kind:'highlight',quote:'A passage',text:'A comment',page:1,rects:[[.1,.1,.2,.05]]}]);await w.saveCard(card.path,body,card.revision);card=await w.card(card.path);
 const relink=await w.relinkPdfSource(card.path,card.revision,await readPdfFile(root,join(root,'_assets','Kept.pdf'))),linked=await w.card(card.path);assert.equal(linked.id,card.id);assert.equal(linked.body,body);assert.deepEqual(splitAnnotations(linked.body).annotations,splitAnnotations(body).annotations);assert.equal(resolve(root,dirname(linked.path),decodeURIComponent(linked.source!.file!)),join(root,'_assets','Kept.pdf'));assert.deepEqual(await fs.readdir(join(root,'_assets')),['Kept.pdf']);
 await w.write(relink.edits.map(e=>({path:e.path,expected:e.after===null?null:revision(e.after),content:e.before})));assert.equal((await w.card(card.path)).source!.file,card.source!.file);
 await assert.rejects(()=>w.importReading({...value,file:'../outside.pdf',folder:'Board'}));await fs.symlink(source,join(root,'Shortcut.pdf'));await assert.rejects(()=>w.importReading({...value,file:'Shortcut.pdf',folder:'Board'}),/symbolic/i);assert.deepEqual(await fs.readdir(join(root,'_assets')),['Kept.pdf']);
});

test('external PDFs default to their board assets folder; relinking to that copy does not duplicate it',async t=>{
 const base=await fs.mkdtemp(join(tmpdir(),'heavens-external-pdf-')),root=join(base,'vault'),outside=join(base,'vault-other');await fs.mkdir(root);await fs.mkdir(outside);const w=await Workspace.open(root,join(base,'cache'));t.after(async()=>{w.close();await fs.rm(base,{recursive:true,force:true});});await w.createFolder('','Board');const source=join(outside,'External.pdf');await fs.writeFile(source,bytes);const value=await readPdfFile(root,source);assert.equal(value.file,undefined,'a sibling path with the workspace prefix is still external');
 const result=await w.importReading({...value,folder:'Board'}),card=await w.card(result.path),copy=resolve(root,dirname(card.path),decodeURIComponent(card.source!.file!));assert.equal(dirname(copy),join(root,'Board','_assets'));assert.notEqual(copy,source);assert.deepEqual(await fs.readFile(copy),bytes);const before=await fs.readdir(join(root,'Board','_assets'));
 await w.relinkPdfSource(card.path,card.revision,await readPdfFile(root,copy));assert.deepEqual(await fs.readdir(join(root,'Board','_assets')),before);assert.deepEqual(await fs.readFile(source),bytes);await fs.writeFile(join(root,'Bad.pdf'),'Not PDF');await assert.rejects(()=>readPdfFile(root,join(root,'Bad.pdf')),/Invalid reading import/);
});

test('file explorer PDF attachments create their Markdown wrapper and placement in one undo action',async t=>{
 const base=await fs.mkdtemp(join(tmpdir(),'heavens-pdf-session-')),root=join(base,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(base,'cache'));t.after(async()=>{w.close();await fs.rm(base,{recursive:true,force:true});});await w.createFolder('','Board');await fs.writeFile(join(root,'Original.pdf'),bytes);const session=new Session({importReading:value=>w.importReading(value),attachmentData:async path=>new Uint8Array(await fs.readFile(join(root,path))),request:async request=>{if(request.kind==='write')return w.write(request.changes);if(request.kind==='card')return w.card(request.path);throw new Error(request.kind);}} as Bridge);t.after(()=>session.dispose());session.update({snapshot:w.snapshot()});
 await session.attachPdfFiles('Board',['Original.pdf'],320,180);const board=session.state.snapshot!.boards.find(b=>b.folder==='Board')!,card=session.state.snapshot!.cards.find(c=>c.id===board.cards[0].cardId)!;assert.deepEqual([board.cards[0].x,board.cards[0].y],[320,180]);assert.equal(card.path,'Board/Original.md');await session.undo(false);assert.equal(session.state.snapshot!.boards.find(b=>b.folder==='Board')!.cards.length,0);assert.equal(session.state.snapshot!.cards.some(c=>c.id===card.id),false);assert.deepEqual(await fs.readFile(join(root,'Original.pdf')),bytes);
});


test('PDFs, webpage snapshots and card or board images share local and workspace attachment settings',async t=>{
 const base=await fs.mkdtemp(join(tmpdir(),'heavens-asset-storage-')),root=join(base,'notes');await fs.mkdir(root);const w=await Workspace.open(root,join(base,'cache'));t.after(async()=>{w.close();await fs.rm(base,{recursive:true,force:true});});await w.createFolder('','Projects');await w.createFolder('Projects','Board');const folder='Projects/Board',boardPath=folder+'/Board.whiteboard';
 for(const imageLocation of ['beside','workspace'] as const){
  const imageFolder='Resources/Assets';await w.setPreferences({editor:{...DEFAULT_EDITOR_SETTINGS,imageLocation,imageFolder}});const expected=join(root,imageLocation==='beside'?folder:'',imageFolder);
  const imported=await w.importReading({name:'Paper',type:'pdf',data:bytes,folder}),card=await w.card(imported.path),source=resolve(root,dirname(card.path),decodeURIComponent(card.source!.file!));assert.equal(dirname(source),expected);assert.deepEqual(await fs.readFile(source),bytes);
  const web=await w.importReading({name:'Web',type:'web',data:Buffer.from('<html>Snapshot</html>'),folder}),article=await w.card(web.path);assert.equal(dirname(resolve(root,dirname(article.path),article.source!.file!)),expected);
  for(const owner of [card.path,boardPath]){const image=await importImage(root,owner,'figure.png','image/png',new Uint8Array([1,2,3]));const target=resolve(root,dirname(owner),image.src);assert.equal(dirname(target),expected);assert.deepEqual(await fs.readFile(target),Buffer.from([1,2,3]));}
  await w.relinkPdfSource(card.path,card.revision,{name:'Replacement.pdf',data:bytes});assert.equal(dirname(resolve(root,dirname(card.path),(await w.card(card.path)).source!.file!)),expected);
 }
 await assert.rejects(fs.access(join(root,'_assets')),'no global assets folder is created by default or by a custom location');
 const outside=join(base,'outside');await fs.mkdir(outside);await fs.symlink(outside,join(root,folder,'Escape'));await w.setPreferences({editor:{...DEFAULT_EDITOR_SETTINGS,imageFolder:'Escape/Nested'}});await assert.rejects(()=>w.importReading({name:'Blocked',type:'pdf',data:bytes,folder}),/symbolic/i);assert.deepEqual(await fs.readdir(outside),[]);
});
