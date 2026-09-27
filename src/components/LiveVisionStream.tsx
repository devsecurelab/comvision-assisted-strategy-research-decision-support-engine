// AI Live Vision Stream Monitor Component
import React from 'react';
import { Eye, Activity, Radio, Cpu, Scan } from 'lucide-react';

interface LiveVisionStreamProps {
  cvConfidence?: number;
  onFullScreenVision?: () => void;
}

export const LiveVisionStream: React.FC<LiveVisionStreamProps> = ({
  cvConfidence = 0.98,
  onFullScreenVision,
}) => {
  return (
    <div
      id="vision-stream-monitor"
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 relative overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scan className="w-4 h-4 text-indigo-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            MSS Screen Crop Stream
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            OCR {(cvConfidence * 100).toFixed(1)}% COMPLETE
          </span>
          {onFullScreenVision && (
            <button
              onClick={onFullScreenVision}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono underline"
            >
              Expand
            </button>
          )}
        </div>
      </div>

      {/* Simulated Live Viewport Canvas */}
      <div className="h-44 bg-slate-950 rounded-lg border border-slate-800/80 relative flex items-center justify-center overflow-hidden group">
        {/* Canvas Grid Lines Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:16px_16px] opacity-40"></div>

        {/* Dynamic Simulated Candlesticks Vector */}
        <div className="absolute inset-0 flex items-end justify-around px-8 pb-6 opacity-70 pointer-events-none">
          {/* C_OB */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-6 bg-slate-500"></div>
            <div className="w-4 h-8 bg-rose-500/80 rounded-xs"></div>
            <div className="w-0.5 h-4 bg-slate-500"></div>
          </div>
          {/* C1 */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-5 bg-slate-500"></div>
            <div className="w-4 h-10 bg-emerald-500/80 rounded-xs"></div>
            <div className="w-0.5 h-3 bg-slate-500"></div>
          </div>
          {/* C2 Displacement */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 bg-slate-400"></div>
            <div className="w-4 h-24 bg-emerald-400 rounded-xs shadow-[0_0_12px_rgba(52,211,153,0.3)]"></div>
            <div className="w-0.5 h-4 bg-slate-400"></div>
          </div>
          {/* C3 Confirmation */}
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-6 bg-slate-400"></div>
            <div className="w-4 h-16 bg-emerald-500 rounded-xs"></div>
            <div className="w-0.5 h-3 bg-slate-400"></div>
          </div>
        </div>

        {/* Visual Bounding Box Indicators */}
        <div className="absolute top-10 left-10 w-32 h-14 border-2 border-dashed border-indigo-500/70 bg-indigo-500/10 rounded flex flex-col justify-between p-1 text-[9px] font-mono text-indigo-300">
          <div className="flex justify-between items-center">
            <span>FVG Zone</span>
            <span className="text-[8px] bg-indigo-500/30 px-1 rounded">
              &lt; 50% Fib
            </span>
          </div>
          <div className="text-[8px] text-slate-400">1.08430 - 1.08445</div>
        </div>

        {/* Order Block Indicator */}
        <div className="absolute bottom-6 left-6 w-20 h-10 border border-emerald-500/50 bg-emerald-500/10 rounded flex items-center justify-center text-[8px] font-mono text-emerald-300">
          OB Confluence
        </div>

        {/* Equilibrium Line */}
        <div className="absolute top-16 right-4 w-36 h-0.5 bg-amber-400/80 shadow-[0_0_8px_#f59e0b] flex items-center justify-end">
          <span className="text-[8px] font-mono text-amber-300 -translate-y-3 bg-slate-900/80 px-1 rounded">
            Fib 50% Eq (1.0850)
          </span>
        </div>

        <span className="text-slate-600 font-mono text-xs z-10 bg-slate-950/80 px-3 py-1 rounded border border-slate-800/80">
          [ Live MSS Screen Crop Stream • 60 FPS ]
        </span>
      </div>

      {/* Sub-module Health Check */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
        <ModuleStatus label="MSS Capture Engine" status="OK (60 FPS)" />
        <ModuleStatus label="Pattern Recognition" status="OK (FVG Scan)" />
        <ModuleStatus
          label="Pressure Observation Engine"
          status="OK (T-10s Active)"
        />
        <ModuleStatus label="News Guard API Scraper" status="OK (Sync 1m ago)" />
      </div>
    </div>
  );
};

function ModuleStatus({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        {status}
      </span>
    </div>
  );
}
