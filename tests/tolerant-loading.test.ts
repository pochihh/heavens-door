import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Workspace} from '../src/core/workspace';
import {History} from '../src/core/history';
import {defaultPreferences,readPreferences,writePreferences} from '../src/core/preferences';
import {emptyBoard,writeBoard,revision} from '../src/core/format';
import {pane} from '../src/layout';
import {documentIndex} from '../src/renderer/documents';

async function fixture(){const dir=await fs.mkdtemp(join(tmpdir(),'heavens-tolerant-')),root=join(dir,'Workspace'),cache=join(dir,'cache');await fs.mkdir(root);await fs.mkdir(cache);await fs.mkdir(join(root,'.heavens-door'));return {dir,root,cache};}

test('settings salvage supported fields, preserve future values and other-app changes, and back up malformed data',async t=>{
  const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));const file=join(f.root,'.heavens-door/settings.json'),tree=pane('board:');
  const raw={...defaultPreferences(),theme:'dark',stem:42,futurePlugin:{keep:'exact'},features:{reading:false,graph:'invalid',future:true},documents:{tree,active:tree.id,formatting:[],views:{deep:{camera:{x:1,y:2,zoom:4}},bad:{camera:{x:1,y:2,zoom:0}},scroll:{scroll:123}}}};
  await fs.writeFile(file,JSON.stringify(raw));const warnings:string[]=[];const loaded=await readPreferences(f.root,message=>warnings.push(message));
  assert.equal(loaded.theme,'dark');assert.equal(loaded.stem,'untitled');assert.equal(loaded.features?.reading,false);assert.deepEqual(loaded.documents?.views.deep.camera,{x:1,y:2,zoom:4});assert.equal(loaded.documents?.views.bad,undefined);assert.equal(loaded.documents?.views.scroll.scroll,123);assert.ok(warnings.length);
  const original=await fs.readFile(file,'utf8');assert.equal(original,JSON.stringify(raw),'opening never rewrites settings');
  await fs.writeFile(file,JSON.stringify({...raw,titlePlaceholder:'Another app changed this'}));const updated=await writePreferences(f.root,loaded,{theme:'light'});const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(saved.stem,42);assert.deepEqual(saved.futurePlugin,raw.futurePlugin);assert.deepEqual(saved.documents,raw.documents);assert.equal(saved.theme,'light');assert.equal(updated.titlePlaceholder,'Another app changed this');
  assert.equal((await fs.readdir(join(f.root,'.heavens-door'))).filter(p=>p.startsWith('settings.unreadable.')).length,1);
  await fs.writeFile(file,'{broken settings');assert.equal((await readPreferences(f.root)).theme,'system');await writePreferences(f.root,defaultPreferences(),{theme:'dark'});const backups=(await fs.readdir(join(f.root,'.heavens-door'))).filter(p=>p.startsWith('settings.unreadable.'));assert.ok((await Promise.all(backups.map(p=>fs.readFile(join(f.root,'.heavens-door',p),'utf8')))).includes('{broken settings'));
});

test('bad cards, tags and mother board remain reachable without blocking other content or rewriting originals',async t=>{
  const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));const badCard='---\ncard-id: broken-card\nbad: [\n---\n# Keep this content',badBoard='{broken board';
  await fs.writeFile(join(f.root,'Bad.md'),badCard);await fs.writeFile(join(f.root,'Good.md'),'# Good\n\nKeep editing');await fs.writeFile(join(f.root,'Workspace.whiteboard'),badBoard);await fs.writeFile(join(f.root,'bad.tag'),'---\ninvalid: [\n---');
  const w=await Workspace.open(f.root,f.cache);t.after(()=>w.close());const snapshot=w.snapshot();
  assert.equal(snapshot.cards.length,2);assert.ok(snapshot.fileErrors?.['Bad.md']);assert.ok(snapshot.fileErrors?.['Workspace.whiteboard']);assert.ok(snapshot.fileErrors?.['bad.tag']);assert.ok(snapshot.boards.some(b=>!b.folder));assert.equal(snapshot.cards.find(c=>c.path==='Bad.md')?.id,'broken-card');assert.ok(documentIndex(snapshot).documents.get('tag:bad.tag')?.exists);
  const good=await w.card('Good.md');await w.saveCard(good.path,'# Good\n\nEdited',good.revision);assert.equal(await fs.readFile(join(f.root,'Bad.md'),'utf8'),badCard);assert.equal(await fs.readFile(join(f.root,'Workspace.whiteboard'),'utf8'),badBoard);
  await assert.rejects(()=>w.saveCard('Bad.md','# overwrite',revision(badCard)));const stamp=await import('../src/core/files').then(m=>m.fileStamp(f.root,'Bad.md'));const deleted=await w.fileOperation({action:'trash',path:'Bad.md',expected:stamp});await w.fileOperation(deleted.inverse);assert.equal(await fs.readFile(join(f.root,'Bad.md'),'utf8'),badCard);
});

