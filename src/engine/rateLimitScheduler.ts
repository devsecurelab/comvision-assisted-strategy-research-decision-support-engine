import { durableStorage } from '../server/storage';

export type RequestClass = 'SIGNAL' | 'SCAN' | 'RESOLVE' | 'AUTO' | 'ON_DEMAND';
export interface SchedulerConfig {
  perMinute?: number; perDay?: number; perHour?: number; autoDailyBudget?: number; hardStopDaily?: number;
  minimumIntervalMs?: number; storageKey?: string; now?: () => number;
}
export interface ConsumeResult { allowed: boolean; reason: 'OK' | 'MINUTE_LIMIT' | 'HOUR_LIMIT' | 'MIN_INTERVAL' | 'DAY_LIMIT' | 'DAY_HARD_STOP' | 'AUTO_BUDGET_LIMIT'; minuteUsed: number; dayUsed: number; }
interface State { dayUtc: string; minuteStartedAt: number; minuteUsed: number; dayUsed: number; autoUsed: number; requestTimestamps?: number[]; hourStartedAt?: number; hourUsed?: number; lastRequestAt?: number; }
interface QueueItem { kind: RequestClass; resolve: (result: ConsumeResult) => void; reject: (error: unknown) => void; sequence: number }

const PRIORITY: Record<RequestClass, number> = { SIGNAL: 0, SCAN: 1, RESOLVE: 2, AUTO: 1, ON_DEMAND: 1 };

export class RateLimitScheduler {
  private readonly perMinute: number;
  private readonly perDay: number;
  private readonly autoDailyBudget: number;
  private readonly hardStopDaily: number;
  private readonly perHour?: number;
  private readonly minimumIntervalMs: number;
  private readonly key: string;
  private readonly now: () => number;
  private readonly queue: QueueItem[] = [];
  /** Compatibility gate retained for the existing queue-recovery regression test. */
  private reservationQueue: Promise<void> = Promise.resolve();
  private readonly healthyReservationQueue: Promise<void>;
  private sequence = 0;
  private draining = false;
  private drainScheduled = false;
  private lastReservationCompletedAt?: number;

  constructor(config: SchedulerConfig = {}) {
    this.perMinute = config.perMinute ?? Number(process.env.TWELVE_DATA_CREDITS_PER_MIN || process.env.TD_PER_MIN || 8);
    this.perDay = config.perDay ?? Number(process.env.TWELVE_DATA_CREDITS_PER_DAY || process.env.TD_PER_DAY || 800);
    this.perHour = config.perHour;
    this.autoDailyBudget = config.autoDailyBudget ?? Number(process.env.TWELVE_DATA_AUTO_DAILY_BUDGET || Math.floor(this.perDay * 0.7));
    this.hardStopDaily = config.hardStopDaily ?? Number(process.env.TWELVE_DATA_HARD_STOP_DAILY || Math.floor(this.perDay * 0.8));
    this.minimumIntervalMs = config.minimumIntervalMs ?? 0;
    this.key = config.storageKey || 'rateLimitScheduler';
    this.now = config.now ?? (() => Date.now());
    this.healthyReservationQueue = this.reservationQueue;
  }

  private state(): State {
    const now = this.now(); const dayUtc = new Date(now).toISOString().slice(0, 10);
    const hourStartedAt = Math.floor(now / 3_600_000) * 3_600_000;
    const saved = durableStorage.loadAppSettings()[this.key] as State | undefined;
    if (!saved || saved.dayUtc !== dayUtc) return { dayUtc, minuteStartedAt: now, minuteUsed: 0, dayUsed: 0, autoUsed: 0, requestTimestamps: [], hourStartedAt, hourUsed: 0 };
    let current = { ...saved, requestTimestamps: [...(saved.requestTimestamps ?? [])].filter((ts) => now - ts < 60_000) };
    if (current.hourStartedAt === undefined) current = { ...current, hourStartedAt, hourUsed: current.hourUsed ?? 0 };
    else if (current.hourStartedAt !== hourStartedAt) current = { ...current, hourStartedAt, hourUsed: 0 };
    current.minuteUsed = current.requestTimestamps.length;
    current.minuteStartedAt = current.requestTimestamps[0] ?? now;
    return current;
  }

