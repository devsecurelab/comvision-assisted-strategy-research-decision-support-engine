import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pr7-termux-'));
const appRoot = path.join(tempRoot, 'app');
const fakeBin = path.join(tempRoot, 'fake-bin');
const dataDir = path.join(tempRoot, 'persisted-data');
const secret = 'test-only-never-print-this-session-secret-0123456789';
fs.mkdirSync(path.join(appRoot, 'scripts', 'termux'), { recursive: true });
fs.mkdirSync(path.join(appRoot, 'config'), { recursive: true });
fs.mkdirSync(path.join(appRoot, 'build'), { recursive: true });
fs.mkdirSync(fakeBin, { recursive: true });
for (const file of ['boot.sh', 'health.sh', 'preflight.cjs']) {
  fs.copyFileSync(path.join(repoRoot, 'scripts', 'termux', file), path.join(appRoot, 'scripts', 'termux', file));
}
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(appRoot, 'node_modules'), 'dir');
fs.writeFileSync(path.join(appRoot, 'build', 'server.cjs'), '// fake fixture; never executed by node');
fs.writeFileSync(path.join(appRoot, 'config', 'sessions.json'), JSON.stringify({ zones: {} }));
fs.writeFileSync(path.join(appRoot, 'config', 'market-calendar.json'), JSON.stringify({ timezone: 'UTC' }));
fs.writeFileSync(path.join(appRoot, '.env'), [
  'NODE_ENV=production',
  `SESSION_SECRET=${secret}`,
  `DATA_DIR=${dataDir}`,
  'HOST=127.0.0.1',
].join('\n'));

const commandPath = (name: string) => path.join(fakeBin, name);
const lockMarker = path.join(tempRoot, 'wake-lock.called');
const launchMarker = path.join(tempRoot, 'service-launch.called');
fs.writeFileSync(commandPath('termux-wake-lock'), `#!/bin/sh\nprintf locked > '${lockMarker}'\n`);
fs.chmodSync(commandPath('termux-wake-lock'), 0o755);
const realPath = process.env.PATH || '/usr/bin:/bin';
fs.writeFileSync(commandPath('node'), [
  '#!/bin/sh',
  'case "${1:-}" in',
  '  build/server.cjs|*/build/server.cjs) printf launched > "${TERMUX_TEST_LAUNCH_MARKER}"; exec sleep 120 ;;',
  `  *) exec '${process.execPath}' "$@" ;;`,
  'esac',
  '',
].join('\n'));
fs.chmodSync(commandPath('node'), 0o755);
fs.writeFileSync(commandPath('curl'), '#!/bin/sh\nexit 0\n');
fs.chmodSync(commandPath('curl'), 0o755);

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(command, args, {
    cwd: appRoot,
    encoding: 'utf8',
    timeout: 8_000,
    env: {
      ...process.env,
      ...env,
      PATH: `${fakeBin}:${realPath}`,
      TERMUX_TEST_LAUNCH_MARKER: launchMarker,
    },
  });
}

const dryRun = run('/bin/bash', ['scripts/termux/boot.sh'], { TERMUX_DRY_RUN: '1' });
assert.equal(dryRun.status, 0, dryRun.stderr);
assert.match(dryRun.stdout, /TERMUX_DRY_RUN_OK/);
assert.doesNotMatch(`${dryRun.stdout}\n${dryRun.stderr}`, new RegExp(secret));
assert.equal(fs.existsSync(lockMarker), false, 'dry-run must not acquire a wake lock');
assert.equal(fs.existsSync(launchMarker), false, 'dry-run must not launch the service');
assert.equal(fs.existsSync(dataDir), false, 'dry-run preflight must not create or mutate DATA_DIR');

const preflight = run(process.execPath, [path.join(appRoot, 'scripts/termux/preflight.cjs'), '--root', appRoot]);
assert.equal(preflight.status, 0, preflight.stderr);
assert.match(preflight.stdout, /TERMUX_PREFLIGHT_OK/);
assert.doesNotMatch(`${preflight.stdout}\n${preflight.stderr}`, new RegExp(secret));
assert.equal(fs.existsSync(dataDir), true, 'normal preflight creates/checks the configured persistent DATA_DIR');
const ledgerPath = run(process.execPath, [path.join(appRoot, 'scripts/termux/preflight.cjs'), '--root', appRoot, '--dry-run', '--print-ledger-path']);
assert.equal(ledgerPath.status, 0, ledgerPath.stderr);
assert.equal(ledgerPath.stdout.trim(), path.join(dataDir, 'signal-ledger.jsonl'), 'default hash ledger follows the persistent runtime directory');

