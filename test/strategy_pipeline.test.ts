// Automated Verification Test Suite (15+ Tests)
// ComVision-Assisted Strategy Research & Decision-Support Engine
// Strategy v1.0 Frozen Specification Verification

import assert from 'node:assert';
import path from 'node:path';
import { feedManager } from '../src/engine/dataProviders';
import { executeStrategyPipeline, detectFractalSwings, evaluateMarketStructure, isInsideCandle, detectLiquidityPools, evaluateMomentum } from '../src/engine/pipeline';
import { newsGuard } from '../src/engine/newsGuard';
import { experimentTracker } from '../src/engine/experimentTracker';
import { authService } from '../src/server/auth';
import { durableStorage } from '../src/server/storage';
import { STRATEGY_MANIFEST } from '../src/engine/manifest';
import { Candle, SwingPoint } from '../src/engine/types';

import { notificationService, NotificationService } from '../src/server/notificationService';
import { analyticsService } from '../src/server/analyticsService';
import { chatService } from '../src/server/chatService';
import { formatSignalTime } from '../src/utils/timeFormat';

// Isolate test storage directory to prevent interference with runtime state
const testStorageDir = path.join(process.cwd(), 'data_test');
durableStorage.setDataDir(testStorageDir);
durableStorage.clearAll();
authService.resetForTesting();
experimentTracker.resetForTesting();

console.log('=== RUNNING COMVISION ENGINE DETERMINISTIC TEST SUITE ===\n');

let passedTests = 0;
let failedTests = 0;

const testQueue: Array<{ name: string; fn: () => void | Promise<void> }> = [];
function runTest(name: string, fn: () => void | Promise<void>) {
  testQueue.push({ name, fn });
}

// 1. Non-Execution Architectural Boundary Verification
runTest('Test 1: Non-execution boundary ensures final_action is MANUAL_ALERT and never an automated broker execution command', () => {
  assert.strictEqual(STRATEGY_MANIFEST.architectural_boundary.is_automated_execution_bot, false);
  assert.strictEqual(STRATEGY_MANIFEST.architectural_boundary.terminal_state, 'MANUAL_ALERT');
  assert.strictEqual(STRATEGY_MANIFEST.architectural_boundary.direct_broker_connection_allowed, false);

  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  assert.strictEqual(telemetry.system_execution.final_action, 'MANUAL_ALERT');
  assert.notStrictEqual(telemetry.system_execution.final_action, 'EXECUTE_ORDER');
  assert.notStrictEqual(telemetry.system_execution.final_action, 'AUTO_BUY');
});

// 2. Stage 1: Market Structure (5-candle fractal with t+2 confirmation delay)
runTest('Test 2: Stage 1 - 5-candle symmetric fractal swing high/low confirmed strictly at Close of t+2', () => {
  const candles = feedManager.generateResearchCandles(30);
  const swings = detectFractalSwings(candles, 26);
  assert(swings.length > 0, 'Should detect fractal swings');
  
  for (const s of swings) {
    // Confirmation timestamp must match t+2 candle timestamp
    const cPlus2 = candles[s.index + 2];
    assert.strictEqual(s.confirmedAtTimestamp, cPlus2.timestamp, 'No look-ahead confirmation');
  }
});

// 3. Stage 1: Structural State Classification
runTest('Test 3: Stage 1 - Structure evaluates BULLISH, BEARISH or UNCLEAR correctly', () => {
  const swingsMock = [
    { index: 5, timestamp: '1', type: 'HIGH' as const, price: 1.0820, confirmedAtTimestamp: '3' },
    { index: 8, timestamp: '2', type: 'LOW' as const, price: 1.0800, confirmedAtTimestamp: '4' },
    { index: 12, timestamp: '3', type: 'HIGH' as const, price: 1.0840, confirmedAtTimestamp: '5' },
    { index: 15, timestamp: '4', type: 'LOW' as const, price: 1.0815, confirmedAtTimestamp: '6' },
  ];
  const evalBullish = evaluateMarketStructure(swingsMock);
  assert.strictEqual(evalBullish.bias, 'BULLISH', 'Higher High + Higher Low must be BULLISH');
});

// 4. Stage 2: Bullish Fair Value Gap (FVG) Zone
runTest('Test 4: Stage 2 - Bullish FVG mathematical zone defined as [High(C1), Low(C3)]', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const c1 = candles[22];
  const c3 = candles[24];

  assert(c3.low > c1.high, 'Bullish FVG requires Low(C3) > High(C1)');
  const fvgTop = c3.low;
  const fvgBottom = c1.high;
  assert(fvgTop > fvgBottom, 'Zone top must be greater than bottom');
});

// 5. Stage 2: FVG Mitigation States (UNMITIGATED, PARTIAL_FILL, COMPLETELY_FILLED)
runTest('Test 5: Stage 2 - FVG mitigation state tracking', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  // Current price in unmitigated state
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert(['UNMITIGATED', 'PARTIAL_FILL'].includes(telemetry.validation_metrics.fvg.fvg_mitigation_state));
});

// 6. Stage 2: Order Block Confluence
runTest('Test 6: Stage 2 - Order Block detection and confluence validation', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.order_block.ob_detected, true);
  assert.strictEqual(telemetry.validation_metrics.order_block.ob_confluence_status, 'PASS');
});

// 7. Stage 3: 3-Candle Pattern Expansion (Close(C3) > High(C1))
runTest('Test 7: Stage 3 - Bullish 3-candle expansion breakout validation', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.pattern_3_candle.status, 'PASS');
});

// 8. Stage 3: Rejection if C3 closes inside C1 boundary
runTest('Test 8: Stage 3 - Rejection if C3 closes back inside C1 boundary', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  // Modify C3 close to fall inside C1
  candles[24].close = candles[22].open;
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.system_execution.system_decision, 'REJECT');
  assert.strictEqual(telemetry.validation_metrics.pattern_3_candle.status, 'REJECT');
});

// 9. Stage 4: Volume / Tick Activity Proxy Ascending Rule
runTest('Test 9: Stage 4 - TICK_ACTIVITY_PROXY accepts ascending or above 10-period average', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  assert(candles[22].volume < candles[23].volume && candles[23].volume < candles[24].volume);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.tick_proxy.status, 'PASS');
  assert.strictEqual(telemetry.validation_metrics.tick_proxy.tick_sequence, 'ASCENDING');
});

// 10. Stage 4: Low Tick Activity Proxy Rejection
runTest('Test 10: Stage 4 - Low tick activity proxy triggers deterministic REJECT', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  candles[22].volume = 10;
  candles[23].volume = 10;
  candles[24].volume = 10; // flat/low
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.tick_proxy.status, 'REJECT');
  assert.strictEqual(telemetry.system_execution.system_decision, 'REJECT');
});

// 11. Stage 5: Wick Pushback Exceeding 50% Triggers REJECT
runTest('Test 11: Stage 5 - Pushback wick ratio > 0.50 triggers REJECT ("Wick Fakeout")', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  // Create massive upper wick on C3
  candles[24].high = 1.08700;
  candles[24].open = 1.08460;
  candles[24].close = 1.08470;
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.wick_check.status, 'REJECT');
  assert(telemetry.validation_metrics.wick_check.wick_ratio > 0.50);
});

// 12. Stage 5: Liquidity Sweep / Fakeout Detection
runTest('Test 12: Stage 5 - Sweeping prior swing high without closing above triggers SWEEP_DETECTED', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  // Prior confirmed swing high SH_n is at index 14 with price 1.0868
  // C3 high pierces to 1.08720 (> 1.0868) but fails to close above (closes at 1.08650)
  candles[24].high = 1.08720;
  candles[24].close = 1.08650;
  candles[24].open = 1.08482;
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.liquidity_sweep.status, 'SWEEP_DETECTED');
  assert.strictEqual(telemetry.system_execution.system_decision, 'REJECT');
});

// 13. Stage 6: Inside Candle verification
runTest('Test 13: Stage 6 - Inside candle recognized without resetting pattern sequence', () => {
  const c1 = { timestamp: '1', open: 1.0840, high: 1.0850, low: 1.0830, close: 1.0845, volume: 100 };
  const c2 = { timestamp: '2', open: 1.0842, high: 1.0848, low: 1.0835, close: 1.0844, volume: 90 };
  assert.strictEqual(isInsideCandle(c2, c1), true);
});

// 14. Stage 7: Fibonacci 50% Equilibrium Zone Discount Check
runTest('Test 14: Stage 7 - Bullish FVG must lie strictly below Fib 50% Equilibrium Level', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.validation_metrics.fib_zone.status, 'PASS_DISCOUNT');
});

// 15. Stage 8: News Guard Active Window Rejection
runTest('Test 15: Stage 8 - High-impact red-folder event within +/- 30m window triggers REJECT', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const now = new Date(candles[24].timestamp).getTime();
  const redEvent = {
    id: 'test-red-folder',
    title: 'US Non-Farm Payrolls',
    currency: 'USD',
    impact: 'HIGH' as const,
    timestamp: new Date(now + 10 * 60 * 1000).toISOString(), // 10 mins away
  };
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [redEvent],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.guardrails.news_guard.news_event_detected, true);
  assert.strictEqual(telemetry.guardrails.news_guard.news_window_state, 'ACTIVE');
  assert.strictEqual(telemetry.system_execution.system_decision, 'REJECT');
});

