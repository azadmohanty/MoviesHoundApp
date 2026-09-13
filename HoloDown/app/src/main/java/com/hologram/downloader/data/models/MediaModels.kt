package com.hologram.downloader.data.models

enum class CategoryType(val key: String, val label: String) {
    ALL("all", "ALL"),
    HOLLYWOOD("hollywood", "HOLLYWOOD"),
    INDIAN("indian", "INDIAN"),
    ANIME("anime", "ANIME"),
    ASIAN("asian", "ASIAN")
}

data class DiscoveredMediaItem(
    val id: String,
    val title: String,
    val year: String? = null,
    val posterUrl: String? = null,
    val backdropUrl: String? = null,
    val rating: String? = null,
    val mediaType: String = "movie", // "movie" or "tv"
    val overview: String? = null,
    val genres: List<String> = emptyList(),
    val imdbId: String? = null
)

data class DiscoveredPostCard(
    val id: String,
    val title: String,
    val permalink: String,
    val posterUrl: String? = null,
    val siteKey: String,
    val siteDisplayName: String,
    val confidenceScore: Int = 100,
    val seasonTags: List<Int>? = null,
    val audioTracks: String? = null,
    val year: String? = null
)

data class UserPreferences(
    val defaultQuality: String = "720p",
    val scraperTimeoutMs: Long = 8000L,
    val tmdbApiKey: String = "",
    val customVegaDomain: String = "",
    val customMoviesModDomain: String = "",
    val autoPlayOnComplete: Boolean = true
)
