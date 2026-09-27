// Strategy Manifest — Active Strategy v2.0-FROZEN & Archived v1.0
// Target Scope: Strategy v2.0 Research & Agent Architecture
// Master Specification: Developer Implementation Specification
// Mode: Research / Decision-Support / Manual Alert Only
// Architectural Boundary: Strictly Non-Execution

export const ACTIVE_STRATEGY_VERSION = 'v2.0-FROZEN';
export const HISTORICAL_STRATEGY_VERSION = 'v1.0-ARCHIVED';
export const ACTIVE_EXPERIMENT_ID = 'EXP-2026-V2-001';

// Canonical Frozen Configuration Snapshot for v2.0
export const V2_CONFIG_SNAPSHOT = {
  strategy_version: ACTIVE_STRATEGY_VERSION,
  experiment_id: ACTIVE_EXPERIMENT_ID,
  specification_document: 'STRATEGY v2.0 RESEARCH & AGENT ARCHITECTURE Master Specification',
  execution_policy: 'STRICTLY_NON_EXECUTION_MANUAL_ALERT',
  structure_rules: {
    swing_fractal_left_n: 2,
    swing_fractal_right_n: 2,
    confirmation_delay: 'Close Timestamp of Candle (t+2)',
    symmetric: true,
  },
  bos_rules: {
    body_close_required: true,
    bullish: 'Close(current) > PreviousConfirmedSwingHigh',
    bearish: 'Close(current) < PreviousConfirmedSwingLow',
    wick_only_break_allowed: false,
  },
  choch_rules: {
    bullish: 'Close(current) > ConfirmedLowerHigh when previous structure was bearish',
    bearish: 'Close(current) < ConfirmedHigherLow when previous structure was bullish',
    states: ['NO_CHoCH', 'BULLISH_CHoCH', 'BEARISH_CHoCH', 'UNCERTAIN'],
  },
  fvg_rules: {
    bullish: 'Low(C3) > High(C1)',
    bearish: 'High(C3) < Low(C1)',
    confirmation: 'Close of Candle 3',
    mitigation_states: ['UNMITIGATED', 'PARTIAL_FILL', 'COMPLETELY_FILLED'],
  },
  ifvg_rules: {
    definition: 'Inverse Fair Value Gap formed upon decisive body close through FVG boundary',
    bullish_invalidation: 'Close < FVG_LOW',
    bearish_invalidation: 'Close > FVG_HIGH',
    states: ['NONE', 'STANDARD_FVG', 'IFVG_CANDIDATE', 'IFVG_CONFIRMED', 'INVALIDATED'],
  },
  bpr_rules: {
    definition: 'Balanced Price Range via deterministic overlap between opposing imbalance zones',
    overlap_formula: 'max(BullishFVG.bottom, BearishFVG.bottom) to min(BullishFVG.top, BearishFVG.top)',
    states: ['NONE', 'BPR_CANDIDATE', 'BPR_CONFIRMED', 'BPR_INVALIDATED'],
  },
  order_block_rules: {
    bullish: 'Last down-close candle immediately preceding bullish displacement',
    bearish: 'Last up-close candle immediately preceding bearish displacement',
  },
  breaker_block_rules: {
    definition: 'State transition of existing OB that failed after liquidity/structure invalidation',
    states: ['NO_BREAKER', 'BREAKER_CANDIDATE', 'BREAKER_CONFIRMED', 'BREAKER_INVALIDATED'],
  },
  liquidity_sweep_rules: {
    bullish_side_sweep: 'High > PriorSwingHigh && Close <= PriorSwingHigh',
    bearish_side_sweep: 'Low < PriorSwingLow && Close >= PriorSwingLow',
  },
  bsl_ssl_rules: {
    bsl: 'Buy-side liquidity above confirmed swing highs, equal highs, or structural highs',
    ssl: 'Sell-side liquidity below confirmed swing lows, equal lows, or structural lows',
    equality_tolerance: 'abs(P1 - P2) / currentPrice <= 0.0008',
    minimum_touches: {
      equal_highs_lows: 2,
      swing_point: 1,
    },
    merge_distance: 'abs(P1 - P2) / level <= 0.0004',
    qualification_criteria: {
      bsl: 'level > currentPrice && !is_invalidated',
      ssl: 'level < currentPrice && !is_invalidated',
    },
    invalidation_conditions: {
      bsl: 'Any candle Close > BSL level',
      ssl: 'Any candle Close < SSL level',
    },
    target_contexts: ['BSL_TARGET', 'SSL_TARGET', 'BOTH', 'NONE', 'UNCERTAIN'],
  },
  discount_premium_rules: {
    fib50_formula: 'SwingLow + 0.50 * (SwingHigh - SwingLow)',
    bullish_discount_required: 'FVG_HIGH < Fib50',
    bearish_premium_required: 'FVG_LOW > Fib50',
    touch_or_cross_rejection: true,
  },
  ote_rules: {
    range_start: 0.618,
    range_end: 0.786,
    bullish_ote: 'Retracement to [61.8%, 78.6%] of swing low to high',
    bearish_ote: 'Retracement to [61.8%, 78.6%] of swing high to low',
    states: ['INSIDE_OTE', 'OUTSIDE_OTE', 'TOUCHED_OTE', 'CROSSED_OTE', 'UNCERTAIN'],
  },
  wick_rules: {
    max_wick_ratio: 0.50,
    boundary_condition: 'ratio <= 0.50 PASS, ratio > 0.50 REJECT',
  },
  momentum_rules: {
    body_formula: 'abs(Close - Open)',
    range_formula: 'High - Low (if range <= 1e-6 => range = 1e-6, body_ratio = 0)',
    body_ratio_formula: 'Body / Range',
    rolling_baseline: {
      lookback_periods: 10,
      formula: 'mean(body_ratio of prior 10 candles)',
      relative_body_strength: 'body_ratio / baseline',
      default_empty_baseline: 0.50,
    },
    thresholds: {
      directional_expansion: {
        body_ratio_min: 0.60,
        relative_strength_min: 1.10,
        bullish_condition: "direction == 'BULLISH' && body_ratio >= 0.60 && relative_body_strength >= 1.10",
        bearish_condition: "direction == 'BEARISH' && body_ratio >= 0.60 && relative_body_strength >= 1.10",
      },
      weak_momentum: {
        body_ratio_max: 0.30,
        condition: 'body_ratio < 0.30',
      },
      momentum_shift: {
        relative_strength_min: 1.30,
        body_ratio_range: '[0.30, 0.60)',
        condition: 'relative_body_strength > 1.30 && body_ratio >= 0.30 && body_ratio < 0.60',
      },
      neutral_momentum: {
        condition: '0.30 <= body_ratio < 0.60 && relative_body_strength <= 1.30',
      },
    },
    states: [
      'BULLISH_MOMENTUM',
      'BEARISH_MOMENTUM',
      'NEUTRAL_MOMENTUM',
      'MOMENTUM_SHIFT',
      'WEAK_MOMENTUM',
      'UNCERTAIN',
    ],
  },
  session_rules: {
    asia: { start_utc: '00:00', end_utc: '06:00' },
    london: { start_utc: '07:00', end_utc: '16:00' },
    new_york: { start_utc: '12:00', end_utc: '21:00' },
    london_ny_overlap: { start_utc: '12:00', end_utc: '16:00' },
  },
  kill_zone_rules: {
    asia: { start_utc: '01:00', end_utc: '04:00' },
    london: { start_utc: '07:00', end_utc: '10:00' },
    new_york: { start_utc: '12:00', end_utc: '15:00' },
  },
  news_guard_rules: {
    restriction_window_minutes: 30, // [-30m, +30m]
    offline_handling: 'INCONCLUSIVE (Never assume no news = clear)',
  },
  data_quality_rules: {
    invalid_below: 0.85,
    degraded_range: [0.85, 0.95],
    complete_above: 0.95,
  },
  observation_rules: {
    semantics: [
      'NEXT_CANDLE_FAVORABLE',
      'NEXT_CANDLE_UNFAVORABLE',
      'NEXT_CANDLE_NEUTRAL',
      'NEXT_CANDLE_INCONCLUSIVE',
    ],
    user_action_separation: ['TAKEN', 'NOT_TAKEN', 'NOT_RECORDED'],
  },
} as const;

