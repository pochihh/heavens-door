import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from '../src/core/workspace';
import { Session } from '../src/renderer/session';
import { StyleView } from '../src/renderer/StyleView';
import { DEFAULT_PALETTE, cardFill } from '../src/colors';
import { readPreferences, validatePreferences } from '../src/core/preferences';
import { readCard, splitNote } from '../src/core/format';
import type { Board, Bridge, PaletteColor } from '../src/shared';

test('card fill is portable, revision-checked and undoable with tile fills while palette changes affect only future choices',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-colors-')),root=join(dir,'notes');await fs.mkdir(root);
  const w=await Workspace.open(root,join(dir,'cache'));
  await w.createFolder('','Ideas');await w.createFolder('Ideas','Child');await w.createFolder('','Other');await w.create('Ideas','one',0,0);
  let card=await w.card('Ideas/one.md');await w.saveCard(card.path,'# Original\n\nKeep this body.',card.revision);card=await w.card(card.path);
  const other=w.snapshot().boards.find(b=>b.folder==='Other')!;
  const reference={id:'reference',cardId:card.id,x:0,y:0,width:300,height:200,fillColor:'#ffffff'};
  await w.saveBoard({...other,cards:[reference]},other.revision);
  const bridge={request:async r=>{
    if(r.kind==='saveCard')return w.saveCard(r.path,r.body,r.expected);
    if(r.kind==='setFill')return w.setFill(r.cards,r.color,r.board);
    if(r.kind==='write')return w.write(r.changes);
    if(r.kind==='card')return w.card(r.path);
    if(r.kind==='snapshot')return w.snapshot();
    throw new Error(r.kind);
  }} as Bridge;
  const session=new Session(bridge);session.update({snapshot:w.snapshot()});
  t.after(async()=>{session.dispose();w.close();await fs.rm(dir,{recursive:true,force:true});});
  await session.select(card.path);session.edit('# Unsaved title\n\nKeep this body.');
  const board=w.snapshot().boards.find(b=>b.folder==='Ideas')!;
  const next={...board,cards:board.cards.map(p=>p.folder?{...p,fillColor:'#91aa8b'}:p)};
  await session.fillCards([card.id,card.id],'#91aa8b',next,board);
  const saved=await w.card(card.path),info=w.snapshot().cards.find(c=>c.id===card.id)!;
  assert.equal(saved.fillColor,'#91aa8b');assert.equal(saved.body,'# Unsaved title\n\nKeep this body.');
  assert.equal(splitNote(await w.read(card.path)).front.get('card-color'),'#91aa8b');
  assert.equal(session.state.draft?.card.revision,saved.revision,'metadata save advances an open editor revision');
  assert.equal(cardFill(info,reference),'#91aa8b','source metadata overrides an older placement color');
  assert.deepEqual(session.undoHistory.past.at(-1)?.edits.map(e=>e.path).sort(),[card.path,board.path].sort(),'mixed card/tile styling is a single transaction');
  const palette=DEFAULT_PALETTE.map(c=>({...c,color:c.id==='sage'?'#ffffff':c.color}));
  await w.setPreferences({palette});assert.deepEqual((await readPreferences(root)).palette,palette);
  assert.equal((await w.card(card.path)).fillColor,'#91aa8b','editing a palette does not recolor existing cards');
  await session.undo();assert.equal((await w.card(card.path)).fillColor,undefined);assert.equal(w.snapshot().boards.find(b=>b.path===board.path)!.cards.find(p=>p.folder)!.fillColor,undefined);
  assert.equal((await w.card(card.path)).body,saved.body,'undoing color keeps the preceding text edit');
  await session.undo(true);assert.equal((await w.card(card.path)).fillColor,'#91aa8b');
  await session.fillCards([card.id],undefined);assert.equal((await w.card(card.path)).fillColor,null);assert.equal(cardFill((await w.card(card.path)),{...board.cards[0],fillColor:'#ffffff'}),undefined,'Theme overrides legacy placement fill');
  const before=await w.card(card.path);await w.saveCard(card.path,'# External edit',before.revision);
  await assert.rejects(w.setFill([{path:card.path,expected:before.revision}],'#8aa5c5'),/External changes/);
  assert.equal((await w.card(card.path)).body,'# External edit');
  assert.throws(()=>readCard('bad.md','---\ncard-color: "url(example)"\n---\n'),/Invalid card color/);
  assert.throws(()=>validatePreferences({...w.snapshot().preferences,palette:[{id:'x',name:'Bad',color:'red'}]}),/Invalid workspace palette/);
});

test('Style View provides preview buttons and an editable workspace palette with explicit save',async()=>{
  const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const board:Board={path:'b.whiteboard',folder:'',name:'B',revision:'r',cards:[],edges:[]};
  let savedPalette:PaletteColor[]|undefined;
  const session={board:async()=>undefined,fillCards:async()=>undefined} as Pick<Session,'board'|'fillCards'>;
  const root=createRoot(document.getElementById('root')!);
  const click=async(label:string)=>act(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent===label);assert.ok(button,label);button.click();});
  try{
    await act(async()=>root.render(<StyleView board={board} session={session} onPalette={async p=>{savedPalette=p;}}/>));
    assert.equal(document.querySelector('select'),null);assert.ok(document.querySelector('[aria-label="4 px"] svg'));
    await click('Edit palette');await click('Move color later');await click('Remove this palette color');
    assert.equal(savedPalette,undefined,'editing the palette remains a draft until saved');
    await click('Save');assert.equal(savedPalette![0].id,'rose');assert.equal(savedPalette!.length,DEFAULT_PALETTE.length-1);
    await click('Edit palette');await click('Add color');await click('Reset palette');await click('Save');
    assert.deepEqual(savedPalette,DEFAULT_PALETTE);
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
