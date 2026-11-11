import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../src/utils/canonicalJson';
import { sha256 } from '../src/utils/sha256';
import { V3_CONFIG_SNAPSHOT, CONFIG_HASH, ENGINE_FINGERPRINT, ENGINE_SNAPSHOT } from '../src/engine/manifest';
import { V3_STRATEGY_PARAMS, V3_PARAMS_CANONICAL_HASH } from '../src/engine/params';
import { readLegacyOptional } from '../src/engine/legacyTelemetry';

const root = process.cwd();
const pipeline = fs.readFileSync(path.join(root, 'src/engine/pipeline.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src/engine/types.ts'), 'utf8');
const tracker = fs.readFileSync(path.join(root, 'src/engine/experimentTracker.ts'), 'utf8');

assert.deepEqual(V3_CONFIG_SNAPSHOT.parameters, V3_STRATEGY_PARAMS, 'the generated config snapshot must consume the complete canonical parameter object');
assert.equal(V3_CONFIG_SNAPSHOT.params_canonical_hash, V3_PARAMS_CANONICAL_HASH);
assert.equal(CONFIG_HASH, sha256(canonicalJson(V3_CONFIG_SNAPSHOT)), 'config identity must hash the generated canonical snapshot');
assert.equal(ENGINE_SNAPSHOT.config_hash, CONFIG_HASH);
assert.equal(ENGINE_SNAPSHOT.engine_fingerprint, ENGINE_FINGERPRINT);
assert.equal(ENGINE_SNAPSHOT.config, V3_CONFIG_SNAPSHOT);
assert.equal(ENGINE_FINGERPRINT, sha256(canonicalJson({
  strategy_version: V3_CONFIG_SNAPSHOT.strategy_version,
  config_hash: CONFIG_HASH,
  config_hash_epoch: V3_CONFIG_SNAPSHOT.hash_epoch,
  params_canonical_hash: V3_CONFIG_SNAPSHOT.params_canonical_hash,
  session_config_hash: V3_CONFIG_SNAPSHOT.session_config_hash,
  market_calendar_hash: V3_CONFIG_SNAPSHOT.market_calendar_hash,
})));

assert.doesNotMatch(pipeline, /validation_metrics\s*:/, 'new pipeline output must not write the legacy validation projection');
assert.doesNotMatch(pipeline, /pressure_observation\s*:/, 'new pipeline output must not write the legacy pressure projection');
assert.match(tracker, /delete telemetry\.validation_metrics/);
assert.match(tracker, /delete telemetry\.pressure_observation/);
assert.match(tracker, /readLegacyOptional\(record, 'validation_metrics'\)/, 'old hash-chain payloads must be verified through the backward-read helper');
assert.match(types, /validation_metrics\?:/, 'historical validation metrics must remain optional for backward reads');
assert.match(types, /pressure_observation\?:/, 'historical pressure observations must remain optional for backward reads');
const historical = { validation_metrics: { wick_check: { status: 'PASS' } }, pressure_observation: { classification: 'UNAVAILABLE' } };
assert.equal(readLegacyOptional(historical, 'validation_metrics'), historical.validation_metrics);
assert.equal(readLegacyOptional(historical, 'pressure_observation'), historical.pressure_observation);
console.log('=== PR-8 GENERATED SNAPSHOT / BACKWARD READ: canonical config hash, engine-fingerprinted snapshot, and legacy read-only fields passed ===');