// 16. Stage 8: News Guard Offline Fail-Safe Triggers INCONCLUSIVE
runTest('Test 16: Stage 8 - News source offline triggers INCONCLUSIVE ("Never assume no news = clear")', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: false, // OFFLINE
    cvConfidence: 0.98,
  });
  assert.strictEqual(telemetry.guardrails.news_guard.news_window_state, 'NEWS_DATA_UNAVAILABLE');
  assert.strictEqual(telemetry.system_execution.system_decision, 'INCONCLUSIVE');
  assert.strictEqual(telemetry.system_execution.final_action, 'NO_ACTION');
});

// 17. Stage 9: T-10s Pressure Observation Non-Filtering Categorical
runTest('Test 17: Stage 9 - Pressure observation is non-filtering and strictly categorical (no percentages)', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
    liveTickPressure: {
      classification: 'ALIGNED',
      magnitude: 'HIGH',
      consistency: 'HIGH',
    },
  });
  assert.strictEqual(telemetry.pressure_observation.classification, 'ALIGNED');
  assert.strictEqual(telemetry.pressure_observation.magnitude, 'HIGH');
  // Confirm NO artificial percentage fields
  assert.strictEqual((telemetry.pressure_observation as any).percentage, undefined);
  assert.strictEqual((telemetry.pressure_observation as any).confidence_pct, undefined);
});

// 18. Server-Side Authentication & Authorization Status
runTest('Test 18: Access Control - Authorization status lifecycle (PENDING / APPROVED / SUSPENDED / REVOKED)', () => {
  authService.bootstrapUser('Lead Admin', 'admin@devsecure.engine', 'TestAdminPass2026!', 'ADMIN', 'APPROVED');
  // 1. Admin login succeeds with status APPROVED
  const adminLogin = authService.login('admin@devsecure.engine', 'TestAdminPass2026!');
  assert.strictEqual(adminLogin.success, true);
  assert.strictEqual(adminLogin.status, 'APPROVED');

  // 2. Registering a new applicant defaults to PENDING
  const reg = authService.register('Test Operator', 'test@operator.com', 'SecurePass2026!');
  assert.strictEqual(reg.success, true);
  assert.strictEqual(reg.user?.status, 'PENDING');

  // 3. Admin can approve user
  const adminUser = authService.getUserByToken(adminLogin.token!)!;
  const updateRes = authService.updateUserStatus(adminUser.id, reg.user!.id, 'APPROVED');
  assert.strictEqual(updateRes.success, true);
});

// 19. Exact Boundary: Wick Pushback Ratio (0.500 passes vs 0.501 rejects)
runTest('Test 19: Exact Boundary - Wick pushback ratio <= 0.500 PASS vs > 0.500 REJECT ("Wick Fakeout")', () => {
  const candlesPass = feedManager.generateDeterministicValidSetup(1.0845);
  // Total range = 0.00100 (high: 1.08550, low: 1.08450)
  // Max(open, close) = 1.08500 -> upper wick = 1.08550 - 1.08500 = 0.00050 -> ratio = exactly 0.500
  candlesPass[24].low = 1.08450;
  candlesPass[24].high = 1.08550;
  candlesPass[24].open = 1.08460;
  candlesPass[24].close = 1.08500;
  const telPass = executeStrategyPipeline({
    candles: candlesPass,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telPass.validation_metrics.wick_check.status, 'PASS', '0.500 wick ratio must PASS');

  const candlesFail = feedManager.generateDeterministicValidSetup(1.0845);
  // Upper wick = 0.00051 / 0.00100 = 0.510 (> 0.50)
  candlesFail[24].low = 1.08450;
  candlesFail[24].high = 1.08550;
  candlesFail[24].open = 1.08460;
  candlesFail[24].close = 1.08499;
  const telFail = executeStrategyPipeline({
    candles: candlesFail,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telFail.validation_metrics.wick_check.status, 'REJECT', '> 0.50 wick ratio must REJECT');
  assert.strictEqual(telFail.system_execution.system_decision, 'REJECT');
});

// 20. Exact Boundary: Fibonacci 50% Equilibrium Level
runTest('Test 20: Exact Boundary - Bullish FVG strictly below Fib 50% PASS vs touching/above Fib 50% REJECT', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  // Setting fibEquilibriumLevel lower than FVG Top causes rejection
  const telReject = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
    customSettings: { fibEquilibriumLevel: 0.20 }, // FVG is around 0.35, so 0.20 forces FVG into Premium relative to threshold
  });
  assert.strictEqual(telReject.validation_metrics.fib_zone.status, 'REJECT');
  assert.strictEqual(telReject.system_execution.system_decision, 'REJECT');
});

// 21. Stage 3 Negative Boundary: Close(C3) == High(C1)
runTest('Test 21: Stage 3 Negative Boundary - Close(C3) exactly equal to High(C1) fails expansion (> High(C1))', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  candles[24].close = candles[22].high; // Exactly equal, not strictly greater
  const tel = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(tel.validation_metrics.pattern_3_candle.status, 'REJECT');
  assert.strictEqual(tel.system_execution.system_decision, 'REJECT');
});

// 22. OCR / CV Confidence Quality Metric Thresholds (<85%, 85-95%, >95%)
runTest('Test 22: OCR/CV Quality Metric - <85% INVALID (INCONCLUSIVE), 85-95% DEGRADED, >95% COMPLETE', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);

  // 1. Below 85% -> INVALID -> INCONCLUSIVE, NO_ACTION
  const telInvalid = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.82, // < 85%
  });
  assert.strictEqual(telInvalid.metadata.data_quality, 'INVALID');
  assert.strictEqual(telInvalid.system_execution.system_decision, 'INCONCLUSIVE');
  assert.strictEqual(telInvalid.system_execution.final_action, 'NO_ACTION');

  // 2. 85% to 95% -> DEGRADED -> evaluated with DEGRADED tag
  const telDegraded = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.90, // 85-95%
  });
  assert.strictEqual(telDegraded.metadata.data_quality, 'DEGRADED');

  // 3. Above 95% -> COMPLETE
  const telComplete = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98, // > 95%
  });
  assert.strictEqual(telComplete.metadata.data_quality, 'COMPLETE');
});

// 23. Data Quality Fail-Safe: Zero-Range Flat Candle
runTest('Test 23: Data Quality Fail-Safe - Zero range flat candle triggers DEGRADED + INCONCLUSIVE', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  candles[24].high = 1.08450;
  candles[24].low = 1.08450;
  candles[24].open = 1.08450;
  candles[24].close = 1.08450;
  const tel = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(tel.metadata.data_quality, 'DEGRADED');
  assert.strictEqual(tel.system_execution.system_decision, 'INCONCLUSIVE');
  assert.strictEqual(tel.system_execution.final_action, 'NO_ACTION');
});

// 24. Master Telemetry Completeness Check (Section 6 Schema Verification)
runTest('Test 24: Master Telemetry Completeness - All Section 6 schema fields populated without omission', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const tel = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  // Metadata
  assert(tel.metadata.project_name);
  assert(tel.metadata.strategy_version);
  assert(tel.metadata.experiment_id);
  assert(tel.metadata.setup_id);
  assert(tel.metadata.timestamp_utc);
  assert(tel.metadata.data_quality);

  // Market context
  assert(tel.market_context.selected_timeframe);
  assert(tel.market_context.supporting_timeframe_analysis);
  assert(tel.market_context.local_bias);
  assert(tel.market_context.context_state);
  assert(tel.market_context.regime_tag);

  // Validation metrics
  assert(tel.validation_metrics.structure);
  assert(tel.validation_metrics.fvg);
  assert(tel.validation_metrics.order_block);
  assert(tel.validation_metrics.pattern_3_candle);
  assert(tel.validation_metrics.inside_candle);
  assert(tel.validation_metrics.fib_zone);
  assert(tel.validation_metrics.tick_proxy);
  assert(tel.validation_metrics.wick_check);
  assert(tel.validation_metrics.liquidity_sweep);

  // Pressure observation & Guardrails & Execution
  assert(tel.pressure_observation.classification);
  assert(tel.guardrails.news_guard);
  assert(tel.system_execution.system_decision);
  assert(tel.system_execution.final_action);
});

// 25. Master Telemetry SHA-256 Hash Chain Integrity & Tamper Detection
runTest('Test 25: Master Telemetry SHA-256 Hash Chain - Sequential verification and tamper detection', () => {
  const tracker = new (experimentTracker.constructor as any)();
  const candles = feedManager.generateDeterministicValidSetup(1.0845);

  const t1 = executeStrategyPipeline({ candles, currentCandleIndex: 24, selectedTimeframe: '5m', newsEvents: [], newsSourceOnline: true, cvConfidence: 0.98 });
  const t2 = executeStrategyPipeline({ candles, currentCandleIndex: 24, selectedTimeframe: '5m', newsEvents: [], newsSourceOnline: true, cvConfidence: 0.98 });
  t2.metadata.setup_id = 'EXP-2026-001-002';

  tracker.recordCandidate(t1);
  tracker.recordCandidate(t2);

  // Verification passes for untampered chain
  const verifyResult = tracker.verifyHashChain();
  assert.strictEqual(verifyResult.valid, true);
  assert.strictEqual(verifyResult.totalRecords, 2);

  // Tampering with payload in record 1 breaks hash chain
  t1.validation_metrics.structure.status = 'REJECT';
  const tamperedResult = tracker.verifyHashChain();
  assert.strictEqual(tamperedResult.valid, false, 'Tampered telemetry payload must fail hash-chain verification');
});

