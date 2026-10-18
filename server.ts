// Full-Stack Server Entry Point (Express + Vite)
// ComVision-Assisted Strategy Research & Decision-Support Engine
// Implements Scope Freeze Protection, Durable Persistence, Informational Notifications,
// and Natural-Language Research Chat Interface.
// STRICT NON-EXECUTION BOUNDARY: Decision-Support Only. No automated broker orders.

import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { authService } from './src/server/auth';
import { feedManager, MarketDataError, MarketDataProvider, timeframeToMinutes } from './src/engine/dataProviders';
import { newsGuard } from './src/engine/newsGuard';
import { experimentTracker } from './src/engine/experimentTracker';
import { executeStrategyPipeline } from './src/engine/pipeline';
import { STRATEGY_MANIFEST, ACTIVE_EXPERIMENT_ID } from './src/engine/manifest';
import { EngineSettings, Timeframe, UserAccount } from './src/engine/types';
import { durableStorage } from './src/server/storage';
import { notificationService } from './src/server/notificationService';
import { formatProviderSwitchWarning } from './src/server/providerSwitchFormatter';
import { analyticsService } from './src/server/analyticsService';
import { chatService } from './src/server/chatService';
import { payoutRegistry, normalizePair, displayPair } from './src/server/payoutRegistry';
import { favoriteRegistry } from './src/server/favoriteRegistry';
import { SignalLedger } from './src/engine/signalLedger';
import { ScanLoop, ScanService, SCAN_TIMEFRAMES, type ScanLoopState, type ScanTimeframe } from './src/engine/scanScheduler';
import { buildLedgerReport, formatLedgerReport } from './src/engine/edgeMonitor';

if (typeof __dirname !== 'undefined' && (__dirname === '.' || !path.isAbsolute(__dirname))) {
  // @ts-ignore
  globalThis.__dirname = process.cwd();
}

interface AuthenticatedRequest extends Request {
  user?: Omit<UserAccount, 'passwordHash'>;
}

const app = express();

// Determine port: prioritize command line argument --port, else enforce 3000 in development per environment constraint
function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (typeof __filename !== 'undefined' && (__filename.endsWith('.cjs') || __filename.includes('dist')));
  if (isProduction && process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }
  return 3000;
}
const PORT = resolvePort();
const HOST = process.env.HOST?.trim() || '0.0.0.0';

// CORS support with explicit trusted-origin checking (no credential wildcard)
const allowedOrigins = [
  process.env.APP_URL,
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()),
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const isAllowed = allowedOrigins.includes(origin);
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Runtime engine settings (Strategy v1.0 parameters are frozen during EXP-2026-001)
const currentSettings: EngineSettings = {
  maxWickRatio: 0.50,
  fibEquilibriumLevel: 0.50,
  selectedTimeframe: '15m',
  activeProvider: 'TWELVE_DATA',
  twelveDataApiKeyConfigured: !!(process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY),
  experimentLocked: experimentTracker.isExperimentLocked(),
  scannerActive: experimentTracker.isScannerActive(),
  alertsMuted: experimentTracker.isAlertsMuted(),
};
let scanLoop: ScanLoop;

// Seed initial history of candidates into durable storage if clean environment
function seedInitialCandidatesIfEmpty() {
  const existing = durableStorage.loadCandidates();
  if (existing && existing.length > 0) {
    return; // Already persisted from previous run
  }
}
seedInitialCandidatesIfEmpty();

// --- SERVER-SIDE AUTHENTICATION MIDDLEWARES ---

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Access denied. Missing authentication bearer token.',
    });
  }

  const user = authService.getUserByToken(token);
  if (!user) {
    return res.status(401).json({
      error: 'INVALID_SESSION',
      message: 'Session has expired or token is invalid. Please sign in again.',
    });
  }

  req.user = user;
  next();
}

function requireApprovedUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  authenticateToken(req, res, () => {
    if (!req.user) return;

    if (req.user.status !== 'APPROVED') {
      return res.status(403).json({
        error: 'ACCOUNT_NOT_APPROVED',
        status: req.user.status,
        message: `Forbidden: Account status is ${req.user.status}. Access requires APPROVED authorization from Lead Researcher.`,
      });
    }

    next();
  });
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireApprovedUser(req, res, () => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: 'Forbidden: This action requires Master Administrator privileges.',
      });
    }
    next();
  });
}

// --- AUTHENTICATION API ROUTES ---

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required registration parameters' });
  }

  const result = authService.register(name, email, password);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.status(201).json(result);
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const result = authService.login(email, password);
  if (!result.success) {
    if (result.status && result.status !== 'APPROVED') {
      return res.status(403).json(result);
    }
    return res.status(401).json(result);
  }

  res.json(result);
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', authenticateToken, (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.substring(7);
  if (token) {
    authService.logout(token);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// --- PROTECTED ENGINE API ROUTES (APPROVED OPERATORS ONLY) ---

app.get(['/api/engine/dashboard-state', '/api/engine/status'], requireApprovedUser, (_req, res) => {
  const stats = experimentTracker.getStats();
  const activeAlert = experimentTracker.getActiveAlert();
  const providerStatus = feedManager.getStatus();
  const newsStatus = newsGuard.checkNewsWindow();
  const validSetups = experimentTracker.getCandidates('PASS', 100);

  res.json({
    stats,
    activeAlert,
    validSetups,
    settings: currentSettings,
    providerStatus,
    newsStatus: {
      ...newsStatus,
      windowState: newsStatus.state,
    },
    manifest: STRATEGY_MANIFEST,
  });
});

app.get('/api/engine/valid-setups', requireApprovedUser, (_req, res) => {
  const validSetups = experimentTracker.getCandidates('PASS', 100);
  res.json({
    validSetups,
    total: validSetups.length,
    experiment_id: experimentTracker.getExperimentId(),
  });
});

app.get('/api/engine/candidates', requireApprovedUser, (req, res) => {
  const filter = (req.query.filter as any) || 'ALL';
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const candidates = experimentTracker.getCandidates(filter, limit);
  res.json({ candidates });
});

app.post('/api/engine/toggle-scanner', requireApprovedUser, (req, res) => {
  const { active } = req.body;
  if (typeof active === 'boolean') {
    currentSettings.scannerActive = active;
    experimentTracker.setScannerActive(active);
  } else {
    currentSettings.scannerActive = !currentSettings.scannerActive;
    experimentTracker.setScannerActive(currentSettings.scannerActive);
  }
  scanLoop.setEnabled(currentSettings.scannerActive);
  if (currentSettings.scannerActive) scanLoop.start();
  else scanLoop.stop();
  res.json({ scannerActive: currentSettings.scannerActive });
});


app.post('/api/engine/select-provider', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  const { provider } = req.body;
  if (provider === 'TWELVE_DATA') {
    const resolvedProvider: 'TWELVE_DATA' = provider;
    currentSettings.activeProvider = resolvedProvider;
    const status = feedManager.selectProvider(resolvedProvider);
    durableStorage.recordAuditEvent({
      event_type: 'MARKET_DATA_PROVIDER_SELECTED',
      actor_id: req.user?.id,
      actor_email: req.user?.email,
      details: { provider: resolvedProvider, status: status.status },
    });
    return res.json({ success: true, providerStatus: status });
  }
  res.status(400).json({ error: 'INVALID_PROVIDER', message: 'Valid provider is TWELVE_DATA' });
});

