package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.engine.ComVisionEngine
import com.example.model.UserRecord
import com.example.model.UserRole
import com.example.model.UserStatus
import com.example.ui.screens.AdminScreen
import com.example.ui.screens.AnalyticsScreen
import com.example.ui.screens.DashboardScreen
import com.example.ui.screens.VisionScreen
import com.example.ui.theme.*
import kotlinx.coroutines.launch

enum class Screen(val title: String, val icon: ImageVector, val tag: String) {
    DASHBOARD("Dashboard", Icons.Default.Dashboard, "nav_dashboard"),
    VISION("Vision", Icons.Default.RemoveRedEye, "nav_vision"),
    ANALYTICS("Analytics", Icons.Default.Analytics, "nav_analytics"),
    ADMIN("Admin & Alerts", Icons.Default.AdminPanelSettings, "nav_admin")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainApp(
    engine: ComVisionEngine,
    modifier: Modifier = Modifier
) {
    var currentScreen by remember { mutableStateOf(Screen.DASHBOARD) }
    val users = engine.getUsers()
    var currentUserIndex by remember { mutableIntStateOf(0) }
    val currentUser = users[currentUserIndex]
    val coroutineScope = rememberCoroutineScope()

    // Trigger initial scan on first launch
    LaunchedEffect(Unit) {
        engine.performScan()
    }

    Scaffold(
        modifier = modifier.fillMaxSize().background(BgDark),
        containerColor = BgDark,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "ComVision",
                            color = PrimaryCyan,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.5.sp
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(AccentGold.copy(alpha = 0.2f))
                                .padding(horizontal = 5.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "v2.0",
                                color = AccentGold,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                },
                actions = {
                    // Pair Badge
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(SurfaceCard)
                            .border(1.dp, BorderDark, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = engine.settings.selectedPair,
                            color = PrimaryCyan,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    // Switch User Role button (for testing RBAC)
                    IconButton(
                        onClick = {
                            currentUserIndex = (currentUserIndex + 1) % users.size
                        },
                        modifier = Modifier.testTag("switch_user_role_btn")
                    ) {
                        Icon(
                            imageVector = if (currentUser.role == UserRole.ADMIN) Icons.Default.Shield else Icons.Default.Person,
                            contentDescription = "Switch User Role",
                            tint = if (currentUser.role == UserRole.ADMIN) AccentGold else PrimaryCyan
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = SurfaceDark
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = SurfaceDark,
                tonalElevation = 8.dp,
                modifier = Modifier.border(0.5.dp, BorderDark, RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
            ) {
                Screen.values().forEach { screen ->
                    val isSelected = currentScreen == screen
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = { currentScreen = screen },
                        icon = {
                            Icon(
                                imageVector = screen.icon,
                                contentDescription = screen.title,
                                tint = if (isSelected) PrimaryCyan else TextMuted
                            )
                        },
                        label = {
                            Text(
                                text = screen.title,
                                color = if (isSelected) PrimaryCyan else TextMuted,
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = SurfaceCard
                        ),
                        modifier = Modifier.testTag(screen.tag)
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (currentScreen) {
                Screen.DASHBOARD -> DashboardScreen(engine = engine, currentUser = currentUser)
                Screen.VISION -> VisionScreen(engine = engine)
                Screen.ANALYTICS -> AnalyticsScreen(engine = engine)
                Screen.ADMIN -> AdminScreen(engine = engine, currentUser = currentUser)
            }
        }
    }
}
