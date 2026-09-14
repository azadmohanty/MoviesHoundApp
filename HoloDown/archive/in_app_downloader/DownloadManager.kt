package com.hologram.downloader.service

import android.content.Context
import android.media.MediaScannerConnection
import android.os.Environment
import com.hologram.downloader.data.models.DownloadStatus
import com.hologram.downloader.data.models.DownloadTask
import com.hologram.downloader.scrapers.base.BaseExtractor
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile

class DownloadManager private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var INSTANCE: DownloadManager? = null

        fun getInstance(context: Context): DownloadManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DownloadManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeJobs = mutableMapOf<String, Job>()

    private val _tasks = MutableStateFlow<List<DownloadTask>>(emptyList())
    val tasks: StateFlow<List<DownloadTask>> = _tasks.asStateFlow()

    private val downloadDir: File by lazy {
        val publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val holoFolder = File(publicDownloads, "HoloDown")
        if (!holoFolder.exists()) {
            holoFolder.mkdirs()
        }
        if (!holoFolder.exists()) {
            // Fallback to app external files dir
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        } else {
            holoFolder
        }
    }

    init {
        scanExistingCompletedDownloads()
    }

    fun scanExistingCompletedDownloads() {
        scope.launch {
            try {
                val files = downloadDir.listFiles()?.filter {
                    it.isFile && (it.name.endsWith(".mp4") || it.name.endsWith(".mkv"))
                } ?: emptyList()

                val existing = _tasks.value.toMutableList()
                files.forEach { f ->
                    if (existing.none { it.localFilePath == f.absolutePath }) {
                        val taskId = "file-${f.name.hashCode()}"
                        existing.add(
                            DownloadTask(
                                id = taskId,
                                title = f.nameWithoutExtension,
                                url = "",
                                downloadedBytes = f.length(),
                                totalBytes = f.length(),
                                status = DownloadStatus.COMPLETED,
                                localFilePath = f.absolutePath,
                                mimeType = if (f.name.endsWith(".mkv")) "video/x-matroska" else "video/mp4"
                            )
                        )
                    }
                }
                _tasks.value = existing
            } catch (_: Exception) {}
        }
    }

    fun enqueueDownload(
        title: String,
        streamUrl: String,
        quality: String = "720p",
        providerName: String = "FastDL",
        posterUrl: String? = null,
        headers: Map<String, String> = emptyMap()
    ): DownloadTask {
        val taskId = "dl-${System.currentTimeMillis()}-${(100..999).random()}"
        val sanitizedTitle = title.replace(Regex("[^a-zA-Z0-9._ -]"), "_")
        val extension = if (streamUrl.contains(".mkv")) ".mkv" else ".mp4"
        val targetFile = File(downloadDir, "$sanitizedTitle$extension")

        val task = DownloadTask(
            id = taskId,
            title = title,
            url = streamUrl,
            quality = quality,
            providerName = providerName,
            posterUrl = posterUrl,
            localFilePath = targetFile.absolutePath,
            mimeType = if (extension == ".mkv") "video/x-matroska" else "video/mp4",
            headers = headers,
            status = DownloadStatus.PENDING
        )

        val updated = _tasks.value.toMutableList()
        updated.add(0, task)
        _tasks.value = updated

        startDownload(task)
        return task
    }

    fun pauseDownload(taskId: String) {
        activeJobs[taskId]?.cancel()
        activeJobs.remove(taskId)
        updateTaskStatus(taskId, DownloadStatus.PAUSED)
    }

    fun resumeDownload(taskId: String) {
        val task = _tasks.value.find { it.id == taskId } ?: return
        if (task.status == DownloadStatus.PAUSED || task.status == DownloadStatus.FAILED) {
            startDownload(task)
        }
    }

    fun cancelDownload(taskId: String) {
        activeJobs[taskId]?.cancel()
        activeJobs.remove(taskId)
        val task = _tasks.value.find { it.id == taskId }
        task?.localFilePath?.let { path ->
            try {
                val f = File(path)
                if (f.exists()) f.delete()
            } catch (_: Exception) {}
        }
        val updated = _tasks.value.filter { it.id != taskId }
        _tasks.value = updated
    }

    fun deleteCompletedDownload(taskId: String) {
        val task = _tasks.value.find { it.id == taskId }
        task?.localFilePath?.let { path ->
            try {
                val f = File(path)
                if (f.exists()) f.delete()
            } catch (_: Exception) {}
        }
        val updated = _tasks.value.filter { it.id != taskId }
        _tasks.value = updated
    }

    private fun startDownload(task: DownloadTask) {
        activeJobs[task.id]?.cancel()

        val job = scope.launch {
            var downloaded = 0L
            val targetFile = File(task.localFilePath ?: "")
            if (targetFile.exists()) {
                downloaded = targetFile.length()
            }

            updateTask(task.id) {
                it.copy(
                    status = DownloadStatus.CONNECTING,
                    downloadedBytes = downloaded,
                    errorMessage = null
                )
            }

            try {
                val reqBuilder = Request.Builder()
                    .url(task.url)
                    .header("User-Agent", BaseExtractor.DEFAULT_UA)

                task.headers.forEach { (k, v) -> reqBuilder.header(k, v) }

                if (downloaded > 0) {
                    reqBuilder.header("Range", "bytes=$downloaded-")
                }

                BaseExtractor.sharedOkHttpClient.newCall(reqBuilder.build()).execute().use { response ->
                    if (!response.isSuccessful && response.code != 206) {
                        updateTask(task.id) {
                            it.copy(
                                status = DownloadStatus.FAILED,
                                errorMessage = "HTTP ${response.code}: ${response.message}"
                            )
                        }
                        return@use
                    }

                    val body = response.body
                    if (body == null) {
                        updateTask(task.id) {
                            it.copy(status = DownloadStatus.FAILED, errorMessage = "Empty response body")
                        }
                        return@use
                    }

                    val contentLength = body.contentLength()
                    val total = if (response.code == 206) {
                        downloaded + contentLength
                    } else {
                        downloaded = 0L
                        contentLength
                    }

                    updateTask(task.id) {
                        it.copy(
                            status = DownloadStatus.DOWNLOADING,
                            totalBytes = total,
                            downloadedBytes = downloaded
                        )
                    }

                    val raf = RandomAccessFile(targetFile, "rw")
                    raf.seek(downloaded)

                    val buffer = ByteArray(64 * 1024)
                    var read: Int
                    val inputStream = body.byteStream()

                    var lastSpeedTime = System.currentTimeMillis()
                    var bytesSinceLastSpeed = 0L
                    var currentSpeed = 0L

                    while (inputStream.read(buffer).also { read = it } != -1) {
                        if (!isActive) {
                            raf.close()
                            return@use
                        }

                        raf.write(buffer, 0, read)
                        downloaded += read
                        bytesSinceLastSpeed += read

                        val now = System.currentTimeMillis()
                        val diff = now - lastSpeedTime
                        if (diff >= 1000) {
                            currentSpeed = (bytesSinceLastSpeed * 1000) / diff
                            lastSpeedTime = now
                            bytesSinceLastSpeed = 0L

                            val remaining = (total - downloaded).coerceAtLeast(0L)
                            val eta = if (currentSpeed > 0) remaining / currentSpeed else 0L

                            updateTask(task.id) {
                                it.copy(
                                    downloadedBytes = downloaded,
                                    speedBytesPerSec = currentSpeed,
                                    etaSeconds = eta
                                )
                            }
                        }
                    }

                    raf.close()

                    // Scan file into MediaStore
                    MediaScannerConnection.scanFile(
                        context,
                        arrayOf(targetFile.absolutePath),
                        arrayOf(task.mimeType),
                        null
                    )

                    updateTask(task.id) {
                        it.copy(
                            status = DownloadStatus.COMPLETED,
                            downloadedBytes = total,
                            totalBytes = total,
                            speedBytesPerSec = 0L,
                            etaSeconds = 0L
                        )
                    }
                }
            } catch (e: Exception) {
                if (e is CancellationException) {
                    // Task was cancelled or paused
                } else {
                    updateTask(task.id) {
                        it.copy(
                            status = DownloadStatus.FAILED,
                            errorMessage = e.localizedMessage ?: "Network error",
                            speedBytesPerSec = 0L
                        )
                    }
                }
            } finally {
                activeJobs.remove(task.id)
            }
        }

        activeJobs[task.id] = job
    }

    private fun updateTask(taskId: String, transform: (DownloadTask) -> DownloadTask) {
        val current = _tasks.value.toMutableList()
        val index = current.indexOfFirst { it.id == taskId }
        if (index != -1) {
            current[index] = transform(current[index])
            _tasks.value = current
        }
    }

    private fun updateTaskStatus(taskId: String, status: DownloadStatus) {
        updateTask(taskId) { it.copy(status = status, speedBytesPerSec = 0L) }
    }
}
