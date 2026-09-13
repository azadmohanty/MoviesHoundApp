package com.hologram.downloader.scrapers.extractors

import com.hologram.downloader.scrapers.base.BaseExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class FastDlExtractor : BaseExtractor() {

    suspend fun resolveVCloud(vcloudUrl: String): String? = withContext(Dispatchers.IO) {
        try {
            var targetServerPage = vcloudUrl

            // 1. Fetch initial vcloud page to check for double atob token
            val vhtml = fetchRaw(vcloudUrl, mapOf("Referer" to vcloudUrl)) ?: return@withContext null

            val atobMatch = Regex("""atob\(atob\(['"]([^'"]+)['"]\)\)""").find(vhtml)
                ?: Regex("""atob\(['"]([^'"]+)['"]\)""").find(vhtml)

            if (atobMatch != null) {
                val decoded = b64decode(atobMatch.groupValues[1])
                if (decoded.startsWith("http")) {
                    targetServerPage = decoded
                }
            }

            // 2. Fetch target server page with download buttons
            val sHtml = fetchRaw(targetServerPage, mapOf("Referer" to vcloudUrl)) ?: vhtml

            // 3. Parse Server Buttons & Prioritize
            val buttonRegex = Regex("""<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>""", RegexOption.IGNORE_CASE)
            val candidates = mutableListOf<Pair<String, Int>>()

            buttonRegex.findAll(sHtml).forEach { match ->
                val href = match.groupValues[1]
                val text = cleanText(match.groupValues[2])

                if (href.startsWith("http")) {
                    var priority = 99
                    val lowerText = text.lowercase()
                    val lowerHref = href.lowercase()

                    when {
                        lowerText.contains("fslv2") || lowerText.contains("fsl v2") -> priority = 1
                        lowerText.contains("fsl") -> priority = 2
                        lowerText.contains("mega server") -> priority = 3
                        lowerHref.contains("r2.cloudflarestorage.com") || lowerHref.contains(".mkv") || lowerHref.contains(".mp4") -> priority = 4
                        lowerText.contains("pixeldra") || lowerHref.contains("pixeldra") -> priority = 5
                        lowerText.contains("10gbps") -> priority = 6
                        lowerText.contains("download") -> priority = 7
                    }

                    if (priority < 99) {
                        candidates.add(href to priority)
                    }
                }
            }

            candidates.sortBy { it.second }

            for ((href, _) in candidates) {
                // If it's a pixeldrain link, convert to direct download api
                if (href.contains("pixeldrain.com/u/")) {
                    val fileId = href.substringAfterLast("/")
                    return@withContext "https://pixeldrain.com/api/file/$fileId?download"
                }

                // If it's already streamable
                if (isStreamableVideoUrl(href)) {
                    return@withContext href
                }

                // Follow any redirect hop
                val resolved = resolveRedirect(href, mapOf("Referer" to targetServerPage))
                if (isStreamableVideoUrl(resolved)) {
                    return@withContext resolved
                }
            }

            // Fallback: check if targetServerPage itself is streamable
            if (isStreamableVideoUrl(targetServerPage)) {
                return@withContext targetServerPage
            }

            null
        } catch (e: Exception) {
            null
        }
    }
}
