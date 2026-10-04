// Comprehensive Technical & Operational Documentation
// ComVision-Assisted Strategy Research & Decision-Support Engine

import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Layers,
  BarChart,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Hash,
  Clock,
  Lock,
  ArrowDown,
  Info,
  Sliders,
  Bell,
  Cpu,
  RefreshCw,
  Search,
} from 'lucide-react';

export const DocsView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'overview' | 'pipeline' | 'logic' | 'quality' | 'experiment' | 'telemetry' | 'alerts' | 'dashboard' | 'access'>('overview');

  return (
    <div className="space-y-12 text-slate-200">
      {/* Header Banner */}
      <div className="space-y-3 border-b border-slate-800 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
          <span>Technical Reference Manual</span>
          <span className="text-slate-600">•</span>
          <span>Strategy v1.0 Frozen Specification v3.4</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          ComVision Engine Documentation &amp; Technical Guide
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
          Complete technical reference for authorized research analysts, software auditors, and quantitative evaluators operating the ComVision-Assisted Strategy Research &amp; Decision-Support Engine.
        </p>

        {/* Quick Nav Bar */}
        <div className="flex flex-wrap gap-1.5 pt-4">
          {[
            { id: 'overview', label: '1. System Overview' },
            { id: 'pipeline', label: '2. 9-Stage Pipeline' },
            { id: 'logic', label: '3. Decision Logic Flow' },
            { id: 'quality', label: '4. Data Quality' },
            { id: 'experiment', label: '5. Experiment Mode' },
            { id: 'telemetry', label: '6. Telemetry & Hash Chain' },
            { id: 'alerts', label: '7. Manual Alert Protocol' },
            { id: 'dashboard', label: '8. Dashboard Feature Guide' },
            { id: 'access', label: '9. Access Control' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSection === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION A: SYSTEM OVERVIEW */}
      {(activeSection === 'overview' || activeSection === 'pipeline') && (
        <section id="overview" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Activity className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section A — System Overview &amp; Architecture
            </h2>
          </div>

          <div className="p-5 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-3">
            <h3 className="text-xs font-mono font-bold text-indigo-300 uppercase tracking-wider">
              Fundamental Architectural Declaration
            </h3>
            <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed font-serif italic">
              «The system evaluates market/chart data according to the frozen Strategy v1.0 rules and produces research/validation results and manual alerts. It does not place trades or execute broker orders.»
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-xs uppercase tracking-wider">
                <Info className="w-4 h-4 text-indigo-400" />
                What ComVision Is &amp; The Problem It Solves
              </h3>
              <p className="text-slate-400 leading-relaxed">
                <strong>ComVision</strong> is a computer-vision-assisted market microstructure research platform. In quantitative discretionary trading, human operators frequently suffer from cognitive bias, inconsistent rule enforcement, fatigue, and FOMO (fear of missing out).
              </p>
              <p className="text-slate-400 leading-relaxed">
                ComVision solves this by applying strict mathematical definitions, deterministic stage gates, optical character verification, and tamper-evident telemetry logging to chart structures before a setup is ever surfaced to an analyst.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-xs uppercase tracking-wider">
                <Shield className="w-4 h-4 text-emerald-400" />
                Strategy v1.0 &amp; "Decision-Support" Defined
              </h3>
              <p className="text-slate-400 leading-relaxed">
                <strong>Strategy v1.0</strong> is a developer-authoritative, parameter-frozen technical specification (v3.4). Every threshold, window, and formula is mathematically locked to ensure research reproducibility.
              </p>
              <p className="text-slate-400 leading-relaxed">
                <strong>Decision-Support</strong> means the software acts purely as an analytical observer and validator. It calculates whether price action meets formal criteria and emits a notification for human review. It possesses zero execution autonomy.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 bg-slate-900/80 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>WHAT THE SYSTEM DOES</span>
              </div>
              <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                <li>Ingests normalized OHLCV market feeds and vision streams</li>
                <li>Executes 9 sequential deterministic validation filters</li>
                <li>Logs complete Section 6 telemetry for every evaluated setup</li>
                <li>Maintains an immutable SHA-256 sequential audit chain</li>
                <li>Emits a non-executable <code>MANUAL_ALERT</code> upon validation</li>
                <li>Provides quantitative analytics on audited setup outcomes</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-900/80 border border-rose-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <XCircle className="w-4 h-4" />
                <span>WHAT THE SYSTEM DOES NOT DO</span>
              </div>
              <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                <li>Does NOT connect to brokers, exchanges, or FIX APIs</li>
                <li>Does NOT store broker credentials, API secrets, or accounts</li>
                <li>Does NOT calculate order sizes, risk-per-trade, or leverage</li>
                <li>Does NOT execute, place, or modify orders automatically</li>
                <li>Does NOT use UI bots (Selenium, Playwright, PyAutoGUI)</li>
                <li>Does NOT guarantee trading profits or financial outcomes</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* SECTION B: COMPLETE VALIDATION PIPELINE (9 STAGES) */}
      {(activeSection === 'pipeline' || activeSection === 'overview') && (
        <section id="pipeline" className="space-y-8">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Layers className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section B — Complete 9-Stage Validation Pipeline
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Every candle sequence candidate is evaluated through nine sequential stages. If any mandatory stage fails, the candidate is marked <span className="font-mono text-rose-400 font-bold">REJECT</span> or <span className="font-mono text-amber-400 font-bold">INCONCLUSIVE</span> and pipeline execution immediately halts.
          </p>

          {/* STAGE 1 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 1
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Market Structure &amp; 5-Candle Fractal Confirmation
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Strict Sequential Gate</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Market structure determines whether the underlying orderflow is structurally <strong>BULLISH</strong>, <strong>BEARISH</strong>, or <strong>UNCLEAR</strong>. In accordance with the non-look-ahead principle, a swing point can only be confirmed after two consecutive lower highs (for a Swing High) or two consecutive higher lows (for a Swing Low).
            </p>

            {/* Visual Fractal Diagram */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
              <div className="text-[11px] font-mono text-indigo-400 font-bold">
                Visual Diagram: Symmetric 5-Candle Fractal Swing High (Confirmed at Close of t+2)
              </div>
              <pre className="font-mono text-[11px] text-slate-400 bg-slate-900/90 p-3 rounded overflow-x-auto leading-tight">
{`          [ t ] (Apex High)
            |
            █   [t+1]
   [t-1]    █     |     [t+2] (Confirmation Candle Close)
     |      █     █       |
     █      █     █       █ <--- Swing High confirmed HERE at Close(t+2)
   [t-2]    █     █       █
     |      |     |       |
     █      █     █       █
--------------------------------------------------------------
  t-2: Low High | t-1: Higher | t: Peak High | t+1: Lower | t+2: Lower`}
              </pre>
              <div className="text-[10px] text-slate-500 font-mono">
                No-Look-Ahead Rule: Confirmation occurs strictly at the close of candle t+2. Candlesticks after t+2 cannot retrospectively alter or retroactively trigger the swing point.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-emerald-400 font-bold block">BULLISH STRUCTURE</span>
                <span className="text-[11px] text-slate-400">Higher Highs (HH) + Higher Lows (HL). Last structural break upward.</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-rose-400 font-bold block">BEARISH STRUCTURE</span>
                <span className="text-[11px] text-slate-400">Lower Highs (LH) + Lower Lows (LL). Last structural break downward.</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-amber-400 font-bold block">UNCLEAR / REJECT</span>
                <span className="text-[11px] text-slate-400">Conflicting swings or range expansion failure. Immediate pipeline rejection.</span>
              </div>
            </div>
          </div>

          {/* STAGE 2 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 2
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Fair Value Gap (FVG) &amp; Order Block Mathematical Confluence
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Strict Sequential Gate</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              A Fair Value Gap represents price inefficiency between candle C1 and candle C3 across an impulsive displacement candle C2. An Order Block represents the last opposite-direction candle preceding the impulsive expansion.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* Bullish FVG */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-emerald-400 font-bold text-xs">BULLISH FVG &amp; OB CONFLUENCE</span>
                <p className="text-slate-400 text-[11px]">
                  <strong>Condition:</strong> <code>Low(C3) &gt; High(C1)</code><br />
                  <strong>FVG Boundaries:</strong> <code>fvgBottom = High(C1)</code>, <code>fvgTop = Low(C3)</code><br />
                  <strong>OB Confluence Inequality:</strong><br />
                  <code>(High(C1) &lt;= High(Cob) || fvgBottom &lt;= High(Cob)) &amp;&amp; Low(C3) &gt; Low(Cob)</code>
                </p>
                <div className="text-[10px] text-slate-500">
                  Must originate within or touch the bullish order block without closing below its floor.
                </div>
              </div>

              {/* Bearish FVG */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-rose-400 font-bold text-xs">BEARISH FVG &amp; OB CONFLUENCE</span>
                <p className="text-slate-400 text-[11px]">
                  <strong>Condition:</strong> <code>High(C3) &lt; Low(C1)</code><br />
                  <strong>FVG Boundaries:</strong> <code>fvgBottom = High(C3)</code>, <code>fvgTop = Low(C1)</code><br />
                  <strong>OB Confluence Inequality:</strong><br />
                  <code>(Low(C1) &gt;= Low(Cob) || fvgTop &gt;= Low(Cob)) &amp;&amp; High(C3) &lt; High(Cob)</code>
                </p>
                <div className="text-[10px] text-slate-500">
                  Must originate within or touch the bearish order block without closing above its ceiling.
                </div>
              </div>
            </div>

            {/* Mitigation State Lifecycle */}
            <div className="space-y-2 text-xs">
              <h4 className="font-semibold text-slate-200">FVG Mitigation State Transitions</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-center">
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
                  <span className="text-emerald-400 font-bold block">UNMITIGATED</span>
                  <span className="text-[10px] text-slate-500">Price has not retraced into gap</span>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
                  <span className="text-amber-400 font-bold block">PARTIAL_FILL</span>
                  <span className="text-[10px] text-slate-500">Price retraces inside [fvgBottom, fvgTop]</span>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
                  <span className="text-rose-400 font-bold block">COMPLETELY_FILLED</span>
                  <span className="text-[10px] text-slate-500">Price pierces through opposite boundary</span>
                </div>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded">
                  <span className="text-slate-400 font-bold block">EXPIRED</span>
                  <span className="text-[10px] text-slate-500">Filled gap disqualified from alerts</span>
                </div>
              </div>
            </div>
          </div>

          {/* STAGE 3 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 3
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Three-Candle Strict Breakout Expansion
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Displacement Confirmation</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Validates that the expansion candle sequence establishes authentic directional displacement rather than chop or false drift:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-indigo-400 font-bold block">C1 (Origin / Base)</span>
                <span className="text-[11px] text-slate-400">Anchor candle establishing baseline range boundary.</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-indigo-400 font-bold block">C2 (Displacement)</span>
                <span className="text-[11px] text-slate-400">High-momentum impulse candle generating the imbalance.</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-indigo-400 font-bold block">C3 (Confirmation)</span>
                <span className="text-[11px] text-slate-400">Confirmation candle completing the FVG separation.</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-2">
              <div className="text-slate-300 font-bold">Strict Mathematical Inequality Rule:</div>
              <ul className="space-y-1 text-slate-400 text-[11px]">
                <li>• <strong>Bullish Breakout:</strong> <code>Close(C3) &gt; High(C1)</code> strictly.</li>
                <li>• <strong>Bearish Breakout:</strong> <code>Close(C3) &lt; Low(C1)</code> strictly.</li>
                <li>• <strong className="text-rose-400">Boundary Equality Rejection:</strong> If <code>Close(C3) == High(C1)</code> or <code>Close(C3) == Low(C1)</code>, it fails strict displacement and is immediately marked <span className="text-rose-400 font-bold">REJECT</span>. Closing inside the C1 range also deterministically rejects.</li>
              </ul>
            </div>
          </div>

          {/* STAGE 4 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 4
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Volume Proxy / Tick Activity Verification
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Tick Proxy vs Exchange Volume</span>
            </div>

            <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold font-mono">
                <AlertTriangle className="w-4 h-4" />
                <span>CRITICAL DISTINCTION: TICK_ACTIVITY_PROXY</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                In decentralized spot FX and CFD markets, centralized exchange order volume does not exist. The system does not treat broker tick counts as centralized exchange volume. All volume calculations are explicitly identified and logged as <strong>TICK_ACTIVITY_PROXY</strong>.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-2">
              <div className="text-slate-200 font-bold">Deterministic Pass Conditions (Either Condition Meets Gate):</div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px]">
                <li>
                  <strong>Ascending Sequence:</strong> <code>TickCount(C1) &lt; TickCount(C2) &lt; TickCount(C3)</code> (Accelerating participant participation).
                </li>
                <li>
                  <strong>Displacement Impulse:</strong> <code>TickCount(C2) &gt; Mean(TickCount(t-1 ... t-10))</code> (Displacement candle exceeds the 10-period rolling average tick count).
                </li>
              </ol>
              <p className="text-slate-500 text-[10px] pt-1">
                If neither condition is satisfied, the candidate is rejected for lack of participation momentum.
              </p>
            </div>
          </div>

          {/* STAGE 5 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 5
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Wick Pushback Ratio &amp; Liquidity Sweep Guard
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">&lt;= 50% Boundary Rule</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Detects counter-trend pushback and liquidity sweeps ("fakeouts") where price penetrates past an extreme but closes back inside, signifying institutional distribution/accumulation.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-indigo-300 font-bold">Wick Ratio Calculation &amp; Boundary</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  <code>TotalRange = High(C3) - Low(C3)</code><br />
                  <strong>Bullish Upper Wick:</strong> <code>High(C3) - max(Open(C3), Close(C3))</code><br />
                  <strong>Bearish Lower Wick:</strong> <code>min(Open(C3), Close(C3)) - Low(C3)</code><br />
                  <strong>Pushback Ratio:</strong> <code>OppositeWick / TotalRange</code>
                </p>
                <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-[11px]">
                  • <code>Ratio &lt;= 0.500 (50%)</code> ➔ <span className="text-emerald-400 font-bold">PASS</span><br />
                  • <code>Ratio &gt; 0.500 (50%)</code> ➔ <span className="text-rose-400 font-bold">REJECT ("Wick Fakeout")</span>
                </div>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-indigo-300 font-bold">Liquidity Sweep Detection</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  <strong>Bullish Sweep Check:</strong> If <code>High(C3) &gt; PriorSwingHigh</code> but <code>Close(C3) &lt;= PriorSwingHigh</code>, the breakout failed to hold above liquidity.
                  <br /><br />
                  <strong>Bearish Sweep Check:</strong> If <code>Low(C3) &lt; PriorSwingLow</code> but <code>Close(C3) &gt;= PriorSwingLow</code>, the breakdown failed to hold below liquidity.
                </p>
                <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[11px] text-rose-300">
                  Result: Flags <code>SWEEP_DETECTED</code> and halts pipeline with <code>REJECT</code>.
                </div>
              </div>
            </div>
          </div>

          {/* STAGE 6 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 6
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Inside Candle Recognition
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Non-Resetting Semantics</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              An Inside Candle occurs when the current candle's entire price range is completely engulfed within the previous candle's range:
            </p>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-2">
              <div className="text-slate-200 font-bold">Mathematical Condition:</div>
              <code className="text-indigo-300 block text-xs">High(t) &lt;= High(t-1) &amp;&amp; Low(t) &gt;= Low(t-1)</code>
              <p className="text-slate-400 text-[11px] leading-relaxed pt-1">
                <strong>Frozen v1.0 Semantics:</strong> An inside candle is recognized as market consolidation. It does <em>not</em> invalidate or reset the three-candle breakout pattern sequence, and it does not increment the formal three-candle count.
              </p>
            </div>
          </div>

          {/* STAGE 7 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 7
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  Fibonacci 50% Equilibrium Zone Rule
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Discount vs Premium Equilibrium</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Ensures high-probability institutional positioning by verifying that trades are taken only on the favorable side of market equilibrium:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-emerald-400 font-bold">BULLISH SETUP ➔ DISCOUNT ZONE</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  The local dealing range is formed between the most recent swing low and swing high.<br />
                  <code>Fib50 = SwingLow + 0.50 * (SwingHigh - SwingLow)</code><br />
                  <strong>Whole-Zone Rule:</strong> The <em>entire</em> FVG zone must lie strictly below Fib 50%: <code>fvgTop &lt; Fib50</code>.<br />
                  Touching or crossing the 50% boundary (<code>fvgTop &gt;= Fib50</code>) immediately fails and triggers <span className="text-rose-400 font-bold">REJECT</span>.
                </p>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-rose-400 font-bold">BEARISH SETUP ➔ PREMIUM ZONE</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  The local dealing range is formed between the most recent swing high and swing low.<br />
                  <code>Fib50 = SwingHigh - 0.50 * (SwingHigh - SwingLow)</code><br />
                  <strong>Whole-Zone Rule:</strong> The <em>entire</em> FVG zone must lie strictly above Fib 50%: <code>fvgBottom &gt; Fib50</code>.<br />
                  Touching or falling below the 50% boundary (<code>fvgBottom &lt;= Fib50</code>) immediately fails and triggers <span className="text-rose-400 font-bold">REJECT</span>.
                </p>
              </div>
            </div>
          </div>

          {/* STAGE 8 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 8
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  News Guard Macro Fail-Safe
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">±30m Window &amp; Data Availability</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Protects quantitative evaluations from chaotic macroeconomic volatility shocks (CPI, NFP, FOMC interest rate releases).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-slate-200 font-bold">Active High-Impact Event</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  If an active red-folder event occurs within the <code>[-30m, +30m]</code> window around candidate timestamp:
                  <br />➔ System status: <span className="text-rose-400 font-bold">ACTIVE_NEWS_LOCKOUT</span>
                  <br />➔ Decision: <span className="text-rose-400 font-bold">REJECT</span>
                </p>
              </div>

              <div className="p-4 bg-slate-950 border border-amber-500/30 rounded-xl space-y-2">
                <span className="text-amber-400 font-bold">News Source Offline Fail-Safe</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  <strong>"Never assume no news = clear":</strong> If the calendar feed cannot be verified or goes offline:
                  <br />➔ System status: <span className="text-amber-400 font-bold">NEWS_DATA_UNAVAILABLE</span>
                  <br />➔ Decision: <span className="text-amber-400 font-bold">INCONCLUSIVE</span> (Candidate halted)
                </p>
              </div>
            </div>
          </div>

          {/* STAGE 9 */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono text-xs font-bold">
                  STAGE 9
                </span>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                  T-10s Pre-Close Pressure Observation
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">Observation-Only Telemetry</span>
            </div>

            <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2 text-xs">
              <div className="font-mono font-bold text-indigo-300">
                CRITICAL REGULATORY SPECIFICATION:
              </div>
              <p className="text-indigo-100/90 font-serif italic text-xs sm:text-sm">
                «Pressure is an observation-only telemetry field in Strategy v1.0. It does not independently reject, filter, or change setup eligibility.»
              </p>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Analyzes micro-price movement velocity and direction during the final 10 seconds prior to candle close. It categorizes physical pressure without creating artificial probability percentages:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono text-center">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-emerald-400 font-bold block">ALIGNED</span>
                <span className="text-[10px] text-slate-500">Pressure matches candidate bias</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-slate-300 font-bold block">NEUTRAL</span>
                <span className="text-[10px] text-slate-500">Sub-threshold micro velocity</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-rose-400 font-bold block">OPPOSITE</span>
                <span className="text-[10px] text-slate-500">Pushback opposing candidate</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-amber-400 font-bold block">UNCERTAIN</span>
                <span className="text-[10px] text-slate-500">Mixed or erratic direction</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Magnitude &amp; Consistency classifications: <code>LOW</code>, <code>MEDIUM</code>, or <code>HIGH</code>. Strictly descriptive telemetry.
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: PIPELINE DECISION LOGIC FLOW */}
      {(activeSection === 'logic' || activeSection === 'overview') && (
        <section id="logic" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Sliders className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 3 — Pipeline Decision Logic Flow
            </h2>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Deterministic Sequential State Machine</h3>

            {/* Visual Flow Diagram */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
              <pre className="text-slate-300 leading-relaxed">
{`[ Ingest Market OHLCV & Vision Stream ]
                    │
                    ▼
[ Stage 1: Market Structure Gate ] ────────(FAIL)──► [ REJECT: Structure Unclear ]
                    │ (PASS)
                    ▼
[ Stage 2: FVG + OB Confluence Gate ] ─────(FAIL)──► [ REJECT: Confluence / Filled ]
                    │ (PASS)
                    ▼
[ Stage 3: 3-Candle Breakout Gate ] ───────(FAIL)──► [ REJECT: No Displacement ]
                    │ (PASS)
                    ▼
[ Stage 4: Tick Activity Proxy Gate ] ─────(FAIL)──► [ REJECT: Low Volume / Proxy ]
                    │ (PASS)
                    ▼
[ Stage 5: Wick & Sweep Guard Gate ] ──────(FAIL)──► [ REJECT: Wick Fakeout / Sweep ]
                    │ (PASS)
                    ▼
[ Stage 6: Inside Candle Check ] ──────────(HOLD)──► [ Maintain State (No Reset) ]
                    │ (PASS)
                    ▼
[ Stage 7: Fib 50% Equilibrium Gate ] ─────(FAIL)──► [ REJECT: Not in Discount/Premium ]
                    │ (PASS)
                    ▼
[ Stage 8: News Guard Macro Gate ] ────────(FAIL)──► [ REJECT (Active) | INCONCLUSIVE (Offline) ]
                    │ (PASS)
                    ▼
[ Stage 9: T-10s Pressure Observation ] ───(OBSV)──► [ Append Descriptive Telemetry ]
                    │
                    ▼
[ SHA-256 Telemetry Hash-Chaining & Logging ]
                    │
                    ▼
[ Final Decision: PASS ] ──────────────────────────► [ Emit: MANUAL_ALERT (Non-executable) ]`}
              </pre>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong>Auditability Guarantee:</strong> Rejected and inconclusive candidates are <em>never silently deleted</em> or discarded. Every setup evaluated by the engine receives a permanent, cryptographically linked record in the candidate history table and telemetry store.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
                <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg">
                  <span className="text-emerald-400 font-bold block">PASS ➔ CONTINUE</span>
                  <span className="text-slate-400">All 8 mandatory gates satisfied. Emits research alert.</span>
                </div>
                <div className="p-3 bg-slate-950 border border-rose-500/30 rounded-lg">
                  <span className="text-rose-400 font-bold block">REJECT ➔ HALT &amp; LOG</span>
                  <span className="text-slate-400">Strategy criteria violated. Reason permanently recorded.</span>
                </div>
                <div className="p-3 bg-slate-950 border border-amber-500/30 rounded-lg">
                  <span className="text-amber-400 font-bold block">INCONCLUSIVE ➔ HALT &amp; LOG</span>
                  <span className="text-slate-400">Data quality or news feed uncertainty. Halts execution safely.</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 4: DATA QUALITY DOCUMENTATION */}
      {(activeSection === 'quality' || activeSection === 'overview') && (
        <section id="quality" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Cpu className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 4 — Data Quality Classification &amp; Fail-Safes
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Data integrity is continuously validated across optical character recognition (OCR), canvas streams, and OHLCV feed providers before calculations execute.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-4 bg-slate-900 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>COMPLETE</span>
              </div>
              <p className="text-slate-300 text-[11px]">
                Vision stream confidence &gt; 95%, zero missing candles, zero zero-range bars, and verified timestamps. Core data is fully valid and reliable.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>DEGRADED</span>
              </div>
              <p className="text-slate-300 text-[11px]">
                Minor quality issues (e.g., vision confidence between 85% and 95%, or minor latency jitter), but core prices remain usable for evaluation.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-rose-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold">
                <XCircle className="w-4 h-4" />
                <span>INVALID</span>
              </div>
              <p className="text-slate-300 text-[11px]">
                Critical data integrity failure: vision confidence &lt; 85%, corrupted price feeds, missing bars, or corrupted timestamps. Pipeline cannot proceed.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold">
                <HelpCircle className="w-4 h-4" />
                <span>INCONCLUSIVE STATE</span>
              </div>
              <p className="text-slate-300 text-[11px]">
                <strong>Crucial Distinction:</strong> <code>INCONCLUSIVE</code> represents data/system uncertainty (such as an offline news feed or zero-range flat candle), <em>not</em> a trading signal or strategy rejection.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 5: EXPERIMENT MODE (EXP-2026-001) */}
      {(activeSection === 'experiment' || activeSection === 'overview') && (
        <section id="experiment" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <BarChart className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 5 — Controlled Experiment: EXP-2026-001
            </h2>
          </div>

          <div className="p-5 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-3">
            <h3 className="text-xs font-mono font-bold text-indigo-300 uppercase tracking-wider">
              Scientific Methodology Notice
            </h3>
            <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed font-serif italic">
              «The 100-setup experiment is a controlled research/validation process. Passing software validation does not establish profitability or guarantee future outcomes.»
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-100 uppercase tracking-wider font-mono text-xs">
                Experiment Scope &amp; Freeze Mandate
              </h3>
              <p className="leading-relaxed text-slate-400">
                Experiment <strong>EXP-2026-001</strong> tests Strategy v1.0 across an audited sample of exactly <strong>100 valid setups</strong>. During the active experiment:
              </p>
              <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
                <li>Parameters (wick threshold 0.50, Fib equilibrium 0.50) are strictly locked</li>
                <li>All parameter modification attempts via API return 423 Locked</li>
                <li>Every setup receives an immutable <code>setup_id</code> (e.g., <code>SET-2026-00042</code>)</li>
                <li>Full Section 6 telemetry is generated and appended to the hash chain</li>
              </ul>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-100 uppercase tracking-wider font-mono text-xs">
                Auditable Setup Logging &amp; Analytics
              </h3>
              <p className="leading-relaxed text-slate-400">
                To prevent researcher p-hacking or selective survivorship bias, both valid candidates and rejected candidates are preserved in the experiment ledger.
              </p>
              <p className="leading-relaxed text-slate-400">
                Analysts can review empirical performance (Win / Loss / Break-even tracking), win rate, profit factor, average R:R, and average duration computed strictly from human-recorded outcomes.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 6: TELEMETRY & AUDITABILITY */}
      {(activeSection === 'telemetry' || activeSection === 'overview') && (
        <section id="telemetry" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Hash className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 6 — Telemetry Schema &amp; SHA-256 Audit Chain
            </h2>
          </div>

          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl">
              <p className="text-xs sm:text-sm text-indigo-200 font-serif italic">
                «Each telemetry record contains an integrity relationship with the previous record, allowing later tampering to be detected.»
              </p>
            </div>

            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              High-Level Master Telemetry Fields (Section 6 Schema)
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono text-slate-300">
              {[
                'setup_id',
                'timestamp',
                'data_quality',
                'timeframe',
                'structure_status',
                'fvg_metrics',
                'order_block_status',
                'pattern_3_candle',
                'tick_activity_proxy',
                'wick_check_ratio',
                'liquidity_sweep',
                'fib_zone_status',
                'news_status',
                'pressure_observation',
                'system_decision',
                'final_action',
              ].map((field) => (
                <div key={field} className="p-2 bg-slate-950 border border-slate-800 rounded text-center">
                  <span className="text-indigo-400 text-[11px] block truncate">{field}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-xs text-slate-400 leading-relaxed pt-2">
              <p>
                <strong>Cryptographic Tamper-Evidence:</strong> Each telemetry payload is serialized into canonical JSON and hashed via SHA-256 alongside the previous record's hash (<code>previous_record_hash</code>). Any retrospective tampering, deletion, or reordering breaks the chain immediately.
              </p>
              <p className="text-[11px] text-slate-500">
                <em>Security Boundary Notice:</em> Telemetry schemas and public documentation never expose secrets, database credentials, operator session tokens, API keys, or internal private encryption salts.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 7: MANUAL ALERT EXPLANATION */}
      {(activeSection === 'alerts' || activeSection === 'overview') && (
        <section id="alerts" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Bell className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 7 — Manual Alert Protocol &amp; Non-Execution
            </h2>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2">
              <div className="font-mono text-xs font-bold text-indigo-300">
                OFFICIAL SYSTEM ACTION DEFINITION:
              </div>
              <p className="text-xs sm:text-sm text-indigo-100/90 font-serif italic leading-relaxed">
                «MANUAL_ALERT is a research notification. It is not an automatic order and does not connect to a broker for execution.»
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-emerald-400 font-bold text-xs">WHAT system_decision = PASS MEANS</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Indicates that the candidate candle sequence has satisfied all 8 mandatory mathematical gates of Strategy v1.0 in exact sequence without violation.
                </p>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-indigo-400 font-bold text-xs">WHAT final_action = MANUAL_ALERT MEANS</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Displays an audio/visual notification on the analyst's screen with setup geometry and audit logs. The engine halts at this notification. All order placement decisions remain 100% human-directed.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 8: DASHBOARD FEATURE GUIDE (12 FEATURES) */}
      {(activeSection === 'dashboard' || activeSection === 'overview') && (
        <section id="dashboard" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Eye className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 8 — Authorized Dashboard Feature Guide
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Detailed operational guide for all 12 primary features of the private research dashboard. Each feature is documented according to its standardized 5-point specification.
          </p>

          <div className="space-y-6">
            {[
              {
                title: '1. Live Vision Stream',
                whatItDoes: 'Displays the dashboard chart canvas and its current price trajectory; this view is not a connected screen-capture/CV pipeline.',
                whatUserSees: 'Live animated candle canvas with FVG highlight zones, swing high/low badges, and current bar timer.',
                whatDataItUses: 'The selected candle source (Twelve Data REST, Alpha Vantage FX_INTRADAY, or explicitly labelled Replay) plus the current simulation/CV evidence metadata.',
                whatResultMeans: 'Provides visual confirmation of chart geometry currently being evaluated by the sequential pipeline.',
                whatItDoesNotDo: 'Does NOT interact with the user\'s desktop, execute broker charting scripts, or capture external application windows.',
              },
              {
                title: '2. Experiment Mode (EXP-2026-001)',
                whatItDoes: 'Tracks progress towards the 100-valid-setup sample quota under frozen parameter rules.',
                whatUserSees: 'Progress bar (0 to 100), lock status banner, setup count breakdown, and frozen parameter values.',
                whatDataItUses: 'Master telemetry candidates stored in the tamper-evident experiment ledger.',
                whatResultMeans: 'Indicates sample collection completeness and confirms parameter invariance throughout the test.',
                whatItDoesNotDo: 'Does NOT allow modifying thresholds, adjusting sample sizes, or resetting the experiment counter.',
              },
              {
                title: '3. Setup Logs Table',
                whatItDoes: 'Presents an exhaustive, auditable history of all evaluated candidates (PASS, REJECT, and INCONCLUSIVE).',
                whatUserSees: 'Tabular list with setup ID, timestamp, timeframe, bias, final action, outcome record, and Telemetry inspect button.',
                whatDataItUses: 'Complete historical array of MasterTelemetry objects.',
                whatResultMeans: 'Allows analysts to verify every decision and check detailed stage-by-stage rejection reasons.',
                whatItDoesNotDo: 'Does NOT allow deleting rejected setups, modifying recorded parameters, or altering past results.',
              },
              {
                title: '4. Quantitative Analytics',
                whatItDoes: 'Calculates performance metrics, win rate, profit factor, average R:R, and outcome distributions.',
                whatUserSees: 'Summary statistic cards (Win Rate, Profit Factor, Total R, Sample Size) and interactive outcome charts.',
                whatDataItUses: 'Human-recorded setup outcomes (WIN, LOSS, BREAK_EVEN) tied to validated setup IDs.',
                whatResultMeans: 'Summarizes empirical research findings for the active experiment.',
                whatItDoesNotDo: 'Does NOT project future profits, optimize curve-fit variables, or execute retrospective backtests.',
              },
              {
                title: '5. News Guard View',
                whatItDoes: 'Monitors economic calendar feeds for high-impact red-folder macroeconomic release windows.',
                whatUserSees: 'Status indicator (CLEAR, ACTIVE_NEWS_LOCKOUT, NEWS_DATA_UNAVAILABLE), active events list, and simulation controls.',
                whatDataItUses: 'Macroeconomic calendar API events + source availability ping.',
                whatResultMeans: 'Determines whether the macro environment is safe for technical pattern validation.',
                whatItDoesNotDo: 'Does NOT predict news direction, parse NLP sentiment, or execute straddle orders on announcements.',
              },
              {
                title: '6. Risk Guardrails',
                whatItDoes: 'Displays quantitative non-execution boundary rules, daily evaluation limits, and maximum risk guidelines.',
                whatUserSees: 'Static parameter limits (Max Drawdown rule, Risk-per-trade cap, Max setups per day) and compliance checklists.',
                whatDataItUses: 'Static configuration specifications from Developer-Authoritative v3.4.',
                whatResultMeans: 'Serves as an operational reminder of disciplined research risk management.',
                whatItDoesNotDo: 'Does NOT enforce auto-liquidation, margin stop-outs, or automated account balance controls.',
              },
              {
                title: '7. Settings View',
                whatItDoes: 'Displays engine configuration, data feed provider selection, and API key connectivity status.',
                whatUserSees: 'Provider selectors (Twelve Data, Alpha Vantage, Replay), timeframe picker, and read-only parameter cards.',
                whatDataItUses: 'Engine runtime configuration object.',
                whatResultMeans: 'Allows changing data sources and scanning timeframes.',
                whatItDoesNotDo: 'Does NOT alter frozen Strategy v1.0 mathematical thresholds while EXP-2026-001 is active.',
              },
              {
                title: '8. Telemetry Inspector Modal',
                whatItDoes: 'Inspects raw canonical Section 6 telemetry payload and SHA-256 hash chains for any selected setup.',
                whatUserSees: 'Tabbed JSON explorer with Data Quality, Stages 1-9 metrics, and cryptographic hash verification badge.',
                whatDataItUses: 'Exact stored MasterTelemetry JSON document.',
                whatResultMeans: 'Provides forensic proof of pipeline calculation integrity and chain verification.',
                whatItDoesNotDo: 'Does NOT expose private server secrets, database access tokens, or sensitive operator passwords.',
              },
              {
                title: '9. User Management View',
                whatItDoes: 'Allows authorized Administrator accounts to review access requests and manage user authorization statuses.',
                whatUserSees: 'Table of registered operators, roles (Admin / Analyst), statuses (PENDING, APPROVED, SUSPENDED, REVOKED), and approval buttons.',
                whatDataItUses: 'Server-side user accounts database.',
                whatResultMeans: 'Controls who is permitted to view private dashboard data and active alerts.',
                whatItDoesNotDo: 'Does NOT bypass server-side role checks (analyst accounts cannot access or perform user administration).',
              },
              {
                title: '10. Pause Alerts',
                whatItDoes: 'Silences audio/visual notifications on the analyst interface without interrupting pipeline calculation.',
                whatUserSees: 'Mute/unmute alert toggle button with visual active/muted status pill.',
                whatDataItUses: 'Client-side audio alert preferences.',
                whatResultMeans: 'Prevents sound interruptions during meetings or analytical reviews.',
                whatItDoesNotDo: 'Does NOT halt candle ingestion, disable telemetry logging, or stop background scanning.',
              },
              {
                title: '11. Stop Scanning',
                whatItDoes: 'Suspends automated polling and background candle evaluation.',
                whatUserSees: 'Scanner toggle button showing active pulse when scanning and paused state when halted.',
                whatDataItUses: 'Engine scannerActive runtime state boolean.',
                whatResultMeans: 'Puts the real-time polling loop into a paused state to conserve API credits and network bandwidth.',
                whatItDoesNotDo: 'Does NOT erase candidate logs or invalidate existing experiment history.',
              },
              {
                title: '12. Lock Experiment',
                whatItDoes: 'Enforces immutable parameter protection across EXP-2026-001.',
                whatUserSees: 'Experiment Lock indicator with persistent lock badge in the header and settings view.',
                whatDataItUses: 'experimentLocked flag stored in engine configuration.',
                whatResultMeans: 'Guarantees that all 100 setups in the experiment are evaluated under identical parameter values.',
                whatItDoesNotDo: 'Does NOT prevent running standard scans or logging validated setups.',
              },
            ].map((f) => (
              <div key={f.title} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span>{f.title}</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="font-mono text-slate-400 font-semibold block text-[11px]">What it does:</span>
                    <p className="text-slate-300 leading-normal">{f.whatItDoes}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-mono text-slate-400 font-semibold block text-[11px]">What the user sees:</span>
                    <p className="text-slate-300 leading-normal">{f.whatUserSees}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-mono text-slate-400 font-semibold block text-[11px]">What data it uses:</span>
                    <p className="text-slate-300 leading-normal">{f.whatDataItUses}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-mono text-slate-400 font-semibold block text-[11px]">What the result means:</span>
                    <p className="text-slate-300 leading-normal">{f.whatResultMeans}</p>
                  </div>
                </div>
                <div className="p-2.5 bg-rose-950/20 border border-rose-500/20 rounded text-[11px] font-mono text-rose-300">
                  <strong>What it does NOT do:</strong> {f.whatItDoesNotDo}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 9: ACCESS CONTROL DOCUMENTATION */}
      {(activeSection === 'access' || activeSection === 'overview') && (
        <section id="access" className="space-y-6">
          <div className="flex items-center gap-2.5 text-indigo-400 border-b border-slate-800 pb-3">
            <Lock className="w-5 h-5" />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">
              Section 9 — Access Control &amp; Server-Side Authorization
            </h2>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 text-xs">
            <p className="text-slate-300 leading-relaxed">
              The research dashboard and its API routes (<code>/api/engine/*</code>, <code>/api/news/*</code>, <code>/api/admin/*</code>) are strictly private and protected by server-side authorization middleware.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-mono text-center">
              <div className="p-3 bg-slate-950 border border-amber-500/30 rounded-lg">
                <span className="text-amber-400 font-bold block text-sm">PENDING</span>
                <span className="text-[10px] text-slate-500">Newly registered account. Access to dashboard blocked (403 Forbidden).</span>
              </div>
              <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg">
                <span className="text-emerald-400 font-bold block text-sm">APPROVED</span>
                <span className="text-[10px] text-slate-500">Authorized operator account. Granted full dashboard access.</span>
              </div>
              <div className="p-3 bg-slate-950 border border-rose-500/30 rounded-lg">
                <span className="text-rose-400 font-bold block text-sm">SUSPENDED</span>
                <span className="text-[10px] text-slate-500">Access temporarily paused by administrator. Blocked from API (403).</span>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-700 rounded-lg">
                <span className="text-slate-400 font-bold block text-sm">REVOKED</span>
                <span className="text-[10px] text-slate-500">Access permanently revoked. Session terminated.</span>
              </div>
            </div>

            <div className="space-y-2 text-slate-400 leading-relaxed pt-2">
              <p>
                <strong>Server-Side Enforcement:</strong> Unlike insecure implementations that merely hide UI elements on the client, access control is validated on every single HTTP request at the API gateway layer via cryptographically signed Bearer tokens and scrypt password hashes.
              </p>
              <p>
                <strong>Role Separation:</strong> Users holding the <code>Analyst</code> role are strictly prevented from viewing or modifying user accounts, approving new registrations, or accessing administrative audit controls.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
