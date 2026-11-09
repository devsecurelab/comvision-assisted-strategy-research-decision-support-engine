import fs from 'node:fs';
import path from 'node:path';
import { validateRuntimeConfig as validateRuntimeConfigValue, type RuntimeConfigInput } from './runtimeConfig';

export type SelfCheckSeverity = 'BLOCK' | 'DEGRADE';
export type SelfCheckStatus = 'PASS' | 'FAILED' | 'DEGRADED';
export interface SelfCheckResult { ok: boolean; code?: string }
export interface SelfCheck { name: string; severity: SelfCheckSeverity; run: () => SelfCheckResult | Promise<SelfCheckResult> }
export interface SelfCheckEvaluation {
  ok: boolean;
  checks: Record<string, { status: SelfCheckStatus; severity: SelfCheckSeverity; code?: string }>;
  failures: string[];
  degraded: string[];
}

export type OperationalBootCheckName = 'runtime_config' | 'session_config' | 'market_calendar' | 'broker_offset' | 'data_directory' | 'signal_ledger' | 'repository_identity' | 'repository_visibility' | 'provider_price' | 'telegram_probe' | 'clock_drift';
export type OperationalBootCheckRunners = Record<OperationalBootCheckName, SelfCheck['run']>;

/** Named/severity policy is centralized; runners are injectable to test each failure independently. */
export function createOperationalBootChecks(runners: OperationalBootCheckRunners, repositoryIdentityKnown: boolean): SelfCheck[] {
  return [
    { name: 'runtime_config', severity: 'BLOCK', run: runners.runtime_config },
    { name: 'session_config', severity: 'BLOCK', run: runners.session_config },
    { name: 'market_calendar', severity: 'BLOCK', run: runners.market_calendar },
    { name: 'broker_offset', severity: 'BLOCK', run: runners.broker_offset },
    { name: 'data_directory', severity: 'BLOCK', run: runners.data_directory },
    { name: 'signal_ledger', severity: 'BLOCK', run: runners.signal_ledger },
    { name: 'repository_identity', severity: 'DEGRADE', run: runners.repository_identity },
    { name: 'repository_visibility', severity: repositoryIdentityKnown ? 'BLOCK' : 'DEGRADE', run: runners.repository_visibility },
    { name: 'provider_price', severity: 'DEGRADE', run: runners.provider_price },
    { name: 'telegram_probe', severity: 'DEGRADE', run: runners.telegram_probe },
    { name: 'clock_drift', severity: 'DEGRADE', run: runners.clock_drift },
  ];
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
function safeCode(code: unknown, fallback: string): string {
  return typeof code === 'string' && SAFE_CODE.test(code) ? code : fallback;
}

export async function evaluateSelfChecks(checks: SelfCheck[]): Promise<SelfCheckEvaluation> {
  const results: SelfCheckEvaluation['checks'] = {};
  const failures: string[] = [];
  const degraded: string[] = [];
  for (const check of checks) {
    let result: SelfCheckResult;
    try { result = await check.run(); }
    catch (error) {
      const candidate = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
      result = { ok: false, code: safeCode(candidate, `${check.name.toUpperCase()}_FAILED`) };
    }
    if (result.ok) {
      results[check.name] = { status: 'PASS', severity: check.severity };
      continue;
    }
    const code = safeCode(result.code, `${check.name.toUpperCase()}_FAILED`);
    const status = check.severity === 'BLOCK' ? 'FAILED' : 'DEGRADED';
    results[check.name] = { status, severity: check.severity, code };
    (check.severity === 'BLOCK' ? failures : degraded).push(`${check.name}: ${code}`);
  }
  return { ok: failures.length === 0, checks: results, failures, degraded };
}

/** Chosen bootstrap policy: non-test environments must supply an explicit password; tests may use an ephemeral random value. */
export function enforceBootstrapPasswordPolicy(password: string | undefined, nodeEnv = process.env.NODE_ENV): string {
  const value = String(password ?? '').trim();
  if (value.length >= 12) return value;
  if (String(nodeEnv ?? '').toLowerCase() === 'test') return '';
  throw new Error('BOOTSTRAP_PASSWORD_REQUIRED: set ADMIN_BOOTSTRAP_PASSWORD (at least 12 characters) before startup.');
}

/** Removes legacy plaintext bootstrap material from exactly the configured data directory. */
export function removeLegacyBootstrapFile(dataDir: string): boolean {
  if (!dataDir || !path.isAbsolute(dataDir)) throw new Error('BOOTSTRAP_MIGRATION_FAILED: DATA_DIR must be an absolute configured path.');
  const legacyPath = path.join(dataDir, '.admin_bootstrap_secret');
  if (!fs.existsSync(legacyPath)) return false;
  try {
    fs.rmSync(legacyPath, { force: true });
    if (fs.existsSync(legacyPath)) throw new Error('remove did not remove file');
    return true;
  } catch {
    throw new Error('BOOTSTRAP_MIGRATION_FAILED: unable to remove legacy bootstrap file from DATA_DIR.');
  }
}

export function validateDataDirectory(dataDir: string, minFreeBytes = 10 * 1024 * 1024): { ok: true } {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    if (typeof fs.statfsSync === 'function') {
      const disk = fs.statfsSync(dataDir);
      if (disk.bavail * disk.bsize < minFreeBytes) throw new Error('low disk capacity');
    }
    return { ok: true };
  } catch {
    throw new Error('DATA_DIRECTORY_UNAVAILABLE: DATA_DIR must be readable, writable, and have at least 10 MB free.');
  }
}

export function validateRuntime(config: RuntimeConfigInput = process.env): { ok: true } {
  const validated = validateRuntimeConfigValue(config);
  validateDataDirectory(validated.dataDir);
  return { ok: true };
}

export { validateRuntimeConfigValue as validateRuntimeConfig };

/** Synchronous, secret-free lightweight status for diagnostics; full boot checks are composed separately. */
export function runStartupSelfCheck(config: RuntimeConfigInput = process.env): { ok: boolean; failures: string[]; checks: Record<string, SelfCheckStatus> } {
  try {
    validateRuntime(config);
    return { ok: true, failures: [], checks: { runtime_config: 'PASS', data_directory: 'PASS' } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RUNTIME_CHECK_FAILED';
    const code = message.split(':')[0].replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'RUNTIME_CHECK_FAILED';
    return { ok: false, failures: [code], checks: { runtime_config: 'FAILED' } };
  }
}
