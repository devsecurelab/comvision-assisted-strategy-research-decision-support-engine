#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function fail(message) {
  process.stderr.write(`TERMUX_PREFLIGHT_FAILED: ${message}\n`);
  process.exit(1);
}

function isTrue(value) {
  return ['true', '1'].includes(String(value ?? '').trim().toLowerCase());
}

function main() {
  const rootArg = process.argv.indexOf('--root');
  if (rootArg < 0 || !process.argv[rootArg + 1]) fail('repository root is required.');
  const root = path.resolve(process.argv[rootArg + 1]);
  const envPath = path.join(root, '.env');
  let fileEnv = {};
  try {
    if (fs.existsSync(envPath)) fileEnv = dotenv.parse(fs.readFileSync(envPath));
  } catch {
    fail('environment file could not be read.');
  }
  const env = { ...fileEnv, ...process.env };
  const host = String(env.HOST || '127.0.0.1').trim();
  const port = String(env.PORT || '3000').trim();
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) fail('PORT must be an integer from 1 to 65535.');
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(host)) fail('HOST is unsupported.');
  if (host === '0.0.0.0' && !isTrue(env.ALLOW_LAN)) fail('HOST=0.0.0.0 requires ALLOW_LAN=true.');
  if (production && String(env.SESSION_SECRET || '').length < 32) fail('production requires SESSION_SECRET of at least 32 characters.');

  const configuredDataDir = String(env.DATA_DIR || '').trim();
  if (!configuredDataDir) fail('DATA_DIR must point to an explicit persistent runtime directory.');
  const dataDir = path.resolve(root, configuredDataDir);
  const configuredLedgerPath = String(env.SIGNAL_LEDGER_PATH || 'signal-ledger.jsonl').trim();
  const ledgerPath = path.isAbsolute(configuredLedgerPath) ? configuredLedgerPath : path.resolve(dataDir, configuredLedgerPath);
  try {
    if (process.argv.includes('--dry-run')) {
      let writableAncestor = dataDir;
      while (!fs.existsSync(writableAncestor)) writableAncestor = path.dirname(writableAncestor);
      fs.accessSync(writableAncestor, fs.constants.R_OK | fs.constants.W_OK);
    } else {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    }
  } catch {
    fail('DATA_DIR must be readable and writable.');
  }

  const requiredFiles = [
    ['build/server.cjs', 'built service is missing; build it before boot.'],
    ['config/sessions.json', 'session configuration is missing.'],
    ['config/market-calendar.json', 'market calendar configuration is missing.'],
  ];
  for (const [relative, message] of requiredFiles) {
    try {
      if (!fs.statSync(path.join(root, relative)).isFile()) fail(message);
    } catch {
      fail(message);
    }
  }
  for (const relative of ['config/sessions.json', 'config/market-calendar.json']) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`${relative} must contain a JSON object.`);
    } catch {
      fail(`${relative} must contain valid JSON.`);
    }
  }

  if (process.argv.includes('--print-data-dir')) {
    process.stdout.write(`${dataDir}\n`);
    return;
  }
  if (process.argv.includes('--print-port')) {
    process.stdout.write(`${port}\n`);
    return;
  }
  if (process.argv.includes('--print-ledger-path')) {
    process.stdout.write(`${ledgerPath}\n`);
    return;
  }
  process.stdout.write('TERMUX_PREFLIGHT_OK\n');
}

try {
  main();
} catch {
  fail('unexpected preflight error.');
}
