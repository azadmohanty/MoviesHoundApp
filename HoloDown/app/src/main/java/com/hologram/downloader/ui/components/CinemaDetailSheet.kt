package com.hologram.downloader.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.hologram.downloader.data.tmdb.TmdbMedia
import com.hologram.downloader.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CinemaDetailSheet(
    media: TmdbMedia,
    onDismiss: () -> Unit,
    onFindSources: (title: String, year: Int?, isTv: Boolean, season: Int, episode: Int, imdbId: String?) -> Unit
) {
    val scrollState = rememberScrollState()
    val isTv = media.mediaType == "tv" || media.seasons.isNotEmpty()

    var selectedSeason by remember { mutableIntStateOf(1) }
    var selectedEpisode by remember { mutableIntStateOf(1) }

    val currentSeason = media.seasons.find { it.seasonNumber == selectedSeason }
    val episodeCount = currentSeason?.episodeCount ?: currentSeason?.episodes?.size ?: 10

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = DarkSlateGlass,
        dragHandle = null,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.88f)
                .verticalScroll(scrollState)
        ) {
            // Backdrop Header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(230.dp)
            ) {
                AsyncImage(
                    model = media.fullBackdropUrl ?: media.fullPosterUrl,
                    contentDescription = media.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                // Top & Bottom Gradients
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Black.copy(alpha = 0.5f),
                                    Color.Transparent,
                                    DarkSlateGlass
                                )
                            )
                        )
                )

                // Close Button
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.6f))
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Poster + Title Row inside Backdrop bottom
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    AsyncImage(
                        model = media.fullPosterUrl,
                        contentDescription = media.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .width(75.dp)
                            .height(110.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .border(1.dp, SubtleBorder, RoundedCornerShape(8.dp))
                    )

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            text = media.title,
                            color = TextPrimary,
                            fontSize = 19.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2
                        )

                        Spacer(modifier = Modifier.height(4.dp))

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (!media.formattedRating.isNullOrBlank()) {
                                Icon(
                                    imageVector = Icons.Default.Star,
                                    contentDescription = null,
                                    tint = VegaYellow,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = media.formattedRating,
                                    color = TextPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }

                            if (!media.year.isNullOrBlank()) {
                                Text(
                                    text = media.year!!,
                                    color = TextSecondary,
                                    fontSize = 13.sp
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }

                            Text(
                                text = if (isTv) "TV SERIES" else "MOVIE",
                                color = ElectricIndigoLight,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(ElectricIndigo.copy(alpha = 0.2f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                }
            }

            Column(modifier = Modifier.padding(16.dp)) {
                // Genres Chips
                if (media.genres.isNotEmpty()) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(bottom = 12.dp)
                    ) {
                        items(media.genres) { genre ->
                            Text(
                                text = genre,
                                color = TextSecondary,
                                fontSize = 11.sp,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(SubtleSlate)
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                // Synopsis
                if (!media.overview.isNullOrBlank()) {
                    Text(
                        text = "SYNOPSIS",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = media.overview!!,
                        color = TextSecondary,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(bottom = 14.dp)
                    )
                }

                // Cast list
                if (media.cast.isNotEmpty()) {
                    Text(
                        text = "STARRING",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = media.cast.joinToString(" • "),
                        color = TextPrimary,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }

                // TV Series Season & Episode Pickers
                if (isTv) {
                    Text(
                        text = "SELECT SEASON",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    val seasonList = if (media.seasons.isNotEmpty()) {
                        media.seasons.map { it.seasonNumber }
                    } else {
                        listOf(1, 2, 3)
                    }

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(bottom = 12.dp)
                    ) {
                        items(seasonList) { seNum ->
                            val isSelected = selectedSeason == seNum
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (isSelected) ElectricIndigo else SubtleSlate)
                                    .clickable { selectedSeason = seNum }
                                    .padding(horizontal = 14.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = "SEASON $seNum",
                                    color = if (isSelected) TextPrimary else TextSecondary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Text(
                        text = "SELECT EPISODE",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(bottom = 20.dp)
                    ) {
                        items(episodeCount) { index ->
                            val epNum = index + 1
                            val isSelected = selectedEpisode == epNum
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (isSelected) ElectricIndigo else SubtleSlate)
                                    .clickable { selectedEpisode = epNum }
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = "EP $epNum",
                                    color = if (isSelected) TextPrimary else TextSecondary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                // Main Action: Fetch Download Sources
                Button(
                    onClick = {
                        val yearInt = media.year?.toIntOrNull()
                        onFindSources(
                            media.title,
                            yearInt,
                            isTv,
                            selectedSeason,
                            selectedEpisode,
                            media.imdbId
                        )
                        onDismiss()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricIndigo),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ElectricBolt,
                        contentDescription = null,
                        tint = VegaYellow,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isTv) "FETCH S${selectedSeason}E${selectedEpisode} DOWNLOADS" else "FETCH DOWNLOAD SOURCES",
                        color = TextPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}
