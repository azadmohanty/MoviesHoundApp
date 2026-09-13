package com.hologram.downloader.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hologram.downloader.ui.theme.*
import com.hologram.downloader.ui.viewmodel.MeViewModel

@Composable
fun MeScreen(
    viewModel: MeViewModel
) {
    val context = LocalContext.current
    val testUrl by viewModel.testUrl.collectAsState()
    val testResult by viewModel.testResult.collectAsState()
    val isTesting by viewModel.isTesting.collectAsState()
    val domainPings by viewModel.domainPings.collectAsState()
    val prefs by viewModel.preferences.collectAsState()
    val watchlist by viewModel.watchlist.collectAsState()
    val searchHistory by viewModel.searchHistory.collectAsState()

    var showSettingsDialog by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepVoid)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 90.dp)
        ) {
            // Header
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Tune,
                            contentDescription = null,
                            tint = ElectricIndigoLight,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "SYSTEM & DIAGNOSTICS",
                            color = TextPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.sp
                        )
                    }

                    IconButton(
                        onClick = { showSettingsDialog = true },
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(DarkSlateGlass)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Preferences",
                            tint = TextPrimary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // SECTION 1: LINK TESTER SCRATCHPAD
            item {
                SectionHeader(
                    title = "LINK TESTER & UNMASKER",
                    subtitle = "Paste raw Vega, MoviesMod, or locker link to inspect and resolve"
                )

                Card(
                    colors = CardDefaults.cardColors(containerColor = DarkSlateGlass),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .border(1.dp, SubtleBorder, RoundedCornerShape(10.dp))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        TextField(
                            value = testUrl,
                            onValueChange = { viewModel.setTestUrl(it) },
                            placeholder = { Text("https://new2.vegamovies... or vcloud URL", color = TextMuted, fontSize = 12.sp) },
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = DarkSlateElevated,
                                unfocusedContainerColor = DarkSlateElevated,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary,
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        Button(
                            onClick = { viewModel.testLink(context) },
                            enabled = !isTesting && testUrl.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = ElectricIndigo),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (isTesting) {
                                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("RESOLVING LINK...", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            } else {
                                Icon(Icons.Default.Bolt, null, tint = VegaYellow, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("TEST & UNMASK STREAM", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (!testResult.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(DarkSlateElevated)
                                    .padding(10.dp)
                            ) {
                                Column {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(text = "DIAGNOSTIC OUTPUT", color = TextMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                        IconButton(
                                            onClick = {
                                                val cb = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                                cb.setPrimaryClip(ClipData.newPlainText("Resolved URL", testResult))
                                                Toast.makeText(context, "Copied to clipboard!", Toast.LENGTH_SHORT).show()
                                            },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(Icons.Default.ContentCopy, null, tint = TextSecondary, modifier = Modifier.size(14.dp))
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = testResult!!,
                                        color = if (testResult!!.startsWith("SUCCESS")) EmeraldGreen else AmberWarning,
                                        fontSize = 11.sp,
                                        lineHeight = 16.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // SECTION 2: MIRROR & DOMAIN HEALTH INSPECTOR
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SectionHeader(
                        title = "MIRROR HEALTH INSPECTOR",
                        subtitle = "Real-time latency metrics for scraping endpoints"
                    )

                    IconButton(onClick = { viewModel.pingAllDomains() }) {
                        Icon(Icons.Default.Refresh, null, tint = TextSecondary, modifier = Modifier.size(18.dp))
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    domainPings.forEach { (name, ping) ->
                        DomainPingCard(name = name, latencyMs = ping)
                    }
                }
            }

            // SECTION 3: WATCHLIST & HISTORY
            item {
                Spacer(modifier = Modifier.height(16.dp))
                SectionHeader(
                    title = "SAVED WATCHLIST (${watchlist.size})",
                    subtitle = "Bookmarked items for quick access"
                )

                if (watchlist.isEmpty()) {
                    Text(
                        text = "No bookmarked movies yet. Tap bookmark on any movie to save.",
                        color = TextMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                } else {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(watchlist) { title ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(DarkSlateGlass)
                                    .border(1.dp, SubtleBorder, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Text(text = title, color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            // Search History Tags
            item {
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    SectionHeader(
                        title = "RECENT SEARCHES",
                        subtitle = "Previous queries executed"
                    )

                    if (searchHistory.isNotEmpty()) {
                        TextButton(onClick = { viewModel.clearSearchHistory() }) {
                            Text("CLEAR", color = CrimsonError, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (searchHistory.isEmpty()) {
                    Text(
                        text = "Search history is clean.",
                        color = TextMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                } else {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(searchHistory) { tag ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(DarkSlateGlass)
                                    .border(1.dp, SubtleBorder, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(text = tag, color = TextSecondary, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }

        // Settings Dialog
        if (showSettingsDialog) {
            AlertDialog(
                onDismissRequest = { showSettingsDialog = false },
                containerColor = DarkSlateGlass,
                title = { Text("App Preferences", color = TextPrimary, fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(text = "Default Quality Preference", color = TextSecondary, fontSize = 12.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("480p", "720p", "1080p").forEach { q ->
                                val isSel = prefs.defaultQuality == q
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(if (isSel) ElectricIndigo else DarkSlateElevated)
                                        .clickable { viewModel.updatePreferences(prefs.copy(defaultQuality = q)) }
                                        .padding(horizontal = 14.dp, vertical = 6.dp)
                                ) {
                                    Text(text = q, color = if (isSel) TextPrimary else TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        HorizontalDivider(color = SubtleBorder)

                        Text(text = "Scraper Timeout: ${prefs.scraperTimeoutMs / 1000}s", color = TextSecondary, fontSize = 12.sp)
                        Slider(
                            value = (prefs.scraperTimeoutMs / 1000).toFloat(),
                            onValueChange = { viewModel.updatePreferences(prefs.copy(scraperTimeoutMs = (it * 1000).toLong())) },
                            valueRange = 4f..15f,
                            steps = 11,
                            colors = SliderDefaults.colors(thumbColor = ElectricIndigo, activeTrackColor = ElectricIndigo)
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showSettingsDialog = false }) {
                        Text("DONE", color = ElectricIndigoLight, fontWeight = FontWeight.Bold)
                    }
                }
            )
        }
    }
}

@Composable
fun DomainPingCard(name: String, latencyMs: Long?) {
    val statusColor = when {
        latencyMs == null -> CrimsonError
        latencyMs < 500 -> EmeraldGreen
        latencyMs < 1200 -> AmberWarning
        else -> CrimsonError
    }

    val statusText = when {
        latencyMs == null -> "OFFLINE / BLOCKED"
        else -> "${latencyMs} ms"
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = DarkSlateGlass),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, SubtleBorder, RoundedCornerShape(8.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(statusColor)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = name,
                    color = TextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Text(
                text = statusText,
                color = statusColor,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