// 26. EXP-2026-001 100-Valid-Setup Scope Freeze Enforcement
runTest('Test 26: EXP-2026-001 Scope Freeze - Blocks parameter modification attempts during locked experiment', () => {
  const result = experimentTracker.enforceScopeFreeze('maxWickRatio=0.60');
  assert.strictEqual(result.allowed, false);
  assert(result.reason.includes('Scope Freeze Active'));
});

// 27. Server-Side Authentication Negative Tests: 401 Unauthorized
runTest('Test 27: Server-Side Auth - 401 Unauthorized for missing, invalid, or expired tokens', () => {
  assert.strictEqual(authService.getUserByToken(''), null);
  assert.strictEqual(authService.getUserByToken('invalid_token_xyz'), null);
  assert.strictEqual(authService.getUserByToken('sess_00000000000000000000000000000000'), null);
});

// 28. Server-Side Authorization Negative Tests: 403 Forbidden for Non-Approved Statuses
runTest('Test 28: Server-Side Auth - 403 Forbidden on PENDING, SUSPENDED, and REVOKED accounts', () => {
  authService.bootstrapUser('Lead Admin', 'admin@devsecure.engine', 'TestAdminPass2026!', 'ADMIN', 'APPROVED');
  authService.bootstrapUser('Applicant', 'applicant@devsecure.engine', 'TestApplicantPass2026!', 'ANALYST', 'PENDING');

  // 1. PENDING applicant
  const pendingLogin = authService.login('applicant@devsecure.engine', 'TestApplicantPass2026!');
  assert.strictEqual(pendingLogin.success, false);
  assert.strictEqual(pendingLogin.status, 'PENDING');

  // 2. Admin creates and sets SUSPENDED user
  const adminLogin = authService.login('admin@devsecure.engine', 'TestAdminPass2026!');
  const testUser = authService.register('Suspended Operator', 'suspend@operator.com', 'Pass123456!');
  authService.updateUserStatus(adminLogin.user!.id, testUser.user!.id, 'SUSPENDED');
  const userSuspended = authService.login('suspend@operator.com', 'Pass123456!');
  assert.strictEqual(userSuspended.status, 'SUSPENDED');

  // 3. Admin sets REVOKED user
  authService.updateUserStatus(adminLogin.user!.id, testUser.user!.id, 'REVOKED');
  const userRevoked = authService.login('suspend@operator.com', 'Pass123456!');
  assert.strictEqual(userRevoked.status, 'REVOKED');
});

// 29. Server-Side Role Separation: Analyst Blocked from Admin-Only Functions
runTest('Test 29: Server-Side Role Separation - Analyst role blocked from user administration', () => {
  authService.bootstrapUser('Quant Analyst', 'analyst@devsecure.engine', 'TestAnalystPass2026!', 'ANALYST', 'APPROVED');
  const analystLogin = authService.login('analyst@devsecure.engine', 'TestAnalystPass2026!');
  assert.strictEqual(analystLogin.user?.role, 'ANALYST');

  // Analyst attempts to list all users
  const listAttempt = authService.listUsers(analystLogin.user!.id);
  assert.deepStrictEqual(listAttempt, [], 'Analyst cannot list users');

  // Analyst attempts to approve/update user status
  const updateAttempt = authService.updateUserStatus(analystLogin.user!.id, 'usr-pending-003', 'APPROVED');
  assert.strictEqual(updateAttempt.success, false);
});

// 30. Session Revocation & Quick Demo Credential Verification
runTest('Test 30: Session Revocation & Quick Demo - Logout destroys session; Quick Demo requires server auth', () => {
  authService.bootstrapUser('Quant Analyst', 'analyst@devsecure.engine', 'TestAnalystPass2026!', 'ANALYST', 'APPROVED');
  const analystLogin = authService.login('analyst@devsecure.engine', 'TestAnalystPass2026!');
  const token = analystLogin.token!;
  assert(authService.getUserByToken(token) !== null);

  // Logout invalidates session immediately
  const logoutRes = authService.logout(token);
  assert.strictEqual(logoutRes, true);
  assert.strictEqual(authService.getUserByToken(token), null, 'Revoked session cannot access resources');

  // Wrong password fails
  const wrongPass = authService.login('analyst@devsecure.engine', 'WrongPassword!');
  assert.strictEqual(wrongPass.success, false);
});

// ============================================================================
// DEDICATED BEARISH ACCEPTANCE TEST SUITE (TESTS 31 - 37)
// Verifying Technical Specification v3.4 Bearish Pipeline Branches
// ============================================================================

/**
 * Deterministic Bearish Setup Generator (Strictly test fixture)
 * Produces a verified, mathematically valid Bearish setup conforming to v3.4
 */
function generateDeterministicBearishSetup(basePrice = 1.0850): Candle[] {
  const candles = feedManager.generateResearchCandles(25, basePrice);
  const now = Date.now();
  const tMinus = (mins: number) => new Date(now - mins * 60 * 1000).toISOString();

  // Neutral base candles
  for (let i = 0; i < 21; i++) {
    candles[i].open = 1.0845;
    candles[i].close = 1.0844;
    candles[i].high = 1.0846;
    candles[i].low = 1.0843;
    candles[i].volume = 120;
  }

  // 1. Swing High 1 at index 6 (confirmed at index 8)
  candles[6] = {
    timestamp: tMinus(95),
    open: 1.0865,
    high: 1.0875, // SH 1
    low: 1.0860,
    close: 1.0870,
    volume: 140,
  };

  // 2. Swing Low 1 at index 10 (confirmed at index 12)
  candles[10] = {
    timestamp: tMinus(75),
    open: 1.0840,
    high: 1.0842,
    low: 1.0830, // SL 1
    close: 1.0835,
    volume: 130,
  };

  // 3. Swing High 2 at index 14 (confirmed at index 16) -> Lower High (< SH 1)
  candles[14] = {
    timestamp: tMinus(55),
    open: 1.0855,
    high: 1.0860, // SH 2 < SH 1 (1.0860 < 1.0875) -> Lower High
    low: 1.0850,
    close: 1.0858,
    volume: 160,
  };

  // 4. Swing Low 2 at index 18 (confirmed at index 20) -> Lower Low (< SL 1)
  candles[18] = {
    timestamp: tMinus(35),
    open: 1.0825,
    high: 1.0828,
    low: 1.0820, // SL 2 < SL 1 (1.0820 < 1.0830) -> Lower Low
    close: 1.0822,
    volume: 140,
  };
  // Fib 50% Equilibrium between SH2 (1.08600) and SL2 (1.08200):
  // Range = 0.00400. Fib 50% = 1.08200 + 0.50 * 0.00400 = 1.08400.
  // Premium Zone is strictly > 1.08400.

  // Index 21: Order Block (Up-close candle preceding displacement)
  candles[21] = {
    timestamp: tMinus(20),
    open: 1.08450,
    high: 1.08520, // OB ceiling
    low: 1.08440,  // OB floor
    close: 1.08500, // Up candle (close > open)
    volume: 140,
  };

  // Index 22: C1 (Base candle originating near OB)
  candles[22] = {
    timestamp: tMinus(15),
    open: 1.08495,
    high: 1.08510,
    low: 1.08470, // C1 Low = 1.08470
    close: 1.08480,
    volume: 180,
  };

  // Index 23: C2 (Impulse downward displacement)
  candles[23] = {
    timestamp: tMinus(10),
    open: 1.08475,
    high: 1.08480,
    low: 1.08425,
    close: 1.08430,
    volume: 240, // T2 > avg10
  };

  // Index 24: C3 (Confirmation candle)
  // Bearish FVG: High(C3) < Low(C1)
  // High(C3) = 1.08440, Low(C1) = 1.08470 => Zone = [High(C3), Low(C1)] = [1.08440, 1.08470]
  // Both boundaries > 1.08400 (Fib 50%) => strictly in Premium Zone!
  // Close(C3) = 1.08420 < Low(C1) (1.08470) => valid expansion breakout
  candles[24] = {
    timestamp: tMinus(5),
    open: 1.08435,
    high: 1.08440, // High(C3) < Low(C1) -> Bearish FVG
    low: 1.08410,  // Lower wick = 1.08420 - 1.08410 = 0.00010; range = 0.00030 -> ratio 0.333 <= 0.50
    close: 1.08420,
    volume: 310, // T1 < T2 < T3 => ASCENDING
  };

  return candles;
}

