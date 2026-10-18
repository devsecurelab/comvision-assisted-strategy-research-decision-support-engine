import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/utils/canonicalJson';
import { sha256 } from '../src/utils/sha256';
import { CONFIG_HASH, CONFIG_HASH_EPOCH, LEGACY_CONFIG_HASH, V3_CONFIG_SNAPSHOT } from '../src/engine/manifest';

assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
assert.equal(canonicalJson({ z: { b: 2, a: 1 }, a: ['é', true, null] }), '{"a":["é",true,null],"z":{"a":1,"b":2}}');
assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');

for (const input of ['', 'abc', 'বাংলা|€']) {
  assert.equal(sha256(input), createHash('sha256').update(input, 'utf8').digest('hex'), `SHA-256 vector mismatch for ${input}`);
}

assert.equal(V3_CONFIG_SNAPSHOT.hash_epoch, CONFIG_HASH_EPOCH);
assert.equal(CONFIG_HASH, sha256(canonicalJson(V3_CONFIG_SNAPSHOT)));
assert.match(CONFIG_HASH_EPOCH, /^V3_CANONICAL_/);
assert.match(LEGACY_CONFIG_HASH, /^[0-9a-f]{64}$/);
assert.notEqual(CONFIG_HASH, LEGACY_CONFIG_HASH, 'active canonical epoch must not silently reuse the legacy hash');

console.log('=== P1 HASH EPOCH: canonical JSON, standard SHA-256, active epoch and legacy hash retention passed ===');
