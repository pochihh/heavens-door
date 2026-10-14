import {test} from 'node:test';
import assert from 'node:assert/strict';
import {binding,matchesBinding,recordBinding,validateKeybindings} from '../src/keybindings';
import {validateActionHub,DEFAULT_HUB} from '../src/action-hub';
test('shortcuts match exact modifiers, respect platform, rebind and reject conflicting or unsafe app bindings',()=>{
  const key={key:'k',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false};
  assert.equal(matchesBinding(key,'search'),true);assert.equal(matchesBinding({...key,shiftKey:true},'search'),false);
  assert.equal(matchesBinding({...key,metaKey:false,ctrlKey:true},'search',undefined,'win32'),true);
  assert.equal(matchesBinding(key,'search',{search:'Mod-p'}),false);assert.equal(binding('search',{search:''}),'');
  assert.equal(recordBinding(key),'Mod-k');assert.equal(recordBinding({...key,key:'Shift'}),null);
  assert.equal(matchesBinding({key:'Home',metaKey:false,ctrlKey:false,altKey:false,shiftKey:true},'lineStart',undefined,'darwin',true),true);
  validateKeybindings({search:'Mod-p'});assert.throws(()=>validateKeybindings({search:'Mod-s'}),/already used/);assert.throws(()=>validateKeybindings({search:'p'}),/need Command/);assert.throws(()=>validateKeybindings({missing:'Mod-k'}),/Invalid/);
});
test('action hub persists bounded unique known commands and optional editable labels and icons',()=>{
  validateActionHub(DEFAULT_HUB);validateActionHub([{command:'save',label:'Save now',icon:'icon:sync'}]);
  assert.throws(()=>validateActionHub([{command:'save'},{command:'save'}]),/Invalid/);assert.throws(()=>validateActionHub([{command:'eval'}]),/Invalid/);assert.throws(()=>validateActionHub([{command:'save',label:''}]),/Invalid/);
});
