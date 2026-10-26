import assert from 'node:assert/strict';
import { TwelveDataAdapter } from '../src/engine/providers/twelveDataAdapter';
import { GENERATION_DEADLINE_MS, RETRY_BACKOFF_MS, SCAN_DELAY_AFTER_CLOSE_MS } from '../src/engine/scanScheduler';

const rows = Array.from({ length: 30 }, (_, i) => ({
  datetime: new Date(Date.parse('2026-10-25T10:00:00Z') + i * 300_000).toISOString(),
  open: '1.08000', high: '1.08100', low: '1.07900', close: '1.08050', volume: '10',
}));
let requests = 0;
const adapter = new TwelveDataAdapter(async (input) => {
  requests++;
  const url = new URL(String(input));
  assert.equal(url.searchParams.get('symbol'), 'EUR/USD,USD/JPY');
  return new Response(JSON.stringify({
    'EUR/USD': { values: rows },
    'USD/JPY': { status: 'error', message: 'symbol unavailable' },
  }), { status: 200, headers: { date: new Date().toUTCString(), 'api-credits-used': '1' } });
}, 'test-key');
const batch = await adapter.fetchCandlesBatch!(['EUR/USD', 'USD/JPY'], '5m', new AbortController().signal);
assert.equal(requests, 1);
assert.equal(batch['EUR/USD'].rows.length, 30);
assert.equal(batch['USD/JPY'], undefined, 'one failed symbol must not discard successful symbols');
assert.equal(SCAN_DELAY_AFTER_CLOSE_MS, 1_000);
assert.deepEqual(RETRY_BACKOFF_MS, [1_000, 2_000, 3_000]);
assert.ok(GENERATION_DEADLINE_MS > 0);
console.log('[pr1_batch_timing] PASS');