app.post('/api/admin/provider-credentials', requireAdmin, (req: AuthenticatedRequest, res) => {
  const fields: Array<[string, MarketDataProvider]> = [
    ['twelveDataKey', 'TWELVE_DATA'], ['oandaPracticeToken', 'OANDA'], ['tiingoApiKey', 'TIINGO'],
  ];
  const keys: Partial<Record<MarketDataProvider, string>> = {};
  const changed: MarketDataProvider[] = [];
  for (const [field, provider] of fields) {
    const value = req.body?.[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 512 || value.includes('\0')) {
      return res.status(400).json({ error: 'INVALID_PROVIDER_CREDENTIAL', field, message: 'Credential must be a string of at most 512 characters.' });
    }
    const credential = value.trim();
    if (!credential) continue;
    keys[provider] = credential;
    changed.push(provider);
  }
  if (changed.length === 0) return res.status(400).json({ error: 'NO_CREDENTIALS', message: 'Enter at least one non-empty provider credential.' });
  feedManager.setProviderKeys(keys);
  const status = feedManager.getStatus();
  currentSettings.twelveDataApiKeyConfigured = status.quota.twelveData.configured;
  durableStorage.recordAuditEvent({
    event_type: 'MARKET_DATA_CREDENTIALS_UPDATED', actor_id: req.user?.id, actor_email: req.user?.email,
    details: { providers: changed, storage: 'SERVER_MEMORY_ONLY' },
  });
  res.json({ success: true, configuredProviders: feedManager.getFallbackProviders(), providerStatus: feedManager.getStatus(), storage: 'SERVER_MEMORY_ONLY' });
});

// Dashboard Operator Timeframe Authority (Section 3.1)
app.post('/api/engine/select-timeframe', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  const { timeframe } = req.body;
  const validTimeframes: Timeframe[] = ['1m', '5m', '15m', '30m', '1h'];
  if (validTimeframes.includes(timeframe)) {
    currentSettings.selectedTimeframe = timeframe;
    durableStorage.recordAuditEvent({
      event_type: 'OPERATOR_TIMEFRAME_UPDATED',
      actor_id: req.user?.id,
      actor_email: req.user?.email,
      details: { selectedTimeframe: timeframe },
    });
    return res.json({
      success: true,
      selectedTimeframe: currentSettings.selectedTimeframe,
      message: `Evaluation timeframe authority set to ${timeframe}`,
    });
  }
  res.status(400).json({ error: 'INVALID_TIMEFRAME', message: 'Valid timeframes are 1m, 5m, 15m, 30m, 1h' });
});

app.post('/api/engine/record-action', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  const { setupId, action } = req.body;
  if (!setupId || !action) {
    return res.status(400).json({ error: 'Missing setupId or action' });
  }

  const success = experimentTracker.recordUserAction(setupId, action);
  if (!success) {
    return res.status(404).json({ error: 'Candidate setup not found in active telemetry' });
  }

  durableStorage.recordAuditEvent({
    event_type: 'USER_ACTION_RECORDED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: { setup_id: setupId, action },
  });

  res.json({ success: true, setupId, action });
});

app.post('/api/engine/record-outcome', requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const { setupId, outcome, nextCandle, notes } = req.body;
  if (!setupId || !outcome) {
    return res.status(400).json({ error: 'Missing setupId or outcome' });
  }

  const outcomeRecord = experimentTracker.recordSignalOutcome(setupId, outcome, nextCandle, notes);
  if (!outcomeRecord) {
    return res.status(404).json({ error: 'Candidate setup not found' });
  }

  // Dispatch Result Alert to Telegram and Email
  const notifResult = await notificationService.dispatchResultAlert(outcomeRecord);

  durableStorage.recordAuditEvent({
    event_type: 'SIGNAL_OUTCOME_RECORDED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: { setup_id: setupId, outcome, notifResult },
  });

  res.json({ success: true, outcomeRecord, notifications: notifResult });
});

