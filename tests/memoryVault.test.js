import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptMemoryVault, decryptMemoryVault } from '../server/httpApp.js';

test('memory vault encryption round trips', () => {
  const vault = { artifacts: [{ id: 'a1', text: 'private note' }] };
  const encrypted = encryptMemoryVault(vault, 'correct horse battery staple');
  assert.equal(encrypted.cipher, 'AES-256-GCM');
  assert.notEqual(encrypted.ciphertext.includes('private note'), true);
  assert.deepEqual(decryptMemoryVault(encrypted, 'correct horse battery staple'), vault);
});

test('memory vault rejects incorrect password', () => {
  const encrypted = encryptMemoryVault({ secret: true }, 'right password');
  assert.throws(() => decryptMemoryVault(encrypted, 'wrong password'));
});
