package com.hologram.downloader.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

object IntentUtils {

    enum class PreferredPlayer(val packageName: String, val displayName: String) {
        VLC("org.videolan.vlc", "VLC Player"),
        MX_PLAYER("com.mxtech.videoplayer.ad", "MX Player"),
        JUST_PLAYER("com.brouken.player", "Just Player"),
        SYSTEM_CHOOSER("", "System Chooser")
    }

    fun playVideo(
        context: Context,
        localFilePath: String,
        preferredPlayer: PreferredPlayer = PreferredPlayer.SYSTEM_CHOOSER
    ) {
        try {
            val file = File(localFilePath)
            if (!file.exists()) {
                Toast.makeText(context, "File not found: ${file.name}", Toast.LENGTH_SHORT).show()
                return
            }

            val uri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val mime = if (file.name.endsWith(".mkv")) "video/x-matroska" else "video/*"

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mime)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            if (preferredPlayer != PreferredPlayer.SYSTEM_CHOOSER) {
                intent.setPackage(preferredPlayer.packageName)
                try {
                    context.startActivity(intent)
                    return
                } catch (_: Exception) {
                    // Fallback to system chooser if specific package not installed
                    intent.setPackage(null)
                }
            }

            val chooser = Intent.createChooser(intent, "Play with external video player").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)
        } catch (e: Exception) {
            Toast.makeText(context, "Error opening player: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    fun sendToExternalDownloader(
        context: Context,
        streamUrl: String,
        title: String? = null,
        headers: Map<String, String> = emptyMap()
    ) {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse(streamUrl)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            // Pass headers to 1DM / ADM
            val headersBundle = Bundle()
            headers.forEach { (k, v) -> headersBundle.putString(k, v) }
            intent.putExtra("android.media.intent.extra.HTTP_HEADERS", headersBundle)

            if (!title.isNullOrBlank()) {
                intent.putExtra("title", title)
            }

            val chooser = Intent.createChooser(intent, "Send download link to...")
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(chooser)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not launch downloader: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    fun shareFile(context: Context, localFilePath: String) {
        try {
            val file = File(localFilePath)
            if (!file.exists()) return

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "video/*"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(Intent.createChooser(shareIntent, "Share Video File"))
        } catch (e: Exception) {
            Toast.makeText(context, "Share failed: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }
}
