package com.hologram.downloader.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.ui.components.CinemaDetailSheet
import com.hologram.downloader.ui.components.HoloDownLogo
import com.hologram.downloader.ui.components.MediaCard
import com.hologram.downloader.ui.theme.*
import com.hologram.downloader.ui.viewmodel.HomeViewModel

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onNavigateToDownloader: (query: String, year: Int?, isTv: Boolean, season: Int?, episode: Int?, directArticleUrl: String?) -> Unit
) {
    val trendingMovies by viewModel.trendingMovies.collectAsState()
    val trendingTv by viewModel.trendingTv.collectAsState()
    val sceneDrops by viewModel.scrapedSceneReleases.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val selectedMedia by viewModel.selectedMedia.collectAsState()

    var activeDiscoveryTab by remember { mutableIntStateOf(0) } // 0: TMDb Curated, 1: Live Scene Drops

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepVoid)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 90.dp)
        ) {
            // Header Bar
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HoloDownLogo(size = 32.dp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "HoloDown",
                                color = TextPrimary,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 0.5.sp
                            )
                            Text(
                                text = "MEDIA DISCOVERY & AGGREGATOR",
                                color = TextMuted,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )
                        }
                    }

                    IconButton(
                        onClick = { viewModel.loadHomeFeeds() },
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(DarkSlateGlass)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh Feeds",
                            tint = if (isLoading) ElectricIndigoLight else TextSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // Top Discovery Switcher (TMDb Curated vs Live Scraped Scene Drops)
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(DarkSlateGlass)
                        .padding(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (activeDiscoveryTab == 0) ElectricIndigo else Color.Transparent)
                            .clickable { activeDiscoveryTab = 0 }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "🎬 TMDB RECOMMENDATIONS",
                            color = if (activeDiscoveryTab == 0) TextPrimary else TextSecondary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp
                        )
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (activeDiscoveryTab == 1) ElectricIndigo else Color.Transparent)
                            .clickable { activeDiscoveryTab = 1 }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "⚡ SCENE DROPS (VEGA/MOD)",
                            color = if (activeDiscoveryTab == 1) TextPrimary else TextSecondary,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp
                        )
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            }

            // Loading indicator
            if (isLoading && trendingMovies.isEmpty() && sceneDrops.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = ElectricIndigo, strokeWidth = 3.dp)
                    }
                }
            }

            if (activeDiscoveryTab == 0) {
                // Section A: TMDb Curated Feeds
                // Trending Movies
                item {
                    SectionHeader(
                        title = "TRENDING MOVIES",
                        subtitle = "Popular releases this week"
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(trendingMovies) { item ->
                            MediaCard(
                                title = item.title,
                                posterUrl = item.fullPosterUrl,
                                year = item.year,
                                rating = item.formattedRating,
                                badge = "TRENDING",
                                badgeColor = ElectricIndigo,
                                onClick = { viewModel.selectMedia(item) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(20.dp))
                }

                // Trending TV Series
                item {
                    SectionHeader(
                        title = "POPULAR TV SERIES",
                        subtitle = "Binge-worthy seasonal drops"
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(trendingTv) { item ->
                            MediaCard(
                                title = item.title,
                                posterUrl = item.fullPosterUrl,
                                year = item.year,
                                rating = item.formattedRating,
                                badge = "SERIES",
                                badgeColor = EmeraldGreen,
                                onClick = { viewModel.selectMedia(item) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(20.dp))
                }
            } else {
                // Section B: Live Scraped Scene Feed from VegaMovies & MoviesMod
                item {
                    SectionHeader(
                        title = "LIVE SCENE DROPS",
                        subtitle = "Directly scraped from VegaMovies & MoviesMod"
                    )
                }

                // 2-Column Grid or List of Scraped Scene Drops
                items(sceneDrops.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        for (article in pair) {
                            Box(modifier = Modifier.weight(1f)) {
                                ScrapedSceneCard(
                                    article = article,
                                    onClick = {
                                        onNavigateToDownloader(
                                            article.title,
                                            article.year?.toIntOrNull(),
                                            article.isSeries,
                                            article.seasonTags?.firstOrNull() ?: 1,
                                            1,
                                            article.permalink
                                        )
                                    }
                                )
                            }
                        }
                        if (pair.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // Cinema Detail Bottom Sheet
        selectedMedia?.let { media ->
            CinemaDetailSheet(
                media = media,
                onDismiss = { viewModel.clearSelectedMedia() },
                onFindSources = { title, year, isTv, season, episode, imdbId ->
                    onNavigateToDownloader(title, year, isTv, season, episode, null)
                }
            )
        }
    }
}

@Composable
fun SectionHeader(title: String, subtitle: String) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            text = title,
            color = TextPrimary,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp
        )
        Text(
            text = subtitle,
            color = TextMuted,
            fontSize = 11.sp
        )
    }
}

@Composable
fun ScrapedSceneCard(
    article: ScrapedArticle,
    onClick: () -> Unit
) {
    val siteColor = when (article.siteKey) {
        "vegamovies" -> VegaYellow
        "moviesmod" -> MoviesModCyan
        else -> MovieBoxPink
    }

    MediaCard(
        title = article.title,
        posterUrl = article.posterUrl,
        badge = article.siteDisplayName.take(7).uppercase(),
        badgeColor = siteColor,
        year = if (article.isSeries) "SERIES" else "MOVIE",
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
    )
}
