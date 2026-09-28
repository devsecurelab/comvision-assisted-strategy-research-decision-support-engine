package com.example.model

/**
 * Authoritative Canonical Pair Catalogue.
 * Contains 40 canonical pairs: 20 Major Pairs and 20 Minor/Cross Pairs.
 * Shared canonical representation across frontend, engine, providers, and notifications.
 */
object PairCatalog {
    val MAJOR_PAIRS = listOf(
        "EUR/USD",
        "GBP/USD",
        "USD/JPY",
        "AUD/USD",
        "USD/CHF",
        "USD/CAD",
        "NZD/USD",
        "EUR/JPY",
        "GBP/JPY",
        "EUR/GBP",
        "EUR/CHF",
        "EUR/CAD",
        "EUR/AUD",
        "EUR/NZD",
        "GBP/CHF",
        "GBP/CAD",
        "GBP/AUD",
        "AUD/JPY",
        "CAD/JPY",
        "CHF/JPY"
    )

    val MINOR_CROSS_PAIRS = listOf(
        "GBP/NZD",
        "AUD/CAD",
        "AUD/CHF",
        "AUD/NZD",
        "CAD/CHF",
        "NZD/JPY",
        "NZD/CAD",
        "NZD/CHF",
        "EUR/HKD",
        "GBP/HKD",
        "EUR/SGD",
        "GBP/SGD",
        "AUD/SGD",
        "EUR/SEK",
        "EUR/NOK",
        "GBP/SEK",
        "EUR/TRY",
        "GBP/TRY",
        "EUR/ZAR",
        "GBP/ZAR"
    )

    val SUPPORTED_PAIRS: List<String> = MAJOR_PAIRS + MINOR_CROSS_PAIRS

    const val DEFAULT_PAIR = "EUR/USD"

    fun isValid(pair: String?): Boolean {
        if (pair == null) return false
        return SUPPORTED_PAIRS.contains(pair.trim().uppercase())
    }

    fun isMajor(pair: String?): Boolean {
        if (pair == null) return false
        return MAJOR_PAIRS.contains(pair.trim().uppercase())
    }

    fun isMinor(pair: String?): Boolean {
        if (pair == null) return false
        return MINOR_CROSS_PAIRS.contains(pair.trim().uppercase())
    }

    fun normalize(pair: String?): String {
        if (pair == null) {
            throw IllegalArgumentException("Deterministic ValidationError: Pair cannot be null")
        }
        val clean = pair.trim().uppercase()
        if (!isValid(clean)) {
            throw IllegalArgumentException("Deterministic ValidationError: Unsupported symbol '$pair'. Must be one of 40 canonical pairs.")
        }
        return clean
    }