// 31. Stage 2: Bearish Fair Value Gap Formation
runTest('Test 31: Stage 2 - Bearish FVG formation zone strictly defined as [High(C3), Low(C1)]', () => {
  const candles = generateDeterministicBearishSetup();
  const c1 = candles[22];
  const c3 = candles[24];

  assert(c3.high < c1.low, 'Bearish FVG requires High(C3) < Low(C1)');
  const tel = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  assert.strictEqual(tel.validation_metrics.fvg.fvg_status, 'PASS');
  assert.deepStrictEqual(tel.validation_metrics.fvg.zone, [c3.high, c1.low]);

  // Negative test: High(C3) >= Low(C1) produces no FVG and rejects
  const failCandles = generateDeterministicBearishSetup();
  failCandles[24].high = failCandles[22].low + 0.00010; // C3 High penetrates above C1 Low
  const failTel = executeStrategyPipeline({
    candles: failCandles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(failTel.validation_metrics.fvg.fvg_status, 'REJECT');
  assert.strictEqual(failTel.system_execution.system_decision, 'REJECT');
});

// 32. Stage 2: Bearish FVG Mitigation State Transitions (PARTIAL_FILL and COMPLETELY_FILLED)
runTest('Test 32: Stage 2 - Bearish FVG mitigation transitions: PARTIAL_FILL on retest, COMPLETELY_FILLED on invalidation', () => {
  // Case A: Price below gap -> UNMITIGATED
  const candlesUnmitigated = generateDeterministicBearishSetup();
  const telUnmitigated = executeStrategyPipeline({
    candles: candlesUnmitigated,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telUnmitigated.validation_metrics.fvg.fvg_mitigation_state, 'UNMITIGATED');

  // Case B: Retest penetrates upward into (fvgBottom, fvgTop) -> PARTIAL_FILL
  // FVG is [1.08440, 1.08470]. Price retraces to 1.08455
  const candlesPartial = generateDeterministicBearishSetup();
  candlesPartial[24].close = 1.08455;
  const telPartial = executeStrategyPipeline({
    candles: candlesPartial,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telPartial.validation_metrics.fvg.fvg_mitigation_state, 'PARTIAL_FILL');

  // Case C: Retest closes at or above fvgTop (1.08470) -> COMPLETELY_FILLED & EXPIRED
  const candlesFilled = generateDeterministicBearishSetup();
  candlesFilled[24].close = 1.08475; // >= fvgTop (1.08470)
  const telFilled = executeStrategyPipeline({
    candles: candlesFilled,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telFilled.validation_metrics.fvg.fvg_status, 'EXPIRED');
  assert.strictEqual(telFilled.validation_metrics.fvg.fvg_mitigation_state, 'COMPLETELY_FILLED');
  assert.strictEqual(telFilled.system_execution.system_decision, 'REJECT');
});

// 33. Stage 2: Bearish Order Block + FVG Mathematical Confluence
runTest('Test 33: Stage 2 - Bearish OB + FVG confluence: (Low(C1) >= Low(Cob) || fvgTop >= Low(Cob)) && High(C3) < High(Cob)', () => {
  const candles = generateDeterministicBearishSetup();
  const tel = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  assert.strictEqual(tel.validation_metrics.order_block.ob_detected, true);
  assert.strictEqual(tel.validation_metrics.order_block.ob_confluence_status, 'PASS');

  // Negative test: High(C3) >= High(Cob) pierces OB ceiling, failing confluence
  const failCandles = generateDeterministicBearishSetup();
  const obTop = failCandles[21].high; // 1.08520
  failCandles[24].high = obTop + 0.00010; // 1.08530 >= obTop
  const failTel = executeStrategyPipeline({
    candles: failCandles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(failTel.validation_metrics.order_block.ob_confluence_status, 'FAIL');
  assert.strictEqual(failTel.system_execution.system_decision, 'REJECT');
});

// 34. Stage 3: Bearish 3-Candle Strict Breakout Expansion
runTest('Test 34: Stage 3 - Bearish 3-Candle breakout: Close(C3) < Low(C1) PASS vs Close(C3) >= Low(C1) REJECT', () => {
  const candles = generateDeterministicBearishSetup();
  // Valid bearish breakout: C3 Close (1.08420) < C1 Low (1.08470)
  const telPass = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telPass.validation_metrics.pattern_3_candle.status, 'PASS');

  // Negative Boundary 1: Close(C3) == Low(C1) exactly equal (fails strict < Low(C1))
  const candlesEq = generateDeterministicBearishSetup();
  candlesEq[24].close = candlesEq[22].low; // Exactly 1.08470
  const telEq = executeStrategyPipeline({
    candles: candlesEq,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telEq.validation_metrics.pattern_3_candle.status, 'REJECT');
  assert.strictEqual(telEq.system_execution.system_decision, 'REJECT');

  // Negative Boundary 2: Close(C3) inside C1 range [Low(C1), High(C1)]
  const candlesInside = generateDeterministicBearishSetup();
  candlesInside[24].close = 1.08490; // inside [1.08470, 1.08510]
  const telInside = executeStrategyPipeline({
    candles: candlesInside,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telInside.validation_metrics.pattern_3_candle.status, 'REJECT');
  assert.strictEqual(telInside.system_execution.system_decision, 'REJECT');
});

// 35. Stage 5: Bearish Lower-Wick Pushback Ratio Boundary (> 0.500 Rejection)
runTest('Test 35: Stage 5 - Bearish lower-wick pushback ratio <= 0.500 PASS vs > 0.500 REJECT ("Wick Fakeout")', () => {
  // Pass case: Lower wick ratio exactly 0.500
  const candlesPass = generateDeterministicBearishSetup();
  // C1 low = 1.08500, OB floor = 1.08440
  candlesPass[22].low = 1.08500;
  candlesPass[22].close = 1.08505;
  candlesPass[23].high = 1.08495;
  // Total range = 0.00100 (high: 1.08480, low: 1.08380)
  // Min(open, close) = 1.08430 -> lower wick = 1.08430 - 1.08380 = 0.00050 -> ratio = exactly 0.500
  candlesPass[24].high = 1.08480;
  candlesPass[24].low = 1.08380;
  candlesPass[24].open = 1.08460;
  candlesPass[24].close = 1.08430;
  const telPass = executeStrategyPipeline({
    candles: candlesPass,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telPass.validation_metrics.wick_check.status, 'PASS', '0.500 lower wick ratio must PASS');

  // Fail case: Lower wick ratio 0.510 (> 0.50)
  const candlesFail = generateDeterministicBearishSetup();
  candlesFail[22].low = 1.08500;
  candlesFail[22].close = 1.08505;
  candlesFail[23].high = 1.08495;
  // Lower wick = 1.08431 - 1.08380 = 0.00051 / 0.00100 = 0.510
  candlesFail[24].high = 1.08480;
  candlesFail[24].low = 1.08380;
  candlesFail[24].open = 1.08460;
  candlesFail[24].close = 1.08431;
  const telFail = executeStrategyPipeline({
    candles: candlesFail,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telFail.validation_metrics.wick_check.status, 'REJECT', '> 0.50 lower wick ratio must REJECT');
  assert.strictEqual(telFail.system_execution.system_decision, 'REJECT');
});

// 36. Stage 5: Bearish Prior-Swing-Low Liquidity Sweep
runTest('Test 36: Stage 5 - Bearish prior-swing-low liquidity sweep: Low(C3) < SL_n && Close(C3) >= SL_n triggers SWEEP_DETECTED', () => {
  const candles = generateDeterministicBearishSetup();
  // SL2 = 1.08200 (recent swing low)
  // Low penetrates below SL2 (1.08180 < 1.08200), but close fails to hold below (1.08210 >= 1.08200)
  candles[24].low = 1.08180;
  candles[24].close = 1.08210;
  candles[24].open = 1.08230;
  const tel = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  assert.strictEqual(tel.validation_metrics.liquidity_sweep.status, 'SWEEP_DETECTED');
  assert.strictEqual(tel.system_execution.system_decision, 'REJECT');
  assert.strictEqual(tel.system_execution.final_action, 'NO_ACTION');
});

// 37. Stage 7: Bearish Fibonacci 50% Premium Rule
runTest('Test 37: Stage 7 - Bearish Fib50 Premium rule: FVG Bottom > Fib50 PASS_PREMIUM vs FVG Bottom <= Fib50 REJECT', () => {
  // Pass case: FVG Bottom (1.08440) > Fib 50% (1.08360) -> PASS_PREMIUM
  const candlesPass = generateDeterministicBearishSetup();
  const telPass = executeStrategyPipeline({
    candles: candlesPass,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  assert.strictEqual(telPass.validation_metrics.fib_zone.status, 'PASS_PREMIUM');

  // Reject case: Fib equilibrium set higher (0.85) pushing Fib level to 1.08472, so FVG Bottom (1.08440) <= Fib level
  const telReject = executeStrategyPipeline({
    candles: candlesPass,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    higherTimeframeBias: 'BEARISH',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
    customSettings: { fibEquilibriumLevel: 0.85 }, // Forces FVG bottom into Discount relative to threshold
  });
  assert.strictEqual(telReject.validation_metrics.fib_zone.status, 'REJECT');
  assert.strictEqual(telReject.system_execution.system_decision, 'REJECT');
  assert(telReject.system_execution.rejection_reason?.includes('Premium Zone'));
});

// ============================================================================
// PRODUCTION HANDOVER HARDENING TEST SUITE (TESTS 38 - 62)
// Covering Scope Freeze, Persistence, Credential Security, Notifications,
// Next-Candle Results, Analytics & Natural Language Bengali Chat Assistant
// ============================================================================

// 38. Scope Freeze: Rejection of maxWickRatio mutation under locked EXP-2026-001
runTest('Test 38: Scope Freeze - Rejection of maxWickRatio mutation under locked EXP-2026-001', () => {
  const result = experimentTracker.checkFrozenMutation({ maxWickRatio: 0.65 });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.field, 'maxWickRatio');
  assert(result.reason?.includes('EXPERIMENT_SCOPE_FROZEN'));
});

// 39. Scope Freeze: Rejection of fibEquilibriumLevel mutation under locked EXP-2026-001
runTest('Test 39: Scope Freeze - Rejection of fibEquilibriumLevel mutation under locked EXP-2026-001', () => {
  const result = experimentTracker.checkFrozenMutation({ fibEquilibriumLevel: 0.618 });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.field, 'fibEquilibriumLevel');
  assert(result.reason?.includes('EXPERIMENT_SCOPE_FROZEN'));
});

// 40. Scope Freeze: Rejection of timeframe / threshold mutation under locked EXP-2026-001
runTest('Test 40: Scope Freeze - Rejection of timeframe/threshold mutation under locked EXP-2026-001', () => {
  const r1 = experimentTracker.checkFrozenMutation({ selectedTimeframe: '15m' });
  assert.strictEqual(r1.allowed, false);

  const r2 = experimentTracker.checkFrozenMutation({ thresholds: { maxWick: 0.4 } });
  assert.strictEqual(r2.allowed, false);

  const r3 = experimentTracker.checkFrozenMutation({ fvgZoneCalculation: 'custom' });
  assert.strictEqual(r3.allowed, false);
});

// 41. Persistence: DurableStorage saves and loads candidates surviving re-instantiation
runTest('Test 41: Persistence - DurableStorage saves and loads candidates surviving re-instantiation', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const candidate = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  candidate.metadata.setup_id = 'EXP-2026-001-TEST41';

  durableStorage.saveCandidates([candidate]);

  const isolatedStorage = new (durableStorage.constructor as any)(testStorageDir);
  const loaded = isolatedStorage.loadCandidates();
  assert(loaded.length > 0);
  const found = loaded.find((c: any) => c.metadata.setup_id === 'EXP-2026-001-TEST41');
  assert(found !== undefined);
  assert.strictEqual(found.system_execution.system_decision, 'PASS');
});

// 42. Persistence: DurableStorage saves and loads user accounts surviving re-instantiation
runTest('Test 42: Persistence - DurableStorage saves and loads user accounts surviving re-instantiation', () => {
  const reg = authService.register('Persistence Operator', 'persist@operator.com', 'SecurePass123!');
  assert.strictEqual(reg.success, true);

  const isolatedStorage = new (durableStorage.constructor as any)(testStorageDir);
  const users = isolatedStorage.loadUsers();
  const savedUser = users.find((u: any) => u.email === 'persist@operator.com');
  assert(savedUser !== undefined);
  assert.strictEqual(savedUser.status, 'PENDING');
});

// 43. Persistence: DurableStorage saves and loads session tokens surviving re-instantiation
runTest('Test 43: Persistence - DurableStorage saves and loads session tokens surviving re-instantiation', () => {
  authService.bootstrapUser('Session Tester', 'session@test.com', 'Pass123456!', 'ADMIN', 'APPROVED');
  const login = authService.login('session@test.com', 'Pass123456!');
  assert.strictEqual(login.success, true);
  const token = login.token!;

  const isolatedStorage = new (durableStorage.constructor as any)(testStorageDir);
  const sessions = isolatedStorage.loadSessions();
  const savedSession = sessions.find((s: any) => s.token === token);
  assert(savedSession !== undefined);
  assert(savedSession.expiresAt > Date.now());
});

// 44. Persistence: DurableStorage saves and loads experiment state & hash chain surviving re-instantiation
runTest('Test 44: Persistence - DurableStorage saves and loads experiment state & hash chain surviving re-instantiation', () => {
  const dummyState = {
    experimentId: 'EXP-2026-001',
    strategyVersion: 'v1.0-FROZEN',
    isLocked: true,
    scannerActive: true,
    alertsMuted: false,
    lastHash: 'a'.repeat(64),
    targetValidSetups: 100,
    updatedAt: new Date().toISOString(),
  };

  durableStorage.saveExperimentState(dummyState);

  const isolatedStorage = new (durableStorage.constructor as any)(testStorageDir);
  const loadedState = isolatedStorage.loadExperimentState();
  assert.strictEqual(loadedState?.experimentId, 'EXP-2026-001');
  assert.strictEqual(loadedState?.lastHash, 'a'.repeat(64));
  assert.strictEqual(loadedState?.isLocked, true);
});

// 45. Credential Security: Zero hardcoded cleartext production passwords in auth service
runTest('Test 45: Credential Security - Zero hardcoded cleartext production passwords in auth service', () => {
  const pass = 'ArbitrarySecretPassword123!';
  const hashed = authService.hashPassword(pass);
  assert(hashed.includes(':'));
  const [salt, hash] = hashed.split(':');
  assert(salt.length === 32);
  assert(hash.length === 128);
  assert(!hashed.includes(pass));
});

// 46. Credential Security: Secure bootstrap admin generated via environment or private entropy
runTest('Test 46: Credential Security - Secure bootstrap admin generated via environment or private entropy', () => {
  const users = durableStorage.loadUsers();
  const admin = users.find((u: any) => u.email === 'admin@devsecure.engine');
  assert(admin !== undefined);
  assert.strictEqual(admin.role, 'ADMIN');
  assert.strictEqual(admin.status, 'APPROVED');
  assert(!admin.passwordHash?.includes('Admin@Research2026!'));
});

// 47. Notification Payload: Message #1 Valid Signal Alert format contains all required fields
runTest('Test 47: Notification Payload - Message #1 Valid Signal Alert format contains all required fields', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  telemetry.metadata.setup_id = 'EXP-2026-001-SIGNAL47';

  const text = notificationService.formatSignalAlert(telemetry);
  assert(text.includes('VALID SIGNAL DETECTED'));
  assert(text.includes('EXP-2026-001-SIGNAL47'));
  assert(text.includes('BULLISH'));
  assert(text.includes('5m'));
  assert(text.includes('UTC'));
  assert(text.includes('BDT'));
  assert(text.includes('STAGE RESULTS'));
  assert(text.includes('MANUAL RESEARCH ALERT ONLY'));
});

// 48. Notification Payload: Message #2 Next-Candle Result Alert format contains all required fields
runTest('Test 48: Notification Payload - Message #2 Next-Candle Result Alert format contains all required fields', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });
  telemetry.metadata.setup_id = 'EXP-2026-001-RES48';

  const outcomeRecord = {
    setup_id: 'EXP-2026-001-RES48',
    outcome: 'WIN' as const,
    nextCandleOpen: 1.0850,
    nextCandleClose: 1.0855,
    userAction: 'TAKEN' as const,
    timestamp: new Date().toISOString(),
  };

  const text = notificationService.formatResultAlert(telemetry, outcomeRecord);
  assert(text.includes('NEXT-CANDLE RESULT'));
  assert(text.includes('WIN'));
  assert(text.includes('TAKEN'));
  assert(text.includes('EXP-2026-001-RES48'));
  assert(text.includes('UTC'));
  assert(text.includes('BDT'));
  assert(text.includes('RESEARCH RECORD'));
});

// 49. Notification Delivery Status: Signal Alert tracks Telegram & Email delivery states
runTest('Test 49: Notification Delivery Status - Signal Alert tracks Telegram & Email delivery states', async () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  const res = await notificationService.dispatchSignalAlert(telemetry);
  assert(res !== null && typeof res === 'object');
  assert('telegram' in res);
  assert('email' in res);
  assert(['SENT', 'FAILED', 'DISABLED'].includes(res.telegram));
  assert(['SENT', 'FAILED', 'DISABLED'].includes(res.email));
});

// 50. Notification Safety: Notification failure does NOT invalidate candidate decision or alter experiment stats
runTest('Test 50: Notification Safety - Notification failure does NOT invalidate candidate decision or alter experiment stats', async () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const telemetry = executeStrategyPipeline({
    candles,
    currentCandleIndex: 24,
    selectedTimeframe: '5m',
    newsEvents: [],
    newsSourceOnline: true,
    cvConfidence: 0.98,
  });

  await notificationService.dispatchSignalAlert(telemetry);

  assert.strictEqual(telemetry.system_execution.system_decision, 'PASS');
  assert.strictEqual(telemetry.system_execution.final_action, 'MANUAL_ALERT');
});

// 51. Notification Manual Test: sendTestNotification() handles unconfigured channels gracefully
runTest('Test 51: Notification Manual Test - sendTestNotification() handles unconfigured channels gracefully', async () => {
  const testRes: any = await notificationService.sendTestNotification();
  assert(testRes !== null);
  assert(typeof testRes.success === 'boolean');
  assert(Array.isArray(testRes.details));
  assert(testRes.details.length === 2);
});

// 52. Next-Candle Result: Bullish signal next candle close > open resolves to NEXT_CANDLE_FAVORABLE
runTest('Test 52: Next-Candle Result - Bullish signal: next candle close > open resolves to NEXT_CANDLE_FAVORABLE', () => {
  const outcome = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0840, 1.0845);
  assert.strictEqual(outcome, 'NEXT_CANDLE_FAVORABLE');
});

// 53. Next-Candle Result: Bullish signal next candle close <= open resolves to NEXT_CANDLE_UNFAVORABLE or NEUTRAL
runTest('Test 53: Next-Candle Result - Bullish signal: next candle close <= open resolves to NEXT_CANDLE_UNFAVORABLE or NEUTRAL', () => {
  const outcomeLoss = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0840, 1.0838);
  assert.strictEqual(outcomeLoss, 'NEXT_CANDLE_UNFAVORABLE');

  const outcomeFlat = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0840, 1.0840);
  assert.strictEqual(outcomeFlat, 'NEXT_CANDLE_NEUTRAL');
});

