export interface RuntimeConfigInput {
  HOST?: string;
  ALLOW_LAN?: boolean | string;
  NODE_ENV?: string;
  SESSION_SECRET?: string;
  DATA_DIR?: string;
}

export interface ValidatedRuntimeConfig {
  host: string;
  allowLan: boolean;
  dataDir: string;
}

function isTrue(value: boolean | string | undefined): boolean {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true' || String(value ?? '').trim() === '1';
}

export function validateRuntimeConfig(input: RuntimeConfigInput = process.env): ValidatedRuntimeConfig {
  const host = String(input.HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const allowLan = isTrue(input.ALLOW_LAN);
  const production = String(input.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  if (host === '0.0.0.0' && !allowLan) throw new Error('INVALID_RUNTIME_CONFIG: HOST=0.0.0.0 requires ALLOW_LAN=true.');
  if (!['127.0.0.1', 'localhost', '0.0.0.0'].includes(host)) throw new Error(`INVALID_RUNTIME_CONFIG: unsupported HOST=${host}.`);
  if (production && (!input.SESSION_SECRET || input.SESSION_SECRET.length < 32)) throw new Error('INVALID_RUNTIME_CONFIG: production requires SESSION_SECRET of at least 32 characters.');
  const dataDir = String(input.DATA_DIR ?? '').trim();
  if (!dataDir) throw new Error('INVALID_RUNTIME_CONFIG: DATA_DIR is required.');
  return { host, allowLan, dataDir };
}
