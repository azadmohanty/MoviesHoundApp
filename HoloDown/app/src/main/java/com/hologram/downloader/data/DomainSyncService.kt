package com.hologram.downloader.data

import android.content.Context
import com.hologram.downloader.scrapers.base.BaseExtractor
import com.hologram.downloader.utils.StorageHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONObject

object DomainSyncService {

    private const val GITHUB_DOMAINS_URL =
        "https://raw.githubusercontent.com/azadmohanty/MoviesHoundApp/main/domains.json"

    const val CACHE_DURATION_MS = 90 * 60 * 1000L // 90 minutes

    suspend fun syncLatestDomainsFromGithub(
        context: Context,
        force: Boolean = false,
        onVegaUpdated: (String) -> Unit = {},
        onMoviesModUpdated: (String) -> Unit = {}
    ): Map<String, String> = withContext(Dispatchers.IO) {
        val storage = StorageHelper(context)
        val lastSync = storage.getLastDomainsSyncTimestamp()
        val now = System.currentTimeMillis()

        // 90-Minute cache check
        if (!force && (now - lastSync < CACHE_DURATION_MS)) {
            val currentPrefs = storage.getPreferences()
            if (currentPrefs.customVegaDomain.isNotBlank()) onVegaUpdated(currentPrefs.customVegaDomain)
            if (currentPrefs.customMoviesModDomain.isNotBlank()) onMoviesModUpdated(currentPrefs.customMoviesModDomain)
            return@withContext mapOf(
                "vegamovies" to currentPrefs.customVegaDomain,
                "moviesmod" to currentPrefs.customMoviesModDomain
            )
        }

        try {
            val req = Request.Builder()
                .url(GITHUB_DOMAINS_URL)
                .header("Cache-Control", "no-cache")
                .build()

            BaseExtractor.sharedOkHttpClient.newCall(req).execute().use { res ->
                if (!res.isSuccessful) {
                    val currentPrefs = storage.getPreferences()
                    return@withContext mapOf(
                        "vegamovies" to currentPrefs.customVegaDomain,
                        "moviesmod" to currentPrefs.customMoviesModDomain
                    )
                }
                val body = res.body?.string() ?: return@withContext emptyMap()
                val json = JSONObject(body)

                val vega = json.optString("vegamovies")
                val mmod = json.optString("moviesmod")

                val currentPrefs = storage.getPreferences()
                var updated = currentPrefs
                if (vega.isNotBlank()) {
                    updated = updated.copy(customVegaDomain = vega)
                    onVegaUpdated(vega)
                }
                if (mmod.isNotBlank()) {
                    updated = updated.copy(customMoviesModDomain = mmod)
                    onMoviesModUpdated(mmod)
                }
                storage.savePreferences(updated)
                storage.setDomainsSyncTimestamp(now)
                mapOf("vegamovies" to updated.customVegaDomain, "moviesmod" to updated.customMoviesModDomain)
            }
        } catch (_: Exception) {
            val currentPrefs = storage.getPreferences()
            mapOf("vegamovies" to currentPrefs.customVegaDomain, "moviesmod" to currentPrefs.customMoviesModDomain)
        }
    }
}
