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

data class ScrapedOption(
    val id: String,
    val siteKey: String,
    val siteDisplayName: String,
    val qualityLabel: String = "720p",
    val ripFormat: String = "WEB-DL",
    val codec: String = "x264",
    val fileSize: String = "Unknown",
    val audioTracks: String = "Original",
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
    val baseUrl: String

    suspend fun search(query: String): List<ScrapedArticle>
    suspend fun getLatestReleases(page: Int = 1): List<ScrapedArticle>
    suspend fun parseArticleOptions(articleUrl: String): List<ScrapedOption>
    suspend fun resolveDirectStream(option: ScrapedOption): String?
}
