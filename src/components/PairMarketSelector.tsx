import React, { useMemo, useState } from 'react';
import { Check, Search, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '../config/api';

interface PairMarketSelectorProps {
  authToken: string | null;
  selectedPair?: string;
  activePairs?: string[];
  onUpdated: (state: { selectedPair: string; activePairs: string[] }) => void;
}

const MAJOR_PAIRS = ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CHF','USD/CAD','NZD/USD','EUR/JPY','GBP/JPY','EUR/GBP','EUR/CHF','EUR/CAD','EUR/AUD','EUR/NZD','GBP/CHF','GBP/CAD','GBP/AUD','AUD/JPY','CAD/JPY','CHF/JPY'];
const MINOR_PAIRS = ['GBP/NZD','AUD/CAD','AUD/CHF','AUD/NZD','CAD/CHF','NZD/JPY','NZD/CAD','NZD/CHF','EUR/HKD','GBP/HKD','EUR/SGD','GBP/SGD','AUD/SGD','EUR/SEK','EUR/NOK','GBP/SEK','EUR/TRY','GBP/TRY','EUR/ZAR','GBP/ZAR'];
const ALL_PAIRS = [...MAJOR_PAIRS, ...MINOR_PAIRS];

export const PairMarketSelector: React.FC<PairMarketSelectorProps> = ({ authToken, selectedPair = 'EUR/USD', activePairs = ['EUR/USD'], onUpdated }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'MAJOR' | 'MINOR' | 'ALL'>('MAJOR');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const pairs = category === 'MAJOR' ? MAJOR_PAIRS : category === 'MINOR' ? MINOR_PAIRS : ALL_PAIRS;
  const displayed = useMemo(() => {
    const q = query.trim().replace('/', '').toUpperCase();
    return q ? pairs.filter((pair) => pair.replace('/', '').includes(q) || pair.includes(query.trim().toUpperCase())) : pairs;
  }, [pairs, query]);

  const update = async (endpoint: string, body: unknown) => {
    if (!authToken) return;
    setBusy(true);
    setMessage('Saving…');
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Unable to update pair scope');
      onUpdated({ selectedPair: data.selectedPair, activePairs: data.activePairs });
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setBusy(false);
      window.setTimeout(() => setMessage(''), 2500);
    }
  };

  const toggle = (pair: string) => {
    const next = activePairs.includes(pair) ? activePairs.filter((p) => p !== pair) : [...activePairs, pair];
    if (next.length === 0) return setMessage('Keep at least one pair active');
    void update('/api/engine/active-pairs', { pairs: next });
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4" data-testid="pair-market-selector">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase font-mono">Multi-Market Selector</h3>
            <p className="text-[10px] text-slate-500 font-mono">40 canonical pairs • {activePairs.length} active • focused: {selectedPair}</p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-emerald-400">{message || (busy ? 'Working…' : 'READY')}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['MAJOR', 'MINOR', 'ALL'] as const).map((value) => (
          <button key={value} onClick={() => setCategory(value)} className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold border ${category === value ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-950 text-slate-400 border-slate-700'}`}>
            {value === 'MAJOR' ? 'Major (20)' : value === 'MINOR' ? 'Minor/Cross (20)' : 'All (40)'}
          </button>
        ))}
        <button onClick={() => void update('/api/engine/active-pairs', { pairs: MAJOR_PAIRS })} className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-slate-700 text-cyan-300 bg-slate-950">+ All Major</button>
        <button onClick={() => void update('/api/engine/active-pairs', { pairs: MINOR_PAIRS })} className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-slate-700 text-cyan-300 bg-slate-950">+ All Minor</button>
        <button onClick={() => void update('/api/engine/active-pairs', { pairs: ALL_PAIRS })} className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-slate-700 text-emerald-300 bg-slate-950">+ All 40</button>
        <button onClick={() => void update('/api/engine/active-pairs', { pairs: ['EUR/USD'] })} className="px-3 py-1.5 rounded-lg text-[10px] font-mono border border-slate-700 text-slate-400 bg-slate-950">Reset (1)</button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-cyan-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 40 pairs (e.g. JPY, EUR, GBP, ZAR)" className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500" data-testid="pair-search-input" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="pair-selector-row">
        {displayed.map((pair) => {
          const active = activePairs.includes(pair);
          const focused = selectedPair === pair;
          return <button key={pair} onClick={() => toggle(pair)} title={active ? 'Click again to remove this pair' : 'Click to add this pair'} className={`shrink-0 px-3 py-2 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 ${focused ? 'border-amber-400 bg-amber-500/20 text-amber-300' : active ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-950 text-slate-500'}`}>
            {active && <Check className="w-3 h-3" />}{pair}
          </button>;
        })}
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500">
        <span>Click = add pair • Click again = remove pair</span>
        <span className="text-cyan-300">Scanner runs while the main switch is active</span>
      </div>
    </section>
  );
};