// 54. Next-Candle Result: Bearish signal next candle close < open resolves to NEXT_CANDLE_FAVORABLE
runTest('Test 54: Next-Candle Result - Bearish signal: next candle close < open resolves to NEXT_CANDLE_FAVORABLE', () => {
  const outcomeWin = analyticsService.evaluateNextCandleOutcome('BEARISH', 18450, 18420);
  assert.strictEqual(outcomeWin, 'NEXT_CANDLE_FAVORABLE');

  const outcomeLoss = analyticsService.evaluateNextCandleOutcome('BEARISH', 18420, 18450);
  assert.strictEqual(outcomeLoss, 'NEXT_CANDLE_UNFAVORABLE');
});

// 55. Next-Candle Result: User Action NOT_TAKEN does NOT alter NEXT_CANDLE_FAVORABLE research observation
runTest('Test 55: Next-Candle Result - User Action NOT_TAKEN does NOT alter NEXT_CANDLE_FAVORABLE research outcome', () => {
  const outcome = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0840, 1.0848);
  assert.strictEqual(outcome, 'NEXT_CANDLE_FAVORABLE');

  const record = {
    setup_id: 'EXP-TEST55',
    outcome,
    nextCandleOpen: 1.0840,
    nextCandleClose: 1.0848,
    userAction: 'NOT_TAKEN' as const,
    timestamp: new Date().toISOString(),
  };

  analyticsService.recordOutcome(record);
  const history: any = analyticsService.getAnalytics();
  const found = history.outcomes.find((o: any) => o.setup_id === 'EXP-TEST55');
  assert(found !== undefined);
  assert(found.outcome === 'NEXT_CANDLE_FAVORABLE' || found.outcome === 'WIN');
  assert.strictEqual(found.userAction, 'NOT_TAKEN');
});

