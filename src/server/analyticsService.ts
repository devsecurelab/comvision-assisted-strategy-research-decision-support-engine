// Research History & Quantitative Analytics Engine
// Computes verifiable performance metrics, outcome statistics, and trade actions
// from stored MasterTelemetry and SignalOutcomeRecords in durable storage.

import { durableStorage, SignalOutcomeRecord, SignalOutcome } from './storage';
import { MasterTelemetry } from '../engine/types';

export interface AnalyticsFilter {
  days?: number;
  startDateUtc?: string;
  endDateUtc?: string;
  pair?: string;
  bias?: 'BULLISH' | 'BEARISH';
  timeframe?: string;
}

export interface AnalyticsSummary {
  periodLabel: string;
  startDateUtc: string;
  endDateUtc: string;
  totalCandidatesEvaluated: number;
  validSignalsCount: number;
  // V3.0 Research Observation Semantics
  nextCandleFavorableCount: number;
  nextCandleUnfavorableCount: number;
  nextCandleNeutralCount: number;
  nextCandleInconclusiveCount: number;
  empiricalFavorablePercentage: number;
  // Legacy alias fields for backward compatibility
  researchWins: number;
  researchLosses: number;
  unresolvedCount: number;
  winRatePercentage: number;
  // Operator user actions (strictly separate from research observation)
  userActions: {
    taken: number;
    notTaken: number;
    notRecorded: number;
    skipped: number;
    pending: number;
  };
  outcomes?: Array<{ setup_id: string; outcome: string; userAction: string }>;
  summary?: {
    favorable: number;
    unfavorable: number;
    neutral: number;
    inconclusive: number;
    favorableRate: string;
    // Legacy compatibility fields
    wins: number;
    losses: number;
    unresolved: number;
    userTaken: number;
    userNotTaken: number;
    userSkipped: number;
    winRate: string;
  };
  pairBreakdown: Record<string, { total: number; favorable: number; unfavorable: number; neutral: number; inconclusive: number; win: number; loss: number; unresolved: number }>;
  validSignals: {
    setupId: string;
    pair: string;
    bias: string;
    signalTimeUtc: string;
    outcome: string;
    userAction: string;
  }[];
}

export class AnalyticsService {
  /**
   * Parse natural-language or numeric date window into UTC ISO boundaries
   */
  public parseDateWindow(query: string): { startUtc: string; endUtc: string; label: string } {
    const now = new Date();
    const bengaliNumerals: Record<string, string> = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
      '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
    };
    const q = query.toLowerCase().replace(/[০-৯]/g, (d) => bengaliNumerals[d] || d);

    if (q.includes('গত ২৪ ঘণ্টা') || q.includes('last 24 hours') || q.includes('24h')) {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { startUtc: start.toISOString(), endUtc: now.toISOString(), label: 'Last 24 Hours' };
    }

    if (q.includes('আজ') || q.includes('today')) {
      // Midnight today in Asia/Dhaka (UTC+6)
      const dhakaOffsetMs = 6 * 60 * 60 * 1000;
      const nowDhaka = new Date(now.getTime() + dhakaOffsetMs);
      nowDhaka.setUTCHours(0, 0, 0, 0);
      const startUtc = new Date(nowDhaka.getTime() - dhakaOffsetMs);
      return { startUtc: startUtc.toISOString(), endUtc: now.toISOString(), label: 'Today' };
    }

