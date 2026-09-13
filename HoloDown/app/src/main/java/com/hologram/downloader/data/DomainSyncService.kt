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

    suspend fun syncLatestDomainsFromGithub(
        context: Context,
        onVegaUpdated: (String) -> Unit,
        onMoviesModUpdated: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url(GITHUB_DOMAINS_URL)
                .header("Cache-Control", "no-cache")
                .build()

            BaseExtractor.sharedOkHttpClient.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@withContext
                val body = res.body?.string() ?: return@withContext
                val json = JSONObject(body)

                val vega = json.optString("vegamovies")
                val mmod = json.optString("moviesmod")

                val storage = StorageHelper(context)
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
            }
        } catch (_: Exception) {}
    }
}
