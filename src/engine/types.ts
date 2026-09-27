// Master Type Definitions for ComVision-Assisted Strategy Research & Decision-Support Engine
// Strategy v2.0-FROZEN Master Specification

export type DataProvenance = 'LIVE_INGESTED' | 'REPLAY' | 'TEST' | 'SYNTHETIC_OVERRIDE';
export type CVEvidenceSource = 'ACTUAL_CV_EXTRACTED' | 'SIMULATION_HARNESS' | 'UNAVAILABLE';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h';

export interface Candle {
  timestamp: string; // ISO string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // Represents tick count in CFD/FX feeds
}

export type StructuralState = 'BULLISH' | 'BEARISH' | 'UNCLEAR';

export interface SwingPoint {
  index: number;
  timestamp: string;
  type: 'HIGH' | 'LOW';
  price: number;
  confirmedAtTimestamp: string; // Close timestamp of candle t+2
}

// Stage 2: Break of Structure (BOS)
export type BosDirection = 'BULLISH' | 'BEARISH' | 'NONE';
export interface BosState {
  bos_detected: boolean;
  bos_direction: BosDirection;
  bos_reference_level?: number;
  bos_confirmation_timestamp?: string;
  bos_confirmation_candle?: number;
  bos_body_close_confirmed: boolean;
  status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
  reason?: string;
}

// Stage 3: Change of Character (CHoCH)
export type ChochStatus = 'NO_CHoCH' | 'BULLISH_CHoCH' | 'BEARISH_CHoCH' | 'UNCERTAIN';
export interface ChochState {
  choch_status: ChochStatus;
  choch_direction?: 'BULLISH' | 'BEARISH';
  choch_reference_level?: number;
  choch_confirmation_timestamp?: string;
  status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
  reason?: string;
}

// Stage 4: Fair Value Gap (FVG)
export type FVGMitigationState = 'UNMITIGATED' | 'PARTIAL_FILL' | 'COMPLETELY_FILLED';
export interface FVGZone {
  top: number;
  bottom: number;
  creationTimestamp: string;
  mitigationState: FVGMitigationState;
  direction: 'BULLISH' | 'BEARISH';
}

// Stage 5: Inverse Fair Value Gap (IFVG)
export type IfvgStatus = 'NONE' | 'STANDARD_FVG' | 'IFVG_CANDIDATE' | 'IFVG_CONFIRMED' | 'INVALIDATED';
export interface IfvgState {
  ifvg_status: IfvgStatus;
  ifvg_direction?: 'BULLISH' | 'BEARISH';
  invalidation_boundary?: number;
  original_fvg_zone?: [number, number];
  confirmation_timestamp?: string;
  status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
  reason?: string;
}

// Stage 6: Balanced Price Range (BPR)
export type BprStatus = 'NONE' | 'BPR_CANDIDATE' | 'BPR_CONFIRMED' | 'BPR_INVALIDATED';
export interface BprState {
  bpr_status: BprStatus;
  bpr_direction?: 'BULLISH' | 'BEARISH' | 'BALANCED';
  bpr_zone_high?: number;
  bpr_zone_low?: number;
  bpr_overlap_size?: number;
  bpr_source_fvg_1?: [number, number];
  bpr_source_fvg_2?: [number, number];
  status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
  reason?: string;
}

// Stage 7: Order Block
export interface OrderBlock {
  top: number;
  bottom: number;
  candleIndex: number;
  direction: 'BULLISH' | 'BEARISH';
  timestamp: string;
}

// Stage 8: Breaker Block
export type BreakerStatus = 'NO_BREAKER' | 'BREAKER_CANDIDATE' | 'BREAKER_CONFIRMED' | 'BREAKER_INVALIDATED';
export interface BreakerState {
  breaker_status: BreakerStatus;
  breaker_direction?: 'BULLISH' | 'BEARISH';
  source_ob_id?: string;
  breaker_zone?: [number, number];
  invalidation_level?: number;
  confirmation_timestamp?: string;
  status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
  reason?: string;
}

// Stage 9: Liquidity Sweep
export type LiquiditySweepStatus = 'VALID_BREAKOUT' | 'SWEEP_DETECTED' | 'NOT_TESTING';

// Stage 10 & 11: BSL / SSL Liquidity Pools & Target Context
export interface LiquidityPool {
  liquidity_type: 'BSL' | 'SSL';
  level: number;
  source: 'EQUAL_HIGHS' | 'EQUAL_LOWS' | 'SWING_HIGH' | 'SWING_LOW' | 'STRUCTURAL_HIGH' | 'STRUCTURAL_LOW';
  timestamp: string;
  distance_from_price: number;
  strength: 'HIGH' | 'MEDIUM' | 'STANDARD';
  touch_count?: number;
  equality_tolerance_pips?: number;
  merge_distance_pips?: number;
  is_qualified?: boolean;
  is_invalidated?: boolean;
}

