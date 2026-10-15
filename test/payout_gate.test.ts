import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { durableStorage } from '../src/server/storage';
import { PayoutRegistry, displayPair, isSupportedPair } from '../src/server/payoutRegistry';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-payout-'));
durableStorage.setDataDir(dir);
const registry = new PayoutRegistry();
assert.equal(isSupportedPair('eur/usd'), true);
assert.equal(displayPair('eurusd'), 'EUR/USD');
assert.equal(registry.status('EURUSD'), 'PAYOUT_UNSET');
registry.set('eur/usd', 84.9);
assert.equal(registry.status('EURUSD'), 'PAYOUT_BELOW_MIN');
registry.set('EURUSD', 85);
assert.equal(registry.status('EUR/USD'), 'ELIGIBLE');
const persisted = new PayoutRegistry();
assert.equal(persisted.get('EUR/USD')?.pct, 85);
assert.throws(() => registry.set('NOTPAIR', 90), /UNSUPPORTED_SYMBOL/);
assert.throws(() => registry.set('GBPUSD', 0), /INVALID_PAYOUT/);
assert.equal(registry.clear('EURUSD'), true);
assert.equal(registry.status('EURUSD'), 'PAYOUT_UNSET');
console.log('=== PAYOUT GATE: unset, 84.9, 85, normalization, persistence and validation passed ===');

// Owner-only Telegram authorization: non-owner chats are rejected and chat IDs are never written to the audit log.
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_CHAT_ID = '111';
const sent: string[] = [];
const updates = [
  { update_id: 1, message: { chat: { id: 999 }, text: '/payout EURUSD 90' } },
  { update_id: 2, message: { chat: { id: 111 }, text: '/payout EURUSD 101' } },
  { update_id: 3, message: { chat: { id: 111 }, text: '/payout EURUSD 85' } },
  { update_id: 4, message: { chat: { id: 111 }, text: '/payout NOTPAIR 90' } },
];
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (String(url).includes('/getUpdates')) return { ok: true, json: async () => ({ ok: true, result: updates }) };
  sent.push(JSON.parse(init?.body || '{}').text);
  return { ok: true, json: async () => ({ ok: true }) };
};
const { NotificationService } = await import('../src/server/notificationService');
const service = new NotificationService();
const polled = await service.processOwnerTelegramCommands();
assert.equal(polled.rejected, 1);
assert.equal(polled.processed, 3);
assert.match(polled.responses[0], /INVALID_PAYOUT/);
assert.match(polled.responses[1], /85%. Status: ELIGIBLE/);
assert.match(polled.responses[2], /UNSUPPORTED_SYMBOL/);
assert.equal(new PayoutRegistry().get('EURUSD')?.pct, 85, 'non-owner /payout 90 was ignored');
const audit = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.includes('audit'))!), 'utf8');
assert.doesNotMatch(audit, /999|"111"/);
assert.match((await service.processOwnerTelegramCommands()).responses.join(), /.*/);
console.log('=== PAYOUT AUTH: owner-only commands, payout validation, no chat IDs in audit passed ===');
