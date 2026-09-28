package com.example.engine

/**
 * Frozen Strategy Constants.
 * Invariant: These parameters are immutable and protected by scope freeze.
 * Under no circumstance may selecting a pair or provider mutate these values.
 */
object StrategyConstants {
    const val FVG_MIN_GAP_PIPS = 1.5
    const val FIB_EQUILIBRIUM_LEVEL = 0.500
    const val OTE_LOWER_BOUND = 0.620
    const val OTE_UPPER_BOUND = 0.790
    const val WICK_RATIO_MAX_THRESHOLD = 0.500 // <= 0.500 PASS, > 0.500 FAIL
    const val MIN_RISK_REWARD_RATIO = 2.0
    const val OCR_CONFIDENCE_COMPLETE_THRESHOLD = 0.950 // > 95% COMPLETE
    const val OCR_CONFIDENCE_DEGRADED_THRESHOLD = 0.850 // 85% - 95% DEGRADED, < 85% INVALID
    const val FRESHNESS_WINDOW_SECONDS = 120L

    // Invariant Non-Execution Guard
    const val BROKER_EXECUTION_ENABLED = false
    const val ACTION_MANUAL_ALERT_ONLY = "MANUAL_ALERT"
}
