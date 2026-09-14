package com.hologram.downloader.ui.screens

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.hologram.downloader.data.models.CategoryType
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.scrapers.base.SeriesEpisodeItem
import com.hologram.downloader.ui.components.HoloDownLogo
import com.hologram.downloader.ui.viewmodel.DownloaderViewModel

// React-matched Color Palette
val VegaYellowColor = Color(0xFFFFE500)
val MoviesModCyanColor = Color(0xFF00E5FF)
val DeepTerminalBg = Color(0xFF0A0A0C)
val CardDarkBg = Color(0xFF121216)
val SubtleBorderColor = Color(0x1AFFFFFF)

fun getProviderThemeColor(siteKey: String?): Color {
    return when (siteKey?.lowercase()) {
        "moviesmod" -> MoviesModCyanColor
        else -> VegaYellowColor
    }
}

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

    val selectedQuality by viewModel.selectedQuality.collectAsState()
    val selectedSeason by viewModel.selectedSeason.collectAsState()
    val seriesMode by viewModel.seriesMode.collectAsState()

    val episodesLoading by viewModel.episodesLoading.collectAsState()
    val episodesList by viewModel.episodesList.collectAsState()
    val resolvingOptionId by viewModel.resolvingOptionId.collectAsState()
    val statusLogs by viewModel.statusLogs.collectAsState()

    var logsExpanded by remember { mutableStateOf(false) }

    // ───────────────────────────────────────────────────────────────────────────
    // ANDROID HARDWARE BACK BUTTON (LIFO Back Stack)
    // ───────────────────────────────────────────────────────────────────────────
    BackHandler(enabled = activeArticle != null || rawCards.isNotEmpty()) {
        if (activeArticle != null) {
            viewModel.resetToLayer1()
        } else if (rawCards.isNotEmpty()) {
            viewModel.clearSearch()
        }
    }

    // Inspect if options indicate series
    val isSeries = options.any {
        it.contentType == "SINGLE_EPISODE" || it.contentType == "SEASON_BATCH_ZIP" || it.isSeries
    }

    val availableSeasons = remember(options) {
        options.mapNotNull { it.seasonNumber }
            .filter { it in 1..99 }
            .distinct()
            .sorted()
    }

    // Filter options matching active quality & mode
    val filteredOptions = remember(options, selectedQuality, selectedSeason, seriesMode, isSeries) {
        val selQ = selectedQuality.lowercase()
        options.filter { opt ->
            val optQ = opt.qualityLabel.lowercase()
            if (optQ != selQ) return@filter false

            if (!isSeries || opt.contentType == "MOVIE") return@filter true
            if ((opt.seasonNumber ?: 1) != selectedSeason) return@filter false
            opt.contentType == seriesMode
        }
    }

    val activeSeriesOption = remember(options, selectedQuality, selectedSeason) {
        val selQ = selectedQuality.lowercase()
        options.find { opt ->
            opt.qualityLabel.lowercase() == selQ &&
            opt.contentType == "SINGLE_EPISODE" &&
            (opt.seasonNumber ?: 1) == selectedSeason
        } ?: options.find { opt ->
            opt.contentType == "SINGLE_EPISODE" && (opt.seasonNumber ?: 1) == selectedSeason
        } ?: filteredOptions.firstOrNull()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepTerminalBg)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 90.dp)
        ) {
            // ── TOP TERMINAL HEADER ──
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HoloDownLogo(size = 22.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "DOWNLOADER TERMINAL",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.2.sp
                        )
                    }

                    if (isSearching || isResolving || episodesLoading) {
                        CircularProgressIndicator(
                            color = VegaYellowColor,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            // ── CATEGORY PILLS (ALL, HOLLYWOOD, INDIAN, ANIME, ASIAN) ──
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(CategoryType.entries) { cat ->
                        val isSelected = category == cat
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (isSelected) VegaYellowColor else Color(0x0AFFFFFF))
                                .border(
                                    1.dp,
                                    if (isSelected) VegaYellowColor else SubtleBorderColor,
                                    RoundedCornerShape(6.dp)
                                )
                                .clickable { viewModel.setCategory(cat) }
                                .padding(horizontal = 14.dp, vertical = 7.dp)
                        ) {
                            Text(
                                text = cat.label,
                                color = if (isSelected) Color(0xFF0A0A0C) else Color(0x80FFFFFF),
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Bold,
                                letterSpacing = 0.8.sp
                            )
                        }
                    }
                }
            }

            // ── SEARCH BAR ROW ──
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = query,
                        onValueChange = { viewModel.setQuery(it) },
                        placeholder = {
                            Text(
                                text = "Search movie or series title...",
                                color = Color(0x4DFFFFFF),
                                fontSize = 13.sp
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = null,
                                tint = Color(0x66FFFFFF),
                                modifier = Modifier.size(16.dp)
                            )
                        },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(
                                    onClick = {
                                        viewModel.setQuery("")
                                        viewModel.resetToLayer1()
                                    }
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Clear",
                                        tint = Color(0x66FFFFFF),
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                            }
                        },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color(0x0AFFFFFF),
                            unfocusedContainerColor = Color(0x0AFFFFFF),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { viewModel.triggerSearch() }),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                            .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    Button(
                        onClick = { viewModel.triggerSearch() },
                        enabled = !isSearching,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = VegaYellowColor,
                            contentColor = Color(0xFF0A0A0C)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        modifier = Modifier.height(48.dp)
                    ) {
                        Text(
                            text = "SEARCH",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.8.sp
                        )
                    }
                }
            }

            // ──────────────────────────────────────────────────────────────────
            // LAYER 1: DISCOVERED POSTS FEED (When No Article Selected)
            // ──────────────────────────────────────────────────────────────────
            if (activeArticle == null && rawCards.isNotEmpty()) {
                item {
                    Text(
                        text = "DISCOVERED POSTS (${rawCards.size})",
                        color = Color(0x66FFFFFF),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp,
                        modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 6.dp)
                    )
                }

                items(rawCards) { card ->
                    val pColor = getProviderThemeColor(card.siteKey)
                    DiscoveredPostCard(
                        card = card,
                        providerColor = pColor,
                        onCardClick = { viewModel.selectArticle(card) },
                        onOpenWeb = {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(card.permalink)).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                                context.startActivity(intent)
                            } catch (_: Exception) {}
                        }
                    )
                }
            }

            // ──────────────────────────────────────────────────────────────────
            // LAYER 2: QUALITY & EPISODE TERMINAL (When Article is Active)
            // ──────────────────────────────────────────────────────────────────
            if (activeArticle != null) {
                val article = activeArticle!!
                val pColor = getProviderThemeColor(article.siteKey)

                // Return to Results Pill Button
                if (rawCards.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier
                                .padding(horizontal = 16.dp, vertical = 6.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0x1A00E5FF))
                                .border(1.dp, Color(0x4D00E5FF), RoundedCornerShape(6.dp))
                                .clickable { viewModel.resetToLayer1() }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.ArrowBack,
                                contentDescription = "Back",
                                tint = MoviesModCyanColor,
                                modifier = Modifier.size(13.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "ALL RESULTS (${rawCards.size})",
                                color = MoviesModCyanColor,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 0.5.sp
                            )
                        }
                    }
                }

                // Active Post Summary Banner
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(CardDarkBg)
                            .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
                            .padding(start = 3.dp) // for left accent border
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(CardDarkBg)
                                .drawLeftBorder(3.dp, pColor)
                                .padding(10.dp)
                        ) {
                            Column {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = article.siteDisplayName.uppercase(),
                                        color = Color(0x66FFFFFF),
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        letterSpacing = 1.sp
                                    )

                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0x1A00E5FF))
                                            .border(1.dp, Color(0x3300E5FF), RoundedCornerShape(4.dp))
                                            .clickable {
                                                try {
                                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(article.permalink)).apply {
                                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                                    }
                                                    context.startActivity(intent)
                                                } catch (_: Exception) {}
                                            }
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.OpenInNew,
                                            contentDescription = null,
                                            tint = MoviesModCyanColor,
                                            modifier = Modifier.size(11.dp)
                                        )
                                        Spacer(modifier = Modifier.width(3.dp))
                                        Text(
                                            text = "OPEN PAGE",
                                            color = MoviesModCyanColor,
                                            fontSize = 8.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            letterSpacing = 0.5.sp
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(4.dp))

                                Text(
                                    text = article.title,
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    lineHeight = 16.sp,
                                    maxLines = 2
                                )
                            }
                        }
                    }
                }

                // Horizontal Quality Filter Row ([480p], [720p], [1080p], [2K], [4K])
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf("480p", "720p", "1080p", "2K", "4K").forEach { q ->
                            val isActive = selectedQuality.equals(q, ignoreCase = true)
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (isActive) VegaYellowColor else Color(0x0AFFFFFF))
                                    .border(
                                        1.dp,
                                        if (isActive) VegaYellowColor else SubtleBorderColor,
                                        RoundedCornerShape(6.dp)
                                    )
                                    .clickable { viewModel.setSelectedQuality(q) }
                                    .padding(vertical = 6.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = q,
                                    color = if (isActive) Color(0xFF0A0A0C) else Color(0x80FFFFFF),
                                    fontSize = 11.sp,
                                    fontWeight = if (isActive) FontWeight.Black else FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                // Series Row: Season Chips + Mode Switcher ([EPISODES] vs [BATCH ZIP])
                if (isSeries) {
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Season Chips
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                                modifier = Modifier.weight(1f, fill = false)
                            ) {
                                val seasonsToShow = if (availableSeasons.isNotEmpty()) availableSeasons else listOf(1)
                                items(seasonsToShow) { sn ->
                                    val isActive = selectedSeason == sn
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(5.dp))
                                            .background(if (isActive) Color(0x2600E5FF) else Color(0x0AFFFFFF))
                                            .border(
                                                1.dp,
                                                if (isActive) MoviesModCyanColor else SubtleBorderColor,
                                                RoundedCornerShape(5.dp)
                                            )
                                            .clickable { viewModel.setSelectedSeason(sn) }
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = "S${if (sn < 10) "0$sn" else sn.toString()}",
                                            color = if (isActive) MoviesModCyanColor else Color(0x80FFFFFF),
                                            fontSize = 10.sp,
                                            fontWeight = if (isActive) FontWeight.Black else FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            // Mode Switcher ([EPISODES] vs [BATCH ZIP])
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(5.dp))
                                    .background(Color(0x0AFFFFFF))
                                    .border(1.dp, SubtleBorderColor, RoundedCornerShape(5.dp))
                                    .padding(2.dp)
                            ) {
                                listOf("SINGLE_EPISODE" to "EPISODES", "SEASON_BATCH_ZIP" to "BATCH ZIP").forEach { (mKey, mLabel) ->
                                    val isActive = seriesMode == mKey
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(if (isActive) Color(0x20FFFFFF) else Color.Transparent)
                                            .clickable { viewModel.setSeriesMode(mKey) }
                                            .padding(horizontal = 8.dp, vertical = 4.dp)
                                    ) {
                                        Text(
                                            text = mLabel,
                                            color = if (isActive) Color.White else Color(0x66FFFFFF),
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.ExtraBold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // ──────────────────────────────────────────────────────────────
                // 3-COLUMN EPISODE GRID (When Series & EPISODES Mode)
                // ──────────────────────────────────────────────────────────────
                if (isSeries && seriesMode == "SINGLE_EPISODE") {
                    item {
                        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                            Text(
                                text = "SEASON $selectedSeason EPISODES · ${selectedQuality.uppercase()}",
                                color = Color(0x66FFFFFF),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                modifier = Modifier.padding(bottom = 8.dp)
                            )

                            if (episodesLoading) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 24.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(
                                        color = pColor,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            } else if (episodesList.isEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(CardDarkBg)
                                        .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "No episodes parsed for this quality tier.",
                                        color = Color(0x66FFFFFF),
                                        fontSize = 11.sp
                                    )
                                }
                            } else {
                                // Episode Buttons Grid (Flow/Row wrap layout)
                                EpisodeGrid(
                                    episodes = episodesList,
                                    activeSeriesOption = activeSeriesOption,
                                    providerColor = pColor,
                                    isResolving = resolvingOptionId != null,
                                    onHubClick = {
                                        if (activeSeriesOption != null) {
                                            viewModel.handleDownloadAction(
                                                context = context,
                                                option = activeSeriesOption,
                                                action = "download",
                                                customUrl = activeSeriesOption.lockerUrl
                                            )
                                        }
                                    },
                                    onEpisodeClick = { ep ->
                                        if (activeSeriesOption != null) {
                                            viewModel.handleDownloadAction(
                                                context = context,
                                                option = activeSeriesOption,
                                                action = "download",
                                                customUrl = ep.targetUrl
                                            )
                                        }
                                    }
                                )
                            }
                        }
                    }
                }

                // ──────────────────────────────────────────────────────────────
                // MOVIE & BATCH ZIP OPTION CARDS (When Movie or BATCH ZIP Mode)
                // ──────────────────────────────────────────────────────────────
                if (!isSeries || seriesMode == "SEASON_BATCH_ZIP") {
                    if (filteredOptions.isEmpty() && !isResolving) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(CardDarkBg)
                                    .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
                                    .padding(20.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        text = "No $selectedQuality options found",
                                        color = Color.White,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Try a different quality tier above",
                                        color = Color(0x66FFFFFF),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                    } else {
                        items(filteredOptions) { opt ->
                            val optColor = getProviderThemeColor(opt.siteKey)
                            val isItemResolving = resolvingOptionId == opt.id
                            ProviderOptionCard(
                                option = opt,
                                providerColor = optColor,
                                isResolving = isItemResolving,
                                onDownload = {
                                    viewModel.handleDownloadAction(context, opt, "download")
                                },
                                on1DM = {
                                    viewModel.handleDownloadAction(context, opt, "1dm")
                                },
                                onCopy = {
                                    viewModel.handleDownloadAction(context, opt, "copy")
                                }
                            )
                        }
                    }
                }
            }

            // ── EMPTY INITIAL STATE ──
            if (!isSearching && rawCards.isEmpty() && activeArticle == null) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 60.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.CloudDownload,
                            contentDescription = null,
                            tint = Color(0x26FFFFFF),
                            modifier = Modifier.size(38.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "Downloader Terminal Ready",
                            color = Color(0x80FFFFFF),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(3.dp))
                        Text(
                            text = "Search any title above to extract download options",
                            color = Color(0x40FFFFFF),
                            fontSize = 11.sp
                        )
                    }
                }
            }

            // ── TERMINAL STATUS LOGS (Collapsible Console) ──
            if (statusLogs.isNotEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF0D0D10))
                            .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { logsExpanded = !logsExpanded }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "TERMINAL LOGS (${statusLogs.size})",
                                color = Color(0x66FFFFFF),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 0.8.sp
                            )
                            Icon(
                                imageVector = if (logsExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                contentDescription = null,
                                tint = Color(0x66FFFFFF),
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        AnimatedVisibility(visible = logsExpanded) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                statusLogs.takeLast(10).forEach { log ->
                                    Text(
                                        text = "> $log",
                                        color = Color(0xFF00FF66),
                                        fontSize = 10.sp,
                                        fontFamily = FontFamily.Monospace,
                                        lineHeight = 14.sp
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

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: DISCOVERED POST CARD (LAYER 1)
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun DiscoveredPostCard(
    card: ScrapedArticle,
    providerColor: Color,
    onCardClick: () -> Unit,
    onOpenWeb: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(CardDarkBg)
            .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
            .drawLeftBorder(3.dp, providerColor)
            .clickable(onClick = onCardClick)
            .padding(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // 50x75 Poster Thumbnail
            if (!card.posterUrl.isNullOrBlank()) {
                AsyncImage(
                    model = card.posterUrl,
                    contentDescription = card.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(width = 50.dp, height = 75.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(Color(0x0AFFFFFF))
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(width = 50.dp, height = 75.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(Color(0x05FFFFFF))
                        .border(1.dp, providerColor.copy(alpha = 0.25f), RoundedCornerShape(5.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Movie,
                        contentDescription = null,
                        tint = providerColor,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // Info Column
            Column(
                modifier = Modifier
                    .weight(1f)
                    .height(75.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top Tag Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    // Site Tag
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(providerColor.copy(alpha = 0.12f))
                            .border(1.dp, providerColor.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = card.siteDisplayName.uppercase(),
                            color = providerColor,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }

                    // Season Tag if available
                    card.seasonTags?.firstOrNull()?.let { s ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(Color(0x1AFFFFFF))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "S$s",
                                color = Color.White,
                                fontSize = 8.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    // Open Web Page Pill
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0x0FFFFFFF))
                            .border(1.dp, Color(0x1AFFFFFF), RoundedCornerShape(4.dp))
                            .clickable(onClick = onOpenWeb)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.OpenInNew,
                            contentDescription = null,
                            tint = Color(0xB3FFFFFF),
                            modifier = Modifier.size(10.dp)
                        )
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(
                            text = "PAGE",
                            color = Color(0xB3FFFFFF),
                            fontSize = 8.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                    }
                }

                // Title
                Text(
                    text = card.title,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                // Bottom Hint
                Text(
                    text = "VIEW DOWNLOAD OPTIONS →",
                    color = providerColor,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.5.sp
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: EPISODE GRID (3-Column Layout matching React Native)
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun EpisodeGrid(
    episodes: List<SeriesEpisodeItem>,
    activeSeriesOption: ScrapedOption?,
    providerColor: Color,
    isResolving: Boolean,
    onHubClick: () -> Unit,
    onEpisodeClick: (SeriesEpisodeItem) -> Unit
) {
    val itemsList = remember(episodes, activeSeriesOption) {
        val list = mutableListOf<Any>()
        if (activeSeriesOption != null) {
            list.add("HUB")
        }
        list.addAll(episodes)
        list
    }

    // Grid with fixed columns of 3
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val chunked = itemsList.chunked(3)
        for (row in chunked) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                for (item in row) {
                    Box(modifier = Modifier.weight(1f)) {
                        if (item == "HUB") {
                            // HUB BUTTON
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(providerColor)
                                    .clickable(enabled = !isResolving, onClick = onHubClick)
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Bolt,
                                        contentDescription = null,
                                        tint = Color(0xFF0A0A0C),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Text(
                                        text = "HUB",
                                        color = Color(0xFF0A0A0C),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 0.5.sp
                                    )
                                }
                            }
                        } else if (item is SeriesEpisodeItem) {
                            // EPISODE BUTTON
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0x05FFFFFF))
                                    .border(1.dp, providerColor.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                                    .clickable(enabled = !isResolving) { onEpisodeClick(item) }
                                    .padding(vertical = 10.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "EP ${if (item.episodeNumber < 10) "0${item.episodeNumber}" else item.episodeNumber.toString()}",
                                    color = providerColor,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.ExtraBold
                                )
                            }
                        }
                    }
                }
                // Fill remaining spaces in row if chunk size < 3
                for (i in 0 until (3 - row.size)) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: PROVIDER OPTION CARD (MOVIE & BATCH ZIP)
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun ProviderOptionCard(
    option: ScrapedOption,
    providerColor: Color,
    isResolving: Boolean,
    onDownload: () -> Unit,
    on1DM: () -> Unit,
    onCopy: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(CardDarkBg)
            .border(1.dp, SubtleBorderColor, RoundedCornerShape(8.dp))
            .drawLeftBorder(3.dp, providerColor)
            .padding(10.dp)
    ) {
        Column {
            // Top Row: Provider Name + File Size
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = option.siteDisplayName.uppercase(),
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = option.fileSize,
                    color = providerColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Meta line: rip format, codec, audio
            val metaParts = listOfNotNull(
                option.qualityLabel.takeIf { it.isNotBlank() },
                option.ripFormat.takeIf { it.isNotBlank() },
                option.codec.takeIf { it.isNotBlank() },
                option.audioTracks.takeIf { it.isNotBlank() }
            )
            Text(
                text = metaParts.joinToString("  ·  "),
                color = Color(0x80FFFFFF),
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Action Row: DOWNLOAD / BROWSER + 1DM / ADM + COPY
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Primary: DOWNLOAD / BROWSER
                Button(
                    onClick = onDownload,
                    enabled = !isResolving,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = providerColor,
                        contentColor = Color(0xFF0A0A0C)
                    ),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    modifier = Modifier.weight(1.4f)
                ) {
                    if (isResolving) {
                        CircularProgressIndicator(
                            color = Color(0xFF0A0A0C),
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(14.dp)
                        )
                    } else {
                        Text(
                            text = "DOWNLOAD / BROWSER",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }

                // Secondary: 1DM / ADM
                OutlinedButton(
                    onClick = on1DM,
                    enabled = !isResolving,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = providerColor),
                    border = androidx.compose.foundation.BorderStroke(1.dp, providerColor.copy(alpha = 0.4f)),
                    shape = RoundedCornerShape(6.dp),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
                    modifier = Modifier.weight(0.9f)
                ) {
                    Text(
                        text = "1DM / ADM",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = providerColor
                    )
                }

                // Copy Link Icon Button
                IconButton(
                    onClick = onCopy,
                    enabled = !isResolving,
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0x0AFFFFFF))
                        .border(1.dp, SubtleBorderColor, RoundedCornerShape(6.dp))
                ) {
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = "Copy Link",
                        tint = Color(0xB3FFFFFF),
                        modifier = Modifier.size(15.dp)
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER EXTENSION: DRAW LEFT BORDER ONLY
// ─────────────────────────────────────────────────────────────────────────────
fun Modifier.drawLeftBorder(width: androidx.compose.ui.unit.Dp, color: Color): Modifier = this.drawBehind {
    val strokeWidth = width.toPx()
    drawLine(
        color = color,
        start = Offset(strokeWidth / 2f, 0f),
        end = Offset(strokeWidth / 2f, this@drawBehind.size.height),
        strokeWidth = strokeWidth
    )
}
