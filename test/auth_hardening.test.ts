import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-auth-red-'));
const originalCwd = process.cwd();
const oldDataDir = process.env.DATA_DIR;
const failures: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

async function main() {
  process.chdir(tempRoot);
  process.env.DATA_DIR = path.join(tempRoot, 'data');
  const { AuthService } = await import('../src/server/auth');
  const { durableStorage } = await import('../src/server/storage');
  durableStorage.setDataDir(path.join(tempRoot, 'data'));
  const source = fs.readFileSync(path.join(repoRoot, 'src/server/auth.ts'), 'utf8');

  const createHarness = () => {
    const service = Object.create(AuthService.prototype) as any;
    const passwordHash = service.hashPassword('test-only-password-123');
    service.users = new Map([['user-1', {
      id: 'user-1', email: 'person@example.invalid', name: 'Test User', role: 'ANALYST',
      status: 'APPROVED', createdAt: new Date().toISOString(), passwordHash,
    }]]);
    service.sessions = new Map();
    service.sessionDurationMs = 24 * 60 * 60 * 1000;
    service.persistUsers = () => {};
    service.persistSessions = () => {};
    return service;
  };

  const legacySalt = crypto.randomBytes(16).toString('hex');
  const legacyKey = crypto.scryptSync('test-only-password-123', legacySalt, 64).toString('hex');
  const probe = createHarness();
  let verifyPromise: unknown;
  try { verifyPromise = probe.verifyPassword('test-only-password-123', `${legacySalt}:${legacyKey}`); }
  catch (error) { failures.push(`password verifier threw: ${error instanceof Error ? error.message : String(error)}`); }
  check(verifyPromise instanceof Promise, 'password verification contract must be asynchronous');
  try {
    const legacyValid = await Promise.resolve(verifyPromise);
    check(legacyValid === true, 'legacy salt:64-byte-scrypt-hash format must remain valid');
  } catch { check(false, 'legacy scrypt hash verification must not reject'); }

  let malformedResult = false;
  try { malformedResult = await Promise.resolve(probe.verifyPassword('x', 'legacy-salt:ff')); }
  catch { malformedResult = false; }
  check(malformedResult === false, 'timingSafeEqual must safely reject unequal-length stored hashes');
  check(!source.includes('Dr. Sarah Lin'), 'default admin bootstrap must not expose fabricated researcher identity');
  check(/process\.env\.ADMIN_NAME/.test(source) && /Administrator/.test(source), 'admin name must use ADMIN_NAME with neutral fallback');
  check(!/Date\.now\(\)\s*-\s*14\s*\*\s*86400000/.test(source), 'bootstrap creation metadata must use the real creation timestamp');

  const registerHarness = createHarness();
  const overlong = await Promise.resolve(registerHarness.register('Test', 'overlong@example.invalid', 'x'.repeat(129)));
  check(!overlong.success, '129-character password must be rejected');
  const shortPassword = await Promise.resolve(registerHarness.register('Test', 'short@example.invalid', 'password10'));
  check(!shortPassword.success, 'password shorter than 12 characters must be rejected');
  const longEmail = await Promise.resolve(registerHarness.register('Test', `${'a'.repeat(250)}@example.invalid`, 'valid-password-123'));
  check(!longEmail.success, 'email longer than 254 characters must be rejected');
  const longName = await Promise.resolve(registerHarness.register('n'.repeat(101), 'longname@example.invalid', 'valid-password-123'));
  check(!longName.success, 'name longer than 100 characters must be rejected');

  const lockHarness = createHarness();
  const origNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  try {
    const knownFailure = await Promise.resolve(lockHarness.login('person@example.invalid', 'wrong-password', '192.0.2.1'));
    const unknownFailure = await Promise.resolve(lockHarness.login('missing@example.invalid', 'wrong-password', '192.0.2.1'));
    check(knownFailure.message === unknownFailure.message, 'known and unknown email failures must use the same generic response');
    for (let i = 1; i < 6; i++) await Promise.resolve(lockHarness.login('person@example.invalid', 'wrong-password', '192.0.2.1'));
    const duringLock = await Promise.resolve(lockHarness.login('person@example.invalid', 'test-only-password-123', '192.0.2.1'));
    check(!duringLock.success, 'correct password must be rejected during the 15-minute lockout after five failures');
    now += 15 * 60 * 1000 + 1;
    const afterExpiry = await Promise.resolve(lockHarness.login('person@example.invalid', 'test-only-password-123', '192.0.2.1'));
    check(afterExpiry.success, 'login must be accepted after the 15-minute lock expires');
  } finally { Date.now = origNow; }

  const sessionHarness = createHarness();
  const originalLoadSessions = durableStorage.loadSessions.bind(durableStorage);
  let diskReads = 0;
  durableStorage.loadSessions = (() => { diskReads++; return []; }) as typeof durableStorage.loadSessions;
  try {
    assert.equal(sessionHarness.getUserByToken('not-a-valid-session-token'), null);
    check(diskReads === 0, 'invalid token lookup must perform zero disk reads');
  } finally { durableStorage.loadSessions = originalLoadSessions; }

  const concurrentHarness = createHarness();
  let timerDelay = Infinity;
  const started = performance.now();
  const timer = new Promise<void>((resolve) => setTimeout(() => { timerDelay = performance.now() - started; resolve(); }, 0));
  const attempts = Array.from({ length: 100 }, () => Promise.resolve().then(() => concurrentHarness.login('person@example.invalid', 'test-only-password-123', '192.0.2.2')));
  await Promise.allSettled(attempts);
  await timer;
  check(timerDelay < 300, `100 concurrent login operations must not starve the event loop timer (observed ${Math.round(timerDelay)}ms)`);

  // A missing/invalid token must not force a session-store read; raw bearer tokens must not be persisted.
  check(!source.includes('this.sessions.set(token, session)') || source.includes('sha256'), 'session persistence must store only a token hash');

  if (failures.length) {
    console.error(`PR-A2 intentional red tests: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`- ${failure}`);
    throw new Error('Authentication hardening red tests failed as expected before implementation.');
  }
  console.log('=== PR-A2 AUTH HARDENING RED TESTS: async password, lockout/rate limits, safe sessions and bootstrap metadata ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  process.chdir(originalCwd);
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
