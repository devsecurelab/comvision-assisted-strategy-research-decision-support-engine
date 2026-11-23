// Master Application Component
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React, { lazy, Suspense, useState, useEffect, useReducer } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DecisionAlertCard } from './components/DecisionAlertCard';
import { BinaryStatusCard } from './components/BinaryStatusCard';
import { SetupLogsTable } from './components/SetupLogsTable';
import { TelemetryModal } from './components/TelemetryModal';
import { RecordResultModal } from './components/RecordResultModal';
import { ChartModal } from './components/ChartModal';
import { AuthModal } from './components/AuthModal';
import { ValidSetupsModal } from './components/ValidSetupsModal';
import { ValidSetupsFeed } from './components/ValidSetupsFeed';
import { PublicLanding } from './components/PublicLanding';
import { ChevronRight } from 'lucide-react';
const ExperimentView = lazy(() => import('./components/views/ExperimentView').then((module) => ({ default: module.ExperimentView })));
const AnalyticsView = lazy(() => import('./components/views/AnalyticsView').then((module) => ({ default: module.AnalyticsView })));
const RiskView = lazy(() => import('./components/views/RiskView').then((module) => ({ default: module.RiskView })));
const SettingsView = lazy(() => import('./components/views/SettingsView').then((module) => ({ default: module.SettingsView })));
const AuditLogView = lazy(() => import('./components/views/AuditLogView').then((module) => ({ default: module.AuditLogView })));
const UserManagementView = lazy(() => import('./components/views/UserManagementView').then((module) => ({ default: module.UserManagementView })));
import { DocsLayout } from './components/docs/DocsLayout';
const DocsView = lazy(() => import('./components/docs/DocsView').then((module) => ({ default: module.DocsView })));
const AboutView = lazy(() => import('./components/docs/AboutView').then((module) => ({ default: module.AboutView })));
const PrivacyView = lazy(() => import('./components/docs/PrivacyView').then((module) => ({ default: module.PrivacyView })));
const TermsView = lazy(() => import('./components/docs/TermsView').then((module) => ({ default: module.TermsView })));
const SecurityView = lazy(() => import('./components/docs/SecurityView').then((module) => ({ default: module.SecurityView })));
import { Footer } from './components/Footer';
import { SampleRate } from './components/SampleRate';
import {
  MasterTelemetry,
  Timeframe,
  UserAccount,
  UserRecordedAction,
  NextCandleObservation,
} from './engine/types';
import { ProviderStatus } from './engine/dataProviders';
import { apiFetch } from './config/api';
import { alertReducer, initialAlertState } from './alertState';

function readStoredUser(): Omit<UserAccount, 'passwordHash'> | null {
  try {
    const raw = localStorage.getItem('comvision_user');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Omit<UserAccount, 'passwordHash'> : null;
  } catch {
    return null;
  }
}

interface LedgerStats {
  signals: number;
  resolved: number;
  wins: number;
  losses: number;
  ties: number;
  winRatePercentage: number | null;
}

