package com.hologram.downloader.scrapers.providers

import com.hologram.downloader.scrapers.base.BaseExtractor
import com.hologram.downloader.scrapers.base.ScrapedArticle
import com.hologram.downloader.scrapers.base.ScrapedOption
import com.hologram.downloader.scrapers.base.ScraperProvider
import com.hologram.downloader.scrapers.extractors.DriveSeedExtractor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MoviesModProvider(
    override var baseUrl: String = "https://moviesmod.zone"
) : BaseExtractor(), ScraperProvider {

    override val name: String = "MoviesMod"
    override val siteKey: String = "moviesmod"

    private val driveSeedExtractor = DriveSeedExtractor()

    override suspend fun search(query: String): List<ScrapedArticle> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        val results = mutableListOf<ScrapedArticle>()

        try {
            val searchUrl = "$baseUrl/search/${java.net.URLEncoder.encode(query, "UTF-8")}/page/1"
            val doc = fetchHtml(searchUrl) ?: fetchHtml("$baseUrl/?s=${java.net.URLEncoder.encode(query, "UTF-8")}")

            doc?.select("article")?.forEachIndexed { i, article ->
                val linkElem = article.selectFirst("a") ?: return@forEachIndexed
                val href = linkElem.attr("href")
                val titleElem = article.selectFirst("h2, h3, .entry-title")
                val title = cleanText(titleElem?.text() ?: linkElem.attr("title")).replace("Download ", "")
                val imgElem = article.selectFirst("img")
                val poster = imgElem?.attr("src")?.ifEmpty { imgElem.attr("data-src") }

                if (href.isNotBlank() && title.isNotBlank()) {
                    val fullUrl = if (href.startsWith("http")) href else "$baseUrl$href"
                    val isSeries = title.contains("season", true) || title.contains("series", true) || title.contains("s0", true)
                    val sMatch = Regex("""\b(?:Season|S)\s*0*(\d{1,2})\b""", RegexOption.IGNORE_CASE).find(title)
                    val seasonNum = sMatch?.groupValues?.get(1)?.toIntOrNull()

                    results.add(
                        ScrapedArticle(
                            id = "mmod-$i-${System.currentTimeMillis()}",
                            title = title,
                            permalink = fullUrl,
                            posterUrl = poster,
                            siteKey = siteKey,
                            siteDisplayName = name,
                            seasonTags = seasonNum?.let { listOf(it) },
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

            doc.select("article").forEachIndexed { i, article ->
                val linkElem = article.selectFirst("a") ?: return@forEachIndexed
                val href = linkElem.attr("href")
                val titleElem = article.selectFirst("h2, h3, .entry-title")
                val title = cleanText(titleElem?.text() ?: linkElem.attr("title")).replace("Download ", "")
                val imgElem = article.selectFirst("img")
                val poster = imgElem?.attr("src")?.ifEmpty { imgElem.attr("data-src") }

                if (href.isNotBlank() && title.isNotBlank()) {
                    val fullUrl = if (href.startsWith("http")) href else "$baseUrl$href"
                    val isSeries = title.contains("season", true) || title.contains("series", true)
                    releases.add(
                        ScrapedArticle(
                            id = "mmod-latest-$page-$i",
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
            val isSeries = mainTitle.contains("season", true) || mainTitle.contains("series", true)

            val buttons = doc.select("a.maxbutton, a[class*='maxbutton'], a[class*='btn'], a:has(button)")

            for (btn in buttons) {
                var href = btn.attr("href")
                val btnText = cleanText(btn.text())

                if (href.contains("url=")) {
                    val b64 = href.substringAfter("url=").substringBefore("&")
                    href = b64decode(b64)
                }

                if (href.startsWith("http") && !href.contains("imdb.com") && !href.contains("telegram")) {
                    val quality = normalizeQuality(btnText.ifEmpty { mainTitle })
                    val codec = if (btnText.contains("hevc", true) || btnText.contains("x265", true)) "HEVC" else "x264"
                    val sizeMatch = Regex("""\[([0-9.]+\s*(?:MB|GB))\]""", RegexOption.IGNORE_CASE).find(btnText)
                    val fileSize = sizeMatch?.groupValues?.get(1) ?: "Unknown"

                    val sMatch = Regex("""\b(?:Season|S)\s*0*(\d{1,2})\b""", RegexOption.IGNORE_CASE).find(btnText)
                        ?: Regex("""\b(?:Season|S)\s*0*(\d{1,2})\b""", RegexOption.IGNORE_CASE).find(mainTitle)
                    val seasonNum = sMatch?.groupValues?.get(1)?.toIntOrNull() ?: 1

                    val epMatch = Regex("""(?:Episode|Ep|E)\s*(\d+)""", RegexOption.IGNORE_CASE).find(btnText)
                    val epNum = epMatch?.groupValues?.get(1)?.toIntOrNull()

                    val isZip = btnText.contains("zip", true) || btnText.contains("batch", true) || btnText.contains("pack", true)
                    val contentType = if (isSeries) {
                        if (isZip) "SEASON_BATCH_ZIP" else "SINGLE_EPISODE"
                    } else "MOVIE"

                    val priority = when {
                        isZip -> 90
                        href.contains("driveseed") -> 1
                        href.contains("hubcloud") -> 2
                        href.contains("fastdl") -> 3
                        else -> 5
                    }

                    options.add(
                        ScrapedOption(
                            id = "opt-mmod-${options.size}",
                            siteKey = siteKey,
                            siteDisplayName = name,
                            qualityLabel = quality,
                            ripFormat = "WEB-DL",
                            codec = codec,
                            fileSize = fileSize,
                            audioTracks = if (mainTitle.contains("hindi", true)) "Hindi Dub" else "Original",
                            contentType = contentType,
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
        } catch (_: Exception) {}
        options.sortedBy { it.priorityScore }
    }

    override suspend fun fetchEpisodes(portalUrl: String): List<com.hologram.downloader.scrapers.base.SeriesEpisodeItem> = withContext(Dispatchers.IO) {
        val episodes = mutableListOf<com.hologram.downloader.scrapers.base.SeriesEpisodeItem>()
        try {
            val doc = fetchHtml(portalUrl, mapOf("Referer" to "$baseUrl/")) ?: return@withContext emptyList()

            // Find all anchor links matching Episode / Ep / E
            val links = doc.select("a")
            for (l in links) {
                val href = l.attr("href")
                val text = cleanText(l.text())

                val epMatch = Regex("""^(?:Episode|Ep|E)\s*0*(\d{1,3})""", RegexOption.IGNORE_CASE).find(text)
                    ?: Regex("""(?:episode|ep|e)0*(\d{1,3})""", RegexOption.IGNORE_CASE).find(href)

                if (epMatch != null && href.startsWith("http")) {
                    val epNum = epMatch.groupValues[1].toIntOrNull() ?: continue
                    if (episodes.none { it.episodeNumber == epNum }) {
                        episodes.add(
                            com.hologram.downloader.scrapers.base.SeriesEpisodeItem(
                                episodeNumber = epNum,
                                episodeTitle = "Episode ${if (epNum < 10) "0$epNum" else epNum.toString()}",
                                targetUrl = href,
                                buttonText = text.ifEmpty { "EP $epNum" }
                            )
                        )
                    }
                }
            }
        } catch (_: Exception) {}
        episodes.sortedBy { it.episodeNumber }
    }

    override suspend fun resolveDirectStream(option: ScrapedOption): String? = withContext(Dispatchers.IO) {
        driveSeedExtractor.resolveDriveSeed(option.lockerUrl) ?: option.lockerUrl
    }
}

