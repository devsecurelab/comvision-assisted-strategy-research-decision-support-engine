import type { MasterTelemetry } from '../engine/types';
import type { ScanResult } from '../engine/scanScheduler';

/**
 * Dispatches an eligible signal alert before saving its full candidate telemetry.
 * The engine status is the sole alert gate; persistence still runs for NO_TRADE
 * results whenever telemetry exists.
 */
export async function alertBeforeTelemetry<T extends ScanResult, TAlertResult>(
  result: T,
  dispatchAlert: (result: T) => Promise<TAlertResult | undefined>,
  persistTelemetry: (telemetry: MasterTelemetry) => unknown | Promise<unknown>,
): Promise<{ alertResult: TAlertResult | undefined; telemetryRecord: unknown }> {
  let alertResult: TAlertResult | undefined;
  let telemetryRecord: unknown;
  try {
    if (result.status !== 'NO_TRADE') {
      alertResult = await dispatchAlert(result);
    }
  } finally {
    telemetryRecord = result.telemetry
      ? await persistTelemetry(result.telemetry)
      : undefined;
  }

  return { alertResult, telemetryRecord };
}
