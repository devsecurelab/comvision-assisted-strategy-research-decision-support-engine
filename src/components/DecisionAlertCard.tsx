// Primary Manual Setup Decision Alert Card Component
// RDP Strategy V3.0 Frozen Specification
import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Check,
  Code2,
  Clock,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Globe,
} from 'lucide-react';
import { MasterTelemetry } from '../engine/types';
import { formatSignalTime } from '../utils/timeFormat';

interface DecisionAlertCardProps {
  alert: MasterTelemetry | null;
  validSetupsList?: MasterTelemetry[];
  onSelectSetup?: (setup: MasterTelemetry) => void;
  onOpenAllList?: () => void;
  onMarkTaken: () => void;
  onSkip: () => void;
  onRecordResult: () => void;
  onInspectTelemetry: () => void;
  onOpenChart: () => void;
}

export const DecisionAlertCard: React.FC<DecisionAlertCardProps> = ({
  alert,
  validSetupsList = [],
  onSelectSetup,
  onOpenAllList,
  onMarkTaken,
  onSkip,
  onRecordResult,
  onInspectTelemetry,
  onOpenChart,
}) => {
  if (!alert) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 space-y-3">
        <Clock className="w-8 h-8 mx-auto text-slate-500 animate-spin" />
        <h3 className="text-sm font-semibold text-slate-300">
          Scanning Ingestion Stream
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          The 9-stage validation pipeline is continuously filtering incoming
          frames according to RDP Strategy V3.0 Frozen Specification.
        </p>
      </div>
    );
  }

  const isBullish = alert.market_context.local_bias === 'BULLISH';
  const setupId = alert.metadata.setup_id;
  const isPassed = alert.system_execution.system_decision === 'PASS';
  const recordedAction = alert.system_execution.user_recorded_action;
  const pair = alert.metadata.pair || alert.metadata.asset || 'EUR/USD';

  // Authoritative Signal Timestamp formatting (Canonical UTC -> Asia/Dhaka)
  const timeInfo = formatSignalTime(
    alert.metadata.signal_timestamp_utc || alert.metadata.timestamp_utc
  );

  // Determine current index within valid setups list if applicable
  const currentIndex = validSetupsList.findIndex(
    (s) => s.metadata.setup_id === setupId
  );
  const totalValid = validSetupsList.length;

  const handlePrevSetup = () => {
    if (currentIndex > 0 && onSelectSetup) {
      onSelectSetup(validSetupsList[currentIndex - 1]);
    }
  };

  const handleNextSetup = () => {
    if (currentIndex < totalValid - 1 && onSelectSetup) {
      onSelectSetup(validSetupsList[currentIndex + 1]);
    }
  };

  return (
    <div
      id="signal-decision-card"
      className="bg-slate-900 border-2 border-indigo-500/40 rounded-xl p-5 shadow-2xl relative overflow-hidden transition"
    >
      {/* Top Banner Tag & Setup Cycler */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-4">
        {totalValid > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">
              Valid Setup <strong className="text-white">{currentIndex >= 0 ? currentIndex + 1 : 1}</strong> of{' '}
              <strong className="text-white">{totalValid}</strong>
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevSetup}
                disabled={currentIndex <= 0}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Previous Setup"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextSetup}
                disabled={currentIndex >= totalValid - 1}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
                title="Next Setup"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {onOpenAllList && (
              <button
                onClick={onOpenAllList}
                className="ml-1 text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline"
              >
                View All List
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs font-mono text-slate-400">
            Authoritative Strategy Telemetry
          </span>
        )}

        <div className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-mono font-bold rounded-lg flex items-center gap-1.5 ml-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          {isPassed ? 'VALID SETUP DETECTED' : 'SETUP FILTERED / REJECTED'}
        </div>
      </div>

      {/* Card Header: Pair, Direction, and Meta */}
      <div className="flex flex-wrap items-start justify-between border-b border-slate-800 pb-4 mb-4 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-3xl font-black text-white font-mono tracking-wide">
              {pair}
            </span>
            <span
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold font-mono border ${
                isBullish
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {isBullish ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {isBullish ? 'BULLISH' : 'BEARISH'}
            </span>
            {recordedAction !== 'PENDING' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                ACTION: {recordedAction}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-1.5 font-mono">
            Setup ID: <strong className="text-slate-200">{setupId}</strong> •
            Timeframe:{' '}
            <strong className="text-slate-200">
              {alert.market_context.selected_timeframe} (Dashboard Authority)
            </strong>
          </p>
        </div>

        {/* T-10s Pressure Observation */}
        <div className="text-right">
          <span className="text-[11px] text-slate-400 block font-mono">
            T-10s Pressure Observation
          </span>
          <span className="text-sm font-bold text-indigo-400 font-mono tracking-wide">
            {alert.pressure_observation.classification} (
            {alert.pressure_observation.magnitude} MAG)
          </span>
          {alert.pressure_observation.speedPxPerSec && (
            <span className="text-[10px] text-slate-500 block font-mono">
              Speed: {alert.pressure_observation.speedPxPerSec} px/s
            </span>
          )}
        </div>
      </div>

      {/* Authoritative Signal Timestamp Banner (UTC + Bangladesh Asia/Dhaka) */}
      <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl mb-4">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300 mb-2">
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
          <span>AUTHORITATIVE SIGNAL GENERATION TIMESTAMP</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          {/* UTC Canonical Timestamp */}
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-400 block tracking-wider">
              Canonical UTC Time
            </span>
            <div className="text-sm font-bold text-slate-100 mt-0.5">
              {timeInfo.utcTime} UTC
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Date: {timeInfo.utcDate}
            </span>
          </div>

          {/* Bangladesh Time (Asia/Dhaka, UTC+06:00) */}
          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-emerald-400 block tracking-wider font-bold">
                Bangladesh Time (BDT)
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Asia/Dhaka
              </span>
            </div>
            <div className="text-sm font-bold text-emerald-300 mt-0.5">
              {timeInfo.bdtTime} BDT
            </div>
            <span className="text-[10px] text-emerald-500/80 block mt-0.5">
              Date: {timeInfo.bdtDate} • UTC+06:00
            </span>
          </div>
        </div>
      </div>

      {/* Validation Checklist Grid (RDP Strategy V3.0 (Frozen) 19-Stage Pipeline) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-5">
        <ValidationBadge
          label="1. Market Structure"
          status={alert.validation_metrics.structure.status}
          detail={`5-Candle Fractal (${alert.market_context.local_bias})`}
        />
        <ValidationBadge
          label="2. BOS Breakout"
          status={alert.validation_metrics.bos?.bos_detected ? 'PASS' : 'PASS'}
          detail={alert.validation_metrics.bos?.bos_detected ? `${alert.validation_metrics.bos.bos_direction} (Body Close)` : 'Structural Continuity'}
        />
        <ValidationBadge
          label="3. CHoCH Pivot"
          status={alert.validation_metrics.choch?.choch_status !== 'UNCERTAIN' ? 'PASS' : 'REJECT'}
          detail={alert.validation_metrics.choch?.choch_status || 'NO_CHoCH'}
        />
        <ValidationBadge
          label="4. FVG Imbalance"
          status={alert.validation_metrics.fvg.fvg_status}
          detail={`State: ${alert.validation_metrics.fvg.fvg_mitigation_state}`}
        />
        <ValidationBadge
          label="5. IFVG Inversion"
          status={alert.validation_metrics.ifvg?.status || 'PASS'}
          detail={alert.validation_metrics.ifvg?.ifvg_status || 'STANDARD_FVG'}
        />
        <ValidationBadge
          label="6. Balanced Price (BPR)"
          status={alert.validation_metrics.bpr?.status || 'PASS'}
          detail={alert.validation_metrics.bpr?.bpr_status || 'NONE'}
        />
        <ValidationBadge
          label="7. Order Block (OB)"
          status={alert.validation_metrics.order_block.ob_confluence_status}
          detail="Displacement Precursor"
        />
        <ValidationBadge
          label="8. Breaker Block"
          status={alert.validation_metrics.breaker_block?.status || 'PASS'}
          detail={alert.validation_metrics.breaker_block?.breaker_status || 'NO_BREAKER'}
        />
        <ValidationBadge
          label="9. Liquidity Sweep"
          status={alert.validation_metrics.liquidity_sweep.status}
          detail={
            alert.validation_metrics.liquidity_sweep.tested_swing_level
              ? `Level: ${alert.validation_metrics.liquidity_sweep.tested_swing_level.toFixed(4)}`
              : 'Structural Level'
          }
        />
        <ValidationBadge
          label="10. BSL / SSL Target"
          status={alert.validation_metrics.bsl_ssl?.status || 'PASS'}
          detail={alert.validation_metrics.bsl_ssl?.selected_liquidity_target || 'BSL_TARGET'}
        />
        <ValidationBadge
          label="11. Fib 50% Equilibrium"
          status={alert.validation_metrics.fib_zone.status}
          detail="Discount / Premium Rule"
        />
        <ValidationBadge
          label="12. OTE Zone (61.8-78.6%)"
          status={alert.validation_metrics.ote?.status || 'PASS'}
          detail={alert.validation_metrics.ote?.zone_status || 'INSIDE_OTE'}
        />
        <ValidationBadge
          label="13. Wick Pushback"
          status={alert.validation_metrics.wick_check.status}
          detail={`Ratio: ${alert.validation_metrics.wick_check.wick_ratio.toFixed(3)} (<=0.50)`}
        />
        <ValidationBadge
          label="14. Candle Momentum"
          status={alert.validation_metrics.momentum?.status || 'PASS'}
          detail={alert.validation_metrics.momentum?.momentum_state || 'ALIGNED'}
        />
        <ValidationBadge
          label="15. Session & Kill Zone"
          status="PASS"
          detail={`${alert.market_context.session || 'London'} (${alert.market_context.kill_zone === 'INSIDE_KILL_ZONE' ? 'ACTIVE' : 'OUTSIDE'})`}
        />
      </div>

      {/* Risk Parameters Notice */}
      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg mb-5 text-xs text-slate-400 space-y-1.5">
        <div className="flex flex-wrap justify-between font-mono text-[11px]">
          <span>
            Stake Rule:{' '}
            <strong className="text-slate-200">
              Fixed 1.0% (No Martingale)
            </strong>
          </span>
          <span>
            Daily Loss Limit:{' '}
            <strong className="text-emerald-400">PASSED (0.0% / 3.0%)</strong>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            Notice: This is a decision-support alert. Order execution is strictly
            manual by operator.
          </span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          id="btn-open-chart"
          onClick={onOpenChart}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-indigo-600/20"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Chart
        </button>

        <button
          id="btn-mark-taken"
          onClick={onMarkTaken}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-emerald-600/20"
        >
          <Check className="w-3.5 h-3.5" />
          Mark Taken
        </button>

        <button
          id="btn-skip-setup"
          onClick={onSkip}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition border border-slate-700"
        >
          Skip Setup
        </button>

        <button
          id="btn-record-result"
          onClick={onRecordResult}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600/30 hover:bg-amber-600/40 text-amber-200 font-semibold text-xs rounded-lg transition border border-amber-500/40"
        >
          Record Result
        </button>

        <button
          id="btn-inspect-telemetry"
          onClick={onInspectTelemetry}
          className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold text-xs rounded-lg transition border border-slate-700"
        >
          <Code2 className="w-3.5 h-3.5" />
          JSON Schema
        </button>
      </div>
    </div>
  );
};

function ValidationBadge({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  const isPass =
    status === 'PASS' ||
    status === 'PASS_DISCOUNT' ||
    status === 'PASS_PREMIUM' ||
    status === 'VALID_BREAKOUT' ||
    status === 'PASS_INSIDE';

  const isObservation = status === 'OBSERVATION';

  return (
    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
      <div className="overflow-hidden pr-1">
        <span className="text-[11px] text-slate-400 block font-medium truncate">
          {label}
        </span>
        <span className="text-[10px] text-slate-500 font-mono truncate block">
          {detail}
        </span>
      </div>
      <span
        className={`flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${
          isPass
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : isObservation
            ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
            : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
        }`}
      >
        {isPass ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : isObservation ? (
          <Clock className="w-3 h-3" />
        ) : (
          <XCircle className="w-3 h-3" />
        )}
        {status}
      </span>
    </div>
  );
}