test('a corrupt derived index is preserved and rebuilt from files',async t=>{
  const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));await fs.writeFile(join(f.root,'Good.md'),'# Good');await fs.writeFile(join(f.cache,'index.sqlite'),'not a SQLite database');const w=await Workspace.open(f.root,f.cache);t.after(()=>w.close());assert.equal(w.snapshot().cards.length,1);assert.ok((await fs.readdir(f.cache)).some(p=>p.startsWith('index.sqlite.unreadable.')));
});

test('optional history failure does not prevent content access',async t=>{
  const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));await fs.writeFile(join(f.root,'Good.md'),'# Good');t.mock.method(History.prototype,'initialize',async()=>{throw new Error('Git unavailable');});const w=await Workspace.open(f.root,f.cache);t.after(()=>w.close());assert.equal(w.snapshot().historyAvailable,false);assert.match(w.snapshot().serviceErrors?.history??'',/Git unavailable/);assert.equal((await w.card('Good.md')).body,'# Good');
});

test('unresolved recovery permits reading while retaining the write guard and original journal',async t=>{
  const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));await fs.writeFile(join(f.root,'Good.md'),'# Good');const journal=join(f.cache,'transaction.json');await fs.writeFile(journal,'{broken recovery');const mother=writeBoard(emptyBoard('Workspace.whiteboard'));await fs.writeFile(join(f.root,'Workspace.whiteboard'),mother);
  const w=await Workspace.open(f.root,f.cache);t.after(()=>w.close());assert.match(w.snapshot().serviceErrors?.recovery??'',/SyntaxError/);assert.equal((await w.card('Good.md')).body,'# Good');await assert.rejects(()=>w.saveCard('Good.md','# Overwrite',revision('# Good')),/Interrupted|interrupted/);assert.equal(await fs.readFile(journal,'utf8'),'{broken recovery');assert.equal(await fs.readFile(join(f.root,'Good.md'),'utf8'),'# Good');
});

test('duplicate identities are addressable by exact file path for repair',async t=>{
 const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));for(const name of ['One.md','Two.md'])await fs.writeFile(join(f.root,name),'---\ncard-id: duplicated\n---\n# Keep both');const w=await Workspace.open(f.root,f.cache);t.after(()=>w.close());const snapshot=w.snapshot(),index=documentIndex(snapshot);assert.ok(snapshot.fileErrors?.['One.md']);assert.equal(index.paths.get('One.md'),'file:One.md');assert.equal(index.paths.get('Two.md'),'file:Two.md');
});

test('registry lists valid entries without rewriting malformed registrations',async t=>{
  const f=await fixture();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));const {WorkspaceRegistry}=await import('../src/core/registry'),path=join(f.dir,'workspaces.json'),raw=JSON.stringify([{root:f.root,lastUpdated:null},{root:42,lastUpdated:null}]);await fs.writeFile(path,raw);const registry=new WorkspaceRegistry(path);
  assert.equal((await registry.list()).length,1);assert.equal((await registry.list(true))[0].root,f.root);assert.equal(await fs.readFile(path,'utf8'),raw);await assert.rejects(()=>registry.register(f.root));
  await fs.writeFile(path,'{bad registry');assert.deepEqual(await registry.list(),[]);assert.deepEqual(await registry.list(true),[]);assert.equal(await fs.readFile(path,'utf8'),'{bad registry');
});
