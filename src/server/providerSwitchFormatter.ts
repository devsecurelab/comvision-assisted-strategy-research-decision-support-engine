import type { ProviderCircuitSnapshot, MarketDataProvider } from '../engine/providers/contracts';
import type { ProviderSwitchNotice } from '../engine/scanScheduler';

const PROVIDER_LABEL: Record<MarketDataProvider, string> = {
  TWELVE_DATA: 'Twelve Data',
  OANDA: 'OANDA v20 Practice',
  TIINGO: 'Tiingo FX',
};

export function formatProviderSwitchWarning(notice: ProviderSwitchNotice, circuits: ProviderCircuitSnapshot[]): string {
  const state = (provider: MarketDataProvider) => circuits.find((item) => item.provider === provider)?.state ?? 'UNKNOWN';
  const details = notice.changes.map((change) =>
    `${change.series.join('+')}: ${PROVIDER_LABEL[change.fromProvider]} → ${PROVIDER_LABEL[change.toProvider]} | reason=${change.reason} | circuit ${change.fromProvider}=${state(change.fromProvider)} → ${change.toProvider}=${state(change.toProvider)}`,
  );
  return [
    'PROVIDER_FAILOVER — research alert only',
    `${notice.pair} ${notice.timeframe}`,
    ...details,
    `Changed at: ${notice.changedAt} UTC`,
  ].join('\n');
}
