package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import com.example.engine.notification.TestResult
import com.example.model.*
import com.example.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun AdminScreen(
    engine: ComVisionEngine,
    currentUser: UserRecord,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    val notifService = engine.notificationService
    var notifStatus by remember { mutableStateOf(notifService.getStatus()) }
    var testResultFeedback by remember { mutableStateOf<TestResult?>(null) }
    var userActionFeedback by remember { mutableStateOf<String?>(null) }

    // Dialog state for configuring Telegram & Email
    var showTelegramConfigDialog by remember { mutableStateOf(false) }
    var showEmailConfigDialog by remember { mutableStateOf(false) }

    var inputBotToken by remember { mutableStateOf("") }
    var inputChatId by remember { mutableStateOf("") }
    var inputEmailRecipient by remember { mutableStateOf("") }
    var inputSmtpPassword by remember { mutableStateOf("") }

    val auditLogs = engine.getAuditLogs()
    val userList = engine.getUsers()

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(4.dp))
            // Current User Session & RBAC Badge
            Surface(
                modifier = Modifier.fillMaxWidth().testTag("rbac_session_card"),
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
                        Text("ACTIVE USER", color = TextMuted, fontSize = 10.sp)
                        Text(currentUser.name, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(currentUser.email, color = TextSecondary, fontSize = 11.sp)
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (currentUser.role == UserRole.ADMIN) AccentGold.copy(alpha = 0.2f) else PrimaryCyan.copy(alpha = 0.2f))
                            .border(1.dp, if (currentUser.role == UserRole.ADMIN) AccentGold else PrimaryCyan, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "ROLE: ${currentUser.role.name}",
                            color = if (currentUser.role == UserRole.ADMIN) AccentGold else PrimaryCyan,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // --- Notification Channels Status Panel ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("notification_status_panel"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "NOTIFICATION DISPATCH & CREDENTIAL ISOLATION",
                        color = TextMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    // Telegram Channel
                    Surface(
                        color = SurfaceCard,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().testTag("telegram_channel_card")
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(imageVector = Icons.AutoMirrored.Filled.Send, contentDescription = "Telegram", tint = PrimaryCyan, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Telegram Alerts (Signal + Win/Loss)", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                }
                                Text(
                                    text = if (notifStatus.telegramConfigured) "CONFIGURED" else "NOT CONFIGURED",
                                    color = if (notifStatus.telegramConfigured) BullGreen else WarningAmber,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Target Chat ID: ${notifStatus.telegramMaskedChatId ?: "None (Click configure to set)"}",
                                color = TextSecondary,
                                fontSize = 11.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        coroutineScope.launch {
                                            val result = notifService.sendTelegramMessage("<b>ComVision v2.0</b>: Test alert connection verified.")
                                            testResultFeedback = result
                                            notifStatus = notifService.getStatus()
                                            engine.recordAudit(currentUser.email, "TELEGRAM_TEST", "Result: ${result.message} (Code: ${result.sanitizedErrorCode})")
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                                    shape = RoundedCornerShape(6.dp),
                                    modifier = Modifier.height(30.dp).testTag("test_telegram_btn")
                                ) {
                                    Text("TEST TELEGRAM", color = BgDark, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }

                                if (currentUser.role == UserRole.ADMIN) {
                                    OutlinedButton(
                                        onClick = { showTelegramConfigDialog = true },
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.height(30.dp).testTag("configure_telegram_btn")
                                    ) {
                                        Text("CONFIGURE", color = PrimaryCyan, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Email Channel
                    Surface(
                        color = SurfaceCard,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().testTag("email_channel_card")
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(imageVector = Icons.Default.Email, contentDescription = "Email", tint = AccentGold, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Email Alerts (Signal + Win/Loss)", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                }
                                Text(
                                    text = if (notifStatus.emailConfigured) "CONFIGURED" else "NOT CONFIGURED",
                                    color = if (notifStatus.emailConfigured) BullGreen else WarningAmber,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Recipient: ${notifStatus.emailMaskedRecipient ?: "Unconfigured"} | Host: ${notifStatus.smtpHost ?: "N/A"}",
                                color = TextSecondary,
                                fontSize = 11.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = {
                                        val result = notifService.testEmail(currentUser)
                                        testResultFeedback = result
                                        notifStatus = notifService.getStatus()
                                        engine.recordAudit(currentUser.email, "EMAIL_TEST", "Result: ${result.message} (Code: ${result.sanitizedErrorCode})")
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentGold),
                                    shape = RoundedCornerShape(6.dp),
                                    modifier = Modifier.height(30.dp).testTag("test_email_btn")
                                ) {
                                    Text("TEST EMAIL", color = BgDark, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }

                                if (currentUser.role == UserRole.ADMIN) {
                                    OutlinedButton(
                                        onClick = { showEmailConfigDialog = true },
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.height(30.dp).testTag("configure_email_btn")
                                    ) {
                                        Text("CONFIGURE", color = AccentGold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }

                    if (testResultFeedback != null) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            color = if (testResultFeedback!!.success) BullGreenBg else BearRedBg,
                            shape = RoundedCornerShape(6.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, if (testResultFeedback!!.success) BullGreen else BearRed)
                        ) {
                            Text(
                                text = "Result: ${testResultFeedback!!.message}",
                                color = if (testResultFeedback!!.success) BullGreen else BearRed,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }
                }
            }
        }

        // --- User Management (Admin Only) ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("user_management_panel"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "USER MANAGEMENT & RBAC LIFECYCLE",
                        color = TextMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    if (currentUser.role != UserRole.ADMIN) {
                        Text(
                            text = "RBAC Policy: User management and role assignment are restricted to ADMIN accounts only.",
                            color = WarningAmber,
                            fontSize = 11.sp
                        )
                    } else {
                        userList.forEach { user ->
                            Surface(
                                color = SurfaceCard,
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .testTag("user_row_${user.userId}")
                            ) {
                                Row(
                                    modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(user.name, color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        Text("${user.email} (${user.role})", color = TextSecondary, fontSize = 10.sp)
                                    }

                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(when (user.status) {
                                                    UserStatus.APPROVED -> BullGreenBg
                                                    UserStatus.PENDING -> WarningAmberBg
                                                    else -> BearRedBg
                                                })
                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                        ) {
                                            Text(
                                                text = user.status.name,
                                                color = when (user.status) {
                                                    UserStatus.APPROVED -> BullGreen
                                                    UserStatus.PENDING -> WarningAmber
                                                    else -> BearRed
                                                },
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }

                                        if (user.userId != currentUser.userId) {
                                            Button(
                                                onClick = {
                                                    val newStatus = if (user.status == UserStatus.APPROVED) UserStatus.SUSPENDED else UserStatus.APPROVED
                                                    val res = engine.updateUserStatus(currentUser, user.userId, newStatus)
                                                    userActionFeedback = res.getOrNull()
                                                },
                                                colors = ButtonDefaults.buttonColors(containerColor = SurfaceDark),
                                                shape = RoundedCornerShape(4.dp),
                                                modifier = Modifier.height(24.dp).testTag("toggle_status_btn_${user.userId}")
                                            ) {
                                                Text(
                                                    text = if (user.status == UserStatus.APPROVED) "SUSPEND" else "APPROVE",
                                                    color = PrimaryCyan,
                                                    fontSize = 8.sp,
                                                    fontWeight = FontWeight.Bold
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

        // --- Audit Log Viewer ---
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("audit_log_viewer_panel"),
                color = SurfaceDark,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderDark)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "AUDIT TRAIL LOG (${auditLogs.size})",
                        color = TextMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    auditLogs.take(15).forEach { log ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = log.action,
                                    color = PrimaryCyan,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = log.timestampUtc,
                                    color = TextMuted,
                                    fontSize = 9.sp
                                )
                            }
                            Text(
                                text = "Actor: ${log.actor} — ${log.details}",
                                color = TextSecondary,
                                fontSize = 10.sp
                            )
                            HorizontalDivider(color = BorderDark, thickness = 0.5.dp, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(16.dp))
        }
    }

    // --- Telegram Config Dialog ---
    if (showTelegramConfigDialog) {
        AlertDialog(
            onDismissRequest = { showTelegramConfigDialog = false },
            title = { Text("Configure Telegram Bot", color = TextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Enter your Telegram Bot Token from @BotFather and your Target Chat ID.", color = TextSecondary, fontSize = 11.sp)
                    OutlinedTextField(
                        value = inputBotToken,
                        onValueChange = { inputBotToken = it },
                        label = { Text("Bot Token (e.g. 123456:ABC-DEF...)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = inputChatId,
                        onValueChange = { inputChatId = it },
                        label = { Text("Chat ID (e.g. -100123456789 or 98765432)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val res = notifService.updateTelegramConfig(currentUser, inputBotToken, inputChatId)
                        if (res.isSuccess) {
                            notifStatus = notifService.getStatus()
                            engine.recordAudit(currentUser.email, "TELEGRAM_CONFIG_UPDATE", "Chat ID updated to ${notifService.maskChatId(inputChatId)}")
                        }
                        showTelegramConfigDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan)
                ) {
                    Text("Save Telegram Config", color = BgDark, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showTelegramConfigDialog = false }) {
                    Text("Cancel", color = TextSecondary)
                }
            }
        )
    }

    // --- Email Config Dialog ---
    if (showEmailConfigDialog) {
        AlertDialog(
            onDismissRequest = { showEmailConfigDialog = false },
            title = { Text("Configure Email SMTP", color = TextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Enter recipient address and SMTP App Password for automated alerts.", color = TextSecondary, fontSize = 11.sp)
                    OutlinedTextField(
                        value = inputEmailRecipient,
                        onValueChange = { inputEmailRecipient = it },
                        label = { Text("Recipient Email (e.g. trader@gmail.com)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = inputSmtpPassword,
                        onValueChange = { inputSmtpPassword = it },
                        label = { Text("SMTP App Password") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val res = notifService.updateEmailConfig(currentUser, inputEmailRecipient, inputSmtpPassword)
                        if (res.isSuccess) {
                            notifStatus = notifService.getStatus()
                            engine.recordAudit(currentUser.email, "EMAIL_CONFIG_UPDATE", "Recipient updated to ${notifService.maskEmail(inputEmailRecipient)}")
                        }
                        showEmailConfigDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = AccentGold)
                ) {
                    Text("Save Email Config", color = BgDark, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showEmailConfigDialog = false }) {
                    Text("Cancel", color = TextSecondary)
                }
            }
        )
    }
}
