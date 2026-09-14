package com.hologram.downloader.scrapers.providers

import com.hologram.downloader.data.models.DownloadTask
import com.hologram.downloader.scrapers.base.BaseExtractor
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.scrapers.base.ScraperProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MovieBoxProvider : BaseExtractor(), ScraperProvider {

    override val name: String = "MovieBox"
    override val siteKey: String = "moviebox"
    override val baseUrl: String = "https://h5-api.aoneroom.com/wefeed-h5api-bff"

    private var guestToken: String? = null
    private var playerDomain: String = "https://netfilm.world"

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private val defaultHeaders = mapOf(
        "User-Agent" to DEFAULT_UA,
        "Referer" to "https://moviebox.ph/",
        "Origin" to "https://moviebox.ph",
        "X-Client-Info" to """{"timezone":"Asia/Dhaka"}""",
        "X-Request-Lang" to "en",
        "Accept" to "application/json"
    )

    private suspend fun getGuestToken(): String? = withContext(Dispatchers.IO) {
        if (!guestToken.isNullOrBlank()) return@withContext guestToken
        try {
            val req = Request.Builder()
                .url("$baseUrl/home?host=moviebox.ph")
                .apply { defaultHeaders.forEach { (k, v) -> header(k, v) } }
                .build()

            sharedOkHttpClient.newCall(req).execute().use { res ->
                val xUser = res.header("x-user") ?: res.header("X-User")
                if (!xUser.isNullOrBlank()) {
                    val jsonObj = JSONObject(xUser)
                    val token = jsonObj.optString("token")
                    if (token.isNotBlank()) {
                        guestToken = token
                        return@withContext token
                    }
                }
            }
        } catch (_: Exception) {}
        guestToken
    }

    override suspend fun search(query: String): List<ScrapedArticle> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        val results = mutableListOf<ScrapedArticle>()

        try {
            val token = getGuestToken()
            val payload = JSONObject().apply {
                put("keyword", query)
                put("page", 1)
                put("perPage", 15)
            }.toString().toRequestBody(jsonMedia)

            val reqBuilder = Request.Builder()
                .url("$baseUrl/subject/search")
                .apply { defaultHeaders.forEach { (k, v) -> header(k, v) } }
                .post(payload)

            if (!token.isNullOrBlank()) {
                reqBuilder.header("Authorization", "Bearer $token")
            }

            sharedOkHttpClient.newCall(reqBuilder.build()).execute().use { res ->
                if (!res.isSuccessful) return@withContext emptyList()
                val body = res.body?.string() ?: return@withContext emptyList()
                val json = JSONObject(body)
                val data = json.optJSONObject("data") ?: return@withContext emptyList()
                val items = data.optJSONArray("items") ?: data.optJSONArray("list") ?: return@withContext emptyList()

                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    val title = item.optString("title", "Unknown")
                    val subjectId = item.optString("subjectId")
                    val slug = item.optString("detailPath")
                    val cover = item.optJSONObject("cover")?.optString("url") ?: ""
                    val release = item.optString("releaseDate")
                    val year = if (release.length >= 4) release.substring(0, 4) else null

                    results.add(
                        ScrapedArticle(
                            id = "mbox-$subjectId",
                            title = title,
                            permalink = "mbox://$subjectId/$slug",
                            posterUrl = cover,
                            siteKey = siteKey,
                            siteDisplayName = name,
                            year = year,
                            isSeries = slug.contains("series", true) || slug.contains("tv", true)
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        results
    }

    override suspend fun getLatestReleases(page: Int): List<ScrapedArticle> = withContext(Dispatchers.IO) {
        val releases = mutableListOf<ScrapedArticle>()
        try {
            val token = getGuestToken()
            val payload = JSONObject().apply {
                put("tabId", 1) // Movies tab
                put("filter", JSONObject().apply { put("sort", "RECOMMEND") })
                put("page", page)
                put("perPage", 20)
            }.toString().toRequestBody(jsonMedia)

            val reqBuilder = Request.Builder()
                .url("$baseUrl/subject/filter")
                .apply { defaultHeaders.forEach { (k, v) -> header(k, v) } }
                .post(payload)

            if (!token.isNullOrBlank()) reqBuilder.header("Authorization", "Bearer $token")

            sharedOkHttpClient.newCall(reqBuilder.build()).execute().use { res ->
                if (!res.isSuccessful) return@withContext emptyList()
                val body = res.body?.string() ?: return@withContext emptyList()
                val json = JSONObject(body)
                val data = json.optJSONObject("data") ?: return@withContext emptyList()
                val items = data.optJSONArray("items") ?: return@withContext emptyList()

                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    val title = item.optString("title", "Unknown")
                    val subjectId = item.optString("subjectId")
                    val slug = item.optString("detailPath")
                    val cover = item.optJSONObject("cover")?.optString("url") ?: ""

                    releases.add(
                        ScrapedArticle(
                            id = "mbox-latest-$subjectId",
                            title = title,
                            permalink = "mbox://$subjectId/$slug",
                            posterUrl = cover,
                            siteKey = siteKey,
                            siteDisplayName = name,
                            isSeries = false
                        )
                    )
                }
            }
        } catch (_: Exception) {}
        releases
    }

    override suspend fun parseArticleOptions(articleUrl: String): List<ScrapedOption> = withContext(Dispatchers.IO) {
        val options = mutableListOf<ScrapedOption>()
        try {
            // articleUrl format: mbox://{subjectId}/{detailPath}
            val subjectId = articleUrl.removePrefix("mbox://").substringBefore("/")
            val detailPath = articleUrl.removePrefix("mbox://").substringAfter("/")

            val token = getGuestToken()
            val playUrl = "$playerDomain/wefeed-h5api-bff/subject/play?subjectId=$subjectId&se=1&ep=1&detailPath=$detailPath"

            val reqBuilder = Request.Builder()
                .url(playUrl)
                .apply { defaultHeaders.forEach { (k, v) -> header(k, v) } }

            if (!token.isNullOrBlank()) reqBuilder.header("Authorization", "Bearer $token")

            sharedOkHttpClient.newCall(reqBuilder.build()).execute().use { res ->
                if (!res.isSuccessful) return@withContext emptyList()
                val body = res.body?.string() ?: return@withContext emptyList()
                val json = JSONObject(body)
                val data = json.optJSONObject("data") ?: return@withContext emptyList()
                val streams = data.optJSONArray("streams") ?: return@withContext emptyList()

                for (i in 0 until streams.length()) {
                    val stream = streams.optJSONObject(i) ?: continue
                    val resText = stream.optString("resolutions", "1080") + "p"
                    val streamUrl = stream.optString("url")
                    val sizeBytes = stream.optLong("size", 0L)
                    val sizeStr = if (sizeBytes > 0) DownloadTask.formatBytes(sizeBytes) else "Direct MP4"

                    if (streamUrl.isNotBlank()) {
                        options.add(
                            ScrapedOption(
                                id = "opt-mbox-$i",
                                siteKey = siteKey,
                                siteDisplayName = name,
                                qualityLabel = resText,
                                ripFormat = "WEB-DL MP4",
                                codec = stream.optString("codecName", "h264"),
                                fileSize = sizeStr,
                                audioTracks = "Original Audio",
                                lockerUrl = streamUrl,
                                directStreamUrl = streamUrl,
                                priorityScore = 1
                            )
                        )
                    }
                }
            }
        } catch (_: Exception) {}
        options
    }

    override suspend fun resolveDirectStream(option: ScrapedOption): String? {
        return option.directStreamUrl ?: option.lockerUrl
    }
}
