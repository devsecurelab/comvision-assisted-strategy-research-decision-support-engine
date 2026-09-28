import React, { useState } from 'react';
import { Eye, Scan, Square, Play } from 'lucide-react';
import { MasterTelemetry } from '../../engine/types';
import { TelemetryCandleCanvas } from '../TelemetryCandleCanvas';

interface VisionViewProps { currentAlert: MasterTelemetry | null; }

export const VisionView: React.FC<VisionViewProps> = ({ currentAlert }) => {
  const [capturing, setCapturing] = useState(false);
  const confidence = currentAlert?.metadata.cv_confidence ?? 0;
  const source = currentAlert?.vision_verification?.cv_evidence_source || currentAlert?.metadata.data_provenance || 'UNAVAILABLE';
  const status = !currentAlert ? 'UNAVAILABLE' : capturing ? 'CAPTURING' : 'READY';

  return <div className="space-y-6 max-w-7xl mx-auto w-full" data-testid="vision-view">
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div><h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-400" />Telemetry Vision Monitor</h2><p className="text-xs text-slate-400 font-mono">Evidence-bound candlestick rendering; no unlabelled mock feed</p></div>
      <div className="flex items-center gap-2 text-xs font-mono"><span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">Source: <strong className="text-cyan-300">{source}</strong></span><span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">OCR: <strong className={confidence >= 0.95 ? 'text-emerald-400' : confidence >= 0.85 ? 'text-amber-400' : 'text-rose-400'}>{confidence ? `${(confidence * 100).toFixed(1)}%` : 'N/A'}</strong></span><button onClick={() => setCapturing((v) => !v)} className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 ${capturing ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>{capturing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}{capturing ? 'Stop Capture' : 'Start Capture'}</button></div>
    </div>
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"><div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-3"><span className="flex items-center gap-2 text-indigo-300"><Scan className="w-3.5 h-3.5" />Capture state: {status}</span><span className={currentAlert ? 'text-emerald-400' : 'text-amber-400'}>{currentAlert ? 'Evidence bound' : 'Run scan to bind evidence'}</span></div><TelemetryCandleCanvas telemetry={currentAlert} /></div>
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono"><Module label="CAPTURE MODULE" value={capturing ? 'ACTIVE (browser state)' : 'IDLE'} /><Module label="PATTERN RECOGNITION" value={currentAlert ? 'TELEMETRY BOUND' : 'WAITING'} /><Module label="VERIFICATION" value={currentAlert?.vision_verification?.verification_status || 'UNAVAILABLE'} /><Module label="FAIL-SAFE" value="MANUAL_ALERT ONLY" /></div>
  </div>;
};

function Module({ label, value }: { label: string; value: string }) { return <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1"><div className="text-slate-500 text-[10px]">{label}</div><div className="text-cyan-300 font-bold">{value}</div></div>; }
