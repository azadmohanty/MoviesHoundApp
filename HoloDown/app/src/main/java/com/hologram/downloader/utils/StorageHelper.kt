package com.hologram.downloader.utils

import android.content.Context
import android.content.SharedPreferences
import com.hologram.downloader.data.models.UserPreferences
import org.json.JSONArray
import org.json.JSONObject

class StorageHelper(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("holodown_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_WATCHLIST = "watchlist_items"
        private const val KEY_SEARCH_HISTORY = "search_history"
        private const val KEY_DEFAULT_QUALITY = "default_quality"
        private const val KEY_TIMEOUT = "scraper_timeout"
        private const val KEY_TMDB_KEY = "tmdb_api_key"
        private const val KEY_VEGA_DOMAIN = "vega_domain"
        private const val KEY_MOVIESMOD_DOMAIN = "moviesmod_domain"
    }

    fun getPreferences(): UserPreferences {
        return UserPreferences(
            defaultQuality = prefs.getString(KEY_DEFAULT_QUALITY, "720p") ?: "720p",
            scraperTimeoutMs = prefs.getLong(KEY_TIMEOUT, 8000L),
            tmdbApiKey = prefs.getString(KEY_TMDB_KEY, "") ?: "",
            customVegaDomain = prefs.getString(KEY_VEGA_DOMAIN, "https://new2.vegamovies.futbol") ?: "https://new2.vegamovies.futbol",
            customMoviesModDomain = prefs.getString(KEY_MOVIESMOD_DOMAIN, "https://moviesmod.zone") ?: "https://moviesmod.zone"
        )
    }

    fun savePreferences(p: UserPreferences) {
        prefs.edit()
            .putString(KEY_DEFAULT_QUALITY, p.defaultQuality)
            .putLong(KEY_TIMEOUT, p.scraperTimeoutMs)
            .putString(KEY_TMDB_KEY, p.tmdbApiKey)
            .putString(KEY_VEGA_DOMAIN, p.customVegaDomain)
            .putString(KEY_MOVIESMOD_DOMAIN, p.customMoviesModDomain)
            .apply()
    }

    fun getSearchHistory(): List<String> {
        val raw = prefs.getString(KEY_SEARCH_HISTORY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val list = mutableListOf<String>()
            for (i in 0 until arr.length()) {
                list.add(arr.getString(i))
            }
            list
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun addSearchQuery(query: String) {
        if (query.isBlank()) return
        val current = getSearchHistory().toMutableList()
        current.remove(query)
        current.add(0, query)
        val trimmed = current.take(15)
        val arr = JSONArray(trimmed)
        prefs.edit().putString(KEY_SEARCH_HISTORY, arr.toString()).apply()
    }

    fun clearSearchHistory() {
        prefs.edit().remove(KEY_SEARCH_HISTORY).apply()
    }

    fun getWatchlist(): List<String> {
        val raw = prefs.getString(KEY_WATCHLIST, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val list = mutableListOf<String>()
            for (i in 0 until arr.length()) {
                list.add(arr.getString(i))
            }
            list
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun toggleWatchlist(title: String): Boolean {
        val list = getWatchlist().toMutableList()
        val exists = list.contains(title)
        if (exists) {
            list.remove(title)
        } else {
            list.add(0, title)
        }
        val arr = JSONArray(list)
        prefs.edit().putString(KEY_WATCHLIST, arr.toString()).apply()
        return !exists
    }
}