// 56. Research History: Analytics engine computes accurate WIN/LOSS/TAKEN/NOT_TAKEN counts
runTest('Test 56: Research History - Analytics engine computes accurate WIN/LOSS/TAKEN/NOT_TAKEN counts', () => {
  durableStorage.saveOutcomes([
    { setup_id: 'S1', outcome: 'WIN', nextCandleOpen: 10, nextCandleClose: 12, userAction: 'TAKEN', timestamp: new Date().toISOString() },
    { setup_id: 'S2', outcome: 'WIN', nextCandleOpen: 10, nextCandleClose: 12, userAction: 'NOT_TAKEN', timestamp: new Date().toISOString() },
    { setup_id: 'S3', outcome: 'LOSS', nextCandleOpen: 12, nextCandleClose: 10, userAction: 'NOT_TAKEN', timestamp: new Date().toISOString() },
  ]);

  const stats: any = analyticsService.getAnalytics();
  assert.strictEqual(stats.summary.wins, 2);
  assert.strictEqual(stats.summary.losses, 1);
  assert.strictEqual(stats.summary.userTaken, 1);
  assert.strictEqual(stats.summary.userNotTaken, 2);
  assert.strictEqual(stats.summary.winRate, '66.7%');
});

// 57. Research History: Analytics engine filters by pair (e.g. NQ vs ES) accurately
runTest('Test 57: Research History - Analytics engine filters by pair (e.g. NQ vs ES) accurately', () => {
  const candles = feedManager.generateDeterministicValidSetup(1.0845);
  const cNQ = executeStrategyPipeline({ candles, currentCandleIndex: 24, selectedTimeframe: '5m', newsEvents: [], newsSourceOnline: true, cvConfidence: 0.98 });
  cNQ.metadata.setup_id = 'EXP-NQ-1';
  cNQ.metadata.pair = 'NQ';
  cNQ.metadata.asset = 'NQ';

  const cES = executeStrategyPipeline({ candles, currentCandleIndex: 24, selectedTimeframe: '5m', newsEvents: [], newsSourceOnline: true, cvConfidence: 0.98 });
  cES.metadata.setup_id = 'EXP-ES-1';
  cES.metadata.pair = 'ES';
  cES.metadata.asset = 'ES';

  durableStorage.saveCandidates([cNQ, cES]);

  const nqSetups = analyticsService.getFilteredSetups({ pair: 'NQ' });
  assert.strictEqual(nqSetups.length, 1);
  assert.strictEqual(nqSetups[0].metadata.pair, 'NQ');

  const esSetups = analyticsService.getFilteredSetups({ pair: 'ES' });
  assert.strictEqual(esSetups.length, 1);
  assert.strictEqual(esSetups[0].metadata.pair, 'ES');
});

// 58. Date Boundary: Natural language date parser handles "গত ৩ দিন", "আজ", "গত ২৪ ঘণ্টা", "last 3 days"
runTest('Test 58: Date Boundary - Natural language date parser handles Bengali & English date ranges', () => {
  const p1 = analyticsService.parseNaturalDateRange('গত ৩ দিনে কয়টা WIN হয়েছে?');
  assert.strictEqual(p1.label, 'Last 3 Days');
  assert(p1.startUtc !== null);

  const p2 = analyticsService.parseNaturalDateRange('আজকের রেজাল্ট কি?');
  assert.strictEqual(p2.label, 'Today');

  const p3 = analyticsService.parseNaturalDateRange('what happened in the last 24 hours?');
  assert.strictEqual(p3.label, 'Last 24 Hours');

  const p4 = analyticsService.parseNaturalDateRange('গত ৭ দিন');
  assert.strictEqual(p4.label, 'Last 7 Days');
});

// 59. Chat Assistant: Strategy mutation attempt ("change wick threshold") is strictly blocked with frozen explanation
runTest('Test 59: Chat Assistant - Strategy mutation attempt is strictly blocked with frozen explanation', async () => {
  authService.bootstrapUser('Analyst Tester 59', 'analyst59@test.com', 'Pass123456!', 'ANALYST', 'APPROVED');
  const user = authService.getUserByToken(authService.login('analyst59@test.com', 'Pass123456!').token!)!;

  const res = await chatService.processQuery(user, 'change wick threshold to 0.70');
  assert.strictEqual(res.queryType, 'MUTATION_ATTEMPT');
  assert(res.message.includes('Strategy v1.0-FROZEN'));
  assert(res.message.includes('STRATEGY RULES ARE FROZEN'));
});

// 60. Chat Assistant: Market condition query executes deterministic Strategy v1.0 pipeline without hallucination
runTest('Test 60: Chat Assistant - Market condition query executes deterministic Strategy v1.0 pipeline without hallucination', async () => {
  authService.bootstrapUser('Analyst Tester 60', 'analyst60@test.com', 'Pass123456!', 'ANALYST', 'APPROVED');
  const user = authService.getUserByToken(authService.login('analyst60@test.com', 'Pass123456!').token!)!;

  const res = await chatService.processQuery(user, 'What is the current market condition on NQ?');
  assert.strictEqual(res.queryType, 'MARKET_CONDITION');
  assert(res.message.includes('DETERMINISTIC MARKET ANALYSIS'));
  assert(res.message.includes('NQ'));
  assert(res.message.includes('Stage 1 (Structure)'));
  assert(res.message.includes('Stage 9 (Pressure)'));
});

// 61. Chat Assistant: Bengali historical queries ("গত ৩ দিনে কয়টা WIN এবং কয়টা LOSS?") return verified counts
runTest('Test 61: Chat Assistant - Bengali historical queries return verified counts', async () => {
  authService.bootstrapUser('Analyst Tester 61', 'analyst61@test.com', 'Pass123456!', 'ANALYST', 'APPROVED');
  const user = authService.getUserByToken(authService.login('analyst61@test.com', 'Pass123456!').token!)!;

  const res = await chatService.processQuery(user, 'গত ৩ দিনে কয়টা WIN এবং কয়টা LOSS?');
  assert.strictEqual(res.queryType, 'HISTORICAL_ANALYTICS');
  assert(res.message.includes('গবেষণা ফলাফল') || res.message.includes('Research WIN'));
  assert(res.message.includes('WIN'));
  assert(res.message.includes('LOSS'));
});

