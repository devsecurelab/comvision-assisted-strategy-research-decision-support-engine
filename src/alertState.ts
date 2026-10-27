export type AlertLike = {
  metadata: {
    setup_id: string;
    signal_timestamp_utc?: string;
    data_provenance?: string;
    [key: string]: unknown;
  };
  system_execution?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AlertBannerSeverity = 'info' | 'warning' | 'critical';

export interface AlertBanner {
  message: string;
  severity: AlertBannerSeverity;
}

export interface AlertState {
  /** Server-owned active alert. Polling may replace this value. */
  serverActiveAlert: AlertLike | null;
  /** Operator-owned selection. Polling must never replace this value. */
  selectedSetup: AlertLike | null;
  banner: AlertBanner | null;
  pendingCommand: 'start' | 'stop' | null;
  controlsDisabled: boolean;
  actionCardVisible: boolean;
  sessionToken: string | null;
  sessionRestoreError: boolean;
  serverNowUtc: string | null;
  signalAgeSeconds: number | null;
}

export const initialAlertState: AlertState = {
  serverActiveAlert: null,
  selectedSetup: null,
  banner: null,
  pendingCommand: null,
  controlsDisabled: false,
  actionCardVisible: false,
  sessionToken: null,
  sessionRestoreError: false,
  serverNowUtc: null,
  signalAgeSeconds: null,
};

type AlertAction =
  | { type: 'POLL_SUCCESS'; activeAlert: AlertLike | null; serverNowUtc?: string; signalAgeSeconds?: number; entryWindowExpired?: boolean }
  | { type: 'SELECT_SETUP'; setup: AlertLike | null }
  | { type: 'API_FAILURE'; message?: string }
  | { type: 'SCANNER_COMMAND_PENDING'; command: 'start' | 'stop' }
  | { type: 'SCANNER_COMMAND_FAILURE'; command: 'start' | 'stop'; message?: string }
  | { type: 'SCANNER_COMMAND_SUCCESS'; command: 'start' | 'stop' }
  | { type: 'CLEAR_BANNER' }
  | { type: 'RESTORE_SESSION'; raw: string | null };

function visible(state: Pick<AlertState, 'serverActiveAlert' | 'banner'>): boolean {
  return state.serverActiveAlert !== null && state.banner === null;
}

export function alertReducer(state: AlertState, action: AlertAction): AlertState {
  switch (action.type) {
    case 'POLL_SUCCESS': {
      const expired = action.entryWindowExpired === true;
      const next: AlertState = {
        ...state,
        serverActiveAlert: expired ? null : action.activeAlert,
        banner: null,
        serverNowUtc: action.serverNowUtc ?? state.serverNowUtc,
        signalAgeSeconds: action.signalAgeSeconds ?? state.signalAgeSeconds,
      };
      return { ...next, actionCardVisible: visible(next) };
    }
    case 'SELECT_SETUP': {
      return { ...state, selectedSetup: action.setup };
    }
    case 'API_FAILURE': {
      const next = { ...state, banner: { message: action.message ?? 'Scanner state unknown', severity: 'warning' as const } };
      return { ...next, actionCardVisible: false };
    }
    case 'SCANNER_COMMAND_PENDING':
      return { ...state, pendingCommand: action.command, controlsDisabled: true };
    case 'SCANNER_COMMAND_FAILURE': {
      const message = action.command === 'stop' ? 'Failed to stop scanner' : 'Failed to start scanner';
      const next = { ...state, pendingCommand: null, controlsDisabled: false, banner: { message, severity: action.command === 'stop' ? 'critical' as const : 'warning' as const } };
      return { ...next, actionCardVisible: false };
    }
    case 'SCANNER_COMMAND_SUCCESS':
      return { ...state, pendingCommand: null, controlsDisabled: false };
    case 'CLEAR_BANNER': {
      const next = { ...state, banner: null };
      return { ...next, actionCardVisible: visible(next) };
    }
    case 'RESTORE_SESSION': {
      if (!action.raw) return { ...state, sessionToken: null, sessionRestoreError: false };
      try {
        const parsed: unknown = JSON.parse(action.raw);
        const token = typeof parsed === 'string' ? parsed : (parsed && typeof parsed === 'object' && 'token' in parsed && typeof (parsed as { token?: unknown }).token === 'string' ? (parsed as { token: string }).token : null);
        return { ...state, sessionToken: token, sessionRestoreError: false };
      } catch {
        return { ...state, sessionToken: null, sessionRestoreError: false };
      }
    }
    default:
      return state;
  }
}
