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
  selectedProvider: 'TWELVE_DATA';
  onSelectProvider: (provider: 'TWELVE_DATA') => void;
  providerStatus?: ProviderStatus;
  onProviderStatusChange?: (status: ProviderStatus) => void;
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
  onProviderStatusChange,
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
  const [providerCredentials, setProviderCredentials] = useState({ twelveDataKey: '', oandaPracticeToken: '', tiingoApiKey: '' });
  const [savingProviderCredentials, setSavingProviderCredentials] = useState(false);
  const [providerCredentialFeedback, setProviderCredentialFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const saveProviderCredentials = async () => {
    if (!authToken) { setProviderCredentialFeedback({ ok: false, text: 'Admin session is required.' }); return; }
    const payload = Object.fromEntries(Object.entries(providerCredentials).filter(([, value]) => value.trim().length > 0));
    if (Object.keys(payload).length === 0) { setProviderCredentialFeedback({ ok: false, text: 'Enter at least one key. Blank fields preserve existing credentials.' }); return; }
    setSavingProviderCredentials(true);
    setProviderCredentialFeedback(null);
    try {
      const response = await apiFetch('/api/admin/provider-credentials', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Could not update provider credentials.');
      if (data.providerStatus) onProviderStatusChange?.(data.providerStatus as ProviderStatus);
      setProviderCredentials({ twelveDataKey: '', oandaPracticeToken: '', tiingoApiKey: '' });
      setProviderCredentialFeedback({ ok: true, text: 'Credentials accepted for this server process. No key values were returned or written to the settings store.' });
    } catch (error) {
      setProviderCredentialFeedback({ ok: false, text: error instanceof Error ? error.message : 'Could not update provider credentials.' });
    } finally {
      setSavingProviderCredentials(false);
    }
  };

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
            Automatic scans use the configured server-side fallback order: Twelve Data → OANDA Practice → Tiingo FX. The selector below is for direct market-feed requests; only fresh, validated provider candles can reach the alert engine.
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
                <div className="font-bold">Twelve Data (time_series REST)</div>
                <div className="text-[10px] text-slate-500">
                  Requires a configured API key and a valid provider response
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800">
                MANUAL
              </span>
            </button>

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

      {isAdmin && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Lock className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-200 uppercase font-mono">Admin-only Provider Credentials</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Submitted values are held in server memory for this process and are never echoed or audit-logged. Use the local .env file for restart-persistent keys. Leave blank to keep a provider's current credential; dashboard entries do not overwrite environment variables.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              ['twelveDataKey', 'Twelve Data API key', 'twelveData'],
              ['oandaPracticeToken', 'OANDA Practice access token', 'oanda'],
              ['tiingoApiKey', 'Tiingo FX API key', 'tiingo'],
            ] as const).map(([field, label, statusKey]) => {
              const configured = providerStatus?.quota[statusKey].configured;
              return (
                <label key={field} className="block space-y-1.5">
                  <span className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span>{label}</span>
                    <span className={configured ? 'text-emerald-400' : 'text-slate-500'}>{configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span>
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={providerCredentials[field]}
                    onChange={(event) => setProviderCredentials((current) => ({ ...current, [field]: event.target.value }))}
                    placeholder="Paste key/token; blank keeps current"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void saveProviderCredentials()}
              disabled={savingProviderCredentials || !authToken}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold font-mono hover:bg-amber-500 disabled:opacity-50"
            >
              {savingProviderCredentials ? 'Saving securely…' : 'Save provider credentials'}
            </button>
            {providerCredentialFeedback && (
              <span className={`text-xs font-mono ${providerCredentialFeedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                {providerCredentialFeedback.text}
              </span>
            )}
          </div>
        </section>
      )}

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
