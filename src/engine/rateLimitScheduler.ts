import { durableStorage } from '../server/storage';

export interface SchedulerConfig { perMinute?: number; perDay?: number; autoDailyBudget?: number; }
export interface ConsumeResult { allowed: boolean; reason: 'OK' | 'MINUTE_LIMIT' | 'DAY_LIMIT' | 'AUTO_BUDGET_LIMIT'; minuteUsed: number; dayUsed: number; }

interface State { dayUtc: string; minuteStartedAt: number; minuteUsed: number; dayUsed: number; autoUsed: number; }

export class RateLimitScheduler {
  private readonly perMinute: number;
  private readonly perDay: number;
  private readonly autoDailyBudget: number;
  private readonly key = 'rateLimitScheduler';
  constructor(config: SchedulerConfig = {}) {
    this.perMinute = config.perMinute ?? Number(process.env.TD_PER_MIN || 8);
    this.perDay = config.perDay ?? Number(process.env.TD_PER_DAY || 800);
    this.autoDailyBudget = config.autoDailyBudget ?? Math.floor(this.perDay * 0.7);
  }
  private state(): State {
    const saved = durableStorage.loadAppSettings()[this.key] as State | undefined;
    const now = Date.now(); const dayUtc = new Date(now).toISOString().slice(0, 10);
    if (!saved || saved.dayUtc !== dayUtc) return { dayUtc, minuteStartedAt: now, minuteUsed: 0, dayUsed: 0, autoUsed: 0 };
    if (now - saved.minuteStartedAt >= 60_000) return { ...saved, minuteStartedAt: now, minuteUsed: 0 };
    return saved;
  }
  private save(state: State) { durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), [this.key]: state }); }
  public consume(kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): ConsumeResult {
    const s = this.state();
    const result = (allowed: boolean, reason: ConsumeResult['reason']): ConsumeResult => ({ allowed, reason, minuteUsed: s.minuteUsed, dayUsed: s.dayUsed });
    if (s.minuteUsed >= this.perMinute) return result(false, 'MINUTE_LIMIT');
    if (s.dayUsed >= this.perDay) return result(false, 'DAY_LIMIT');
    if (kind === 'AUTO' && s.autoUsed >= this.autoDailyBudget) return result(false, 'AUTO_BUDGET_LIMIT');
    s.minuteUsed++; s.dayUsed++; if (kind === 'AUTO') s.autoUsed++; this.save(s); return result(true, 'OK');
  }
  public snapshot() { const s = this.state(); return { ...s, perMinute: this.perMinute, perDay: this.perDay, autoDailyBudget: this.autoDailyBudget, remainingDay: Math.max(0, this.perDay - s.dayUsed), remainingAuto: Math.max(0, this.autoDailyBudget - s.autoUsed) }; }
}
