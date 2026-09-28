import React, { useMemo, useState } from 'react';
import { CheckCircle2, X, Upload } from 'lucide-react';
import { MasterTelemetry } from '../engine/types';

interface BatchRow {
  setupId: string;
  open: string;
  high: string;
  low: string;
  close: string;
  notes: string;
}

interface BatchResolveModalProps {
  candidates: MasterTelemetry[];
  onSubmit: (items: Array<{ setupId: string; nextCandle: { open: number; high: number; low: number; close: number }; notes?: string }>) => Promise<void>;
  onClose: () => void;
}

function initialRow(candidate: MasterTelemetry): BatchRow {
  const candles = (candidate as any)?.input_snapshot?.candles;
  const lastClose = candles?.[candles.length - 1]?.close;
  const fallback = typeof lastClose === 'number' ? String(lastClose) : '';
  return { setupId: candidate.metadata.setup_id, open: fallback, high: fallback, low: fallback, close: fallback, notes: '' };
}

export const BatchResolveModal: React.FC<BatchResolveModalProps> = ({ candidates, onSubmit, onClose }) => {
  const pendingCandidates = useMemo(
    () => candidates.filter((candidate) => !candidate.next_candle_observation || candidate.next_candle_observation.status === 'PENDING'),
    [candidates]
  );
  const [rows, setRows] = useState<BatchRow[]>(() => pendingCandidates.map(initialRow));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, field: keyof Omit<BatchRow, 'setupId'>, value: string) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const items = rows.map((row) => ({
      setupId: row.setupId,
      nextCandle: { open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close) },
      notes: row.notes || undefined,
    }));
    if (items.some((item) => Object.values(item.nextCandle).some((value) => !Number.isFinite(value)))) {
      setError('প্রতিটি pending signal-এর চারটি OHLC ঘর পূরণ করুন, তারপর Resolve চাপুন।');
      return;
    }
    if (items.some((item) => item.nextCandle.high < Math.max(item.nextCandle.open, item.nextCandle.close) || item.nextCandle.low > Math.min(item.nextCandle.open, item.nextCandle.close))) {
      setError('প্রতিটি row-তে High অবশ্যই Open/Close-এর বড় বা সমান এবং Low ছোট বা সমান হতে হবে।');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(items);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch resolve ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-400" /> Resolve All Pending
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">{pendingCandidates.length} pending signal(s) · backend calculates every result</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {pendingCandidates.length === 0 ? (
          <div className="p-10 text-center text-sm text-emerald-300"><CheckCircle2 className="w-8 h-8 mx-auto mb-3" />No pending signals to resolve.</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="overflow-auto max-h-[60vh] p-5">
              <div className="mb-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-[11px] text-slate-300">
                Enter the actual next-candle OHLC for each row. Any client-supplied WIN/LOSS label is ignored; the authoritative resolver uses stored bias plus these prices.
              </div>
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-slate-500 border-b border-slate-800"><tr><th className="p-2">Setup</th><th className="p-2">Bias</th><th className="p-2">Open</th><th className="p-2">High</th><th className="p-2">Low</th><th className="p-2">Close</th><th className="p-2">Notes</th></tr></thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pendingCandidates.map((candidate, index) => (
                    <tr key={candidate.metadata.setup_id}>
                      <td className="p-2 text-indigo-300 font-bold whitespace-nowrap">{candidate.metadata.setup_id}</td>
                      <td className="p-2 text-slate-300">{candidate.market_context.local_bias}</td>
                      {(['open', 'high', 'low', 'close'] as const).map((field) => (
                        <td className="p-2" key={field}><input inputMode="decimal" type="number" step="any" value={rows[index]?.[field] || ''} onChange={(e) => update(index, field, e.target.value)} className="w-24 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-slate-100 outline-none focus:border-indigo-500" aria-label={`${candidate.metadata.setup_id} ${field}`} /></td>
                      ))}
                      <td className="p-2"><input value={rows[index]?.notes || ''} onChange={(e) => update(index, 'notes', e.target.value)} className="w-40 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-slate-100 outline-none focus:border-indigo-500" placeholder="optional" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-800">
              <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold">{submitting ? 'Resolving…' : `Resolve ${pendingCandidates.length} Signal(s)`}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
