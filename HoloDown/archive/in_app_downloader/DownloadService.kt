package com.hologram.downloader.service

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.hologram.downloader.data.models.DownloadStatus
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest

class DownloadService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var notificationHelper: NotificationHelper
    private lateinit var downloadManager: DownloadManager

    override fun onCreate() {
        super.onCreate()
        notificationHelper = NotificationHelper(this)
        downloadManager = DownloadManager.getInstance(this)

        serviceScope.launch {
            downloadManager.tasks.collectLatest { tasks ->
                val activeTask = tasks.find {
                    it.status == DownloadStatus.DOWNLOADING || it.status == DownloadStatus.CONNECTING
                }

                if (activeTask != null) {
                    val notif = notificationHelper.buildDownloadNotification(activeTask)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(
                            NotificationHelper.NOTIFICATION_ID,
                            notif,
                            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                        )
                    } else {
                        startForeground(NotificationHelper.NOTIFICATION_ID, notif)
                    }
                    notificationHelper.updateNotification(activeTask)
                } else {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            NotificationHelper.ACTION_PAUSE -> {
                val taskId = intent.getStringExtra(NotificationHelper.EXTRA_TASK_ID)
                if (!taskId.isNullOrBlank()) {
                    downloadManager.pauseDownload(taskId)
                }
            }
            NotificationHelper.ACTION_RESUME -> {
                val taskId = intent.getStringExtra(NotificationHelper.EXTRA_TASK_ID)
                if (!taskId.isNullOrBlank()) {
                    downloadManager.resumeDownload(taskId)
                }
            }
            NotificationHelper.ACTION_CANCEL -> {
                val taskId = intent.getStringExtra(NotificationHelper.EXTRA_TASK_ID)
                if (!taskId.isNullOrBlank()) {
                    downloadManager.cancelDownload(taskId)
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
