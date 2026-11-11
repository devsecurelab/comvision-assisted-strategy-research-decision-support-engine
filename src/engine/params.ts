import { canonicalJson } from '../utils/canonicalJson';
import { sha256 } from '../utils/sha256';

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
  scores: {
    structure: { pass: 0.95, partial: 0.5, fail: 0.15 },
    bos: { strong: 1, normal: 0.95, weak: 0.85, fail: 0.2 },
    imbalance: { fvgPartial: 0.95, fvgUnmitigated: 0.85, fvgFail: 0.1, ifvgPass: 0.95, ifvgCandidate: 0.5, ifvgFail: 0.2, bprPass: 0.9, bprCandidate: 0.5, bprFail: 0.2 },
    orderBlock: { pass: 0.95, candidate: 0.5, fail: 0.3 },
    breaker: { pass: 0.92, candidate: 0.55, fail: 0.3 },
    liquidity: { sweepPass: 0.98, sweepCandidate: 0.45, sweepFail: 0.2, poolBase: 0.8, poolPerTouch: 0.05, poolCap: 1, poolFail: 0.35 },
    equilibrium: { gatePass: 0.95, gateFail: 0.2, oteSweet: 1, otePass: 0.85, oteFail: 0.3 },
    wick: { null: 0, excellent: 1, strong: 0.85, acceptable: 0.7, fail: 0.15 },
    momentum: { fail: 0.25, strong: 1, normal: 0.9, pass: 0.75 },
    session: { pass: 0.9, fail: 0.3, killZonePass: 0.95 },
  },
  formulas: {
    midpointDivisor: 2,
    mfciFullWeightTotal: 0.8,
    mfciPriceOnlyWeightTotal: 0.55,
    htfMinimumSwingCount: 2,
    htfCandleMinimumExtra: 3,
    equilibriumEpsilonMultiplier: 32,
  },
} as const;

/** Stable, sorted JSON representation of the owner-approved numeric parameters. */
export const V3_PARAMS_CANONICAL_JSON = canonicalJson(V3_STRATEGY_PARAMS);
export const V3_PARAMS_CANONICAL_HASH = sha256(V3_PARAMS_CANONICAL_JSON);

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
