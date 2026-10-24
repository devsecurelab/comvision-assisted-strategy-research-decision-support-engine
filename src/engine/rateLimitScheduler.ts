import { durableStorage } from '../server/storage';

export interface SchedulerConfig { perMinute?: number; perDay?: number; perHour?: number; autoDailyBudget?: number; hardStopDaily?: number; minimumIntervalMs?: number; storageKey?: string; }
export interface ConsumeResult { allowed: boolean; reason: 'OK' | 'MINUTE_LIMIT' | 'HOUR_LIMIT' | 'MIN_INTERVAL' | 'DAY_LIMIT' | 'DAY_HARD_STOP' | 'AUTO_BUDGET_LIMIT'; minuteUsed: number; dayUsed: number; }

interface State { dayUtc: string; minuteStartedAt: number; minuteUsed: number; dayUsed: number; autoUsed: number; hourStartedAt?: number; hourUsed?: number; lastRequestAt?: number; }

export class RateLimitScheduler {
  private readonly perMinute: number;
  private readonly perDay: number;
  private readonly autoDailyBudget: number;
  /** Hard stop at 80% of daily capacity; auto-scans may use at most 70%. */
  private readonly hardStopDaily: number;
  private readonly perHour?: number;
  private readonly minimumIntervalMs: number;
  private readonly key: string;
  private reservationQueue: Promise<void> = Promise.resolve();
  private lastReservationCompletedAt?: number;
  constructor(config: SchedulerConfig = {}) {
    this.perMinute = config.perMinute ?? Number(process.env.TD_PER_MIN || 8);
    this.perDay = config.perDay ?? Number(process.env.TD_PER_DAY || 800);
    this.perHour = config.perHour;
    this.autoDailyBudget = config.autoDailyBudget ?? Math.floor(this.perDay * 0.7);
    this.hardStopDaily = config.hardStopDaily ?? Math.floor(this.perDay * 0.8);
    this.minimumIntervalMs = config.minimumIntervalMs ?? 0;
    this.key = config.storageKey || 'rateLimitScheduler';
  }
  private state(): State {
    const saved = durableStorage.loadAppSettings()[this.key] as State | undefined;
    const now = Date.now(); const dayUtc = new Date(now).toISOString().slice(0, 10);
    const hourStartedAt = Math.floor(now / 3_600_000) * 3_600_000;
    if (!saved || saved.dayUtc !== dayUtc) return { dayUtc, minuteStartedAt: now, minuteUsed: 0, dayUsed: 0, autoUsed: 0, hourStartedAt, hourUsed: 0 };
    let current = now - saved.minuteStartedAt >= 60_000 ? { ...saved, minuteStartedAt: now, minuteUsed: 0 } : { ...saved };
    if (current.hourStartedAt === undefined) {
      // Legacy same-day state has no hour anchor; preserve usage conservatively and persist the migration.
      current = { ...current, hourStartedAt, hourUsed: current.hourUsed ?? 0 };
      this.save(current);
    } else if (current.hourStartedAt !== hourStartedAt) {
      current = { ...current, hourStartedAt, hourUsed: 0 };
    }
    return current;
  }
  private save(state: State) { durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), [this.key]: state }); }
  public consume(kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): ConsumeResult {
    const now = Date.now();
    const s = this.state();
    const result = (allowed: boolean, reason: ConsumeResult['reason']): ConsumeResult => ({ allowed, reason, minuteUsed: s.minuteUsed, dayUsed: s.dayUsed });
    if (this.minimumIntervalMs > 0 && s.lastRequestAt !== undefined && now - s.lastRequestAt < this.minimumIntervalMs) return result(false, 'MIN_INTERVAL');
    if (s.minuteUsed >= this.perMinute) return result(false, 'MINUTE_LIMIT');
    if (this.perHour !== undefined && (s.hourUsed ?? 0) >= this.perHour) return result(false, 'HOUR_LIMIT');
    if (s.dayUsed >= this.perDay) return result(false, 'DAY_LIMIT');
    if (s.dayUsed >= this.hardStopDaily) return result(false, 'DAY_HARD_STOP');
    if (kind === 'AUTO' && s.autoUsed >= this.autoDailyBudget) return result(false, 'AUTO_BUDGET_LIMIT');
    s.minuteUsed++; s.hourUsed = (s.hourUsed ?? 0) + 1; s.dayUsed++; s.lastRequestAt = now; if (kind === 'AUTO') s.autoUsed++; this.save(s); return result(true, 'OK');
  }
  /** Serialize reservations and wait for configured spacing rather than bursting concurrent requests. */
  public consumeWhenAvailable(kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<ConsumeResult> {
    const task = this.reservationQueue.then(async () => {
      while (true) {
        if (this.minimumIntervalMs > 0 && this.lastReservationCompletedAt !== undefined) {
          const waitMs = this.minimumIntervalMs - (Date.now() - this.lastReservationCompletedAt);
          if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }
        const result = this.consume(kind);
        if (result.allowed) {
          // Anchor spacing after persistence completes; storage latency must not let queued
          // provider calls bunch together when the persisted timestamp is already stale.
          this.lastReservationCompletedAt = Date.now();
          return result;
        }
        if (result.reason !== 'MIN_INTERVAL') return result;
        const lastRequestAt = Math.max(this.state().lastRequestAt ?? Date.now(), this.lastReservationCompletedAt ?? 0);
        const waitMs = Math.max(1, this.minimumIntervalMs - (Date.now() - lastRequestAt));
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    });
    this.reservationQueue = task.then(() => undefined, () => undefined);
    return task;
  }
  public snapshot() { const s = this.state(); return { ...s, perMinute: this.perMinute, perHour: this.perHour, perDay: this.perDay, minimumIntervalMs: this.minimumIntervalMs, autoDailyBudget: this.autoDailyBudget, hardStopDaily: this.hardStopDaily, remainingDay: Math.max(0, this.hardStopDaily - s.dayUsed), remainingAuto: Math.max(0, this.autoDailyBudget - s.autoUsed) }; }
}
