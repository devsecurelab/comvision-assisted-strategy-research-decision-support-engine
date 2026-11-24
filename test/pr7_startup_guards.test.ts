import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateRuntimeConfig } from '../src/server/runtimeConfig';
import { createOperationalBootChecks, enforceBootstrapPasswordPolicy, removeLegacyBootstrapFile, evaluateSelfChecks, type OperationalBootCheckName, type OperationalBootCheckRunners } from '../src/server/runtimeSelfCheck';

const base = { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), DATA_DIR: os.tmpdir() };
assert.equal(validateRuntimeConfig(base).host, '127.0.0.1');
assert.equal(validateRuntimeConfig({ ...base, HOST: '0.0.0.0', ALLOW_LAN: 'true' }).host, '0.0.0.0');
assert.throws(() => validateRuntimeConfig({ ...base, HOST: '0.0.0.0' }), /HOST.*ALLOW_LAN.*true/i);
assert.throws(() => validateRuntimeConfig({ ...base, HOST: '192.168.1.20', SESSION_SECRET: 'DO_NOT_PRINT_THIS' }), (error: any) => {
  assert.match(error.message, /HOST/);
  assert.equal(error.message.includes('DO_NOT_PRINT_THIS'), false);
  return true;
});

assert.throws(() => enforceBootstrapPasswordPolicy(undefined, 'production'), /ADMIN_BOOTSTRAP_PASSWORD/);
assert.throws(() => enforceBootstrapPasswordPolicy(undefined, 'development'), /ADMIN_BOOTSTRAP_PASSWORD/);
assert.equal(enforceBootstrapPasswordPolicy('secure-bootstrap-value', 'production'), 'secure-bootstrap-value');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr7-bootstrap-migration-'));
const legacyPath = path.join(dataDir, '.admin_bootstrap_secret');
fs.writeFileSync(legacyPath, 'plaintext-legacy-secret');
assert.equal(removeLegacyBootstrapFile(dataDir), true);
assert.equal(fs.existsSync(legacyPath), false);
assert.equal(removeLegacyBootstrapFile(dataDir), false);

const names: OperationalBootCheckName[] = ['runtime_config', 'session_config', 'market_calendar', 'broker_offset', 'data_directory', 'signal_ledger', 'repository_identity', 'repository_visibility', 'provider_price', 'telegram_probe', 'clock_drift'];
const blocking = new Set<OperationalBootCheckName>(['runtime_config', 'session_config', 'market_calendar', 'broker_offset', 'data_directory', 'signal_ledger', 'repository_visibility']);
for (const failing of names) {
  const runners = Object.fromEntries(names.map((name) => [name, async () => name === failing ? { ok: false, code: `${name.toUpperCase()}_FAILED` } : { ok: true }])) as OperationalBootCheckRunners;
  const checks = createOperationalBootChecks(runners, true);
  const result = await evaluateSelfChecks(checks);
  assert.equal(result.checks[failing].status, blocking.has(failing) ? 'FAILED' : 'DEGRADED');
  assert.equal(result.ok, !blocking.has(failing), `${failing} follows the declared independent block/degrade policy`);
  assert.equal(Object.entries(result.checks).filter(([name, check]) => name !== failing && check.status !== 'PASS').length, 0, `${failing} failure is isolated`);
  assert.equal(JSON.stringify(result).includes('SECRET'), false, 'self-check response must not leak credentials');
}
const unknownRepository = await evaluateSelfChecks(createOperationalBootChecks(Object.fromEntries(names.map((name) => [name, async () => name === 'repository_visibility' ? { ok: false, code: 'REPOSITORY_IDENTITY_UNKNOWN' } : { ok: true }])) as OperationalBootCheckRunners, false));
assert.equal(unknownRepository.ok, true, 'missing repository identity degrades but a verified public repository blocks when identity exists');
assert.equal(unknownRepository.checks.repository_visibility.status, 'DEGRADED');


// --- Concrete Failure Path Tests (Runner-Level) ---

// 1. Concrete missing DATA_DIR in production
assert.throws(
  () => validateRuntimeConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) }),
  /DATA_DIR is required/
);

// 2. Concrete invalid HOST without ALLOW_LAN
assert.throws(
  () => validateRuntimeConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), DATA_DIR: os.tmpdir(), HOST: '0.0.0.0' }),
  /HOST.*ALLOW_LAN.*true/i
);

// 3. Concrete session config validation failure simulation
const sessionRunnerFail = async () => ({ ok: false, code: 'SESSION_CONFIG_INVALID' });
const checksSession = createOperationalBootChecks(
  { ...Object.fromEntries(names.map(n => [n, async () => ({ ok: true })])), session_config: sessionRunnerFail } as OperationalBootCheckRunners, 
  true
);
const resultSession = await evaluateSelfChecks(checksSession);
assert.equal(resultSession.checks.session_config.status, 'FAILED');
assert.equal(resultSession.ok, false, 'Invalid session config must block startup');

// 4. Concrete signal ledger tampered simulation
const ledgerRunnerFail = async () => ({ ok: false, code: 'LEDGER_TAMPERED' });
const checksLedger = createOperationalBootChecks(
  { ...Object.fromEntries(names.map(n => [n, async () => ({ ok: true })])), signal_ledger: ledgerRunnerFail } as OperationalBootCheckRunners, 
  true
);
const resultLedger = await evaluateSelfChecks(checksLedger);
assert.equal(resultLedger.checks.signal_ledger.status, 'FAILED');
assert.equal(resultLedger.ok, false, 'Tampered ledger must block startup');

console.log('[pr7_startup_guards_concrete] PASS — concrete failure paths for runtime, session, and ledger verified');

console.log('[pr7_startup_guards] PASS — fail-closed host/bootstrap/data/ledger/repository/config checks and degradable provider/Telegram/clock checks');
