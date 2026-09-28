package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import com.example.ui.theme.*
import java.util.Locale

@Composable
fun AnalyticsScreen(
    engine: ComVisionEngine,
    modifier: Modifier = Modifier
) {
    var selectedPairFilter by remember { mutableStateOf("ALL") }
    var showRecordDialog by remember { mutableStateOf(false) }
    var targetSetupId by remember { mutableStateOf<String?>(null) }
    var targetPair by remember { mutableStateOf<String?>(null) }
    var selectedOutcomeResult by remember { mutableStateOf("WIN") }
    var outcomeNotes by remember { mutableStateOf("") }

    val filterOptions = listOf("ALL") + PairCatalog.SUPPORTED_PAIRS + listOf("UNKNOWN")
    val setups = engine.getSetupsFiltered(if (selectedPairFilter == "ALL") null else selectedPairFilter)
    val outcomes = engine.getOutcomes()

    val totalOutcomes = outcomes.size
    val wins = outcomes.count { it.result == "WIN" }
    val winRate = if (totalOutcomes > 0) (wins.toDouble() / totalOutcomes) * 100.0 else 0.0

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            // Research Performance Stats Summary
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("analytics_stats_card"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "RESEARCH DECISION-SUPPORT METRICS",
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
                            Text("Total Setups", color = TextMuted, fontSize = 10.sp)
                            Text("${engine.getSetups().size}", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                        Column {
                            Text("Recorded Outcomes", color = TextMuted, fontSize = 10.sp)
                            Text("$totalOutcomes", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                        Column {
                            Text("Hypothetical Win Rate", color = TextMuted, fontSize = 10.sp)
                            Text(
                                text = if (totalOutcomes > 0) "${String.format(Locale.US, "%.1f", winRate)}%" else "NO DATA",
                                color = if (winRate >= 50) BullGreen else WarningAmber,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Risk : Reward", color = TextMuted, fontSize = 10.sp)
                            Text("1:2.0", color = AccentGold, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // --- Canonical Pair Filter Chips ---
        item {
            Column {
                Text(
                    text = "FILTER BY CANONICAL PAIR",
                    color = TextMuted,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth().testTag("analytics_pair_filter_row")
                ) {
                    items(filterOptions) { filter ->
                        val isSelected = filter == selectedPairFilter
                        FilterChip(
                            selected = isSelected,
                            onClick = { selectedPairFilter = filter },
                            label = { Text(text = filter, fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryCyan,
                                selectedLabelColor = BgDark,
                                containerColor = SurfaceCard,
                                labelColor = TextSecondary
                            )
                        )
                    }
                }
            }
        }

        // --- Setup History List ---
        item {
            Text(
                text = "SETUP ARCHIVE & LINKED OUTCOMES (${setups.size})",
                color = TextMuted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp
            )
        }

        if (setups.isEmpty()) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = SurfaceDark,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Box(modifier = Modifier.padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(
                            text = "No recorded setups for filter '$selectedPairFilter'",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        } else {
            items(setups) { setup ->
                val linkedOutcome = outcomes.find { it.setupId == setup.setupId }
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("setup_history_item_${setup.setupId}"),
                    color = SurfaceDark,
                    shape = RoundedCornerShape(10.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = setup.pair,
                                    color = if (setup.pair == "UNKNOWN") TextMuted else TextPrimary,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "(${setup.timeframe})",
                                    color = TextSecondary,
                                    fontSize = 12.sp
                                )
                            }

                            Text(
                                text = setup.setupId,
                                color = TextMuted,
                                fontSize = 10.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = setup.generatedAtUtc,
                                color = TextMuted,
                                fontSize = 10.sp
                            )

                            if (linkedOutcome != null) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (linkedOutcome.result == "WIN") BullGreenBg else BearRedBg)
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "OUTCOME: ${linkedOutcome.result}",
                                        color = if (linkedOutcome.result == "WIN") BullGreen else BearRed,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            } else {
                                Button(
                                    onClick = {
                                        targetSetupId = setup.setupId
                                        targetPair = setup.pair
                                        showRecordDialog = true
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceCard),
                                    shape = RoundedCornerShape(6.dp),
                                    modifier = Modifier.height(28.dp).testTag("record_outcome_btn_${setup.setupId}")
                                ) {
                                    Text("RECORD OUTCOME", color = PrimaryCyan, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }

    // Record Outcome Dialog
    if (showRecordDialog && targetSetupId != null) {
        AlertDialog(
            onDismissRequest = { showRecordDialog = false },
            title = { Text("Record Research Outcome", color = TextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Setup ID: $targetSetupId", color = TextSecondary, fontSize = 12.sp)
                    Text("Pair: $targetPair", color = TextSecondary, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Outcome Result:", color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("WIN", "LOSS", "BREAKEVEN").forEach { res ->
                            FilterChip(
                                selected = selectedOutcomeResult == res,
                                onClick = { selectedOutcomeResult = res },
                                label = { Text(res) }
                            )
                        }
                    }
                    OutlinedTextField(
                        value = outcomeNotes,
                        onValueChange = { outcomeNotes = it },
                        label = { Text("Research Notes (optional)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        engine.recordOutcome(
                            setupId = targetSetupId!!,
                            pair = targetPair ?: "UNKNOWN",
                            result = selectedOutcomeResult,
                            notes = outcomeNotes
                        )
                        showRecordDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan)
                ) {
                    Text("Save Outcome", color = BgDark, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRecordDialog = false }) {
                    Text("Cancel", color = TextSecondary)
                }
            }
        )
    }
}
