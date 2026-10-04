// Live Economic Calendar Guard
// Provider: Trading Economics calendar API (server-side only).
// No synthetic events are used in production. If the provider is unavailable,
// the engine fails safe with NEWS_DATA_UNAVAILABLE.

import { NewsEvent, NewsWindowState } from './types';

type TradingEconomicsEvent = {
  CalendarId?: string | number;
  Date?: string;
  Country?: string;
  Category?: string;
  Event?: string;
  Actual?: string;
  Previous?: string;
  Forecast?: string;
  Importance?: number | string;
  Currency?: string;
};

const PROVIDER_TIMEOUT_MS = 8_000;
const CALENDAR_COUNTRIES = (process.env.ECONOMIC_CALENDAR_COUNTRIES || 'united states,united kingdom,euro area,japan,australia,canada,new zealand,switzerland')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  'united states': 'USD',
  'united kingdom': 'GBP',
  'euro area': 'EUR',
  japan: 'JPY',
  australia: 'AUD',
  canada: 'CAD',
  'new zealand': 'NZD',
  switzerland: 'CHF',
};

function asImpact(value: unknown): NewsEvent['impact'] {
  const importance = Number(value);
  if (importance >= 3) return 'HIGH';
  if (importance === 2) return 'MEDIUM';
  return 'LOW';
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class NewsGuardService {
  private events: NewsEvent[] = [];
  private sourceOnline = false;
  private sourceName = 'UNCONFIGURED_LIVE_CALENDAR';
  private lastCheckedTimestamp = new Date(0).toISOString();
  private lastError: string | undefined;

  public getEvents(): NewsEvent[] {
    return [...this.events];
  }

  public isSourceOnline(): boolean {
    return this.sourceOnline;
  }

  public isOnline(): boolean {
    return this.sourceOnline;
  }

  public getStatus() {
    return {
      sourceOnline: this.sourceOnline,
      sourceName: this.sourceName,
      lastChecked: this.lastCheckedTimestamp,
      lastError: this.lastError,
      eventCount: this.events.length,
      live: this.sourceOnline && this.sourceName === 'TRADING_ECONOMICS',
    };
  }

  /** Fetches a live calendar snapshot. Never falls back to fabricated events. */
  public async refreshFromProvider(): Promise<{ success: boolean; eventCount: number; error?: string }> {
    const apiKey = process.env.TRADING_ECONOMICS_API_KEY?.trim();
    this.lastCheckedTimestamp = new Date().toISOString();
    if (!apiKey) {
      this.events = [];
      this.sourceOnline = false;
      this.sourceName = 'UNCONFIGURED_LIVE_CALENDAR';
      this.lastError = 'TRADING_ECONOMICS_API_KEY is not configured';
      return { success: false, eventCount: 0, error: this.lastError };
    }

    const start = new Date();
    const end = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const countries = encodeURIComponent(CALENDAR_COUNTRIES.join(','));
    const url = `https://api.tradingeconomics.com/calendar/country/${countries}/${from}/${to}?c=${encodeURIComponent(apiKey)}&f=json`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), headers: { Accept: 'application/json' } });
      const body = await response.text();
      if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
      const parsed: unknown = JSON.parse(body);
      if (!Array.isArray(parsed)) throw new Error('provider returned a non-array payload');

      const events = (parsed as TradingEconomicsEvent[])
        .map((item, index): NewsEvent | null => {
          const timestamp = toIso(item.Date);
          if (!timestamp || !item.Event) return null;
          const country = String(item.Country || '').trim().toLowerCase();
          return {
            id: `te-${String(item.CalendarId || `${timestamp}-${index}`)}`,
            title: String(item.Event || item.Category),
            currency: String(item.Currency || CURRENCY_BY_COUNTRY[country] || 'GLOBAL'),
            impact: asImpact(item.Importance),
            timestamp,
            forecast: item.Forecast || undefined,
            previous: item.Previous || undefined,
          };
        })
        .filter((event): event is NewsEvent => event !== null)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      this.events = events;
      this.sourceOnline = true;
      this.sourceName = 'TRADING_ECONOMICS';
      this.lastError = undefined;
      return { success: true, eventCount: events.length };
    } catch (error) {
      this.events = [];
      this.sourceOnline = false;
      this.sourceName = 'TRADING_ECONOMICS';
      this.lastError = error instanceof Error ? error.message : 'live calendar request failed';
      return { success: false, eventCount: 0, error: this.lastError };
    }
  }

  public checkNewsWindow(currentTimestamp: string = new Date().toISOString()): {
    state: NewsWindowState;
    activeEvent?: NewsEvent;
    sourceOnline: boolean;
    lastChecked: string;
    countdownMinutes?: number;
  } {
    this.lastCheckedTimestamp = new Date().toISOString();
    if (!this.sourceOnline) {
      return { state: 'NEWS_DATA_UNAVAILABLE', sourceOnline: false, lastChecked: this.lastCheckedTimestamp };
    }

    const currentTime = new Date(currentTimestamp).getTime();
    const restrictionMs = 30 * 60 * 1000;
    for (const event of this.events) {
      if (event.impact !== 'HIGH') continue;
      const eventTime = new Date(event.timestamp).getTime();
      const diff = Math.abs(currentTime - eventTime);
      if (diff <= restrictionMs) {
        return {
          state: 'ACTIVE',
          activeEvent: event,
          sourceOnline: true,
          lastChecked: this.lastCheckedTimestamp,
          countdownMinutes: Math.ceil(Math.max(0, restrictionMs - (currentTime - eventTime)) / 60000),
        };
      }
    }
    return { state: 'CLEAR', sourceOnline: true, lastChecked: this.lastCheckedTimestamp };
  }
}

export const newsGuard = new NewsGuardService();
