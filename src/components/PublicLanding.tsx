// Public Website & Research Methodology Portal
// Accessible to all visitors without authentication

import React from 'react';
import {
  Activity,
  Shield,
  Lock,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  Clock,
  Layers,
  BarChart,
  Users,
} from 'lucide-react';
import { STRATEGY_MANIFEST } from '../engine/manifest';

interface PublicLandingProps {
  onOpenAuth: () => void;
  onEnterDashboardIfApproved: () => void;
  isAuthenticated: boolean;
  userStatus?: string;
  onNavigate?: (route: string) => void;
}

import { Footer } from './Footer';

export const PublicLanding: React.FC<PublicLandingProps> = ({
  onOpenAuth,
  onEnterDashboardIfApproved,
  isAuthenticated,
  userStatus,
  onNavigate,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/30">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white tracking-wide">
              ComVision-Assisted Strategy Engine
            </h1>
            <p className="text-[10px] text-indigo-400 font-mono">
              Strategy v1.0 Frozen Specification
            </p>
          </div>
        </div>

        {/* Center / Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <button
            onClick={() => onNavigate?.('/docs')}
            className="hover:text-indigo-400 transition"
          >
            Documentation / How It Works
          </button>
          <button
            onClick={() => onNavigate?.('/about')}
            className="hover:text-indigo-400 transition"
          >
            About
          </button>
          <button
            onClick={() => onNavigate?.('/security')}
            className="hover:text-indigo-400 transition"
          >
            Security
          </button>
          <button
            onClick={() => onNavigate?.('/terms')}
            className="hover:text-indigo-400 transition"
          >
            Terms
          </button>
          <button
            onClick={() => onNavigate?.('/privacy')}
            className="hover:text-indigo-400 transition"
          >
            Privacy
          </button>
        </nav>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <button
              onClick={onEnterDashboardIfApproved}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20 transition"
            >
              <span>Launch Research Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20 transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Operator Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 space-y-16">
        {/* Hero Section */}
        <section className="space-y-6 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Controlled Experiment: EXP-2026-001 (100 Valid Setups)</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            ComVision-Assisted Strategy Research &amp; Decision-Support Engine
          </h2>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            A strictly non-execution quantitative research platform implementing
            a frozen 9-stage market microstructure validation pipeline, computer
            empirical telemetry logging.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={onOpenAuth}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>Enter Authorized Dashboard</span>
            </button>
            <button
              onClick={() => onNavigate?.('/docs')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Explore Documentation &amp; How It Works</span>
            </button>
            <a
              href="#manifesto"
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg border border-slate-800 transition"
            >
              View Non-Execution Manifesto
            </a>
          </div>
        </section>

        {/* Section: Architectural Boundary & Non-Execution Manifesto */}
        <section
          id="manifesto"
          className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5 relative overflow-hidden"
        >
          <div className="flex items-center gap-3 text-rose-400 border-b border-slate-800/80 pb-4">
            <Shield className="w-6 h-6" />
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                1. System Purpose &amp; Non-Execution Architectural Boundary
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Developer-Authoritative Technical Specification v3.4 Mandate
              </p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            The system is strictly classified as a{' '}
            <strong className="text-indigo-400">
              ComVision-Assisted Strategy Research &amp; Decision-Support Engine
            </strong>
            . It is <strong className="text-rose-400">NOT</strong> an automated trade execution bot.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                STRICTLY PROHIBITED CAPABILITIES
              </h4>
              <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                <li>Direct broker/exchange API execution sessions</li>
                <li>Credential/token storage for financial accounts</li>
                <li>Automated order placement or position modification</li>
                <li>UI automation (Playwright, Selenium, PyAutoGUI)</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
              <h4 className="font-bold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                FINAL SYSTEM EXECUTION STATE
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The functional lifecycle terminates strictly at:{' '}
                <strong className="text-slate-200 block mt-1">
                  Data Ingestion ⟶ Validation Pipeline ⟶ Telemetry Logging ⟶ MANUAL_ALERT
                </strong>
                Trade entry, parameters, position sizing, and placement remain
                exclusively the manual responsibility of the human operator.
              </p>
            </div>
          </div>
        </section>

        {/* Section: 9-Stage Validation Pipeline */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-white tracking-wide">
              The 9-Stage Strategy v1.0 Sequential Pipeline
            </h3>
            <p className="text-xs text-slate-400 max-w-xl mx-auto">
              Every candidate setup must pass through each stage in exact sequence.
              Any failure immediately halts execution with NO_ALERT.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
            <StageCard
              num="01"
              title="Market Structure"
              desc="5-candle symmetric fractal SH/SL. Confirmed strictly at Close of t+2 (no look-ahead)."
            />
            <StageCard
              num="02"
              title="FVG &amp; OB Confluence"
              desc="Displacement order block precursor with FVG zone strictly bound to Discount/Premium."
            />
            <StageCard
              num="03"
              title="3-Candle Breakout"
              desc="Displacement confirmation: C3 closes beyond C1 extreme without returning into base."
            />
            <StageCard
              num="04"
              title="Volume / Tick Proxy"
              desc="CFD/FX tick activity proxy: Requires ascending sequence or T2 > 10-period average."
            />
            <StageCard
              num="05"
              title="Wick &amp; Liquidity Sweep"
              desc="Opposite wick pushback <= 50%. Sweep fakeout detection vs authentic breakout."
            />
            <StageCard
              num="06"
              title="Inside Candle"
              desc="Frozen semantics: Does not reset sequence and does not increment formal candle count."
            />
            <StageCard
              num="07"
              title="Fib 50% Equilibrium"
              desc="Whole-zone boundary rule: Entire FVG zone must lie strictly below 50% for Bullish."
            />
            <StageCard
              num="08"
              title="News Guard Fail-Safe"
              desc="High-impact red-folder window [-30m, +30m]. If news source offline, triggers INCONCLUSIVE."
            />
            <StageCard
              num="09"
              title="T-10s Pressure"
              desc="Non-filtering observation. Categorical classification & magnitude; NO artificial percentages."
            />
          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => onNavigate?.('/docs')}
              className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              <span>Explore full mathematical definitions and diagrams in Documentation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Section: Access Control & Authorization Security */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Access Control &amp; Authorization Lifecycle
            </h3>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            The ComVision Research Engine is protected by server-side authentication
            and cryptographic password hashing (`scrypt`). Every account follows a
            strict authorization status lifecycle:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-center">
            <div className="p-3 bg-slate-950 border border-amber-500/30 rounded-lg">
              <span className="text-amber-400 font-bold block text-sm">PENDING</span>
              <span className="text-[10px] text-slate-500">Awaiting Admin Approval</span>
            </div>
            <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg">
              <span className="text-emerald-400 font-bold block text-sm">APPROVED</span>
              <span className="text-[10px] text-slate-500">Authorized Full Engine Access</span>
            </div>
            <div className="p-3 bg-slate-950 border border-rose-500/30 rounded-lg">
              <span className="text-rose-400 font-bold block text-sm">SUSPENDED</span>
              <span className="text-[10px] text-slate-500">Temporarily Paused</span>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-700 rounded-lg">
              <span className="text-slate-400 font-bold block text-sm">REVOKED</span>
              <span className="text-[10px] text-slate-500">Access Denied</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer
        currentPath="/"
        onNavigate={onNavigate || (() => {})}
        isAuthenticated={isAuthenticated}
        userStatus={userStatus}
        onOpenAuth={onOpenAuth}
      />
    </div>
  );
};

function StageCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1.5 hover:border-slate-700 transition">
      <div className="flex items-center justify-between text-slate-500 font-mono text-[10px]">
        <span>STAGE {num}</span>
      </div>
      <h4 className="font-bold text-slate-200 text-xs">{title}</h4>
      <p className="text-[11px] text-slate-400 leading-normal">{desc}</p>
    </div>
  );
}
