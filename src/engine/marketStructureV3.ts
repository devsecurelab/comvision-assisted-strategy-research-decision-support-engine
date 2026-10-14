import type { Candle, BprState, FVGZone, IfvgState } from './types';

export interface VolumeWeightedPoc {
  available: boolean;
  price?: number;
  totalVolume: number;
  sampleCount: number;
  reason: string;
}

/** Detects closed three-candle fair-value gaps using body-independent wick boundaries. */
export function detectFvgZones(candles: Candle[]): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < candles.length; i += 1) {
    const left = candles[i - 2];
    const right = candles[i];
    if (right.low > left.high) {
      zones.push({
        bottom: left.high,
        top: right.low,
        creationTimestamp: right.timestamp,
        mitigationState: 'UNMITIGATED',
        direction: 'BULLISH',
      });
    } else if (right.high < left.low) {
      zones.push({
        bottom: right.high,
        top: left.low,
        creationTimestamp: right.timestamp,
        mitigationState: 'UNMITIGATED',
        direction: 'BEARISH',
      });
    }
  }
  return zones;
}

function overlaps(a: FVGZone, b: FVGZone) {
  const bottom = Math.max(a.bottom, b.bottom);
  const top = Math.min(a.top, b.top);
  return { bottom, top, size: Math.max(0, top - bottom) };
}

/**
 * IFVG is confirmed only after a prior FVG is broken by a body close and the
 * flipped zone is subsequently retested in the new direction.
 */
export function evaluateIfvg(candles: Candle[], direction: 'BULLISH' | 'BEARISH'): IfvgState {
  const zones = detectFvgZones(candles);
  const current = candles.at(-1);
  if (!current || zones.length === 0) {
    return { ifvg_status: 'NONE', status: 'REJECT', reason: 'No prior FVG zone available for inversion tracking.' };
  }

  for (let z = zones.length - 1; z >= 0; z -= 1) {
    const zone = zones[z];
    const sourceIndex = candles.findIndex((c) => c.timestamp === zone.creationTimestamp);
    if (sourceIndex < 0 || sourceIndex >= candles.length - 1) continue;
    const breakIndex = candles.findIndex((c, index) => index > sourceIndex && (zone.direction === 'BULLISH' ? c.close < zone.bottom : c.close > zone.top));
    if (breakIndex < 0) continue;
    const flippedDirection = zone.direction === 'BULLISH' ? 'BEARISH' : 'BULLISH';
    if (flippedDirection !== direction) continue;
    const retested = candles.slice(breakIndex + 1).some((c) => c.high >= zone.bottom && c.low <= zone.top);
    const confirmed = retested && (direction === 'BULLISH' ? current.close > zone.top : current.close < zone.bottom);
    if (confirmed) {
      return {
        ifvg_status: 'IFVG_CONFIRMED',
        ifvg_direction: direction,
        invalidation_boundary: direction === 'BULLISH' ? zone.bottom : zone.top,
        original_fvg_zone: [zone.bottom, zone.top],
        confirmation_timestamp: current.timestamp,
        status: 'PASS',
        reason: `${direction} IFVG confirmed after body-close inversion and retest.`,
      };
    }
    return {
      ifvg_status: 'IFVG_CANDIDATE',
      ifvg_direction: direction,
      invalidation_boundary: direction === 'BULLISH' ? zone.bottom : zone.top,
      original_fvg_zone: [zone.bottom, zone.top],
      status: 'INCONCLUSIVE',
      reason: 'FVG inversion detected; retest confirmation is incomplete.',
    };
  }

  const matching = zones.find((zone) => zone.direction === direction);
  return matching
    ? { ifvg_status: 'STANDARD_FVG', ifvg_direction: direction, original_fvg_zone: [matching.bottom, matching.top], status: 'INCONCLUSIVE', reason: 'Standard FVG exists but no inverse body-close flip is confirmed.' }
    : { ifvg_status: 'NONE', status: 'REJECT', reason: 'No qualifying FVG inversion found.' };
}

/** BPR requires a real overlap between opposing, independently detected FVGs. */
export function detectBprFromCandles(candles: Candle[]): BprState {
  const zones = detectFvgZones(candles);
  let best: { bullish: FVGZone; bearish: FVGZone; bottom: number; top: number; size: number } | undefined;
  for (const bullish of zones.filter((zone) => zone.direction === 'BULLISH')) {
    for (const bearish of zones.filter((zone) => zone.direction === 'BEARISH')) {
      const overlap = overlaps(bullish, bearish);
      if (overlap.size > 0 && (!best || overlap.size > best.size)) best = { bullish, bearish, ...overlap };
    }
  }
  if (!best) return { bpr_status: 'NONE', status: 'REJECT', reason: 'No overlapping opposing FVGs detected.' };
  const current = candles.at(-1);
  const active = !!current && current.high >= best.bottom && current.low <= best.top;
  return {
    bpr_status: active ? 'BPR_CONFIRMED' : 'BPR_CANDIDATE',
    bpr_direction: 'BALANCED',
    bpr_zone_high: best.top,
    bpr_zone_low: best.bottom,
    bpr_overlap_size: best.size,
    bpr_source_fvg_1: [best.bullish.bottom, best.bullish.top],
    bpr_source_fvg_2: [best.bearish.bottom, best.bearish.top],
    status: active ? 'PASS' : 'INCONCLUSIVE',
    reason: active ? 'Opposing FVG overlap is active at the evaluated candle.' : 'Opposing FVG overlap exists but is not currently retested.',
  };
}

/** Provider POC is a volume-weighted mean of provider-reported candle POCs. */
export function computeVolumeWeightedPoc(candles: Candle[]): VolumeWeightedPoc {
  if (candles.length === 0) return { available: false, totalVolume: 0, sampleCount: 0, reason: 'No candles supplied.' };
  if (candles.some((c) => c.pocPrice === undefined || c.volume === null || c.volume === undefined)) {
    return { available: false, totalVolume: 0, sampleCount: 0, reason: 'Provider POC and volume are required for every evaluated candle.' };
  }
  const totalVolume = candles.reduce((sum, candle) => sum + (candle.volume as number), 0);
  if (totalVolume <= 0) return { available: false, totalVolume, sampleCount: candles.length, reason: 'Provider volume is zero.' };
  const weightedPrice = candles.reduce((sum, candle) => sum + (candle.pocPrice as number) * (candle.volume as number), 0) / totalVolume;
  return { available: true, price: weightedPrice, totalVolume, sampleCount: candles.length, reason: 'Volume-weighted provider POC confirmed.' };
}
