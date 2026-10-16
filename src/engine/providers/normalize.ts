import type { Candle, Timeframe } from '../types';
import type { MarketDataProvider, NormalizedProviderResult, ProviderCandlePayload } from './contracts';
import { ProviderAdapterError } from './http';

function parseTimestamp(value: unknown, timezone = 'UTC', provider: MarketDataProvider): string {
  if (typeof value !== 'string' || !value.trim()) throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} returned an invalid candle timestamp.`);
  const raw = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  let timestamp: Date;
  if (hasTimezone) {
    timestamp = new Date(raw);
  } else {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (!match) throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} returned an unparsable candle timestamp.`);
    const targetUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
    let candidateUtc = targetUtc;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(candidateUtc)).map((part) => [part.type, part.value]));
      const representedUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      const correction = targetUtc - representedUtc;
      candidateUtc += correction;
      if (!correction) break;
    }
    timestamp = new Date(candidateUtc);
  }
  if (!Number.isFinite(timestamp.getTime())) throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} returned an unparsable candle timestamp.`);
  return timestamp.toISOString();
}

export function normalizeCandles(
  payload: ProviderCandlePayload,
  provider: MarketDataProvider,
  timeframe: Timeframe,
  requireClosed = true,
  nowMs = Date.now(),
): NormalizedProviderResult {
  if (!Array.isArray(payload.rows)) throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} response did not contain a candle array.`);
  const candles: Candle[] = payload.rows.map((row: any) => {
    const open = Number(row?.open ?? row?.['1. open']);
    const high = Number(row?.high ?? row?.['2. high']);
    const low = Number(row?.low ?? row?.['3. low']);
    const close = Number(row?.close ?? row?.['4. close']);
    const volumeValue = row?.volume ?? row?.['5. volume'];
    const volume = volumeValue === undefined || volumeValue === null || volumeValue === '' ? null : Number(volumeValue);
    if (![open, high, low, close].every(Number.isFinite) || (volume !== null && (!Number.isFinite(volume) || volume < 0)) || open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} returned malformed OHLC values.`);
    }
    return {
      timestamp: parseTimestamp(row?.datetime ?? row?.timestamp ?? row?.time ?? row?.date, payload.timezone || 'UTC', provider),
      open, high, low, close, volume,
    };
  });

  candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const intervalMs: Record<Timeframe, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000 };
  const closed = requireClosed ? candles.filter((candle) => Date.parse(candle.timestamp) + intervalMs[timeframe] <= nowMs) : candles;
  const deduplicated = closed.filter((candle, index) => index === 0 || candle.timestamp !== closed[index - 1].timestamp);
  if (deduplicated.length < 25) throw new ProviderAdapterError(provider, 'INSUFFICIENT_HISTORY', `${provider} returned ${deduplicated.length} candles; at least 25 are required.`);
  const hasVolume = deduplicated.some((candle) => typeof candle.volume === 'number');
  return { candles: deduplicated, volumeAvailable: payload.volumeAvailable ?? hasVolume };
}
