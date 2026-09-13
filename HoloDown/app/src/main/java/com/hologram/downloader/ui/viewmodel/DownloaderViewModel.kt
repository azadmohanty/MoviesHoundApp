package com.hologram.downloader.ui.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hologram.downloader.data.models.CategoryType
import com.hologram.downloader.data.models.DownloadStatus
import com.hologram.downloader.data.models.DownloadTask
import com.hologram.downloader.scrapers.ScraperEngine
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.service.DownloadManager
import com.hologram.downloader.utils.IntentUtils
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DownloaderViewModel(
    private val scraperEngine: ScraperEngine = ScraperEngine(),
    private val downloadManager: DownloadManager
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _category = MutableStateFlow(CategoryType.ALL)
    val category: StateFlow<CategoryType> = _category.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _isResolving = MutableStateFlow(false)
    val isResolving: StateFlow<Boolean> = _isResolving.asStateFlow()

    // Layer 1: Discovered Posts
    private val _rawCards = MutableStateFlow<List<ScrapedArticle>>(emptyList())
    val rawCards: StateFlow<List<ScrapedArticle>> = _rawCards.asStateFlow()

    // Layer 2: Scraped Quality & Episode Options
    private val _activeArticle = MutableStateFlow<ScrapedArticle?>(null)
    val activeArticle: StateFlow<ScrapedArticle?> = _activeArticle.asStateFlow()

    private val _options = MutableStateFlow<List<ScrapedOption>>(emptyList())
    val options: StateFlow<List<ScrapedOption>> = _options.asStateFlow()

    val allTasks: StateFlow<List<DownloadTask>> = downloadManager.tasks

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

    private val _safetyBrowserUrl = MutableStateFlow<String?>(null)
    val safetyBrowserUrl: StateFlow<String?> = _safetyBrowserUrl.asStateFlow()

    private var searchDebounceJob: Job? = null

    fun setQuery(q: String) {
        _query.value = q
    }

    fun setCategory(cat: CategoryType) {
        _category.value = cat
        if (_query.value.isNotBlank()) {
            triggerSearch(_query.value)
        }
    }

    fun triggerSearch(q: String? = null) {
        val searchQ = q ?: _query.value
        if (searchQ.isBlank()) return

        searchDebounceJob?.cancel()
        searchDebounceJob = viewModelScope.launch {
            _isSearching.value = true
            _statusMessage.value = "Searching providers..."
            _activeArticle.value = null
            _options.value = emptyList()

            try {
                val results = scraperEngine.searchAll(
                    query = searchQ,
                    category = _category.value.key
                )
                _rawCards.value = results
                _statusMessage.value = if (results.isNotEmpty()) "Found ${results.size} matches" else "No matches found"
            } catch (e: Exception) {
                _statusMessage.value = "Search error: ${e.localizedMessage}"
            }
            _isSearching.value = false
        }
    }

    fun selectArticle(article: ScrapedArticle) {
        viewModelScope.launch {
            _activeArticle.value = article
            _isResolving.value = true
            _statusMessage.value = "Parsing download links for ${article.title}..."

            try {
                val parsed = scraperEngine.parseArticle(article)
                _options.value = parsed
                _statusMessage.value = "Parsed ${parsed.size} quality options"
            } catch (e: Exception) {
                _statusMessage.value = "Parse error: ${e.localizedMessage}"
            }
            _isResolving.value = false
        }
    }

    fun resetToLayer1() {
        _activeArticle.value = null
        _options.value = emptyList()
        _statusMessage.value = null
    }

    fun downloadNative(option: ScrapedOption, context: Context) {
        viewModelScope.launch {
            _statusMessage.value = "Resolving stream link..."
            val streamUrl = scraperEngine.resolveStream(option, context)
            if (!streamUrl.isNullOrBlank()) {
                val title = _activeArticle.value?.title ?: option.episodeName ?: "Downloaded Media"
                val task = downloadManager.enqueueDownload(
                    title = title,
                    streamUrl = streamUrl,
                    quality = option.qualityLabel,
                    providerName = option.siteDisplayName,
                    headers = option.headers
                )
                _statusMessage.value = "Download started: ${task.title}"
            } else {
                // Open Tier 3 Safety Valve Browser Sheet
                _safetyBrowserUrl.value = option.lockerUrl
                _statusMessage.value = "Opening safety browser..."
            }
        }
    }

    fun sendTo1DM(option: ScrapedOption, context: Context) {
        viewModelScope.launch {
            _statusMessage.value = "Resolving link for 1DM..."
            val streamUrl = scraperEngine.resolveStream(option, context) ?: option.lockerUrl
            val title = _activeArticle.value?.title ?: option.episodeName
            IntentUtils.sendToExternalDownloader(
                context = context,
                streamUrl = streamUrl,
                title = title,
                headers = option.headers
            )
        }
    }

    fun onSafetyCaptured(capturedUrl: String) {
        _safetyBrowserUrl.value = null
        val title = _activeArticle.value?.title ?: "Captured Video"
        downloadManager.enqueueDownload(
            title = title,
            streamUrl = capturedUrl,
            quality = "1080p",
            providerName = "Captured"
        )
        _statusMessage.value = "Captured & enqueued: $title"
    }

    fun dismissSafetyBrowser() {
        _safetyBrowserUrl.value = null
    }

    fun pauseTask(taskId: String) = downloadManager.pauseDownload(taskId)
    fun resumeTask(taskId: String) = downloadManager.resumeDownload(taskId)
    fun cancelTask(taskId: String) = downloadManager.cancelDownload(taskId)
    fun deleteTask(taskId: String) = downloadManager.deleteCompletedDownload(taskId)
}
