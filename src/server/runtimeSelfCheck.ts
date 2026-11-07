import fs from 'node:fs';

export interface RuntimeConfigInput { SESSION_SECRET?: string; DATA_DIR?: string; NODE_ENV?: string; HOST?: string; }

export function validateRuntimeConfig(config: RuntimeConfigInput = process.env): { ok: true } {
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 16) throw new Error('INVALID_RUNTIME_CONFIG: SESSION_SECRET must be configured with at least 16 characters.');
  if (!config.DATA_DIR) throw new Error('INVALID_RUNTIME_CONFIG: DATA_DIR must be configured.');
  try { fs.mkdirSync(config.DATA_DIR, { recursive: true }); fs.accessSync(config.DATA_DIR, fs.constants.R_OK | fs.constants.W_OK); }
  catch { throw new Error('INVALID_RUNTIME_CONFIG: DATA_DIR must be readable and writable.'); }
  if (config.HOST === '0.0.0.0' && config.NODE_ENV === 'production' && process.env.ALLOW_PUBLIC_BIND !== '1') throw new Error('INVALID_RUNTIME_CONFIG: public production bind requires ALLOW_PUBLIC_BIND=1.');
  return { ok: true };
}

export function runStartupSelfCheck(config: RuntimeConfigInput = process.env): { ok: boolean; failures: string[] } {
  try { validateRuntimeConfig(config); return { ok: true, failures: [] }; }
  catch (error) { return { ok: false, failures: [error instanceof Error ? error.message : String(error)] }; }
}