export type LiquidityTargetContext = 'BSL_TARGET' | 'SSL_TARGET' | 'BOTH' | 'NONE' | 'UNCERTAIN';
export interface BslSslState {
  bsl_pools: LiquidityPool[];
  ssl_pools: LiquidityPool[];
  nearest_bsl?: LiquidityPool;
  nearest_ssl?: LiquidityPool;
  selected_liquidity_target?: LiquidityTargetContext;
  target_distance?: number;
  target_source?: string;
  equality_tolerance_percent?: number;
  min_touches_pool?: number;
  merge_distance_percent?: number;
  status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
}

// Stage 13: Optimal Trade Entry (OTE 61.8% -> 78.6%)
export type OteZoneStatus = 'INSIDE_OTE' | 'OUTSIDE_OTE' | 'TOUCHED_OTE' | 'CROSSED_OTE' | 'UNCERTAIN';
export interface OteState {
  ote_618: number;
  ote_786: number;
  current_price_in_ote: boolean;
  zone_status: OteZoneStatus;
  status: 'PASS' | 'REJECT';
  reason?: string;
}

// Stage 15: Momentum & Imbalance
export type MomentumState =
  | 'BULLISH_MOMENTUM'
  | 'BEARISH_MOMENTUM'
  | 'NEUTRAL_MOMENTUM'
  | 'MOMENTUM_SHIFT'
  | 'WEAK_MOMENTUM'
  | 'UNCERTAIN';

export interface MomentumStateInfo {
  body: number;
  range: number;
  body_ratio: number;
  direction: 'BULLISH' | 'BEARISH';
  relative_body_strength: number;
  momentum_state: MomentumState;
  status: 'PASS' | 'REJECT';
  reason?: string;
}

// Stage 16 & 17: Session & Kill Zone Context
export type MarketSession = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'LONDON_NEW_YORK_OVERLAP' | 'OFF_PEAK' | 'UNKNOWN';
export type KillZoneState = 'INSIDE_KILL_ZONE' | 'OUTSIDE_KILL_ZONE' | 'UNKNOWN';

export interface SessionContext {
  session: MarketSession;
  kill_zone: KillZoneState;
  session_start_utc: string;
  session_end_utc: string;
  kill_zone_start_utc?: string;
  kill_zone_end_utc?: string;
  timestamp_utc: string;
  timestamp_bdt: string;
}

// Stage 18: News Guard
export type NewsWindowState = 'CLEAR' | 'ACTIVE' | 'NEWS_DATA_UNAVAILABLE';
export interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: string; // ISO string
  forecast?: string;
  previous?: string;
}

// Tick sequence proxies (legacy support)
export type TickSequence = 'ASCENDING' | 'NOT_ASCENDING';
export type TickBaseline = 'ABOVE_AVERAGE' | 'BELOW_AVERAGE';

// Data Quality & Execution Decisions
export type DataQuality = 'COMPLETE' | 'DEGRADED' | 'INVALID';
export type SystemDecision = 'PASS' | 'REJECT' | 'INCONCLUSIVE';
export type FinalAction = 'MANUAL_ALERT' | 'NO_ALERT' | 'NONE';

// Stage 20: Next-Candle Research Observation (Strictly Research-Honest Semantics)
export type NextCandleObservation =
  | 'PENDING'
  | 'NEXT_CANDLE_FAVORABLE'
  | 'NEXT_CANDLE_UNFAVORABLE'
  | 'NEXT_CANDLE_NEUTRAL'
  | 'NEXT_CANDLE_INCONCLUSIVE';

// User Recorded Action (Strictly separate from research observation outcome)
export type UserRecordedAction = 'PENDING' | 'TAKEN' | 'NOT_TAKEN' | 'NOT_RECORDED' | 'SKIPPED' | 'WIN' | 'LOSS';

// Pressure Observation (Legacy observation layer)
export type PressureClassification = 'ALIGNED' | 'NEUTRAL' | 'OPPOSITE' | 'UNCERTAIN';
export type PressureMagnitude = 'LOW' | 'MEDIUM' | 'HIGH';
export type PressureConsistency = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PressureObservation {
  classification: PressureClassification;
  magnitude: PressureMagnitude;
  consistency: PressureConsistency;
  speedPxPerSec?: number;
  magnitude_proxy?: string;
  consistency_proxy?: string;
}

