import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const authSource = fs.readFileSync(path.join(repoRoot, 'src/server/auth.ts'), 'utf8');

// Security source contracts: password derivation and bootstrap must be async/fileless.
assert.equal(authSource.includes('scryptSync'), false, 'PR7 must remove synchronous scrypt password hashing');
assert.equal(authSource.includes('.admin_bootstrap_secret'), false, 'PR7 must not write plaintext bootstrap secret files');
assert.match(authSource, /ADMIN_BOOTSTRAP_PASSWORD/);
const { validateRuntimeConfig } = await import('../src/server/runtimeConfig');
assert.equal(validateRuntimeConfig({ DATA_DIR: os.tmpdir() }).host, '127.0.0.1', 'localhost must be the safe default host');
assert.throws(
  () => validateRuntimeConfig({ HOST: '0.0.0.0', ALLOW_LAN: false, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), DATA_DIR: os.tmpdir() }),
  /ALLOW_LAN|public bind/i,
);
assert.doesNotThrow(() => validateRuntimeConfig({ HOST: '127.0.0.1', ALLOW_LAN: false, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), DATA_DIR: os.tmpdir() }));

const { loadSessionConfig, sessionConfigHash, tradeWithinZone } = await import('../src/engine/sessionConfig');
const sessionConfig = loadSessionConfig(path.join(repoRoot, 'config/sessions.json'));
assert.equal(sessionConfig.entryRule, 'TRADE_WITHIN_ZONE');
assert.equal(sessionConfig.zones.LONDON.timezone, 'Europe/London');
assert.equal(sessionConfig.zones.NEW_YORK.timezone, 'America/New_York');
assert.match(sessionConfigHash(sessionConfig), /^[a-f0-9]{64}$/);

// 2026-10-26 07:30 London local = 07:30 UTC after the 30-minute start margin.
assert.equal(tradeWithinZone(new Date('2026-10-26T07:29:00Z'), sessionConfig.zones.LONDON, 30, 30, 15), false);
assert.equal(tradeWithinZone(new Date('2026-10-26T07:30:00Z'), sessionConfig.zones.LONDON, 30, 30, 15), true);
// A 15-minute expiry must finish before the end-margin boundary.
assert.equal(tradeWithinZone(new Date('2026-10-26T09:14:00Z'), sessionConfig.zones.LONDON, 30, 30, 15), true);
assert.equal(tradeWithinZone(new Date('2026-10-26T09:31:00Z'), sessionConfig.zones.LONDON, 30, 30, 15), false);

// Registration contract must be Promise-based and private-by-default.
const { AuthService } = await import('../src/server/auth');
const service = Object.create(AuthService.prototype) as any;
service.users = new Map();
service.sessions = new Map();
service.registrationRequests = new Map();
service.persistUsers = () => {};
service.persistSessions = () => {};
service.hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key as Buffer)));
  return `${salt}:${derived.toString('hex')}`;
};
const registration = service.register('Test', 'test@example.invalid', 'long-enough-password');
assert.ok(registration instanceof Promise, 'registration must be asynchronous');
assert.equal((await registration).success, false, 'registration must be disabled by default');

console.log('[pr7_security_session] PASS — security and session contract assertions complete');
