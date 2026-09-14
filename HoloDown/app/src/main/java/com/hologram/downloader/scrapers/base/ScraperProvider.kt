package com.hologram.downloader.scrapers.base

data class ScrapedArticle(
    val id: String,
    val title: String,
    val permalink: String,
    val posterUrl: String? = null,
    val siteKey: String,
    val siteDisplayName: String,
    val confidenceScore: Int = 100,
    val seasonTags: List<Int>? = null,
    val audioTracks: String? = null,
    val year: String? = null,
    val isSeries: Boolean = false
)

data class SeriesEpisodeItem(
    val episodeNumber: Int,
    val episodeTitle: String,
    val targetUrl: String,
    val buttonText: String = ""
)

data class ScrapedOption(
    val id: String,
    val siteKey: String,
    val siteDisplayName: String,
    val qualityLabel: String = "720p",
    val ripFormat: String = "WEB-DL",
    val codec: String = "x264",
    val fileSize: String = "Unknown",
    val audioTracks: String = "Original",
    val contentType: String = "MOVIE", // "MOVIE", "SINGLE_EPISODE", "SEASON_BATCH_ZIP"
    val isSeries: Boolean = false,
    val seasonNumber: Int = 1,
    val episodeNumber: Int? = null,
    val episodeName: String? = null,
    val lockerUrl: String,
    val directStreamUrl: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val priorityScore: Int = 5
)

interface ScraperProvider {
    val name: String
    val siteKey: String
    var baseUrl: String

    suspend fun search(query: String): List<ScrapedArticle>
    suspend fun getLatestReleases(page: Int = 1): List<ScrapedArticle>
    suspend fun parseArticleOptions(articleUrl: String): List<ScrapedOption>
    suspend fun fetchEpisodes(portalUrl: String): List<SeriesEpisodeItem> = emptyList()
    suspend fun resolveDirectStream(option: ScrapedOption): String?
}
