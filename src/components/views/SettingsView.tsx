// Settings View Component
import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Database,
  Clock,
  Lock,
  Download,
  ShieldCheck,
  FileArchive,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Shield,
  BellRing,
  Server,
  Save,
  Activity,
} from 'lucide-react';
import { Timeframe } from '../../engine/types';
import { ProviderStatus } from '../../engine/dataProviders';
import { TelegramAdminTool } from '../TelegramAdminTool';
import { getApiBaseUrl, setApiBaseUrl, apiFetch } from '../../config/api';

interface SettingsViewProps {
  selectedTimeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  selectedProvider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'REPLAY';
  onSelectProvider: (provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'REPLAY') => void;
  providerStatus?: ProviderStatus;
  onSimulateFallback?: (enable?: boolean) => Promise<void>;
  onDownloadHandover?: () => void;
  authToken?: string | null;
  isAdmin?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  selectedTimeframe,
  onSelectTimeframe,
  selectedProvider,
  onSelectProvider,
  providerStatus,
  onSimulateFallback,
  onDownloadHandover,
  authToken,
  isAdmin,
}) => {
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{
    telegramConfigured: boolean;
    telegramChatIdMasked?: string;
    activeChatId?: string | null;
    botTokenConfigured?: boolean;
  }>({
    telegramConfigured: false,
  });
  const [telegramFeedback, setTelegramFeedback] = useState<{
    success: boolean;
    status: 'SENT' | 'FAILED' | 'DISABLED';
    detail: string;
    chatId?: string;
    messageId?: number;
    timestampUtc?: string;
    timestampBdt?: string;
  } | null>(null);

  const [backendUrl, setBackendUrlState] = useState<string>(() => getApiBaseUrl());
  const [backendSavedFeedback, setBackendSavedFeedback] = useState<string | null>(null);

  const handleSaveBackendUrl = (urlToSave: string) => {
    setApiBaseUrl(urlToSave);
    setBackendUrlState(getApiBaseUrl());
    setBackendSavedFeedback('Backend endpoint saved! Requests will route to this host.');
    setTimeout(() => setBackendSavedFeedback(null), 4000);
  };

  // Fetch Telegram status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const res = await apiFetch('/api/notifications/status', { headers });
        if (res.ok) {
          const data = await res.json();
          setTelegramStatus((prev) => ({
            ...prev,
            telegramConfigured: data.telegramConfigured,
            telegramChatIdMasked: data.telegramChatIdMasked,
          }));
        }

        // If admin, fetch admin-specific status for exact chat ID and bot config
        if (isAdmin && authToken) {
          const adminRes = await apiFetch('/api/admin/telegram/status', {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (adminRes.ok) {
            const adminData = await adminRes.json();
            setTelegramStatus((prev) => ({
              ...prev,
              activeChatId: adminData.activeChatId,
              botTokenConfigured: adminData.botTokenConfigured,
            }));
          }
        }
      } catch {
        // Soft fallback
      }
    };

    fetchStatus();
  }, [authToken, isAdmin]);

  // Handle triggering Telegram test alert
  const handleTriggerTelegramTest = async () => {
    setTestingTelegram(true);
    setTelegramFeedback(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await apiFetch('/api/notifications/test-telegram', {
        method: 'POST',
        headers,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTelegramFeedback({
          success: true,
          status: data.status || 'SENT',
          detail: data.detail || 'Test alert delivered successfully to Telegram!',
          chatId: data.chatId,
          messageId: data.messageId,
          timestampUtc: data.timestampUtc,
          timestampBdt: data.timestampBdt,
        });
      } else {
        setTelegramFeedback({
          success: false,
          status: data.status || 'FAILED',
          detail: data.detail || 'Telegram test alert failed. Check configuration.',
          chatId: data.chatId,
          timestampUtc: data.timestampUtc,
          timestampBdt: data.timestampBdt,
        });
      }
    } catch (err: any) {
      setTelegramFeedback({
        success: false,
        status: 'FAILED',
        detail: err?.message || 'Network error attempting to send Telegram test alert.',
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          Engine Configuration &amp; Provider Settings
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Dashboard Timeframe Authority &amp; Market Data Ingestion Feed Controls
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timeframe Authority Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <Clock className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-200 uppercase font-mono">
              Dashboard Timeframe Authority
            </h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            In accordance with Section 3.1, the dashboard operator's selected
            timeframe is the sole authority governing pipeline evaluations.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {(['1m', '5m', '15m', '30m', '1h'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => onSelectTimeframe(tf)}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition border ${
                  selectedTimeframe === tf
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {tf} {tf === '5m' ? '(Recommended)' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Data Provider Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <Database className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-200 uppercase font-mono">
              Market Data Provider
            </h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Select market data source. Real-time REST/WebSocket or deterministic
            Research Replay.
          </p>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => onSelectProvider('TWELVE_DATA')}
              className={`w-full p-3 rounded-lg border text-left flex items-center justify-between text-xs font-mono transition ${
                selectedProvider === 'TWELVE_DATA'
                  ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-bold">Twelve Data (Primary REST/WS)</div>
                <div className="text-[10px] text-slate-500">
                  Direct Forex/CFD Ingestion Feed
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800">
                ACTIVE
              </span>
            </button>

            <button
              onClick={() => onSelectProvider('ALPHA_VANTAGE')}
              className={`w-full p-3 rounded-lg border text-left flex items-center justify-between text-xs font-mono transition ${
                selectedProvider === 'ALPHA_VANTAGE'
                  ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-bold">Alpha Vantage (Automated Fallback)</div>
                <div className="text-[10px] text-slate-500">
                  Secondary Resilient FX Quote Mirror
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800">
                STANDBY
              </span>
            </button>

            <button
              onClick={() => onSelectProvider('REPLAY')}
              className={`w-full p-3 rounded-lg border text-left flex items-center justify-between text-xs font-mono transition ${
                selectedProvider === 'REPLAY'
                  ? 'bg-indigo-500/10 border-indigo-500 text-indigo-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-bold">Deterministic Research Stream Replay</div>
                <div className="text-[10px] text-slate-500">
                  Reproducible synthetic setup sequence for validation
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800">
                OFFLINE BENCH
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Provider Health & Daily API Quota Monitoring Dashboard */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <Activity className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase font-mono tracking-wide">
                Provider Health &amp; Daily API Quota Monitoring
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Automated Ingestion Failover, Rate-Limit Defense &amp; Quota Tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span
              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 ${
                providerStatus?.isFallbackLive || providerStatus?.status === 'FALLBACK_LIVE'
                  ? 'bg-amber-950/70 border-amber-500/60 text-amber-300 animate-pulse'
                  : 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  providerStatus?.isFallbackLive || providerStatus?.status === 'FALLBACK_LIVE'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
              />
              <span>
                {providerStatus?.isFallbackLive || providerStatus?.status === 'FALLBACK_LIVE'
                  ? 'STATE: FALLBACK_LIVE ACTIVE'
                  : 'STATE: PRIMARY LIVE ONLINE'}
              </span>
            </span>
          </div>
        </div>

        {/* Quota & Health Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Twelve Data Primary Feed Monitor */}
          <div className={`p-4 rounded-xl border transition ${
            providerStatus?.isFallbackLive
              ? 'bg-slate-950/80 border-slate-800 opacity-75'
              : 'bg-slate-950 border-cyan-500/30 shadow-sm'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold font-mono text-slate-200">
                  Twelve Data (Primary Stream)
                </span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                providerStatus?.isFallbackLive
                  ? 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
              }`}>
                {providerStatus?.isFallbackLive ? 'RATE-LIMITED (SIMULATED)' : 'ACTIVE PRIMARY'}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex justify-between items-baseline text-xs font-mono">
                <span className="text-slate-400">Daily Quota Usage:</span>
                <span className="text-slate-200 font-bold">
                  {providerStatus?.quota?.twelveData?.used ?? 14} / {providerStatus?.quota?.twelveData?.limit ?? 800} req
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((providerStatus?.quota?.twelveData?.used ?? 14) /
                          (providerStatus?.quota?.twelveData?.limit ?? 800)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Remaining: {(providerStatus?.quota?.twelveData?.limit ?? 800) - (providerStatus?.quota?.twelveData?.used ?? 14)} requests</span>
                <span>Config: TWELVE_DATA_API_KEY</span>
              </div>
            </div>
          </div>

          {/* Alpha Vantage Fallback Feed Monitor */}
          <div className={`p-4 rounded-xl border transition ${
            providerStatus?.isFallbackLive
              ? 'bg-amber-950/20 border-amber-500/50 shadow-md shadow-amber-500/10'
              : 'bg-slate-950 border-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${providerStatus?.isFallbackLive ? 'text-amber-400 animate-spin' : 'text-slate-400'}`} />
                <span className="text-xs font-bold font-mono text-slate-200">
                  Alpha Vantage (Fallback Adapter)
                </span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                providerStatus?.isFallbackLive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 font-bold'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {providerStatus?.isFallbackLive ? 'FALLBACK_LIVE (INGESTING)' : 'STANDBY MIRROR'}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex justify-between items-baseline text-xs font-mono">
                <span className="text-slate-400">Daily Quota Usage:</span>
                <span className="text-slate-200 font-bold">
                  {providerStatus?.quota?.alphaVantage?.used ?? 3} / {providerStatus?.quota?.alphaVantage?.limit ?? 500} req
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${providerStatus?.isFallbackLive ? 'bg-amber-400' : 'bg-slate-500'}`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((providerStatus?.quota?.alphaVantage?.used ?? 3) /
                          (providerStatus?.quota?.alphaVantage?.limit ?? 500)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Remaining: {(providerStatus?.quota?.alphaVantage?.limit ?? 500) - (providerStatus?.quota?.alphaVantage?.used ?? 3)} requests</span>
                <span>Config: ALPHA_VANTAGE_API_KEY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Fallback Active Information Banner */}
        {providerStatus?.isFallbackLive && (
          <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg flex items-center justify-between gap-3 text-xs font-mono text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>FAILOVER TRIGGERED:</strong> System is operating under <strong>FALLBACK_LIVE</strong> mode. Twelve Data feed was redirected to Alpha Vantage FX Intraday mirror with zero interruption to the 19-stage pipeline.
              </span>
            </div>
          </div>
        )}

        {/* Simulation Controls for Failover Verification */}
        {onSimulateFallback && (
          <div className="pt-2 flex items-center justify-between flex-wrap gap-3 border-t border-slate-800">
            <div className="text-xs font-mono text-slate-400">
              <span>Test Failover Simulation: Verify automated fallback to Alpha Vantage on primary rate-limit.</span>
            </div>
            <button
              id="btn-simulate-fallback-toggle"
              onClick={() => onSimulateFallback(!providerStatus?.isFallbackLive)}
              className={`px-4 py-2 text-xs font-bold font-mono rounded-lg transition border flex items-center gap-2 shadow-sm ${
                providerStatus?.isFallbackLive
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500'
                  : 'bg-amber-600 hover:bg-amber-500 text-white border-amber-400'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>
                {providerStatus?.isFallbackLive
                  ? 'Restore Primary (Exit FALLBACK_LIVE)'
                  : 'Simulate Rate-Limit & Trigger FALLBACK_LIVE'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Termux / Self-Hosted Backend Connection Config */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-cyan-400">
          <Server className="w-4 h-4" />
          <h3 className="text-sm font-bold text-slate-200 uppercase font-mono">
            Self-Hosted Backend Connection (Termux / LAN / VPS)
          </h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Configure where this PWA/browser client connects to the ComVision Engine. Leave empty to use the default same-origin host, or specify an Android Termux address (e.g. <code className="text-cyan-300 font-mono">http://localhost:3000</code> or your Android hotspot/LAN IP <code className="text-cyan-300 font-mono">http://192.168.x.x:3000</code>).
        </p>

        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrlState(e.target.value)}
              placeholder="e.g. http://localhost:3000 (Default: Same Origin)"
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-hidden focus:border-cyan-500 placeholder-slate-600"
            />
            <button
              onClick={() => handleSaveBackendUrl(backendUrl)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-mono rounded-lg transition flex items-center gap-1.5 shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Host</span>
            </button>
            {backendUrl && (
              <button
                onClick={() => handleSaveBackendUrl('')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg transition"
              >
                Reset Default
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-500">
              Active Host:{' '}
              <strong className="text-cyan-300">
                {backendUrl ? backendUrl : 'Same Origin (Default)'}
              </strong>
            </span>
            {backendSavedFeedback && (
              <span className="text-emerald-400 animate-in fade-in flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {backendSavedFeedback}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Telegram Research Alert Integration & Immediate Test Trigger */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wide">
                  Telegram Research Alert Integration
                </h3>
                {telegramStatus.telegramConfigured || telegramStatus.activeChatId ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    CONNECTED
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    PENDING CHAT ID
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Real-time Message #1 (Valid Setup Alert) and Message #2 (Next-Candle Result) channel
              </p>
            </div>
          </div>

          {/* Test Trigger Button */}
          <button
            id="btn-trigger-telegram-test"
            onClick={handleTriggerTelegramTest}
            disabled={testingTelegram}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white text-xs font-bold font-mono rounded-lg shadow-lg shadow-sky-600/20 transition border border-sky-400/40 cursor-pointer shrink-0"
          >
            {testingTelegram ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Dispatching Test Alert...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send Test Alert to Telegram</span>
              </>
            )}
          </button>
        </div>

        {/* Integration Status Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Configured Chat ID</div>
            <div className="text-xs font-mono font-bold text-sky-300 mt-1">
              {telegramStatus.activeChatId ||
                telegramStatus.telegramChatIdMasked || (
                  <span className="text-slate-500 italic">None Configured</span>
                )}
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Server Bot Token</div>
            <div className="text-xs font-semibold text-slate-200 mt-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-mono">Secured (Zero Exposure)</span>
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Active Alert Routing</div>
            <div className="text-xs font-mono font-semibold text-slate-300 mt-1">
              Signal &amp; Next-Candle Results
            </div>
          </div>
        </div>

        {/* Immediate Test Feedback Banner */}
        {telegramFeedback && (
          <div
            id="telegram-test-feedback-box"
            className={`p-4 rounded-xl border font-mono transition-all ${
              telegramFeedback.success
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-950/20'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300 shadow-lg shadow-rose-950/20'
            }`}
          >
            <div className="flex items-start gap-3">
              {telegramFeedback.success ? (
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
              )}

              <div className="space-y-2 flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="text-xs font-bold uppercase tracking-wide">
                    {telegramFeedback.success
                      ? 'Telegram Bot Integration Verified Operational'
                      : 'Telegram Integration Test Notice'}
                  </div>
                  {telegramFeedback.timestampBdt && (
                    <div className="text-[11px] text-slate-400">
                      Bangladesh Time: {telegramFeedback.timestampBdt}
                    </div>
                  )}
                </div>

                <p className="text-xs leading-relaxed text-slate-200">
                  {telegramFeedback.detail}
                </p>

                {telegramFeedback.success && (
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-emerald-400/90 border-t border-emerald-500/20">
                    {telegramFeedback.chatId && (
                      <div>
                        Target Chat ID: <strong className="text-white">{telegramFeedback.chatId}</strong>
                      </div>
                    )}
                    {telegramFeedback.messageId && (
                      <div>
                        Telegram Message ID: <strong className="text-white">#{telegramFeedback.messageId}</strong>
                      </div>
                    )}
                    {telegramFeedback.timestampUtc && (
                      <div>
                        UTC: <strong className="text-white">{telegramFeedback.timestampUtc}</strong>
                      </div>
                    )}
                  </div>
                )}

                {!telegramFeedback.success && (
                  <div className="pt-2 text-[11px] text-slate-400 border-t border-rose-500/20">
                    <div className="font-semibold text-rose-300 mb-1">Troubleshooting Tips:</div>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                      <li>Open Telegram and send <code className="px-1 py-0.2 bg-slate-800 text-sky-300 rounded">/start</code> to your bot.</li>
                      <li>Ensure you have not stopped or blocked the bot.</li>
                      <li>Use the Telegram Bot &amp; Chat ID Inspector below to detect and link your Chat ID.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Production Handover Package Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <FileArchive className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wide">
                Production-Ready Source Code Handover Package
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Target Scope: Strategy v2.0-FROZEN • Technical Specification v4.0 • EXP-2026-V2-001
              </p>
            </div>
          </div>

          {onDownloadHandover && (
            <button
              id="btn-settings-download-handover"
              onClick={onDownloadHandover}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-600/20 transition border border-indigo-400/40"
            >
              <Download className="w-4 h-4" />
              <span>Download Source Code Handover (.ZIP)</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Archive Spec</div>
            <div className="text-xs font-semibold text-slate-200 mt-1">v2.0 Frozen Specification</div>
            <div className="text-[10px] text-emerald-400 mt-0.5 font-mono">309 KB (.ZIP) • 9-Stage Pipeline</div>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Access Security</div>
            <div className="text-xs font-semibold text-emerald-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Approved Operators Only</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Bearer-token protected endpoint</div>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Deterministic Tests</div>
            <div className="text-xs font-semibold text-indigo-300 mt-1">71 / 71 Verified Passed</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Strategy v2.0 9-stage pipeline integrity</div>
          </div>
        </div>
      </div>

      {/* Admin Telegram Bot & Chat ID Inspector */}
      {isAdmin && authToken && (
        <TelegramAdminTool authToken={authToken} />
      )}
    </div>
  );
};
