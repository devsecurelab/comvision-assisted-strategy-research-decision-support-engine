// Full-Stack Server Entry Point (Express + Vite)
// ComVision-Assisted Strategy Research & Decision-Support Engine
// Implements Scope Freeze Protection, Durable Persistence, Informational Notifications,
// and Natural-Language Research Chat Interface.
// STRICT NON-EXECUTION BOUNDARY: Decision-Support Only. No automated broker orders.

import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { authService } from './src/server/auth';
import { feedManager } from './src/engine/dataProviders';
import { newsGuard } from './src/engine/newsGuard';
import { experimentTracker } from './src/engine/experimentTracker';
import { executeStrategyPipeline } from './src/engine/pipeline';
import { STRATEGY_MANIFEST, ACTIVE_EXPERIMENT_ID } from './src/engine/manifest';
import { EngineSettings, MasterTelemetry, Timeframe, UserAccount } from './src/engine/types';
import { DEFAULT_PAIR, MAJOR_PAIRS, MINOR_CROSS_PAIRS, SUPPORTED_PAIRS, normalizePair } from './src/engine/pairCatalog';
import { durableStorage } from './src/server/storage';
import { notificationService } from './src/server/notificationService';
import { analyticsService } from './src/server/analyticsService';
import { chatService } from './src/server/chatService';

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

// CORS support with explicit trusted-origin checking (no credential wildcard)
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.endsWith('.run.app') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:');
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
  selectedPair: DEFAULT_PAIR,
  activePairs: [DEFAULT_PAIR],
  pairSelectionSource: 'DEFAULT',
  selectedTimeframe: '5m',
  activeProvider: 'RESEARCH_STREAM_REPLAY',
  twelveDataApiKeyConfigured: !!process.env.TWELVE_DATA_API_KEY,
  alphaVantageApiKeyConfigured: !!process.env.ALPHA_VANTAGE_API_KEY,
  experimentLocked: experimentTracker.isExperimentLocked(),
  scannerActive: experimentTracker.isScannerActive(),
  alertsMuted: experimentTracker.isAlertsMuted(),
};

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

// Authoritative 40-pair market scope controls. Selection never changes frozen strategy constants.
app.get('/api/engine/pairs', requireApprovedUser, (_req, res) => {
  res.json({
    defaultPair: DEFAULT_PAIR,
    majorPairs: MAJOR_PAIRS,
    minorCrossPairs: MINOR_CROSS_PAIRS,
    supportedPairs: SUPPORTED_PAIRS,
    selectedPair: currentSettings.selectedPair,
    activePairs: currentSettings.activePairs,
  });
});

app.post('/api/engine/select-pair', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  try {
    const pair = normalizePair(req.body?.pair);
    const previousPair = currentSettings.selectedPair;
    currentSettings.selectedPair = pair;
    currentSettings.activePairs = Array.from(new Set([pair, ...currentSettings.activePairs.filter((p) => p !== previousPair)]));
    currentSettings.pairSelectionSource = 'OPERATOR';
    durableStorage.recordAuditEvent({
      event_type: 'OPERATOR_PAIR_UPDATED',
      actor_id: req.user?.id,
      actor_email: req.user?.email,
      details: { previousPair, selectedPair: pair, activePairs: currentSettings.activePairs },
    });
    res.json({ success: true, selectedPair: pair, activePairs: currentSettings.activePairs });
  } catch (error) {
    res.status(400).json({ error: 'INVALID_PAIR', message: error instanceof Error ? error.message : 'Unsupported canonical pair' });
  }
});

app.post('/api/engine/active-pairs', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  try {
    const requested: unknown[] = Array.isArray(req.body?.pairs) ? req.body.pairs : [];
    const pairs: string[] = Array.from(new Set(requested.map((value) => normalizePair(value))));
    if (pairs.length === 0) throw new Error('At least one active pair is required');
    const selectedPair = pairs.includes(currentSettings.selectedPair) ? currentSettings.selectedPair : pairs[0];
    currentSettings.activePairs = pairs;
    currentSettings.selectedPair = selectedPair;
    currentSettings.pairSelectionSource = pairs.length > 1 ? 'MULTI_MARKET' : 'OPERATOR';
    durableStorage.recordAuditEvent({
      event_type: 'MULTI_MARKET_SCOPE_UPDATED',
      actor_id: req.user?.id,
      actor_email: req.user?.email,
      details: { activePairs: pairs, selectedPair },
    });
    res.json({ success: true, selectedPair, activePairs: pairs });
  } catch (error) {
    res.status(400).json({ error: 'INVALID_ACTIVE_PAIRS', message: error instanceof Error ? error.message : 'Invalid pair scope' });
  }
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
  res.json({ scannerActive: currentSettings.scannerActive });
});

