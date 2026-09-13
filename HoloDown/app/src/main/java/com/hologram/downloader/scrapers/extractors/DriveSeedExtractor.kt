package com.hologram.downloader.scrapers.extractors

import com.hologram.downloader.scrapers.base.BaseExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.Request

class DriveSeedExtractor : BaseExtractor() {

    suspend fun resolveDriveSeed(url: String): String? = withContext(Dispatchers.IO) {
        try {
            var currentUrl = url

            // 1. If unblocked / fast-server landing page with form
            if (currentUrl.contains("unblocked") || currentUrl.contains("landing")) {
                val bypassed = bypassUnblockedForm(currentUrl)
                if (!bypassed.isNullOrBlank()) {
                    currentUrl = bypassed
                }
            }

            // 2. If it's a HubCloud or DriveSeed link
            val doc = fetchHtml(currentUrl, mapOf("Referer" to currentUrl)) ?: return@withContext currentUrl
            
            // Look for direct download buttons (HubCloud, FSL, Pixeldrain, Direct Download)
            val buttons = doc.select("a.btn, a[href*='download'], a[href*='pixeldrain'], a[href*='hubcloud']")
            for (btn in buttons) {
                val href = btn.attr("href")
                if (href.startsWith("http")) {
                    if (href.contains("pixeldrain.com/u/")) {
                        val fileId = href.substringAfterLast("/")
                        return@withContext "https://pixeldrain.com/api/file/$fileId?download"
                    }
                    if (isStreamableVideoUrl(href)) {
                        return@withContext href
                    }
                    val finalHop = resolveRedirect(href, mapOf("Referer" to currentUrl))
                    if (isStreamableVideoUrl(finalHop)) {
                        return@withContext finalHop
                    }
                }
            }

            if (isStreamableVideoUrl(currentUrl)) {
                return@withContext currentUrl
            }

            null
        } catch (e: Exception) {
            null
        }
    }

    private suspend fun bypassUnblockedForm(initialUrl: String): String? = withContext(Dispatchers.IO) {
        try {
            val html1 = fetchRaw(initialUrl) ?: return@withContext null
            val actionMatch = Regex("""<form[^>]*action="([^"]+)"[^>]*>""").find(html1) ?: return@withContext null
            val action1 = actionMatch.groupValues[1]

            val inputs = mutableMapOf<String, String>()
            Regex("""<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"""").findAll(html1).forEach {
                inputs[it.groupValues[1]] = it.groupValues[2]
            }

            val formBuilder = FormBody.Builder()
            inputs.forEach { (k, v) -> formBuilder.add(k, v) }

            val req = Request.Builder()
                .url(action1)
                .header("User-Agent", DEFAULT_UA)
                .header("Referer", initialUrl)
                .post(formBuilder.build())
                .build()

            sharedOkHttpClient.newCall(req).execute().use { res ->
                val body = res.body?.string() ?: return@withContext null
                val metaRefresh = Regex("""content="[^"]*url=([^"]+)"""", RegexOption.IGNORE_CASE).find(body)
                if (metaRefresh != null) {
                    return@withContext metaRefresh.groupValues[1]
                }
                val redirectMatch = Regex("""window\.location\.replace\(["']([^"']+)["']\)""").find(body)
                if (redirectMatch != null) {
                    return@withContext redirectMatch.groupValues[1]
                }
            }
            null
        } catch (e: Exception) {
            null
        }
    }
}
