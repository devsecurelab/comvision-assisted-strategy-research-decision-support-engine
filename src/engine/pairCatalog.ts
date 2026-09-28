export const MAJOR_PAIRS = [
  'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CHF','USD/CAD','NZD/USD','EUR/JPY','GBP/JPY','EUR/GBP',
  'EUR/CHF','EUR/CAD','EUR/AUD','EUR/NZD','GBP/CHF','GBP/CAD','GBP/AUD','AUD/JPY','CAD/JPY','CHF/JPY',
] as const;

export const MINOR_CROSS_PAIRS = [
  'GBP/NZD','AUD/CAD','AUD/CHF','AUD/NZD','CAD/CHF','NZD/JPY','NZD/CAD','NZD/CHF','EUR/HKD','GBP/HKD',
  'EUR/SGD','GBP/SGD','AUD/SGD','EUR/SEK','EUR/NOK','GBP/SEK','EUR/TRY','GBP/TRY','EUR/ZAR','GBP/ZAR',
] as const;

export const SUPPORTED_PAIRS = [...MAJOR_PAIRS, ...MINOR_CROSS_PAIRS] as const;
export const DEFAULT_PAIR = 'EUR/USD';

export function normalizePair(value: unknown): string {
  const pair = String(value ?? '').trim().toUpperCase();
  if (!(SUPPORTED_PAIRS as readonly string[]).includes(pair)) {
    throw new Error(`Unsupported symbol '${value}'. Must be one of 40 canonical pairs.`);
  }
  return pair;
}

export function isSupportedPair(value: unknown): value is string {
  const pair = String(value ?? '').trim().toUpperCase();
  return (SUPPORTED_PAIRS as readonly string[]).includes(pair);
}
