import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V3_STRATEGY_PARAMS } from '../src/engine/params';

const { scores, formulas } = V3_STRATEGY_PARAMS;

assert.deepEqual(scores.structure, { pass: 0.95, partial: 0.5, fail: 0.15 });
assert.deepEqual(scores.bos, { strong: 1, normal: 0.95, weak: 0.85, fail: 0.2 });
assert.deepEqual(scores.imbalance, { fvgPartial: 0.95, fvgUnmitigated: 0.85, fvgFail: 0.1, ifvgPass: 0.95, ifvgCandidate: 0.5, ifvgFail: 0.2, bprPass: 0.9, bprCandidate: 0.5, bprFail: 0.2 });
assert.deepEqual(scores.orderBlock, { pass: 0.95, candidate: 0.5, fail: 0.3 });
assert.deepEqual(scores.breaker, { pass: 0.92, candidate: 0.55, fail: 0.3 });
assert.deepEqual(scores.liquidity, { sweepPass: 0.98, sweepCandidate: 0.45, sweepFail: 0.2, poolBase: 0.8, poolPerTouch: 0.05, poolCap: 1, poolFail: 0.35 });
assert.deepEqual(scores.equilibrium, { gatePass: 0.95, gateFail: 0.2, oteSweet: 1, otePass: 0.85, oteFail: 0.3 });
assert.deepEqual(scores.wick, { null: 0, excellent: 1, strong: 0.85, acceptable: 0.7, fail: 0.15 });
assert.deepEqual(scores.momentum, { fail: 0.25, strong: 1, normal: 0.9, pass: 0.75 });
assert.deepEqual(scores.session, { pass: 0.9, fail: 0.3, killZonePass: 0.95 });

assert.deepEqual(formulas, {
  midpointDivisor: 2,
  mfciFullWeightTotal: 0.8,
  mfciPriceOnlyWeightTotal: 0.55,
  htfMinimumSwingCount: 2,
  htfCandleMinimumExtra: 3,
  equilibriumEpsilonMultiplier: 32,
});

const engine = fs.readFileSync(path.join(process.cwd(), 'src/engine/strategyV3Engine.ts'), 'utf8');
assert.doesNotMatch(engine, /s1Pass \? \.95 : \.4/);
assert.doesNotMatch(engine, /s10\.primary\.touches \* \.05/);
assert.doesNotMatch(engine, /\.35 \* sStructure|\.25 \* sOrderFlow|\.20 \* sLiquidity/);

console.log('=== PR-8 SCORE/FORMULA RED/GREEN: remaining score bands and formula literals centralized ===');