    if (q.includes('এই সপ্তাহে') || q.includes('this week')) {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startUtc: start.toISOString(), endUtc: now.toISOString(), label: 'This Week (7 Days)' };
    }

    // Check for custom day counts like "গত ৩ দিন", "গত ৫ দিন", "last 3 days"
    const match = q.match(/(?:গত|last)\s*(\d+)\s*(?:দিন|days)?/i);
    const days = match ? parseInt(match[1], 10) : 3;

    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startUtc: start.toISOString(),
      endUtc: now.toISOString(),
      label: `Last ${days} Days`,
    };
  }

  public parseNaturalDateRange(query: string): { startUtc: string; endUtc: string; label: string } {
    return this.parseDateWindow(query);
  }

  public evaluateNextCandleOutcome(
    bias: 'BULLISH' | 'BEARISH' | 'UNCLEAR',
    open: number,
    close: number
  ): 'NEXT_CANDLE_FAVORABLE' | 'NEXT_CANDLE_UNFAVORABLE' | 'NEXT_CANDLE_NEUTRAL' {
    if (close === open) return 'NEXT_CANDLE_NEUTRAL';
    if (bias === 'BULLISH') {
      return close > open ? 'NEXT_CANDLE_FAVORABLE' : 'NEXT_CANDLE_UNFAVORABLE';
    } else if (bias === 'BEARISH') {
      return close < open ? 'NEXT_CANDLE_FAVORABLE' : 'NEXT_CANDLE_UNFAVORABLE';
    } else {
      return 'NEXT_CANDLE_NEUTRAL';
    }
  }

  public recordOutcome(record: {
    setup_id: string;
    outcome:
      | 'NEXT_CANDLE_FAVORABLE'
      | 'NEXT_CANDLE_UNFAVORABLE'
      | 'NEXT_CANDLE_NEUTRAL'
      | 'NEXT_CANDLE_INCONCLUSIVE'
      | 'WIN'
      | 'LOSS'
      | 'UNRESOLVED';
    nextCandle?: SignalOutcomeRecord['next_candle'];
    userAction: 'TAKEN' | 'NOT_TAKEN' | 'NOT_RECORDED' | 'SKIPPED' | 'PENDING';
    timestamp?: string;
  }) {
    const existing = durableStorage.loadOutcomes();
    // Normalize outcome to frozen research semantics
    let standardized: SignalOutcome = record.outcome as SignalOutcome;
    if (record.outcome === 'WIN') standardized = 'NEXT_CANDLE_FAVORABLE';
    else if (record.outcome === 'LOSS') standardized = 'NEXT_CANDLE_UNFAVORABLE';
    else if (record.outcome === 'UNRESOLVED') standardized = 'NEXT_CANDLE_INCONCLUSIVE';

    const formatted: SignalOutcomeRecord = {
      setup_id: record.setup_id,
      pair: 'EUR/USD',
      timeframe: '5m',
      bias: 'BULLISH',
      signal_timestamp_utc: new Date().toISOString(),
      signal_timestamp_bdt: new Date().toISOString(),
      signal_outcome: standardized,
      outcome: standardized,
      user_recorded_action: record.userAction,
      userAction: record.userAction,
      result_timestamp_utc: record.timestamp || new Date().toISOString(),
      result_timestamp_bdt: record.timestamp || new Date().toISOString(),
      notes: 'Recorded via analyticsService',
    };
    if (record.nextCandle) {
      formatted.next_candle = record.nextCandle;
      formatted.nextCandleOpen = record.nextCandle.open;
      formatted.nextCandleClose = record.nextCandle.close;
    }
    durableStorage.saveOutcomes([...existing.filter((o) => o.setup_id !== record.setup_id), formatted]);
  }

  public getFilteredSetups(filter: { pair?: string }): MasterTelemetry[] {
    const candidates = durableStorage.loadCandidates();
    return candidates.filter((c) => {
      const pair = c.metadata.pair || c.metadata.asset || (c as any).input_snapshot?.symbol || 'EUR/USD';
      if (filter.pair && pair.toUpperCase() !== filter.pair.toUpperCase()) return false;
      return true;
    });
  }

  /**
   * Computes verified analytics strictly from stored telemetry
   */
  public getAnalytics(filter: AnalyticsFilter = {}): AnalyticsSummary {
    const candidates = durableStorage.loadCandidates();
    const outcomes = durableStorage.loadOutcomes();

    // Determine time boundary
    let startMillis = 0;
    let endMillis = Date.now();
    let periodLabel = 'All Time';

    if (filter.days) {
      startMillis = endMillis - filter.days * 24 * 60 * 60 * 1000;
      periodLabel = `Last ${filter.days} Days`;
    } else if (filter.startDateUtc) {
      startMillis = new Date(filter.startDateUtc).getTime();
      endMillis = filter.endDateUtc ? new Date(filter.endDateUtc).getTime() : Date.now();
      periodLabel = `From ${filter.startDateUtc.substring(0, 10)} to ${new Date(endMillis).toISOString().substring(0, 10)}`;
    }

    // Filter candidates by time and parameters
    const matchedCandidates = candidates.filter((c) => {
      const t = new Date(c.metadata.timestamp_utc).getTime();
      if (t < startMillis || t > endMillis) return false;

      const pair = c.metadata.pair || c.metadata.asset || 'EUR/USD';
      if (filter.pair && pair.toUpperCase() !== filter.pair.toUpperCase()) return false;

      if (filter.bias && c.market_context.local_bias !== filter.bias) return false;

      if (filter.timeframe && c.market_context.selected_timeframe !== filter.timeframe) return false;

      return true;
    });

    const validCandidates = matchedCandidates.filter(
      (c) => c.system_execution.system_decision === 'PASS'
    );

    let favorable = 0;
    let unfavorable = 0;
    let neutral = 0;
    let inconclusive = 0;

    let actionTaken = 0;
    let actionNotTaken = 0;
    let actionNotRecorded = 0;
    let actionSkipped = 0;
    let actionPending = 0;

    const pairBreakdown: Record<
      string,
      {
        total: number;
        favorable: number;
        unfavorable: number;
        neutral: number;
        inconclusive: number;
        win: number;
        loss: number;
        unresolved: number;
      }
    > = {};
    const validSignalList: AnalyticsSummary['validSignals'] = [];

    // Helper to normalize outcome to frozen semantics
    const normalizeOutcome = (raw?: string): 'NEXT_CANDLE_FAVORABLE' | 'NEXT_CANDLE_UNFAVORABLE' | 'NEXT_CANDLE_NEUTRAL' | 'NEXT_CANDLE_INCONCLUSIVE' => {
      if (!raw) return 'NEXT_CANDLE_INCONCLUSIVE';
      if (raw === 'NEXT_CANDLE_FAVORABLE' || raw === 'WIN') return 'NEXT_CANDLE_FAVORABLE';
      if (raw === 'NEXT_CANDLE_UNFAVORABLE' || raw === 'LOSS') return 'NEXT_CANDLE_UNFAVORABLE';
      if (raw === 'NEXT_CANDLE_NEUTRAL') return 'NEXT_CANDLE_NEUTRAL';
      return 'NEXT_CANDLE_INCONCLUSIVE';
    };

    // Process valid setups
    for (const c of validCandidates) {
      const setupId = c.metadata.setup_id;
      const pair = c.metadata.pair || c.metadata.asset || 'EUR/USD';
      const bias = c.market_context.local_bias;
      const outcomeRecord = outcomes.find((o) => o.setup_id === setupId);

      // Outcome resolution: prefer outcome record, fallback to candidate observation if present
      let rawOutcome =
        outcomeRecord?.signal_outcome ||
        outcomeRecord?.outcome ||
        c.next_candle_observation?.status;

      // Legacy fallback if candidate recorded legacy WIN/LOSS in user action
      if (!rawOutcome && (c.system_execution.user_recorded_action === 'WIN' || c.system_execution.user_recorded_action === 'LOSS')) {
        rawOutcome = c.system_execution.user_recorded_action;
      }

      const outcome = normalizeOutcome(rawOutcome);

      if (outcome === 'NEXT_CANDLE_FAVORABLE') favorable++;
      else if (outcome === 'NEXT_CANDLE_UNFAVORABLE') unfavorable++;
      else if (outcome === 'NEXT_CANDLE_NEUTRAL') neutral++;
      else inconclusive++;

      // User action resolution (CRITICAL: strictly separate from research observation outcome)
      const action = c.system_execution.user_recorded_action;
      if (action === 'TAKEN') {
        actionTaken++;
      } else if (action === 'NOT_TAKEN') {
        actionNotTaken++;
      } else if (action === 'NOT_RECORDED') {
        actionNotRecorded++;
      } else if (action === 'SKIPPED') {
        actionSkipped++;
      } else if (action === 'WIN' || action === 'LOSS') {
        // Legacy entries where user action was recorded as WIN/LOSS
        actionTaken++;
      } else {
        actionPending++;
      }

      // Pair breakdown
      if (!pairBreakdown[pair]) {
        pairBreakdown[pair] = {
          total: 0,
          favorable: 0,
          unfavorable: 0,
          neutral: 0,
          inconclusive: 0,
          win: 0,
          loss: 0,
          unresolved: 0,
        };
      }
      pairBreakdown[pair].total++;
      if (outcome === 'NEXT_CANDLE_FAVORABLE') {
        pairBreakdown[pair].favorable++;
        pairBreakdown[pair].win++;
      } else if (outcome === 'NEXT_CANDLE_UNFAVORABLE') {
        pairBreakdown[pair].unfavorable++;
        pairBreakdown[pair].loss++;
      } else if (outcome === 'NEXT_CANDLE_NEUTRAL') {
        pairBreakdown[pair].neutral++;
        pairBreakdown[pair].unresolved++;
      } else {
        pairBreakdown[pair].inconclusive++;
        pairBreakdown[pair].unresolved++;
      }

      validSignalList.push({
        setupId,
        pair,
        bias,
        signalTimeUtc: c.metadata.signal_timestamp_utc || c.metadata.timestamp_utc,
        outcome,
        userAction: action,
      });
    }

    const processedSetupIds = new Set(validCandidates.map((c) => c.metadata.setup_id));
    for (const o of outcomes) {
      if (processedSetupIds.has(o.setup_id)) continue;
      const outcome = normalizeOutcome(o.signal_outcome || (o as any).outcome);
      if (outcome === 'NEXT_CANDLE_FAVORABLE') favorable++;
      else if (outcome === 'NEXT_CANDLE_UNFAVORABLE') unfavorable++;
      else if (outcome === 'NEXT_CANDLE_NEUTRAL') neutral++;
      else inconclusive++;

      const action = o.user_recorded_action || (o as any).userAction;
      if (action === 'TAKEN' || action === 'WIN' || action === 'LOSS') {
        actionTaken++;
      } else if (action === 'NOT_TAKEN') {
        actionNotTaken++;
      } else if (action === 'NOT_RECORDED') {
        actionNotRecorded++;
      } else if (action === 'SKIPPED') {
        actionSkipped++;
      } else {
        actionPending++;
      }
    }

    const resolvedObservations = favorable + unfavorable;
    const favorableRate = resolvedObservations > 0 ? (favorable / resolvedObservations) * 100 : 0;

    return {
      periodLabel,
      startDateUtc: new Date(startMillis).toISOString(),
      endDateUtc: new Date(endMillis).toISOString(),
      totalCandidatesEvaluated: matchedCandidates.length,
      validSignalsCount: validCandidates.length,
      // V3.0 Research Observation Semantics
      nextCandleFavorableCount: favorable,
      nextCandleUnfavorableCount: unfavorable,
      nextCandleNeutralCount: neutral,
      nextCandleInconclusiveCount: inconclusive,
      empiricalFavorablePercentage: Number(favorableRate.toFixed(1)),
      // Legacy aliases
      researchWins: favorable,
      researchLosses: unfavorable,
      unresolvedCount: neutral + inconclusive,
      winRatePercentage: Number(favorableRate.toFixed(1)),
      userActions: {
        taken: actionTaken,
        notTaken: actionNotTaken,
        notRecorded: actionNotRecorded,
        skipped: actionSkipped,
        pending: actionPending,
      },
      summary: {
        favorable,
        unfavorable,
        neutral,
        inconclusive,
        favorableRate: `${favorableRate.toFixed(1)}%`,
        // Legacy aliases
        wins: favorable,
        losses: unfavorable,
        unresolved: neutral + inconclusive,
        userTaken: actionTaken,
        userNotTaken: actionNotTaken,
        userSkipped: actionSkipped,
        winRate: `${favorableRate.toFixed(1)}%`,
      },
      outcomes: outcomes.map((o) => ({
        setup_id: o.setup_id,
        outcome: o.signal_outcome || (o as any).outcome,
        userAction: o.user_recorded_action || (o as any).userAction,
      })),
      pairBreakdown,
      validSignals: validSignalList,
    };
  }
}

export const analyticsService = new AnalyticsService();
