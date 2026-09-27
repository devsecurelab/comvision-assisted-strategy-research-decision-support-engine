// Risk Guardrails & Architectural Boundary View Component
import React from 'react';
import { Shield, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

export const RiskView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div>
        <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          Risk Management &amp; Architectural Isolation
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Strict Rules Enforcing Capital Preservation and Non-Execution Isolation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: 1.0% Fixed Stake & Anti-Martingale */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            1.0% Fixed Position Sizing (Anti-Martingale)
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Every candidate evaluated by Strategy v1.0 is calibrated strictly to
            a 1.0% risk stake per manual execution. Under no circumstances does the
            system support, recommend, or compute progressive multiplier sizing
            (Martingale or pseudo-grid averaging).
          </p>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
            <div>Risk Per Trade: 1.0% Equity</div>
            <div>Max Consecutive Losses Circuit Breaker: 3 Trades</div>
            <div>Daily Maximum Drawdown Cutoff: 3.0%</div>
          </div>
        </div>

        {/* Card 2: Broker Separation & Non-Execution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase font-mono flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-400" />
            Zero-Credential Broker Airgap
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The application contains zero brokerage API bindings, zero order routing
            modules, and zero trading credential storage facilities. The terminal state
            is exclusively a <strong className="text-indigo-300 font-mono">MANUAL_ALERT</strong>{' '}
            rendered on the operator's display.
          </p>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
            <div>Order Execution APIs: None (Disabled)</div>
            <div>Broker Credentials Stored: 0</div>
            <div>Automated Keystroke / Click Injector: None</div>
          </div>
        </div>
      </div>
    </div>
  );
};
