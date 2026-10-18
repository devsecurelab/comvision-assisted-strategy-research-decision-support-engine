import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('src/App.tsx');
const card = read('src/components/DecisionAlertCard.tsx');
const risk = read('src/components/views/RiskView.tsx');
const chat = read('src/server/chatService.ts');
const vite = read('vite.config.ts');

const forbiddenInUi = [
  "|| 'PASS'",
  "? 'PASS' : 'PASS'",
  'PASSED (0.0%',
  'Daily Loss Limit',
  'Fixed 1.0%',
  'Max Consecutive Losses Circuit Breaker',
];
for (const pattern of forbiddenInUi) {
  if (card.includes(pattern) || risk.includes(pattern)) {
    throw new Error(`UI truthfulness regression: forbidden pattern found: ${pattern}`);
  }
}

if (app.includes('nextCandle: {') || app.includes('1.085') || app.includes('closeDelta')) {
  throw new Error('UI truthfulness regression: App.tsx fabricates next-candle OHLC data.');
}
if (!card.includes("alert.decision_engine_v3?.gates ?? []")) {
  throw new Error('UI truthfulness regression: DecisionAlertCard does not render authoritative V3 gates.');
}
if (!card.includes("binarySignal === 'CALL' ? 'BULLISH' : binarySignal === 'PUT' ? 'BEARISH' : 'UNAVAILABLE'")) {
  throw new Error('UI truthfulness regression: direction is not sourced from binary_signal with UNCLEAR-safe fallback.');
}
if (!card.includes("status={gate.status ?? 'UNAVAILABLE'}")) {
  throw new Error('UI truthfulness regression: missing gate status does not render UNAVAILABLE.');
}
if (!chat.includes('telemetry.market_context.selected_timeframe')) {
  throw new Error('Chat truthfulness regression: displayed timeframe is not sourced from telemetry.');
}
if (chat.includes("lower.includes('gu')")) {
  throw new Error('Chat truthfulness regression: broad gu pair matcher remains.');
}
if (vite.includes('AI Studio')) {
  throw new Error('Repository hygiene regression: stale AI Studio Vite comment remains.');
}

console.log('=== UI TRUTHFULNESS: no fabricated outcome prices, fake PASS/risk claims, or stale AI Studio comment ===');
