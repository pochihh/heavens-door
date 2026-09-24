import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../src/core/workspace';
import { Session } from '../src/renderer/session';
import type { Bridge } from '../src/shared';

test('typing during an in-flight save is retained, and conflicting drafts remain recoverable',async t => {
  const folder=await fs.mkdtemp(join(tmpdir(),'heavens-door-session-'));
  const root=join(folder,'notes'); await fs.mkdir(root);
  const w=await Workspace.open(root,join(folder,'cache')); await w.create('','untitled',0,0);
  let release: () => void = () => undefined;
  let saving: () => void = () => undefined;
  let block=true;
  const started=new Promise<void>(resolve => { saving=resolve; });
  const gate=new Promise<void>(resolve => { release=resolve; });
  const bridge={request:async request => {
    if (request.kind === 'card') return w.card(request.path);
    if (request.kind === 'snapshot') return w.snapshot();
    if (request.kind === 'saveCard') {
      if (block) { block=false; saving(); await gate; }
      return w.saveCard(request.path,request.body,request.expected);
    }
    throw new Error('Unexpected request');
  }} as Bridge;
  const session=new Session(bridge); session.update({snapshot:w.snapshot()});
  t.after(async () => { session.dispose(); w.close(); await fs.rm(folder,{recursive:true,force:true}); });
  await session.select('untitled.md'); session.edit('First');
  const flush=session.run(() => session.flush()); await started;
  session.edit('First plus a newer keystroke'); release(); await flush;
  assert.equal((await w.card('untitled.md')).body,'First plus a newer keystroke');
  assert.equal(session.state.draft?.dirty,false);
  assert.equal(session.undoHistory.past.length,1);
  await fs.writeFile(join(root,'untitled.md'),(await w.read('untitled.md'))+'\nAn external edit');
  session.edit('A local draft');
  await assert.rejects(() => session.run(() => session.flush()),/External changes/);
  assert.equal(session.state.draft?.body,'A local draft');
  assert.equal(session.state.draft?.dirty,true);
  assert.match(await w.read('untitled.md'),/An external edit/);
});
