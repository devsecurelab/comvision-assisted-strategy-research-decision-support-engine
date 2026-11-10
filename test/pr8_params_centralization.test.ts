import assert from 'node:assert/strict';
import { CONFIG_HASH, V3_CONFIG_SNAPSHOT } from '../src/engine/manifest';
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
assert.deepEqual(V3_CONFIG_SNAPSHOT.mfci, {
  threshold: V3_STRATEGY_PARAMS.mfci.threshold,
  full_weights: {
    structure: V3_STRATEGY_PARAMS.mfci.fullWeights.structure,
    order_flow: V3_STRATEGY_PARAMS.mfci.fullWeights.orderFlow,
    liquidity: V3_STRATEGY_PARAMS.mfci.fullWeights.liquidity,
  },
  price_only_weights: V3_STRATEGY_PARAMS.mfci.priceOnlyWeights,
});
assert.equal(V3_CONFIG_SNAPSHOT.minimum_candles, V3_STRATEGY_PARAMS.engine.minimumCandles);
assert.equal(V3_CONFIG_SNAPSHOT.analysis_window, V3_STRATEGY_PARAMS.engine.analysisWindow);
assert.equal(V3_CONFIG_SNAPSHOT.fractal_n, V3_STRATEGY_PARAMS.engine.fractalN);
assert.equal(V3_CONFIG_SNAPSHOT.event_lookback, V3_STRATEGY_PARAMS.engine.eventLookback);
assert.equal(V3_CONFIG_SNAPSHOT.sweep_lookback, V3_STRATEGY_PARAMS.engine.sweepLookback);
assert.equal(V3_CONFIG_SNAPSHOT.pool_lookback, V3_STRATEGY_PARAMS.engine.poolLookback);
assert.equal(V3_CONFIG_SNAPSHOT.breaker_delta_sample, V3_STRATEGY_PARAMS.engine.breakerDeltaSample);
assert.equal(V3_CONFIG_SNAPSHOT.wick_ratio_max, V3_STRATEGY_PARAMS.wick.maxRatio);
assert.equal(V3_CONFIG_SNAPSHOT.fib_equilibrium_level, V3_STRATEGY_PARAMS.gate4.fibEquilibriumLevel);
assert.equal(CONFIG_HASH, '0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003');

console.log('=== PR-8 PARAMS RED/GREEN: centralized frozen parameter contract and identity preservation passed ===');
