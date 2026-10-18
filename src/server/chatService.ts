// ComVision Assistant & Quantitative Research Chat Engine
// RDP Strategy V3.0 (Frozen) Master Specification (EXP-2026-V2-001)
// Natural Language Queries + Deterministic RDP Strategy V3.0 Pipeline Separation
// STRICT NON-EXECUTION BOUNDARY: Informational decision-support only. No trade execution.

import { executeStrategyPipeline, detectFractalSwings, evaluateMarketStructure } from '../engine/pipeline';
import { feedManager } from '../engine/dataProviders';
import { newsGuard } from '../engine/newsGuard';
import { analyticsService } from './analyticsService';
import { durableStorage, ChatMessage } from './storage';
import { formatSignalTime } from '../utils/timeFormat';
import { ACTIVE_STRATEGY_VERSION, ACTIVE_EXPERIMENT_ID, CONFIG_HASH, STRATEGY_MANIFEST } from '../engine/manifest';

export interface ChatResponse {
  message: string;
  queryType: ChatMessage['query_type'];
  referencedSetupIds?: string[];
  deterministicTelemetry?: any;
}

export class ChatService {
  public async processQuery(userOrId: any, userQuery: string): Promise<ChatResponse> {
    const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id || userOrId?.email || 'operator';
    const trimmed = userQuery.trim();
    const lower = trimmed.toLowerCase();

    // 1. Guard against RDP Strategy V3.0 mutation attempts (Scope Freeze Enforcement)
    const mutationMatch =
      lower.match(/(?:change|modify|update|set|alter|disable|override)\s*(?:wick|fib|threshold|parameter|strategy|ratio|setting|choch|bos|fvg|ifvg|bpr|breaker|ote|session)/i) ||
      lower.match(/(?:wick|fib|threshold|parameter|choch|bos|fvg|bpr|ote).*(?:change|বদল|পরিবর্তন|সংশোধন)/i);

    if (mutationMatch || lower.includes('change wick') || lower.includes('modify threshold') || lower.includes('disable rule')) {
      const responseText = [
        `🔒 [STRATEGY RULES ARE FROZEN — EXPERIMENT SCOPE FROZEN]`,
        ``,
        `Active Strategy: **${ACTIVE_STRATEGY_VERSION}** (Strategy v1.0-FROZEN legacy baseline archived) (Experiment: **${ACTIVE_EXPERIMENT_ID}**)`,
        `Configuration Hash: \`${CONFIG_HASH}\``,
        `Target Sample: **100 Valid Setups**`,
        ``,
        `Parameter modifications, threshold adjustments, indicator additions, and selective rule disabling are strictly prohibited to preserve scientific integrity and empirical reproducibility.`,
        ``,
        `Any rule evolution requires completing the 100-sample experiment and publishing a new hypothesis manifest (e.g. EXP-2026-V3-001).`,
      ].join('\n');

      durableStorage.recordAuditEvent({
        event_type: 'CHAT_MUTATION_ATTEMPT_BLOCKED',
        user_id: userId,
        details: { query: userQuery, config_hash: CONFIG_HASH },
      });

      durableStorage.recordChatMessage({
        user_id: userId,
        user_query: trimmed,
        assistant_response: responseText,
        query_type: 'MUTATION_ATTEMPT',
      });

      return {
        message: responseText,
        queryType: 'MUTATION_ATTEMPT',
      };
    }

    // 2. Config Hash & Manifest Queries
    if (lower.includes('config hash') || lower.includes('hash') || lower.includes('manifest') || lower.includes('হ্যাশ')) {
      const hashResponse = [
        `🛡️ **RDP Strategy V3.0 (Frozen) Master Manifest & Snapshot**`,
        ``,
        `• **Active Version**: \`${ACTIVE_STRATEGY_VERSION}\``,
        `• **Experiment ID**: \`${ACTIVE_EXPERIMENT_ID}\``,
        `• **Canonical SHA-256 Config Hash**:`,
        `  \`${CONFIG_HASH}\``,
        `• **Scope Freeze Status**: **LOCKED** (100 Valid Setups Target)`,
        `• **Execution Boundary**: **STRICTLY NON-EXECUTION** (Decision-Support Only)`,
        `• **Terminal Action**: **MANUAL_ALERT** (No broker connection, no automated trading)`,
        ``,
        `Every candidate evaluated across the 19 pipeline stages is chained with this cryptographic hash.`,
      ].join('\n');

      durableStorage.recordChatMessage({
        user_id: userId,
        user_query: trimmed,
        assistant_response: hashResponse,
        query_type: 'GENERAL',
      });

      return {
        message: hashResponse,
        queryType: 'GENERAL',
      };
    }

    // 3. Technical Concept Explanations (CHoCH, BOS, IFVG, BPR, Breaker, OTE, etc.)
    if (
      lower.includes('what is choch') ||
      lower.includes('choch কি') ||
      lower.includes('explain choch') ||
      lower.includes('what is ifvg') ||
      lower.includes('ifvg কি') ||
      lower.includes('what is bpr') ||
      lower.includes('bpr কি') ||
      lower.includes('what is breaker') ||
      lower.includes('breaker block কি') ||
      lower.includes('what is ote') ||
      lower.includes('ote কি') ||
      lower.includes('what is bos') ||
      lower.includes('bos কি')
    ) {
      let conceptText = '';
      if (lower.includes('choch')) {
        conceptText = [
          `📖 **Change of Character (CHoCH) in RDP Strategy V3.0 (Frozen):**`,
          ``,
          `• **Definition**: Early structural transition signaling potential shift in trend character.`,
          `• **Bullish CHoCH**: When prior structure was bearish (Lower Highs, Lower Lows) and current candle produces a decisive **Body Close** above the confirmed Lower High.`,
          `• **Bearish CHoCH**: When prior structure was bullish (Higher Highs, Higher Lows) and current candle produces a decisive **Body Close** below the confirmed Higher Low.`,
          `• **Distinction from BOS**: BOS represents trend continuation in the same direction; CHoCH marks the reversal pivot point.`,
          `• **States**: \`NO_CHoCH\`, \`BULLISH_CHoCH\`, \`BEARISH_CHoCH\`, \`UNCERTAIN\`.`,
        ].join('\n');
      } else if (lower.includes('ifvg')) {
        conceptText = [
          `📖 **Inverse Fair Value Gap (IFVG) in RDP Strategy V3.0 (Frozen):**`,
          ``,
          `• **Definition**: An existing FVG that transitions into an inversion zone once price closes decisively through its opposing boundary.`,
          `• **Bullish Invalidation**: Bullish FVG broken downward by body close (\`Close < FVG_LOW\`) transitions into Bearish IFVG resistance.`,
          `• **Bearish Invalidation**: Bearish FVG broken upward by body close (\`Close > FVG_HIGH\`) transitions into Bullish IFVG support.`,
          `• **States**: \`NONE\`, \`STANDARD_FVG\`, \`IFVG_CANDIDATE\`, \`IFVG_CONFIRMED\`, \`INVALIDATED\`.`,
        ].join('\n');
      } else if (lower.includes('bpr')) {
        conceptText = [
          `📖 **Balanced Price Range (BPR) in RDP Strategy V3.0 (Frozen):**`,
          ``,
          `• **Definition**: Deterministic overlap zone formed between opposing bullish and bearish Fair Value Gaps.`,
          `• **Formula**: \`[max(BullishFVG.bottom, BearishFVG.bottom), min(BullishFVG.top, BearishFVG.top)]\`.`,
          `• **Significance**: Represents a neutral equilibrium zone where bidirectional liquidity imbalances intersect and rebalance.`,
          `• **States**: \`NONE\`, \`BPR_CANDIDATE\`, \`BPR_CONFIRMED\`, \`BPR_INVALIDATED\`.`,
        ].join('\n');
      } else if (lower.includes('breaker')) {
        conceptText = [
          `📖 **Breaker Block in RDP Strategy V3.0 (Frozen):**`,
          ``,
          `• **Definition**: An Order Block that failed after sweeping liquidity and breaking market structure in the opposite direction.`,
          `• **Bullish Breaker**: A bearish OB that price subsequently displaced above via decisive body close.`,
          `• **Bearish Breaker**: A bullish OB that price subsequently displaced below via decisive body close.`,
          `• **States**: \`NO_BREAKER\`, \`BREAKER_CANDIDATE\`, \`BREAKER_CONFIRMED\`, \`BREAKER_INVALIDATED\`.`,
        ].join('\n');
      } else if (lower.includes('ote')) {
        conceptText = [
          `📖 **Optimal Trade Entry (OTE) in RDP Strategy V3.0 (Frozen):**`,
          ``,
          `• **Definition**: High-probability Fibonacci retracement pocket between **61.8% and 78.6%** of the structural swing.`,
          `• **Bullish Setup**: Retracement into [61.8%, 78.6%] discount zone from recent swing low to swing high.`,
          `• **Bearish Setup**: Retracement into [61.8%, 78.6%] premium zone from recent swing high to swing low.`,
          `• **States**: \`INSIDE_OTE\`, \`OUTSIDE_OTE\`, \`TOUCHED_OTE\`, \`CROSSED_OTE\`, \`UNCERTAIN\`.`,
        ].join('\n');
      } else {
        conceptText = [
          `📖 **Break of Structure (BOS) in RDP Strategy V3.0 (Frozen):**`,
          ``,
          `• **Definition**: Structural trend continuation confirmed exclusively by candle body close.`,
          `• **Bullish BOS**: Current candle \`Close > PreviousConfirmedSwingHigh\`.`,
          `• **Bearish BOS**: Current candle \`Close < PreviousConfirmedSwingLow\`.`,
          `• **Wick-Only Rule**: If the wick pierces the swing level but body closes inside, it is classified as a Liquidity Sweep, NOT a BOS.`,
        ].join('\n');
      }

      durableStorage.recordChatMessage({
        user_id: userId,
        user_query: trimmed,
        assistant_response: conceptText,
        query_type: 'GENERAL',
      });

      return {
        message: conceptText,
        queryType: 'GENERAL',
      };
    }

    // 4. Historical Research & Analytics Queries (Bengali & English)
    const isHistorical =
      lower.includes('কয়টা') ||
      lower.includes('কতগুলো') ||
      lower.includes('কয়টি') ||
      lower.includes('win') ||
      lower.includes('loss') ||
      lower.includes('favorable') ||
      lower.includes('unfavorable') ||
      lower.includes('not_taken') ||
      lower.includes('taken') ||
      lower.includes('signal outcome') ||
      lower.includes('valid signal') ||
      lower.includes('গত') ||
      lower.includes('আজ') ||
      lower.includes('last 3 days') ||
      lower.includes('how many');

    if (isHistorical && (lower.includes('signal') || lower.includes('win') || lower.includes('valid') || lower.includes('দিন') || lower.includes('days') || lower.includes('result'))) {
      const window = analyticsService.parseDateWindow(lower);
      const analytics = analyticsService.getAnalytics({
        startDateUtc: window.startUtc,
        endDateUtc: window.endUtc,
      });

      const responseLines = [
        `📊 **ComVision RDP Strategy V3.0 Research Summary / গবেষণা ফলাফল (${window.label} / Asia: Asia/Dhaka)**`,
        ``,
        `• **Strategy Version**: \`${ACTIVE_STRATEGY_VERSION}\` (\`${ACTIVE_EXPERIMENT_ID}\`)`,
        `• **Valid Setups (RDP Strategy V3.0 PASS)**: **${analytics.validSignalsCount}**`,
        ``,
        `• **Next-Candle Research Observations (Research WIN / LOSS)**:`,
        `   - NEXT_CANDLE_FAVORABLE (WIN): **${analytics.researchWins}**`,
        `   - NEXT_CANDLE_UNFAVORABLE (LOSS): **${analytics.researchLosses}**`,
        `   - Inconclusive / Pending: **${analytics.unresolvedCount}**`,
        `   - Empirical Favorable Rate (WIN Rate): **${analytics.winRatePercentage}%**`,
        ``,
        `• **Operator Recorded Actions (Strictly Separate Field)**:`,
        `   - TAKEN: **${analytics.userActions.taken}**`,
        `   - NOT_TAKEN: **${analytics.userActions.notTaken}** (Did not participate)`,
        `   - NOT_RECORDED: **${analytics.userActions.notRecorded ?? 0}** (No operator input)`,
        `   - SKIPPED: **${analytics.userActions.skipped}**`,
        ``,
        `*Note: research_observation != financial_trade_outcome. TAKEN, NOT_TAKEN, and NOT_RECORDED are completely separate operator discretionary action fields.*`,
        `*Data cryptographically chained under Config Hash: ${CONFIG_HASH.slice(0, 16)}...*`,
      ];

      const referencedIds = analytics.validSignals.map((s) => s.setupId).slice(0, 10);
      const responseText = responseLines.join('\n');

      durableStorage.recordChatMessage({
        user_id: userId,
        user_query: trimmed,
        assistant_response: responseText,
        query_type: 'HISTORICAL_ANALYTICS',
        referenced_setup_ids: referencedIds,
      });

      return {
        message: responseText,
        queryType: 'HISTORICAL_ANALYTICS',
        referencedSetupIds: referencedIds,
      };
    }

    // 5. Current Market Condition & Pair Analysis Queries (19 Stages)
    let pair = 'EUR/USD';
    if (lower.includes('btc') || lower.includes('bitcoin')) pair = 'BTC/USD';
    else if (/(^|\s)(nq|nasdaq)(\s|$)/.test(lower)) pair = 'NQ';
    else if (/(^|\s)(es|s&p|spx)(\s|$)/.test(lower)) pair = 'ES';
    else if (/(^|\s)(gbp|gbp\/usd)(\s|$)/.test(lower)) pair = 'GBP/USD';
    else if (/(^|\s)(eur|eur\/usd)(\s|$)/.test(lower)) pair = 'EUR/USD';

    const isMarketAnalysis =
      lower.includes('condition') ||
      lower.includes('অবস্থা') ||
      lower.includes('structure') ||
      lower.includes('বিশ্লেষণ') ||
      lower.includes('market') ||
      lower.includes('bullish') ||
      lower.includes('bearish') ||
      lower.includes('status');

    if (isMarketAnalysis || lower.includes(pair.toLowerCase())) {
      const status = feedManager.getStatus();

      let currentCandles;
      let higherTimeframeBias: 'BULLISH' | 'BEARISH' | 'UNCLEAR' = 'UNCLEAR';
      try {
        const marketData = await feedManager.fetchCandles(pair, '15m', status.provider);
        const htfData = await feedManager.fetchCandles(pair, '1h', status.provider);
        currentCandles = marketData.candles;
        const htfSwings = detectFractalSwings(htfData.candles, htfData.candles.length - 1);
        higherTimeframeBias = evaluateMarketStructure(htfSwings).bias;
        if (higherTimeframeBias === 'UNCLEAR') throw new Error('1h higher-timeframe bias is unclear.');
      } catch (error: any) {
        const responseText = `**NO_TRADE — provider data unavailable**\n\n${error?.message || 'The live market-data provider did not return a trustworthy response.'}\n\nResearch alert only.`;
        durableStorage.recordChatMessage({ user_id: userId, user_query: trimmed, assistant_response: responseText, query_type: 'MARKET_CONDITION' });
        return { message: responseText, queryType: 'MARKET_CONDITION' };
      }

      // Execute only on verified live provider candles.
      const telemetry = executeStrategyPipeline({
        
        candles: currentCandles,
        currentCandleIndex: currentCandles.length - 1,
        selectedTimeframe: '15m',
        higherTimeframeBias,
        newsEvents: newsGuard.getEvents(),
        newsSourceOnline: newsGuard.isOnline(),
            dataProvenance: 'LIVE_INGESTED',
        provider: status.provider,
        pair,
        asset: pair,
      });

      const timeData = formatSignalTime(telemetry.metadata.timestamp_utc);

      const responseLines = [
        `🔍 **[DETERMINISTIC MARKET ANALYSIS] ${pair} — RDP Strategy V3.0 Nine-Gate Decision**`,
        `Timeframe: **${telemetry.market_context.selected_timeframe}** | Setup: **${telemetry.metadata.setup_id}**`,
        ``,
        `**Authoritative V3 Gates:**`,
        ...(telemetry.decision_engine_v3?.gates ?? []).map((gate: any) =>
          `Gate ${gate.gate} (${gate.name}): **${gate.status ?? 'UNAVAILABLE'}** — ${gate.reason ?? 'No gate detail available.'}`
        ),
        ``,
        `**SYSTEM DECISION:** **${telemetry.system_execution.system_decision}**`,
        `**FINAL ACTION:** **${telemetry.system_execution.final_action}**`,
        ``,
        `Data Provenance: **${telemetry.metadata.data_provenance || 'LIVE_INGESTED'}**`,
        ``,
        `Timestamps:`,
        `• UTC: ${timeData.utcTime}`,
        `• Bangladesh (Asia/Dhaka): ${timeData.bdtTime}`,
        ``,
        `⚠️ *Decision-Support / Strategy Research Only. Strictly Non-Execution.*`,
      ];

      const responseText = responseLines.join('\n');

      durableStorage.recordChatMessage({
        user_id: userId,
        user_query: trimmed,
        assistant_response: responseText,
        query_type: 'MARKET_CONDITION',
        referenced_setup_ids: [telemetry.metadata.setup_id],
      });

      return {
        message: responseText,
        queryType: 'MARKET_CONDITION',
        referencedSetupIds: [telemetry.metadata.setup_id],
        deterministicTelemetry: telemetry,
      };
    }

    // 6. Default / Conversational Strategy Assistance
    const defaultResponse = [
      `👋 আমি ComVision RDP Strategy V3.0 Research Assistant।`,
      ``,
      `আমি আপনাকে RDP Strategy V3.0 (Frozen) সংক্রান্ত যেকোনো তথ্য এবং লাইভ টেলিমেট্রি বিশ্লেষণ জানাতে পারি:`,
      `1. **ঐতিহাসিক ফলাফল**: "গত ৩ দিনে কয়টা FAVORABLE এবং কয়টা UNFAVORABLE পর্যবেক্ষণ হয়েছিল?"`,
      `2. **মার্কেট অবস্থা**: "EUR/USD-এর current market condition কী?" অথবা "9-stage pipeline breakdown"`,
      `3. **স্ট্র্যাটেজি কনসেপ্ট**: "CHoCH কি?", "IFVG এবং BPR কীভাবে কাজ করে?", "OTE রেঞ্জ কত?"`,
      `4. **কনফিগ হ্যাশ**: "What is the canonical config hash?"`,
      ``,
      `*মনে রাখবেন: RDP Strategy V3.0-এর সমস্ত নিয়ম ফ্রোজেন (LOCKED) এবং কোনো ট্রেড অটোমেটিক এক্সিকিউট করা হয় না।*`,
    ].join('\n');

    durableStorage.recordChatMessage({
      user_id: userId,
      user_query: trimmed,
      assistant_response: defaultResponse,
      query_type: 'GENERAL',
    });

    return {
      message: defaultResponse,
      queryType: 'GENERAL',
    };
  }

  public getHistory(limit = 50): ChatMessage[] {
    const history = durableStorage.loadChatHistory();
    return history.slice(-limit);
  }
}

export const chatService = new ChatService();
