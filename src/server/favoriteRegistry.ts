import { durableStorage } from './storage';
import { displayPair, isSupportedPair, normalizePair, payoutRegistry } from './payoutRegistry';

export const DEFAULT_FAVORITES = ['EUR/USD', 'GBP/USD', 'AUD/CAD', 'AUD/CHF', 'EUR/GBP', 'AUD/JPY', 'AUD/USD', 'EUR/CHF', 'CAD/CHF'];

export class FavoriteRegistry {
  private key = 'favoritePairs';
  private read(): string[] {
    const settings = durableStorage.loadAppSettings();
    if (Array.isArray(settings[this.key])) return settings[this.key];
    const seeded = DEFAULT_FAVORITES.map(normalizePair);
    durableStorage.saveAppSettings({ ...settings, [this.key]: seeded });
    return seeded;
  }
  private write(pairs: string[]) { durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), [this.key]: pairs }); }
  public all() { return this.read().map((pair) => ({ pair: displayPair(pair), normalized: pair, payout: payoutRegistry.get(pair)?.pct, status: payoutRegistry.status(pair) })); }
  public has(pair: string) { return this.read().includes(normalizePair(pair)); }
  public add(pairInput: string) { const pair = normalizePair(pairInput); if (!isSupportedPair(pair)) throw new Error('UNSUPPORTED_SYMBOL'); const pairs = this.read(); if (!pairs.includes(pair)) { pairs.push(pair); this.write(pairs); return true; } return false; }
  public remove(pairInput: string) { const pair = normalizePair(pairInput); if (!isSupportedPair(pair)) throw new Error('UNSUPPORTED_SYMBOL'); const pairs = this.read(); const next = pairs.filter((value) => value !== pair); this.write(next); return next.length !== pairs.length; }
}
export const favoriteRegistry = new FavoriteRegistry();