// Single Telemetry Master Record (Section 5 & 49 Master Schema)
export interface MasterTelemetry {
  metadata: {
    project_name: string;
    strategy_version: string; // e.g. "v2.0-FROZEN"
    experiment_id: string; // e.g. "EXP-2026-V2-001"
    setup_id: string; // e.g. "V2-000001"
    config_hash?: string; // SHA-256 of frozen v2.0 rule parameters
    timestamp_utc: string;
    signal_timestamp_utc?: string;
    pair?: string;
    asset?: string;
    data_quality: DataQuality;
    cv_confidence?: number;
    data_provenance?: DataProvenance;
    sha256_hash?: string;
    prev_hash?: string;
  };
  market_context: {
    selected_timeframe: Timeframe;
    supporting_timeframe_analysis: {
      htf_analyzed: string;
      htf_bias: StructuralState;
    };
    local_bias: StructuralState;
    context_state: 'ALIGNED' | 'TRANSITION' | 'UNCLEAR';
    regime_tag: 'TRENDING' | 'RANGING' | 'TRANSITION' | 'UNCLEAR';
    session: MarketSession;
    kill_zone: KillZoneState;
    session_start_utc?: string;
    session_end_utc?: string;
  };
  validation_metrics: {
    structure: {
      status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
      swing_confirmed_at_timestamp?: string;
      reason?: string;
    };
    bos?: BosState;
    choch?: ChochState;
    fvg: {
      fvg_status: 'PASS' | 'REJECT' | 'EXPIRED' | 'INVALID' | 'INCONCLUSIVE';
      fvg_mitigation_state: FVGMitigationState;
      zone?: [number, number];
      reason?: string;
    };
    ifvg?: IfvgState;
    bpr?: BprState;
    order_block: {
      ob_detected: boolean;
      ob_confluence_status: 'PASS' | 'FAIL';
      ob_zone?: [number, number];
      reason?: string;
    };
    breaker_block?: BreakerState;
    pattern_3_candle: {
      status: 'PASS' | 'REJECT';
      reason?: string;
    };
    inside_candle: {
      inside_candle_detected: boolean;
    };
    fib_zone: {
      status: 'PASS_DISCOUNT' | 'PASS_PREMIUM' | 'REJECT';
      fib_50_level?: number;
      reason?: string;
    };
    ote?: OteState;
    tick_proxy: {
      status: 'PASS' | 'REJECT';
      tick_sequence: TickSequence;
      tick_baseline: TickBaseline;
      reason?: string;
    };
    momentum?: MomentumStateInfo;
    wick_check: {
      status: 'PASS' | 'REJECT';
      wick_ratio: number;
      reason?: string;
    };
    liquidity_sweep: {
      status: LiquiditySweepStatus;
      tested_swing_level?: number;
      reason?: string;
    };
    bsl_ssl?: BslSslState;
  };
  pressure_observation: PressureObservation;
  guardrails: {
    news_guard: {
      news_event_detected: boolean;
      news_window_state: NewsWindowState;
      news_source: string;
      reason?: string;
    };
  };
  vision_verification?: {
    verification_status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
    cv_confidence: number;
    cv_evidence_source?: CVEvidenceSource;
    evidence_state: string;
    chart_timestamp?: string;
  };
  system_execution: {
    system_decision: SystemDecision;
    final_action: FinalAction;
    user_recorded_action: UserRecordedAction;
    halted_at_stage?: string;
    rejection_reason?: string;
  };
  next_candle_observation?: {
    status: NextCandleObservation;
    observation_timestamp?: string;
    observed_candle?: Candle;
    details?: string;
  };
  provider_provenance?: {
    provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'RESEARCH_STREAM_REPLAY';
    provider_state?: string;
    rate_limit_usage?: string;
    timestamp_ingested: string;
    data_provenance?: DataProvenance;
  };
}

// User & Access Control Types
export type UserRole = 'ADMIN' | 'ANALYST';
export type UserStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REVOKED';

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLogin?: string;
  passwordHash?: string; // Server only
}

export interface AuthSession {
  token: string;
  user: Omit<UserAccount, 'passwordHash'>;
  expiresAt: string;
}

export interface EngineSettings {
  maxWickRatio: number; // default 0.50 (frozen)
  fibEquilibriumLevel: number; // default 0.50 (frozen)
  selectedTimeframe: Timeframe;
  activeProvider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'AUTO_FALLBACK' | 'RESEARCH_STREAM_REPLAY';
  twelveDataApiKeyConfigured: boolean;
  alphaVantageApiKeyConfigured: boolean;
  experimentLocked: boolean;
  scannerActive: boolean;
  alertsMuted: boolean;
  activeStrategyVersion?: string;
}
