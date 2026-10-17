import React from 'react';
import { Globe } from 'lucide-react';

export const NewsGuardView: React.FC = () => (
  <div className="max-w-4xl mx-auto w-full rounded-xl border border-amber-500/30 bg-amber-950/20 p-6 space-y-3">
    <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
      <Globe className="w-5 h-5 text-amber-400" />
      NEWS: NOT CHECKED (manual)
    </h2>
    <p className="text-sm text-slate-300 leading-relaxed">
      ComVision does not verify an economic calendar. Review the original calendar yourself before acting on any signal. A signal is research information only and is not an instruction to place an order.
    </p>
  </div>
);
