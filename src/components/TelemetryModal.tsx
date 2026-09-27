// Master Telemetry JSON Inspector Modal
import React, { useState } from 'react';
import { X, Copy, Check, Download, Code2, ShieldAlert } from 'lucide-react';
import { MasterTelemetry } from '../engine/types';

interface TelemetryModalProps {
  telemetry: MasterTelemetry | null;
  onClose: () => void;
}

export const TelemetryModal: React.FC<TelemetryModalProps> = ({
  telemetry,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!telemetry) return null;

  const jsonString = JSON.stringify(telemetry, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry_${telemetry.metadata.setup_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-100 font-mono">
                Master Telemetry Payload — {telemetry.metadata.setup_id}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Conforming to Section 6 Master Telemetry Schema (Strategy v1.0 Frozen)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
              title="Copy JSON to Clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Copy</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded border border-indigo-500/30 transition"
              title="Download JSON File"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-[11px]">Export</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Summary Bar */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 text-xs font-mono flex flex-wrap gap-4 text-slate-400">
          <div>
            Decision:{' '}
            <strong
              className={
                telemetry.system_execution.system_decision === 'PASS'
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }
            >
              {telemetry.system_execution.system_decision}
            </strong>
          </div>
          <div>
            Final Action:{' '}
            <strong className="text-indigo-400">
              {telemetry.system_execution.final_action}
            </strong>
          </div>
          <div>
            Data Quality:{' '}
            <strong className="text-slate-200">
              {telemetry.metadata.data_quality}
            </strong>
          </div>
          <div>
            Timeframe:{' '}
            <strong className="text-slate-200">
              {telemetry.market_context.selected_timeframe}
            </strong>
          </div>
        </div>

        {/* JSON Code Viewer */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed">
          <pre className="whitespace-pre-wrap selection:bg-indigo-500/30">
            {jsonString}
          </pre>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900 flex justify-between items-center text-[11px] text-slate-500">
          <span>
            Non-Execution Boundary: Telemetry logged for research auditability only.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
