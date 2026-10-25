import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SignalLedger, type SignalPayload } from '../src/engine/signalLedger';
import { pipSize, priceTolerance, slippagePips } from '../src/engine/price';

assert.equal(pipSize('EUR/USD'), 0.0001);
assert.equal(pipSize('USD/JPY'), 0.01);
assert.ok(Math.abs(priceTolerance('EUR/USD', 0.0012, 0.1) - 0.00012) < 1e-12);
assert.ok(Math.abs(priceTolerance('USD/JPY', 0.12, 0.1) - 0.012) < 1e-12);
assert.equal(slippagePips('EUR/USD', 1.1000, 1.1003), 3);
assert.equal(slippagePips('USD/JPY', 150.10, 150.13), 3);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr1-'));
const ledger = new SignalLedger(path.join(dir, 'ledger.jsonl'));
const signal: SignalPayload = {
  signal_id: 'SIG-PR1', pair: 'EUR/USD', timeframe: '15m', direction: 'CALL',
  signal_candle_open_ts: '2026-01-01T00:00:00.000Z', entry_ts: '2026-01-01T00:15:00.000Z',
  expiry_ts: '2026-01-01T00:30:00.000Z', valid_until: '2026-01-01T00:16:00.000Z',
  payout_pct: 87, breakeven: .535, mfci_total: .9, mfci_band: 'ABOVE_THRESHOLD',
  engine_mode: 'PRICE_ONLY', provider: 'TWELVE_DATA', setup_id: 'V3-PR1', experiment_id: 'EXP-PR1',
  signal_price: 1.1, quote_price: 1.1002, quote_ts: '2026-01-01T00:15:01.000Z', price_tolerance: .00012,
};
assert.equal(ledger.recordSignal(signal), true);
assert.equal(ledger.recordTaken('SIG-PR1', 1.1005), true);
ledger.recordResult({ signal_id: 'SIG-PR1', outcome: 'WIN', source: 'TELEGRAM_MANUAL', broker_close_price: 1.1010 });
ledger.recordCandleRevision('SIG-PR1', 2);
ledger.recordTelegramSent('SIG-PR1', '2026-01-01T00:15:02.000Z');
const view = ledger.get('SIG-PR1')!;
assert.equal(view.broker_entry_price, 1.1005);
assert.equal(view.broker_close_price, 1.1010);
assert.equal(view.slippage_pips, 5);
assert.equal(view.candle_revision_pips, 2);
assert.equal(view.telegram_sent_at, '2026-01-01T00:15:02.000Z');
assert.equal(ledger.verify().ok, true);
console.log('[pr1_signal_price] PASS');
