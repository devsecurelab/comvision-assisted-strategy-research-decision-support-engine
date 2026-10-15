import { durableStorage } from './storage';

export const FAVORITE_SYMBOLS = ['EUR/USD', 'GBP/USD', 'AUD/CAD', 'AUD/CHF', 'EUR/GBP', 'AUD/JPY', 'AUD/USD', 'EUR/CHF', 'CAD/CHF'] as const;
const SYMBOL_RE = /^[A-Z]{6}$/;

export interface PayoutRecord { pct: number; setAt: string; source: 'TELEGRAM_MANUAL'; }
export type PayoutStatus = 'PAYOUT_UNSET' | 'PAYOUT_BELOW_MIN' | 'ELIGIBLE';

export function normalizePair(input: string): string {
  return String(input).replace('/', '').replace(/\s+/g, '').toUpperCase();
}

export function displayPair(input: string): string {
  const normalized = normalizePair(input);
  return normalized.length === 6 ? `${normalized.slice(0, 3)}/${normalized.slice(3)}` : normalized;
}

export function isSupportedPair(input: string): boolean {
  return SYMBOL_RE.test(normalizePair(input));
}

export class PayoutRegistry {
  private readonly settingsKey = 'ownerPayouts';
  private read(): Record<string, PayoutRecord> { return durableStorage.loadAppSettings()[this.settingsKey] || {}; }
  private write(records: Record<string, PayoutRecord>) { durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), [this.settingsKey]: records }); }

  public set(pairInput: string, pct: number): PayoutRecord {
    const pair = normalizePair(pairInput);
    if (!isSupportedPair(pair)) throw new Error('UNSUPPORTED_SYMBOL');
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) throw new Error('INVALID_PAYOUT');
    const record: PayoutRecord = { pct, setAt: new Date().toISOString(), source: 'TELEGRAM_MANUAL' };
    const records = this.read(); records[pair] = record; this.write(records); return record;
  }

  public clear(pairInput: string): boolean {
    const pair = normalizePair(pairInput); if (!isSupportedPair(pair)) throw new Error('UNSUPPORTED_SYMBOL');
    const records = this.read(); const existed = Boolean(records[pair]); delete records[pair]; this.write(records); return existed;
  }

  public get(pairInput: string): PayoutRecord | undefined { return this.read()[normalizePair(pairInput)]; }
  public status(pairInput: string): PayoutStatus { const value = this.get(pairInput)?.pct; return value === undefined ? 'PAYOUT_UNSET' : value < 85 ? 'PAYOUT_BELOW_MIN' : 'ELIGIBLE'; }
  public eligible(pairInput: string): boolean { return this.status(pairInput) === 'ELIGIBLE'; }
  public all(): Record<string, PayoutRecord> { return this.read(); }
}

export const payoutRegistry = new PayoutRegistry();