const badEnv = fs.readFileSync(path.join(appRoot, '.env'), 'utf8').replace('HOST=127.0.0.1', 'HOST=0.0.0.0');
fs.writeFileSync(path.join(appRoot, '.env'), badEnv);
const unsafe = run('/bin/bash', ['scripts/termux/boot.sh'], { TERMUX_DRY_RUN: '1' });
assert.notEqual(unsafe.status, 0, 'unsafe host must fail before boot actions');
assert.match(unsafe.stderr, /HOST=0\.0\.0\.0 requires ALLOW_LAN=true/);
assert.doesNotMatch(`${unsafe.stdout}\n${unsafe.stderr}`, new RegExp(secret));
assert.equal(fs.existsSync(lockMarker), false);
assert.equal(fs.existsSync(launchMarker), false);
fs.writeFileSync(path.join(appRoot, '.env'), badEnv.replace('HOST=0.0.0.0', 'HOST=127.0.0.1'));

const boot = run('/bin/bash', ['scripts/termux/boot.sh']);
assert.equal(boot.status, 0, boot.stderr);
assert.match(boot.stdout, /TERMUX_SERVICE_READY/);
assert.equal(fs.readFileSync(lockMarker, 'utf8'), 'locked');
for (let attempt = 0; attempt < 30 && !fs.existsSync(launchMarker); attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
assert.equal(fs.readFileSync(launchMarker, 'utf8'), 'launched', 'boot starts the built service through the fake node command');
const bootOutput = `${boot.stdout}\n${boot.stderr}\n${fs.readFileSync(path.join(dataDir, 'termux', 'service.log'), 'utf8')}`;
assert.doesNotMatch(bootOutput, new RegExp(secret), 'environment secrets must not be printed or copied to the service log by the wrapper');
assert.equal(fs.statSync(path.join(dataDir, 'termux', 'service.pid')).mode & 0o777, 0o600);
process.kill(Number(fs.readFileSync(path.join(dataDir, 'termux', 'service.pid'), 'utf8').trim()), 'SIGTERM');

const curlLog = path.join(tempRoot, 'curl.calls.jsonl');
fs.writeFileSync(commandPath('curl'), [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "fs.appendFileSync(process.env.TERMUX_TEST_CURL_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');",
  '',
].join('\n'));
fs.chmodSync(commandPath('curl'), 0o755);
const noPing = run('/bin/bash', ['scripts/termux/health.sh'], { TERMUX_TEST_CURL_LOG: curlLog });
assert.equal(noPing.status, 0, noPing.stderr);
assert.match(noPing.stdout, /dead-man ping not configured/);
let calls = fs.readFileSync(curlLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
assert.equal(calls.length, 1, 'without an explicit URL only the local health endpoint is queried');
assert.ok(calls[0].some((arg) => arg === 'http://127.0.0.1:3000/health'));

fs.writeFileSync(curlLog, '');
const ping = run('/bin/bash', ['scripts/termux/health.sh'], {
  TERMUX_TEST_CURL_LOG: curlLog,
  TERMUX_DEADMAN_URL: 'https://health.example.invalid/explicit-test-endpoint',
});
assert.equal(ping.status, 0, ping.stderr);
calls = fs.readFileSync(curlLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
assert.equal(calls.length, 2, 'configured helper does one local check and one ping, both intercepted by fake curl');
assert.ok(calls[1].includes('https://health.example.invalid/explicit-test-endpoint'));
assert.ok(calls[1].includes('{"status":"ok"}'), 'dead-man payload is fixed and contains no secrets');
assert.doesNotMatch(JSON.stringify(calls[1]), new RegExp(secret));
const credentialUrl = run('/bin/bash', ['scripts/termux/health.sh'], {
  TERMUX_TEST_CURL_LOG: curlLog,
  TERMUX_DEADMAN_URL: 'https://user:password@health.example.invalid/ping',
});
assert.notEqual(credentialUrl.status, 0, 'credential-bearing ping URL must be rejected');
assert.match(credentialUrl.stderr, /without credentials or query parameters/);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log('[pr7_termux_operations] PASS — preflight, dry-run, fake boot commands, state-dir reuse, and no-secret health ping verified');
