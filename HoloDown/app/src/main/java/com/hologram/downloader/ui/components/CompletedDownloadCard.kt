package com.hologram.downloader.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hologram.downloader.data.models.DownloadTask
import com.hologram.downloader.ui.theme.*
import com.hologram.downloader.utils.IntentUtils

@Composable
fun CompletedDownloadCard(
    task: DownloadTask,
    onPlay: (IntentUtils.PreferredPlayer) -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit
) {
    var menuExpanded by remember { mutableStateOf(false) }

    Card(
        colors = CardDefaults.cardColors(containerColor = DarkSlateGlass),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, SubtleBorder, RoundedCornerShape(10.dp))
            .clickable { onPlay(IntentUtils.PreferredPlayer.SYSTEM_CHOOSER) }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Play Button Icon
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(ElectricIndigo),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Play Video",
                    tint = TextPrimary,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // File Title + Size + Format
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = task.title,
                    color = TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = task.formattedTotal,
                        color = VegaYellow,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (task.localFilePath?.endsWith(".mkv") == true) "MKV VIDEO" else "MP4 VIDEO",
                        color = TextMuted,
                        fontSize = 11.sp
                    )
                }
            }

            // 3-Dots Menu
            Box {
                IconButton(onClick = { menuExpanded = true }) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "Options",
                        tint = TextSecondary
                    )
                }

                DropdownMenu(
                    expanded = menuExpanded,
                    onDismissRequest = { menuExpanded = false },
                    modifier = Modifier.background(DarkSlateElevated)
                ) {
                    DropdownMenuItem(
                        text = { Text("▶ Play with VLC", color = TextPrimary) },
                        onClick = {
                            menuExpanded = false
                            onPlay(IntentUtils.PreferredPlayer.VLC)
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("▶ Play with MX Player", color = TextPrimary) },
                        onClick = {
                            menuExpanded = false
                            onPlay(IntentUtils.PreferredPlayer.MX_PLAYER)
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("▶ Choose System Player", color = TextPrimary) },
                        onClick = {
                            menuExpanded = false
                            onPlay(IntentUtils.PreferredPlayer.SYSTEM_CHOOSER)
                        }
                    )
                    HorizontalDivider(color = SubtleBorder)
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Share, null, tint = TextSecondary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Share File", color = TextPrimary)
                            }
                        },
                        onClick = {
                            menuExpanded = false
                            onShare()
                        }
                    )
                    DropdownMenuItem(
                        text = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Delete, null, tint = CrimsonError, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Delete File", color = CrimsonError)
                            }
                        },
                        onClick = {
                            menuExpanded = false
                            onDelete()
                        }
                    )
                }
            }
        }
    }
}
