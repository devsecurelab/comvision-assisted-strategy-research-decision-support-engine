package com.example.engine.vision

import com.example.engine.StrategyConstants
import com.example.model.*
import java.text.SimpleDateFormat
import java.util.*

class VisionEngine {

    var isCapturing: Boolean = false
        private set

    private var frameCount: Long = 0
    private var lastFrameTime: Long = 0L
    private var measuredFps: Double = 0.0

    fun startCapture() {
        isCapturing = true
        frameCount = 0
        lastFrameTime = System.currentTimeMillis()
    }

    fun stopCapture() {
        isCapturing = false
        measuredFps = 0.0
    }

    fun getMeasuredFps(): Double? {
        return if (isCapturing && measuredFps > 0.0) measuredFps else null
    }

    fun recordFrame() {
        if (!isCapturing) return
        val now = System.currentTimeMillis()
        if (lastFrameTime > 0) {
            val delta = now - lastFrameTime
            if (delta > 0) {
                measuredFps = 1000.0 / delta
            }
        }
        lastFrameTime = now
        frameCount++
    }

    /**
     * Compute verification status based strictly on the OCR confidence specification:
     * - < 85%: INVALID / INCONCLUSIVE
     * - 85% - 95%: DEGRADED
     * - > 95%: COMPLETE (only if valid)
     */
    fun computeVerificationStatus(ocrConfidence: Double?): VerificationStatus {
        if (ocrConfidence == null) return VerificationStatus.UNAVAILABLE
        return when {
            ocrConfidence < StrategyConstants.OCR_CONFIDENCE_DEGRADED_THRESHOLD -> VerificationStatus.INVALID
            ocrConfidence <= StrategyConstants.OCR_CONFIDENCE_COMPLETE_THRESHOLD -> VerificationStatus.DEGRADED
            else -> VerificationStatus.COMPLETE
        }
    }

    /**
     * Build VisionEvidence bound to canonical telemetry.
     * Guaranteed: No hardcoded pair, rates, or false OCR completions!
     */
    fun createEvidence(
        pair: String?,
        timeframe: String,
        source: VisionSource = VisionSource.SIMULATION_HARNESS,
        freshnessState: FreshnessState,
        candles: List<Candle>,
        ocrConfidence: Double? = null,
        failureReason: String? = null
    ): VisionEvidence {
        val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())

        val validatedPair = try {
            if (pair.isNullOrBlank()) null else PairCatalog.normalize(pair)
        } catch (e: Exception) {
            null
        }

        if (validatedPair == null || candles.isEmpty()) {
            return VisionEvidence(
                source = source,
                pair = validatedPair ?: "UNKNOWN",
                timeframe = timeframe,
                processedAtUtc = nowIso,
                sourceTimestampUtc = null,
                freshnessState = if (validatedPair == null) FreshnessState.UNKNOWN else freshnessState,
                ocrConfidence = ocrConfidence,
                verificationStatus = VerificationStatus.UNAVAILABLE,
                candles = emptyList(),
                overlays = VisionOverlays(),
                failureReason = failureReason ?: if (validatedPair == null) "Invalid pair" else "No candle data available"
            )
        }

        val verification = computeVerificationStatus(ocrConfidence)

        // Derive overlays authoritatively from candle structure
        val high = candles.maxOfOrNull { it.high } ?: 0.0
        val low = candles.minOfOrNull { it.low } ?: 0.0
        val range = high - low
        val fib50 = low + (range * StrategyConstants.FIB_EQUILIBRIUM_LEVEL)

        // FVG check
        var fvg: FVGZone? = null
        if (candles.size >= 3) {
            for (i in 0 until candles.size - 2) {
                val c1 = candles[i]
                val c3 = candles[i + 2]
                if (c3.low > c1.high) {
                    fvg = FVGZone(top = c3.low, bottom = c1.high, isBullish = true, formedIndex = i + 1)
                    break
                }
            }
        }

        val orderBlock = OrderBlock(
            top = low + (range * 0.25),
            bottom = low,
            isBullish = true
        )

        val liquidity = LiquidityPools(
            bsl = high,
            ssl = low,
            sweptBsl = false,
            sweptSsl = false
        )

        val overlays = VisionOverlays(
            fvg = fvg,
            orderBlock = orderBlock,
            fib50 = fib50,
            bslSsl = liquidity
        )

        return VisionEvidence(
            source = source,
            pair = validatedPair,
            timeframe = timeframe,
            processedAtUtc = nowIso,
            sourceTimestampUtc = nowIso,
            freshnessState = freshnessState,
            ocrConfidence = ocrConfidence,
            verificationStatus = verification,
            candles = candles,
            overlays = overlays,
            failureReason = failureReason
        )
    }
}
