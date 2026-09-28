package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.engine.ComVisionEngine
import com.example.model.*
import com.example.ui.components.NonExecutionNoticeBanner
import com.example.ui.components.StatusBadge
import com.example.ui.components.ValidationBadgeItem
import com.example.ui.theme.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DashboardScreen(
    engine: ComVisionEngine,
    currentUser: UserRecord,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var isScanning by remember { mutableStateOf(engine.isScanning) }
    var isEvaluatingOutcome by remember { mutableStateOf(false) }
    var scanError by remember { mutableStateOf<String?>(null) }
    var validationError by remember { mutableStateOf<String?>(null) }
    var selectedCategoryTab by remember { mutableIntStateOf(0) } // 0: Major (20), 1: Minor/Cross (20), 2: All (40)
    var pairSearchQuery by remember { mutableStateOf("") }

    val settings = engine.settings
    val telemetry = engine.currentTelemetry
    val lastOutcome = engine.lastRecordedOutcome
    val multiSummary = engine.lastMultiScanSummary

    fun formatBdtTime(date: Date): String {
        return SimpleDateFormat("HH:mm:ss 'BDT'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("Asia/Dhaka")
        }.format(date)
    }

    fun formatUtcTime(date: Date): String {
        return SimpleDateFormat("yyyy-MM-dd HH:mm:ss 'UTC'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(date)
    }

    val now = Date()

    val rawCategoryPairs = when (selectedCategoryTab) {
        0 -> PairCatalog.MAJOR_PAIRS
        1 -> PairCatalog.MINOR_CROSS_PAIRS
        else -> PairCatalog.SUPPORTED_PAIRS
    }

    val displayedPairs = remember(rawCategoryPairs, pairSearchQuery) {
        if (pairSearchQuery.isBlank()) {
            rawCategoryPairs
        } else {
            val query = pairSearchQuery.trim().replace("/", "").uppercase()
            rawCategoryPairs.filter { pair ->
                pair.replace("/", "").uppercase().contains(query) || pair.uppercase().contains(pairSearchQuery.trim().uppercase())
            }
        }
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            NonExecutionNoticeBanner()
        }

        // --- 1. Dashboard Authority Panel ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("dashboard_authority_panel"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.VerifiedUser,
                                contentDescription = "Authority",
                                tint = PrimaryCyan,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "SYSTEM AUTHORITY PANEL",
                                color = TextPrimary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                        }

                        StatusBadge(
                            state = telemetry?.freshnessState ?: if (settings.selectedProvider == "REPLAY") FreshnessState.REPLAY else FreshnessState.OFFLINE
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Active Focus Pair", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = settings.selectedPair + if (settings.isDefaultPair) " (Default)" else " (Active)",
                                color = TextPrimary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Column {
                            Text("Active Markets", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = "${settings.activePairs.size} of 40 Pairs",
                                color = AccentGold,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Column {
                            Text("Provider", color = TextMuted, fontSize = 10.sp)
                            Text(settings.selectedProvider, color = PrimaryCyan, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    HorizontalDivider(color = BorderDark, thickness = 0.5.dp)
                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Observation Time", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = formatUtcTime(now),
                                color = TextSecondary,
                                fontSize = 10.sp
                            )
                            Text(
                                text = formatBdtTime(now),
                                color = AccentGold,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Multi-Market Scope", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = if (settings.activePairs.size > 1) "MULTI-MARKET ACTIVE" else "SINGLE PAIR FOCUS",
                                color = if (settings.activePairs.size > 1) BullGreen else PrimaryCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // --- 40 Canonical Pairs Multi-Market Selector Strip ---
        item {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "MULTI-MARKET SELECTOR (${settings.activePairs.size} ACTIVE)",
                        color = TextMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )

                    // Tab Category Filter
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("Major (20)", "Minor (20)", "All (40)").forEachIndexed { index, title ->
                            FilterChip(
                                selected = selectedCategoryTab == index,
                                onClick = { selectedCategoryTab = index },
                                label = { Text(title, fontSize = 10.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = AccentGold,
                                    selectedLabelColor = BgDark,
                                    containerColor = SurfaceDark,
                                    labelColor = TextSecondary
                                )
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Multi-Market Batch Quick Selection Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    OutlinedButton(
                        onClick = { engine.selectAllMajor(currentUser) },
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.height(28.dp).weight(1f),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Text("+ All Major", fontSize = 9.sp, color = AccentGold, fontWeight = FontWeight.Bold)
                    }

                    OutlinedButton(
                        onClick = { engine.selectAllMinor(currentUser) },
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.height(28.dp).weight(1f),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Text("+ All Minor", fontSize = 9.sp, color = PrimaryCyan, fontWeight = FontWeight.Bold)
                    }

                    OutlinedButton(
                        onClick = { engine.selectAllPairs(currentUser) },
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.height(28.dp).weight(1f),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Text("+ All 40", fontSize = 9.sp, color = BullGreen, fontWeight = FontWeight.Bold)
                    }

                    OutlinedButton(
                        onClick = { engine.resetToSinglePair(currentUser, PairCatalog.DEFAULT_PAIR) },
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.height(28.dp).weight(1f),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Text("Reset (1)", fontSize = 9.sp, color = TextMuted, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Instant Search Bar for 40 Canonical Pairs
                OutlinedTextField(
                    value = pairSearchQuery,
                    onValueChange = { pairSearchQuery = it },
                    placeholder = { Text("Search 40 pairs (e.g. JPY, EUR, GBP, ZAR)...", fontSize = 11.sp, color = TextMuted) },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Search, contentDescription = "Search", tint = PrimaryCyan, modifier = Modifier.size(16.dp))
                    },
                    trailingIcon = {
                        if (pairSearchQuery.isNotEmpty()) {
                            IconButton(onClick = { pairSearchQuery = "" }, modifier = Modifier.size(24.dp)) {
                                Icon(imageVector = Icons.Default.Clear, contentDescription = "Clear", tint = TextSecondary, modifier = Modifier.size(14.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = SurfaceDark,
                        unfocusedContainerColor = SurfaceDark,
                        focusedBorderColor = PrimaryCyan,
                        unfocusedBorderColor = BorderDark,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("pair_search_input")
                )

                Spacer(modifier = Modifier.height(8.dp))

                if (displayedPairs.isEmpty()) {
                    Text(
                        text = "No pairs found matching '$pairSearchQuery'",
                        color = TextMuted,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(vertical = 6.dp)
                    )
                } else {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().testTag("pair_selector_row")
                    ) {
                        items(displayedPairs) { pair ->
                            val isFocused = pair == settings.selectedPair
                            val isActive = settings.activePairs.contains(pair)

                            FilterChip(
                                selected = isActive,
                                onClick = {
                                    val res = engine.toggleActivePair(currentUser, pair)
                                    if (res.isFailure) {
                                        validationError = res.exceptionOrNull()?.message
                                    } else {
                                        validationError = null
                                    }
                                },
                                leadingIcon = if (isActive) {
                                    {
                                        Icon(
                                            imageVector = Icons.Default.Check,
                                            contentDescription = "Active",
                                            tint = if (isFocused) BgDark else BullGreen,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                } else null,
                                label = {
                                    Text(
                                        text = pair + if (isFocused) " ★" else "",
                                        fontSize = 11.sp,
                                        fontWeight = if (isFocused) FontWeight.ExtraBold else if (isActive) FontWeight.Bold else FontWeight.Normal
                                    )
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = if (isFocused) PrimaryCyan else SurfaceDark,
                                    selectedLabelColor = if (isFocused) BgDark else TextPrimary,
                                    containerColor = SurfaceCard,
                                    labelColor = TextSecondary
                                ),
                                border = FilterChipDefaults.filterChipBorder(
                                    enabled = true,
                                    selected = isActive,
                                    borderColor = if (isFocused) PrimaryCyan else if (isActive) BullGreen else BorderDark
                                )
                            )
                        }
                    }
                }

                if (validationError != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = validationError ?: "",
                        color = BearRed,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        // --- Multi-Market Scan Results Summary Card ---
        if (multiSummary != null) {
            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("multi_scan_summary_card"),
                    color = SurfaceDark,
                    shape = RoundedCornerShape(10.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryCyan.copy(alpha = 0.5f))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.GridView,
                                    contentDescription = "Multi Scan",
                                    tint = PrimaryCyan,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "MULTI-MARKET SCAN RESULTS",
                                    color = TextPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Text(
                                text = "${multiSummary.setupsFound} Setups / ${multiSummary.totalScanned} Pairs",
                                color = if (multiSummary.setupsFound > 0) BullGreen else TextMuted,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        if (multiSummary.alertsGenerated.isEmpty()) {
                            Text(
                                text = "All ${multiSummary.totalScanned} scanned markets currently in neutral / equilibrium consolidation. No high-confidence setups.",
                                color = TextSecondary,
                                fontSize = 11.sp
                            )
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                multiSummary.alertsGenerated.forEach { alert ->
                                    val isBull = alert.direction == "BULLISH"
                                    Surface(
                                        color = SurfaceCard,
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                engine.selectPair(currentUser, alert.pair)
                                            }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Box(
                                                    modifier = Modifier
                                                        .clip(RoundedCornerShape(4.dp))
                                                        .background(if (isBull) BullGreenBg else BearRedBg)
                                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                                ) {
                                                    Text(
                                                        text = if (isBull) "BUY" else "SELL",
                                                        color = if (isBull) BullGreen else BearRed,
                                                        fontSize = 9.sp,
                                                        fontWeight = FontWeight.ExtraBold
                                                    )
                                                }
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text(
                                                    text = "${alert.pair} (${alert.timeframe})",
                                                    color = TextPrimary,
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }

                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text(
                                                    text = "Entry: ${alert.entryZone}",
                                                    color = TextSecondary,
                                                    fontSize = 10.sp
                                                )
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text(
                                                    text = "1:${alert.riskRewardRatio}",
                                                    color = AccentGold,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Icon(
                                                    imageVector = Icons.Default.ChevronRight,
                                                    contentDescription = "View",
                                                    tint = TextMuted,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // --- 2. Dynamic Market / Feed Status (Focused Pair) ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("dynamic_market_status_card"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("FOCUSED SYMBOL", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = settings.selectedPair,
                                color = TextPrimary,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text("CURRENT RATE", color = TextMuted, fontSize = 10.sp)
                            val priceStr = telemetry?.currentPrice?.let {
                                if (settings.selectedPair.endsWith("JPY")) String.format(Locale.US, "%.3f", it)
                                else String.format(Locale.US, "%.5f", it)
                            } ?: "UNAVAILABLE"
                            Text(
                                text = priceStr,
                                color = if (priceStr == "UNAVAILABLE") TextMuted else AccentGold,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    if (scanError != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            color = BearRedBg,
                            shape = RoundedCornerShape(6.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, BearRed.copy(alpha = 0.5f))
                        ) {
                            Text(
                                text = "Provider Error: $scanError",
                                color = BearRed,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }
                }
            }
        }

        // --- Scan & Next-Candle Outcome Action Controls ---
        item {
            val isMulti = settings.activePairs.size > 1
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = {
                        coroutineScope.launch {
                            isScanning = true
                            scanError = null
                            if (isMulti) {
                                engine.performMultiScan()
                            } else {
                                val res = engine.performScan(isPolling = false)
                                if (res.isFailure) {
                                    scanError = res.exceptionOrNull()?.message
                                }
                            }
                            isScanning = false
                        }
                    },
                    modifier = Modifier
                        .weight(1.3f)
                        .height(46.dp)
                        .testTag("manual_scan_button"),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                    shape = RoundedCornerShape(8.dp),
                    enabled = !isScanning
                ) {
                    if (isScanning) {
                        CircularProgressIndicator(
                            color = BgDark,
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isMulti) "ANALYZING ${settings.activePairs.size} MARKETS..." else "ANALYZING...",
                            color = BgDark,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    } else {
                        Icon(imageVector = Icons.Default.Search, contentDescription = "Scan", tint = BgDark)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (isMulti) "SCAN ALL (${settings.activePairs.size} MARKETS)" else "SCAN & ALERT (${settings.selectedPair})",
                            color = BgDark,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                }

                Button(
                    onClick = {
                        coroutineScope.launch {
                            isEvaluatingOutcome = true
                            if (isMulti) {
                                engine.evaluateAllNextCandles()
                            } else {
                                engine.evaluateNextCandleOutcome()
                            }
                            isEvaluatingOutcome = false
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp)
                        .testTag("evaluate_next_candle_btn"),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentGold),
                    shape = RoundedCornerShape(8.dp),
                    enabled = !isEvaluatingOutcome && (telemetry?.alert != null || (multiSummary?.setupsFound ?: 0) > 0)
                ) {
                    if (isEvaluatingOutcome) {
                        CircularProgressIndicator(
                            color = BgDark,
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("EVALUATING...", color = BgDark, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                    } else {
                        Icon(imageVector = Icons.Default.Speed, contentDescription = "Outcome", tint = BgDark)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(if (isMulti) "EVALUATE ALL" else "NEXT CANDLE", color = BgDark, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                    }
                }
            }
        }

        // --- Next Candle Outcome Banner (WIN / LOSS) ---
        if (lastOutcome != null) {
            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("next_candle_outcome_banner"),
                    color = if (lastOutcome.result == "WIN") BullGreenBg else BearRedBg,
                    shape = RoundedCornerShape(10.dp),
                    border = androidx.compose.foundation.BorderStroke(
                        1.5.dp,
                        if (lastOutcome.result == "WIN") BullGreen else BearRed
                    )
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = if (lastOutcome.result == "WIN") Icons.Default.CheckCircle else Icons.Default.Cancel,
                                    contentDescription = "Result",
                                    tint = if (lastOutcome.result == "WIN") BullGreen else BearRed,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "NEXT CANDLE OUTCOME: ${lastOutcome.result}",
                                    color = if (lastOutcome.result == "WIN") BullGreen else BearRed,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black
                                )
                            }

                            Text(
                                text = lastOutcome.recordedAtUtc,
                                color = TextSecondary,
                                fontSize = 9.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Pair: ${lastOutcome.pair} | Signal: ${lastOutcome.direction} | Setup: ${lastOutcome.setupId}",
                            color = TextPrimary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (lastOutcome.entryPrice > 0.0) {
                            Text(
                                text = "Entry: ${String.format(Locale.US, "%.5f", lastOutcome.entryPrice)} → Next Close: ${String.format(Locale.US, "%.5f", lastOutcome.exitPrice)}",
                                color = TextSecondary,
                                fontSize = 10.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.Send,
                                    contentDescription = "TG Alert",
                                    tint = if (lastOutcome.telegramDispatched) BullGreen else TextMuted,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Telegram Dispatched", color = TextSecondary, fontSize = 9.sp)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Email,
                                    contentDescription = "Email Alert",
                                    tint = if (lastOutcome.emailDispatched) BullGreen else TextMuted,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Email Dispatched", color = TextSecondary, fontSize = 9.sp)
                            }
                        }
                    }
                }
            }
        }

        // --- 3. Active Decision Alert Card (MANUAL_ALERT ONLY) ---
        item {
            val alert = telemetry?.alert
            if (alert != null) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("active_decision_alert_card"),
                    color = SurfaceDark,
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(
                        1.5.dp,
                        if (alert.direction == "BULLISH") BullGreen.copy(alpha = 0.6f) else BearRed.copy(alpha = 0.6f)
                    )
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (alert.direction == "BULLISH") BullGreenBg else BearRedBg)
                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Text(
                                        text = alert.direction,
                                        color = if (alert.direction == "BULLISH") BullGreen else BearRed,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = alert.pair + " (" + alert.timeframe + ")",
                                    color = TextPrimary,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Text(
                                text = "Setup: ${alert.setupId}",
                                color = TextMuted,
                                fontSize = 10.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Entry Zone", color = TextMuted, fontSize = 10.sp)
                                Text(alert.entryZone, color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("Stop Loss", color = TextMuted, fontSize = 10.sp)
                                Text(
                                    if (alert.pair.endsWith("JPY")) String.format(Locale.US, "%.3f", alert.stopLoss)
                                    else String.format(Locale.US, "%.5f", alert.stopLoss),
                                    color = BearRed,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Column {
                                Text("Take Profit", color = TextMuted, fontSize = 10.sp)
                                Text(
                                    if (alert.pair.endsWith("JPY")) String.format(Locale.US, "%.3f", alert.takeProfit)
                                    else String.format(Locale.US, "%.5f", alert.takeProfit),
                                    color = BullGreen,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("R:R Ratio", color = TextMuted, fontSize = 10.sp)
                                Text("1:${alert.riskRewardRatio}", color = AccentGold, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        HorizontalDivider(color = BorderDark, thickness = 0.5.dp)
                        Spacer(modifier = Modifier.height(8.dp))

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = "Manual Notice",
                                tint = PrimaryCyan,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "FINAL ACTION: ${alert.finalAction.name} — ${alert.nonExecutionNotice}",
                                color = PrimaryCyan,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        // --- 4. Authoritative Validation Badges Grid ---
        item {
            val badges = telemetry?.validationBadges
            Column(modifier = Modifier.fillMaxWidth().testTag("validation_badges_section")) {
                Text(
                    text = "VALIDATION TELEMETRY (FIELD-BOUND)",
                    color = TextMuted,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
                Spacer(modifier = Modifier.height(8.dp))

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ValidationBadgeItem(
                        title = "Break of Structure (BOS)",
                        status = badges?.bosLabel ?: "INCONCLUSIVE",
                        detail = "Authoritative structural break verification"
                    )
                    ValidationBadgeItem(
                        title = "Change of Character (CHoCH)",
                        status = if (badges?.chochDetected == true) "PASS" else "FAIL",
                        detail = "Trend transition signature"
                    )
                    ValidationBadgeItem(
                        title = "Fair Value Gap (FVG)",
                        status = badges?.fvgStatus ?: "INCONCLUSIVE",
                        detail = "3-candle price displacement gap"
                    )
                    ValidationBadgeItem(
                        title = "Inversion FVG (IFVG)",
                        status = badges?.ifvgStatus ?: "INCONCLUSIVE",
                        detail = "Displaced gap reclamation"
                    )
                    ValidationBadgeItem(
                        title = "Balanced Price Range (BPR)",
                        status = badges?.bprStatus ?: "INCONCLUSIVE",
                        detail = "Overlap equilibrium balance"
                    )
                    ValidationBadgeItem(
                        title = "Order Block (OB)",
                        status = badges?.obStatus ?: "INCONCLUSIVE",
                        detail = "Institutional mitigation origin"
                    )
                    ValidationBadgeItem(
                        title = "Breaker Block",
                        status = badges?.breakerStatus ?: "INCONCLUSIVE",
                        detail = "Failed order block retest"
                    )
                    ValidationBadgeItem(
                        title = "Liquidity Pool (BSL / SSL)",
                        status = badges?.liquidityStatus ?: "INCONCLUSIVE",
                        detail = "Buy/Sell side liquidity sweep"
                    )
                    ValidationBadgeItem(
                        title = "Equilibrium (Fib 50%)",
                        status = badges?.fibStatus ?: "INCONCLUSIVE",
                        detail = "Premium / Discount boundary"
                    )
                    ValidationBadgeItem(
                        title = "Optimal Trade Entry (OTE)",
                        status = badges?.oteStatus ?: "INCONCLUSIVE",
                        detail = "0.620 - 0.790 golden retracement"
                    )
                    ValidationBadgeItem(
                        title = "Wick Ratio Check",
                        status = badges?.wickStatus ?: "INCONCLUSIVE",
                        detail = "Exact boundary: <= 0.500 PASS (Current: ${badges?.wickRatio ?: 0.0})"
                    )
                    ValidationBadgeItem(
                        title = "Momentum Threshold",
                        status = badges?.momentumStatus ?: "INCONCLUSIVE",
                        detail = "Institutional candle volume delta"
                    )
                    ValidationBadgeItem(
                        title = "Kill-Zone Session Guard",
                        status = badges?.killZoneStatus ?: "INCONCLUSIVE",
                        detail = "London / NY open timing filter"
                    )
                    ValidationBadgeItem(
                        title = "News Guard Filter",
                        status = badges?.newsGuardStatus ?: "PASS",
                        detail = "High-impact event buffer"
                    )
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
