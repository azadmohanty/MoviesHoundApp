package com.hologram.downloader.ui.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hologram.downloader.data.models.UserPreferences
import com.hologram.downloader.scrapers.ScraperEngine
import com.hologram.downloader.scrapers.base.BaseExtractor
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.utils.StorageHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request

class MeViewModel(
    private val context: Context,
    private val scraperEngine: ScraperEngine = ScraperEngine(),
    private val storageHelper: StorageHelper = StorageHelper(context)
) : ViewModel() {

    private val _testUrl = MutableStateFlow("")
    val testUrl: StateFlow<String> = _testUrl.asStateFlow()

    private val _testResult = MutableStateFlow<String?>(null)
    val testResult: StateFlow<String?> = _testResult.asStateFlow()

    private val _isTesting = MutableStateFlow(false)
    val isTesting: StateFlow<Boolean> = _isTesting.asStateFlow()

    private val _domainPings = MutableStateFlow<Map<String, Long?>>(emptyMap())
    val domainPings: StateFlow<Map<String, Long?>> = _domainPings.asStateFlow()

    private val _preferences = MutableStateFlow(storageHelper.getPreferences())
    val preferences: StateFlow<UserPreferences> = _preferences.asStateFlow()

    private val _watchlist = MutableStateFlow(storageHelper.getWatchlist())
    val watchlist: StateFlow<List<String>> = _watchlist.asStateFlow()

    private val _searchHistory = MutableStateFlow(storageHelper.getSearchHistory())
    val searchHistory: StateFlow<List<String>> = _searchHistory.asStateFlow()

    init {
        pingAllDomains()
    }

    fun setTestUrl(url: String) {
        _testUrl.value = url
    }

    fun testLink(context: Context) {
        val url = _testUrl.value.trim()
        if (url.isBlank()) return

        viewModelScope.launch {
            _isTesting.value = true
            _testResult.value = "Testing link..."

            try {
                val dummyOption = ScrapedOption(
                    id = "test-link",
                    siteKey = if (url.contains("moviesmod")) "moviesmod" else "vegamovies",
                    siteDisplayName = "Tester",
                    lockerUrl = url
                )
                val resolved = scraperEngine.resolveStream(dummyOption, context)
                if (!resolved.isNullOrBlank()) {
                    _testResult.value = "SUCCESS: Streamable Link Resolved!\n$resolved"
                } else {
                    _testResult.value = "FAILED: Could not extract direct video URL from this locker link."
                }
            } catch (e: Exception) {
                _testResult.value = "ERROR: ${e.localizedMessage}"
            }
            _isTesting.value = false
        }
    }

    fun pingAllDomains() {
        viewModelScope.launch {
            val domains = mapOf(
                "VegaMovies" to scraperEngine.vegaProvider.baseUrl,
                "MoviesMod" to scraperEngine.moviesModProvider.baseUrl,
                "MovieBox" to "https://h5-api.aoneroom.com"
            )

            val pings = mutableMapOf<String, Long?>()
            domains.forEach { (name, url) ->
                pings[name] = pingSingleDomain(url)
            }
            _domainPings.value = pings
        }
    }

    private suspend fun pingSingleDomain(url: String): Long? = withContext(Dispatchers.IO) {
        try {
            val start = System.currentTimeMillis()
            val req = Request.Builder().url(url).head().build()
            BaseExtractor.sharedOkHttpClient.newCall(req).execute().use { res ->
                if (res.isSuccessful || res.code in 300..499) {
                    System.currentTimeMillis() - start
                } else null
            }
        } catch (_: Exception) {
            null
        }
    }

    fun updatePreferences(newPrefs: UserPreferences) {
        _preferences.value = newPrefs
        storageHelper.savePreferences(newPrefs)
        scraperEngine.vegaProvider.baseUrl = newPrefs.customVegaDomain
        scraperEngine.moviesModProvider.baseUrl = newPrefs.customMoviesModDomain
    }

    fun clearSearchHistory() {
        storageHelper.clearSearchHistory()
        _searchHistory.value = emptyList()
    }
}
