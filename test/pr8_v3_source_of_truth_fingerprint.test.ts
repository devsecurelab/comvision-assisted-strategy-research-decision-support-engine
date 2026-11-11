import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/utils/canonicalJson';
import { sha256 } from '../src/utils/sha256';
import { CONFIG_HASH, ENGINE_FINGERPRINT, V3_CONFIG_SNAPSHOT } from '../src/engine/manifest';
import { V3_STRATEGY_PARAMS, V3_PARAMS_CANONICAL_HASH } from '../src/engine/params';

const root = process.cwd();
const pipeline = fs.readFileSync(path.join(root, 'src/engine/pipeline.ts'), 'utf8');
const fingerprintScript = path.join(root, 'scripts/engine-fingerprint.ts');

for (const legacyExport of ['detectFractalSwings', 'evaluateMarketStructure', 'evaluateBOS', 'evaluateCHoCH', 'detectFVG', 'evaluateIFVG', 'detectBPR', 'detectOrderBlock', 'evaluateBreakerBlock', 'evaluateLiquiditySweep', 'detectLiquidityPools', 'evaluateDiscountPremium', 'evaluateOTE', 'evaluateWickPushback', 'evaluateMomentum', 'evaluateTickProxy']) {
  assert.doesNotMatch(pipeline, new RegExp(`export function ${legacyExport}\\b`), `${legacyExport} must not remain a pipeline calculation export`);
}
assert.match(pipeline, /evaluateStrategyV3\(/, 'pipeline must delegate decision calculation to V3');
assert.match(pipeline, /decision_engine_v3:\s*v3Telemetry/, 'pipeline must persist the V3-native decision');
assert.doesNotMatch(pipeline, /const legacyDecision|legacyDecision\.|evaluateMarketStructure\(/, 'pipeline must not calculate a second legacy decision');

assert.equal(fs.existsSync(fingerprintScript), true, 'engine fingerprint script must exist');
assert.match(fs.readFileSync(fingerprintScript, 'utf8'), /V3_STRATEGY_PARAMS/);
assert.match(fs.readFileSync(fingerprintScript, 'utf8'), /canonicalJson/);
assert.match(fs.readFileSync(fingerprintScript, 'utf8'), /ENGINE_FINGERPRINT/);

assert.equal(CONFIG_HASH, sha256(canonicalJson(V3_CONFIG_SNAPSHOT)));
const expectedFingerprint = sha256(canonicalJson({
  strategy_version: V3_CONFIG_SNAPSHOT.strategy_version,
  config_hash: CONFIG_HASH,
  config_hash_epoch: V3_CONFIG_SNAPSHOT.hash_epoch,
  params_canonical_hash: V3_PARAMS_CANONICAL_HASH,
  session_config_hash: V3_CONFIG_SNAPSHOT.session_config_hash,
  market_calendar_hash: V3_CONFIG_SNAPSHOT.market_calendar_hash,
}));
assert.equal(ENGINE_FINGERPRINT, expectedFingerprint);
assert.ok(V3_STRATEGY_PARAMS.engine.gateCount === 9 && V3_STRATEGY_PARAMS.engine.stageCount === 19);
assert.match(createHash('sha256').update(canonicalJson(V3_STRATEGY_PARAMS), 'utf8').digest('hex'), /^[a-f0-9]{64}$/);

console.log('=== PR-8 V3 SOURCE-OF-TRUTH RED/GREEN: legacy pipeline calculations removed; params canonical hash and engine fingerprint contract passed ===');
