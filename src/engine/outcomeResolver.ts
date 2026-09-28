import { NextCandleObservation, StructuralState } from './types';

export type OutcomeBias = 'BULLISH' | 'BEARISH' | 'UNCLEAR';
export type NextCandleInput = { open: number; high: number; low: number; close: number };

export interface ResolvedOutcome {
  outcome: Exclude<NextCandleObservation, 'PENDING'>;
  direction: 'UP' | 'DOWN' | 'FLAT';
  rule: string;
}

/**
 * Authoritative research resolver. The caller-provided WIN/LOSS label is never used.
 * Equality is explicitly NEUTRAL because a flat candle has no directional evidence.
 */
export function resolveNextCandleOutcome(bias: OutcomeBias | StructuralState | undefined, candle: NextCandleInput): ResolvedOutcome {
  const values = [candle.open, candle.high, candle.low, candle.close];
  if (!values.every(Number.isFinite) || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) {
    return {
      outcome: 'NEXT_CANDLE_INCONCLUSIVE',
      direction: 'FLAT',
      rule: 'INVALID_CANDLE_DATA',
    };
  }

  if (candle.close === candle.open) {
    return {
      outcome: 'NEXT_CANDLE_NEUTRAL',
      direction: 'FLAT',
      rule: 'CLOSE_EQUALS_OPEN_NO_DIRECTIONAL_EVIDENCE',
    };
  }

  const direction = candle.close > candle.open ? 'UP' : 'DOWN';
  if (bias === 'BULLISH') {
    return {
      outcome: direction === 'UP' ? 'NEXT_CANDLE_FAVORABLE' : 'NEXT_CANDLE_UNFAVORABLE',
      direction,
      rule: 'BULLISH_SIGNAL_UP_CLOSE_FAVORABLE_DOWN_CLOSE_UNFAVORABLE',
    };
  }
  if (bias === 'BEARISH') {
    return {
      outcome: direction === 'DOWN' ? 'NEXT_CANDLE_FAVORABLE' : 'NEXT_CANDLE_UNFAVORABLE',
      direction,
      rule: 'BEARISH_SIGNAL_DOWN_CLOSE_FAVORABLE_UP_CLOSE_UNFAVORABLE',
    };
  }

  return {
    outcome: 'NEXT_CANDLE_INCONCLUSIVE',
    direction,
    rule: 'UNCLEAR_SIGNAL_BIAS_INCONCLUSIVE',
  };
}
