package com.hologram.downloader.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.ui.theme.*

@Composable
fun ScrapedOptionCard(
    option: ScrapedOption,
    onDownloadNative: () -> Unit,
    onSendTo1DM: () -> Unit,
    onOpenInBrowser: () -> Unit
) {
    val qualityColor = when (option.qualityLabel.lowercase()) {
        "4k", "2160p" -> MovieBoxPink
        "1080p" -> ElectricIndigoLight
        "720p" -> EmeraldGreen
        else -> AmberWarning
    }

    val siteColor = when (option.siteKey) {
        "vegamovies" -> VegaYellow
        "moviesmod" -> MoviesModCyan
        else -> MovieBoxPink
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = DarkSlateGlass),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, SubtleBorder, RoundedCornerShape(10.dp))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Header Row: Quality + Codec + Provider Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = option.qualityLabel,
                        color = Color.Black,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(qualityColor)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    )

                    Spacer(modifier = Modifier.width(6.dp))

                    Text(
                        text = "${option.ripFormat} • ${option.codec}",
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Text(
                    text = option.siteDisplayName.uppercase(),
                    color = siteColor,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.5.sp
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Details Row: Audio tracks + File Size + Episode Info
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = option.audioTracks,
                    color = TextSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )

                Text(
                    text = option.fileSize,
                    color = VegaYellow,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            if (!option.episodeName.isNullOrBlank() && option.episodeName != "Download") {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = option.episodeName,
                    color = TextMuted,
                    fontSize = 11.sp,
                    maxLines = 1
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action Buttons: Native Download, 1DM/ADM, Browser
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Primary: Native Download
                Button(
                    onClick = onDownloadNative,
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricIndigo),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                    modifier = Modifier.weight(1.3f)
                ) {
                    Icon(
                        imageVector = Icons.Default.Download,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "DOWNLOAD",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Secondary: 1DM / ADM Hand-off
                OutlinedButton(
                    onClick = onSendTo1DM,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary),
                    border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(SubtleBorder)),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.Default.RocketLaunch,
                        contentDescription = null,
                        tint = VegaYellow,
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "1DM/ADM",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Tertiary: Browser
                IconButton(
                    onClick = onOpenInBrowser,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(SubtleSlate)
                ) {
                    Icon(
                        imageVector = Icons.Default.OpenInBrowser,
                        contentDescription = "Open Link",
                        tint = TextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
