package com.example.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.engine.ComVisionEngine
import com.example.model.*
import com.example.ui.components.StatusBadge
import com.example.ui.theme.*
import java.util.Locale

@Composable
fun VisionScreen(
    engine: ComVisionEngine,
    modifier: Modifier = Modifier
) {
    val visionEngine = engine.visionEngine
    val evidence = engine.currentEvidence
    var isCapturing by remember { mutableStateOf(visionEngine.isCapturing) }
    var showFvgOverlay by remember { mutableStateOf(true) }
    var showObOverlay by remember { mutableStateOf(true) }
    var showFibOverlay by remember { mutableStateOf(true) }

    val ocrConfidence = evidence?.ocrConfidence
    val verificationStatus = evidence?.verificationStatus ?: VerificationStatus.UNAVAILABLE
    val fps = visionEngine.getMeasuredFps()

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            // Source & Truthfulness Header Banner
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("vision_source_banner"),
                color = SurfaceDark,
                shape = RoundedCornerShape(10.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (isCapturing) BullGreen else WarningAmber)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "SOURCE: ${evidence?.source?.name ?: VisionSource.SIMULATION_HARNESS.name}",
                                color = if (isCapturing) BullGreen else WarningAmber,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                        }
                        Text(
                            text = "Canonical Pair: ${evidence?.pair ?: engine.settings.selectedPair} (${evidence?.timeframe ?: "M5"})",
                            color = TextSecondary,
                            fontSize = 11.sp
                        )
                    }

                    Button(
                        onClick = {
                            if (isCapturing) {
                                visionEngine.stopCapture()
                                isCapturing = false
                            } else {
                                visionEngine.startCapture()
                                visionEngine.recordFrame()
                                isCapturing = true
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isCapturing) BearRed else PrimaryCyan
                        ),
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.height(34.dp).testTag("vision_capture_toggle")
                    ) {
                        Text(
                            text = if (isCapturing) "STOP" else "START CAPTURE",
                            color = BgDark,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // --- Interactive Candlestick & Overlays Canvas ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp)
                    .testTag("vision_candlestick_canvas_card"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                if (evidence == null || evidence.candles.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "NO TELEMETRY EVIDENCE LOADED\nRUN STRATEGY SCAN TO BIND EVIDENCE",
                            color = TextMuted,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                } else {
                    val candles = evidence.candles
                    val minPrice = candles.minOf { it.low }
                    val maxPrice = candles.maxOf { it.high }
                    val priceRange = if (maxPrice - minPrice > 0.0) maxPrice - minPrice else 0.001

                    Canvas(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                    ) {
                        val canvasWidth = size.width
                        val canvasHeight = size.height

                        fun priceToY(price: Double): Float {
                            val norm = (maxPrice - price) / priceRange
                            return (norm * canvasHeight).toFloat().coerceIn(0f, canvasHeight)
                        }

                        // 1. Draw Overlays (FVG, OrderBlock, Fib50)
                        if (showFvgOverlay && evidence.overlays.fvg != null) {
                            val fvg = evidence.overlays.fvg!!
                            val yTop = priceToY(maxOf(fvg.top, fvg.bottom))
                            val yBottom = priceToY(minOf(fvg.top, fvg.bottom))
                            val h = kotlin.math.abs(yBottom - yTop).coerceAtLeast(4f)
                            drawRect(
                                color = AccentGold.copy(alpha = 0.20f),
                                topLeft = Offset(0f, yTop),
                                size = Size(canvasWidth, h)
                            )
                            drawRect(
                                color = AccentGold.copy(alpha = 0.6f),
                                topLeft = Offset(0f, yTop),
                                size = Size(canvasWidth, h),
                                style = Stroke(width = 1f)
                            )
                        }

                        if (showObOverlay && evidence.overlays.orderBlock != null) {
                            val ob = evidence.overlays.orderBlock!!
                            val yTop = priceToY(ob.top)
                            val yBottom = priceToY(ob.bottom)
                            val h = kotlin.math.abs(yBottom - yTop).coerceAtLeast(4f)
                            drawRect(
                                color = PrimaryCyan.copy(alpha = 0.15f),
                                topLeft = Offset(0f, yTop),
                                size = Size(canvasWidth, h)
                            )
                        }

                        if (showFibOverlay && evidence.overlays.fib50 != null) {
                            val fibY = priceToY(evidence.overlays.fib50!!)
                            drawLine(
                                color = PrimaryCyanVariant,
                                start = Offset(0f, fibY),
                                end = Offset(canvasWidth, fibY),
                                strokeWidth = 1.5f,
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))
                            )
                        }

                        // 2. Draw Candlesticks (bodies and wicks)
                        val candleCount = candles.size
                        val slotWidth = canvasWidth / candleCount
                        val candleWidth = (slotWidth * 0.65f).coerceAtLeast(4f)

                        candles.forEachIndexed { i, c ->
                            val centerX = (i * slotWidth) + (slotWidth / 2f)
                            val openY = priceToY(c.open)
                            val closeY = priceToY(c.close)
                            val highY = priceToY(c.high)
                            val lowY = priceToY(c.low)

                            val isBullish = c.close >= c.open
                            val candleColor = if (isBullish) BullGreen else BearRed

                            // Wick
                            drawLine(
                                color = candleColor,
                                start = Offset(centerX, highY),
                                end = Offset(centerX, lowY),
                                strokeWidth = 1.5f
                            )

                            // Body
                            val bodyTop = minOf(openY, closeY)
                            val bodyHeight = kotlin.math.abs(closeY - openY).coerceAtLeast(2f)
                            drawRect(
                                color = candleColor,
                                topLeft = Offset(centerX - (candleWidth / 2f), bodyTop),
                                size = Size(candleWidth, bodyHeight)
                            )
                        }
                    }
                }
            }
        }

        // --- Vision Verification & Telemetry Metrics ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("vision_telemetry_metrics_card"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "VISION TELEMETRY & CONFIDENCE",
                        color = TextMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("OCR Confidence", color = TextMuted, fontSize = 10.sp)
                            val ocrText = if (ocrConfidence != null) "${String.format(Locale.US, "%.1f", ocrConfidence * 100)}%" else "UNAVAILABLE"
                            Text(
                                text = ocrText,
                                color = when (verificationStatus) {
                                    VerificationStatus.COMPLETE -> BullGreen
                                    VerificationStatus.DEGRADED -> WarningAmber
                                    else -> BearRed
                                },
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Column {
                            Text("Verification Status", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = verificationStatus.name,
                                color = when (verificationStatus) {
                                    VerificationStatus.COMPLETE -> BullGreen
                                    VerificationStatus.DEGRADED -> WarningAmber
                                    else -> BearRed
                                },
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text("Frame Rate", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = if (fps != null) "${String.format(Locale.US, "%.0f", fps)} FPS" else "MEASURING / N/A",
                                color = TextPrimary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(color = BorderDark, thickness = 0.5.dp)
                    Spacer(modifier = Modifier.height(10.dp))

                    // Overlay toggles
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = showFvgOverlay,
                                onCheckedChange = { showFvgOverlay = it },
                                colors = CheckboxDefaults.colors(checkedColor = AccentGold)
                            )
                            Text("FVG Zone", color = TextSecondary, fontSize = 11.sp)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = showObOverlay,
                                onCheckedChange = { showObOverlay = it },
                                colors = CheckboxDefaults.colors(checkedColor = PrimaryCyan)
                            )
                            Text("Order Block", color = TextSecondary, fontSize = 11.sp)
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = showFibOverlay,
                                onCheckedChange = { showFibOverlay = it },
                                colors = CheckboxDefaults.colors(checkedColor = PrimaryCyanVariant)
                            )
                            Text("Fib 50%", color = TextSecondary, fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
