package com.hologram.downloader.scrapers.base

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.net.URI
import java.util.concurrent.TimeUnit

open class BaseExtractor {

    companion object {
        const val DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

        val sharedOkHttpClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .cookieJar(object : CookieJar {
                private val cookieStore = mutableMapOf<String, List<Cookie>>()
                override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                    cookieStore[url.host] = cookies
                }
                override fun loadForRequest(url: HttpUrl): List<Cookie> {
                    return cookieStore[url.host] ?: emptyList()
                }
            })
            .build()

        fun cleanText(raw: String?): String {
            if (raw == null) return ""
            return raw.replace(Regex("<[^>]+>"), "")
                .replace("&amp;", "&")
                .replace("&#8211;", "-")
                .replace("&nbsp;", " ")
                .replace(Regex("\\s+"), " ")
                .trim()
        }

        fun normalizeQuality(raw: String?): String {
            if (raw.isNullOrBlank()) return "720p"
            val lower = raw.trim().lowercase()
            return when {
                lower.contains("4k") || lower.contains("2160") -> "4K"
                lower.contains("2k") || lower.contains("1440") -> "2K"
                lower.contains("1080") -> "1080p"
                lower.contains("720") -> "720p"
                lower.contains("480") -> "480p"
                else -> "720p"
            }
        }

        fun b64decode(str: String): String {
            return try {
                val clean = str.trim()
                val decoded1 = String(Base64.decode(clean, Base64.DEFAULT), Charsets.UTF_8)
                try {
                    val decoded2 = String(Base64.decode(decoded1, Base64.DEFAULT), Charsets.UTF_8)
                    if (decoded2.startsWith("http")) return decoded2
                } catch (_: Exception) {}
                decoded1
            } catch (e: Exception) {
                str
            }
        }

        fun isStreamableVideoUrl(url: String?): Boolean {
            if (url.isNullOrBlank()) return false
            val lower = url.lowercase()
            return lower.endsWith(".mp4") ||
                   lower.endsWith(".mkv") ||
                   lower.endsWith(".m4v") ||
                   lower.contains(".mkv?") ||
                   lower.contains(".mp4?") ||
                   lower.contains("r2.cloudflarestorage.com") ||
                   lower.contains("pixeldrain.com/api/file") ||
                   lower.contains("fastdl") ||
                   lower.contains("fsl") ||
                   lower.contains("driveseed") ||
                   lower.contains("hubcloud")
        }

        fun getBaseUrl(url: String): String {
            return try {
                val uri = URI(url)
                "${uri.scheme}://${uri.host}"
            } catch (e: Exception) {
                url
            }
        }
    }

    suspend fun fetchHtml(url: String, headers: Map<String, String> = emptyMap()): Document? = withContext(Dispatchers.IO) {
        try {
            val reqBuilder = Request.Builder()
                .url(url)
                .header("User-Agent", DEFAULT_UA)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

            headers.forEach { (k, v) -> reqBuilder.header(k, v) }

            sharedOkHttpClient.newCall(reqBuilder.build()).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                Jsoup.parse(body, url)
            }
        } catch (e: Exception) {
            null
        }
    }

    suspend fun fetchRaw(url: String, headers: Map<String, String> = emptyMap()): String? = withContext(Dispatchers.IO) {
        try {
            val reqBuilder = Request.Builder()
                .url(url)
                .header("User-Agent", DEFAULT_UA)

            headers.forEach { (k, v) -> reqBuilder.header(k, v) }

            sharedOkHttpClient.newCall(reqBuilder.build()).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                response.body?.string()
            }
        } catch (e: Exception) {
            null
        }
    }

    suspend fun resolveRedirect(url: String, headers: Map<String, String> = emptyMap()): String = withContext(Dispatchers.IO) {
        var currentUrl = url
        var loop = 0
        while (loop < 5) {
            try {
                val reqBuilder = Request.Builder()
                    .url(currentUrl)
                    .header("User-Agent", DEFAULT_UA)
                    .head()
                headers.forEach { (k, v) -> reqBuilder.header(k, v) }

                val noRedirectClient = sharedOkHttpClient.newBuilder()
                    .followRedirects(false)
                    .followSslRedirects(false)
                    .build()

                noRedirectClient.newCall(reqBuilder.build()).execute().use { res ->
                    if (res.code in 300..399) {
                        val loc = res.header("Location")
                        if (!loc.isNullOrBlank()) {
                            currentUrl = if (loc.startsWith("http")) loc else getBaseUrl(currentUrl) + loc
                        } else {
                            return@withContext currentUrl
                        }
                    } else {
                        return@withContext currentUrl
                    }
                }
                loop++
            } catch (e: Exception) {
                return@withContext currentUrl
            }
        }
        currentUrl
    }
}
