// Telegram Admin Bot & Chat ID Inspector Tool
// Strictly Admin-Only: Queries Telegram getUpdates API to retrieve user Chat ID from /start command.
// STRICT SECURITY DIRECTIVE: Zero bot token exposure in UI, logs, responses, or client state.

import React, { useState, useEffect } from 'react';
import {
  Send,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Shield,
  MessageSquare,
  Clock,
  User,
  ExternalLink,
  BellRing,
} from 'lucide-react';
import { apiFetch } from '../config/api';

interface TelegramAdminToolProps {
  authToken: string;
}

interface TelegramUpdateData {
  updateId: number;
  chatId: string;
  chatType: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  text: string;
  date: number;
  dateFormattedUtc: string;
  dateFormattedBdt: string;
  isStartCommand: boolean;
}

export const TelegramAdminTool: React.FC<TelegramAdminToolProps> = ({ authToken }) => {
  const [loading, setLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [applyingChatId, setApplyingChatId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [botConfigured, setBotConfigured] = useState<boolean>(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [latestUpdate, setLatestUpdate] = useState<TelegramUpdateData | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<any[]>([]);

  // Fetch initial Telegram status
  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/telegram/status', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBotConfigured(data.botTokenConfigured);
        setActiveChatId(data.activeChatId);
      }
    } catch {
      // Ignored for graceful fallback
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [authToken]);

  // Query Telegram getUpdates for the latest update
  const handleFetchLatestUpdate = async () => {
    setLoading(true);
    setError(null);
    setSuccessNotice(null);
    try {
      const res = await apiFetch('/api/admin/telegram/latest-update', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to retrieve Telegram updates.');
        if (data.configured === false) {
          setBotConfigured(false);
        }
        return;
      }

      setLatestUpdate(data.update);
      setRecentUpdates(data.recentUpdates || []);
      setActiveChatId(data.activeChatId || null);
      setSuccessNotice('Latest Telegram update retrieved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Network error querying Telegram update endpoint.');
    } finally {
      setLoading(false);
    }
  };

  // Set detected Chat ID as active dispatch chat ID
  const handleApplyChatId = async (chatIdToApply: string) => {
    setApplyingChatId(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/telegram/apply-chat-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ chatId: chatIdToApply }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to apply Chat ID.');
        return;
      }

      setActiveChatId(data.chatId);
      setSuccessNotice(`Chat ID ${data.chatId} is now set as the active target for research alerts.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update active Chat ID.');
    } finally {
      setApplyingChatId(false);
    }
  };

  // Dispatch test notification
  const handleSendTestAlert = async () => {
    setTestSending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/notifications/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessNotice('Test alert dispatched! Please check your Telegram chat.');
      } else {
        setError('Test alert failed to deliver. Ensure bot is not blocked.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch test notification.');
    } finally {
      setTestSending(false);
    }
  };

  const handleCopyChatId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wide">
                Telegram Bot &amp; Chat ID Inspector
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Reads recent /start commands via secure server-side Telegram getUpdates
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          id="btn-fetch-telegram-update"
          onClick={handleFetchLatestUpdate}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white text-xs font-bold font-mono rounded-lg shadow-lg shadow-sky-600/20 transition border border-sky-400/40 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Reading Updates...' : 'Fetch Latest Update (/start)'}</span>
        </button>
      </div>

      {/* Security & Config Status Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Bot Token Status</div>
              <div className="text-xs font-bold text-slate-200">
                {botConfigured ? (
                  <span className="text-emerald-400">Configured in Server</span>
                ) : (
                  <span className="text-rose-400">Not Configured</span>
                )}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            PROTECTED
          </span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-indigo-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Active Alert Target</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {activeChatId ? activeChatId : <span className="text-slate-500 italic">None Linked</span>}
              </div>
            </div>
          </div>
          {activeChatId && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              ACTIVE
            </span>
          )}
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Token Exposure Guard</div>
              <div className="text-xs font-bold text-cyan-300">Zero Token Exposure</div>
            </div>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            SECURE
          </span>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {successNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-xs text-emerald-300 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-2 text-xs text-rose-300 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Guide Banner (if no update loaded yet) */}
      {!latestUpdate && (
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
          <div className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
            <span>How to Link Your Telegram Account for Research Alerts:</span>
          </div>
          <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside font-mono leading-relaxed pl-1">
            <li>Open the Telegram app on your phone or desktop.</li>
            <li>Search for your research bot or click start in your chat with the bot.</li>
            <li>
              Send <code className="px-1.5 py-0.5 bg-slate-800 text-sky-300 rounded text-[11px]">/start</code> to the bot.
            </li>
            <li>
              Return here and click the <strong className="text-white">Fetch Latest Update (/start)</strong> button above.
            </li>
          </ol>
        </div>
      )}

      {/* Detected Update / Chat ID Card */}
      {latestUpdate && (
        <div className="p-5 bg-slate-950 border border-sky-500/40 rounded-xl space-y-4 shadow-lg shadow-sky-950/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-sky-500/20 text-sky-400">
                <Check className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-white uppercase font-mono tracking-wide">
                Detected Telegram Message Update
              </span>
              {latestUpdate.isStartCommand && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  /start Command Confirmed
                </span>
              )}
            </div>

            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Bangladesh: {latestUpdate.dateFormattedBdt}</span>
            </div>
          </div>

          {/* Chat ID Display Box */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                User Telegram Chat ID
              </div>
              <div className="text-2xl font-bold font-mono text-sky-300 tracking-wide mt-0.5 flex items-center gap-3">
                <span id="telegram-chat-id-value">{latestUpdate.chatId}</span>
                <button
                  id="btn-copy-chat-id"
                  onClick={() => handleCopyChatId(latestUpdate.chatId)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer text-xs flex items-center gap-1 font-mono"
                  title="Copy Chat ID to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                id="btn-apply-telegram-chat-id"
                onClick={() => handleApplyChatId(latestUpdate.chatId)}
                disabled={applyingChatId || activeChatId === latestUpdate.chatId}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold font-mono transition border flex items-center gap-1.5 ${
                  activeChatId === latestUpdate.chatId
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-default'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer'
                }`}
              >
                {activeChatId === latestUpdate.chatId ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active Alert Target</span>
                  </>
                ) : (
                  <>
                    <BellRing className="w-3.5 h-3.5" />
                    <span>{applyingChatId ? 'Applying...' : 'Set as Active Dispatch Target'}</span>
                  </>
                )}
              </button>

              <button
                id="btn-test-telegram-alert"
                onClick={handleSendTestAlert}
                disabled={testSending || !activeChatId}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold font-mono rounded-lg transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                title="Send an instant verification message to Telegram"
              >
                <Send className={`w-3.5 h-3.5 ${testSending ? 'animate-pulse' : ''}`} />
                <span>{testSending ? 'Sending...' : 'Send Test Alert'}</span>
              </button>
            </div>
          </div>

          {/* Sender & Message Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Telegram User</div>
              <div className="text-xs font-semibold text-slate-200 mt-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {[latestUpdate.firstName, latestUpdate.lastName].filter(Boolean).join(' ') || 'Anonymous'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Username / Handle</div>
              <div className="text-xs font-mono font-semibold text-sky-400 mt-1">
                {latestUpdate.username ? `@${latestUpdate.username}` : 'No username set'}
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Text Received</div>
              <div className="text-xs font-mono font-bold text-slate-200 mt-1 truncate">
                {latestUpdate.text || '<No text>'}
              </div>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-lg">
              <div className="text-[10px] text-slate-500 uppercase font-mono">Timestamp (UTC)</div>
              <div className="text-[11px] font-mono text-slate-300 mt-1">
                {latestUpdate.dateFormattedUtc}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Updates History (if > 1) */}
      {recentUpdates.length > 1 && (
        <div className="space-y-2 pt-2">
          <div className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">
            Recent Message Queue ({recentUpdates.length} updates)
          </div>
          <div className="divide-y divide-slate-800 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
            {recentUpdates.map((item, index) => (
              <div
                key={item.updateId || index}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    ID: {item.chatId}
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {item.username ? `@${item.username}` : item.firstName || 'User'}
                  </span>
                  <span className="text-slate-500">sent:</span>
                  <span className="text-sky-300 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {item.text || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500">{item.dateFormattedBdt}</span>
                  {activeChatId !== item.chatId && (
                    <button
                      onClick={() => handleApplyChatId(item.chatId)}
                      className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition cursor-pointer"
                    >
                      Use ID
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
