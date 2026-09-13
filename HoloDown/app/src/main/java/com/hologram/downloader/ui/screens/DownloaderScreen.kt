package com.hologram.downloader.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.hologram.downloader.data.models.CategoryType
import com.hologram.downloader.data.models.DownloadStatus
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.ui.components.*
import com.hologram.downloader.ui.theme.*
import com.hologram.downloader.ui.viewmodel.DownloaderViewModel
import com.hologram.downloader.utils.IntentUtils

@Composable
fun DownloaderScreen(
    viewModel: DownloaderViewModel
) {
    val context = LocalContext.current
    val query by viewModel.query.collectAsState()
    val category by viewModel.category.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()
    val isResolving by viewModel.isResolving.collectAsState()
    val rawCards by viewModel.rawCards.collectAsState()
    val activeArticle by viewModel.activeArticle.collectAsState()
    val options by viewModel.options.collectAsState()
    val allTasks by viewModel.allTasks.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()
    val safetyBrowserUrl by viewModel.safetyBrowserUrl.collectAsState()

    val activeTasks = allTasks.filter {
        it.status != DownloadStatus.COMPLETED && it.status != DownloadStatus.CANCELLED
    }
    val completedTasks = allTasks.filter { it.status == DownloadStatus.COMPLETED }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepVoid)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 90.dp)
        ) {
            // Header: Terminal Title
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HoloDownLogo(size = 24.dp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "DOWNLOADER TERMINAL",
                            color = TextPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.sp
                        )
                    }

                    if (isSearching || isResolving) {
                        CircularProgressIndicator(
                            color = VegaYellow,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // Category Chips (ALL, HOLLYWOOD, INDIAN, ANIME, ASIAN)
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(bottom = 10.dp)
                ) {
                    items(CategoryType.values()) { cat ->
                        val isSelected = category == cat
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (isSelected) ElectricIndigo else DarkSlateGlass)
                                .border(1.dp, if (isSelected) ElectricIndigoLight else SubtleBorder, RoundedCornerShape(6.dp))
                                .clickable { viewModel.setCategory(cat) }
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = cat.label,
                                color = if (isSelected) TextPrimary else TextSecondary,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                        }
                    }
                }
            }

            // Search Bar + Search Button
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = query,
                        onValueChange = { viewModel.setQuery(it) },
                        placeholder = {
                            Text(
                                text = "Search movie, series, or locker link...",
                                color = TextMuted,
                                fontSize = 13.sp
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = null,
                                tint = TextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { viewModel.setQuery(""); viewModel.resetToLayer1() }) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Clear",
                                        tint = TextSecondary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = DarkSlateGlass,
                            unfocusedContainerColor = DarkSlateGlass,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { viewModel.triggerSearch() }),
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp)
                            .border(1.dp, SubtleBorder, RoundedCornerShape(8.dp))
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    Button(
                        onClick = { viewModel.triggerSearch() },
                        colors = ButtonDefaults.buttonColors(containerColor = ElectricIndigo),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.height(50.dp)
                    ) {
                        Text(
                            text = "SEARCH",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Status message
            if (!statusMessage.isNullOrBlank()) {
                item {
                    Text(
                        text = statusMessage!!,
                        color = TextSecondary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                }
            }

            // LAYER 2: Selected Article Banner & Quality Options List
            if (activeArticle != null) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(DarkSlateElevated)
                            .border(1.dp, SubtleBorder, RoundedCornerShape(10.dp))
                            .padding(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "PARSED ARTICLE",
                                color = VegaYellow,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.sp
                            )

                            TextButton(
                                onClick = { viewModel.resetToLayer1() },
                                contentPadding = PaddingValues(0.dp)
                            ) {
                                Text(
                                    text = "← BACK TO POSTS",
                                    color = ElectricIndigoLight,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Text(
                            text = activeArticle!!.title,
                            color = TextPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2
                        )
                    }
                }

                if (isResolving) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(120.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                CircularProgressIndicator(color = ElectricIndigo, strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(text = "Unlocking quality streams...", color = TextSecondary, fontSize = 12.sp)
                            }
                        }
                    }
                }

                items(options) { opt ->
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        ScrapedOptionCard(
                            option = opt,
                            onDownloadNative = { viewModel.downloadNative(opt, context) },
                            onSendTo1DM = { viewModel.sendTo1DM(opt, context) },
                            onOpenInBrowser = {
                                try {
                                    val i = Intent(Intent.ACTION_VIEW, Uri.parse(opt.lockerUrl))
                                    context.startActivity(i)
                                } catch (_: Exception) {}
                            }
                        )
                    }
                }
            }
            // LAYER 1: Discovered Posts Cards (When No Article Selected)
            else if (rawCards.isNotEmpty()) {
                item {
                    SectionHeader(
                        title = "DISCOVERED POSTS (${rawCards.size})",
                        subtitle = "Select an article to parse verified quality links"
                    )
                }

                items(rawCards) { card ->
                    DiscoveredPostRow(
                        card = card,
                        onClick = { viewModel.selectArticle(card) }
                    )
                }
            }

            // ACTIVE DOWNLOADS SECTION
            if (activeTasks.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    SectionHeader(
                        title = "ACTIVE DOWNLOADS (${activeTasks.size})",
                        subtitle = "Resumable foreground download manager"
                    )
                }

                items(activeTasks) { task ->
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        DownloadProgressCard(
                            task = task,
                            onPause = { viewModel.pauseTask(task.id) },
                            onResume = { viewModel.resumeTask(task.id) },
                            onCancel = { viewModel.cancelTask(task.id) }
                        )
                    }
                }
            }

            // COMPLETED DOWNLOADS SECTION
            if (completedTasks.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    SectionHeader(
                        title = "COMPLETED FILES (${completedTasks.size})",
                        subtitle = "Tap to play instantly in VLC, MX Player, or Just Player"
                    )
                }

                items(completedTasks) { task ->
                    Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        CompletedDownloadCard(
                            task = task,
                            onPlay = { preferred ->
                                task.localFilePath?.let { path ->
                                    IntentUtils.playVideo(context, path, preferred)
                                }
                            },
                            onShare = {
                                task.localFilePath?.let { path ->
                                    IntentUtils.shareFile(context, path)
                                }
                            },
                            onDelete = { viewModel.deleteTask(task.id) }
                        )
                    }
                }
            }
        }

        // Tier 3: Safety-Valve Mini Browser Sheet
        safetyBrowserUrl?.let { url ->
            MiniBrowserSheet(
                url = url,
                onDismiss = { viewModel.dismissSafetyBrowser() },
                onMediaCaptured = { capturedUrl -> viewModel.onSafetyCaptured(capturedUrl) }
            )
        }
    }
}

@Composable
fun DiscoveredPostRow(
    card: ScrapedArticle,
    onClick: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = DarkSlateGlass),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .border(1.dp, SubtleBorder, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = card.posterUrl,
                contentDescription = card.title,
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(DarkSlateElevated)
            )

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = card.title,
                    color = TextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = card.siteDisplayName.uppercase(),
                        color = when (card.siteKey) {
                            "vegamovies" -> VegaYellow
                            "moviesmod" -> MoviesModCyan
                            else -> MovieBoxPink
                        },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "• ${card.confidenceScore}% MATCH",
                        color = if (card.confidenceScore >= 75) EmeraldGreen else AmberWarning,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = "Open",
                tint = TextSecondary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
