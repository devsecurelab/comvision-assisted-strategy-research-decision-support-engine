// Risk boundary view: only display controls that are actually enforced by the engine.
import React from 'react';
import { Shield, AlertTriangle, Lock } from 'lucide-react';

export const RiskView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          Risk Controls &amp; Execution Boundary
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Unsupported broker-risk limits are not represented as passed controls.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-amber-200 uppercase font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Broker risk limits: UNAVAILABLE
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The engine does not calculate stake sizing, daily drawdown, or consecutive-loss limits.
            No fixed percentage or circuit-breaker claim is made here.
          </p>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
            <div>Stake sizing: UNAVAILABLE</div>
            <div>Daily drawdown cutoff: UNAVAILABLE</div>
            <div>Consecutive-loss breaker: UNAVAILABLE</div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase font-mono flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" />
            Non-execution boundary: ENFORCED
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The application emits research alerts only. It has no broker order-routing or automated execution path.
          </p>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
            <div>Order execution APIs: NONE</div>
            <div>Broker credentials for orders: NONE</div>
            <div>Automated click injection: NONE</div>
          </div>
        </div>
      </div>
    </div>
  );
};
