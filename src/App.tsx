// Master Application Component
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DecisionAlertCard } from './components/DecisionAlertCard';
import { LiveVisionStream } from './components/LiveVisionStream';
import { SetupLogsTable } from './components/SetupLogsTable';
import { TelemetryModal } from './components/TelemetryModal';
import { RecordResultModal } from './components/RecordResultModal';
import { ChartModal } from './components/ChartModal';
import { AuthModal } from './components/AuthModal';
import { ValidSetupsModal } from './components/ValidSetupsModal';
import { ValidSetupsFeed } from './components/ValidSetupsFeed';
import { PublicLanding } from './components/PublicLanding';
import { ChevronRight } from 'lucide-react';
import { VisionView } from './components/views/VisionView';
import { ExperimentView } from './components/views/ExperimentView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { NewsGuardView } from './components/views/NewsGuardView';
import { RiskView } from './components/views/RiskView';
import { SettingsView } from './components/views/SettingsView';
import { AuditLogView } from './components/views/AuditLogView';
import { UserManagementView } from './components/views/UserManagementView';
import { DocsLayout } from './components/docs/DocsLayout';
import { DocsView } from './components/docs/DocsView';
import { AboutView } from './components/docs/AboutView';
import { PrivacyView } from './components/docs/PrivacyView';
import { TermsView } from './components/docs/TermsView';
import { SecurityView } from './components/docs/SecurityView';
import { Footer } from './components/Footer';
import {
  MasterTelemetry,
  Timeframe,
  UserAccount,
  UserRecordedAction,
  NewsEvent,
  NextCandleObservation,
} from './engine/types';
import { ProviderStatus } from './engine/dataProviders';
import { apiFetch } from './config/api';

