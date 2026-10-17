import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import { SignalLedger } from '../src/engine/signalLedger';
import { NotificationService } from '../src/server/notificationService';
import { idealPriceOnlySetup, htfCandlesFor, SIGNAL_TS } from './fixtures/v3Reachability';
import type { MasterTelemetry } from '../src/engine/types';

const root = process.cwd();
const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const publicApiAllowlist = new Set(['/api/auth/register', '/api/auth/login', '/api/*']);
const routeLines = serverSource.split('\n').filter((line) => /^app\.(get|post|put|patch|delete|all)\(/.test(line));
const apiRoutes = routeLines.flatMap((line) => [...line.matchAll(/['"](\/api\/[^'"]+)['"]/g)].map((match) => ({ path: match[1], line })));
for (const route of apiRoutes) {
  if (!publicApiAllowlist.has(route.path)) {
    assert.match(route.line, /authenticateToken|requireApprovedUser|requireAdmin/, `API route ${route.path} must use authentication/authorization middleware`);
  }
}
assert.doesNotMatch(serverSource, /req\.query\.token|query\.token/);
assert.match(serverSource, /allowedOrigins\.includes\(origin\)/);
assert.doesNotMatch(serverSource, /endsWith\('\.run\.app'\)|startsWith\('http:\/\/localhost:/);
assert.match(serverSource, /app\.all\('\/api\/\*'[\s\S]*?res\.status\(404\)/);
assert.match(serverSource, /if \(\/\\\.zip\$\/i\.test\(req\.path\)\) return res\.status\(404\)/);
for (const retired of ['/api/engine/download-package', '/api/engine/package-info', '/comvision-engine-v2.0-package.zip']) {
  assert.equal(serverSource.includes(retired), false, `retired package route remains: ${retired}`);
}
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
assert.equal(tracked.some((file) => /\.zip$/i.test(file) || /comvision.*package/i.test(file)), false, 'tracked archive/package artifact remains');
for (const folder of ['public', 'dist', 'protected_storage']) {
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) continue;
  const archives = fs.readdirSync(dir, { recursive: true }).filter((name) => /\.zip$/i.test(String(name)) || /comvision.*package/i.test(String(name)));
  assert.deepEqual(archives, [], `${folder} contains a public package archive`);
}

const fixtureCandles = idealPriceOnlySetup(1.085, '15m', 'BULLISH', SIGNAL_TS);
const telemetry = executeStrategyPipeline({
  decisionEngineVersion: 'V3', candles: fixtureCandles, currentCandleIndex: fixtureCandles.length - 1,
  selectedTimeframe: '15m', htfCandles: htfCandlesFor('BULLISH', new Date(Date.parse(SIGNAL_TS) + 900_000).toISOString()),
  newsEvents: [], newsSourceOnline: true, dataProvenance: 'LIVE_INGESTED', provider: 'TWELVE_DATA',
  pair: 'EUR/USD', asset: 'EUR/USD', payoutPct: 90, nowMs: Date.parse(fixtureCandles.at(-1)!.timestamp) + 900_000,
});
assert.equal(telemetry.decision_engine_v3?.binarySignal, 'CALL', 'the positive alert fixture must reach a signal');
assert.equal(telemetry.pressure_observation.classification, 'UNAVAILABLE');
assert.equal(telemetry.pressure_observation.magnitude, 'UNAVAILABLE');
assert.equal(telemetry.pressure_observation.consistency, 'UNAVAILABLE');
assert.equal(telemetry.pressure_observation.speedPxPerSec, undefined);
assert.equal(telemetry.guardrails.news_guard.news_source, 'NOT_CHECKED (manual)');
const positiveDecision = telemetry.decision_engine_v3!;
assert.match(positiveDecision.statusReason, /NEWS: NOT CHECKED \(manual\)/);
assert.doesNotMatch(JSON.stringify(positiveDecision), /news guard clear|News clear\./i);
const notifications = new NotificationService();
const positiveAlert = notifications.formatSignalAlert(telemetry);
assert.match(positiveAlert, /NEWS: NOT CHECKED \(manual\)/);
assert.match(positiveAlert, /MFCI \(confluence score, not probability\)/);
assert.doesNotMatch(positiveAlert, /news[^\n]*clear/i);
assert.doesNotMatch(positiveAlert, /News guard:\s*PASS/i);
const noTradeTelemetry = { ...telemetry, decision_engine_v3: { ...telemetry.decision_engine_v3!, binarySignal: 'NO_TRADE' } } as MasterTelemetry;
const noTradeAlert = notifications.formatSignalAlert(noTradeTelemetry);
assert.match(noTradeAlert, /NEWS: NOT CHECKED \(manual\)/);

async function verifyLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-pr-a-ledger-'));
  try {
    const ledger = new SignalLedger(path.join(dir, 'signals.jsonl'));
    const started = '2026-10-14T10:00:00.000Z';
    ledger.recordScan({ scan_id: 'test-scan', pair: 'EUR/USD', timeframe: '15m', trigger: 'MANUAL', status: 'NO_TRADE', reason: 'SIGNAL_EXPIRED', scan_started_at: started, candle_available_at: '2026-10-14T10:00:01.000Z', delivered_at: '2026-10-14T10:00:02.000Z' });
    assert.equal(ledger.expiredScanCount(), 1);
    assert.deepEqual(ledger.scanEntries()[0], { scan_id: 'test-scan', pair: 'EUR/USD', timeframe: '15m', trigger: 'MANUAL', status: 'NO_TRADE', reason: 'SIGNAL_EXPIRED', scan_started_at: started, candle_available_at: '2026-10-14T10:00:01.000Z', delivered_at: '2026-10-14T10:00:02.000Z' });
    ledger.recordSignal({ signal_id: 'SIG-TEST', pair: 'EUR/USD', timeframe: '15m', direction: 'CALL', signal_candle_open_ts: started, entry_ts: '2026-10-14T10:15:00.000Z', expiry_ts: '2026-10-14T10:30:00.000Z', valid_until: '2026-10-14T10:15:10.000Z', payout_pct: 90, breakeven: 52.63, mfci_total: 0.9, mfci_band: 'ABOVE_THRESHOLD', engine_mode: 'PRICE_ONLY', provider: 'TWELVE_DATA', setup_id: 'setup-test', experiment_id: 'experiment-test' });
    ledger.recordResult({ signal_id: 'SIG-TEST', outcome: 'WIN', source: 'AUTO_PROVIDER' });
    ledger.recordResult({ signal_id: 'SIG-TEST', outcome: 'LOSS', source: 'TELEGRAM_MANUAL' });
    const signal = ledger.get('SIG-TEST')!;
    assert.equal(signal.provider_outcome, 'WIN');
    assert.equal(signal.broker_outcome, 'LOSS');
    assert.equal(ledger.verify().ok, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function verifyHttpAuthAndLegacy404() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-pr-a-server-'));
  const dataDir = path.join(temp, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const adminPassword = randomBytes(24).toString('hex');
  const sessionSecret = randomBytes(32).toString('hex');
  const cli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [cli, path.join(root, 'server.ts'), '--port', String(port)], {
    cwd: temp,
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, SIGNAL_LEDGER_PATH: path.join(dataDir, 'ledger.jsonl'), ADMIN_BOOTSTRAP_PASSWORD: adminPassword, SESSION_SECRET: sessionSecret, CORS_ALLOWED_ORIGINS: 'http://allowed.example', TELEGRAM_COMMAND_POLLING: 'false', AUTO_SCAN_ENABLED: 'false' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const base = `http://127.0.0.1:${port}`;
  const request = (route: string, init?: RequestInit) => fetch(`${base}${route}`, init);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('The isolated test server exited before readiness.');
      try { await request('/api/engine/status'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.equal(ready, true, 'isolated server must become available');
    assert.equal((await request('/api/engine/status')).status, 401, 'missing Authorization bearer must be 401');
    assert.equal((await request('/api/engine/status', { headers: { Authorization: 'Bearer invalid-test-token' } })).status, 401, 'invalid bearer must be 401');
    assert.equal((await request('/api/engine/status?token=invalid-test-token')).status, 401, 'query-string token must not authenticate');
    assert.equal((await request('/api/engine/status', { headers: { Origin: 'http://allowed.example' } })).headers.get('access-control-allow-origin'), 'http://allowed.example');
    assert.equal((await request('/api/engine/status', { headers: { Origin: 'https://attacker.run.app' } })).headers.get('access-control-allow-origin'), null);

    const pendingPassword = randomBytes(20).toString('hex');
    const registration = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pending Owner-Test', email: 'pending-owner-test@example.invalid', password: pendingPassword }) });
    assert.equal(registration.status, 201);
    const pendingLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'pending-owner-test@example.invalid', password: pendingPassword }) });
    assert.equal(pendingLogin.status, 403, 'PENDING users receive forbidden on login');
    const adminLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@devsecure.engine', password: adminPassword }) });
    assert.equal(adminLogin.status, 200, 'isolated bootstrap admin can log in');
    const sessionToken = (await adminLogin.json()).token as string;
    assert.equal(typeof sessionToken, 'string');
    assert.equal((await request('/api/engine/status', { headers: { Authorization: `Bearer ${sessionToken}` } })).status, 200);
    assert.equal((await request(`/api/engine/status?token=${encodeURIComponent(sessionToken)}`)).status, 401, 'even a valid token in the query string is rejected');
    assert.equal((await request('/api/engine/download-package')).status, 404);
    assert.equal((await request('/api/engine/package-info')).status, 404);
    assert.equal((await request('/comvision-engine-v2.0-package.zip')).status, 404);
    assert.equal((await request('/api/not-a-real-route')).status, 404);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 2_000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function main() {
  await verifyLedger();
  await verifyHttpAuthAndLegacy404();
  console.log('[pr_a_owner_regressions] PASS');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