    fun validate(pair: String?): Result<String> {
        return try {
            Result.success(normalize(pair))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

enum class FreshnessState {
    LIVE,
    DEGRADED,
    STALE,
    OFFLINE,
    REPLAY,
    UNKNOWN
}

enum class ProviderState {
    CONNECTED,
    DEGRADED,
    DISCONNECTED,
    ERROR
}

enum class VisionSource {
    ACTUAL_CV_EXTRACTED,
    SIMULATION_HARNESS,
    UNAVAILABLE
}

enum class VerificationStatus {
    COMPLETE,
    DEGRADED,
    INVALID,
    UNAVAILABLE
}

enum class FinalAction {
    MANUAL_ALERT // Strict non-execution boundary: no broker orders can ever be executed
}

enum class UserRole {
    ADMIN,
    ANALYST
}

enum class UserStatus {
    PENDING,
    APPROVED,
    SUSPENDED,
    REVOKED
}

data class Candle(
    val timestampUtc: Long,
    val open: Double,
    val high: Double,
    val low: Double,
    val close: Double,
    val volume: Double = 0.0
)

data class MarketQuote(
    val pair: String,
    val price: Double? = null,
    val bid: Double? = null,
    val ask: Double? = null,
    val timestampUtc: Long,
    val provider: String,
    val freshnessState: FreshnessState,
    val sanitizedError: String? = null
)

data class FVGZone(
    val top: Double,
    val bottom: Double,
    val isBullish: Boolean,
    val formedIndex: Int = 0,
    val status: String = "ACTIVE"
)

data class OrderBlock(
    val top: Double,
    val bottom: Double,
    val isBullish: Boolean,
    val status: String = "VALID"
)

data class LiquidityPools(
    val bsl: Double? = null,
    val ssl: Double? = null,
    val sweptBsl: Boolean = false,
    val sweptSsl: Boolean = false
)

data class VisionOverlays(
    val fvg: FVGZone? = null,
    val orderBlock: OrderBlock? = null,
    val fib50: Double? = null,
    val bslSsl: LiquidityPools? = null
)

data class VisionEvidence(
    val source: VisionSource,
    val pair: String,
    val timeframe: String,
    val processedAtUtc: String? = null,
    val sourceTimestampUtc: String? = null,
    val freshnessState: FreshnessState = FreshnessState.UNKNOWN,
    val ocrConfidence: Double? = null,
    val verificationStatus: VerificationStatus = VerificationStatus.UNAVAILABLE,
    val candles: List<Candle> = emptyList(),
    val overlays: VisionOverlays = VisionOverlays(),
    val failureReason: String? = null
)

data class ValidationBadges(
    val bosDetected: Boolean = false,
    val bosLabel: String = "NO BOS",
    val chochDetected: Boolean = false,
    val fvgStatus: String = "INCONCLUSIVE",
    val ifvgStatus: String = "INCONCLUSIVE",
    val bprStatus: String = "INCONCLUSIVE",
    val obStatus: String = "INCONCLUSIVE",
    val breakerStatus: String = "INCONCLUSIVE",
    val liquidityStatus: String = "INCONCLUSIVE",
    val fibStatus: String = "INCONCLUSIVE",
    val oteStatus: String = "INCONCLUSIVE",
    val wickRatio: Double = 0.0,
    val wickStatus: String = "INCONCLUSIVE", // <= 0.500 PASS, > 0.500 FAIL
    val momentumStatus: String = "INCONCLUSIVE",
    val killZoneStatus: String = "INCONCLUSIVE",
    val newsGuardStatus: String = "PASS"
)

data class DecisionAlert(
    val setupId: String,
    val pair: String,
    val timeframe: String,
    val direction: String, // "BULLISH" | "BEARISH"
    val entryZone: String,
    val stopLoss: Double,
    val takeProfit: Double,
    val riskRewardRatio: Double,
    val timestampUtc: String,
    val finalAction: FinalAction = FinalAction.MANUAL_ALERT,
    val nonExecutionNotice: String = "MANUAL DECISION SUPPORT ONLY — NO BROKER ORDER ROUTING"
)

data class Telemetry(
    val setupId: String,
    val pair: String,
    val timeframe: String,
    val provider: String,
    val freshnessState: FreshnessState,
    val currentPrice: Double?,
    val validationBadges: ValidationBadges,
    val alert: DecisionAlert? = null,
    val generatedAtUtc: String,
    val linkedOutcome: OutcomeRecord? = null
)

data class NotificationStatusInfo(
    val telegramConfigured: Boolean,
    val telegramMaskedChatId: String?,
    val emailConfigured: Boolean,
    val emailMaskedRecipient: String?,
    val smtpHost: String?,
    val lastTestTimeUtc: String?,
    val lastTestResult: String?, // SENT | FAILED | DISABLED
    val lastSanitizedFailureCode: String?
)

data class UserRecord(
    val userId: String,
    val email: String,
    val name: String,
    val role: UserRole,
    val status: UserStatus,
    val createdAtUtc: String
)

data class AuditRecord(
    val id: String,
    val actor: String,
    val action: String,
    val details: String,
    val timestampUtc: String
)

data class OutcomeRecord(
    val setupId: String,
    val pair: String, // Canonical pair, or "UNKNOWN" for legacy
    val result: String, // "WIN" | "LOSS" | "BREAKEVEN" | "UNRESOLVED"
    val recordedAtUtc: String = "",
    val direction: String = "BULLISH",
    val entryPrice: Double = 0.0,
    val exitPrice: Double = 0.0,
    val notes: String? = null,
    val telegramDispatched: Boolean = false,
    val emailDispatched: Boolean = false
)

data class MultiScanSummary(
    val totalScanned: Int,
    val setupsFound: Int,
    val pairsScanned: List<String>,
    val alertsGenerated: List<DecisionAlert>,
    val timestampUtc: String
)

data class AppSettings(
    val selectedPair: String = PairCatalog.DEFAULT_PAIR,
    val activePairs: Set<String> = setOf(PairCatalog.DEFAULT_PAIR),
    val selectedTimeframe: String = "M5",
    val selectedProvider: String = "REPLAY", // "REPLAY", "TWELVE_DATA", "ALPHA_VANTAGE"
    val freshnessWindowSec: Long = 120,
    val isDefaultPair: Boolean = true,
    val scopeFreezeActive: Boolean = true,
    val autoEvaluateNextCandle: Boolean = true,
    val autoDispatchSignals: Boolean = true
)
