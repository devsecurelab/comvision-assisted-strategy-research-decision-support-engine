// Experiment Mode View Component (EXP-2026-V2-001: 100 Valid Setups)
// RDP Strategy V3.0 (Frozen) Master Specification
import React, { useState } from 'react';
import { FlaskConical, Lock, ShieldAlert, Check, Copy, Hash } from 'lucide-react';
import { MasterTelemetry } from '../../engine/types';
import { ACTIVE_STRATEGY_VERSION, ACTIVE_EXPERIMENT_ID, CONFIG_HASH } from '../../engine/manifest';

interface ExperimentViewProps {
  candidates: MasterTelemetry[];
}

export const ExperimentView: React.FC<ExperimentViewProps> = ({ candidates }) => {
  const [copiedHash, setCopiedHash] = useState(false);

  const validSetups = candidates.filter(
    (c) => c.system_execution.system_decision === 'PASS'
  );
  const targetCount = 100;
  const currentCount = validSetups.length;
  const progressPct = Math.min(100, Math.round((currentCount / targetCount) * 100));

  const favorableSetups = validSetups.filter(
    (c) => c.next_candle_observation?.status === 'NEXT_CANDLE_FAVORABLE' || c.system_execution.user_recorded_action === 'WIN'
  );
  const unfavorableSetups = validSetups.filter(
    (c) => c.next_candle_observation?.status === 'NEXT_CANDLE_UNFAVORABLE' || c.system_execution.user_recorded_action === 'LOSS'
  );
  const neutralSetups = validSetups.filter(
    (c) => c.next_candle_observation?.status === 'NEXT_CANDLE_NEUTRAL'
  );

  const takenSetups = validSetups.filter(
    (c) => c.system_execution.user_recorded_action === 'TAKEN'
  );
  const notTakenSetups = validSetups.filter(
    (c) => c.system_execution.user_recorded_action === 'NOT_TAKEN'
  );
  const notRecordedSetups = validSetups.filter(
    (c) =>
      c.system_execution.user_recorded_action === 'NOT_RECORDED' ||
      !c.system_execution.user_recorded_action ||
      c.system_execution.user_recorded_action === 'PENDING'
  );

  const decidedObservations = favorableSetups.length + unfavorableSetups.length;
  const favorableRate = decidedObservations > 0 ? ((favorableSetups.length / decidedObservations) * 100).toFixed(1) : 'N/A';

  const copyConfigHash = () => {
    navigator.clipboard.writeText(CONFIG_HASH);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            Controlled Research Experiment ({ACTIVE_EXPERIMENT_ID})
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Empirical Evaluation of Strategy {ACTIVE_STRATEGY_VERSION} Across First 100 Valid Setups
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 font-mono text-xs border border-indigo-500/30 flex items-center gap-1.5 font-bold">
            <Lock className="w-3.5 h-3.5 text-indigo-400" />
            {ACTIVE_STRATEGY_VERSION} LOCKED
          </span>
        </div>
      </div>

      {/* Config Hash Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono font-bold text-slate-200">
              CANONICAL CONFIG HASH (SHA-256):
            </span>
          </div>

          <button
            onClick={copyConfigHash}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded border border-slate-700 transition"
          >
            {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedHash ? 'Copied Hash' : 'Copy Hash'}</span>
          </button>
        </div>

        <div className="mt-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-400 break-all select-all">
          {CONFIG_HASH}
        </div>
        <p className="text-[10px] text-slate-500 font-mono mt-1.5">
          Deterministic snapshot of all CHoCH, BOS, FVG, IFVG, BPR, OB, Breaker, OTE, and Session rules. Every telemetry record is cryptographically chained.
        </p>
      </div>

      {/* Progress Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200">
              Sample Acquisition Progress
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Strictly non-discretionary candidates meeting all 19 sequential stages
            </p>
          </div>
          <div className="text-right font-mono">
            <span className="text-2xl font-bold text-indigo-400">
              {currentCount}
            </span>
            <span className="text-slate-500 text-sm"> / {targetCount} Setups</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800 overflow-hidden p-0.5">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-500 shadow-sm shadow-indigo-500/50"
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>

        {/* Stats Strip: Research Observations */}
        <div>
          <span className="text-[11px] font-mono font-bold text-slate-400 block mb-1.5">
            NEXT-CANDLE RESEARCH OBSERVATIONS (SCIENTIFIC EVALUATION):
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">TOTAL EVALUATED</span>
              <span className="text-lg font-bold text-slate-200">{candidates.length}</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">NEXT_CANDLE_FAVORABLE</span>
              <span className="text-lg font-bold text-emerald-400">{favorableSetups.length}</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">NEXT_CANDLE_UNFAVORABLE</span>
              <span className="text-lg font-bold text-rose-400">{unfavorableSetups.length}</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">FAVORABLE RATE</span>
              <span className="text-lg font-bold text-indigo-300">
                {favorableRate !== 'N/A' ? `${favorableRate}%` : 'Awaiting Records'}
              </span>
            </div>
          </div>
        </div>

        {/* Operator Actions Strip: Strictly Separate */}
        <div className="pt-2 border-t border-slate-800/80">
          <span className="text-[11px] font-mono font-bold text-slate-400 block mb-1.5">
            OPERATOR DISCRETIONARY ACTION (STRICTLY SEPARATE FROM OBSERVATION):
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">ACTION: TAKEN</span>
              <span className="text-base font-bold text-indigo-300">{takenSetups.length}</span>
            </div>
            <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">ACTION: NOT_TAKEN</span>
              <span className="text-base font-bold text-slate-400">{notTakenSetups.length}</span>
            </div>
            <div className="p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">ACTION: NOT_RECORDED</span>
              <span className="text-base font-bold text-slate-400">{notRecordedSetups.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Freeze Policy Rules */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3 text-xs">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          RDP Strategy V3.0 Scope Freeze Protocol Rules (Section 57)
        </h3>
        <ul className="space-y-2 text-slate-400 font-mono text-[11px] list-disc list-inside">
          <li>
            <strong className="text-slate-300">Parameter Immutability:</strong> The 19-stage pipeline, fractal swing criteria (Left N=2, Right N=2), BOS body close rules, CHoCH transitions, FVG/IFVG boundaries, BPR overlaps, OTE bounds (61.8% - 78.6%), and Fib 50% discount rules cannot be altered during {ACTIVE_EXPERIMENT_ID}.
          </li>
          <li>
            <strong className="text-slate-300">No Post-Hoc Reinterpretation:</strong> Outcomes are strictly recorded as NEXT_CANDLE_FAVORABLE, NEXT_CANDLE_UNFAVORABLE, or NEXT_CANDLE_NEUTRAL. Rules cannot be retroactively adjusted to convert past unfavorable observations.
          </li>
          <li>
            <strong className="text-slate-300">Telemetry Integrity:</strong> Every candidate frame (PASS / REJECT / INCONCLUSIVE) is permanently logged in Master Telemetry JSON schema with sha256 checksums and config_hash.
          </li>
          <li>
            <strong className="text-slate-300">Strict Non-Execution Boundary:</strong> Terminal state is MANUAL_ALERT. The engine produces research alerts only; direct broker execution is architecturally prohibited.
          </li>
        </ul>
      </div>
    </div>
  );
};
