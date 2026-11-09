import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSessionConfig, sessionConfigHash, signalDeliveryWithinConfiguredSession, tradeWithinZone, validateSessionConfig } from '../src/engine/sessionConfig';
import { CONFIG_HASH, CONFIG_HASH_EPOCH, SESSION_CONFIG_HASH } from '../src/engine/manifest';
import { SignalLedger } from '../src/engine/signalLedger';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = loadSessionConfig(path.join(root, 'config/sessions.json'));
assert.equal(config.entryRule, 'TRADE_WITHIN_ZONE');
assert.ok(config.coreSession, 'validated config includes a core session definition');
assert.throws(() => validateSessionConfig({ ...config, zones: { ...config.zones, LONDON: { ...config.zones.LONDON, startLocal: '10:00', endLocal: '07:00' } } }), /ZONE_ORDER/);
assert.equal(validateSessionConfig({ ...config, entryRule: undefined }).entryRule, 'TRADE_WITHIN_ZONE');
assert.match(sessionConfigHash(config), /^[a-f0-9]{64}$/);
assert.match(SESSION_CONFIG_HASH, /^[a-f0-9]{64}$/);
assert.match(CONFIG_HASH, /^[a-f0-9]{64}$/);
assert.match(CONFIG_HASH_EPOCH, new RegExp(SESSION_CONFIG_HASH.slice(0, 8)));

const originalCwd = process.cwd();
const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'pr7-cwd-'));
try {
  process.chdir(unrelated);
  assert.equal(sessionConfigHash(loadSessionConfig()), SESSION_CONFIG_HASH, 'default config path resolves from repository boundary, not cwd');
} finally { process.chdir(originalCwd); }

const exactEnd = new Date('2026-10-26T07:30:00.000Z');
assert.equal(tradeWithinZone(exactEnd, config.zones.LONDON, 30, 30, 15), true);
assert.equal(tradeWithinZone(new Date('2026-10-26T09:30:01.000Z'), config.zones.LONDON, 30, 30, 15), false);
const deliveryRule = { entryMs: Date.parse('2026-10-26T07:30:00.000Z'), validUntil: '2026-10-26T09:30:00.000Z', timeframe: '15m' as const, zoneName: 'LONDON' as const, config };
assert.equal(signalDeliveryWithinConfiguredSession({ ...deliveryRule, deliveryMs: Date.parse('2026-10-26T09:30:00.000Z') }), true);
assert.equal(signalDeliveryWithinConfiguredSession({ ...deliveryRule, deliveryMs: Date.parse('2026-10-26T09:30:01.000Z') }), false, 'delivery after valid_until is suppressed');
assert.equal(signalDeliveryWithinConfiguredSession({ ...deliveryRule, deliveryMs: Date.parse('2026-10-26T09:30:00.000Z'), entryMs: Date.parse('2026-10-26T09:30:01.000Z') }), false, 'entry beyond end margin is suppressed');

const ledgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr7-ledger-')), 'ledger.jsonl');
const ledger = new SignalLedger(ledgerPath);
ledger.append('SCAN', { scan_id: 'scan-1', pair: 'EUR/USD', timeframe: '15m', trigger: 'AUTO', status: 'NO_TRADE', reason: 'OUTSIDE', scan_started_at: '2026-10-26T06:00:00.000Z', candle_available_at: null, delivered_at: '2026-10-26T06:00:01.000Z' });
const record = ledger.readAll()[0].payload as any;
for (const field of ['config_hash', 'session_config_hash', 'engine_fingerprint', 'rule_variant', 'operational_parameters']) assert.ok(record[field], `every ledger event has ${field}`);
assert.equal(record.session_config_hash, SESSION_CONFIG_HASH);
assert.equal(record.rule_variant, 'TRADE_WITHIN_ZONE');
assert.ok(record.operational_parameters.entry_window_seconds > 0);

console.log('[pr7_session_config] PASS — validation, cwd independence, config identity and per-event ledger metadata');
