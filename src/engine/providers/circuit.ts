import type { ProviderCircuitSnapshot } from './contracts';
import { ProviderAdapterError } from './http';

type CircuitState = {
  retryAt?: number;
  consecutiveFailures: number;
  lastFailureCode?: string;
  lastFailureAt?: number;
  lastSuccessAt?: number;
};

const nextUtcMinute = (now: number) => Math.floor(now / 60_000) * 60_000 + 60_000;
const nextUtcMidnight = (now: number) => {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
};

export class TwelveDataCircuit {
  private state: CircuitState = { consecutiveFailures: 0 };
  constructor(private readonly now: () => number = () => Date.now()) {}

  public isOpen(): boolean { return this.state.retryAt !== undefined && this.now() < this.state.retryAt; }
  public reset(): void { this.state = { consecutiveFailures: 0 }; }
  public execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) throw new ProviderAdapterError('TWELVE_DATA', 'CIRCUIT_OPEN', `TWELVE_DATA circuit is open until ${new Date(this.state.retryAt!).toISOString()}.`);
    return operation().then((result) => {
      this.state = { consecutiveFailures: 0, lastSuccessAt: this.now() };
      return result;
    }).catch((error: unknown) => {
      const code = error instanceof ProviderAdapterError ? error.code : error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      if (code !== 'OPERATOR_ABORT') {
        const failedAt = this.now();
        this.state.consecutiveFailures += 1;
        this.state.lastFailureCode = code;
        this.state.lastFailureAt = failedAt;
        if (code === 'RATE_LIMITED') this.state.retryAt = nextUtcMinute(failedAt);
        else if (code === 'DAILY_QUOTA_EXHAUSTED') this.state.retryAt = error instanceof ProviderAdapterError && error.retryAt && error.retryAt > failedAt ? error.retryAt : nextUtcMidnight(failedAt);
        else if (['PROVIDER_TIMEOUT', 'PROVIDER_SERVER_ERROR', 'PROVIDER_UNAVAILABLE'].includes(code)) this.state.retryAt = failedAt + 60_000;
      }
      throw error;
    });
  }
  public snapshot(): ProviderCircuitSnapshot {
    const open = this.isOpen();
    return {
      provider: 'TWELVE_DATA', state: open ? 'OPEN' : 'CLOSED',
      retryAt: this.state.retryAt === undefined ? undefined : new Date(this.state.retryAt).toISOString(),
      consecutiveFailures: this.state.consecutiveFailures,
      lastFailureCode: this.state.lastFailureCode,
      lastFailureAt: this.state.lastFailureAt === undefined ? undefined : new Date(this.state.lastFailureAt).toISOString(),
      lastSuccessAt: this.state.lastSuccessAt === undefined ? undefined : new Date(this.state.lastSuccessAt).toISOString(),
    };
  }
}
