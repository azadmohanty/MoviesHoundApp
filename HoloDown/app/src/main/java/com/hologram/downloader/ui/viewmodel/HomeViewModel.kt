package com.hologram.downloader.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hologram.downloader.data.tmdb.TmdbClient
import com.hologram.downloader.data.tmdb.TmdbMedia
import com.hologram.downloader.scrapers.ScraperEngine
import com.hologram.downloader.scrapers.base.ScrapedArticle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class HomeViewModel(
    val tmdbClient: TmdbClient = TmdbClient(),
    val scraperEngine: ScraperEngine = ScraperEngine()
) : ViewModel() {

    private val _trendingMovies = MutableStateFlow<List<TmdbMedia>>(emptyList())
    val trendingMovies: StateFlow<List<TmdbMedia>> = _trendingMovies.asStateFlow()

    private val _trendingTv = MutableStateFlow<List<TmdbMedia>>(emptyList())
    val trendingTv: StateFlow<List<TmdbMedia>> = _trendingTv.asStateFlow()

    private val _scrapedSceneReleases = MutableStateFlow<List<ScrapedArticle>>(emptyList())
    val scrapedSceneReleases: StateFlow<List<ScrapedArticle>> = _scrapedSceneReleases.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _selectedMedia = MutableStateFlow<TmdbMedia?>(null)
    val selectedMedia: StateFlow<TmdbMedia?> = _selectedMedia.asStateFlow()

    init {
        loadHomeFeeds()
    }

    fun loadHomeFeeds() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                // 1. Fetch TMDb recommendations
                launch {
                    _trendingMovies.value = tmdbClient.getTrending("movie")
                }
                launch {
                    _trendingTv.value = tmdbClient.getTrending("tv")
                }
                // 2. Fetch Live Scraped Scene Releases (Vega + MoviesMod + MovieBox)
                launch {
                    _scrapedSceneReleases.value = scraperEngine.getLatestSceneReleases(1)
                }
            } catch (_: Exception) {}
            _isLoading.value = false
        }
    }

    fun selectMedia(media: TmdbMedia) {
        viewModelScope.launch {
            // Load full details with seasons/episodes if not loaded
            if (media.seasons.isEmpty() && !media.imdbId.isNullOrBlank()) {
                val full = tmdbClient.getDetails(media.id, media.mediaType, media.imdbId)
                _selectedMedia.value = full ?: media
            } else {
                _selectedMedia.value = media
            }
        }
    }

    fun clearSelectedMedia() {
        _selectedMedia.value = null
    }
}
