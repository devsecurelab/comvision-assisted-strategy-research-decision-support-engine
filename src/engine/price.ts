export function pipSize(pair: string): number {
  return /JPY/i.test(pair.replace('/', '')) ? 0.01 : 0.0001;
}

export function priceTolerance(pair: string, atr14: number, fraction = Number(process.env.PRICE_TOLERANCE_ATR_FRAC || 0.10)): number {
  if (!Number.isFinite(atr14) || atr14 < 0) throw new Error('ATR14 must be a non-negative finite number.');
  if (!Number.isFinite(fraction) || fraction < 0) throw new Error('Price tolerance fraction must be non-negative.');
  return atr14 * fraction;
}

export function tolerancePips(pair: string, tolerance: number): number {
  return tolerance / pipSize(pair);
}

export function slippagePips(pair: string, signalPrice: number, brokerPrice: number): number {
  return Number((Math.abs(brokerPrice - signalPrice) / pipSize(pair)).toFixed(6));
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index); const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
