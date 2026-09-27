// Horizontal right-to-left animated setup feed component for Strategy v1.0
import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { MasterTelemetry } from '../engine/types';
import { formatSignalTime } from '../utils/timeFormat';

interface ValidSetupsFeedProps {
  validSetups: MasterTelemetry[];
  selectedSetupId?: string;
  onSelectSetup: (setup: MasterTelemetry) => void;
  onOpenAllList: () => void;
}

export const ValidSetupsFeed: React.FC<ValidSetupsFeedProps> = ({
  validSetups,
  selectedSetupId,
  onSelectSetup,
  onOpenAllList,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 320;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (validSetups.length === 0) {
    return null;
  }

  // Deduplicate by setup_id and arrange chronologically (oldest -> newest, so newest appears at the right)
  const seenIds = new Set<string>();
  const dedupedSetups: MasterTelemetry[] = [];
  for (const s of validSetups) {
    const id = s.metadata?.setup_id;
    if (!id || !seenIds.has(id)) {
      if (id) seenIds.add(id);
      dedupedSetups.push(s);
    }
  }
  const chronologicalSetups = [...dedupedSetups].reverse();

  return (
    <div
      id="valid-setups-feed-container"
      className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl relative overflow-hidden"
    >
      {/* Header of the Feed */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">
              Active Valid Setups Feed
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            {validSetups.length} DETECTED
          </span>
          <span className="hidden sm:inline text-[11px] font-mono text-slate-400">
            • Right → Left Stream
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Scroll navigation arrows */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleScroll('left')}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Scroll Left"
              aria-label="Scroll feed left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll('right')}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              title="Scroll Right"
              aria-label="Scroll feed right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            id="btn-feed-view-all"
            onClick={onOpenAllList}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-mono font-semibold transition"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>View All ({validSetups.length})</span>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Animated Setup Cards Rail */}
      <div
        ref={scrollContainerRef}
        className="flex items-stretch gap-3.5 overflow-x-auto pb-2 scroll-smooth scrollbar-thin scrollbar-thumb-slate-700"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {chronologicalSetups.map((setup, index) => {
            const pair = setup.metadata.pair || setup.metadata.asset || 'EUR/USD';
            const isBullish = setup.market_context.local_bias === 'BULLISH';
            const isSelected = setup.metadata.setup_id === selectedSetupId;
            const timeData = formatSignalTime(
              setup.metadata.signal_timestamp_utc || setup.metadata.timestamp_utc
            );
            const userAction = setup.system_execution.user_recorded_action;

            return (
              <motion.div
                key={`${setup.metadata.setup_id || 'setup'}-${index}`}
                layout
                initial={{ opacity: 0, x: 90, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 28,
                  mass: 0.8,
                }}
                onClick={() => onSelectSetup(setup)}
                className={`min-w-[280px] sm:min-w-[310px] p-3.5 rounded-xl border transition-all cursor-pointer select-none relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/30'
                    : 'bg-slate-950/70 border-slate-800 hover:bg-slate-900/90 hover:border-slate-700'
                }`}
              >
                {/* Card Top Row: Pair and Bias */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black font-mono tracking-wide text-white">
                        {pair}
                      </span>
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          isBullish
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isBullish ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {isBullish ? 'BULLISH' : 'BEARISH'}
                      </span>
                    </div>

                    <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono text-[10px] border border-slate-700">
                      {setup.market_context.selected_timeframe}
                    </span>
                  </div>

                  {/* Signal Time Box */}
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90 mb-2.5 space-y-1 font-mono">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Signal Time (UTC):</span>
                      <span className="font-bold text-slate-200">
                        {timeData.utcTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-400/90">Bangladesh (BDT):</span>
                      <span className="font-bold text-emerald-300">
                        {timeData.bdtTime}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom Meta */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                  <span className="text-slate-400 truncate mr-2">
                    {setup.metadata.setup_id}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {setup.next_candle_observation?.status && setup.next_candle_observation.status !== 'PENDING' && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                          setup.next_candle_observation.status === 'NEXT_CANDLE_FAVORABLE'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : setup.next_candle_observation.status === 'NEXT_CANDLE_UNFAVORABLE'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : setup.next_candle_observation.status === 'NEXT_CANDLE_NEUTRAL'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {setup.next_candle_observation.status === 'NEXT_CANDLE_FAVORABLE'
                          ? 'FAVORABLE'
                          : setup.next_candle_observation.status === 'NEXT_CANDLE_UNFAVORABLE'
                          ? 'UNFAVORABLE'
                          : setup.next_candle_observation.status === 'NEXT_CANDLE_NEUTRAL'
                          ? 'NEUTRAL'
                          : 'INCONCLUSIVE'}
                      </span>
                    )}

                    {userAction !== 'PENDING' ? (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          userAction === 'TAKEN'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : userAction === 'NOT_TAKEN'
                            ? 'bg-slate-800 text-slate-300 border-slate-700'
                            : userAction === 'NOT_RECORDED'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : userAction === 'WIN'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : userAction === 'LOSS'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {userAction}
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'text-indigo-400 bg-indigo-500/10'
                        }`}
                      >
                        {isSelected ? 'Active Selection' : 'Click to Inspect'}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
