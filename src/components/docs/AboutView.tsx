// About Engine & Research Mission Page
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React from 'react';
import { Activity, Shield, Target, BookOpen, CheckCircle2, AlertTriangle, Layers, HeartHandshake } from 'lucide-react';

export const AboutView: React.FC = () => {
  return (
    <div className="space-y-10 text-slate-200">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
          <Activity className="w-3.5 h-3.5" />
          <span>Project Governance &amp; Institutional Mission</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          About the ComVision Research Engine
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
          An empirical quantitative initiative establishing mathematically rigorous, non-execution decision support and reproducible market microstructure research.
        </p>
      </div>

      {/* Mission & Purpose */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-400" />
          <span>1. Project Mission &amp; Purpose</span>
        </h2>
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 text-xs sm:text-sm leading-relaxed text-slate-300">
          <p>
            The <strong>ComVision-Assisted Strategy Research &amp; Decision-Support Engine</strong> was engineered to bridge the gap between theoretical market microstructure models and disciplined human execution.
          </p>
          <p>
            In live markets, discretionary traders face significant behavioral obstacles: emotional fatigue, cognitive bias, inconsistent rule enforcement, and impulsive reactions to noise. ComVision's mission is to replace subjective interpretations with an uncompromising, automated mathematical validation layer that verifies market structure before any human decision is made.
          </p>
          <p>
            The system is built primarily for <strong>research, education, and algorithmic auditing</strong>, enabling quantitative researchers and students of market geometry to analyze the empirical behavior of liquidity vacuums, order blocks, and displacement patterns.
          </p>
        </div>
      </section>

      {/* Decision-Support & Non-Execution Philosophy */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>2. Decision-Support &amp; Non-Execution Design</span>
        </h2>
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs sm:text-sm text-slate-300">
          <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2">
            <span className="font-mono text-xs font-bold text-indigo-300 block">
              Architectural Non-Execution Philosophy
            </span>
            <p className="font-serif italic text-xs sm:text-sm text-indigo-100/90 leading-relaxed">
              «The software is explicitly architecturalized as a decision-support and research instrument. It never places trades, manages capital, or routes orders to financial brokerages.»
            </p>
          </div>

          <p className="leading-relaxed">
            Unlike commercial trading bots that promise automated riches while concealing execution risks, ComVision fundamentally terminates its software pipeline at <code className="text-indigo-300">MANUAL_ALERT</code>. This design enforces strict human accountability:
          </p>

          <ul className="space-y-2 text-xs text-slate-400 list-disc list-inside">
            <li>Zero broker API keys or exchange trading credentials are ever requested, processed, or stored.</li>
            <li>No automated trade entry, sizing algorithms, or position modification scripts exist anywhere in the codebase.</li>
            <li>All potential trading actions remain strictly the discretionary, manual decision of the licensed human operator.</li>
          </ul>
        </div>
      </section>

      {/* Strategy v1.0 & Experiment EXP-2026-001 */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>3. Strategy v1.0 &amp; The EXP-2026-001 Frozen Trial</span>
        </h2>
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 text-xs sm:text-sm leading-relaxed text-slate-300">
          <p>
            To avoid the widespread scientific trap of <em>overfitting and p-hacking</em> (altering strategy indicators after seeing losing trades), the ComVision Engine implements <strong>Strategy v1.0-FROZEN</strong>.
          </p>
          <p>
            Under formal trial <strong>EXP-2026-001</strong>, every parameter—including the 5-candle symmetric fractal definition, 50% wick pushback threshold, and Fibonacci equilibrium boundary—is locked against modification across a benchmark cohort of <strong>100 valid setups</strong>.
          </p>
          <p className="text-slate-400 text-xs">
            Every candidate, whether accepted, rejected for wick fakeouts, or halted due to data quality uncertainty, is permanently indexed in the audit trail.
          </p>
        </div>
      </section>

      {/* Integrity & Zero Unsupported Claims */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <HeartHandshake className="w-4 h-4 text-slate-400" />
          <span>4. Commitment to Scientific Integrity</span>
        </h2>
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 text-xs sm:text-sm leading-relaxed text-slate-300">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
            <div className="text-amber-400 font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>DISCLAIMER REGARDING UNSUPPORTED CLAIMS</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              We make zero claims of "guaranteed profit", "guaranteed accuracy", or "100% reliable signals". Financial markets involve substantial capital risk and past performance does not guarantee future results. The ComVision Engine is a decision-support validation tool, not a financial advisor or automated trading system.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            For technical inquiries, academic research collaborations, or bug reports, please contact: <code className="text-indigo-400">research@comvision-engine.internal</code>.
          </p>
        </div>
      </section>
    </div>
  );
};
