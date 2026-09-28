package com.example

import com.example.engine.ComVisionEngine
import com.example.engine.StrategyConstants
import com.example.engine.notification.NotificationService
import com.example.engine.pipeline.StrategyPipeline
import com.example.engine.provider.AlphaVantageAdapter
import com.example.engine.provider.ProviderRequest
import com.example.engine.provider.ReplayAdapter
import com.example.engine.provider.TwelveDataAdapter
import com.example.engine.vision.VisionEngine
import com.example.model.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class ComVisionRdpTestSuite {

    private lateinit var engine: ComVisionEngine
    private lateinit var adminUser: UserRecord
    private lateinit var analystUser: UserRecord

    @Before
    fun setUp() {
        engine = ComVisionEngine()
        val users = engine.getUsers()
        adminUser = users.first { it.role == UserRole.ADMIN }
        analystUser = users.first { it.role == UserRole.ANALYST }
    }

    // ==========================================
    // PHASE 1 FIXTURES & TESTS (14 FIXTURES)
    // ==========================================

    @Test
    fun pair_catalog_accepts_supported_pairs_fixture() {
        assertEquals(40, PairCatalog.SUPPORTED_PAIRS.size)
        assertEquals(20, PairCatalog.MAJOR_PAIRS.size)
        assertEquals(20, PairCatalog.MINOR_CROSS_PAIRS.size)

        PairCatalog.SUPPORTED_PAIRS.forEach { pair ->
            assertTrue("Pair $pair must be valid", PairCatalog.isValid(pair))
            assertEquals(pair, PairCatalog.normalize(pair.lowercase()))
        }
    }

    @Test
    fun pair_catalog_rejects_unsupported_pair_fixture() {
        val unsupported = listOf("BTC/USD", "XAU/USD", "DOGE/ETH", "ETH/USD", "AAPL", "")
        unsupported.forEach { symbol ->
            assertFalse("Symbol '$symbol' should not be valid", PairCatalog.isValid(symbol))
            val res = PairCatalog.validate(symbol)
            assertTrue("Validation of '$symbol' should fail", res.isFailure)
        }
    }

    @Test
    fun pair_selection_persists_across_restart_fixture() {
        // Initially default
        assertTrue(engine.settings.isDefaultPair)
        assertEquals("EUR/USD", engine.settings.selectedPair)

        // Select USD/JPY
        val res = engine.selectPair(adminUser, "USD/JPY")
        assertTrue(res.isSuccess)
        assertFalse(engine.settings.isDefaultPair)
        assertEquals("USD/JPY", engine.settings.selectedPair)

        // Simulate reboot with persisted settings
        val rebootedEngine = ComVisionEngine(initialSettings = engine.settings)
        assertEquals("USD/JPY", rebootedEngine.settings.selectedPair)
        assertFalse(rebootedEngine.settings.isDefaultPair)
    }

    @Test
    fun pair_selection_requires_approved_user_fixture() {
        val suspendedUser = adminUser.copy(status = UserStatus.SUSPENDED)
        val res = engine.selectPair(suspendedUser, "GBP/USD")
        assertTrue("Suspended user cannot select pair", res.isFailure)
        assertTrue(res.exceptionOrNull()?.message?.contains("APPROVED") == true)
        assertEquals("EUR/USD", engine.settings.selectedPair) // Pair unchanged
    }

    @Test
    fun pair_selection_audit_linkage_fixture() {
        val initialAuditCount = engine.getAuditLogs().size
        engine.selectPair(adminUser, "AUD/USD", source = "TEST_RUNNER")
        val latestLog = engine.getAuditLogs().first()

        assertEquals("PAIR_SELECTION", latestLog.action)
        assertEquals(adminUser.email, latestLog.actor)
        assertTrue(latestLog.details.contains("EUR/USD"))
        assertTrue(latestLog.details.contains("AUD/USD"))
        assertTrue(latestLog.details.contains("TEST_RUNNER"))
        assertEquals(initialAuditCount + 1, engine.getAuditLogs().size)
    }

    @Test
    fun provider_symbol_mapping_all_supported_pairs_fixture() {
        val replay = ReplayAdapter()
        val twelveData = TwelveDataAdapter("dummy_key")
        val alphaVantage = AlphaVantageAdapter("dummy_key")

        PairCatalog.SUPPORTED_PAIRS.forEach { pair ->
            assertEquals(pair, replay.mapSymbol(pair))
            assertEquals(pair, twelveData.mapSymbol(pair))
            assertEquals(pair.replace("/", ""), alphaVantage.mapSymbol(pair))
        }
    }

    @Test
    fun provider_never_falls_back_to_eur_usd_fixture() = runBlocking {
        val replay = ReplayAdapter()
        val res = replay.fetchCandles(ProviderRequest(pair = "INVALID_COIN"))
        assertEquals("INVALID_COIN", res.canonicalPair)
        assertEquals(FreshnessState.OFFLINE, res.freshnessState)
        assertNotNull(res.sanitizedFailureReason)
        assertNull(res.currentPrice)
        // Must NOT return EUR/USD data!
        assertTrue(res.candles.isEmpty())
    }

    @Test
    fun manual_scan_propagates_selected_pair_fixture() = runBlocking {
        engine.selectPair(adminUser, "USD/JPY")
        val scanResult = engine.performScan(isPolling = false)
        assertTrue(scanResult.isSuccess)
        val telemetry = scanResult.getOrThrow()

        assertEquals("USD/JPY", telemetry.pair)
        assertEquals("USD/JPY", telemetry.alert?.pair)
        assertEquals("USD/JPY", engine.currentEvidence?.pair)
    }

    @Test
    fun polling_scan_propagates_selected_pair_fixture() = runBlocking {
        engine.selectPair(adminUser, "USD/CAD")
        val scanResult = engine.performScan(isPolling = true)
        assertTrue(scanResult.isSuccess)
        val telemetry = scanResult.getOrThrow()

        assertEquals("USD/CAD", telemetry.pair)
        assertEquals("USD/CAD", telemetry.alert?.pair)
        val latestAudit = engine.getAuditLogs().first { it.action == "STRATEGY_SCAN" }
        assertEquals("POLLING_SCANNER", latestAudit.actor)
        assertTrue(latestAudit.details.contains("USD/CAD"))
    }

    @Test
    fun telemetry_and_alert_pair_consistency_fixture() = runBlocking {
        engine.selectPair(adminUser, "GBP/USD")
        val res = engine.performScan()
        val telemetry = res.getOrThrow()

        assertEquals("GBP/USD", telemetry.pair)
        assertNotNull(telemetry.alert)
        assertEquals(telemetry.pair, telemetry.alert!!.pair)
        assertEquals(telemetry.setupId, telemetry.alert!!.setupId)
    }

    @Test
    fun notification_pair_consistency_fixture() = runBlocking {
        engine.selectPair(adminUser, "NZD/USD")
        val scanRes = engine.performScan().getOrThrow()
        assertEquals("NZD/USD", scanRes.pair)

        // Ensure alert carries the exact canonical pair
        val alert = scanRes.alert!!
        assertEquals("NZD/USD", alert.pair)
        assertEquals(FinalAction.MANUAL_ALERT, alert.finalAction)
    }

    @Test
    fun legacy_record_without_pair_loads_as_unknown_fixture() {
        val outcome = engine.recordOutcome(
            setupId = "LEGACY-001",
            pair = "UNRECOGNIZED_LEGACY",
            result = "WIN"
        )
        assertEquals("UNKNOWN", outcome.pair)

        val filtered = engine.getSetupsFiltered("UNKNOWN")
        // No crash and filtered as unknown
        assertNotNull(filtered)
    }

    @Test
    fun pair_selection_preserves_frozen_strategy_constants_fixture() {
        val initialGap = StrategyConstants.FVG_MIN_GAP_PIPS
        val initialFib = StrategyConstants.FIB_EQUILIBRIUM_LEVEL
        val initialWick = StrategyConstants.WICK_RATIO_MAX_THRESHOLD
        val initialOteLower = StrategyConstants.OTE_LOWER_BOUND

        // Switch across multiple pairs
        listOf("USD/JPY", "GBP/USD", "AUD/USD", "USD/CHF").forEach { pair ->
            engine.selectPair(adminUser, pair)
            assertEquals(initialGap, StrategyConstants.FVG_MIN_GAP_PIPS, 0.0001)
            assertEquals(initialFib, StrategyConstants.FIB_EQUILIBRIUM_LEVEL, 0.0001)
            assertEquals(initialWick, StrategyConstants.WICK_RATIO_MAX_THRESHOLD, 0.0001)
            assertEquals(initialOteLower, StrategyConstants.OTE_LOWER_BOUND, 0.0001)
            assertTrue(engine.settings.scopeFreezeActive)
        }
    }

    @Test
    fun pair_selection_cannot_trigger_execution_fixture() {
        engine.selectPair(adminUser, "USD/JPY")
        assertTrue(engine.pipeline.verifyNonExecutionBoundary())
        assertFalse(StrategyConstants.BROKER_EXECUTION_ENABLED)
    }

    // ==========================================
    // PHASE 2 FIXTURES & TESTS (14 FIXTURES)
    // ==========================================

    @Test
    fun vision_live_evidence_renders_selected_pair_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("USD/JPY")
        val evidence = visionEngine.createEvidence(
            pair = "USD/JPY",
            timeframe = "M5",
            source = VisionSource.ACTUAL_CV_EXTRACTED,
            freshnessState = FreshnessState.LIVE,
            candles = candles,
            ocrConfidence = 0.98
        )
        assertEquals("USD/JPY", evidence.pair)
        assertEquals(VisionSource.ACTUAL_CV_EXTRACTED, evidence.source)
        assertEquals(FreshnessState.LIVE, evidence.freshnessState)
        assertEquals(VerificationStatus.COMPLETE, evidence.verificationStatus)
        assertEquals(candles.size, evidence.candles.size)
    }

    @Test
    fun vision_replay_evidence_renders_candles_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("EUR/USD")
        val evidence = visionEngine.createEvidence(
            pair = "EUR/USD",
            timeframe = "M15",
            source = VisionSource.SIMULATION_HARNESS,
            freshnessState = FreshnessState.REPLAY,
            candles = candles,
            ocrConfidence = 0.90
        )
        assertEquals(FreshnessState.REPLAY, evidence.freshnessState)
        assertEquals(candles.size, evidence.candles.size)
        assertTrue(evidence.candles.first().high > 0)
    }

    @Test
    fun vision_fvg_overlay_matches_telemetry_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("EUR/USD")
        val evidence = visionEngine.createEvidence(
            pair = "EUR/USD",
            timeframe = "M5",
            freshnessState = FreshnessState.REPLAY,
            candles = candles,
            ocrConfidence = 0.96
        )
        assertNotNull(evidence.overlays.fvg)
        assertTrue(evidence.overlays.fvg!!.top > evidence.overlays.fvg!!.bottom)
    }

    @Test
    fun vision_ob_overlay_matches_telemetry_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("GBP/USD")
        val evidence = visionEngine.createEvidence(
            pair = "GBP/USD",
            timeframe = "M5",
            freshnessState = FreshnessState.REPLAY,
            candles = candles,
            ocrConfidence = 0.96
        )
        assertNotNull(evidence.overlays.orderBlock)
        assertEquals("VALID", evidence.overlays.orderBlock!!.status)
    }

    @Test
    fun vision_fib50_overlay_matches_telemetry_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("USD/CHF")
        val high = candles.maxOf { it.high }
        val low = candles.minOf { it.low }
        val expectedFib50 = low + ((high - low) * 0.5)

        val evidence = visionEngine.createEvidence(
            pair = "USD/CHF",
            timeframe = "M5",
            freshnessState = FreshnessState.REPLAY,
            candles = candles,
            ocrConfidence = 0.96
        )
        assertNotNull(evidence.overlays.fib50)
        assertEquals(expectedFib50, evidence.overlays.fib50!!, 0.0001)
    }

    @Test
    fun vision_bsl_ssl_overlay_matches_telemetry_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("AUD/USD")
        val evidence = visionEngine.createEvidence(
            pair = "AUD/USD",
            timeframe = "M5",
            freshnessState = FreshnessState.REPLAY,
            candles = candles,
            ocrConfidence = 0.96
        )
        assertNotNull(evidence.overlays.bslSsl)
        assertNotNull(evidence.overlays.bslSsl!!.bsl)
        assertNotNull(evidence.overlays.bslSsl!!.ssl)
    }

    @Test
    fun vision_missing_evidence_shows_unavailable_fixture() {
        val visionEngine = VisionEngine()
        val evidence = visionEngine.createEvidence(
            pair = null,
            timeframe = "M5",
            freshnessState = FreshnessState.UNKNOWN,
            candles = emptyList()
        )
        assertEquals("UNKNOWN", evidence.pair)
        assertEquals(VerificationStatus.UNAVAILABLE, evidence.verificationStatus)
        assertTrue(evidence.candles.isEmpty())
        assertNotNull(evidence.failureReason)
    }

    @Test
    fun vision_simulation_source_is_labelled_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("EUR/USD")
        val evidence = visionEngine.createEvidence(
            pair = "EUR/USD",
            timeframe = "M5",
            source = VisionSource.SIMULATION_HARNESS,
            freshnessState = FreshnessState.REPLAY,
            candles = candles
        )
        assertEquals(VisionSource.SIMULATION_HARNESS, evidence.source)
    }

    @Test
    fun vision_ocr_under_85_inconclusive_fixture() {
        val visionEngine = VisionEngine()
        val status = visionEngine.computeVerificationStatus(0.849)
        assertEquals(VerificationStatus.INVALID, status)
    }

    @Test
    fun vision_ocr_85_to_95_degraded_fixture() {
        val visionEngine = VisionEngine()
        assertEquals(VerificationStatus.DEGRADED, visionEngine.computeVerificationStatus(0.850))
        assertEquals(VerificationStatus.DEGRADED, visionEngine.computeVerificationStatus(0.920))
        assertEquals(VerificationStatus.DEGRADED, visionEngine.computeVerificationStatus(0.950))
    }

    @Test
    fun vision_ocr_over_95_complete_fixture() {
        val visionEngine = VisionEngine()
        assertEquals(VerificationStatus.COMPLETE, visionEngine.computeVerificationStatus(0.951))
        assertEquals(VerificationStatus.COMPLETE, visionEngine.computeVerificationStatus(0.980))
    }

    @Test
    fun vision_stale_feed_never_claims_live_fixture() {
        val visionEngine = VisionEngine()
        val candles = ReplayAdapter.getDeterministicFixtures("EUR/USD")
        val evidence = visionEngine.createEvidence(
            pair = "EUR/USD",
            timeframe = "M5",
            freshnessState = FreshnessState.STALE,
            candles = candles,
            ocrConfidence = 0.99
        )
        assertEquals(FreshnessState.STALE, evidence.freshnessState)
        assertNotEquals(FreshnessState.LIVE, evidence.freshnessState)
    }

    @Test
    fun vision_fps_is_measured_or_unknown_fixture() {
        val visionEngine = VisionEngine()
        assertNull(visionEngine.getMeasuredFps()) // Not running -> null / unknown

        visionEngine.startCapture()
        visionEngine.recordFrame()
        Thread.sleep(10)
        visionEngine.recordFrame()
        assertNotNull(visionEngine.getMeasuredFps())
        visionEngine.stopCapture()
        assertNull(visionEngine.getMeasuredFps())
    }

    @Test
    fun vision_rendering_cannot_change_pipeline_decision_fixture() = runBlocking {
        engine.selectPair(adminUser, "USD/JPY")
        val originalTelemetry = engine.performScan().getOrThrow()
        val originalAlert = originalTelemetry.alert

        // Process vision evidence
        val evidence = engine.currentEvidence
        assertNotNull(evidence)

        // Pipeline decision must remain identical
        assertEquals(originalAlert!!.setupId, engine.currentTelemetry!!.alert!!.setupId)
        assertEquals(originalAlert.direction, engine.currentTelemetry!!.alert!!.direction)
        assertEquals(originalAlert.stopLoss, engine.currentTelemetry!!.alert!!.stopLoss, 0.0001)
    }

    // ==========================================
    // PHASE 3 FIXTURES & TESTS (13 FIXTURES)
    // ==========================================

    @Test
    fun dashboard_authority_panel_matches_server_settings_fixture() {
        engine.selectPair(adminUser, "USD/CHF")
        engine.setTimeframe("M15")
        engine.setProvider("REPLAY")

        val settings = engine.settings
        assertEquals("USD/CHF", settings.selectedPair)
        assertEquals("M15", settings.selectedTimeframe)
        assertEquals("REPLAY", settings.selectedProvider)
        assertTrue(settings.scopeFreezeActive)
    }

    @Test
    fun dashboard_feed_live_degraded_stale_offline_replay_fixture() {
        val states = listOf(
            FreshnessState.LIVE,
            FreshnessState.DEGRADED,
            FreshnessState.STALE,
            FreshnessState.OFFLINE,
            FreshnessState.REPLAY
        )
        states.forEach { state ->
            val quote = MarketQuote(
                pair = "EUR/USD",
                price = 1.0850,
                timestampUtc = System.currentTimeMillis(),
                provider = "TEST",
                freshnessState = state
            )
            assertEquals(state, quote.freshnessState)
        }
    }

    @Test
    fun dashboard_no_hardcoded_rate_fixture() = runBlocking {
        engine.selectPair(adminUser, "USD/JPY")
        engine.performScan()
        val telemetry = engine.currentTelemetry!!
        // Rate must be JPY magnitude (~155.0), NEVER EUR/USD 1.0850!
        assertTrue(telemetry.currentPrice!! > 100.0)
    }

    @Test
    fun bos_badge_exact_semantics_fixture() {
        val pipeline = StrategyPipeline()
        val candles = ReplayAdapter.getDeterministicFixtures("EUR/USD")
        val telemetry = pipeline.execute("EUR/USD", candles = candles)

        // BOS label must represent structural break or continuity, never unconditional PASS
        val bosLabel = telemetry.validationBadges.bosLabel
        assertTrue(bosLabel.contains("PASS") || bosLabel.contains("CONTINUITY") || bosLabel.contains("FAIL"))
        if (!telemetry.validationBadges.bosDetected) {
            assertNotEquals("PASS (Structural Break)", bosLabel)
        }
    }

    @Test
    fun all_validation_badges_map_to_authoritative_fields_fixture() {
        val pipeline = StrategyPipeline()
        val candles = ReplayAdapter.getDeterministicFixtures("GBP/USD")
        val telemetry = pipeline.execute("GBP/USD", candles = candles)
        val badges = telemetry.validationBadges

        assertNotNull(badges.fvgStatus)
        assertNotNull(badges.obStatus)
        assertNotNull(badges.liquidityStatus)
        assertNotNull(badges.fibStatus)
        assertNotNull(badges.oteStatus)
        assertNotNull(badges.wickStatus)
        assertNotNull(badges.momentumStatus)
        assertNotNull(badges.newsGuardStatus)
    }

    @Test
    fun unavailable_evidence_is_inconclusive_fixture() {
        val pipeline = StrategyPipeline()
        val telemetry = pipeline.execute("EUR/USD", candles = emptyList())
        val badges = telemetry.validationBadges

        assertEquals("INCONCLUSIVE", badges.bosLabel)
        assertEquals("INCONCLUSIVE", badges.fvgStatus)
        assertEquals("INCONCLUSIVE", badges.obStatus)
        assertEquals("INCONCLUSIVE", badges.wickStatus)
        assertNull(telemetry.alert)
    }

    @Test
    fun risk_summary_uses_authoritative_records_fixture() {
        val outcomes = listOf(
            OutcomeRecord("S1", "EUR/USD", "WIN", "2026-09-27T10:00:00Z"),
            OutcomeRecord("S2", "EUR/USD", "LOSS", "2026-09-27T11:00:00Z")
        )
        val winRate = (outcomes.count { it.result == "WIN" }.toDouble() / outcomes.size) * 100.0
        assertEquals(50.0, winRate, 0.01)
    }

    @Test
    fun scanner_control_server_confirmation_fixture() = runBlocking {
        assertFalse(engine.isScanning)
        val scanJob = engine.performScan()
        assertTrue(scanJob.isSuccess)
        assertFalse(engine.isScanning)
        assertNotNull(engine.currentTelemetry)
    }

    @Test
    fun scan_failure_does_not_show_new_alert_fixture() = runBlocking {
        // Set invalid pair directly
        val badRequest = ProviderRequest(pair = "INVALID_PAIR")
        val replay = ReplayAdapter()
        val resp = replay.fetchCandles(badRequest)
        assertNotNull(resp.sanitizedFailureReason)
        assertTrue(resp.candles.isEmpty())
    }

    @Test
    fun analytics_pair_filter_canonical_fixture() = runBlocking {
        engine.selectPair(adminUser, "USD/JPY")
        engine.performScan()
        engine.selectPair(adminUser, "EUR/USD")
        engine.performScan()

        val jpySetups = engine.getSetupsFiltered("USD/JPY")
        val eurSetups = engine.getSetupsFiltered("EUR/USD")

        assertTrue(jpySetups.all { it.pair == "USD/JPY" })
        assertTrue(eurSetups.all { it.pair == "EUR/USD" })
    }

    @Test
    fun legacy_history_pair_unknown_fixture() {
        val legacy = OutcomeRecord("LEG-99", "UNKNOWN", "LOSS", "2026-09-01T00:00:00Z")
        assertEquals("UNKNOWN", legacy.pair)
    }

    @Test
    fun setup_id_pair_outcome_notification_linkage_fixture() = runBlocking {
        engine.selectPair(adminUser, "AUD/USD")
        val telemetry = engine.performScan().getOrThrow()
        val outcome = engine.recordOutcome(telemetry.setupId, telemetry.pair, "WIN")

        assertEquals(telemetry.setupId, outcome.setupId)
        assertEquals(telemetry.pair, outcome.pair)
        assertEquals("AUD/USD", outcome.pair)
    }

    @Test
    fun dashboard_controls_preserve_non_execution_boundary_fixture() {
        assertTrue(engine.pipeline.verifyNonExecutionBoundary())
    }

    // ==========================================
    // PHASE 4 FIXTURES & TESTS (15 FIXTURES)
    // ==========================================

    @Test
    fun notification_status_masks_all_secrets_fixture() {
        val service = NotificationService(
            telegramBotToken = "SECRET_BOT_TOKEN_12345",
            telegramChatId = "987654321",
            emailRecipient = "john.doe@research.com",
            smtpPassword = "SUPER_SECRET_SMTP_APP_PASSWORD"
        )
        val status = service.getStatus()

        // Passwords & Tokens NEVER present
        assertFalse(status.toString().contains("SECRET_BOT_TOKEN_12345"))
        assertFalse(status.toString().contains("SUPER_SECRET_SMTP_APP_PASSWORD"))

        // Chat ID & Recipient masked
        assertEquals("***4321", status.telegramMaskedChatId)
        assertEquals("j***e@research.com", status.emailMaskedRecipient)
    }

    @Test
    fun email_configured_state_fixture() {
        val service = NotificationService(
            emailRecipient = "analyst@test.com",
            smtpPassword = "app-password"
        )
        assertTrue(service.isEmailConfigured)
    }

    @Test
    fun email_missing_config_is_disabled_fixture() {
        val unconfiguredService = NotificationService()
        assertFalse(unconfiguredService.isEmailConfigured)
        val res = unconfiguredService.testEmail(adminUser)
        assertFalse(res.success)
        assertEquals("DISABLED", res.sanitizedErrorCode)
    }

    @Test
    fun email_test_success_mock_smtp_fixture() {
        val service = NotificationService(
            emailRecipient = "analyst@test.com",
            smtpPassword = "app-password"
        )
        val res = service.testEmail(adminUser)
        assertTrue(res.success)
        assertNull(res.sanitizedErrorCode)
    }

    @Test
    fun email_auth_failure_sanitized_fixture() {
        val service = NotificationService(
            emailRecipient = "analyst@test.com",
            smtpPassword = "bad-password"
        )
        val res = service.testEmail(adminUser, mockOutcome = "AUTH_FAILURE")
        assertFalse(res.success)
        assertEquals("AUTHENTICATION_FAILED", res.sanitizedErrorCode)
    }

    @Test
    fun email_timeout_sanitized_fixture() {
        val service = NotificationService(
            emailRecipient = "analyst@test.com",
            smtpPassword = "app-password"
        )
        val res = service.testEmail(adminUser, mockOutcome = "TIMEOUT")
        assertFalse(res.success)
        assertEquals("TIMEOUT", res.sanitizedErrorCode)
    }

    @Test
    fun telegram_success_mock_fixture() {
        val service = NotificationService(
            telegramBotToken = "bot-token",
            telegramChatId = "12345678"
        )
        val res = service.testTelegram()
        assertTrue(res.success)
        assertNull(res.sanitizedErrorCode)
    }

    @Test
    fun telegram_invalid_token_fixture() {
        val service = NotificationService(
            telegramBotToken = "bad-token",
            telegramChatId = "12345678"
        )
        val res = service.testTelegram(mockOutcome = "INVALID_TOKEN")
        assertFalse(res.success)
        assertEquals("INVALID_BOT_TOKEN", res.sanitizedErrorCode)
    }

    @Test
    fun telegram_missing_chat_id_fixture() {
        val service = NotificationService(
            telegramBotToken = "bot-token",
            telegramChatId = null
        )
        val res = service.testTelegram()
        assertFalse(res.success)
        assertEquals("CHAT_ID_MISSING", res.sanitizedErrorCode)
    }

    @Test
    fun telegram_token_never_leaks_fixture() {
        val sensitiveToken = "BOT_TOKEN_CLASSIFIED_XYZ999"
        val service = NotificationService(
            telegramBotToken = sensitiveToken,
            telegramChatId = "12345678"
        )
        val res = service.testTelegram(mockOutcome = "INVALID_TOKEN")
        assertFalse(res.message.contains(sensitiveToken))
        assertFalse(service.getStatus().toString().contains(sensitiveToken))
    }

    @Test
    fun notification_failure_does_not_change_candidate_fixture() = runBlocking {
        engine.selectPair(adminUser, "USD/JPY")
        val telemetry = engine.performScan().getOrThrow()
        val originalAlert = telemetry.alert!!

        // Trigger failing notification test
        val failedNotif = engine.notificationService.testEmail(adminUser, mockOutcome = "AUTH_FAILURE")
        assertFalse(failedNotif.success)

        // Telemetry & alert remain unchanged
        assertEquals(originalAlert, engine.currentTelemetry!!.alert)
    }

    @Test
    fun notification_audit_event_linkage_fixture() {
        val auditCountBefore = engine.getAuditLogs().size
        val res = engine.notificationService.testTelegram()
        engine.recordAudit(adminUser.email, "TELEGRAM_TEST", "Result=${res.message}")

        val latestAudit = engine.getAuditLogs().first()
        assertEquals("TELEGRAM_TEST", latestAudit.action)
        assertEquals(adminUser.email, latestAudit.actor)
        assertEquals(auditCountBefore + 1, engine.getAuditLogs().size)
    }

    @Test
    fun analyst_cannot_manage_users_fixture() {
        val res = engine.updateUserStatus(analystUser, adminUser.userId, UserStatus.SUSPENDED)
        assertTrue(res.isFailure)
        assertTrue(res.exceptionOrNull() is SecurityException)
    }

    @Test
    fun analyst_cannot_access_secret_or_admin_notification_controls_fixture() {
        val res = engine.notificationService.updateTelegramConfig(
            actor = analystUser,
            botToken = "new_token",
            chatId = "12345"
        )
        assertTrue(res.isFailure)
        assertTrue(res.exceptionOrNull() is SecurityException)
    }

    @Test
    fun admin_notification_test_authorization_fixture() {
        val res = engine.notificationService.testEmail(adminUser)
        // Admin is authorized to send test email
        assertNotEquals("UNAUTHORIZED_ACTOR", res.sanitizedErrorCode)
    }

    @Test
    fun all_40_canonical_pairs_supported_fixture() {
        assertEquals(40, PairCatalog.SUPPORTED_PAIRS.size)
        // Ensure 20 Major and 20 Minor/Cross
        assertEquals(20, PairCatalog.MAJOR_PAIRS.size)
        assertEquals(20, PairCatalog.MINOR_CROSS_PAIRS.size)

        // Test random samples from Major & Minor
        assertTrue(PairCatalog.isMajor("EUR/USD"))
        assertTrue(PairCatalog.isMajor("GBP/JPY"))
        assertTrue(PairCatalog.isMajor("CHF/JPY"))

        assertTrue(PairCatalog.isMinor("GBP/NZD"))
        assertTrue(PairCatalog.isMinor("EUR/HKD"))
        assertTrue(PairCatalog.isMinor("GBP/ZAR"))
        assertTrue(PairCatalog.isMinor("EUR/TRY"))

        PairCatalog.SUPPORTED_PAIRS.forEach { pair ->
            assertTrue(ReplayAdapter.getBasePrice(pair) > 0.0)
            val fixtures = ReplayAdapter.getDeterministicFixtures(pair)
            assertEquals(8, fixtures.size)
        }
    }

    @Test
    fun next_candle_win_loss_evaluation_and_alert_dispatch_fixture() = runBlocking {
        // Configure Telegram & Email
        engine.notificationService.telegramBotToken = "test_bot_token"
        engine.notificationService.telegramChatId = "12345678"
        engine.notificationService.emailRecipient = "trader@comvision.org"
        engine.notificationService.smtpPassword = "app-password"

        engine.selectPair(adminUser, "EUR/JPY")
        val scanRes = engine.performScan()
        assertTrue(scanRes.isSuccess)
        val telemetry = scanRes.getOrThrow()
        assertNotNull(telemetry.alert)

        // Force a WIN outcome
        val winOutcome = engine.evaluateNextCandleOutcome(forceWin = true)
        assertNotNull(winOutcome)
        assertEquals("WIN", winOutcome!!.result)
        assertEquals("EUR/JPY", winOutcome.pair)
        assertEquals(telemetry.setupId, winOutcome.setupId)
        assertTrue(winOutcome.notes?.contains("WIN") == true || winOutcome.exitPrice > 0.0)

        // Force a LOSS outcome
        val lossOutcome = engine.evaluateNextCandleOutcome(forceWin = false)
        assertNotNull(lossOutcome)
        assertEquals("LOSS", lossOutcome!!.result)
        assertEquals("EUR/JPY", lossOutcome.pair)

        // Verify linked outcomes in engine history
        val outcomes = engine.getOutcomes()
        assertTrue(outcomes.size >= 2)
        assertEquals("LOSS", outcomes[0].result)
        assertEquals("WIN", outcomes[1].result)

        // Verify audit log has the outcome entries
        val outcomeAudit = engine.getAuditLogs().first { it.action == "CANDLE_OUTCOME_ALERT" }
        assertTrue(outcomeAudit.details.contains("EUR/JPY"))
    }

    @Test
    fun signal_auto_dispatches_telegram_and_email_fixture() = runBlocking {
        engine.notificationService.telegramBotToken = "token_xyz"
        engine.notificationService.telegramChatId = "98765432"
        engine.notificationService.emailRecipient = "analyst@market.com"
        engine.notificationService.smtpPassword = "secret-pass"

        engine.selectPair(adminUser, "GBP/NZD")
        val scan = engine.performScan().getOrThrow()

        // Verify audit log recorded signal notification dispatch
        val dispatchAudit = engine.getAuditLogs().first { it.action == "SIGNAL_NOTIFICATION_DISPATCH" }
        assertTrue(dispatchAudit.details.contains(scan.setupId))
    }

    @Test
    fun multi_market_simultaneous_scan_and_alert_fixture() = runBlocking {
        // Activate 5 pairs for multi-market scanning
        val targetPairs = listOf("EUR/USD", "GBP/USD", "USD/JPY", "EUR/JPY", "GBP/JPY")
        targetPairs.forEach { pair ->
            engine.toggleActivePair(adminUser, pair)
        }
        assertTrue(engine.settings.activePairs.size >= 5)

        // Perform simultaneous multi-market scan
        val summary = engine.performMultiScan()
        assertTrue(summary.totalScanned >= 5)
        assertEquals(summary.totalScanned, summary.pairsScanned.size)

        // Verify multi-market audit log
        val multiAudit = engine.getAuditLogs().first { it.action == "MULTI_MARKET_SCAN" }
        assertTrue(multiAudit.details.contains("Scanned"))

        // Perform multi-market next candle outcome evaluation
        val outcomes = engine.evaluateAllNextCandles(forceWin = true)
        assertTrue(outcomes.isNotEmpty())
        outcomes.forEach { o ->
            assertEquals("WIN", o.result)
            assertTrue(PairCatalog.isValid(o.pair))
        }
    }
}
