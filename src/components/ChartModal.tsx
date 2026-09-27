// Interactive Candlestick Chart View Modal Component
import React from 'react';
import { X, ExternalLink, Activity, Layers, Maximize2 } from 'lucide-react';
import { MasterTelemetry } from '../engine/types';

interface ChartModalProps {
  telemetry: MasterTelemetry | null;
  onClose: () => void;
}

export const ChartModal: React.FC<ChartModalProps> = ({ telemetry, onClose }) => {
  if (!telemetry) return null;

  const isBullish = telemetry.market_context.local_bias === 'BULLISH';
  const tf = telemetry.market_context.selected_timeframe;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-mono">
                  EUR/USD — {tf} Microstructure Inspection
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                    isBullish
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {isBullish ? 'BULLISH SETUP' : 'BEARISH SETUP'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Setup ID: {telemetry.metadata.setup_id} • Decision: {telemetry.system_execution.system_decision}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Interactive Visual Chart Canvas */}
        <div className="h-80 bg-slate-950 rounded-xl border border-slate-800 relative flex flex-col justify-between p-6 overflow-hidden select-none">
          {/* Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:20px_20px] opacity-40"></div>

          {/* Candle Bars Sequence */}
          <div className="absolute inset-0 flex items-end justify-around px-12 pb-10 pointer-events-none">
            {/* Candle 1 (Pre-Breakout Base) */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-6 bg-slate-500"></div>
              <div className="w-6 h-14 bg-emerald-500/80 rounded-xs"></div>
              <div className="w-0.5 h-4 bg-slate-500"></div>
              <span className="text-[9px] font-mono text-slate-400 mt-2">C1</span>
            </div>

            {/* Candle 2 (Displacement Impulse) */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-6 bg-slate-400"></div>
              <div className="w-6 h-40 bg-emerald-400 rounded-xs shadow-[0_0_12px_rgba(52,211,153,0.3)]"></div>
              <div className="w-0.5 h-6 bg-slate-400"></div>
              <span className="text-[9px] font-mono text-emerald-400 mt-2">C2 (Impulse)</span>
            </div>

            {/* Candle 3 (Confirmation Close) */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-8 bg-slate-400"></div>
              <div className="w-6 h-28 bg-emerald-500 rounded-xs"></div>
              <div className="w-0.5 h-4 bg-slate-400"></div>
              <span className="text-[9px] font-mono text-emerald-300 mt-2">C3 (Close)</span>
            </div>
          </div>

          {/* FVG Highlighted Overlay Area */}
          <div className="absolute top-28 left-28 w-52 h-16 border-2 border-dashed border-indigo-500/80 bg-indigo-500/15 rounded-lg p-2 font-mono text-indigo-300 text-xs flex flex-col justify-between">
            <div className="flex justify-between items-center text-[11px] font-bold">
              <span>Bullish FVG Zone [C1.High, C3.Low]</span>
              <span className="text-[9px] bg-indigo-500/40 px-1.5 py-0.2 rounded">
                VALID
              </span>
            </div>
            <div className="text-[9px] text-slate-400">
              Low: 1.08430 • High: 1.08445 • Mitigation: UNMITIGATED
            </div>
          </div>

          {/* Order Block Indicator */}
          <div className="absolute bottom-16 left-12 w-32 h-10 border border-emerald-500/70 bg-emerald-500/10 rounded p-1.5 font-mono text-emerald-300 text-[10px] flex items-center justify-between">
            <span>OB Confluence</span>
            <span className="text-[9px] bg-emerald-500/30 px-1 rounded">1.08410</span>
          </div>

          {/* 50% Fib Equilibrium Line */}
          <div className="absolute top-36 right-4 w-72 h-0.5 bg-amber-400 shadow-[0_0_8px_#f59e0b] flex items-center justify-end">
            <span className="text-[10px] font-mono text-amber-300 -translate-y-3 bg-slate-900 px-2 py-0.5 rounded border border-amber-500/30">
              50% Equilibrium (1.08500)
            </span>
          </div>

          <div className="z-10 flex justify-between items-center text-[11px] font-mono text-slate-400 bg-slate-950/90 p-2.5 rounded-lg border border-slate-800">
            <span>Market Price: 1.08505</span>
            <span>T-10s Pressure: {telemetry.pressure_observation.classification}</span>
            <span>Wick Pushback: {telemetry.validation_metrics.wick_check.wick_ratio} (&lt;=0.50)</span>
          </div>
        </div>

        {/* Metric Footer */}
        <div className="flex justify-between items-center pt-2">
          <div className="text-xs text-slate-500 font-mono">
            Terminal state: MANUAL_ALERT • Broker integration disabled by design.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
          >
            Done Viewing
          </button>
        </div>
      </div>
    </div>
  );
};