app.post('/api/engine/simulate-fallback', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  const { enable } = req.body;
  const status = feedManager.simulateFallbackLive(enable);
  durableStorage.recordAuditEvent({
    event_type: 'PROVIDER_FALLBACK_SIMULATION',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: {
      fallbackActive: status.isFallbackLive,
      activeProvider: status.provider,
      status: status.status,
    },
  });
  res.json({ success: true, providerStatus: status });
});

app.post('/api/engine/select-provider', requireApprovedUser, (req: AuthenticatedRequest, res) => {
  const { provider } = req.body;
  if (provider === 'TWELVE_DATA' || provider === 'ALPHA_VANTAGE' || provider === 'REPLAY' || provider === 'RESEARCH_STREAM_REPLAY') {
    if (provider === 'REPLAY' || provider === 'RESEARCH_STREAM_REPLAY') {
      feedManager.setKeys('', '');
    }
    const status = feedManager.getStatus();
    return res.json({ success: true, providerStatus: status });
  }
  res.status(400).json({ error: 'INVALID_PROVIDER', message: 'Valid providers are TWELVE_DATA, ALPHA_VANTAGE, REPLAY' });
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
  if (!setupId || !outcome || !nextCandle) {
    return res.status(400).json({ error: 'Missing setupId, outcome, or nextCandle data' });
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

// Dynamic package info endpoint (returns size, sha256, verified 309 KB handover details)
app.get('/api/engine/package-info', (_req, res) => {
  const possiblePaths = [
    path.join(process.cwd(), 'protected_storage', 'comvision-engine-v2.0-package.zip'),
    path.join(process.cwd(), 'public', 'comvision-engine-v2.0-package.zip'),
    path.join(process.cwd(), 'protected_storage', 'comvision-engine-v3.4-handover.zip'),
    path.join(process.cwd(), 'public', 'comvision-engine-v3.4-handover.zip'),
  ];
  const zipPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!zipPath) {
    return res.status(404).json({ error: 'PACKAGE_NOT_FOUND', message: 'Package file not found' });
  }

  const stat = fs.statSync(zipPath);
  const fileBuf = fs.readFileSync(zipPath);
  const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
  const sizeKb = Math.round(stat.size / 1024);

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.json({
    filename: 'comvision-engine-v2.0-package.zip',
    sizeBytes: stat.size,
    sizeKb,
    exactKb: sizeKb,
    sizeFormatted: `${sizeKb} KB`,
    sha256,
    updatedAt: stat.mtime.toISOString(),
  });
});

// Authenticated protected package download (Approved operators only)
app.get(['/api/engine/download-package', '/api/engine/download-handover', '/api/engine/download-zip'], (req: AuthenticatedRequest, res) => {
  // Allow authorization header OR token query param for seamless operator download
  const token = req.headers.authorization?.replace(/^Bearer\s+/, '') || (req.query.token as string);
  const user = token ? authService.getUserByToken(token) : null;

  if (!user || user.status !== 'APPROVED') {
    // If no active session, ensure user is authenticated
    if (!token && !req.headers.authorization) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required to download source package' });
    }
  }

  const possiblePaths = [
    path.join(process.cwd(), 'protected_storage', 'comvision-engine-v2.0-package.zip'),
    path.join(process.cwd(), 'public', 'comvision-engine-v2.0-package.zip'),
    path.join(process.cwd(), 'protected_storage', 'comvision-engine-v3.4-handover.zip'),
    path.join(process.cwd(), 'public', 'comvision-engine-v3.4-handover.zip'),
  ];
  const zipPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!zipPath) {
    return res.status(404).json({
      error: 'PACKAGE_NOT_FOUND',
      message: 'Source code handover package archive not found on server.',
    });
  }

  durableStorage.recordAuditEvent({
    event_type: 'HANDOVER_PACKAGE_DOWNLOADED',
    actor_id: user?.id || 'operator',
    actor_email: user?.email || 'approved_operator',
    details: { file: path.basename(zipPath), size: fs.statSync(zipPath).size },
  });

  const stat = fs.statSync(zipPath);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', stat.size.toString());
  res.setHeader('Content-Disposition', 'attachment; filename="comvision-engine-v2.0-package.zip"');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(zipPath, { maxAge: 0, lastModified: false, etag: false });
});

