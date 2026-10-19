import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartModal } from '../src/components/ChartModal';
import { DecisionAlertCard } from '../src/components/DecisionAlertCard';
import type { MasterTelemetry } from '../src/engine/types';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('src/App.tsx');
const chat = read('src/server/chatService.ts');
const vite = read('vite.config.ts');

function walkTsx(directory: string): string[] {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walkTsx(relative) : /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

const sourcePaths = [...walkTsx('src/components'), 'src/App.tsx', 'src/server/chatService.ts', 'src/server/notificationService.ts'];
const source = new Map(sourcePaths.map((file) => [file, read(file)]));
const failures: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

// Do not accept UI claims that are hard-coded rather than derived from current telemetry.
const forbiddenClaims = [
  /Secured\s*\(Zero Exposure\)/i,
  /Capital Protected/i,
  /(?:we\s+guarantee\s+(?:profit|returns?|wins?|income)|guaranteed\s+to\s+(?:earn|make|win|profit|protect))/i,
  /risk-free/i,
  /Daily Loss Limit/i,
  /Fixed 1\.0%/i,
  /Circuit Breaker/i,
  /Strategy v1\.0 Pipeline/i,
  /EXP-2026-V2/i,
  /PASSED\s*\(\s*0\.0%/i,
  /Profit Factor/i,
  /Avg R:R/i,
  /Total R/i,
  /T-10s Pressure/i,
  /Wick Pushback/i,
];
for (const [file, text] of source) {
  for (const pattern of forbiddenClaims) {
    if (pattern.source === 'Wick Pushback') {
      if (file === 'src/components/ChartModal.tsx') check(!pattern.test(text), `${file}: fabricated Wick Pushback overlay must be removed`);
    } else check(!pattern.test(text), `${file}: forbidden or unsupported display claim ${pattern}`);
  }
  check(!/>\s*(?:PASS|OK|CLEAR|ALIGNED|SECURE)\s*</i.test(text), `${file}: literal status claim must be telemetry-driven`);
  check(!/(?<![A-Za-z0-9])(?:1\.\d{4,}|\d{2,}\.\d{4,})(?![A-Za-z0-9])/.test(text), `${file}: hardcoded market-price literal found`);
  if (file === 'src/components/DecisionAlertCard.tsx') {
    check(!/\|\|\s*['"]EUR\/USD['"]/.test(text), `${file}: pair must not default to EUR/USD`);
  }
}
check(!app.includes('Capital Protected'), 'App.tsx must not claim capital is protected');
check(!app.includes('Strategy v1.0 Pipeline'), 'App.tsx must not advertise the legacy pipeline');
check(!chat.includes("lower.includes('gu')"), 'chat pair matching must not use a broad gu substring');
check(!vite.includes('AI Studio'), 'stale AI Studio Vite comment remains');

const callbacks = {
  onMarkTaken: () => {}, onSkip: () => {}, onRecordResult: () => {},
  onInspectTelemetry: () => {}, onOpenChart: () => {},
};
const emptyAlert = {
  metadata: { project_name: 'ComVision', strategy_version: 'RDP_STRATEGY_V3.0', experiment_id: 'EXP-TEST', setup_id: 'setup-test', timestamp_utc: '2026-10-19T00:00:00.000Z', pair: 'GBP/USD', data_quality: { ok: true, issues: [] } },
  market_context: { selected_timeframe: '5m', supporting_timeframe_analysis: { htf_analyzed: '1h', htf_bias: 'UNCLEAR' }, local_bias: 'UNCLEAR', context_state: 'UNCLEAR', regime_tag: 'UNCLEAR', session: 'UNCLEAR', kill_zone: 'UNCLEAR' },
  system_execution: { system_decision: 'BLOCKED', final_action: 'NO_ACTION', user_recorded_action: 'PENDING' },
  pressure_observation: { classification: 'UNAVAILABLE', magnitude: 'UNAVAILABLE', consistency: 'UNAVAILABLE' },
  validation_metrics: { wick_check: { status: 'INCONCLUSIVE', wick_ratio: null } },
  guardrails: { news_guard: { news_event_detected: false, news_window_state: 'UNAVAILABLE', news_source: 'NOT_CHECKED (manual)' } },
  decision_engine_v3: { binarySignal: 'NO_TRADE', gates: [] },
} as unknown as MasterTelemetry;

try {
  const nullCard = renderToStaticMarkup(React.createElement(DecisionAlertCard, { alert: null, ...callbacks }));
  check(nullCard.includes('UNAVAILABLE') && nullCard.includes('V3'), 'null telemetry must render a V3/UNAVAILABLE description, not an invented scanning claim');
  const emptyCard = renderToStaticMarkup(React.createElement(DecisionAlertCard, { alert: emptyAlert, ...callbacks }));
  check(emptyCard.includes('GBP/USD'), 'pair title must use the actual GBP/USD telemetry pair');
  check(emptyCard.includes('NO_TRADE') || emptyCard.includes('UNAVAILABLE'), 'NO_TRADE telemetry must render safely without a directional setup badge');
  check(/<button[^>]*id="btn-open-chart"[^>]*disabled/.test(emptyCard), 'Open Chart must be disabled when no candle snapshot is stored');
  const unclearCard = renderToStaticMarkup(React.createElement(DecisionAlertCard, { alert: { ...emptyAlert, decision_engine_v3: { binarySignal: 'UNCLEAR', gates: [] } } as unknown as MasterTelemetry, ...callbacks }));
  check(unclearCard.includes('UNAVAILABLE'), 'UNCLEAR direction must not be rendered as bullish or bearish');
  const chart = renderToStaticMarkup(React.createElement(ChartModal, { telemetry: emptyAlert, onClose: () => {} }));
  check(chart.includes('CHART UNAVAILABLE — candle snapshot not stored'), 'missing candle snapshot must show the explicit unavailable state');
  check(!/\b\d+\.\d{4,}\b/.test(chart), 'chart must not invent market prices when candles are missing');
} catch (error) {
  failures.push(`React server-render regression threw: ${error instanceof Error ? error.message : String(error)}`);
}

if (failures.length) {
  console.error(`PR-U intentional red tests: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  throw new Error('UI truthfulness red tests failed as expected before implementation.');
}

console.log('=== PR-U UI TRUTHFULNESS RED TESTS: no fabricated claims/prices and safe telemetry server rendering ===');
