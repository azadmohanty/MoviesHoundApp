package com.hologram.downloader.ui.viewmodel

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hologram.downloader.data.models.CategoryType
import com.hologram.downloader.scrapers.ScraperEngine
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.scrapers.base.SeriesEpisodeItem
import com.hologram.downloader.utils.IntentUtils
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DownloaderViewModel(
    private val scraperEngine: ScraperEngine = ScraperEngine()
) : ViewModel() {

    // Search query & category
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

    // Layer 2: Selected Post & Quality Options
    private val _activeArticle = MutableStateFlow<ScrapedArticle?>(null)
    val activeArticle: StateFlow<ScrapedArticle?> = _activeArticle.asStateFlow()

    private val _options = MutableStateFlow<List<ScrapedOption>>(emptyList())
    val options: StateFlow<List<ScrapedOption>> = _options.asStateFlow()

    // Quality Filter & Series Modes (Matching React Native Downloader)
    private val _selectedQuality = MutableStateFlow("720p")
    val selectedQuality: StateFlow<String> = _selectedQuality.asStateFlow()

    private val _selectedSeason = MutableStateFlow(1)
    val selectedSeason: StateFlow<Int> = _selectedSeason.asStateFlow()

    private val _seriesMode = MutableStateFlow("SINGLE_EPISODE") // "SINGLE_EPISODE" vs "SEASON_BATCH_ZIP"
    val seriesMode: StateFlow<String> = _seriesMode.asStateFlow()

    // Episodes state for Web Series
    private val _episodesLoading = MutableStateFlow(false)
    val episodesLoading: StateFlow<Boolean> = _episodesLoading.asStateFlow()

    private val _episodesList = MutableStateFlow<List<SeriesEpisodeItem>>(emptyList())
    val episodesList: StateFlow<List<SeriesEpisodeItem>> = _episodesList.asStateFlow()

    private val _resolvingOptionId = MutableStateFlow<String?>(null)
    val resolvingOptionId: StateFlow<String?> = _resolvingOptionId.asStateFlow()

    // Scraper logs matching React Native Downloader
    private val _statusLogs = MutableStateFlow<List<String>>(emptyList())
    val statusLogs: StateFlow<List<String>> = _statusLogs.asStateFlow()

    private var searchDebounceJob: Job? = null
    private var episodesJob: Job? = null

    private fun addLog(msg: String) {
        val list = _statusLogs.value.toMutableList()
        list.add(msg)
        if (list.size > 50) list.removeAt(0)
        _statusLogs.value = list
    }

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
            _activeArticle.value = null
            _options.value = emptyList()
            _episodesList.value = emptyList()
            addLog("Searching for \"$searchQ\"...")

            try {
                val results = scraperEngine.searchAll(
                    query = searchQ,
                    category = _category.value.key
                )
                _rawCards.value = results
                addLog("Found ${results.size} matching posts.")
            } catch (e: Exception) {
                addLog("Search error: ${e.localizedMessage}")
            } finally {
                _isSearching.value = false
            }
        }
    }

    fun selectArticle(article: ScrapedArticle) {
        viewModelScope.launch {
            _activeArticle.value = article
            _isResolving.value = true
            _options.value = emptyList()
            _episodesList.value = emptyList()
            addLog("Ingesting article: ${article.title}...")

            try {
                val parsed = scraperEngine.parseArticle(article)
                _options.value = parsed
                addLog("Extracted ${parsed.size} quality options from article.")

                // Set initial season from options if available
                val availableSeasons = parsed.mapNotNull { it.seasonNumber }.filter { it in 1..99 }.distinct().sorted()
                if (availableSeasons.isNotEmpty() && !availableSeasons.contains(_selectedSeason.value)) {
                    _selectedSeason.value = availableSeasons[0]
                }

                checkAndLoadEpisodes(parsed)
            } catch (e: Exception) {
                addLog("Article Ingest Error: ${e.localizedMessage}")
            } finally {
                _isResolving.value = false
            }
        }
    }

    fun setSelectedQuality(quality: String) {
        _selectedQuality.value = quality
        checkAndLoadEpisodes(_options.value)
    }

    fun setSelectedSeason(season: Int) {
        _selectedSeason.value = season
        checkAndLoadEpisodes(_options.value)
    }

    fun setSeriesMode(mode: String) {
        _seriesMode.value = mode
        if (mode == "SINGLE_EPISODE") {
            checkAndLoadEpisodes(_options.value)
        }
    }

    private fun checkAndLoadEpisodes(currentOptions: List<ScrapedOption>) {
        val isSeries = currentOptions.any { it.contentType == "SINGLE_EPISODE" || it.contentType == "SEASON_BATCH_ZIP" || it.isSeries }
        if (!isSeries || _seriesMode.value != "SINGLE_EPISODE") return

        val selQ = _selectedQuality.value.lowercase()
        val selSeason = _selectedSeason.value

        val activeSeriesOpt = currentOptions.find { opt ->
            opt.qualityLabel.lowercase() == selQ &&
            opt.contentType == "SINGLE_EPISODE" &&
            (opt.seasonNumber ?: 1) == selSeason
        } ?: currentOptions.find { opt ->
            opt.contentType == "SINGLE_EPISODE" && (opt.seasonNumber ?: 1) == selSeason
        } ?: currentOptions.find { opt ->
            opt.contentType == "SINGLE_EPISODE"
        }

        if (activeSeriesOpt != null) {
            loadEpisodes(activeSeriesOpt.lockerUrl, activeSeriesOpt.siteKey, selSeason)
        }
    }

    private fun loadEpisodes(portalUrl: String, siteKey: String, season: Int) {
        episodesJob?.cancel()
        episodesJob = viewModelScope.launch {
            _episodesLoading.value = true
            addLog("Fetching Season $season Episodes via ${siteKey.uppercase()}...")
            try {
                val eps = scraperEngine.fetchEpisodes(portalUrl, siteKey)
                _episodesList.value = eps
                addLog("Extracted ${eps.size} episodes.")
            } catch (e: Exception) {
                addLog("Failed to fetch episodes: ${e.localizedMessage}")
            } finally {
                _episodesLoading.value = false
            }
        }
    }

    fun resetToLayer1() {
        _activeArticle.value = null
        _options.value = emptyList()
        _episodesList.value = emptyList()
    }

    fun clearSearch() {
        _rawCards.value = emptyList()
        _activeArticle.value = null
        _options.value = emptyList()
        _episodesList.value = emptyList()
        _query.value = ""
    }

    /**
     * Resolve final download/stream URL and hand off to External App
     * Action: "download" (opens in default browser Brave/Chrome), "1dm" (launches 1DM/ADM), "copy" (copies link)
     */
    fun handleDownloadAction(
        context: Context,
        option: ScrapedOption,
        action: String = "download",
        customUrl: String? = null
    ) {
        val targetUrl = customUrl ?: option.lockerUrl
        viewModelScope.launch {
            _resolvingOptionId.value = option.id
            addLog("Unlocking server link for ${option.siteDisplayName}...")

            try {
                val resolvedUrl = scraperEngine.resolveStream(
                    option.copy(lockerUrl = targetUrl),
                    context
                ) ?: targetUrl

                addLog("Unlocked link ready: $resolvedUrl")

                when (action) {
                    "download" -> {
                        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUrl)).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        try {
                            context.startActivity(browserIntent)
                        } catch (e: Exception) {
                            Toast.makeText(context, "Could not open browser: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    }
                    "1dm" -> {
                        val title = _activeArticle.value?.title ?: option.episodeName
                        IntentUtils.sendToExternalDownloader(
                            context = context,
                            streamUrl = resolvedUrl,
                            title = title,
                            headers = option.headers
                        )
                    }
                    "copy" -> {
                        copyToClipboard(context, resolvedUrl)
                        Toast.makeText(context, "Link copied to clipboard!", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                addLog("Resolution failed: ${e.localizedMessage}")
                Toast.makeText(context, "Resolution failed: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                _resolvingOptionId.value = null
            }
        }
    }

    fun copyToClipboard(context: Context, text: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Download Link", text)
        clipboard.setPrimaryClip(clip)
    }
}
