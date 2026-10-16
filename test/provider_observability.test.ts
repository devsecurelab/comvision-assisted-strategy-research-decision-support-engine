import assert from 'node:assert/strict';
import { feedManager } from '../src/engine/dataProviders';
import type { ProviderCircuitSnapshot } from '../src/engine/providers/contracts';
import { notificationService } from '../src/server/notificationService';
import { formatProviderSwitchWarning } from '../src/server/providerSwitchFormatter';

const circuits: ProviderCircuitSnapshot[] = [
  { provider: 'TWELVE_DATA', state: 'OPEN', consecutiveFailures: 2, lastFailureCode: 'RATE_LIMITED' },
  { provider: 'OANDA', state: 'CLOSED', consecutiveFailures: 0 },
  { provider: 'TIINGO', state: 'UNCONFIGURED', consecutiveFailures: 0 },
];
const message = formatProviderSwitchWarning({
  pair: 'EUR/USD', timeframe: '15m', changedAt: '2026-10-16T12:30:00.000Z',
  changes: [{ fromProvider: 'TWELVE_DATA', toProvider: 'OANDA', reason: 'RATE_LIMITED', series: ['LTF', 'HTF'] }],
}, circuits);
assert.match(message, /Twelve Data → OANDA v20 Practice/);
assert.match(message, /LTF\+HTF/);
assert.match(message, /reason=RATE_LIMITED/);
assert.match(message, /TWELVE_DATA=OPEN → OANDA=CLOSED/);
assert.match(message, /2026-10-16T12:30:00\.000Z UTC/);
assert.doesNotMatch(message, /api.?key|token|secret/i);

const status = feedManager.getStatus();
const expectedProviders = ['TWELVE_DATA', 'OANDA', 'TIINGO'];
assert.deepEqual(status.circuits.map((circuit) => circuit.provider), expectedProviders);
const health = notificationService.buildHealthText();
assert.match(health, new RegExp(`Active provider: ${status.provider}`));
for (const circuit of status.circuits) assert.ok(health.includes(`${circuit.provider}=${circuit.state}`));
console.log('=== PROVIDER OBSERVABILITY: sanitized Telegram switch warning, active provider and every circuit in /health passed ===');