  private save(state: State) { durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), [this.key]: state }); }

  public consume(kind: RequestClass = 'ON_DEMAND'): ConsumeResult {
    const now = this.now(); const s = this.state();
    const result = (allowed: boolean, reason: ConsumeResult['reason']): ConsumeResult => ({ allowed, reason, minuteUsed: s.requestTimestamps?.length ?? 0, dayUsed: s.dayUsed });
    if (this.minimumIntervalMs > 0 && s.lastRequestAt !== undefined && now - s.lastRequestAt < this.minimumIntervalMs) return result(false, 'MIN_INTERVAL');
    if ((s.requestTimestamps?.length ?? 0) >= this.perMinute) return result(false, 'MINUTE_LIMIT');
    if (this.perHour !== undefined && (s.hourUsed ?? 0) >= this.perHour) return result(false, 'HOUR_LIMIT');
    if (s.dayUsed >= this.perDay) return result(false, 'DAY_LIMIT');
    if (s.dayUsed >= this.hardStopDaily) return result(false, 'DAY_HARD_STOP');
    if (kind === 'AUTO' && s.autoUsed >= this.autoDailyBudget) return result(false, 'AUTO_BUDGET_LIMIT');
    s.requestTimestamps = [...(s.requestTimestamps ?? []), now];
    s.minuteUsed = s.requestTimestamps.length; s.hourUsed = (s.hourUsed ?? 0) + 1; s.dayUsed++; s.lastRequestAt = now;
    if (kind === 'AUTO') s.autoUsed++;
    this.save(s);
    return result(true, 'OK');
  }

  public consumeWhenAvailable(kind: RequestClass = 'ON_DEMAND'): Promise<ConsumeResult> {
    if (this.reservationQueue !== this.healthyReservationQueue) {
      const gate = this.reservationQueue;
      this.reservationQueue = this.healthyReservationQueue;
      return new Promise<ConsumeResult>((resolve, reject) => gate.then(() => {
        this.queue.push({ kind, resolve, reject, sequence: this.sequence++ });
        if (!this.drainScheduled) { this.drainScheduled = true; queueMicrotask(() => { this.drainScheduled = false; void this.drain(); }); }
      }, reject));
    }
    return new Promise<ConsumeResult>((resolve, reject) => {
      this.queue.push({ kind, resolve, reject, sequence: this.sequence++ });
      if (!this.drainScheduled) { this.drainScheduled = true; queueMicrotask(() => { this.drainScheduled = false; void this.drain(); }); }
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        this.queue.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.sequence - b.sequence);
        const item = this.queue.shift()!;
        try {
          while (true) {
            if (this.minimumIntervalMs > 0 && this.lastReservationCompletedAt !== undefined) {
              const waitMs = this.minimumIntervalMs - (this.now() - this.lastReservationCompletedAt);
              if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
            }
            const result = this.consume(item.kind);
            if (result.allowed || result.reason !== 'MIN_INTERVAL') { if (result.allowed) this.lastReservationCompletedAt = this.now(); item.resolve(result); break; }
            const waitMs = Math.max(1, this.minimumIntervalMs - (this.now() - Math.max(this.state().lastRequestAt ?? this.now(), this.lastReservationCompletedAt ?? 0)));
            await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
          }
        } catch (error) { item.reject(error); }
      }
    } finally { this.draining = false; }
  }

  public snapshot() {
    const s = this.state();
    return { ...s, perMinute: this.perMinute, perHour: this.perHour, perDay: this.perDay, minimumIntervalMs: this.minimumIntervalMs, autoDailyBudget: this.autoDailyBudget, hardStopDaily: this.hardStopDaily, remainingDay: Math.max(0, this.hardStopDaily - s.dayUsed), remainingAuto: Math.max(0, this.autoDailyBudget - s.autoUsed) };
  }
}
