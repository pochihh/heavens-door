import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Workspace} from '../src/core/workspace';
import {Session} from '../src/renderer/session';
import type {Bridge,Request} from '../src/shared';
test('layout persistence saves validated preferences without constructing a workspace snapshot',async t=>{
 const folder=await fs.mkdtemp(join(tmpdir(),'heavens-compact-layout-')),root=join(folder,'Notes');await fs.mkdir(root);const workspace=await Workspace.open(root,join(folder,'cache'));t.after(async()=>{workspace.close();await fs.rm(folder,{recursive:true,force:true});});
 const snapshot=workspace.snapshot();workspace.snapshot=()=>assert.fail('layout saves must not construct a content snapshot');
 const result=await workspace.setPreferences({navigation:{files:{scroll:42,expanded:['']}}},true);assert.deepEqual(Object.keys(result),['preferences']);assert.equal(result.preferences?.navigation?.files?.scroll,42);
 const before=await fs.readFile(join(root,'.heavens-door/settings.json'),'utf8');await assert.rejects(workspace.setPreferences({features:{journal:false}},true));assert.equal(await fs.readFile(join(root,'.heavens-door/settings.json'),'utf8'),before);assert.equal(snapshot.cards.length,0);
 const session=new Session({request:async(request:Request)=>{assert.equal(request.kind,'preferences');if(request.kind!=='preferences')throw Error('Unexpected request');assert.equal(request.compact,true);return workspace.setPreferences(request.patch,true);}} as unknown as Bridge);session.update({snapshot});t.after(()=>session.dispose());const cards=snapshot.cards,boards=snapshot.boards;
 session.schedulePreferences({navigation:{files:{scroll:84}}},workspace.root);await session.flushPreferences();assert.equal(session.state.snapshot?.cards,cards);assert.equal(session.state.snapshot?.boards,boards);assert.equal(session.state.snapshot?.preferences?.navigation?.files?.scroll,84);assert.equal(JSON.parse(await fs.readFile(join(root,'.heavens-door/settings.json'),'utf8')).navigation.files.scroll,84);
});
