import fs from 'node:fs';
import path from 'node:path';
import { validateRuntimeConfig } from './runtimeConfig';
import { validateDataDirectory } from './runtimeSelfCheck';

function findApplicationRoot(): string {
  const starts = [process.env.APP_ROOT, process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : undefined, process.cwd()]
    .filter((value): value is string => Boolean(value));
  for (const start of starts) {
    let current = path.resolve(start);
    for (let depth = 0; depth < 7; depth++) {
      if (fs.existsSync(path.join(current, 'config', 'sessions.json')) && fs.existsSync(path.join(current, 'config', 'market-calendar.json'))) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error('APPLICATION_ROOT_UNAVAILABLE: run from a repository containing config files.');
}

const appRoot = findApplicationRoot();
process.env.APP_ROOT = appRoot;
if (process.env.DATA_DIR && !path.isAbsolute(process.env.DATA_DIR)) process.env.DATA_DIR = path.resolve(appRoot, process.env.DATA_DIR);
for (const [key, relativeDefault] of [['SESSION_CONFIG_PATH', 'config/sessions.json'], ['MARKET_CALENDAR_PATH', 'config/market-calendar.json']] as const) {
  const configured = String(process.env[key] || relativeDefault).trim();
  process.env[key] = path.isAbsolute(configured) ? configured : path.resolve(appRoot, configured);
}
const dateStr = new Date().toISOString().split('T')[0];
const defaultLedger = process.env.DATA_DIR ? require('path').join(process.env.DATA_DIR, 'ledger', `${dateStr}.jsonl`) : `ledger/${dateStr}.jsonl`;
const ledgerPath = String(process.env.SIGNAL_LEDGER_PATH || defaultLedger).trim();
process.env.SIGNAL_LEDGER_PATH = path.isAbsolute(ledgerPath) ? ledgerPath : path.resolve(process.env.DATA_DIR || appRoot, ledgerPath);

const runtime = validateRuntimeConfig(process.env);
validateDataDirectory(runtime.dataDir);
