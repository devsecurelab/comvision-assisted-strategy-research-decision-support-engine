import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AuthService } from '../src/server/auth';

const originalRegistration = process.env.REGISTRATION_ENABLED;
process.env.REGISTRATION_ENABLED = 'true';

function serviceWithEmptyUsers() {
  const service = Object.create(AuthService.prototype) as any;
  service.users = new Map();
  service.sessions = new Map();
  service.registrationRequests = new Map();
  service.globalRegistrationRequest = { count: 0, firstAt: 0 };
  service.ready = Promise.resolve();
  service.persistUsers = () => {};
  service.persistSessions = () => {};
  service.hashPassword = async (password: string) => {
    const salt = crypto.randomBytes(8).toString('hex');
    await new Promise<void>((resolve) => setImmediate(resolve));
    return `${salt}:${Buffer.from(password).toString('hex')}`;
  };
  return service as AuthService & { users: Map<string, any> };
}

try {
  const perIp = serviceWithEmptyUsers() as any;
  for (let i = 0; i < 5; i++) {
    assert.equal((await perIp.register(`User ${i}`, `ip-${i}@example.invalid`, 'password-long', 'ANALYST', undefined, '198.51.100.10')).success, true);
  }
  const sixth = await perIp.register('User 6', 'ip-6@example.invalid', 'password-long', 'ANALYST', undefined, '198.51.100.10');
  assert.equal(sixth.success, false);
  assert.match(sixth.message, /IP|rate limit/i);
  assert.equal(perIp.users.size, 5, 'per-IP rejection must not create a user');

  const global = serviceWithEmptyUsers() as any;
  for (let i = 0; i < 20; i++) {
    const result = await global.register(`Global ${i}`, `global-${i}@example.invalid`, 'password-long', 'ANALYST', undefined, `198.51.100.${i + 1}`);
    assert.equal(result.success, true, `global attempt ${i + 1} should be accepted`);
  }
  const globalRejected = await global.register('Global 21', 'global-21@example.invalid', 'password-long', 'ANALYST', undefined, '203.0.113.21');
  assert.equal(globalRejected.success, false);
  assert.match(globalRejected.message, /global|rate limit/i);
  assert.equal(global.users.size, 20);

  const pending = serviceWithEmptyUsers() as any;
  for (let i = 0; i < 50; i++) {
    pending.users.set(`pending-${i}`, { id: `pending-${i}`, email: `pending-${i}@example.invalid`, status: 'PENDING' });
  }
  const pendingRejected = await pending.register('Pending 51', 'pending-51@example.invalid', 'password-long', 'ANALYST', undefined, '192.0.2.51');
  assert.equal(pendingRejected.success, false);
  assert.match(pendingRejected.message, /pending/i);
  assert.equal(pending.users.size, 50);

  const concurrent = serviceWithEmptyUsers() as any;
  concurrent.consumeRegistrationAttempt = () => null;
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => concurrent.register(`Concurrent ${i}`, `concurrent-${i}@example.invalid`, 'password-long', 'ANALYST', undefined, `198.18.0.${i + 1}`)));
  assert.equal(results.filter((result: any) => result.success).length, 50, 'concurrent registration must enforce the 50-account pending cap atomically');
  assert.equal(concurrent.users.size, 50);

  const disabled = serviceWithEmptyUsers() as any;
  process.env.REGISTRATION_ENABLED = 'false';
  const disabledResult = await disabled.register('Disabled', 'disabled@example.invalid', 'password-long', 'ANALYST', undefined, '198.51.100.90');
  assert.equal(disabledResult.success, false);
  assert.match(disabledResult.message, /disabled/i);
  assert.equal(disabled.users.size, 0);
} finally {
  if (originalRegistration === undefined) delete process.env.REGISTRATION_ENABLED;
  else process.env.REGISTRATION_ENABLED = originalRegistration;
}

console.log('[pr7_registration_security] PASS — registration limits, disabled default, and concurrency cap verified');