app.get('/api/engine/export-telemetry', requireApprovedUser, (_req, res) => {
  const json = experimentTracker.exportTelemetryJson();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="master_telemetry_${Date.now()}.json"`);
  res.send(json);
});

app.get('/api/market/feed', requireApprovedUser, async (req, res) => {
  const pair = (req.query.pair as string) || 'EUR/USD';
  const tf = ((req.query.timeframe as string) || currentSettings.selectedTimeframe) as Timeframe;
  if (!['1m', '5m', '15m', '30m', '1h'].includes(tf)) {
    return res.status(400).json({ error: 'INVALID_TIMEFRAME', message: 'Valid timeframes are 1m, 5m, 15m, 30m, 1h.' });
  }
  try {
    const result = await feedManager.fetchCandles(pair, tf, currentSettings.activeProvider as MarketDataProvider);
    return res.json({ timeframe: tf, pair, ...result, providerStatus: feedManager.getStatus() });
  } catch (error: any) {
    const providerError = error instanceof MarketDataError ? error : null;
    return res.status(503).json({
      error: providerError?.code || 'MARKET_DATA_UNAVAILABLE',
      message: providerError?.message || 'Market data is unavailable. No signal was generated.',
      providerStatus: feedManager.getStatus(),
    });
  }
});

// Step 0 diagnostic: admin-only so repeated probes cannot be used to burn provider credits.
// Never returns request URLs, API keys, raw provider error text, or authentication tokens.
app.get('/api/engine/provider-health', requireAdmin, async (req, res) => {
  const providerInput = typeof req.query.provider === 'string' ? req.query.provider : '';
  const provider = ['TWELVE_DATA', 'OANDA', 'TIINGO'].includes(providerInput) ? providerInput as MarketDataProvider : null;
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
  const timeframeInput = typeof req.query.timeframe === 'string' ? req.query.timeframe : '';
  const timeframe = timeframeInput === '15m' || timeframeInput === '1h' ? timeframeInput : null;
  const allowedSymbols = new Set(['EUR/USD', 'GBP/USD', 'USD/JPY']);

  if (!provider || !allowedSymbols.has(symbol) || !timeframe) {
    return res.status(400).json({
      error: 'INVALID_PROBE_PARAMETERS',
      required: { provider: ['TWELVE_DATA', 'OANDA', 'TIINGO'], symbol: [...allowedSymbols], timeframe: ['15m', '1h'] },
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await feedManager.probeProvider(symbol, timeframe, provider);
    const intervalMs = timeframeToMinutes(timeframe) * 60_000;
    const nowMs = Date.now();
    const expectedLastClosedMs = Math.floor(nowMs / intervalMs) * intervalMs - intervalMs;
    const expectedLastClosedTsUtc = new Date(expectedLastClosedMs).toISOString();
    let lastClosed = undefined as typeof result.candles[number] | undefined;
    for (const candle of result.candles) {
      if (Date.parse(candle.timestamp) + intervalMs <= nowMs) lastClosed = candle;
    }
    const isExpectedClosedCandlePresent = lastClosed?.timestamp === expectedLastClosedTsUtc;
    const latest = result.candles[result.candles.length - 1];
    const symbolMapping = provider === 'TWELVE_DATA'
      ? { symbol }
      : { from_symbol: symbol.split('/')[0], to_symbol: symbol.split('/')[1] };

    return res.json({
      provider,
      symbol,
      symbolMapping,
      timeframe,
      status: isExpectedClosedCandlePresent ? 'LIVE_CLOSED_CANDLE_VERIFIED' : 'LIVE_RESPONSE_EXPECTED_CANDLE_MISSING',
      fetched_at_utc: result.fetchedAt,
      latency_ms: result.latencyMs,
      credits_used: result.creditsUsed ?? null,
      credits_left: result.creditsLeft ?? null,
      volume_present: result.volumeAvailable ?? false,
      latest_candle_ts_utc: latest?.timestamp ?? null,
      latest_candle_is_still_forming: latest ? Date.parse(latest.timestamp) + intervalMs > nowMs : null,
      expected_last_closed_candle_ts_utc: expectedLastClosedTsUtc,
      last_closed_candle_ts_utc: lastClosed?.timestamp ?? null,
      is_expected_closed_candle_present: isExpectedClosedCandlePresent,
      last_closed_candle: lastClosed ? {
        open: lastClosed.open,
        high: lastClosed.high,
        low: lastClosed.low,
        close: lastClosed.close,
        volume: result.volumeAvailable ? lastClosed.volume : null,
      } : null,
    });
  } catch (error: any) {
    const safeErrorCode = error instanceof MarketDataError ? error.code : 'PROVIDER_PROBE_FAILED';
    const status = safeErrorCode === 'UNSUPPORTED_ON_FREE_KEY' ? 'UNSUPPORTED_ON_FREE_KEY' : 'FAILED';
    return res.status(503).json({ provider, symbol, timeframe, status, provider_state: status, error: safeErrorCode });
  }
});

app.get('/api/news/status', requireApprovedUser, (_req, res) => {
  const events = newsGuard.getEvents();
  const windowCheck = newsGuard.checkNewsWindow();
  res.json({
    events,
    windowStatus: windowCheck,
    windowCheck: {
      ...windowCheck,
      windowState: windowCheck.state,
    },
    isOnline: newsGuard.isOnline(),
    newsSourceOnline: newsGuard.isSourceOnline(),
  });
});



app.get('/api/audit/verify-chain', requireApprovedUser, (_req, res) => {
  const verification = experimentTracker.verifyHashChain();
  res.json(verification);
});

app.get('/api/audit/logs', requireAdmin, (_req, res) => {
  const logs = durableStorage.loadAuditEvents();
  res.json({ logs });
});

// --- RESEARCH ANALYTICS & HISTORY API ---

app.get('/api/research/analytics', requireApprovedUser, (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
  const pair = (req.query.pair as string) || undefined;
  const bias = (req.query.bias as any) || undefined;
  const timeframe = (req.query.timeframe as string) || undefined;
  const startDateUtc = (req.query.startDateUtc as string) || undefined;
  const endDateUtc = (req.query.endDateUtc as string) || undefined;

  const summary = analyticsService.getAnalytics({
    days,
    pair,
    bias,
    timeframe,
    startDateUtc,
    endDateUtc,
  });

  res.json(summary);
});

// --- NOTIFICATION CONFIGURATION & TESTING API ---

app.get('/api/notifications/status', requireApprovedUser, (_req, res) => {
  res.json(notificationService.getConfig());
});

app.post('/api/notifications/test', requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const result = await notificationService.sendTestNotification();
  durableStorage.recordAuditEvent({
    event_type: 'NOTIFICATION_TEST_TRIGGERED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: result,
  });
  res.json({ success: true, results: result });
});

app.post('/api/notifications/test-telegram', requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const result = await notificationService.sendTelegramTestAlert();
  durableStorage.recordAuditEvent({
    event_type: 'TELEGRAM_TEST_TRIGGERED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: {
      success: result.success,
      status: result.status,
      chatIdPresent: Boolean(result.chatId),
      messageId: result.messageId,
    },
  });
  res.json(result);
});

app.get('/api/notifications/logs', requireApprovedUser, (_req, res) => {
  const logs = durableStorage.loadNotifications();
  res.json({ logs: logs.slice(0, 50) });
});

// --- RESEARCH CHAT ASSISTANT API ---

app.get('/api/chat/history', requireApprovedUser, (_req, res) => {
  const history = chatService.getHistory(30);
  res.json({ history });
});

app.post('/api/chat/query', requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query string is required' });
  }

  const response = await chatService.processQuery(req.user!.id, query);
  res.json(response);
});

// R9 scan service: one engine path for manual API scans, Telegram /scan and the candle-close auto loop.
const signalLedger = new SignalLedger();
const loadScanState = (): ScanLoopState | undefined => durableStorage.loadAppSettings().scanLoopState;
const saveScanState = (state: ScanLoopState) => durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), scanLoopState: state });
const scanService = new ScanService({
  fetchCandles: (pair, timeframe, provider, kind) => feedManager.fetchCandles(pair, timeframe, provider, kind),
  providers: () => feedManager.getFallbackProviders(),
  getPayout: (pair) => { const record = payoutRegistry.get(pair); return record ? { pct: record.pct, setAt: record.setAt } : undefined; },
  favorites: () => favoriteRegistry.all().map((item) => item.pair),
  newsEvents: () => newsGuard.getEvents(),
  newsSourceOnline: () => newsGuard.isSourceOnline(),
  autoBudgetRemaining: () => { const snapshot = feedManager.getSchedulerSnapshot(); return Math.min(snapshot.remainingAuto, snapshot.remainingDay); },
  now: () => Date.now(),
  ledger: signalLedger,
  onScan: async (result) => {
    if (!result.telemetry) return;
    const recorded = experimentTracker.recordCandidate(result.telemetry);
    if (result.status !== 'NO_TRADE') await notificationService.dispatchSignalAlert(recorded, { signalId: result.signal_id, validUntil: result.valid_until });
  },
  onProviderSwitches: async (notice) => {
    const safeText = formatProviderSwitchWarning(notice, feedManager.getStatus().circuits);
    await notificationService.sendTelegramText(safeText);
  },
  onResolved: async (signal, outcome) => {
    await notificationService.sendTelegramText(`RESULT ${signal.signal_id} ${signal.pair} ${signal.timeframe} ${signal.direction}: ${outcome} (open ${signal.entry_price ?? 'UNAVAILABLE'} -> close ${signal.exit_price ?? 'UNAVAILABLE'}). Research record only.`);
  },
  onEdgeLost: async (reason) => {
    await notificationService.sendTelegramText(`EDGE_LOST — এখন ট্রেড নয়। ${reason} Alerts are paused. Send /resume <written reason> to continue.`);
  },
  loadState: loadScanState,
  saveState: saveScanState,
});
scanLoop = new ScanLoop(scanService, { now: () => Date.now(), loadState: loadScanState, saveState: saveScanState }, {
  timeframe: (SCAN_TIMEFRAMES as string[]).includes(process.env.AUTO_SCAN_TIMEFRAME || '') ? (process.env.AUTO_SCAN_TIMEFRAME as ScanTimeframe) : '15m',
  enabled: process.env.AUTO_SCAN_ENABLED === 'true',
});
notificationService.attachScanService(scanService, scanLoop);

// Manual scan (dashboard). Latest closed candle only; a repeat on the same pair/candle returns the cached result without a credit charge.
app.post(['/api/engine/evaluate-candidate', '/api/engine/scan-candidate'], requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const { pair, timeframe } = req.body;
  const selectedPair = pair || 'EUR/USD';
  const payout = payoutRegistry.get(normalizePair(selectedPair));
  if (!payout) return res.status(409).json({ status: 'PAYOUT_UNSET', signal: 'NO_TRADE', pair: displayPair(selectedPair), message: `Set payout first with /payout ${normalizePair(selectedPair)} 87.` });
  if (payout.pct < 85) return res.status(409).json({ status: 'PAYOUT_BELOW_MIN', signal: 'NO_TRADE', pair: displayPair(selectedPair), payout_pct: payout.pct, message: `Payout ${payout.pct}% is below the 85% minimum. Scan not run.` });
  const resolvedTimeframe = ((timeframe as string) || currentSettings.selectedTimeframe) as ScanTimeframe;
  const result = await scanService.scanPair(selectedPair, resolvedTimeframe, 'MANUAL');
  let telemetry = result.telemetry;
  if (!telemetry) {
    telemetry = executeStrategyPipeline({ candles: [], currentCandleIndex: -1, selectedTimeframe: (SCAN_TIMEFRAMES as string[]).includes(resolvedTimeframe) ? resolvedTimeframe : '15m', newsEvents: [], newsSourceOnline: false, dataProvenance: 'NOT_LIVE', pair: displayPair(selectedPair), asset: displayPair(selectedPair), payoutPct: payout.pct });
    telemetry.metadata.status_reason = result.reason;
    telemetry.system_execution.rejection_reason = result.reason;
  }
  const marketDataError = result.telemetry ? undefined : { code: result.reason.split(':')[0], message: result.reason };
  res.json({ telemetry, scan: { ...result, telemetry: undefined }, marketDataError, providerStatus: feedManager.getStatus() });
});

// --- ADMIN-ONLY ROUTES ---

app.get('/api/admin/users', requireAdmin, (req: AuthenticatedRequest, res) => {
  const users = authService.listUsers(req.user!.id);
  res.json({ users });
});

app.post('/api/admin/user/:id/status', requireAdmin, (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const { status } = req.body;

  if (!['PENDING', 'APPROVED', 'SUSPENDED', 'REVOKED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const result = authService.updateUserStatus(req.user!.id, targetId, status);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/admin/users/status', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { userId, status } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: 'userId and status are required' });
  }

  if (!['PENDING', 'APPROVED', 'SUSPENDED', 'REVOKED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const result = authService.updateUserStatus(req.user!.id, userId, status);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  res.json({
    settings: {
      ...currentSettings,
      experimentLocked: experimentTracker.isExperimentLocked(),
    },
    manifest: STRATEGY_MANIFEST,
  });
});

/**
 * BLOCKER COMPLIANCE: Scope Freeze Enforcement
 * Rejects any attempt to mutate frozen Strategy v1.0 parameters (maxWickRatio, fibEquilibriumLevel, etc.)
 * server-side with HTTP 403, records audit event, and leaves active configuration untouched.
 */
app.post('/api/admin/settings', requireAdmin, (req: AuthenticatedRequest, res) => {
  const mutations = req.body;
  const auditMutations = { ...mutations };
  for (const secretField of ['twelveDataKey', 'oandaPracticeToken', 'tiingoApiKey']) {
    if (secretField in auditMutations) auditMutations[secretField] = '[REDACTED]';
  }

  // 1. Check if experiment is locked and mutation attempts to alter frozen parameters
  const freezeCheck = experimentTracker.checkFrozenMutation(mutations);
  if (!freezeCheck.allowed) {
    durableStorage.recordAuditEvent({
      event_type: 'MUTATION_BLOCKED_SCOPE_FROZEN',
      actor_id: req.user?.id,
      actor_email: req.user?.email,
      details: {
        attempted_mutations: auditMutations,
        blocked_field: freezeCheck.field,
        reason: freezeCheck.reason,
      },
    });

    return res.status(403).json({
      error: 'EXPERIMENT_SCOPE_FROZEN',
      field: freezeCheck.field,
      message: freezeCheck.reason || 'Strategy v1.0 parameters are frozen during active controlled experiment EXP-2026-001. Mutation rejected.',
    });
  }

  const {
    activeProvider,
    twelveDataKey,
    experimentLocked,
    selectedTimeframe,
  } = req.body;

  if (typeof experimentLocked === 'boolean') {
    currentSettings.experimentLocked = experimentLocked;
    experimentTracker.setExperimentLocked(experimentLocked);
  }

  if (selectedTimeframe && !experimentTracker.isExperimentLocked()) {
    currentSettings.selectedTimeframe = selectedTimeframe as Timeframe;
  }

  if (activeProvider) {
    if (activeProvider === 'TWELVE_DATA') {
      currentSettings.activeProvider = 'TWELVE_DATA';
      feedManager.selectProvider('TWELVE_DATA');
    }
  }

  if (twelveDataKey !== undefined) {
    feedManager.setProviderKeys({ TWELVE_DATA: twelveDataKey || '' });
    currentSettings.twelveDataApiKeyConfigured = !!twelveDataKey;
  }

  durableStorage.recordAuditEvent({
    event_type: 'ADMIN_SETTINGS_UPDATED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: { settings: currentSettings },
  });

  res.json({ success: true, settings: currentSettings });
});

// --- TELEGRAM INTEGRATION & CHAT ID INSPECTOR (ADMIN ONLY) ---

/**
 * SECURE ADMIN-ONLY ENDPOINT:
 * Queries Telegram Bot API getUpdates to inspect recent messages (such as /start)
 * and retrieves the user's Chat ID.
 * STRICT NON-EXPOSURE REQUIREMENT: The bot token is never sent to the client, logged, or exposed in errors.
 */
app.get('/api/admin/telegram/latest-update', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const result = await notificationService.getLatestTelegramUpdate();

  durableStorage.recordAuditEvent({
    event_type: 'TELEGRAM_CHAT_ID_QUERY',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: {
      success: result.success,
      chatIdFound: result.update?.chatId,
      isStartCommand: result.update?.isStartCommand,
      hasRecentUpdates: (result.recentUpdates?.length ?? 0) > 0,
    },
  });

  res.json(result);
});

app.post('/api/admin/telegram/process-commands', requireAdmin, async (req: AuthenticatedRequest, res) => {
  const result = await notificationService.processOwnerTelegramCommands();
  durableStorage.recordAuditEvent({ event_type: 'TELEGRAM_COMMAND_POLL', actor_id: req.user?.id, actor_email: req.user?.email, details: { processed: result.processed, rejected: result.rejected, configured: result.configured, error: result.error } });
  res.json(result);
});

/**
 * SECURE ADMIN-ONLY ENDPOINT:
 * Sets the active Telegram chat ID for research signal alerts and next-candle result notifications.
 */
app.post('/api/admin/telegram/apply-chat-id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { chatId } = req.body;
  if (!chatId || typeof chatId !== 'string' && typeof chatId !== 'number') {
    return res.status(400).json({ error: 'Valid chatId is required.' });
  }

  const cleanChatId = String(chatId).trim();
  notificationService.setTelegramChatId(cleanChatId);

  durableStorage.recordAuditEvent({
    event_type: 'TELEGRAM_CHAT_ID_APPLIED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: { chatIdApplied: true },
  });

  res.json({
    success: true,
    chatId: cleanChatId,
    message: `Telegram Chat ID ${cleanChatId} applied. Real-time research alerts now active.`,
  });
});

/**
 * SECURE ADMIN-ONLY ENDPOINT:
 * Returns the current Telegram configuration status without exposing the bot token.
 */
app.get('/api/admin/telegram/status', requireAdmin, (_req, res) => {
  res.json({
    botTokenConfigured: notificationService.isBotTokenConfigured(),
    telegramEnabled: notificationService.isTelegramEnabled(),
    activeChatId: notificationService.getRawChatId() || null,
  });
});

// Fallback for unhandled API routes: always return 404 JSON instead of HTML SPA fallback!
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `API endpoint ${req.method} ${req.path} not found`,
  });
});

// No source archives are served from public/dist; old and arbitrary ZIP paths must be a real 404.
app.use((req, res, next) => {
  if (/\.zip$/i.test(req.path)) return res.status(404).json({ error: 'NOT_FOUND' });
  next();
});

// --- VITE / STATIC SERVING INTEGRATION ---

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (typeof __filename !== 'undefined' && (__filename.endsWith('.cjs') || __filename.includes('dist')));
  const isDev = !isProduction && (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV);
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use((req, res, next) => {
      if (/^\/server\.cjs(?:\.map)?$/i.test(req.path)) return res.status(404).json({ error: 'NOT_FOUND' });
      next();
    });
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  scanLoop.start();
  let telegramPollBusy = false;
  if (process.env.TELEGRAM_COMMAND_POLLING !== 'false') {
    setInterval(() => {
      if (telegramPollBusy) return;
      telegramPollBusy = true;
      void notificationService.processOwnerTelegramCommands().catch(() => undefined).finally(() => { telegramPollBusy = false; });
    }, Math.max(3_000, Number(process.env.TELEGRAM_POLL_MS || 10_000)));
  }
  setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    const settings = durableStorage.loadAppSettings();
    if (settings.lastDailyReportDate === today) return;
    durableStorage.saveAppSettings({ ...settings, lastDailyReportDate: today });
    const since = Date.parse(`${today}T00:00:00Z`) - 86_400_000;
    void notificationService.sendTelegramText(formatLedgerReport('DAILY REPORT (previous UTC day)', buildLedgerReport(signalLedger.signals(), since, since + 86_400_000))).catch(() => undefined);
  }, 60_000);

  app.listen(PORT, HOST, () => {
    console.log(`[ComVision Engine] Server running on http://${HOST}:${PORT}`);
    console.log(`[ComVision Engine] Architecture: Strictly Non-Execution Manual Alert Engine`);
    console.log(`[ComVision Engine] Experiment Freeze: ${ACTIVE_EXPERIMENT_ID} Scope Immutable`);
    console.log(`[ComVision Engine] Durable Persistence: Active (data/)`);
  });
}

startServer();
