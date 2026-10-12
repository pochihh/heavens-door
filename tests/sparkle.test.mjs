import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {validateSigningKey} from '../scripts/sparkle-appcast.mjs';
test('Sparkle release signing requires the private key paired with the embedded public key',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const secret=privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64');
  const publicValue=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  validateSigningKey(secret,publicValue);assert.throws(()=>validateSigningKey(secret,Buffer.alloc(32).toString('base64')),/does not match/);assert.throws(()=>validateSigningKey('not a key',publicValue),/private seed/);
});
