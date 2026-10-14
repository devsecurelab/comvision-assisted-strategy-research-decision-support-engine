// News Guard View Component
// Implements Fail-Safe Verification and Economic Calendar Tracking
import React from 'react';
import { Globe, ShieldCheck } from 'lucide-react';
import { NewsEvent } from '../../engine/types';

interface NewsGuardViewProps {
  newsEvents: NewsEvent[];
  newsSourceOnline: boolean;
}

export const NewsGuardView: React.FC<NewsGuardViewProps> = ({
  newsEvents,
  newsSourceOnline,
}) => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Stage 8: News Guard Fail-Safe Architecture
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            High-Impact Red-Folder Economic Calendar &amp; Strict Fail-Safe Sentinel
          </p>
        </div>

        <span className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border ${newsSourceOnline ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300' : 'bg-amber-600/20 border-amber-500/30 text-amber-300'}`}>
          News Feed: {newsSourceOnline ? 'ONLINE' : 'UNAVAILABLE — FAIL-SAFE'}
        </span>
      </div>

      {/* Fail-Safe Protocol Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-200 uppercase font-mono flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Strict Fail-Safe Axiom: "Never Assume No News = Clear"
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          If the macroeconomic news scraper is unreachable, unauthenticated, or
          offline, the engine <strong className="text-rose-400">must never</strong>{' '}
          assume the market is clear. Under Section 4.2 of Strategy v1.0, any news
          source failure automatically transitions the system into an{' '}
          <strong className="text-amber-400 font-mono">INCONCLUSIVE (NO_ALERT)</strong>{' '}
          state to prevent entering during unverified high-volatility news spikes.
        </p>
      </div>

      {/* Economic Calendar Event List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
          Tracked High-Impact Economic Events (ForexFactory Mirror)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-2.5 px-3">Time (UTC)</th>
                <th className="py-2.5 px-3">Currency</th>
                <th className="py-2.5 px-3">Impact</th>
                <th className="py-2.5 px-3">Event Name</th>
                <th className="py-2.5 px-3">Restriction Window</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {newsEvents.map((evt, idx) => {
                const isRed = evt.impact === 'HIGH';
                const timeStr = new Date(evt.timestamp).toUTCString();

                return (
                  <tr key={`${evt.id || 'evt'}-${idx}`} className="hover:bg-slate-800/30 text-slate-300">
                    <td className="py-3 px-3 text-slate-400">{timeStr}</td>
                    <td className="py-3 px-3 font-bold text-slate-200">
                      {evt.currency}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isRed
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {evt.impact}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-200">
                      {evt.title}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      [-30 min, +30 min] Halted
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
