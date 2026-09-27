// Dedicated Modal / Drawer displaying all valid setups detected by Strategy v1.0
import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  ChevronRight,
  Clock,
  Search,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
} from 'lucide-react';
import { MasterTelemetry } from '../engine/types';
import { formatSignalTime } from '../utils/timeFormat';

interface ValidSetupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  validSetups: MasterTelemetry[];
  selectedSetupId?: string;
  onSelectSetup: (setup: MasterTelemetry) => void;
}

export const ValidSetupsModal: React.FC<ValidSetupsModalProps> = ({
  isOpen,
  onClose,
  validSetups,
  selectedSetupId,
  onSelectSetup,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredSetups = validSetups.filter((s) => {
    const pair = s.metadata.pair || s.metadata.asset || 'EUR/USD';
    const setupId = s.metadata.setup_id || '';
    const bias = s.market_context.local_bias || '';
    const query = searchQuery.toLowerCase().trim();
    return (
      pair.toLowerCase().includes(query) ||
      setupId.toLowerCase().includes(query) ||
      bias.toLowerCase().includes(query)
    );
  });

  return (
    <div
      id="valid-setups-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        id="valid-setups-modal-panel"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  RECENT VALID SETUPS
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {validSetups.length} PASS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Strategy v1.0-FROZEN Authoritative Decision Records
              </p>
            </div>
          </div>

          <button
            id="btn-close-valid-setups-modal"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search / Filter Sub-bar */}
        <div className="p-3.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by pair (e.g. EUR/USD, NQ), setup ID, or bias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
          <div className="text-[11px] font-mono text-slate-400 shrink-0">
            Showing <strong className="text-white">{filteredSetups.length}</strong> of{' '}
            {validSetups.length}
          </div>
        </div>

        {/* Setups List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-800/40">
          {filteredSetups.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Clock className="w-8 h-8 mx-auto text-slate-500 mb-2" />
              <p className="text-sm font-semibold text-slate-300">
                No matching valid setups
              </p>
              <p className="text-xs text-slate-500 mt-1">
                All candidates filtered or no search results matching '{searchQuery}'.
              </p>
            </div>
          ) : (
            filteredSetups.map((setup, index) => {
              const pair = setup.metadata.pair || setup.metadata.asset || 'EUR/USD';
              const isBullish = setup.market_context.local_bias === 'BULLISH';
              const isSelected = setup.metadata.setup_id === selectedSetupId;
              const formattedTime = formatSignalTime(
                setup.metadata.signal_timestamp_utc || setup.metadata.timestamp_utc
              );
              const action = setup.system_execution.user_recorded_action;

              return (
                <div
                  key={`${setup.metadata.setup_id || 'setup'}-${index}`}
                  id={`valid-setup-item-${setup.metadata.setup_id}`}
                  onClick={() => {
                    onSelectSetup(setup);
                    onClose();
                  }}
                  className={`pt-2.5 first:pt-0 p-3 rounded-xl transition cursor-pointer flex items-center justify-between border ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500/50 shadow-md'
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Index Number */}
                    <span className="w-6 text-center font-mono text-xs font-bold text-slate-500 shrink-0">
                      {index + 1}.
                    </span>

                    {/* Pair & Direction Icon */}
                    <div className="shrink-0 flex items-center gap-1.5">
                      {isBullish ? (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-base font-bold font-mono text-white tracking-wide">
                        {pair}
                      </span>
                    </div>

                    {/* Bias Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border shrink-0 ${
                        isBullish
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {isBullish ? 'BULLISH' : 'BEARISH'}
                    </span>

                    {/* Timeframe */}
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] shrink-0 border border-slate-700">
                      {setup.market_context.selected_timeframe}
                    </span>

                    {/* Signal Timestamp: UTC and Bangladesh Time */}
                    <div className="hidden sm:flex flex-col font-mono text-[11px] text-slate-300 shrink-0">
                      <span className="font-semibold text-emerald-300">
                        {formattedTime.dualDisplay}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Signal: {formattedTime.utcDate}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Mobile time fallback */}
                    <div className="sm:hidden text-right font-mono text-[10px] text-slate-300">
                      <span className="text-emerald-300 block">{formattedTime.utcShort} UTC</span>
                      <span className="text-slate-400 block">{formattedTime.bdtShort} BDT</span>
                    </div>

                    {/* Research Observation & Action Badges */}
                    <div className="flex items-center gap-1.5">
                      {setup.next_candle_observation?.status && setup.next_candle_observation.status !== 'PENDING' && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
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

                      {action !== 'PENDING' && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            action === 'TAKEN'
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                              : action === 'NOT_TAKEN'
                              ? 'bg-slate-800 text-slate-300 border-slate-700'
                              : action === 'NOT_RECORDED'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                              : action === 'WIN'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : action === 'LOSS'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {action}
                        </span>
                      )}
                    </div>

                    <span className="text-xs font-mono text-slate-400 hidden md:inline">
                      {setup.metadata.setup_id}
                    </span>

                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Click any setup to inspect full validation telemetry</span>
          </div>
          <span className="text-[10px] text-slate-500">
            Timezone Authority: UTC & Asia/Dhaka (+06:00)
          </span>
        </div>
      </div>
    </div>
  );
};
