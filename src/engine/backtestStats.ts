export interface ConfidenceStats { n: number; wins: number; winRate: number | null; wilsonLow: number | null; wilsonHigh: number | null; }
export function wilsonInterval(wins: number, n: number, z = 1.96): [number, number] | null {
  if (n <= 0) return null;
  const p = wins / n; const denominator = 1 + z * z / n; const centre = (p + z * z / (2 * n)) / denominator; const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}
export function confidenceByMfci(records: Array<{ mfci: number; favorable: boolean }>): Record<string, ConfidenceStats> {
  const bands: Record<string, [number, number]> = { '0.85-0.90': [0.85, 0.90], '0.90-0.95': [0.90, 0.95], '0.95-1.00': [0.95, 1.000001] };
  return Object.fromEntries(Object.entries(bands).map(([name, [low, high]]) => { const rows = records.filter((r) => r.mfci >= low && r.mfci < high); const wins = rows.filter((r) => r.favorable).length; const interval = wilsonInterval(wins, rows.length); return [name, { n: rows.length, wins, winRate: rows.length >= 30 ? wins / rows.length : null, wilsonLow: rows.length >= 30 && interval ? interval[0] : null, wilsonHigh: rows.length >= 30 && interval ? interval[1] : null }]; }));
}
export function verdict(wins: number, n: number, payoutPct: number): 'ABOVE' | 'BELOW' | 'INCONCLUSIVE' {
  if (n < 200) return 'INCONCLUSIVE'; const interval = wilsonInterval(wins, n); if (!interval) return 'INCONCLUSIVE'; const breakeven = 1 / (1 + payoutPct / 100); return interval[0] > breakeven ? 'ABOVE' : interval[1] < breakeven ? 'BELOW' : 'INCONCLUSIVE';
}
