import React, { useMemo, useState } from 'react';
import { MasterTelemetry } from '../engine/types';

interface Props { telemetry: MasterTelemetry | null; }

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume?: number };

export const TelemetryCandleCanvas: React.FC<Props> = ({ telemetry }) => {
  const [showFvg, setShowFvg] = useState(true);
  const [showOb, setShowOb] = useState(true);
  const [showFib, setShowFib] = useState(true);
  const [showLiquidity, setShowLiquidity] = useState(true);
  const candles = useMemo<Candle[]>(() => {
    const raw = (telemetry as any)?.input_snapshot?.candles || (telemetry as any)?.candles || [];
    return Array.isArray(raw) ? raw.filter((c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)) : [];
  }, [telemetry]);
  const metrics = (telemetry as any)?.validation_metrics;
  const fvg = metrics?.fvg?.zone;
  const ob = metrics?.order_block?.ob_zone;
  const fib = metrics?.fib_zone?.fib_50_level;
  const bsl = metrics?.bsl_ssl?.nearest_bsl?.level;
  const ssl = metrics?.bsl_ssl?.nearest_ssl?.level;

  if (!telemetry || candles.length === 0) return <div className="h-72 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center text-xs font-mono text-slate-500">NO TELEMETRY EVIDENCE LOADED — RUN A SCAN TO BIND CANDLES</div>;

  const width = 1000;
  const height = 330;
  const pad = 28;
  const min = Math.min(...candles.map((c) => c.low), ...(fvg || []), ...(ob || []), fib || Infinity, bsl || Infinity, ssl || Infinity);
  const max = Math.max(...candles.map((c) => c.high), ...(fvg || []), ...(ob || []), fib || -Infinity, bsl || -Infinity, ssl || -Infinity);
  const range = Math.max(max - min, 0.00001);
  const x = (i: number) => pad + (i / Math.max(candles.length - 1, 1)) * (width - pad * 2);
  const y = (price: number) => pad + ((max - price) / range) * (height - pad * 2);
  const zone = (values: number[] | undefined) => values && values.length === 2 ? { top: y(Math.max(...values)), bottom: y(Math.min(...values)) } : null;
  const fvgZone = zone(fvg); const obZone = zone(ob);

  return <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 space-y-3" data-testid="telemetry-candle-canvas">
    <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-mono">
      <span className="text-cyan-300">SOURCE: {telemetry.vision_verification?.cv_evidence_source || telemetry.metadata.data_provenance || 'REPLAY'} • {telemetry.metadata.pair || 'UNKNOWN'} • {telemetry.market_context.selected_timeframe}</span>
      <div className="flex gap-2 text-slate-400">
        {[[showFvg, setShowFvg, 'FVG'], [showOb, setShowOb, 'OB'], [showFib, setShowFib, 'Fib 50'], [showLiquidity, setShowLiquidity, 'BSL/SSL']].map(([checked, setter, label]) => <label key={String(label)} className="flex items-center gap-1"><input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)} />{String(label)}</label>)}
      </div>
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-72" role="img" aria-label="Telemetry candlestick chart">
      <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="1" /></pattern></defs>
      <rect width={width} height={height} fill="url(#grid)" opacity="0.55" />
      {showFvg && fvgZone && <rect x={pad} y={fvgZone.top} width={width - pad * 2} height={Math.max(4, fvgZone.bottom - fvgZone.top)} fill="#6366f1" opacity="0.18" stroke="#818cf8" strokeDasharray="5 4" />}
      {showOb && obZone && <rect x={pad} y={obZone.top} width={width - pad * 2} height={Math.max(4, obZone.bottom - obZone.top)} fill="#10b981" opacity="0.14" stroke="#34d399" />}
      {showFib && Number.isFinite(fib) && <line x1={pad} x2={width - pad} y1={y(fib)} y2={y(fib)} stroke="#f59e0b" strokeWidth="2" strokeDasharray="10 7" />}
      {showLiquidity && Number.isFinite(bsl) && <line x1={pad} x2={width - pad} y1={y(bsl)} y2={y(bsl)} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 4" />}
      {showLiquidity && Number.isFinite(ssl) && <line x1={pad} x2={width - pad} y1={y(ssl)} y2={y(ssl)} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 4" />}
      {candles.map((c, i) => { const cx = x(i); const bullish = c.close >= c.open; const color = bullish ? '#34d399' : '#fb7185'; const bodyY = y(Math.max(c.open, c.close)); const bodyH = Math.max(2, Math.abs(y(c.close) - y(c.open))); return <g key={`${c.timestamp}-${i}`}><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.5" /><rect x={cx - 4} y={bodyY} width="8" height={bodyH} fill={color} /></g>; })}
    </svg>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-slate-400"><span>FVG: {metrics?.fvg?.fvg_status || 'UNAVAILABLE'}</span><span>OB: {metrics?.order_block?.ob_confluence_status || 'UNAVAILABLE'}</span><span>Fib: {metrics?.fib_zone?.status || 'UNAVAILABLE'}</span><span>Liquidity: {metrics?.bsl_ssl?.selected_liquidity_target || 'UNAVAILABLE'}</span></div>
  </div>;
};
