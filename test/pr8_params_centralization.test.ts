import assert from 'node:assert/strict';
import { CONFIG_HASH, PREVIOUS_V3_CONFIG_HASH, V3_CONFIG_SNAPSHOT } from '../src/engine/manifest';
import {
  V3_STRATEGY_PARAMS,
  MFCI_THRESHOLD,
  MIN_ENGINE_CANDLES,
  ANALYSIS_WINDOW,
  FRACTAL_N,
  EVENT_LOOKBACK,
  SWEEP_LOOKBACK,
  POOL_LOOKBACK,
  BREAKER_DELTA_SAMPLE,
  V3_PARAMS_CANONICAL_HASH,
} from '../src/engine/params';

assert.equal(MFCI_THRESHOLD, 0.85);
assert.equal(MIN_ENGINE_CANDLES, 30);
assert.equal(ANALYSIS_WINDOW, 120);
assert.equal(FRACTAL_N, 2);
assert.equal(EVENT_LOOKBACK, 20);
assert.equal(SWEEP_LOOKBACK, 10);
assert.equal(POOL_LOOKBACK, 20);
assert.equal(BREAKER_DELTA_SAMPLE, 50);
assert.equal(V3_STRATEGY_PARAMS.volatility.atrPeriod, 14);
assert.equal(V3_STRATEGY_PARAMS.imbalance.minFvgGapAtr, 0.2);
assert.deepEqual(V3_CONFIG_SNAPSHOT.parameters, V3_STRATEGY_PARAMS);
assert.equal(V3_CONFIG_SNAPSHOT.params_canonical_hash, V3_PARAMS_CANONICAL_HASH);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.mfci.threshold, 0.85);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.minimumCandles, MIN_ENGINE_CANDLES);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.analysisWindow, ANALYSIS_WINDOW);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.fractalN, FRACTAL_N);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.eventLookback, EVENT_LOOKBACK);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.sweepLookback, SWEEP_LOOKBACK);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.poolLookback, POOL_LOOKBACK);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.engine.breakerDeltaSample, BREAKER_DELTA_SAMPLE);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.wick.maxRatio, V3_STRATEGY_PARAMS.wick.maxRatio);
assert.equal(V3_CONFIG_SNAPSHOT.parameters.gate4.fibEquilibriumLevel, V3_STRATEGY_PARAMS.gate4.fibEquilibriumLevel);
assert.match(CONFIG_HASH, /^[a-f0-9]{64}$/);
assert.match(PREVIOUS_V3_CONFIG_HASH, /^[a-f0-9]{64}$/);
assert.notEqual(CONFIG_HASH, PREVIOUS_V3_CONFIG_HASH, 'canonical snapshot schema change must receive a new config identity');
console.log('=== PR-8 PARAMS RED/GREEN: canonical generated snapshot and frozen parameter contract passed ===');
