package com.hologram.downloader.data.tmdb

data class TmdbMedia(
    val id: String,
    val title: String,
    val overview: String? = null,
    val posterPath: String? = null,
    val backdropPath: String? = null,
    val releaseDate: String? = null,
    val voteAverage: Double? = null,
    val mediaType: String = "movie", // "movie" or "tv"
    val genreIds: List<Int> = emptyList(),
    val genres: List<String> = emptyList(),
    val imdbId: String? = null,
    val cast: List<String> = emptyList(),
    val seasons: List<TmdbSeason> = emptyList()
) {
    val year: String?
        get() = releaseDate?.take(4)

    val formattedRating: String
        get() = voteAverage?.let { String.format("%.1f", it) } ?: ""

    val fullPosterUrl: String?
        get() = when {
            posterPath.isNullOrBlank() -> null
            posterPath.startsWith("http") -> posterPath
            else -> "https://image.tmdb.org/t/p/w500$posterPath"
        }

    val fullBackdropUrl: String?
        get() = when {
            backdropPath.isNullOrBlank() -> null
            backdropPath.startsWith("http") -> backdropPath
            else -> "https://image.tmdb.org/t/p/w780$backdropPath"
        }
}

data class TmdbSeason(
    val seasonNumber: Int,
    val name: String,
    val episodeCount: Int,
    val episodes: List<TmdbEpisode> = emptyList()
)

data class TmdbEpisode(
    val episodeNumber: Int,
    val name: String,
    val overview: String? = null,
    val stillPath: String? = null
)
