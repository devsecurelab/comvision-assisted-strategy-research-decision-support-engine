import type { IForexDataProvider, MarketDataProvider, ProviderCircuitSnapshot } from './contracts';
import { PROVIDER_ORDER } from './contracts';
import { ProviderAdapterError } from './http';

type CircuitState = {
  openedAt?: number;
  retryAt?: number;
  consecutiveFailures: number;
  lastFailureCode?: string;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  halfOpenInFlight: boolean;
};

const DEFAULT_COOLDOWN_MS = 5 * 60_000;
const CIRCUIT_FAILURE_CODES = new Set(['PROVIDER_TIMEOUT', 'RATE_LIMITED', 'PROVIDER_SERVER_ERROR', 'PROVIDER_UNAVAILABLE']);

export class FallbackManager {
  private readonly adapters: Map<MarketDataProvider, IForexDataProvider>;
  private readonly circuits = new Map<MarketDataProvider, CircuitState>();

  constructor(
    adapters: IForexDataProvider[],
    private readonly cooldownMs = Number(process.env.PROVIDER_CIRCUIT_COOLDOWN_MS || DEFAULT_COOLDOWN_MS),
    private readonly now: () => number = () => Date.now(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
    for (const provider of PROVIDER_ORDER) this.circuits.set(provider, { consecutiveFailures: 0, halfOpenInFlight: false });
  }

  public isConfigured(provider: MarketDataProvider): boolean { return this.adapters.get(provider)?.isConfigured() ?? false; }

  public configuredProviders(): MarketDataProvider[] { return PROVIDER_ORDER.filter((provider) => this.isConfigured(provider)); }

  public circuitIsOpen(provider: MarketDataProvider): boolean {
    const circuit = this.circuits.get(provider)!;
    return circuit.halfOpenInFlight || (circuit.retryAt !== undefined && this.now() < circuit.retryAt);
  }

  /** Configured, eligible providers in the owner-defined order. Open circuits are skipped until their cooldown expires. */
  public availableProviders(): MarketDataProvider[] {
    const now = this.now();
    return PROVIDER_ORDER.filter((provider) => {
      if (!this.isConfigured(provider)) return false;
      const circuit = this.circuits.get(provider)!;
      if (circuit.retryAt !== undefined && now < circuit.retryAt) return false;
      return !circuit.halfOpenInFlight;
    });
  }

  public adapter(provider: MarketDataProvider): IForexDataProvider | undefined { return this.adapters.get(provider); }

  public reset(provider: MarketDataProvider): void {
    this.circuits.set(provider, { consecutiveFailures: 0, halfOpenInFlight: false });
  }

  public async execute<T>(provider: MarketDataProvider, operation: () => Promise<T>): Promise<T> {
    if (!this.isConfigured(provider)) throw new ProviderAdapterError(provider, 'PROVIDER_NOT_CONFIGURED', `${provider} credentials are not configured.`);
    const now = this.now();
    const circuit = this.circuits.get(provider)!;
    if (circuit.halfOpenInFlight || (circuit.retryAt !== undefined && now < circuit.retryAt)) {
      throw new ProviderAdapterError(provider, 'CIRCUIT_OPEN', `${provider} circuit is open until ${new Date(circuit.retryAt ?? now).toISOString()}.`);
    }
    const isHalfOpenProbe = circuit.retryAt !== undefined;
    if (isHalfOpenProbe) circuit.halfOpenInFlight = true;
    try {
      const result = await operation();
      circuit.retryAt = undefined;
      circuit.openedAt = undefined;
      circuit.consecutiveFailures = 0;
      circuit.lastFailureCode = undefined;
      circuit.lastSuccessAt = this.now();
      return result;
    } catch (error) {
      const failedAt = this.now();
      const code = error instanceof ProviderAdapterError
        ? error.code
        : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
          ? error.code
          : error instanceof Error ? error.name : 'UNKNOWN_ERROR';
      if (CIRCUIT_FAILURE_CODES.has(code)) {
        circuit.consecutiveFailures += 1;
        circuit.openedAt = failedAt;
        circuit.retryAt = failedAt + this.cooldownMs;
        circuit.lastFailureCode = code;
        circuit.lastFailureAt = failedAt;
      } else if (isHalfOpenProbe) {
        // A non-health error proves the provider responded; do not keep the circuit open for a data/credential issue.
        circuit.retryAt = undefined;
        circuit.openedAt = undefined;
      }
      throw error;
    } finally {
      circuit.halfOpenInFlight = false;
    }
  }

  public snapshots(): ProviderCircuitSnapshot[] {
    const now = this.now();
    return PROVIDER_ORDER.map((provider) => {
      const circuit = this.circuits.get(provider)!;
      const configured = this.isConfigured(provider);
      const state: ProviderCircuitSnapshot['state'] = !configured ? 'UNCONFIGURED'
        : circuit.retryAt !== undefined && now < circuit.retryAt ? 'OPEN'
          : circuit.halfOpenInFlight ? 'HALF_OPEN'
            : circuit.retryAt !== undefined ? 'HALF_OPEN' : 'CLOSED';
      return {
        provider, state,
        retryAt: circuit.retryAt === undefined ? undefined : new Date(circuit.retryAt).toISOString(),
        consecutiveFailures: circuit.consecutiveFailures,
        lastFailureCode: circuit.lastFailureCode,
        lastFailureAt: circuit.lastFailureAt === undefined ? undefined : new Date(circuit.lastFailureAt).toISOString(),
        lastSuccessAt: circuit.lastSuccessAt === undefined ? undefined : new Date(circuit.lastSuccessAt).toISOString(),
      };
    });
  }
}
