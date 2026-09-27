// Recent Setup Activity & Candidate Auditability Log Table Component
import React from 'react';
import { ChevronRight, Code2 } from 'lucide-react';
import { MasterTelemetry } from '../engine/types';
import { formatSignalTime } from '../utils/timeFormat';

interface SetupLogsTableProps {
  candidates: MasterTelemetry[];
  onSelectCandidate: (candidate: MasterTelemetry) => void;
  onViewAllLogs: () => void;
}

export const SetupLogsTable: React.FC<SetupLogsTableProps> = ({
  candidates,
  onSelectCandidate,
  onViewAllLogs,
}) => {
  return (
    <div
      id="recent-setup-activity-panel"
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-md"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
            Recent Setup Activity (Candidate Audit Log)
          </h2>
          <p className="text-[11px] text-slate-500 font-mono">
            Full auditability of PASS, REJECT, and INCONCLUSIVE candidate frames
          </p>
        </div>
        <button
          onClick={onViewAllLogs}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono transition"
        >
          View All Logs <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 font-mono">
              <th className="py-2.5 px-3">Signal Time (UTC / BDT)</th>
              <th className="py-2.5 px-3">Setup ID</th>
              <th className="py-2.5 px-3">Pair / TF</th>
              <th className="py-2.5 px-3">Bias</th>
              <th className="py-2.5 px-3">Pressure</th>
              <th className="py-2.5 px-3">Decision</th>
              <th className="py-2.5 px-3">Halted At / Reason</th>
              <th className="py-2.5 px-3">User Action</th>
              <th className="py-2.5 px-3 text-right">Telemetry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 font-mono">
            {candidates.map((c, index) => {
              const timeData = formatSignalTime(
                c.metadata.signal_timestamp_utc || c.metadata.timestamp_utc
              );
              const pair = c.metadata.pair || c.metadata.asset || 'EUR/USD';
              const decision = c.system_execution.system_decision;
              const action = c.system_execution.user_recorded_action;
              const reason =
                c.system_execution.rejection_reason ||
                c.validation_metrics.wick_check.reason ||
                c.validation_metrics.fvg.reason ||
                'Passed Pipeline';

              return (
                <tr
                  key={`${c.metadata.setup_id || 'cand'}-${index}`}
                  className="border-b border-slate-800/30 text-slate-300 hover:bg-slate-800/30 transition cursor-pointer"
                  onClick={() => onSelectCandidate(c)}
                >
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="text-slate-300 font-medium">
                      {timeData.utcShort} UTC
                    </span>{' '}
                    <span className="text-emerald-400 font-medium">
                      / {timeData.bdtShort} BDT
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-bold">
                    {c.metadata.setup_id}
                  </td>
                  <td className="py-2.5 px-3 text-slate-200 font-bold">
                    {pair} ({c.market_context.selected_timeframe})
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        c.market_context.local_bias === 'BULLISH'
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : c.market_context.local_bias === 'BEARISH'
                          ? 'text-rose-400 bg-rose-500/10'
                          : 'text-slate-400 bg-slate-800'
                      }`}
                    >
                      {c.market_context.local_bias}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-indigo-400">
                    {c.pressure_observation.classification}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        decision === 'PASS'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : decision === 'INCONCLUSIVE'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {decision}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-slate-400 max-w-xs truncate">
                    {reason}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-col gap-1">
                      {/* Research Observation */}
                      {c.next_candle_observation?.status && c.next_candle_observation.status !== 'PENDING' && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border ${
                            c.next_candle_observation.status === 'NEXT_CANDLE_FAVORABLE'
                              ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30'
                              : c.next_candle_observation.status === 'NEXT_CANDLE_UNFAVORABLE'
                              ? 'text-rose-300 bg-rose-500/20 border-rose-500/30'
                              : c.next_candle_observation.status === 'NEXT_CANDLE_NEUTRAL'
                              ? 'text-indigo-300 bg-indigo-500/20 border-indigo-500/30'
                              : 'text-amber-300 bg-amber-500/20 border-amber-500/30'
                          }`}
                        >
                          {c.next_candle_observation.status === 'NEXT_CANDLE_FAVORABLE'
                            ? 'FAVORABLE'
                            : c.next_candle_observation.status === 'NEXT_CANDLE_UNFAVORABLE'
                            ? 'UNFAVORABLE'
                            : c.next_candle_observation.status === 'NEXT_CANDLE_NEUTRAL'
                            ? 'NEUTRAL'
                            : 'INCONCLUSIVE'}
                        </span>
                      )}
                      {/* Operator Action */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          action === 'TAKEN'
                            ? 'text-indigo-300 bg-indigo-500/20 font-bold'
                            : action === 'NOT_TAKEN'
                            ? 'text-slate-300 bg-slate-800'
                            : action === 'NOT_RECORDED'
                            ? 'text-amber-400 bg-amber-500/10'
                            : action === 'WIN'
                            ? 'text-emerald-300 bg-emerald-500/20 font-bold'
                            : action === 'LOSS'
                            ? 'text-rose-300 bg-rose-500/20 font-bold'
                            : action === 'SKIPPED'
                            ? 'text-slate-400 bg-slate-800'
                            : 'text-slate-500'
                        }`}
                      >
                        {action}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      className="text-slate-400 hover:text-indigo-400 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCandidate(c);
                      }}
                      title="Inspect Schema"
                    >
                      <Code2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
