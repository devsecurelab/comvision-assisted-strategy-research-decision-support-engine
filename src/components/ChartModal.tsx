import React from 'react';
import { X, Activity } from 'lucide-react';
import { Candle, MasterTelemetry } from '../engine/types';

interface ChartModalProps { telemetry: MasterTelemetry | null; onClose: () => void; }
export interface PriceZone { low: number; high: number; }
const chartWidth = 900;
const chartHeight = 300;
const padding = 24;

function candlesFor(telemetry: MasterTelemetry): Candle[] {
  const snapshot = telemetry.candle_snapshot?.candles;
  return Array.isArray(snapshot)
    ? snapshot.filter((c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)).slice(-40)
    : [];
}

/** Gate 4 is the FVG validation range. Normalize it so low/high are always drawable. */
export function getGate4Zone(telemetry: MasterTelemetry): PriceZone | null {
  const zone = telemetry.validation_metrics?.fvg?.zone;
  if (!Array.isArray(zone) || zone.length !== 2 || !zone.every((price) => Number.isFinite(price))) return null;
  return { low: Math.min(zone[0], zone[1]), high: Math.max(zone[0], zone[1]) };
}

/** Resolve the authoritative signal candle timestamp across current and stored telemetry formats. */
export function getSignalCandleIndex(telemetry: MasterTelemetry, candles: Candle[]): number {
  const signalTs = telemetry.metadata.signal_candle_open_ts
    || telemetry.candle_snapshot?.signal_candle_open_ts
    || telemetry.decision_engine_v3?.signalCandleOpenTs
    || null;
  return signalTs ? candles.findIndex((candle) => candle.timestamp === signalTs) : -1;
}

export const ChartModal: React.FC<ChartModalProps> = ({ telemetry, onClose }) => {
  if (!telemetry) return null;
  const candles = candlesFor(telemetry);
  const pair = telemetry.metadata.pair || telemetry.metadata.asset || 'UNAVAILABLE';
  const direction = telemetry.decision_engine_v3?.binarySignal;
  const signalIndex = getSignalCandleIndex(telemetry, candles);
  const gate4Zone = getGate4Zone(telemetry);
  const allPrices = [
    ...candles.flatMap((c) => [c.high, c.low]),
    ...(gate4Zone ? [gate4Zone.low, gate4Zone.high] : []),
    ...(typeof telemetry.validation_metrics.fib_zone.fib_50_level === 'number' ? [telemetry.validation_metrics.fib_zone.fib_50_level] : []),
  ];
  const min = allPrices.length ? Math.min(...allPrices) : 0;
  const max = allPrices.length ? Math.max(...allPrices) : 1;
  const span = max - min || 1;
  const x = (index: number) => padding + (index + 0.5) * ((chartWidth - padding * 2) / Math.max(candles.length, 1));
  const y = (price: number) => padding + ((max - price) / span) * (chartHeight - padding * 2);
  const candleWidth = Math.max(3, ((chartWidth - padding * 2) / Math.max(candles.length, 1)) * 0.55);

  return <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl p-6 shadow-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3"><div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30"><Activity className="w-5 h-5" /></div><div>
          <h3 className="text-base font-bold text-white font-mono">{pair} — {telemetry.market_context.selected_timeframe} Microstructure Inspection</h3>
          <p className="text-xs text-slate-400 font-mono">Setup ID: {telemetry.metadata.setup_id} • Decision: {telemetry.system_execution.system_decision}</p>
        </div></div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 rounded" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      {candles.length === 0 ? <div className="h-80 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center text-sm font-mono text-slate-400">CHART UNAVAILABLE — candle snapshot not stored</div> :
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 overflow-x-auto"><svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Telemetry candle chart with Gate 4 range and signal candle" className="w-full min-w-[700px] h-80">
          <g stroke="#1e293b" strokeWidth="1">{[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1={padding} x2={chartWidth - padding} y1={padding + ratio * (chartHeight - padding * 2)} y2={padding + ratio * (chartHeight - padding * 2)} />)}</g>
          {gate4Zone && <g data-gate4-zone="true" aria-label="Gate 4 FVG range"><rect x={padding} y={y(gate4Zone.high)} width={chartWidth - padding * 2} height={Math.max(1, y(gate4Zone.low) - y(gate4Zone.high))} fill="#a78bfa" opacity="0.16" /><line x1={padding} x2={chartWidth - padding} y1={y(gate4Zone.high)} y2={y(gate4Zone.high)} stroke="#a78bfa" strokeDasharray="5 4" /><line x1={padding} x2={chartWidth - padding} y1={y(gate4Zone.low)} y2={y(gate4Zone.low)} stroke="#a78bfa" strokeDasharray="5 4" /></g>}
          {candles.map((candle, index) => { const top = y(Math.max(candle.open, candle.close)); const bottom = y(Math.min(candle.open, candle.close)); const bullish = candle.close >= candle.open; const selected = index === signalIndex; return <g key={`${candle.timestamp}-${index}`} data-signal-candle={selected ? 'true' : undefined} aria-label={selected ? 'Signal candle' : undefined}><line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={selected ? '#f8fafc' : bullish ? '#34d399' : '#fb7185'} strokeWidth={selected ? 3 : 1} /><rect x={x(index) - candleWidth / 2} y={top} width={candleWidth} height={Math.max(1, bottom - top)} fill={selected ? '#f8fafc' : bullish ? '#10b981' : '#f43f5e'} opacity={selected ? 1 : 0.78} /></g>; })}
          {typeof telemetry.validation_metrics.fib_zone.fib_50_level === 'number' && <line x1={padding} x2={chartWidth - padding} y1={y(telemetry.validation_metrics.fib_zone.fib_50_level)} y2={y(telemetry.validation_metrics.fib_zone.fib_50_level)} stroke="#fbbf24" strokeDasharray="4 4" />}
        </svg></div>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400"><span>Source: {telemetry.candle_snapshot?.source ?? 'UNAVAILABLE'}</span><span>Gate 4: {gate4Zone ? `[${gate4Zone.low}, ${gate4Zone.high}]` : 'UNAVAILABLE'}</span><span>Signal candle: {signalIndex >= 0 ? 'highlighted' : 'UNAVAILABLE'}</span><span>Direction: {direction === 'CALL' || direction === 'PUT' ? direction : 'UNAVAILABLE'}</span><span>Provider: {telemetry.metadata.provider ?? 'UNAVAILABLE'}</span><span>UTC: {telemetry.metadata.timestamp_utc}</span></div>
      <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg">Done Viewing</button></div>
    </div>
  </div>;
};
