import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
test('Chrome capture retains offline content, retries with the same identity, and stays paired to its workspace',async()=>{
 const storage={connection:{port:27319,token:'local-test-key',workspace:'workspace-one'},queue:[]};let message,online=false;const delivered=[];
 const chrome={storage:{local:{get:async()=>structuredClone(storage),set:async patch=>Object.assign(storage,patch)}},runtime:{onMessage:{addListener:fn=>message=fn},onStartup:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}}};
 runInNewContext(await readFile(new URL('../extensions/chrome/worker.js',import.meta.url),'utf8'),{chrome,crypto:{randomUUID},AbortSignal,fetch:async(url,options)=>{if(!online)throw Error('App closed');delivered.push({url,value:JSON.parse(options.body)});return {ok:true};}});
 const call=value=>new Promise(resolve=>message(value,{},resolve)),value={workspace:'workspace-one',url:'https://example.org',html:'<p>Saved while offline</p>',name:'Saved page'};
 assert.equal((await call({kind:'capture',value})).queued,true);assert.equal(storage.queue.length,1);const id=storage.queue[0].id;
 online=true;assert.equal((await call({kind:'retry'})).queued,false);assert.equal(storage.queue.length,0);assert.equal(delivered[0].value.id,id);assert.equal(delivered[0].value.html,value.html);assert.equal(delivered[0].url,'http://127.0.0.1:27319/capture');
 storage.connection.workspace='workspace-two';storage.queue=[{id,value}];await call({kind:'retry'});assert.equal(storage.queue.length,1);assert.equal(delivered.length,1,'changing workspaces must not send old queued pages into the new one');
});