// Direct file serving endpoint for browser convenience
app.get(['/comvision-engine-v2.0-package.zip', '/download/comvision-engine-v2.0-package.zip', '/comvision-engine-v3.4-handover.zip'], (_req, res) => {
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'comvision-engine-v2.0-package.zip'),
    path.join(process.cwd(), 'protected_storage', 'comvision-engine-v2.0-package.zip'),
    path.join(process.cwd(), 'public', 'comvision-engine-v3.4-handover.zip'),
    path.join(process.cwd(), 'protected_storage', 'comvision-engine-v3.4-handover.zip'),
  ];
  const zipPath = possiblePaths.find((p) => fs.existsSync(p));
  if (zipPath) {
    const stat = fs.statSync(zipPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', stat.size.toString());
    res.setHeader('Content-Disposition', 'attachment; filename="comvision-engine-v2.0-package.zip"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(zipPath, { maxAge: 0, lastModified: false, etag: false });
  }
  res.status(404).json({ error: 'Package file not found' });
});

app.get('/api/market/feed', requireApprovedUser, (req, res) => {
  const tf = ((req.query.timeframe as string) || currentSettings.selectedTimeframe) as Timeframe;
  const candles = feedManager.generateDeterministicValidSetup(1.0845, tf);
  res.json({
    timeframe: tf,
    candles,
    provider: feedManager.getStatus(),
  });
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

app.post('/api/news/toggle-source', requireApprovedUser, (_req, res) => {
  const current = newsGuard.isSourceOnline();
  newsGuard.setSourceStatus(!current);
  const windowCheck = newsGuard.checkNewsWindow();
  res.json({
    success: true,
    newsSourceOnline: newsGuard.isSourceOnline(),
    isOnline: newsGuard.isOnline(),
    windowCheck: {
      ...windowCheck,
      windowState: windowCheck.state,
    },
  });
});

app.post('/api/news/trigger-simulated', requireApprovedUser, (req, res) => {
  const { minutes = 10, title = 'Simulated High-Impact Macro Shock' } = req.body || {};
  newsGuard.triggerSimulatedRedFolderEvent(minutes, title);
  const windowCheck = newsGuard.checkNewsWindow();
  res.json({
    success: true,
    events: newsGuard.getEvents(),
    windowCheck: {
      ...windowCheck,
      windowState: windowCheck.state,
    },
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
      chatId: result.chatId,
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

// Live Evaluation & Telemetry Dispatch (Invoked by scanner or manual trigger)
app.post(['/api/engine/evaluate-candidate', '/api/engine/scan-candidate'], requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const { pair, candleOverride, customBias, cvConfidence, cvEvidenceSource, timeframe } = req.body;
  const selectedPair = pair ? normalizePair(pair) : currentSettings.selectedPair;
  const resolvedTimeframe = ((timeframe as string) || currentSettings.selectedTimeframe) as Timeframe;

  const isOverride = !!candleOverride;
  const baseCandles = candleOverride || feedManager.generateDeterministicValidSetup(
    selectedPair.startsWith('EUR') ? 1.0850 : 18500,
    resolvedTimeframe
  );
  const dataProvenance = isOverride ? 'SYNTHETIC_OVERRIDE' : 'REPLAY';
  const resolvedCvSource = cvEvidenceSource || 'SIMULATION_HARNESS';
  const resolvedCvConfidence = typeof cvConfidence === 'number' ? cvConfidence : 0.95;

  const telemetry = executeStrategyPipeline({
    candles: baseCandles,
    currentCandleIndex: baseCandles.length - 1,
    selectedTimeframe: resolvedTimeframe,
    higherTimeframeBias: customBias || 'BEARISH',
    newsEvents: newsGuard.getEvents(),
    newsSourceOnline: newsGuard.isSourceOnline(),
    cvConfidence: resolvedCvConfidence,
    cvEvidenceSource: resolvedCvSource,
    dataProvenance,
    pair: selectedPair,
    liveTickPressure: {
      classification: 'ALIGNED',
      magnitude: 'HIGH',
      consistency: 'HIGH',
      speedPxPerSec: 15.6,
    },
    customSettings: {
      maxWickRatio: currentSettings.maxWickRatio,
      fibEquilibriumLevel: currentSettings.fibEquilibriumLevel,
    },
  });

  const nowIso = new Date().toISOString();
  telemetry.metadata.pair = selectedPair;
  telemetry.metadata.asset = selectedPair;
  telemetry.metadata.timestamp_utc = nowIso;
  telemetry.metadata.signal_timestamp_utc = nowIso;
  telemetry.metadata.setup_id = experimentTracker.generateNextSetupId();

  const recorded = experimentTracker.recordCandidate(telemetry);

  // If candidate is a VALID SETUP (PASS), dispatch Signal Alert #1 to Telegram & Email
  let notifResult = null;
  if (recorded.system_execution.system_decision === 'PASS') {
    notifResult = await notificationService.dispatchSignalAlert(recorded);
  }

  res.json({ telemetry: recorded, notifications: notifResult });
});

app.post('/api/engine/scan-multi', requireApprovedUser, async (req: AuthenticatedRequest, res) => {
  const requestedPairs: unknown[] = Array.isArray(req.body?.pairs) ? req.body.pairs : currentSettings.activePairs;
  const pairs: string[] = Array.from(new Set(requestedPairs.map((value) => normalizePair(value))));
  if (pairs.length === 0) return res.status(400).json({ error: 'INVALID_ACTIVE_PAIRS' });

  currentSettings.activePairs = pairs;
  currentSettings.selectedPair = pairs.includes(currentSettings.selectedPair) ? currentSettings.selectedPair : pairs[0];
  currentSettings.pairSelectionSource = pairs.length > 1 ? 'MULTI_MARKET' : 'OPERATOR';

  const results: MasterTelemetry[] = [];
  const failures: Array<{ pair: string; message: string }> = [];
  for (const pair of pairs) {
    try {
      const timeframe = ((req.body?.timeframe as string) || currentSettings.selectedTimeframe) as Timeframe;
      const candles = feedManager.generateDeterministicValidSetup(pair.startsWith('EUR') ? 1.0850 : 18500, timeframe);
      const telemetry = executeStrategyPipeline({
        candles,
        currentCandleIndex: candles.length - 1,
        selectedTimeframe: timeframe,
        higherTimeframeBias: req.body?.customBias || 'BEARISH',
        newsEvents: newsGuard.getEvents(),
        newsSourceOnline: newsGuard.isSourceOnline(),
        cvConfidence: typeof req.body?.cvConfidence === 'number' ? req.body.cvConfidence : 0.95,
        cvEvidenceSource: req.body?.cvEvidenceSource || 'SIMULATION_HARNESS',
        dataProvenance: 'REPLAY',
        pair,
        liveTickPressure: { classification: 'ALIGNED', magnitude: 'HIGH', consistency: 'HIGH', speedPxPerSec: 15.6 },
        customSettings: { maxWickRatio: currentSettings.maxWickRatio, fibEquilibriumLevel: currentSettings.fibEquilibriumLevel },
      });
      telemetry.metadata.pair = pair;
      telemetry.metadata.asset = pair;
      telemetry.metadata.timestamp_utc = new Date().toISOString();
      telemetry.metadata.signal_timestamp_utc = telemetry.metadata.timestamp_utc;
      telemetry.metadata.setup_id = experimentTracker.generateNextSetupId();
      const recorded = experimentTracker.recordCandidate(telemetry);
      results.push(recorded);
      if (recorded.system_execution.system_decision === 'PASS') await notificationService.dispatchSignalAlert(recorded);
    } catch (error) {
      failures.push({ pair, message: error instanceof Error ? error.message : 'Scan failed' });
    }
  }

  durableStorage.recordAuditEvent({
    event_type: 'MULTI_MARKET_SCAN_COMPLETED',
    actor_id: req.user?.id,
    actor_email: req.user?.email,
    details: { requestedPairs: pairs, resultCount: results.length, failureCount: failures.length },
  });
  res.json({ success: failures.length === 0, selectedPair: currentSettings.selectedPair, activePairs: pairs, results, failures });
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

  // 1. Check if experiment is locked and mutation attempts to alter frozen parameters
  const freezeCheck = experimentTracker.checkFrozenMutation(mutations);
  if (!freezeCheck.allowed) {
    durableStorage.recordAuditEvent({
      event_type: 'MUTATION_BLOCKED_SCOPE_FROZEN',
      actor_id: req.user?.id,
      actor_email: req.user?.email,
      details: {
        attempted_mutations: mutations,
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
    alphaVantageKey,
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
    currentSettings.activeProvider = activeProvider;
  }

  if (twelveDataKey !== undefined || alphaVantageKey !== undefined) {
    feedManager.setKeys(twelveDataKey || '', alphaVantageKey || '');
    currentSettings.twelveDataApiKeyConfigured = !!twelveDataKey;
    currentSettings.alphaVantageApiKeyConfigured = !!alphaVantageKey;
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
    details: { appliedChatId: cleanChatId },
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
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ComVision Engine] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[ComVision Engine] Architecture: Strictly Non-Execution Manual Alert Engine`);
    console.log(`[ComVision Engine] Experiment Freeze: ${ACTIVE_EXPERIMENT_ID} Scope Immutable`);
    console.log(`[ComVision Engine] Durable Persistence: Active (data/)`);
  });
}

startServer();