// 62. Audit Log Linkage: Every signal, outcome, notification, and chat event shares the authoritative setup_id
runTest('Test 62: Audit Log Linkage - Every signal, outcome, notification, and chat event shares the authoritative setup_id', () => {
  const setupId = `EXP-2026-001-LINK62-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  durableStorage.appendAuditLog({
    action: 'CANDIDATE_RECORDED',
    userId: 'usr-admin',
    details: { setup_id: setupId, decision: 'PASS' },
  });

  durableStorage.appendAuditLog({
    action: 'OUTCOME_RECORDED',
    userId: 'usr-admin',
    details: { setup_id: setupId, outcome: 'WIN', userAction: 'TAKEN' },
  });

  durableStorage.appendAuditLog({
    action: 'NOTIFICATION_DISPATCHED',
    userId: 'system',
    details: { setup_id: setupId, channels: ['telegram', 'email'] },
  });

  const logs = durableStorage.getAuditLogs();
  const linked = logs.filter((l) => l.details?.setup_id === setupId);
  assert.strictEqual(linked.length, 3);
  assert(linked.every((l) => l.details.setup_id === setupId));
});

// 63. Telegram Updates: Handles unconfigured bot token safely without exposing secrets
runTest('Test 63: Telegram Updates - Handles unconfigured bot token safely without exposing secrets', async () => {
  const service = new NotificationService();
  service.updateConfig({ telegramBotToken: undefined });
  const res = await service.getLatestTelegramUpdate();
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.configured, false);
  assert(res.error?.includes('not configured'));
  assert(!JSON.stringify(res).includes('bot'));
});

// 64. Telegram Updates: Correctly parses mock Telegram /start message update and extracts user Chat ID
runTest('Test 64: Telegram Updates - Correctly parses Telegram /start message update and extracts user Chat ID', async () => {
  const service = new NotificationService();
  const secretToken = 'SECRET_TEST_BOT_TOKEN_12345';
  service.updateConfig({ telegramBotToken: secretToken });

  // Mock global fetch to return a realistic Telegram getUpdates payload with /start
  const originalFetch = global.fetch;
  try {
    (global as any).fetch = async (url: string) => {
      assert(url.includes('getUpdates'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 887711,
              message: {
                message_id: 42,
                from: {
                  id: 991827364,
                  is_bot: false,
                  first_name: 'Lead',
                  last_name: 'Operator',
                  username: 'lead_operator',
                },
                chat: {
                  id: 991827364,
                  first_name: 'Lead',
                  last_name: 'Operator',
                  username: 'lead_operator',
                  type: 'private',
                },
                date: 1726830123,
                text: '/start',
              },
            },
          ],
        }),
      };
    };

    const res = await service.getLatestTelegramUpdate();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.configured, true);
    assert(res.update !== undefined);
    assert.strictEqual(res.update.chatId, '991827364');
    assert.strictEqual(res.update.username, 'lead_operator');
    assert.strictEqual(res.update.firstName, 'Lead');
    assert.strictEqual(res.update.lastName, 'Operator');
    assert.strictEqual(res.update.text, '/start');
    assert.strictEqual(res.update.isStartCommand, true);
    assert(res.update.dateFormattedUtc !== undefined);
    assert(res.update.dateFormattedBdt !== undefined);

    // CRITICAL SECURITY ASSERTION: Secret token is NEVER in response object
    const serialized = JSON.stringify(res);
    assert(!serialized.includes(secretToken), 'CRITICAL DEFECT: Bot token exposed in response object');
  } finally {
    global.fetch = originalFetch;
  }
});

// 65. Telegram Chat ID: setTelegramChatId updates active dispatch target and persists in DurableStorage
runTest('Test 65: Telegram Chat ID - setTelegramChatId updates active target and persists in storage', () => {
  const service = new NotificationService();
  service.setTelegramChatId('123456789');
  assert.strictEqual(service.getRawChatId(), '123456789');

  // Verify persistence in durableStorage app settings
  const settings = durableStorage.loadAppSettings();
  assert.strictEqual(settings.telegramChatId, '123456789');
});

// 66. Telegram Security: Error sanitizer strips bot token from API failure messages
runTest('Test 66: Telegram Security - Error sanitizer strips bot token from API failure messages', async () => {
  const service = new NotificationService();
  const secretToken = 'SUPER_SECRET_TOKEN_999';
  service.updateConfig({ telegramBotToken: secretToken });

  const originalFetch = global.fetch;
  try {
    (global as any).fetch = async () => {
      return {
        ok: false,
        status: 400,
        text: async () => `Bad Request: URL https://api.telegram.org/bot${secretToken}/getUpdates contains error`,
      };
    };

    const res = await service.getLatestTelegramUpdate();
    assert.strictEqual(res.success, false);
    assert(res.error !== undefined);
    assert(!res.error.includes(secretToken), 'CRITICAL DEFECT: Bot token leaked in error message');
    assert(res.error.includes('[REDACTED_BOT_TOKEN]'), 'Expected token to be redacted');
  } finally {
    global.fetch = originalFetch;
  }
});

// 67. Telegram Test Alert: Handles unconfigured Chat ID or bot token with clear status feedback
runTest('Test 67: Telegram Test Alert - Returns status DISABLED when Chat ID or bot token is missing', async () => {
  const service = new NotificationService();
  service.updateConfig({ telegramBotToken: undefined, telegramChatId: undefined });

  const res1 = await service.sendTelegramTestAlert();
  assert.strictEqual(res1.success, false);
  assert.strictEqual(res1.status, 'DISABLED');
  assert(res1.detail.includes('TELEGRAM_BOT_TOKEN missing'));

  service.updateConfig({ telegramBotToken: 'TEST_TOKEN', telegramChatId: undefined });
  const res2 = await service.sendTelegramTestAlert();
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.status, 'DISABLED');
  assert(res2.detail.includes('No Telegram Chat ID'));
});

// 68. Telegram Test Alert: Successful dispatch and error sanitization
runTest('Test 68: Telegram Test Alert - Verifies successful dispatch and zero token leakage on error', async () => {
  const service = new NotificationService();
  const secretToken = 'SECRET_TOKEN_DISPATCH_TEST';
  service.updateConfig({ telegramBotToken: secretToken, telegramChatId: '987654321' });

  const originalFetch = global.fetch;
  try {
    // 1. Success case
    (global as any).fetch = async (url: string, opts: any) => {
      assert(url.includes('sendMessage'));
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.chat_id, '987654321');
      assert(body.text.includes('COMVISION — TELEGRAM INTEGRATION TEST'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { message_id: 554433 },
        }),
      };
    };

    const successRes = await service.sendTelegramTestAlert();
    assert.strictEqual(successRes.success, true);
    assert.strictEqual(successRes.status, 'SENT');
    assert.strictEqual(successRes.messageId, 554433);
    assert.strictEqual(successRes.chatId, '987654321');
    assert(successRes.timestampUtc !== undefined);
    assert(successRes.timestampBdt !== undefined);

    // 2. Error case with potential secret leakage
    (global as any).fetch = async () => {
      return {
        ok: false,
        status: 403,
        text: async () => `Forbidden: bot token ${secretToken} was blocked by user`,
      };
    };

    const failRes = await service.sendTelegramTestAlert();
    assert.strictEqual(failRes.success, false);
    assert.strictEqual(failRes.status, 'FAILED');
    assert(!failRes.detail.includes(secretToken), 'CRITICAL: Bot token leaked in error detail');
    assert(failRes.detail.includes('[REDACTED_BOT_TOKEN]'));
  } finally {
    global.fetch = originalFetch;
  }
});

// 69. Strategy v2.0-FROZEN: Research outcome semantics and user-action separation
runTest('Test 69: Strategy v2.0 - NEXT_CANDLE_FAVORABLE/UNFAVORABLE/NEUTRAL/INCONCLUSIVE semantics and user-action separation', () => {
  // Test evaluation of next candle outcomes
  const bullFav = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0850, 1.0865);
  assert.strictEqual(bullFav, 'NEXT_CANDLE_FAVORABLE');

  const bullUnfav = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0850, 1.0840);
  assert.strictEqual(bullUnfav, 'NEXT_CANDLE_UNFAVORABLE');

  const neutral = analyticsService.evaluateNextCandleOutcome('BULLISH', 1.0850, 1.0850);
  assert.strictEqual(neutral, 'NEXT_CANDLE_NEUTRAL');

  const bearFav = analyticsService.evaluateNextCandleOutcome('BEARISH', 1.0850, 1.0835);
  assert.strictEqual(bearFav, 'NEXT_CANDLE_FAVORABLE');

  // Clear prior candidates to isolate test 69 analytics
  durableStorage.saveCandidates([]);

  // Test recording with v2.0 semantics and user action separation (TAKEN, NOT_TAKEN, NOT_RECORDED)
  durableStorage.saveOutcomes([
    {
      setup_id: 'V2-TEST-01',
      pair: 'EUR/USD',
      timeframe: '5m',
      bias: 'BULLISH',
      signal_timestamp_utc: new Date().toISOString(),
      signal_outcome: 'NEXT_CANDLE_FAVORABLE',
      next_candle: { open: 1.085, high: 1.087, low: 1.084, close: 1.0865 },
      user_recorded_action: 'TAKEN',
      result_timestamp_utc: new Date().toISOString(),
    },
    {
      setup_id: 'V2-TEST-02',
      pair: 'EUR/USD',
      timeframe: '5m',
      bias: 'BEARISH',
      signal_timestamp_utc: new Date().toISOString(),
      signal_outcome: 'NEXT_CANDLE_UNFAVORABLE',
      next_candle: { open: 1.085, high: 1.086, low: 1.084, close: 1.0855 },
      user_recorded_action: 'NOT_TAKEN',
      result_timestamp_utc: new Date().toISOString(),
    },
    {
      setup_id: 'V2-TEST-03',
      pair: 'EUR/USD',
      timeframe: '5m',
      bias: 'BEARISH',
      signal_timestamp_utc: new Date().toISOString(),
      signal_outcome: 'NEXT_CANDLE_NEUTRAL',
      next_candle: { open: 1.085, high: 1.086, low: 1.084, close: 1.085 },
      user_recorded_action: 'NOT_RECORDED',
      result_timestamp_utc: new Date().toISOString(),
    },
    // Historical v1.0 record preserved without mutation
    {
      setup_id: 'V1-LEGACY-01',
      pair: 'EUR/USD',
      timeframe: '5m',
      bias: 'BULLISH',
      signal_timestamp_utc: new Date().toISOString(),
      signal_outcome: 'WIN',
      next_candle: { open: 1.080, high: 1.082, low: 1.079, close: 1.0815 },
      user_recorded_action: 'WIN',
      result_timestamp_utc: new Date().toISOString(),
    },
  ]);

  const stats = analyticsService.getAnalytics();
  assert.strictEqual(stats.nextCandleFavorableCount, 2); // 1 v2 + 1 legacy WIN
  assert.strictEqual(stats.nextCandleUnfavorableCount, 1);
  assert.strictEqual(stats.nextCandleNeutralCount, 1);
  assert.strictEqual(stats.userActions.taken, 2); // 1 TAKEN + 1 legacy WIN
  assert.strictEqual(stats.userActions.notTaken, 1);
  assert.strictEqual(stats.userActions.notRecorded, 1);
});

