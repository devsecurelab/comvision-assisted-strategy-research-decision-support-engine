/**
 * Canonical owner-approved V3 strategy parameters.
 *
 * Values in this module are intentionally identical to the PR-8 baseline.
 * Do not change a value, comparison operator, or formula here without a new
 * golden/parity review and an intentional canonical configuration update.
 */
export const V3_STRATEGY_PARAMS = {
  engine: {
    minimumCandles: 30,
    analysisWindow: 120,
    fractalN: 2,
    eventLookback: 20,
    sweepLookback: 10,
    poolLookback: 20,
    breakerDeltaSample: 50,
    gateCount: 9,
    stageCount: 19,
  },
  volatility: {
    atrPeriod: 14,
  },
  structure: {
    bosDisplacementStrong: 1.5,
    bosDisplacementNormal: 1.2,
    chochVolumeSpikeMultiplier: 1.5,
  },
  imbalance: {
    minFvgGapAtr: 0.2,
    fvgSearchLookback: 5,
    referenceLookback: 40,
    bprLookback: 30,
  },
  orderBlock: {
    pocRelativeBullishMax: 0.35,
    pocRelativeBearishMin: 0.65,
  },
  breaker: {
    deltaZMinimum: 2,
  },
  liquidity: {
    poolToleranceAtr: 0.10,
    poolMergeDistanceAtr: 0.05,
    poolScoreBase: 0.8,
    poolScorePerTouch: 0.05,
    poolScoreCap: 1,
  },
  gate4: {
    legacyWindow: 20,
    fibEquilibriumLevel: 0.50,
  },
  ote: {
    window: 20,
    start: 0.618,
    sweetSpot: 0.705,
    end: 0.786,
    sweetSpotTolerance: 0.05,
  },
  wick: {
    maxRatio: 0.50,
    scoreExcellent: 0.20,
    scoreStrong: 0.35,
  },
  momentum: {
    lookback: 10,
    flatStdDevAtr: 0.05,
    zScoreStrong: 2.5,
    zScoreNormal: 1.5,
  },
  news: {
    restrictionWindowMinutes: 30,
  },
  mfci: {
    threshold: 0.85,
    fullWeights: { structure: 0.35, orderFlow: 0.25, liquidity: 0.20 },
    priceOnlyWeights: { structure: 0.35, liquidity: 0.20 },
  },
} as const;

// Compatibility exports retain the existing engine/test-facing names.
export const MFCI_THRESHOLD = V3_STRATEGY_PARAMS.mfci.threshold;
export const MIN_ENGINE_CANDLES = V3_STRATEGY_PARAMS.engine.minimumCandles;
export const ANALYSIS_WINDOW = V3_STRATEGY_PARAMS.engine.analysisWindow;
export const FRACTAL_N = V3_STRATEGY_PARAMS.engine.fractalN;
export const EVENT_LOOKBACK = V3_STRATEGY_PARAMS.engine.eventLookback;
export const SWEEP_LOOKBACK = V3_STRATEGY_PARAMS.engine.sweepLookback;
export const POOL_LOOKBACK = V3_STRATEGY_PARAMS.engine.poolLookback;
export const BREAKER_DELTA_SAMPLE = V3_STRATEGY_PARAMS.engine.breakerDeltaSample;
export const ATR_PERIOD = V3_STRATEGY_PARAMS.volatility.atrPeriod;
export const CHOCH_VOLUME_SPIKE_MULTIPLIER = V3_STRATEGY_PARAMS.structure.chochVolumeSpikeMultiplier;
export const MIN_FVG_GAP_ATR = V3_STRATEGY_PARAMS.imbalance.minFvgGapAtr;
export const FVG_SEARCH_LOOKBACK = V3_STRATEGY_PARAMS.imbalance.fvgSearchLookback;
export const REFERENCE_LOOKBACK = V3_STRATEGY_PARAMS.imbalance.referenceLookback;
export const BPR_LOOKBACK = V3_STRATEGY_PARAMS.imbalance.bprLookback;
export const BREAKER_DELTA_Z_MINIMUM = V3_STRATEGY_PARAMS.breaker.deltaZMinimum;
export const POOL_TOLERANCE_ATR = V3_STRATEGY_PARAMS.liquidity.poolToleranceAtr;
export const POOL_MERGE_DISTANCE_ATR = V3_STRATEGY_PARAMS.liquidity.poolMergeDistanceAtr;
export const OTE_WINDOW = V3_STRATEGY_PARAMS.ote.window;
export const NEWS_RESTRICTION_WINDOW_MINUTES = V3_STRATEGY_PARAMS.news.restrictionWindowMinutes;
