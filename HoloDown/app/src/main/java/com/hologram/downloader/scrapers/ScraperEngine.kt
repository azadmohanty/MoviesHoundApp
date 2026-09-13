package com.hologram.downloader.scrapers

import android.content.Context
import com.hologram.downloader.scrapers.base.FuzzyGateValidator
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.scrapers.base.ScraperProvider
import com.hologram.downloader.scrapers.extractors.HeadlessWebViewSniffer
import com.hologram.downloader.scrapers.providers.MovieBoxProvider
import com.hologram.downloader.scrapers.providers.MoviesModProvider
import com.hologram.downloader.scrapers.providers.VegaMoviesProvider
import kotlinx.coroutines.*

class ScraperEngine(
    val vegaProvider: VegaMoviesProvider = VegaMoviesProvider(),
    val moviesModProvider: MoviesModProvider = MoviesModProvider(),
    val movieBoxProvider: MovieBoxProvider = MovieBoxProvider()
) {
    val providers: List<ScraperProvider> = listOf(vegaProvider, moviesModProvider, movieBoxProvider)

    suspend fun searchAll(
        query: String,
        targetYear: Int? = null,
        isTvExpected: Boolean = false,
        imdbId: String? = null,
        category: String = "all",
        timeoutMs: Long = 8000L
    ): List<ScrapedArticle> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()

        val activeProviders = when (category) {
            "indian" -> listOf(vegaProvider, moviesModProvider)
            "hollywood" -> listOf(movieBoxProvider, vegaProvider, moviesModProvider)
            "anime", "asian" -> listOf(movieBoxProvider, vegaProvider)
            else -> providers
        }

        val allResults = mutableListOf<ScrapedArticle>()

        withTimeoutOrNull(timeoutMs) {
            val deferreds = activeProviders.map { provider ->
                async {
                    try {
                        provider.search(query)
                    } catch (_: Exception) {
                        emptyList()
                    }
                }
            }
            deferreds.awaitAll().forEach { allResults.addAll(it) }
        }

        // Apply 3-Gate Deterministic Validation
        val validated = allResults.map { article ->
            val score = FuzzyGateValidator.validateCandidate(
                queryTitle = query,
                targetTitle = article.title,
                targetYear = targetYear,
                isTvExpected = isTvExpected,
                queryImdbId = imdbId
            )
            article.copy(confidenceScore = score)
        }.filter { it.confidenceScore >= 45 }
         .sortedByDescending { it.confidenceScore }

        validated
    }

    suspend fun getLatestSceneReleases(page: Int = 1): List<ScrapedArticle> = withContext(Dispatchers.IO) {
        val list = mutableListOf<ScrapedArticle>()
        try {
            val vDeferred = async { vegaProvider.getLatestReleases(page) }
            val mDeferred = async { moviesModProvider.getLatestReleases(page) }
            val mbDeferred = async { movieBoxProvider.getLatestReleases(page) }

            list.addAll(vDeferred.await())
            list.addAll(mDeferred.await())
            list.addAll(mbDeferred.await())
        } catch (_: Exception) {}
        list.shuffled()
    }

    suspend fun parseArticle(article: ScrapedArticle): List<ScrapedOption> = withContext(Dispatchers.IO) {
        val provider = providers.find { it.siteKey == article.siteKey } ?: vegaProvider
        try {
            provider.parseArticleOptions(article.permalink)
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun resolveStream(
        option: ScrapedOption,
        context: Context? = null,
        timeoutMs: Long = 10000L
    ): String? = withContext(Dispatchers.IO) {
        val provider = providers.find { it.siteKey == option.siteKey } ?: vegaProvider

        // Tier 1: Fast Path HTTP Resolver
        try {
            val direct = provider.resolveDirectStream(option)
            if (!direct.isNullOrBlank()) {
                return@withContext direct
            }
        } catch (_: Exception) {}

        // Tier 2: Headless WebView Sniffer for JS timers/lockers
        if (context != null && !option.lockerUrl.startsWith("mbox://")) {
            try {
                val sniffer = HeadlessWebViewSniffer(context)
                val sniffed = sniffer.sniffMediaUrl(option.lockerUrl, timeoutMs)
                if (!sniffed.isNullOrBlank()) {
                    return@withContext sniffed
                }
            } catch (_: Exception) {}
        }

        null
    }
}
