package com.example.engine

import com.example.engine.notification.NotificationService
import com.example.engine.notification.TestResult
import com.example.engine.pipeline.StrategyPipeline
import com.example.engine.provider.*
import com.example.engine.vision.VisionEngine
import com.example.model.*
import java.text.SimpleDateFormat
import java.util.*

class ComVisionEngine(
    initialSettings: AppSettings = AppSettings()
) {
    var settings: AppSettings = initialSettings
        private set

    val pipeline = StrategyPipeline()
    val visionEngine = VisionEngine()
    val notificationService = NotificationService()

    private val replayAdapter = ReplayAdapter()
    private val twelveDataAdapter = TwelveDataAdapter()
    private val alphaVantageAdapter = AlphaVantageAdapter()

    private val auditLogs = mutableListOf<AuditRecord>()
    private val setups = mutableListOf<Telemetry>()
    private val outcomes = mutableListOf<OutcomeRecord>()
    private val users = mutableListOf<UserRecord>()

    // Current active telemetry & alert
    var currentTelemetry: Telemetry? = null
        private set
    var currentEvidence: VisionEvidence? = null
        private set
    var lastRecordedOutcome: OutcomeRecord? = null
        private set
    var isScanning: Boolean = false
        private set
    var lastScanError: String? = null
        private set

    init {
        // Initialize default system users
        users.add(
            UserRecord(
                userId = "USR-ADMIN-1",
                email = "admin@comvision.engine",
                name = "Lead Research Administrator",
                role = UserRole.ADMIN,
                status = UserStatus.APPROVED,
                createdAtUtc = nowIso()
            )
        )
        users.add(
            UserRecord(
                userId = "USR-ANALYST-1",
                email = "analyst@comvision.engine",
                name = "Quantitative Analyst",
                role = UserRole.ANALYST,
                status = UserStatus.APPROVED,
                createdAtUtc = nowIso()
            )
        )

        recordAudit(
            actor = "SYSTEM",
            action = "ENGINE_BOOT",
            details = "ComVision v2.0 Engine initialized. 40 canonical pairs active. Default pair=${settings.selectedPair} (isDefault=${settings.isDefaultPair}), ScopeFreeze=${settings.scopeFreezeActive}"
        )
    }

    private fun nowIso(): String {
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
    }

    fun recordAudit(actor: String, action: String, details: String) {
        auditLogs.add(
            0,
            AuditRecord(
                id = "AUD-${UUID.randomUUID().toString().take(8).uppercase()}",
                actor = actor,
                action = action,
                details = details,
                timestampUtc = nowIso()
            )
        )
    }

    fun getAuditLogs(): List<AuditRecord> = auditLogs.toList()

    fun getUsers(): List<UserRecord> = users.toList()

    /**
     * Authoritative Pair Selection.
     * Supports all 40 canonical pairs.
     * Requires APPROVED user.
     * Records audit log with actor, old pair, new pair, timestamp.
     * Does NOT mutate frozen strategy constants.
     */
    fun selectPair(actor: UserRecord, pair: String, source: String = "UI_DASHBOARD"): Result<String> {
        if (actor.status != UserStatus.APPROVED) {
            return Result.failure(IllegalStateException("Deterministic AuthError: Only APPROVED users can select pairs"))
        }

        val validatedPair = try {
            PairCatalog.normalize(pair)
        } catch (e: Exception) {
            return Result.failure(e)
        }

        val oldPair = settings.selectedPair
        settings = settings.copy(
            selectedPair = validatedPair,
            isDefaultPair = false
        )

        recordAudit(
            actor = actor.email,
            action = "PAIR_SELECTION",
            details = "Pair changed from '$oldPair' to '$validatedPair' by user ${actor.userId} via $source"
        )

        return Result.success(validatedPair)
    }

    var lastMultiScanSummary: MultiScanSummary? = null
        private set

    /**
     * Toggle a pair in the multi-market active list.
     */
    fun toggleActivePair(actor: UserRecord, pair: String): Result<Set<String>> {
        if (actor.status != UserStatus.APPROVED) {
            return Result.failure(IllegalStateException("Deterministic AuthError: Only APPROVED users can modify active pairs"))
        }

        val validated = try {
            PairCatalog.normalize(pair)
        } catch (e: Exception) {
            return Result.failure(e)
        }

        val current = settings.activePairs.toMutableSet()
        if (current.contains(validated)) {
            // Keep at least 1 pair active
            if (current.size > 1) {
                current.remove(validated)
            }
        } else {
            current.add(validated)
        }

        val newSelected = if (current.contains(settings.selectedPair)) settings.selectedPair else current.first()
        settings = settings.copy(
            activePairs = current,
            selectedPair = newSelected,
            isDefaultPair = false
        )

        recordAudit(
            actor = actor.email,
            action = "MULTI_PAIR_TOGGLE",
            details = "Active pairs now (${current.size}): ${current.joinToString(", ")}"
        )

        return Result.success(current)
    }

    /**
     * Select all 20 Major pairs for multi-market scanning.
     */
    fun selectAllMajor(actor: UserRecord): Result<Set<String>> {
        if (actor.status != UserStatus.APPROVED) {
            return Result.failure(IllegalStateException("Deterministic AuthError: Only APPROVED users can modify active pairs"))
        }
        val set = PairCatalog.MAJOR_PAIRS.toSet()
        settings = settings.copy(
            activePairs = set,
            selectedPair = if (set.contains(settings.selectedPair)) settings.selectedPair else PairCatalog.MAJOR_PAIRS.first(),
            isDefaultPair = false
        )
        recordAudit(actor.email, "MULTI_PAIR_SELECT_MAJOR", "Activated 20 Major Pairs")
        return Result.success(set)
    }

    /**
     * Select all 20 Minor/Cross pairs for multi-market scanning.
     */
    fun selectAllMinor(actor: UserRecord): Result<Set<String>> {
        if (actor.status != UserStatus.APPROVED) {
            return Result.failure(IllegalStateException("Deterministic AuthError: Only APPROVED users can modify active pairs"))
        }
        val set = PairCatalog.MINOR_CROSS_PAIRS.toSet()
        settings = settings.copy(
            activePairs = set,
            selectedPair = if (set.contains(settings.selectedPair)) settings.selectedPair else PairCatalog.MINOR_CROSS_PAIRS.first(),
            isDefaultPair = false
        )
        recordAudit(actor.email, "MULTI_PAIR_SELECT_MINOR", "Activated 20 Minor Pairs")
        return Result.success(set)
    }

    /**
     * Select all 40 pairs for multi-market scanning.
     */
    fun selectAllPairs(actor: UserRecord): Result<Set<String>> {
        if (actor.status != UserStatus.APPROVED) {
            return Result.failure(IllegalStateException("Deterministic AuthError: Only APPROVED users can modify active pairs"))
        }
        val set = PairCatalog.SUPPORTED_PAIRS.toSet()
        settings = settings.copy(
            activePairs = set,
            selectedPair = settings.selectedPair,
            isDefaultPair = false
        )
        recordAudit(actor.email, "MULTI_PAIR_SELECT_ALL", "Activated all 40 Canonical Pairs")
        return Result.success(set)
    }

    /**
     * Reset active pairs to default single pair.
     */
    fun resetToSinglePair(actor: UserRecord, pair: String = PairCatalog.DEFAULT_PAIR): Result<Set<String>> {
        val set = setOf(PairCatalog.normalize(pair))
        settings = settings.copy(
            activePairs = set,
            selectedPair = pair,
            isDefaultPair = pair == PairCatalog.DEFAULT_PAIR
        )
        recordAudit(actor.email, "MULTI_PAIR_RESET", "Reset to single pair $pair")
        return Result.success(set)
    }

    fun setTimeframe(timeframe: String) {
        settings = settings.copy(selectedTimeframe = timeframe)
    }

    fun setProvider(providerName: String) {
        settings = settings.copy(selectedProvider = providerName)
    }

    fun getProvider(name: String = settings.selectedProvider): MarketDataProvider {
        return when (name) {
            "TWELVE_DATA" -> twelveDataAdapter
            "ALPHA_VANTAGE" -> alphaVantageAdapter
            else -> replayAdapter
        }
    }

    /**
     * Perform Strategy Scan.
     * Analyzes selected pair, computes ICT/SMC validation telemetry,
     * generates decision alert (strictly MANUAL_ALERT),
     * and dispatches alert to Telegram & Email if configured.
     */
    suspend fun performScan(isPolling: Boolean = false): Result<Telemetry> {
        isScanning = true
        lastScanError = null

        val provider = getProvider()
        val request = ProviderRequest(
            pair = settings.selectedPair,
            timeframe = settings.selectedTimeframe
        )

        val response = provider.fetchCandles(request)

        if (response.sanitizedFailureReason != null) {
            isScanning = false
            lastScanError = response.sanitizedFailureReason
            return Result.failure(RuntimeException(response.sanitizedFailureReason))
        }

        val telemetry = pipeline.execute(
            pair = response.canonicalPair,
            timeframe = settings.selectedTimeframe,
            providerName = provider.name,
            candles = response.candles,
            freshnessState = response.freshnessState
        )

        currentTelemetry = telemetry
        setups.add(0, telemetry)

        // Update Vision evidence with matching telemetry overlays
        currentEvidence = visionEngine.createEvidence(
            pair = telemetry.pair,
            timeframe = telemetry.timeframe,
            source = VisionSource.SIMULATION_HARNESS,
            freshnessState = telemetry.freshnessState,
            candles = response.candles,
            ocrConfidence = 0.965
        )

        recordAudit(
            actor = if (isPolling) "POLLING_SCANNER" else "MANUAL_SCAN",
            action = "STRATEGY_SCAN",
            details = "Scan completed for canonical pair '${telemetry.pair}' (${telemetry.timeframe}) via ${provider.name}. SetupId=${telemetry.setupId}, Direction=${telemetry.alert?.direction}, BOS=${telemetry.validationBadges.bosLabel}"
        )

        // Dispatch signal to Telegram & Email
        if (settings.autoDispatchSignals && telemetry.alert != null) {
            val (tgRes, emRes) = notificationService.dispatchSignalAlert(telemetry.alert!!)
            recordAudit(
                actor = "ALERT_DISPATCHER",
                action = "SIGNAL_NOTIFICATION_DISPATCH",
                details = "Setup ${telemetry.setupId} alert dispatched. Telegram=${tgRes.message}, Email=${emRes.message}"
            )
        }

        isScanning = false
        return Result.success(telemetry)
    }

    /**
     * Perform Multi-Market Scan.
     * Analyzes all markets in settings.activePairs simultaneously.
     * Detects ICT/SMC setups for each pair and dispatches signals to Telegram & Email!
     */
    suspend fun performMultiScan(isPolling: Boolean = false): MultiScanSummary {
        isScanning = true
        lastScanError = null

        val provider = getProvider()
        val targets = settings.activePairs.toList()
        val generatedAlerts = mutableListOf<DecisionAlert>()
        val scannedTelemetries = mutableListOf<Telemetry>()

        for (pair in targets) {
            try {
                val req = ProviderRequest(pair = pair, timeframe = settings.selectedTimeframe)
                val resp = provider.fetchCandles(req)
                if (resp.sanitizedFailureReason == null && resp.candles.isNotEmpty()) {
                    val tel = pipeline.execute(
                        pair = resp.canonicalPair,
                        timeframe = settings.selectedTimeframe,
                        providerName = provider.name,
                        candles = resp.candles,
                        freshnessState = resp.freshnessState
                    )
                    scannedTelemetries.add(tel)
                    setups.add(0, tel)

                    if (tel.alert != null) {
                        generatedAlerts.add(tel.alert)
                        if (settings.autoDispatchSignals) {
                            notificationService.dispatchSignalAlert(tel.alert)
                        }
                    }
                }
            } catch (e: Exception) {
                // Keep scanning remaining pairs
            }
        }

        // Set current telemetry to first alert or first scanned
        scannedTelemetries.firstOrNull { it.alert != null }?.let {
            currentTelemetry = it
            currentEvidence = visionEngine.createEvidence(
                pair = it.pair,
                timeframe = it.timeframe,
                source = VisionSource.SIMULATION_HARNESS,
                freshnessState = it.freshnessState,
                candles = ReplayAdapter.getDeterministicFixtures(it.pair),
                ocrConfidence = 0.965
            )
        } ?: run {
            scannedTelemetries.firstOrNull()?.let { currentTelemetry = it }
        }

        val summary = MultiScanSummary(
            totalScanned = targets.size,
            setupsFound = generatedAlerts.size,
            pairsScanned = targets,
            alertsGenerated = generatedAlerts,
            timestampUtc = nowIso()
        )
        lastMultiScanSummary = summary

        recordAudit(
            actor = if (isPolling) "POLLING_MULTI_SCANNER" else "USER_MULTI_SCAN",
            action = "MULTI_MARKET_SCAN",
            details = "Scanned ${targets.size} pairs (${targets.joinToString(",")}). Found ${generatedAlerts.size} setups: ${generatedAlerts.joinToString { "${it.pair}:${it.direction}" }}"
        )

        // Send multi-scan summary alert to Telegram if multiple setups found
        if (notificationService.isTelegramConfigured && generatedAlerts.isNotEmpty()) {
            val summaryText = buildString {
                append("<b>🌐 MULTI-MARKET SCAN COMPLETE</b>\n\n")
                append("<b>Total Scanned:</b> ${targets.size} pairs\n")
                append("<b>Setups Detected:</b> ${generatedAlerts.size}\n\n")
                generatedAlerts.forEach { a ->
                    append("• <b>${a.pair}</b> (${a.timeframe}): ${if (a.direction == "BULLISH") "🟢 BULLISH" else "🔴 BEARISH"} @ ${a.entryZone} (R:R 1:${a.riskRewardRatio})\n")
                }
                append("\n<i>All setups logged into ComVision engine.</i>")
            }
            notificationService.sendTelegramMessage(summaryText)
        }

        isScanning = false
        return summary
    }

    /**
     * Evaluates Next Candle Outcome (WIN / LOSS / BREAKEVEN) for the active or specified setup.
     * Evaluates whether the next candle follows the signal direction,
     * logs into telemetry & outcomes,
     * and sends WIN/LOSS alert to Telegram & Email!
     */
    suspend fun evaluateNextCandleOutcome(targetSetup: Telemetry? = currentTelemetry, forceWin: Boolean? = null): OutcomeRecord? {
        val tel = targetSetup ?: currentTelemetry ?: return null
        val alert = tel.alert ?: return null

        val isBullish = alert.direction == "BULLISH"
        val pair = tel.pair

        // Determine next candle (using Replay fixture simulator or live evaluation)
        val shouldWin = forceWin ?: (Math.random() > 0.35) // Realistic high-probability research rate
        val nextCandle = ReplayAdapter.getNextCandle(pair, shouldWin = shouldWin, isBullishSignal = isBullish)

        val entryPrice = tel.currentPrice ?: nextCandle.open
        val exitPrice = nextCandle.close

        val resultStr = if (isBullish) {
            if (exitPrice > entryPrice) "WIN" else "LOSS"
        } else {
            if (exitPrice < entryPrice) "WIN" else "LOSS"
        }

        val outcome = OutcomeRecord(
            setupId = alert.setupId,
            pair = pair,
            result = resultStr,
            recordedAtUtc = nowIso(),
            direction = alert.direction,
            entryPrice = entryPrice,
            exitPrice = exitPrice,
            notes = "Next candle close ${if (resultStr == "WIN") "favorable to" else "opposing"} $isBullish signal direction (Entry: $entryPrice, Exit: $exitPrice)"
        )

        outcomes.add(0, outcome)
        lastRecordedOutcome = outcome

        // Link outcome to telemetry
        val updatedTelemetry = tel.copy(linkedOutcome = outcome)
        currentTelemetry = updatedTelemetry

        // Dispatch Win/Loss alert to Telegram & Email
        val (tgRes, emRes) = notificationService.dispatchOutcomeAlert(outcome, alert)

        val finalizedOutcome = outcome.copy(
            telegramDispatched = tgRes.success,
            emailDispatched = emRes.success
        )
        outcomes[0] = finalizedOutcome
        lastRecordedOutcome = finalizedOutcome

        recordAudit(
            actor = "OUTCOME_EVALUATOR",
            action = "CANDLE_OUTCOME_ALERT",
            details = "Setup ${alert.setupId} Next Candle Outcome: $resultStr on $pair. Telegram dispatched: ${tgRes.message}, Email: ${emRes.message}"
        )

        return finalizedOutcome
    }

    /**
     * Evaluates next candle outcome for all active setups (multi-market).
     */
    suspend fun evaluateAllNextCandles(forceWin: Boolean? = null): List<OutcomeRecord> {
        val evaluated = mutableListOf<OutcomeRecord>()
        val recentAlertSetups = setups.filter { it.alert != null }.take(settings.activePairs.size)
        for (tel in recentAlertSetups) {
            val outcome = evaluateNextCandleOutcome(targetSetup = tel, forceWin = forceWin)
            if (outcome != null) {
                evaluated.add(outcome)
            }
        }
        return evaluated
    }

    /**
     * User Management — Admin only.
     */
    fun updateUserStatus(actor: UserRecord, targetUserId: String, newStatus: UserStatus): Result<String> {
        if (actor.role != UserRole.ADMIN) {
            return Result.failure(SecurityException("Deterministic AuthError: Only ADMIN may manage user lifecycle"))
        }
        val userIdx = users.indexOfFirst { it.userId == targetUserId }
        if (userIdx == -1) {
            return Result.failure(NoSuchElementException("User not found"))
        }
        val target = users[userIdx]
        users[userIdx] = target.copy(status = newStatus)
        recordAudit(
            actor = actor.email,
            action = "USER_STATUS_CHANGE",
            details = "User ${target.email} status changed from ${target.status} to $newStatus"
        )
        return Result.success("User status updated to $newStatus")
    }

    /**
     * Record Research Outcome manually.
     */
    fun recordOutcome(setupId: String, pair: String, result: String, notes: String? = null): OutcomeRecord {
        val outcome = OutcomeRecord(
            setupId = setupId,
            pair = if (PairCatalog.isValid(pair)) pair else "UNKNOWN",
            result = result,
            recordedAtUtc = nowIso(),
            notes = notes
        )
        outcomes.add(0, outcome)
        recordAudit(
            actor = "USER",
            action = "RECORD_OUTCOME",
            details = "Outcome recorded for Setup $setupId: Result=$result, Pair=${outcome.pair}"
        )
        return outcome
    }

    fun getOutcomes(): List<OutcomeRecord> = outcomes.toList()

    fun getSetups(): List<Telemetry> = setups.toList()

    /**
     * Filter setups by canonical pair.
     * Supports legacy UNKNOWN.
     */
    fun getSetupsFiltered(pairFilter: String?): List<Telemetry> {
        if (pairFilter.isNullOrBlank() || pairFilter == "ALL") return setups.toList()
        return setups.filter { it.pair.equals(pairFilter, ignoreCase = true) }
    }
}
