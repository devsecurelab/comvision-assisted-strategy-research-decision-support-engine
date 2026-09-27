// Record Research Observation & User Action Modal Component
// Implements Strategy v2.0-FROZEN Semantics:
// Research Outcome: NEXT_CANDLE_FAVORABLE | NEXT_CANDLE_UNFAVORABLE | NEXT_CANDLE_NEUTRAL | NEXT_CANDLE_INCONCLUSIVE
// User Action (Strictly separate field): TAKEN | NOT_TAKEN | NOT_RECORDED
import React, { useState } from 'react';
import { X, Check, Eye, HelpCircle, Ban, ShieldCheck, ChevronRight } from 'lucide-react';
import { UserRecordedAction, NextCandleObservation } from '../engine/types';

interface RecordResultModalProps {
  setupId: string;
  currentAction: UserRecordedAction;
  currentObservation?: NextCandleObservation;
  onSave: (
    setupId: string,
    action: UserRecordedAction,
    observation?: NextCandleObservation
  ) => void;
  onClose: () => void;
}

export const RecordResultModal: React.FC<RecordResultModalProps> = ({
  setupId,
  currentAction,
  currentObservation = 'PENDING',
  onSave,
  onClose,
}) => {
  // 1. Next Candle Research Observation State (Scientific price movement relative to bias)
  const [selectedObservation, setSelectedObservation] = useState<NextCandleObservation>(
    currentObservation !== 'PENDING' ? currentObservation : 'NEXT_CANDLE_FAVORABLE'
  );

  // 2. Discretionary User Action State (Completely separate operator engagement field)
  const [selectedAction, setSelectedAction] = useState<UserRecordedAction>(() => {
    if (currentAction === 'TAKEN' || currentAction === 'NOT_TAKEN' || currentAction === 'NOT_RECORDED') {
      return currentAction;
    }
    return 'TAKEN';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(setupId, selectedAction, selectedObservation);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              Record Research Observation &amp; Action
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Setup ID: <span className="text-indigo-300 font-bold">{setupId}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* SECTION 1: Next-Candle Research Observation */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                1. Next-Candle Research Observation
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                Empirical Price Outcome
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Evaluates strictly whether the subsequent candle confirmed direction.
              (Note: <code className="text-slate-300">research_observation != financial_trade_outcome</code>)
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedObservation('NEXT_CANDLE_FAVORABLE')}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedObservation === 'NEXT_CANDLE_FAVORABLE'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold font-mono text-emerald-400">FAVORABLE</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  NEXT_CANDLE_FAVORABLE
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Candle closed in favor of bias
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedObservation('NEXT_CANDLE_UNFAVORABLE')}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedObservation === 'NEXT_CANDLE_UNFAVORABLE'
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md shadow-rose-500/10'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold font-mono text-rose-400">UNFAVORABLE</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  NEXT_CANDLE_UNFAVORABLE
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Candle closed against bias
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedObservation('NEXT_CANDLE_NEUTRAL')}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedObservation === 'NEXT_CANDLE_NEUTRAL'
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold font-mono text-indigo-300">NEUTRAL</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  NEXT_CANDLE_NEUTRAL
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Doji / flat close (open == close)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedObservation('NEXT_CANDLE_INCONCLUSIVE')}
                className={`p-3 rounded-xl border text-left transition ${
                  selectedObservation === 'NEXT_CANDLE_INCONCLUSIVE'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold font-mono text-amber-300">INCONCLUSIVE</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  NEXT_CANDLE_INCONCLUSIVE
                </div>
                <div className="text-[9px] text-slate-500 mt-1">
                  Feed gap, news halt, or missing candle
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 2: User Action (Completely Separate Field) */}
          <div className="space-y-2.5 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                2. User Action (Discretionary Execution Record)
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                Operator Behavior Field
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Completely separate from research observation outcome:
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedAction('TAKEN')}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  selectedAction === 'TAKEN'
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold shadow-md shadow-indigo-600/20'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Check className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-mono">TAKEN</span>
                <span className="text-[9px] text-slate-500">Operated setup</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction('NOT_TAKEN')}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  selectedAction === 'NOT_TAKEN'
                    ? 'bg-slate-700/40 border-slate-500 text-slate-200 font-bold shadow-md'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Ban className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-mono">NOT_TAKEN</span>
                <span className="text-[9px] text-slate-500">Did not participate</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction('NOT_RECORDED')}
                className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  selectedAction === 'NOT_RECORDED'
                    ? 'bg-amber-600/20 border-amber-500 text-amber-200 font-bold shadow-md'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono">NOT_RECORDED</span>
                <span className="text-[9px] text-slate-500">No log entered</span>
              </button>
            </div>
          </div>

          {/* Strategy v2.0-FROZEN Immutable Notice */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>Strategy v2.0-FROZEN:</strong> Storing research observation and operator action does not modify the 19-stage deterministic pipeline. Data is cryptographically hashed.
            </span>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition"
            >
              <span>Save Record</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
