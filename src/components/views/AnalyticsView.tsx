// Analytics Matrix View Component
import React from 'react';
import { BarChart2, PieChart, Activity, CheckCircle, XCircle } from 'lucide-react';
import { MasterTelemetry } from '../../engine/types';

interface AnalyticsViewProps {
  candidates: MasterTelemetry[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ candidates }) => {
  const total = candidates.length;
  const passCount = candidates.filter(
    (c) => c.system_execution.system_decision === 'PASS'
  ).length;
  const rejectCount = candidates.filter(
    (c) => c.system_execution.system_decision === 'REJECT'
  ).length;
  const inconclusiveCount = candidates.filter(
    (c) => c.system_execution.system_decision === 'INCONCLUSIVE'
  ).length;

  // Breakdown of halted stages
  const stageBreakdown: Record<string, number> = {};
  candidates.forEach((c) => {
    if (c.system_execution.halted_at_stage) {
      stageBreakdown[c.system_execution.halted_at_stage] =
        (stageBreakdown[c.system_execution.halted_at_stage] || 0) + 1;
    }
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-indigo-400" />
          Analytics &amp; Pipeline Filter Matrix
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Stage-by-Stage Quantitative Rejection Distribution &amp; Empirical Data
        </p>
      </div>

      {/* High-Level Conversion Ratios */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 font-mono">PASSED VALID SETUPS</span>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {passCount}{' '}
            <span className="text-xs text-slate-500 font-normal">
              ({total > 0 ? ((passCount / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Satisfied all 19 sequential RDP Strategy v3.0 engine stages
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 font-mono">FILTERED / REJECTED</span>
          <div className="text-2xl font-bold font-mono text-rose-400">
            {rejectCount}{' '}
            <span className="text-xs text-slate-500 font-normal">
              ({total > 0 ? ((rejectCount / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Protected capital by rejecting suboptimal conditions
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-1">
          <span className="text-xs text-slate-400 font-mono">INCONCLUSIVE (FAIL-SAFE)</span>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {inconclusiveCount}{' '}
            <span className="text-xs text-slate-500 font-normal">
              ({total > 0 ? ((inconclusiveCount / total) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            News offline or degraded feed data triggered fail-safe
          </p>
        </div>
      </div>

      {/* Stage Rejection Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
          Rejection Frequency by Pipeline Stage
        </h3>

        <div className="space-y-3">
          {Object.entries(stageBreakdown).length === 0 ? (
            <div className="text-xs text-slate-500 font-mono py-4 text-center">
              No rejected candidate stages recorded in current session.
            </div>
          ) : (
            Object.entries(stageBreakdown).map(([stageName, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={stageName} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300">{stageName}</span>
                    <span className="text-slate-400">
                      {count} rejects ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-rose-500 h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
