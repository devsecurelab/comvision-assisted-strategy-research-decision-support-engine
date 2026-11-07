import crypto from 'node:crypto';

export interface CompactScanSummary {
  scan_id?: string;
  pair: string;
  timeframe: string;
  status: string;
  reason: string;
  signal_id?: string;
  delivered_at: string;
  [key: string]: unknown;
}

export function compactScanSummary(input: CompactScanSummary): CompactScanSummary {
  const { telemetry: _telemetry, candles: _candles, ...summary } = input as CompactScanSummary & { telemetry?: unknown; candles?: unknown };
  return summary;
}

export class ScanSummaryRing {
  private items: CompactScanSummary[] = [];
  constructor(private readonly capacity = 200) {}
  push(summary: CompactScanSummary): void {
    this.items.push(summary);
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }
  values(): CompactScanSummary[] { return [...this.items]; }
}

export function shouldWriteSummary(dataDirBytes: number, capBytes = 50 * 1024 * 1024): boolean {
  return Number.isFinite(dataDirBytes) && dataDirBytes < capBytes;
}

export async function uploadWithBackoff<T>(fn: () => Promise<T>, options: { baseDelayMs?: number; maxAttempts?: number } = {}): Promise<{ value?: T; attempts: number; error?: Error }> {
  const base = options.baseDelayMs ?? 1_000;
  const max = options.maxAttempts ?? 3;
  let last: Error | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    try { return { value: await fn(), attempts: attempt }; }
    catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      if (attempt < max) await new Promise((resolve) => setTimeout(resolve, base * 2 ** (attempt - 1)));
    }
  }
  return { attempts: max, error: last };
}

export function uploadIdFor(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
export function isUploadIdempotent(seen: Set<string>, id: string): boolean { return seen.has(id); }
