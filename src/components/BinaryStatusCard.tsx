import React from 'react';
import { AlertCircle, Clock3, Database, ShieldCheck } from 'lucide-react';
import type { MasterTelemetry } from '../engine/types';
import { formatSignalTime } from '../utils/timeFormat';

export const BinaryStatusCard: React.FC<{ alert: MasterTelemetry | null; scannerActive: boolean }> = ({ alert, scannerActive }) => {
  if (!scannerActive) return <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-300"><div className="flex items-center gap-2 font-mono text-sm"><Clock3 className="h-4 w-4" /> SCANNER_PAUSED</div><p className="mt-1 text-xs text-slate-500">Automatic scanning is paused. Research records remain unchanged.</p></div>;
  if (!alert) return <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-300"><div className="flex items-center gap-2 font-mono text-sm"><Clock3 className="h-4 w-4" /> WAITING_CANDLE_CLOSE</div><p className="mt-1 text-xs text-slate-500">No verified closed-candle evaluation is available yet.</p></div>;
  const v3 = alert.decision_engine_v3;
  const signal = v3?.binarySignal ?? 'NO_TRADE';
  const status = v3?.status ?? alert.system_execution.system_decision;
  const reason = (v3?.statusReason ?? alert.system_execution.rejection_reason ?? 'No qualifying setup.')
    .replace(/news[^.]*clear/gi, 'manual news review not performed')
    .replace(/no high-impact red-folder events[^.]*/gi, 'NEWS: NOT CHECKED (manual)');
  const time = formatSignalTime(alert.metadata.signal_timestamp_utc || alert.metadata.timestamp_utc);
  const color = signal === 'CALL' ? 'border-cyan-500/50 text-cyan-300' : signal === 'PUT' ? 'border-amber-500/50 text-amber-300' : 'border-slate-700 text-slate-300';
  return <div className={`rounded-xl border bg-slate-900 p-4 ${color}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 font-mono text-sm font-bold"><ShieldCheck className="h-4 w-4" /> {signal}</div><span className="rounded bg-slate-950 px-2 py-1 text-[10px] font-mono">{status}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-mono"><div><span className="block text-[10px] uppercase text-slate-500">Pair / Timeframe</span><strong>{alert.metadata.pair || alert.metadata.asset || '—'} / {alert.market_context.selected_timeframe}</strong></div><div><span className="block text-[10px] uppercase text-slate-500">BDT signal time</span><strong>{time.bdtTime}</strong></div><div><span className="block text-[10px] uppercase text-slate-500">MFCI (confluence score, not probability)</span><strong>{v3 && typeof v3.mfci.totalMfci === 'number' ? `${v3.mfci.totalMfci.toFixed(3)} / ${v3.mfciBand}` : 'UNAVAILABLE'}</strong></div><div><span className="block text-[10px] uppercase text-slate-500">Provider</span><strong className="flex items-center gap-1"><Database className="h-3 w-3" />{alert.provider_provenance?.provider || 'UNAVAILABLE'}</strong></div></div>
    {(signal === 'CALL' || signal === 'PUT') && <p className="mt-3 text-[10px] font-mono text-amber-300">NEWS: NOT CHECKED (manual)</p>}
    <div className="mt-3 flex items-start gap-2 border-t border-slate-800 pt-3 text-xs text-slate-400"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{reason}</span></div>
    <p className="mt-3 text-[10px] font-mono uppercase tracking-wide text-slate-500">Research alert only · no execution</p>
  </div>;
};
