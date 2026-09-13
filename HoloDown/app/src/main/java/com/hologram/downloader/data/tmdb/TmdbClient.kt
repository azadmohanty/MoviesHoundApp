package com.hologram.downloader.data.tmdb

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class TmdbClient(
    private var apiKey: String = "",
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
) {
    private val cinemetaBase = "https://v3-cinemeta.strem.io"
    private val tmdbBase = "https://api.themoviedb.org/3"

    fun updateApiKey(key: String) {
        apiKey = key
    }

    suspend fun getTrending(mediaType: String = "movie"): List<TmdbMedia> = withContext(Dispatchers.IO) {
        if (apiKey.isNotBlank()) {
            fetchTmdbList("$tmdbBase/trending/$mediaType/week?api_key=$apiKey", mediaType)
        } else {
            fetchCinemetaCatalog(if (mediaType == "tv") "series" else "movie")
        }
    }

    suspend fun getPopular(mediaType: String = "movie"): List<TmdbMedia> = withContext(Dispatchers.IO) {
        if (apiKey.isNotBlank()) {
            fetchTmdbList("$tmdbBase/$mediaType/popular?api_key=$apiKey", mediaType)
        } else {
            fetchCinemetaCatalog(if (mediaType == "tv") "series" else "movie")
        }
    }

    suspend fun getTopRated(mediaType: String = "movie"): List<TmdbMedia> = withContext(Dispatchers.IO) {
        if (apiKey.isNotBlank()) {
            fetchTmdbList("$tmdbBase/$mediaType/top_rated?api_key=$apiKey", mediaType)
        } else {
            fetchCinemetaCatalog(if (mediaType == "tv") "series" else "movie")
        }
    }

    suspend fun search(query: String): List<TmdbMedia> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        if (apiKey.isNotBlank()) {
            fetchTmdbList("$tmdbBase/search/multi?api_key=$apiKey&query=${java.net.URLEncoder.encode(query, "UTF-8")}", "movie")
        } else {
            // Cinemeta search
            try {
                val url = "$cinemetaBase/catalog/movie/top/search=${java.net.URLEncoder.encode(query, "UTF-8")}.json"
                val request = Request.Builder().url(url).build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext emptyList()
                    val body = response.body?.string() ?: return@withContext emptyList()
                    val json = JSONObject(body)
                    val metas = json.optJSONArray("metas") ?: return@withContext emptyList()
                    parseCinemetaMetas(metas, "movie")
                }
            } catch (e: Exception) {
                emptyList()
            }
        }
    }

    suspend fun getDetails(id: String, mediaType: String, imdbId: String? = null): TmdbMedia? = withContext(Dispatchers.IO) {
        try {
            if (apiKey.isNotBlank() && id.isNotBlank()) {
                val url = "$tmdbBase/$mediaType/$id?api_key=$apiKey&append_to_response=credits,external_ids"
                val request = Request.Builder().url(url).build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val body = response.body?.string() ?: return@withContext null
                    val json = JSONObject(body)
                    parseTmdbItem(json, mediaType)
                }
            } else if (!imdbId.isNullOrBlank()) {
                val cinemetaType = if (mediaType == "tv" || mediaType == "series") "series" else "movie"
                val url = "$cinemetaBase/meta/$cinemetaType/$imdbId.json"
                val request = Request.Builder().url(url).build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val body = response.body?.string() ?: return@withContext null
                    val json = JSONObject(body)
                    val meta = json.optJSONObject("meta") ?: return@withContext null
                    parseCinemetaItem(meta, mediaType)
                }
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun fetchTmdbList(url: String, defaultType: String): List<TmdbMedia> {
        try {
            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val json = JSONObject(body)
                val results = json.optJSONArray("results") ?: return emptyList()
                val list = mutableListOf<TmdbMedia>()
                for (i in 0 until results.length()) {
                    val item = results.optJSONObject(i) ?: continue
                    val mType = item.optString("media_type", defaultType)
                    list.add(parseTmdbItem(item, mType))
                }
                return list
            }
        } catch (e: Exception) {
            return emptyList()
        }
    }

    private fun fetchCinemetaCatalog(type: String): List<TmdbMedia> {
        try {
            val url = "$cinemetaBase/catalog/$type/top.json"
            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val body = response.body?.string() ?: return emptyList()
                val json = JSONObject(body)
                val metas = json.optJSONArray("metas") ?: return emptyList()
                return parseCinemetaMetas(metas, if (type == "series") "tv" else "movie")
            }
        } catch (e: Exception) {
            return emptyList()
        }
    }

    private fun parseCinemetaMetas(metas: JSONArray, mediaType: String): List<TmdbMedia> {
        val list = mutableListOf<TmdbMedia>()
        for (i in 0 until metas.length()) {
            val meta = metas.optJSONObject(i) ?: continue
            list.add(parseCinemetaItem(meta, mediaType))
        }
        return list
    }

    private fun parseCinemetaItem(meta: JSONObject, mediaType: String): TmdbMedia {
        val id = meta.optString("id", "")
        val title = meta.optString("name", meta.optString("title", "Unknown"))
        val poster = meta.optString("poster", "")
        val background = meta.optString("background", "")
        val year = meta.optString("year", "")
        val imdbRating = meta.optString("imdbRating", "").toDoubleOrNull()
        val description = meta.optString("description", "")
        val imdbId = if (id.startsWith("tt")) id else null

        val genresList = mutableListOf<String>()
        val genresArr = meta.optJSONArray("genres") ?: meta.optJSONArray("genre")
        if (genresArr != null) {
            for (g in 0 until genresArr.length()) {
                genresList.add(genresArr.optString(g))
            }
        }

        val castList = mutableListOf<String>()
        val castArr = meta.optJSONArray("cast")
        if (castArr != null) {
            for (c in 0 until castArr.length()) {
                castList.add(castArr.optString(c))
            }
        }

        // Videos / Episodes
        val seasonsMap = mutableMapOf<Int, MutableList<TmdbEpisode>>()
        val videosArr = meta.optJSONArray("videos")
        if (videosArr != null) {
            for (v in 0 until videosArr.length()) {
                val vObj = videosArr.optJSONObject(v) ?: continue
                val se = vObj.optInt("season", 1)
                val ep = vObj.optInt("episode", 1)
                val name = vObj.optString("name", vObj.optString("title", "Episode $ep"))
                val still = vObj.optString("thumbnail", "")
                val epList = seasonsMap.getOrPut(se) { mutableListOf() }
                epList.add(TmdbEpisode(ep, name, stillPath = still))
            }
        }

        val seasons = seasonsMap.map { (seNum, eps) ->
            TmdbSeason(seNum, "Season $seNum", eps.size, eps.sortedBy { it.episodeNumber })
        }.sortedBy { it.seasonNumber }

        return TmdbMedia(
            id = id,
            title = title,
            overview = description,
            posterPath = poster,
            backdropPath = background,
            releaseDate = year,
            voteAverage = imdbRating,
            mediaType = if (meta.optString("type") == "series") "tv" else mediaType,
            genres = genresList,
            imdbId = imdbId,
            cast = castList,
            seasons = seasons
        )
    }

    private fun parseTmdbItem(item: JSONObject, mediaType: String): TmdbMedia {
        val id = item.optLong("id", 0).toString()
        val title = item.optString("title", item.optString("name", "Unknown"))
        val overview = item.optString("overview", "")
        val poster = item.optString("poster_path", "")
        val backdrop = item.optString("backdrop_path", "")
        val releaseDate = item.optString("release_date", item.optString("first_air_date", ""))
        val voteAverage = item.optDouble("vote_average", 0.0)

        val extIds = item.optJSONObject("external_ids")
        val imdbId = extIds?.optString("imdb_id")?.takeIf { it.isNotBlank() }

        val castList = mutableListOf<String>()
        val credits = item.optJSONObject("credits")
        val castArr = credits?.optJSONArray("cast")
        if (castArr != null) {
            for (i in 0 until minOf(castArr.length(), 6)) {
                castArr.optJSONObject(i)?.optString("name")?.let { castList.add(it) }
            }
        }

        return TmdbMedia(
            id = id,
            title = title,
            overview = overview,
            posterPath = poster,
            backdropPath = backdrop,
            releaseDate = releaseDate,
            voteAverage = voteAverage,
            mediaType = mediaType,
            imdbId = imdbId,
            cast = castList
        )
    }
}