export default function App() {
  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem('comvision_auth_token')
  );
  const [currentUser, setCurrentUser] = useState<Omit<
    UserAccount,
    'passwordHash'
  > | null>(() => {
    const saved = localStorage.getItem('comvision_user');
    return saved ? JSON.parse(saved) : null;
  });

  // UI view state
  const [inPublicPortal, setInPublicPortal] = useState<boolean>(!authToken);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

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
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  const [currentAlert, setCurrentAlert] = useState<MasterTelemetry | null>(null);
  const [candidateHistory, setCandidateHistory] = useState<MasterTelemetry[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | undefined>();
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [newsOnline, setNewsOnline] = useState<boolean>(true);
  const [newsWindowState, setNewsWindowState] = useState<
    'CLEAR' | 'ACTIVE' | 'NEWS_DATA_UNAVAILABLE'
  >('CLEAR');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('5m');
  const [selectedProvider, setSelectedProvider] = useState<
    'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'REPLAY'
  >('TWELVE_DATA');

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
    localStorage.setItem('comvision_auth_token', token);
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
        if (data.activeAlert) {
          setCurrentAlert(data.activeAlert);
        }
        if (data.providerStatus) {
          setProviderStatus(data.providerStatus);
          setSelectedProvider(data.providerStatus.provider === 'RESEARCH_STREAM_REPLAY' ? 'REPLAY' : data.providerStatus.provider);
        }
        setScannerActive(data.settings?.scannerActive ?? true);
        if (data.newsStatus) {
          setNewsWindowState(data.newsStatus.windowState || data.newsStatus.state);
        }
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
          if (!currentAlert && uniqueList.length > 0) {
            setCurrentAlert(uniqueList[0]);
          }
        }
      }

      // 3. Fetch News Status
      const newsRes = await apiFetch('/api/news/status', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (newsRes.ok && newsRes.headers.get('content-type')?.includes('application/json')) {
        const data = await newsRes.json();
        setNewsEvents(data.events || []);
        if (data.windowCheck) {
          setNewsWindowState(data.windowCheck.windowState || data.windowCheck.state);
        }
      }
    } catch (err) {
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
    if (!authToken) return;
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
      }
    } catch (err) {
      console.error('Failed to toggle scanner:', err);
    }
  };

  const handleStopScanning = async () => {
    if (!authToken) return;
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
      }
    } catch (err) {
      console.error('Failed to stop scanner:', err);
    }
  };

  const handleManualScan = async () => {
    if (!authToken) return;
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
        setCurrentAlert(data.telemetry);
        if (data.providerStatus) setProviderStatus(data.providerStatus);
        fetchEngineData();
      }
    } catch (err) {
      console.error('Failed manual scan:', err);
    }
  };

  const handleRecordUserAction = async (
    setupId: string,
    action: UserRecordedAction,
    observation?: NextCandleObservation
  ) => {
    if (!authToken) return;
    try {
      // 1. Record User Action (strictly separate operator discretionary field)
      const resAction = await apiFetch('/api/engine/record-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ setupId, action }),
      });

      // 2. If research observation was also specified, record outcome via v2.0 endpoint
      if (observation && observation !== 'PENDING') {
        const candidate = candidateHistory.find((c) => c.metadata.setup_id === setupId);
        const inputCandles = (candidate as any)?.input_snapshot?.candles;
        const openPrice = inputCandles?.[inputCandles.length - 1]?.close || 1.085;
        const closeDelta = observation === 'NEXT_CANDLE_FAVORABLE' ? 0.0015 : observation === 'NEXT_CANDLE_UNFAVORABLE' ? -0.0015 : 0;
        const closePrice = openPrice + closeDelta;

        await apiFetch('/api/engine/record-outcome', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            setupId,
            outcome: observation,
            nextCandle: {
              open: openPrice,
              high: Math.max(openPrice, closePrice) + 0.0005,
              low: Math.min(openPrice, closePrice) - 0.0005,
              close: closePrice,
            },
            notes: `Operator empirical recording: Observation ${observation}, Action ${action}`,
          }),
        });
      }

      if (resAction.ok) {
        fetchEngineData();
        if (currentAlert && currentAlert.metadata.setup_id === setupId) {
          setCurrentAlert({
            ...currentAlert,
            system_execution: {
              ...currentAlert.system_execution,
              user_recorded_action: action,
            },
            next_candle_observation: observation ? { status: observation } : currentAlert.next_candle_observation,
          });
        }
      }
    } catch (err) {
      console.error('Failed to record action and observation:', err);
    }
  };

  const handleToggleNewsSource = async () => {
    if (!authToken) return;
    try {
      const res = await apiFetch('/api/news/toggle-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setNewsOnline(data.newsSourceOnline);
        if (data.windowCheck) {
          setNewsWindowState(data.windowCheck.windowState);
        }
      }
    } catch (err) {
      console.error('Failed to toggle news source:', err);
    }
  };

  const handleSimulateRedFolder = async () => {
    if (!authToken) return;
    try {
      const res = await apiFetch('/api/news/trigger-simulated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          minutes: 10,
          title: 'Simulated High-Impact Macro Shock',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.windowCheck) {
          setNewsWindowState(data.windowCheck.windowState);
        }
        fetchEngineData();
      }
    } catch (err) {
      console.error('Failed to simulate red folder:', err);
    }
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

  const handleSelectProvider = async (provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'REPLAY') => {
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

  const handleSimulateFallback = async (enable?: boolean) => {
    if (!authToken) return;
    try {
      const res = await apiFetch('/api/engine/simulate-fallback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ enable }),
      });
      if (res.ok) {
        const data = await res.json();
        setProviderStatus(data.providerStatus);
        if (data.providerStatus?.provider) {
          setSelectedProvider(data.providerStatus.provider === 'RESEARCH_STREAM_REPLAY' ? 'REPLAY' : data.providerStatus.provider);
        }
      }
    } catch (err) {
      console.error('Failed to toggle fallback simulation:', err);
    }
  };

  const handleDownloadHandover = async () => {
    try {
      const timestamp = Date.now();
      const tokenParam = authToken ? `?token=${encodeURIComponent(authToken)}&t=${timestamp}` : `?t=${timestamp}`;

      // 1. Primary authenticated download via API with cache-busting
      const res = await apiFetch(`/api/engine/download-package${tokenParam}`, {
        headers: authToken
          ? {
              Authorization: `Bearer ${authToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            }
          : { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'comvision-engine-v2.0-package.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }

      // 2. Direct browser static file fallback with cache-busting
      const directA = document.createElement('a');
      directA.href = `/comvision-engine-v2.0-package.zip?t=${timestamp}`;
      directA.download = 'comvision-engine-v2.0-package.zip';
      document.body.appendChild(directA);
      directA.click();
      document.body.removeChild(directA);
    } catch (error) {
      console.error('Download error:', error);
      // Fallback direct browser navigation
      window.location.href = `/comvision-engine-v2.0-package.zip?t=${Date.now()}`;
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
          {(currentRoute === '/docs' || currentRoute === '/documentation') && <DocsView />}
          {currentRoute === '/about' && <AboutView />}
          {currentRoute === '/privacy' && <PrivacyView />}
          {currentRoute === '/terms' && <TermsView />}
          {currentRoute === '/security' && <SecurityView />}
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
  const totalEvaluated = candidateHistory.length;
  const validSetups = candidateHistory.filter(
    (c) => c.system_execution.system_decision === 'PASS'
  );
  const validSetupsCount = validSetups.length;
  const rejectedCount = candidateHistory.filter(
    (c) => c.system_execution.system_decision === 'REJECT'
  ).length;
  const winCount = candidateHistory.filter(
    (c) => c.system_execution.user_recorded_action === 'WIN'
  ).length;
  const lossCount = candidateHistory.filter(
    (c) => c.system_execution.user_recorded_action === 'LOSS'
  ).length;
  const confirmedTrades = winCount + lossCount;
  const winRate =
    confirmedTrades > 0
      ? `${Math.round((winCount / confirmedTrades) * 100)}%`
      : 'N/A';

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
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
        onDownloadHandover={handleDownloadHandover}
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
          newsWindowState={newsWindowState}
          providerStatus={providerStatus}
          onDownloadHandover={handleDownloadHandover}
        />

        {/* Dynamic View Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {(!currentAlert || currentAlert.metadata.data_provenance !== 'LIVE_INGESTED' || providerStatus?.provider === 'RESEARCH_STREAM_REPLAY' || providerStatus?.status === 'OFFLINE') && (
            <div role="alert" className="max-w-7xl mx-auto w-full rounded-xl border-2 border-rose-500 bg-rose-950/90 px-5 py-4 text-rose-50 shadow-lg shadow-rose-950/40">
              <div className="text-base sm:text-lg font-black tracking-wide">⚠️ REPLAY/DEMO DATA — NOT LIVE</div>
              <p className="mt-1 text-sm text-rose-100">No verified live market data is available for the current setup. The circuit breaker blocks alerts unless candles come from a live provider. Do not use this output for trading decisions.</p>
            </div>
          )}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto w-full">
              {/* Stats Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    CANDIDATES SCANNED
                  </span>
                  <span className="text-2xl font-bold font-mono text-white mt-1 block">
                    {totalEvaluated}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Strategy v1.0 Pipeline
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
                      VALID SETUPS (PASS)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition flex items-center gap-0.5">
                      View All <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                    {validSetupsCount}
                  </span>
                  <span className="text-[10px] text-emerald-500/80 mt-0.5 block font-mono">
                    Click to view all {validSetupsCount} active setups →
                  </span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    FILTERED / REJECTED
                  </span>
                  <span className="text-2xl font-bold font-mono text-rose-400 mt-1 block">
                    {rejectedCount}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Capital Protected
                  </span>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
                  <span className="text-[11px] font-mono text-slate-400 block">
                    EMPIRICAL WIN RATE
                  </span>
                  <span className="text-2xl font-bold font-mono text-indigo-300 mt-1 block">
                    {winRate}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {confirmedTrades} Recorded Trades
                  </span>
                </div>
              </div>

              {/* Active Valid Setups Horizontal Right-to-Left Feed */}
              <ValidSetupsFeed
                validSetups={validSetups}
                selectedSetupId={currentAlert?.metadata.setup_id}
                onSelectSetup={(setup) => setCurrentAlert(setup)}
                onOpenAllList={() => setIsValidSetupsModalOpen(true)}
              />

              {/* Primary Dual Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Decision Alert Card */}
                <div className="lg:col-span-2">
                  <DecisionAlertCard
                    alert={currentAlert}
                    validSetupsList={validSetups}
                    onSelectSetup={(setup) => setCurrentAlert(setup)}
                    onOpenAllList={() => setIsValidSetupsModalOpen(true)}
                    onMarkTaken={() =>
                      currentAlert &&
                      handleRecordUserAction(
                        currentAlert.metadata.setup_id,
                        'TAKEN'
                      )
                    }
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

                {/* Right 1 Col: AI Live Vision Stream Monitor */}
                <div>
                  <LiveVisionStream
                    cvConfidence={currentAlert?.metadata.cv_confidence ?? 0.98}
                    onFullScreenVision={() => setActiveTab('vision')}
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

          {activeTab === 'vision' && <VisionView currentAlert={currentAlert} />}

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

          {activeTab === 'news' && (
            <NewsGuardView
              newsEvents={newsEvents}
              newsSourceOnline={newsOnline}
              onToggleNewsSource={handleToggleNewsSource}
              onSimulateRedFolder={handleSimulateRedFolder}
            />
          )}

          {activeTab === 'risk' && <RiskView />}

          {activeTab === 'settings' && (
            <SettingsView
              selectedTimeframe={selectedTimeframe}
              onSelectTimeframe={handleSelectTimeframe}
              selectedProvider={selectedProvider}
              onSelectProvider={handleSelectProvider}
              providerStatus={providerStatus}
              onSimulateFallback={handleSimulateFallback}
              onDownloadHandover={handleDownloadHandover}
              authToken={authToken}
              isAdmin={currentUser?.role === 'ADMIN'}
            />
          )}

          {activeTab === 'audit' && <AuditLogView />}

          {activeTab === 'users' && authToken && (
            <UserManagementView authToken={authToken} />
          )}

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
        validSetups={validSetups}
        selectedSetupId={currentAlert?.metadata.setup_id}
        onSelectSetup={(setup) => {
          setCurrentAlert(setup);
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
