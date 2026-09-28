import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readAppSettings,writeHardwareAcceleration} from '../src/app-settings';
import {PerformanceSettings} from '../src/renderer/PerformanceSettings';
import type {AppSettings,Bridge} from '../src/shared';

test('hardware acceleration defaults on, persists false, and rejects invalid or failed writes',async t=>{
  const dir=await fs.mkdtemp(join(tmpdir(),'heavens-app-settings-')),file=join(dir,'app-settings.json');
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  assert.deepEqual(readAppSettings(file),{hardwareAcceleration:true});
  assert.equal(writeHardwareAcceleration(file,false),false);
  assert.deepEqual(readAppSettings(file),{hardwareAcceleration:false});
  const saved=await fs.readFile(file,'utf8');
  assert.throws(()=>writeHardwareAcceleration(file,'false'),/on or off/);
  assert.equal(await fs.readFile(file,'utf8'),saved);
  await fs.writeFile(file,'{broken');
  const fallback=readAppSettings(file);assert.equal(fallback.hardwareAcceleration,true);assert.match(fallback.warning??'',/could not be read/);
  assert.equal(await fs.readFile(file,'utf8'),'{broken','a failed read does not rewrite user data');
  writeHardwareAcceleration(file,true);assert.deepEqual(readAppSettings(file),{hardwareAcceleration:true});
  const occupied=join(dir,'directory');await fs.mkdir(occupied);
  assert.throws(()=>writeHardwareAcceleration(occupied,false));
  assert.ok((await fs.stat(occupied)).isDirectory());
  assert.deepEqual((await fs.readdir(dir)).sort(),['app-settings.json','directory'],'failed atomic writes clean their temporary file');
});

test('Performance saves device preferences, receives other-window changes, and loads diagnostics only on demand',async()=>{
  const dom=new JSDOM('<div id="root"></div>');
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  let settings:AppSettings={hardwareAcceleration:true,restartRequired:false},changed=()=>{},diagnosticReads=0,fail=false,unsubscribed=false;
  const bridge:Pick<Bridge,'appSettings'|'setHardwareAcceleration'|'onAppSettingsChange'|'graphicsDiagnostics'>={
    appSettings:async()=>settings,
    setHardwareAcceleration:async enabled=>{if(fail)throw new Error('Disk full');return settings={hardwareAcceleration:enabled,restartRequired:!enabled};},
    onAppSettingsChange:listener=>{changed=listener;return()=>{unsubscribed=true;};},
    graphicsDiagnostics:async()=>{diagnosticReads++;return {hardwareAcceleration:true,features:{gpu_compositing:'enabled'},electron:'44',chromium:'test'};},
  };
  window.door=bridge as Bridge;
  const root=createRoot(document.getElementById('root')!);
  const toggle=()=>document.querySelector<HTMLInputElement>('input[role=switch]')!;
  try {
    await act(async()=>root.render(<PerformanceSettings/>));
    assert.equal(toggle().checked,true);assert.equal(diagnosticReads,0);
    assert.match(toggle().labels?.[0].textContent??'',/Hardware acceleration/,'the switch has a visible, clickable label');
    await act(async()=>toggle().click());
    assert.equal(settings.hardwareAcceleration,false);assert.equal(toggle().checked,false);
    assert.match(document.querySelector('[role=status]')?.textContent??'',/Restart required/);
    await act(async()=>toggle().click());
    assert.equal(document.querySelector('[role=status]'),null,'returning to the startup preference cancels the pending restart');
    fail=true;await act(async()=>toggle().click());
    assert.equal(toggle().checked,true,'save failures leave the saved preference visible');assert.match(document.querySelector('[role=alert]')?.textContent??'',/Disk full/);
    fail=false;await act(async()=>{settings={hardwareAcceleration:false,restartRequired:true};changed();});
    assert.equal(toggle().checked,false,'other windows share the same device preference');
    assert.equal(diagnosticReads,0,'preference changes do not request graphics diagnostics');
    await act(async()=>{document.querySelector('details')!.open=true;await new Promise(resolve=>setTimeout(resolve,0));});
    assert.equal(diagnosticReads,1);assert.match(document.querySelector('dl')?.textContent??'',/Hardware acceleration in this sessionOn/,'runtime status is separate from the pending preference');
    await act(async()=>document.querySelector<HTMLButtonElement>('details button')!.click());assert.equal(diagnosticReads,2);
  } finally {await act(async()=>root.unmount());dom.window.close();}
  assert.equal(unsubscribed,true);
});
