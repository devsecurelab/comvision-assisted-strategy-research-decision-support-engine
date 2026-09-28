package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.FreshnessState
import com.example.ui.theme.*

@Composable
fun StatusBadge(
    state: FreshnessState,
    modifier: Modifier = Modifier
) {
    val (bgColor, textColor, label) = when (state) {
        FreshnessState.LIVE -> Triple(BullGreenBg, BullGreen, "LIVE")
        FreshnessState.REPLAY -> Triple(ReplayPurpleBg, ReplayPurple, "REPLAY")
        FreshnessState.DEGRADED -> Triple(WarningAmberBg, WarningAmber, "DEGRADED")
        FreshnessState.STALE -> Triple(WarningAmberBg, WarningAmber, "STALE")
        FreshnessState.OFFLINE -> Triple(BearRedBg, BearRed, "OFFLINE")
        FreshnessState.UNKNOWN -> Triple(Color(0x2294A3B8), TextMuted, "UNKNOWN")
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .border(1.dp, textColor.copy(alpha = 0.5f), RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp
        )
    }
}

@Composable
fun NonExecutionNoticeBanner(
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .testTag("non_execution_banner"),
        color = Color(0x3300E5FF),
        shape = RoundedCornerShape(8.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryCyan.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Shield,
                contentDescription = "Non-Execution Guard",
                tint = PrimaryCyan,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = "MANUAL DECISION-SUPPORT & RESEARCH ENGINE",
                    color = PrimaryCyan,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
                Text(
                    text = "Non-Execution Invariant: No broker order routing or financial execution permitted.",
                    color = TextSecondary,
                    fontSize = 10.sp
                )
            }
        }
    }
}

@Composable
fun ValidationBadgeItem(
    title: String,
    status: String,
    detail: String? = null,
    modifier: Modifier = Modifier
) {
    val (statusBg, statusColor) = when (status.uppercase()) {
        "PASS" -> Pair(BullGreenBg, BullGreen)
        "FAIL" -> Pair(BearRedBg, BearRed)
        "CONTINUITY (TREND HOLDING)" -> Pair(ReplayPurpleBg, ReplayPurple)
        "INCONCLUSIVE" -> Pair(WarningAmberBg, WarningAmber)
        else -> Pair(Color(0x2294A3B8), TextSecondary)
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .testTag("badge_${title.lowercase().replace(" ", "_")}"),
        color = SurfaceCard,
        shape = RoundedCornerShape(8.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    color = TextPrimary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                if (detail != null) {
                    Text(
                        text = detail,
                        color = TextSecondary,
                        fontSize = 10.sp
                    )
                }
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(statusBg)
                    .border(1.dp, statusColor.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = status,
                    color = statusColor,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