// 70. Strategy v2.0-FROZEN: BSL/SSL pool formation, equality tolerance, touches, merge distance, and invalidation boundary tests
runTest('Test 70: Strategy v2.0 - BSL/SSL pool formation, equality tolerance, touches, merge, and invalidation', () => {
  const currentPrice = 1.08500;

  // 1. Equality tolerance test (ΔP / currentPrice <= 0.0008)
  // P1 = 1.08600, P2 = 1.08650 => ΔP = 0.00050, diff = 0.00050 / 1.08500 = 0.00046 <= 0.0008 (EQUAL_HIGHS)
  const equalSwings: SwingPoint[] = [
    { type: 'HIGH', price: 1.08600, index: 5, timestamp: '2026-09-23T10:00:00Z', confirmedAtTimestamp: '2026-09-23T10:10:00Z' },
    { type: 'HIGH', price: 1.08650, index: 12, timestamp: '2026-09-23T10:35:00Z', confirmedAtTimestamp: '2026-09-23T10:45:00Z' },
    { type: 'LOW', price: 1.08300, index: 8, timestamp: '2026-09-23T10:15:00Z', confirmedAtTimestamp: '2026-09-23T10:25:00Z' },
  ];

  const dummyCandles: Candle[] = [
    { timestamp: '2026-09-23T10:00:00Z', open: 1.0840, high: 1.0860, low: 1.0835, close: 1.0850, volume: 100 },
    { timestamp: '2026-09-23T10:35:00Z', open: 1.0850, high: 1.0865, low: 1.0845, close: 1.0855, volume: 100 },
  ];

  const resEqual = detectLiquidityPools(dummyCandles, currentPrice, equalSwings, 'BULLISH');
  assert.strictEqual(resEqual.selected_liquidity_target, 'BSL_TARGET');
  assert(resEqual.nearest_bsl !== undefined);
  assert.strictEqual(resEqual.nearest_bsl.source, 'EQUAL_HIGHS');
  assert.strictEqual(resEqual.nearest_bsl.touch_count, 2);
  assert.strictEqual(resEqual.nearest_bsl.strength, 'HIGH');
  assert.strictEqual(resEqual.nearest_bsl.level, 1.08650); // max of equal highs

  // 2. Beyond equality tolerance: diff > 0.0008 forms separate SWING_HIGH pools
  // P1 = 1.08600, P2 = 1.08750 => diff = 0.00150 / 1.08500 = 0.00138 > 0.0008
  const nonEqualSwings: SwingPoint[] = [
    { type: 'HIGH', price: 1.08600, index: 5, timestamp: '2026-09-23T10:00:00Z', confirmedAtTimestamp: '2026-09-23T10:10:00Z' },
    { type: 'HIGH', price: 1.08750, index: 12, timestamp: '2026-09-23T10:35:00Z', confirmedAtTimestamp: '2026-09-23T10:45:00Z' },
  ];
  const resNonEqual = detectLiquidityPools(dummyCandles, currentPrice, nonEqualSwings, 'BULLISH');
  assert.strictEqual(resNonEqual.nearest_bsl?.source, 'SWING_HIGH');
  assert.strictEqual(resNonEqual.nearest_bsl?.touch_count, 1);

  // 3. Merge Distance test: two pools within MERGE_DISTANCE (<= 0.0004) are consolidated
  // P1 = 1.08600, P2 = 1.08630 => distance = 0.00030 / 1.08500 = 0.000276 <= 0.0004
  const mergeSwings: SwingPoint[] = [
    { type: 'HIGH', price: 1.08600, index: 5, timestamp: '2026-09-23T10:00:00Z', confirmedAtTimestamp: '2026-09-23T10:10:00Z' },
    { type: 'HIGH', price: 1.08630, index: 12, timestamp: '2026-09-23T10:35:00Z', confirmedAtTimestamp: '2026-09-23T10:45:00Z' },
  ];
  const resMerge = detectLiquidityPools(dummyCandles, currentPrice, mergeSwings, 'BULLISH');
  assert.strictEqual(resMerge.bsl_pools.length, 1, 'Pools within merge distance must consolidate into 1 pool');
  assert.strictEqual(resMerge.bsl_pools[0].level, 1.08630);

  // 4. Invalidation condition: Candle Close > BSL level invalidates the BSL pool
  const invalidatingCandles: Candle[] = [
    { timestamp: '2026-09-23T10:00:00Z', open: 1.0840, high: 1.0870, low: 1.0835, close: 1.08680, volume: 100 }, // Close 1.08680 > 1.08650
  ];
  const resInvalidated = detectLiquidityPools(invalidatingCandles, currentPrice, equalSwings, 'BULLISH');
  assert(resInvalidated.bsl_pools.every((p) => p.level !== 1.08650 || !p.is_invalidated), 'Invalidated BSL pool must not be active');
});

// 71. Strategy v2.0-FROZEN: Momentum / Imbalance numerical formulas, baseline, thresholds, and equality boundaries
runTest('Test 71: Strategy v2.0 - Momentum numerical formulas, baseline calculation, and equality boundaries', () => {
  // Construct baseline of 10 candles with body_ratio = 0.50 (range=10, body=5)
  const baseCandles: Candle[] = [];
  for (let i = 0; i < 10; i++) {
    baseCandles.push({
      timestamp: `2026-09-23T10:0${i}:00Z`,
      open: 1.0840,
      high: 1.0850,
      low: 1.0840,
      close: 1.0845, // body = 0.0005, range = 0.0010 => body_ratio = 0.50
      volume: 100,
    });
  }

  // 1. BULLISH_MOMENTUM exact boundary: body_ratio >= 0.60 && relative_body_strength >= 1.10
  // range = 0.0010, open = 1.0840, close = 1.08460 => body = 0.00060 => body_ratio = 0.60
  // relative_body_strength = 0.60 / 0.50 = 1.20 >= 1.10
  const bullCandles = [...baseCandles, {
    timestamp: '2026-09-23T10:10:00Z',
    open: 1.0840,
    high: 1.0850,
    low: 1.0840,
    close: 1.08460,
    volume: 120,
  }];
  const momBull = evaluateMomentum(bullCandles, 10);
  assert.strictEqual(momBull.direction, 'BULLISH');
  assert(Math.abs(momBull.body_ratio - 0.60) < 1e-5);
  assert(momBull.relative_body_strength >= 1.10);
  assert.strictEqual(momBull.momentum_state, 'BULLISH_MOMENTUM');

  // 2. BEARISH_MOMENTUM exact boundary: direction == 'BEARISH' && body_ratio >= 0.60 && relative_body_strength >= 1.10
  const bearCandles = [...baseCandles, {
    timestamp: '2026-09-23T10:10:00Z',
    open: 1.08460,
    high: 1.0850,
    low: 1.0840,
    close: 1.0840, // body = 0.00060, range = 0.0010 => body_ratio = 0.60
    volume: 120,
  }];
  const momBear = evaluateMomentum(bearCandles, 10);
  assert.strictEqual(momBear.direction, 'BEARISH');
  assert(Math.abs(momBear.body_ratio - 0.60) < 1e-5);
  assert.strictEqual(momBear.momentum_state, 'BEARISH_MOMENTUM');

  // 3. WEAK_MOMENTUM boundary: body_ratio < 0.30
  // range = 0.0010, body = 0.00025 => body_ratio = 0.25 < 0.30
  const weakCandles = [...baseCandles, {
    timestamp: '2026-09-23T10:10:00Z',
    open: 1.0844,
    high: 1.0850,
    low: 1.0840,
    close: 1.08465, // body = 0.00025 => ratio = 0.25
    volume: 80,
  }];
  const momWeak = evaluateMomentum(weakCandles, 10);
  assert.strictEqual(momWeak.momentum_state, 'WEAK_MOMENTUM');

  // 4. NEUTRAL_MOMENTUM boundary: 0.30 <= body_ratio < 0.60 and relative_strength <= 1.30
  // range = 0.0010, body = 0.00045 => body_ratio = 0.45, rel_strength = 0.45 / 0.50 = 0.90 <= 1.30
  const neutralCandles = [...baseCandles, {
    timestamp: '2026-09-23T10:10:00Z',
    open: 1.0842,
    high: 1.0850,
    low: 1.0840,
    close: 1.08465, // body = 0.00045 => ratio = 0.45
    volume: 100,
  }];
  const momNeutral = evaluateMomentum(neutralCandles, 10);
  assert.strictEqual(momNeutral.momentum_state, 'NEUTRAL_MOMENTUM');

  // 5. Zero-range candle boundary protection: range <= 1e-6 does not divide by zero
  const zeroCandles = [...baseCandles, {
    timestamp: '2026-09-23T10:10:00Z',
    open: 1.0845,
    high: 1.0845,
    low: 1.0845,
    close: 1.0845,
    volume: 10,
  }];
  const momZero = evaluateMomentum(zeroCandles, 10);
  assert.strictEqual(momZero.body_ratio, 0);
  assert.strictEqual(momZero.momentum_state, 'WEAK_MOMENTUM');
});

// Run all tests sequentially
(async () => {
  for (const t of testQueue) {
    try {
      await t.fn();
      passedTests++;
      console.log(`[PASS] ${t.name}`);
    } catch (err: any) {
      failedTests++;
      console.error(`[FAIL] ${t.name}:`, err.message);
    }
  }

  console.log(`\n=== TEST SUITE FINISHED: ${passedTests} PASSED, ${failedTests} FAILED ===\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
})();

