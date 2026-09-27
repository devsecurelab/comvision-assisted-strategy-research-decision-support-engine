// AI Live Vision View Component
import React, { useState } from 'react';
import { Eye, Scan, Sliders, ShieldCheck, Activity } from 'lucide-react';
import { MasterTelemetry } from '../../engine/types';

interface VisionViewProps {
  currentAlert: MasterTelemetry | null;
}

export const VisionView: React.FC<VisionViewProps> = ({ currentAlert }) => {
  const [fps, setFps] = useState(60);
  const [ocrConfidence, setOcrConfidence] = useState(0.98);

  const isBullish = currentAlert?.market_context.local_bias === 'BULLISH';

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-400" />
            AI Computer Vision Stream Monitor
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            MSS Screen Crop Capture &amp; Neural Microstructure Pattern Detection
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
            Stream Rate: <span className="text-emerald-400 font-bold">{fps} FPS</span>
          </div>
          <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
            OCR Quality:{' '}
            <span className="text-emerald-400 font-bold">
              {(ocrConfidence * 100).toFixed(1)}% (COMPLETE)
            </span>
          </div>
        </div>
      </div>

      {/* Main Viewport Stage */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden shadow-2xl">
        {/* Top telemetry status ribbon */}
        <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-indigo-300">
              <Scan className="w-3.5 h-3.5" />
              Ingestion Mode: Active Screen Crop (Bounding Box Detection)
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">
              Decision Timeframe: {currentAlert?.market_context.selected_timeframe || '5m'}
            </span>
          </div>
          <span className="text-emerald-400 font-semibold">Live Feed Synced</span>
        </div>

        {/* Large Canvas Viewport */}
        <div className="h-96 bg-slate-950 rounded-xl border border-slate-800 relative flex flex-col justify-between p-6 overflow-hidden">
          {/* Subtle Coordinate Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:24px_24px] opacity-40"></div>

          {/* Candle Stems & Bodies Illustration */}
          <div className="absolute inset-0 flex items-end justify-around px-16 pb-12 pointer-events-none opacity-80">
            {/* Swings */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-12 bg-slate-600"></div>
              <div className="w-6 h-16 bg-rose-500/80 rounded-xs"></div>
              <div className="w-0.5 h-8 bg-slate-600"></div>
              <span className="text-[9px] font-mono text-slate-400 mt-2">Swing Low</span>
            </div>

            {/* C_OB */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-8 bg-slate-500"></div>
              <div className="w-6 h-14 bg-rose-500 rounded-xs"></div>
              <div className="w-0.5 h-6 bg-slate-500"></div>
              <span className="text-[9px] font-mono text-indigo-300 mt-2">C_OB</span>
            </div>

            {/* C1 */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-8 bg-slate-500"></div>
              <div className="w-6 h-20 bg-emerald-500/80 rounded-xs"></div>
              <div className="w-0.5 h-6 bg-slate-500"></div>
              <span className="text-[9px] font-mono text-slate-300 mt-2">C1 (Base)</span>
            </div>

            {/* C2 Displacement */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-10 bg-slate-400"></div>
              <div className="w-6 h-48 bg-emerald-400 rounded-xs shadow-[0_0_16px_rgba(52,211,153,0.3)]"></div>
              <div className="w-0.5 h-6 bg-slate-400"></div>
              <span className="text-[9px] font-mono text-emerald-400 mt-2">C2 (Impulse)</span>
            </div>

            {/* C3 Confirmation */}
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-8 bg-slate-400"></div>
              <div className="w-6 h-32 bg-emerald-500 rounded-xs"></div>
              <div className="w-0.5 h-8 bg-slate-400"></div>
              <span className="text-[9px] font-mono text-emerald-300 mt-2">C3 (Confirm)</span>
            </div>
          </div>

          {/* Bounding Box 1: FVG Discount Zone */}
          <div className="absolute top-24 left-32 w-48 h-20 border-2 border-dashed border-indigo-500 bg-indigo-500/10 rounded-lg p-2 flex flex-col justify-between font-mono text-indigo-200 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold">FVG Discount Zone</span>
              <span className="text-[10px] bg-indigo-500/40 px-1.5 py-0.5 rounded font-bold">
                PASS
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              Boundary: 1.08430 - 1.08445 (&lt; 50% Fib)
            </div>
          </div>

          {/* Bounding Box 2: Order Block Level */}
          <div className="absolute bottom-20 left-20 w-36 h-12 border border-emerald-500/60 bg-emerald-500/10 rounded-lg p-2 font-mono text-emerald-300 text-xs flex items-center justify-between">
            <span>OB Confluence</span>
            <span className="text-[10px] bg-emerald-500/30 px-1.5 py-0.5 rounded">
              VERIFIED
            </span>
          </div>

          {/* Equilibrium Line */}
          <div className="absolute top-36 right-8 w-72 h-0.5 bg-amber-400 shadow-[0_0_10px_#f59e0b] flex items-center justify-end">
            <span className="text-[10px] font-mono text-amber-300 -translate-y-4 bg-slate-900 px-2 py-0.5 rounded border border-amber-500/30">
              Fib 50% Equilibrium: 1.08500
            </span>
          </div>

          {/* Bottom Telemetry HUD */}
          <div className="z-10 flex justify-between items-center text-xs font-mono text-slate-400 bg-slate-950/90 p-3 rounded-lg border border-slate-800">
            <div>Current Symbol: EUR/USD • Rate: 1.08505</div>
            <div className="flex items-center gap-4">
              <span>T-10s Pressure: ALIGNED (14.2 px/s)</span>
              <span>Wick Ratio: 0.14 (&lt;=0.50)</span>
            </div>
          </div>
        </div>

        {/* Sub-module Health Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px]">CAPTURE MODULE</div>
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              MSS Screen Capture (60 FPS)
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px]">PATTERN RECOGNITION</div>
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              FVG + 3-Candle Engine (OK)
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px]">PRESSURE ENGINE</div>
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              T-10s Categorical Tracker (OK)
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-500 text-[10px]">FAIL-SAFE GUARD</div>
            <div className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Macro News Synchronizer (OK)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