export default function App() {
  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(() =>
    sessionStorage.getItem('comvision_auth_token')
  );
  const [currentUser, setCurrentUser] = useState<Omit<
    UserAccount,
    'passwordHash'
  > | null>(() => {
    return readStoredUser();
  });

  // UI view state
  const [inPublicPortal, setInPublicPortal] = useState<boolean>(!authToken);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [toast, setToast] = useState<{ severity: 'warning' | 'error'; message: string } | null>(null);
  const [isManualScanPending, setIsManualScanPending] = useState(false);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ severity?: 'warning' | 'error'; message?: string }>).detail;
      if (!detail?.message) return;
      setToast({ severity: detail.severity === 'error' ? 'error' : 'warning', message: detail.message });
      window.setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener('comvision:toast', onToast);
    return () => window.removeEventListener('comvision:toast', onToast);
  }, []);

  // Routing state for public docs and legal pages
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (['/docs', '/documentation', '/about', '/privacy', '/terms', '/security'].includes(path)) {
        return path;
      }
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/';
      setCurrentRoute(path);
      if (!['/docs', '/documentation', '/about', '/privacy', '/terms', '/security'].includes(path)) {
        if (!authToken) {
          setInPublicPortal(true);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authToken]);

  const handleNavigate = (route: string) => {
    if (route === '/dashboard') {
      if (authToken && currentUser?.status === 'APPROVED') {
        window.history.pushState({}, '', '/');
        setCurrentRoute('/');
        setInPublicPortal(false);
      } else {
        setIsAuthModalOpen(true);
      }
      return;
    }
    window.history.pushState({}, '', route);
    setCurrentRoute(route);
    if (route === '/' && !authToken) {
      setInPublicPortal(true);
    }
  };

  // Engine state
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [alertState, dispatchAlert] = useReducer(alertReducer, initialAlertState);
  const currentAlert = (alertState.selectedSetup ?? alertState.serverActiveAlert) as MasterTelemetry | null;
  const actionAlert = alertState.actionCardVisible ? currentAlert : null;
  const [candidateHistory, setCandidateHistory] = useState<MasterTelemetry[]>([]);
  const [ledgerStats, setLedgerStats] = useState<LedgerStats | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | undefined>();
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('5m');
  const [selectedProvider, setSelectedProvider] = useState<'TWELVE_DATA'>('TWELVE_DATA');

  // Modals state
  const [inspectTelemetry, setInspectTelemetry] = useState<MasterTelemetry | null>(
    null
  );
  const [recordingSetupId, setRecordingSetupId] = useState<string | null>(null);
  const [chartModalTelemetry, setChartModalTelemetry] =
    useState<MasterTelemetry | null>(null);
  const [isValidSetupsModalOpen, setIsValidSetupsModalOpen] =
    useState<boolean>(false);

  // Sync auth state to localStorage
  const handleAuthSuccess = (
    token: string,
    user: Omit<UserAccount, 'passwordHash'>
  ) => {
    setAuthToken(token);
    setCurrentUser(user);
    sessionStorage.setItem('comvision_auth_token', token);
    localStorage.setItem('comvision_user', JSON.stringify(user));
    setInPublicPortal(false);
  };

  const handleLogout = () => {
    if (authToken) {
      apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    setAuthToken(null);
    setCurrentUser(null);
    sessionStorage.removeItem('comvision_auth_token');
    localStorage.removeItem('comvision_auth_token');
    localStorage.removeItem('comvision_user');
    setInPublicPortal(true);
  };

  // Fetch engine data
  const fetchEngineData = async () => {
    if (!authToken) return;

    try {
      // 1. Fetch Engine Status & Active Alert
      const statusRes = await apiFetch('/api/engine/status', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (statusRes.status === 401 || statusRes.status === 403) {
        handleLogout();
        return;
      }

      if (statusRes.ok && statusRes.headers.get('content-type')?.includes('application/json')) {
        const data = await statusRes.json();
        dispatchAlert({
          type: 'POLL_SUCCESS',
          activeAlert: data.activeAlert ?? null,
          serverNowUtc: data.serverNowUtc,
          signalAgeSeconds: data.signal_age_seconds,
          entryWindowExpired: data.entry_window_expired === true,
        });
        if (data.providerStatus) {
          setProviderStatus(data.providerStatus);
          if (data.providerStatus.provider === 'TWELVE_DATA') setSelectedProvider('TWELVE_DATA');
        }
        setScannerActive(data.settings?.scannerActive ?? false);
        if (data.ledgerStats) setLedgerStats(data.ledgerStats as LedgerStats);
      } else {
        dispatchAlert({ type: 'API_FAILURE', message: 'Scanner state unknown' });
      }

      // 2. Fetch Candidates
      const candRes = await apiFetch('/api/engine/candidates?limit=50', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (candRes.ok && candRes.headers.get('content-type')?.includes('application/json')) {
        const data = await candRes.json();
        if (Array.isArray(data.candidates)) {
          const seen = new Set<string>();
          const uniqueList: MasterTelemetry[] = [];
          for (const cand of data.candidates) {
            const sid = cand.metadata?.setup_id;
            if (!sid || !seen.has(sid)) {
              if (sid) seen.add(sid);
              uniqueList.push(cand);
            }
          }
          setCandidateHistory(uniqueList);
        }
      }

      const statsRes = await apiFetch('/api/ledger/stats', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (statsRes.ok && statsRes.headers.get('content-type')?.includes('application/json')) {
        setLedgerStats(await statsRes.json() as LedgerStats);
      } else {
        setLedgerStats(null);
      }

    } catch (err) {
      dispatchAlert({ type: 'API_FAILURE', message: 'Scanner state unknown' });
      console.error('Error fetching engine data:', err);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchEngineData();
    }
  }, [authToken]);

  // Periodic polling when scanner is active
  useEffect(() => {
    if (!authToken || !scannerActive) return;

    const interval = setInterval(() => {
      fetchEngineData();
    }, 10000);

    return () => clearInterval(interval);
  }, [authToken, scannerActive]);

  // Actions
  const handleToggleScanner = async () => {
    if (!authToken || alertState.controlsDisabled) return;
    const command = scannerActive ? 'stop' : 'start';
    dispatchAlert({ type: 'SCANNER_COMMAND_PENDING', command });
    try {
      const res = await apiFetch('/api/engine/toggle-scanner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ active: !scannerActive }),
      });
      if (res.ok) {
        const data = await res.json();
        setScannerActive(data.scannerActive);
        dispatchAlert({ type: 'SCANNER_COMMAND_SUCCESS', command });
      } else {
        dispatchAlert({ type: 'SCANNER_COMMAND_FAILURE', command, message: `Failed to ${command} scanner (HTTP ${res.status}).` });
      }
    } catch (err) {
      dispatchAlert({ type: 'SCANNER_COMMAND_FAILURE', command, message: `Failed to ${command} scanner: network request failed.` });
      console.error('Failed to toggle scanner:', err);
    }
  };

  const handleStopScanning = async () => {
    if (!authToken || alertState.controlsDisabled) return;
    dispatchAlert({ type: 'SCANNER_COMMAND_PENDING', command: 'stop' });
    try {
      const res = await apiFetch('/api/engine/toggle-scanner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) {
        setScannerActive(false);
        dispatchAlert({ type: 'SCANNER_COMMAND_SUCCESS', command: 'stop' });
      } else {
        dispatchAlert({ type: 'SCANNER_COMMAND_FAILURE', command: 'stop', message: `STOP FAILED (HTTP ${res.status}). Scanner state is unknown; do not assume alerts are stopped.` });
      }
    } catch (err) {
      dispatchAlert({ type: 'SCANNER_COMMAND_FAILURE', command: 'stop', message: 'STOP FAILED: network request failed. Scanner state is unknown; do not assume alerts are stopped.' });
      console.error('Failed to stop scanner:', err);
    }
  };

  const handleManualScan = async () => {
    if (!authToken || isManualScanPending) return;
    setIsManualScanPending(true);
    try {
      const res = await apiFetch('/api/engine/scan-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ timeframe: selectedTimeframe }),
      });
      if (res.ok) {
        const data = await res.json();
        dispatchAlert({ type: 'SELECT_SETUP', setup: data.telemetry });
        if (data.providerStatus) setProviderStatus(data.providerStatus);
        fetchEngineData();
      } else dispatchAlert({ type: 'API_FAILURE', message: `Manual scan failed (HTTP ${res.status}).` });
    } catch (err) {
      dispatchAlert({ type: 'API_FAILURE', message: 'Manual scan failed: network request failed.' });
      console.error('Failed manual scan:', err);
    } finally {
      setIsManualScanPending(false);
    }
  };

  const handleRecordUserAction = async (
    setupId: string,
    action: UserRecordedAction,
    observation?: NextCandleObservation,
    brokerEntryPrice?: number,
  ): Promise<boolean> => {
    if (!authToken) return false;
    try {
      // 1. Record User Action (strictly separate operator discretionary field)
      const resAction = await apiFetch('/api/engine/record-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ setupId, action, ...(brokerEntryPrice !== undefined ? { brokerEntryPrice } : {}) }),
      });

      // 2. Record only the operator's observation; never invent OHLC data in the client.
      if (observation && observation !== 'PENDING') {
        const outcomeRes = await apiFetch('/api/engine/record-outcome', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            setupId,
            outcome: observation,
            notes: `Operator empirical recording: Observation ${observation}, Action ${action}`,
          }),
        });
        if (!outcomeRes.ok) {
          dispatchAlert({ type: 'API_FAILURE', message: `Outcome recording failed (HTTP ${outcomeRes.status}).` });
          return false;
        }
      }

      if (resAction.ok) {
        fetchEngineData();
        if (currentAlert && currentAlert.metadata.setup_id === setupId) {
          dispatchAlert({ type: 'SELECT_SETUP', setup: {
            ...currentAlert,
            system_execution: {
              ...currentAlert.system_execution,
              user_recorded_action: action,
            },
            next_candle_observation: observation ? { status: observation } : currentAlert.next_candle_observation,
          } });
        }
        return true;
      }
      dispatchAlert({ type: 'API_FAILURE', message: `Action recording failed (HTTP ${resAction.status}).` });
      return false;
    } catch (err) {
      dispatchAlert({ type: 'API_FAILURE', message: 'Action recording failed: network request failed.' });
      console.error('Failed to record action and observation:', err);
      return false;
    }
  };


  const handleMarkTaken = async (): Promise<void> => {
    if (!currentAlert) return;
    const raw = window.prompt('Enter the broker entry price used for this taken setup:');
    if (raw === null || !raw.trim()) return;
    const brokerEntryPrice = Number(raw);
    if (!Number.isFinite(brokerEntryPrice) || brokerEntryPrice <= 0) {
      window.alert('A finite positive broker entry price is required. No action was recorded.');
      return;
    }
    await handleRecordUserAction(currentAlert.metadata.setup_id, 'TAKEN', undefined, brokerEntryPrice);
  };

  const handleSelectTimeframe = async (tf: Timeframe) => {
    setSelectedTimeframe(tf);
    if (!authToken) return;
    try {
      const res = await apiFetch('/api/engine/select-timeframe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ timeframe: tf }),
      });
      if (res.ok) {
        fetchEngineData();
      }
    } catch (err) {
      console.error('Failed to sync timeframe selection to server:', err);
    }
  };

  const handleSelectProvider = async (provider: 'TWELVE_DATA') => {
    setSelectedProvider(provider);
    if (!authToken) return;
    try {
      const res = await apiFetch('/api/engine/select-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
        const data = await res.json();
        setProviderStatus(data.providerStatus);
      }
    } catch (err) {
      console.error('Failed to select market data provider:', err);
    }
  };

  // If visiting public documentation or legal pages, render DocsLayout
  if (['/docs', '/documentation', '/about', '/privacy', '/terms', '/security'].includes(currentRoute)) {
    return (
      <>
        <DocsLayout
          currentPath={currentRoute}
          onNavigate={handleNavigate}
          isAuthenticated={!!authToken}
          userStatus={currentUser?.status}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        >
          <Suspense fallback={<div className="p-8 text-slate-400">Loading documentation…</div>}>
            {(currentRoute === '/docs' || currentRoute === '/documentation') && <DocsView />}
            {currentRoute === '/about' && <AboutView />}
            {currentRoute === '/privacy' && <PrivacyView />}
            {currentRoute === '/terms' && <TermsView />}
            {currentRoute === '/security' && <SecurityView />}
          </Suspense>
        </DocsLayout>
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  // If in public portal or not authenticated, render Public Website
  if (inPublicPortal || !authToken) {
    return (
      <>
        <PublicLanding
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onEnterDashboardIfApproved={() => {
            if (currentUser?.status === 'APPROVED') {
              setInPublicPortal(false);
            } else {
              setIsAuthModalOpen(true);
            }
          }}
          isAuthenticated={!!authToken}
          userStatus={currentUser?.status}
          onNavigate={handleNavigate}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
        />
      </>
    );
  }

  // Calculate Overview Stats Cards
  const validSetups = candidateHistory.filter(
    (c) => c.system_execution.system_decision === 'PASS'
  );
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentSignals = validSetups.filter((candidate) => {
    const timestamp = Date.parse(candidate.metadata.signal_timestamp_utc || candidate.metadata.timestamp_utc);
    return Number.isFinite(timestamp) && timestamp >= recentCutoff;
  });
  const rejectedCount = candidateHistory.filter(
    (c) => c.system_execution.system_decision === 'REJECT'
  ).length;
  const favorableCount = candidateHistory.filter((c) => c.next_candle_observation?.status === 'NEXT_CANDLE_FAVORABLE').length;
  const unfavorableCount = candidateHistory.filter((c) => c.next_candle_observation?.status === 'NEXT_CANDLE_UNFAVORABLE').length;
  const researchSampleSize = favorableCount + unfavorableCount;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {toast && <div role="status" className={`fixed right-5 top-5 z-[100] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl ${toast.severity === 'error' ? 'border-rose-500 bg-rose-950 text-rose-100' : 'border-amber-500 bg-amber-950 text-amber-100'}`}>{toast.message}</div>}
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        onSwitchToPublic={() => setInPublicPortal(true)}
        onNavigate={handleNavigate}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Status Bar */}
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          scannerActive={scannerActive}
          onToggleScanner={handleToggleScanner}
          onStopScanning={handleStopScanning}
          onManualScan={handleManualScan}
          providerStatus={providerStatus}
          controlsDisabled={alertState.controlsDisabled || isManualScanPending}
          />

        {/* Dynamic View Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {alertState.banner && (
            <div role="alert" className={`max-w-7xl mx-auto w-full rounded-xl border-2 px-5 py-4 shadow-lg ${alertState.banner.severity === 'critical' ? 'border-rose-500 bg-rose-950/95 text-rose-50' : 'border-amber-500 bg-amber-950/90 text-amber-50'}`}>
              <div className="text-base sm:text-lg font-black tracking-wide">{alertState.banner.message}</div>
              <p className="mt-1 text-sm opacity-90">The server state could not be confirmed. No action should be taken until the connection is healthy.</p>
            </div>
          )}
          {(!currentAlert || currentAlert.metadata.data_provenance !== 'LIVE_INGESTED' || providerStatus?.status === 'OFFLINE') && (
            <div role="alert" className="max-w-7xl mx-auto w-full rounded-xl border-2 border-rose-500 bg-rose-950/90 px-5 py-4 text-rose-50 shadow-lg shadow-rose-950/40">
              <div className="text-base sm:text-lg font-black tracking-wide">⚠️ LIVE DATA UNAVAILABLE — NO ALERT</div>
              <p className="mt-1 text-sm text-rose-100">No verified live market data is available for the current setup. Alerts remain unavailable until a live provider response is verified.</p>
            </div>
          )}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto w-full">
              {/* Stats Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    SIGNALS RECORDED
                  </span>
                  <span className="text-2xl font-bold font-mono text-white mt-1 block">
                    {ledgerStats?.signals ?? 'UNAVAILABLE'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    authoritative ledger count
                  </span>
                </div>

                <div
                  id="card-valid-setups-pass"
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsValidSetupsModalOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setIsValidSetupsModalOpen(true);
                    }
                  }}
                  className="p-4 bg-slate-900 border border-emerald-500/40 hover:border-emerald-500/80 hover:bg-slate-900/90 rounded-xl shadow-sm cursor-pointer group transition-all relative overflow-hidden"
                  title="Click to view all detected valid setups"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-400 block">
                      Recent signals (24h)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition flex items-center gap-0.5">
                      View All <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                    {recentSignals.length}
                  </span>
                  <span className="text-[10px] text-emerald-500/80 mt-0.5 block font-mono">
                    Click to view all {recentSignals.length} recent signals →
                  </span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    RESOLVED RESULTS
                  </span>
                  <span className="text-2xl font-bold font-mono text-rose-400 mt-1 block">
                    {ledgerStats?.resolved ?? 'UNAVAILABLE'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    authoritative ledger count
                  </span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    WIN RATE
                  </span>
                  <span className="text-2xl font-bold font-mono text-indigo-300 mt-1 block">
                    {ledgerStats?.winRatePercentage === null || !ledgerStats ? 'UNAVAILABLE' : `${ledgerStats.winRatePercentage.toFixed(1)}%`}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {ledgerStats ? `${ledgerStats.wins} wins / ${ledgerStats.losses} losses` : 'authoritative ledger unavailable'}
                  </span>
                </div>
              </div>

              {/* Active Valid Setups Horizontal Right-to-Left Feed */}
              <ValidSetupsFeed
                validSetups={recentSignals}
                selectedSetupId={currentAlert?.metadata.setup_id}
                onSelectSetup={(setup) => dispatchAlert({ type: 'SELECT_SETUP', setup })}
                onOpenAllList={() => setIsValidSetupsModalOpen(true)}
              />

              {/* Primary Dual Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-3">
                  <BinaryStatusCard alert={actionAlert} scannerActive={scannerActive} />
                </div>
                {/* Left 2 Cols: Decision Alert Card */}
                <div className="lg:col-span-2">
                  <DecisionAlertCard
                    alert={actionAlert}
                    validSetupsList={recentSignals}
                    onSelectSetup={(setup) => dispatchAlert({ type: 'SELECT_SETUP', setup })}
                    onOpenAllList={() => setIsValidSetupsModalOpen(true)}
                    onMarkTaken={handleMarkTaken}
                    onSkip={() =>
                      currentAlert &&
                      handleRecordUserAction(
                        currentAlert.metadata.setup_id,
                        'SKIPPED'
                      )
                    }
                    onRecordResult={() =>
                      currentAlert &&
                      setRecordingSetupId(currentAlert.metadata.setup_id)
                    }
                    onInspectTelemetry={() =>
                      currentAlert && setInspectTelemetry(currentAlert)
                    }
                    onOpenChart={() =>
                      currentAlert && setChartModalTelemetry(currentAlert)
                    }
                  />
                </div>

              </div>

              {/* Recent Activity Table */}
              <SetupLogsTable
                candidates={candidateHistory}
                onSelectCandidate={(c) => setInspectTelemetry(c)}
                onViewAllLogs={() => setActiveTab('logs')}
              />
            </div>
          )}

          <Suspense fallback={<div className="p-8 text-slate-400">Loading dashboard view…</div>}>
          {activeTab === 'experiment' && (
            <ExperimentView candidates={candidateHistory} />
          )}

          {activeTab === 'logs' && (
            <SetupLogsTable
              candidates={candidateHistory}
              onSelectCandidate={(c) => setInspectTelemetry(c)}
              onViewAllLogs={() => {}}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView candidates={candidateHistory} />
          )}

          {activeTab === 'risk' && <RiskView />}

          {activeTab === 'settings' && (
            <SettingsView
              selectedTimeframe={selectedTimeframe}
              onSelectTimeframe={handleSelectTimeframe}
              selectedProvider={selectedProvider}
              onSelectProvider={handleSelectProvider}
              providerStatus={providerStatus}
              onProviderStatusChange={setProviderStatus}
                    authToken={authToken}
              isAdmin={currentUser?.role === 'ADMIN'}
            />
          )}

          {activeTab === 'audit' && <AuditLogView />}

          {activeTab === 'users' && authToken && (
            <UserManagementView authToken={authToken} />
          )}

          </Suspense>
          {/* Consistent Footer in Authenticated Dashboard */}
          <div className="pt-8">
            <Footer
              currentPath="/dashboard"
              onNavigate={handleNavigate}
              isAuthenticated={true}
              userStatus={currentUser?.status}
              onOpenAuth={() => {}}
            />
          </div>
        </main>
      </div>

      {/* Telemetry Schema Inspector Modal */}
      <TelemetryModal
        telemetry={inspectTelemetry}
        onClose={() => setInspectTelemetry(null)}
      />

      {/* Record Result Modal */}
      {recordingSetupId && (
        <RecordResultModal
          setupId={recordingSetupId}
          currentAction={
            candidateHistory.find(
              (c) => c.metadata.setup_id === recordingSetupId
            )?.system_execution.user_recorded_action || 'PENDING'
          }
          currentObservation={
            candidateHistory.find(
              (c) => c.metadata.setup_id === recordingSetupId
            )?.next_candle_observation?.status || 'PENDING'
          }
          onSave={handleRecordUserAction}
          onClose={() => setRecordingSetupId(null)}
        />
      )}

      {/* Chart Modal */}
      <ChartModal
        telemetry={chartModalTelemetry}
        onClose={() => setChartModalTelemetry(null)}
      />

      {/* Valid Setups Modal / Full List */}
      <ValidSetupsModal
        isOpen={isValidSetupsModalOpen}
        onClose={() => setIsValidSetupsModalOpen(false)}
        validSetups={recentSignals}
        selectedSetupId={currentAlert?.metadata.setup_id}
        onSelectSetup={(setup) => {
          dispatchAlert({ type: 'SELECT_SETUP', setup });
          setActiveTab('overview');
        }}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
