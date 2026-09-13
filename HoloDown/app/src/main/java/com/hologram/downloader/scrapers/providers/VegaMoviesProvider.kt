package com.hologram.downloader.scrapers.providers

import com.hologram.downloader.scrapers.base.BaseExtractor
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.scrapers.base.ScraperProvider
import com.hologram.downloader.scrapers.extractors.FastDlExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class VegaMoviesProvider(
    override var baseUrl: String = "https://new2.vegamovies.futbol"
) : BaseExtractor(), ScraperProvider {

    override val name: String = "VegaMovies"
    override val siteKey: String = "vegamovies"

    private val fastDlExtractor = FastDlExtractor()

    override suspend fun search(query: String): List<ScrapedArticle> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        val results = mutableListOf<ScrapedArticle>()

        // 1. Try search.php JSON endpoint
        try {
            val jsonUrl = "$baseUrl/search.php?q=${java.net.URLEncoder.encode(query, "UTF-8")}&page=1"
            val raw = fetchRaw(jsonUrl, mapOf("Referer" to "$baseUrl/"))
            if (!raw.isNullOrBlank()) {
                val jsonObj = JSONObject(raw)
                val hits = jsonObj.optJSONArray("hits")
                if (hits != null) {
                    for (i in 0 until hits.length()) {
                        val hit = hits.optJSONObject(i) ?: continue
                        val doc = hit.optJSONObject("document") ?: continue
                        val title = cleanText(doc.optString("post_title").replace("Download ", ""))
                        val permalink = doc.optString("permalink")
                        val thumb = doc.optString("post_thumbnail")
                        val fullUrl = if (permalink.startsWith("http")) permalink else "$baseUrl$permalink"

                        val isSeries = title.contains("season", true) || title.contains("series", true) || title.contains("s0", true)
                        val sMatch = Regex("""\b(?:Season|S)\s*0*(\d{1,2})\b""", RegexOption.IGNORE_CASE).find(title)
                        val seasonNum = sMatch?.groupValues?.get(1)?.toIntOrNull()

                        results.add(
                            ScrapedArticle(
                                id = "vega-$i-${System.currentTimeMillis()}",
                                title = title,
                                permalink = fullUrl,
                                posterUrl = thumb,
                                siteKey = siteKey,
                                siteDisplayName = name,
                                seasonTags = seasonNum?.let { listOf(it) },
                                isSeries = isSeries
                            )
                        )
                    }
                    if (results.isNotEmpty()) return@withContext results
                }
            }
        } catch (_: Exception) {}

        // 2. Fallback: HTML page search
        try {
            val htmlUrl = "$baseUrl/?s=${java.net.URLEncoder.encode(query, "UTF-8")}"
            val doc = fetchHtml(htmlUrl)
            doc?.select("article, div.post-item, div.movies-grid a")?.forEachIndexed { i, elem ->
                val title = cleanText(elem.select("h2, img").attr("alt").ifEmpty { elem.text() }.replace("Download ", ""))
                val href = elem.select("a").attr("href").ifEmpty { elem.attr("href") }
                val thumb = elem.select("img").attr("src").ifEmpty { elem.select("img").attr("data-src") }

                if (href.isNotBlank() && title.isNotBlank()) {
                    val fullUrl = if (href.startsWith("http")) href else "$baseUrl$href"
                    val isSeries = title.contains("season", true) || title.contains("series", true)
                    results.add(
                        ScrapedArticle(
                            id = "vega-html-$i",
                            title = title,
                            permalink = fullUrl,
                            posterUrl = thumb,
                            siteKey = siteKey,
                            siteDisplayName = name,
                            isSeries = isSeries
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
            val pageUrl = if (page <= 1) "$baseUrl/" else "$baseUrl/page/$page/"
            val doc = fetchHtml(pageUrl) ?: return@withContext emptyList()

            val items = doc.select("article, div.movies-grid > a, div.post-item")
            items.forEachIndexed { i, elem ->
                val linkElem = if (elem.tagName() == "a") elem else elem.selectFirst("a") ?: return@forEachIndexed
                val href = linkElem.attr("href")
                val imgElem = elem.selectFirst("img")
                val title = cleanText(imgElem?.attr("alt")?.ifEmpty { linkElem.text() } ?: linkElem.text())
                    .replace("Download ", "")
                var poster = imgElem?.attr("src")?.ifEmpty { imgElem.attr("data-src") }

                if (href.isNotBlank() && title.isNotBlank()) {
                    val fullUrl = if (href.startsWith("http")) href else "$baseUrl$href"
                    val isSeries = title.contains("season", true) || title.contains("series", true) || title.contains("s0", true)
                    releases.add(
                        ScrapedArticle(
                            id = "vega-latest-$page-$i",
                            title = title,
                            permalink = fullUrl,
                            posterUrl = poster,
                            siteKey = siteKey,
                            siteDisplayName = name,
                            isSeries = isSeries
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
            val doc = fetchHtml(articleUrl) ?: return@withContext emptyList()
            val mainTitle = cleanText(doc.select("h1").text())
            val isSeries = mainTitle.contains("season", true) || mainTitle.contains("series", true) || mainTitle.contains("s0", true)

            // Parse quality sections (H2, H3, H4, H5)
            val headings = doc.select("h2, h3, h4, h5").filter { h ->
                val t = h.text().lowercase()
                t.contains("480p") || t.contains("720p") || t.contains("1080p") || t.contains("2160p") || t.contains("4k")
            }

            for (heading in headings) {
                val headingText = cleanText(heading.text())
                val quality = normalizeQuality(headingText)
                val codec = if (headingText.contains("hevc", true) || headingText.contains("x265", true) || headingText.contains("10bit", true)) "HEVC" else "x264"
                val format = if (headingText.contains("bluray", true)) "BluRay" else "WEB-DL"

                val sizeMatch = Regex("""\[([0-9.]+\s*(?:MB|GB))\]""", RegexOption.IGNORE_CASE).find(headingText)
                val fileSize = sizeMatch?.groupValues?.get(1) ?: "Unknown"

                val audio = if (headingText.contains("hindi", true) && headingText.contains("english", true)) "Dual Audio (Hindi + Eng)"
                            else if (headingText.contains("hindi", true)) "Hindi Dub"
                            else "Original Audio"

                val sMatch = Regex("""\b(?:Season|S)\s*0*(\d{1,2})\b""", RegexOption.IGNORE_CASE).find(headingText)
                    ?: Regex("""\b(?:Season|S)\s*0*(\d{1,2})\b""", RegexOption.IGNORE_CASE).find(mainTitle)
                val seasonNum = sMatch?.groupValues?.get(1)?.toIntOrNull() ?: 1

                // Find buttons in subsequent sibling elements
                var sibling = heading.nextElementSibling()
                var loop = 0
                while (sibling != null && loop < 4 && !sibling.tagName().startsWith("h")) {
                    val anchors = sibling.select("a")
                    for (a in anchors) {
                        var href = a.attr("href")
                        val btnText = cleanText(a.text())

                        if (href.contains("url=")) {
                            val b64 = href.substringAfter("url=").substringBefore("&")
                            href = b64decode(b64)
                        }

                        if (href.startsWith("http") && !href.contains("imdb.com") && !href.contains("telegram")) {
                            val isZip = btnText.contains("zip", true) || btnText.contains("batch", true) || btnText.contains("pack", true)
                            val epMatch = Regex("""(?:Episode|Ep|E)\s*(\d+)""", RegexOption.IGNORE_CASE).find(btnText)
                            val epNum = epMatch?.groupValues?.get(1)?.toIntOrNull()

                            val priority = when {
                                href.contains("vcloud") || href.contains("v-cloud") -> 1
                                href.contains("fastdl") || href.contains("g-direct") -> 2
                                isZip -> 10
                                else -> 5
                            }

                            options.add(
                                ScrapedOption(
                                    id = "opt-vega-${options.size}",
                                    siteKey = siteKey,
                                    siteDisplayName = name,
                                    qualityLabel = quality,
                                    ripFormat = format,
                                    codec = codec,
                                    fileSize = fileSize,
                                    audioTracks = audio,
                                    isSeries = isSeries,
                                    seasonNumber = seasonNum,
                                    episodeNumber = epNum,
                                    episodeName = btnText.ifEmpty { "Download" },
                                    lockerUrl = href,
                                    priorityScore = priority
                                )
                            )
                        }
                    }
                    sibling = sibling.nextElementSibling()
                    loop++
                }
            }
        } catch (_: Exception) {}
        options.sortedBy { it.priorityScore }
    }

    override suspend fun resolveDirectStream(option: ScrapedOption): String? = withContext(Dispatchers.IO) {
        fastDlExtractor.resolveVCloud(option.lockerUrl)
    }
}
