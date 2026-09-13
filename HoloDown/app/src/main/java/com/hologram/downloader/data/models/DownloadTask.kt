package com.hologram.downloader.data.models

enum class DownloadStatus {
    PENDING,
    CONNECTING,
    DOWNLOADING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class DownloadTask(
    val id: String,
    val title: String,
    val url: String,
    val quality: String = "720p",
    val providerName: String = "FastDL",
    val posterUrl: String? = null,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = 0L,
    val speedBytesPerSec: Long = 0L,
    val status: DownloadStatus = DownloadStatus.PENDING,
    val localFilePath: String? = null,
    val mimeType: String = "video/mp4",
    val etaSeconds: Long = 0L,
    val errorMessage: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val createdAt: Long = System.currentTimeMillis()
) {
    val progressFraction: Float
        get() = if (totalBytes > 0) (downloadedBytes.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f) else 0f

    val progressPercent: Int
        get() = (progressFraction * 100).toInt()

    val formattedSpeed: String
        get() {
            val speedMb = speedBytesPerSec / (1024.0 * 1024.0)
            return if (speedMb >= 1.0) {
                String.format("%.1f MB/s", speedMb)
            } else {
                val speedKb = speedBytesPerSec / 1024.0
                String.format("%.0f KB/s", speedKb)
            }
        }

    val formattedDownloaded: String
        get() = formatBytes(downloadedBytes)

    val formattedTotal: String
        get() = if (totalBytes > 0) formatBytes(totalBytes) else "Unknown"

    val formattedEta: String
        get() = when {
            status != DownloadStatus.DOWNLOADING -> ""
            etaSeconds <= 0 -> "--"
            etaSeconds < 60 -> "${etaSeconds}s"
            etaSeconds < 3600 -> "${etaSeconds / 60}m ${etaSeconds % 60}s"
            else -> "${etaSeconds / 3600}h ${(etaSeconds % 3600) / 60}m"
        }

    companion object {
        fun formatBytes(bytes: Long): String {
            if (bytes <= 0) return "0 B"
            val gb = bytes / (1024.0 * 1024.0 * 1024.0)
            if (gb >= 1.0) return String.format("%.2f GB", gb)
            val mb = bytes / (1024.0 * 1024.0)
            if (mb >= 1.0) return String.format("%.1f MB", mb)
            val kb = bytes / 1024.0
            return String.format("%.0f KB", kb)
        }
    }
}
