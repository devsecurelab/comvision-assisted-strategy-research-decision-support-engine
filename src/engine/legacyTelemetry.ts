/**
 * Read-only compatibility access for historical telemetry/outcome aliases.
 *
 * New V3 records must use canonical field names. This helper exists only at
 * read boundaries so archived records remain queryable without allowing a
 * legacy alias to participate in a new engine decision.
 */
const LEGACY_ALIASES: Record<string, readonly string[]> = {
  user_recorded_action: ['userAction'],
  userAction: ['user_recorded_action'],
  signal_outcome: ['outcome'],
  outcome: ['signal_outcome'],
  next_candle_observation: ['nextCandle'],
  nextCandle: ['next_candle_observation'],
  nextCandleOpen: ['next_candle_open'],
  nextCandleClose: ['next_candle_close'],
};

export function readLegacyOptional<T = unknown>(record: unknown, key: string): T | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const source = record as Record<string, unknown>;
  if (source[key] !== undefined) return source[key] as T;
  for (const alias of LEGACY_ALIASES[key] ?? []) {
    if (source[alias] !== undefined) return source[alias] as T;
  }
  return undefined;
}
