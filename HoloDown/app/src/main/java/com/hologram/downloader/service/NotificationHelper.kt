package com.hologram.downloader.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.hologram.downloader.MainActivity
import com.hologram.downloader.data.models.DownloadTask

class NotificationHelper(private val context: Context) {

    companion object {
        const val CHANNEL_ID = "holodown_downloads_channel"
        const val CHANNEL_NAME = "HoloDown Active Downloads"
        const val NOTIFICATION_ID = 1001

        const val ACTION_PAUSE = "com.hologram.downloader.ACTION_PAUSE"
        const val ACTION_RESUME = "com.hologram.downloader.ACTION_RESUME"
        const val ACTION_CANCEL = "com.hologram.downloader.ACTION_CANCEL"
        const val EXTRA_TASK_ID = "task_id"
    }

    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    init {
        createChannel()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ongoing video download progress"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun buildDownloadNotification(task: DownloadTask?): android.app.Notification {
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingOpen = PendingIntent.getActivity(
            context,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val title = task?.title ?: "HoloDown Service Active"
        val content = if (task != null) {
            "${task.formattedDownloaded} / ${task.formattedTotal} • ${task.formattedSpeed} • ${task.formattedEta}"
        } else {
            "Ready for downloads"
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(content)
            .setContentIntent(pendingOpen)
            .setOngoing(true)
            .setOnlyAlertOnce(true)

        if (task != null && task.totalBytes > 0) {
            builder.setProgress(100, task.progressPercent, false)
        } else if (task != null) {
            builder.setProgress(100, 0, true)
        }

        // Cancel Action
        if (task != null) {
            val cancelIntent = Intent(context, DownloadService::class.java).apply {
                action = ACTION_CANCEL
                putExtra(EXTRA_TASK_ID, task.id)
            }
            val pendingCancel = PendingIntent.getService(
                context,
                1,
                cancelIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel", pendingCancel)
        }

        return builder.build()
    }

    fun updateNotification(task: DownloadTask?) {
        notificationManager.notify(NOTIFICATION_ID, buildDownloadNotification(task))
    }
}