// Deterministic SHA-256 Hash of canonical frozen configuration snapshot (sha256 of JSON.stringify(V2_CONFIG_SNAPSHOT))
export const CONFIG_HASH = '1fc0ff3b17b2a077fdaf532615e7ca4ae2b38b36cdfc781059aeda3e7977b9b8';

export const STRATEGY_MANIFEST = {
  version: ACTIVE_STRATEGY_VERSION,
  experiment_id: ACTIVE_EXPERIMENT_ID,
  config_hash: CONFIG_HASH,
  specification_document: 'STRATEGY v2.0 RESEARCH & AGENT ARCHITECTURE Master Specification',
  historical_baseline: {
    version: HISTORICAL_STRATEGY_VERSION,
    status: 'ARCHIVED',
    specification: 'Technical Specification v3.4',
  },
  scope_freeze: {
    status: 'FROZEN',
    target_valid_setups: 100,
    no_rule_changes: true,
    no_threshold_changes: true,
    no_new_indicators: true,
    no_post_hoc_reinterpretation: true,
    no_selective_disabling: true,
    no_retroactive_modification: true,
  },
  architectural_boundary: {
    classification: 'ComVision-Assisted Strategy Research & Decision-Support Engine',
    is_automated_execution_bot: false,
    direct_broker_connection_allowed: false,
    credential_storage_allowed: false,
    ui_automation_allowed: false,
    terminal_state: 'MANUAL_ALERT',
  },
  pipeline_stages: [
    'Stage 1: Market Structure (5-Candle Fractal)',
    'Stage 2: Fair Value Gap (FVG)',
    'Stage 3: 3-Candle Pattern & Inside Candle Check',
    'Stage 4: Volume / Tick Activity Proxy',
    'Stage 5: Wick Validation',
    'Stage 6: Fibonacci 50% Equilibrium Zone',
    'Stage 7: News Guard Fail-Safe',
    'Stage 8: T-10s Pressure Observation (Non-Filtering)',
    'Stage 9: Telemetry Schema & Manual Alert Output',
  ],
  parameters: V2_CONFIG_SNAPSHOT,
} as const;
