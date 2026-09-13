package com.hologram.downloader.scrapers.base

import kotlin.math.abs
import kotlin.math.max

object FuzzyGateValidator {

    private val NOISE_WORDS = setOf(
        "download", "full", "movie", "series", "season", "complete", "hindi", "dubbed", "dual",
        "audio", "web-dl", "bluray", "hdrip", "esub", "720p", "1080p", "480p", "4k", "hevc",
        "x264", "x265", "10bit", "zip", "pack", "batch", "episode", "episodes", "org", "clean"
    )

    fun sanitizeTitle(raw: String): String {
        var clean = raw.lowercase()
            .replace(Regex("\\[.*?\\]"), " ")
            .replace(Regex("\\(.*?\\)"), " ")
            .replace(Regex("\\{.*?\\}"), " ")
            .replace(Regex("[^a-z0-9\\s]"), " ")

        val tokens = clean.split(Regex("\\s+")).filter { it.isNotBlank() && it !in NOISE_WORDS }
        return tokens.joinToString(" ").trim()
    }

    fun extractYear(text: String): Int? {
        val match = Regex("\\b(19\\d{2}|20\\d{2})\\b").find(text)
        return match?.groupValues?.get(1)?.toIntOrNull()
    }

    /**
     * Bigram Dice Coefficient for Title Similarity (0.0 to 1.0)
     */
    fun calculateTitleSimilarity(query: String, target: String): Double {
        val s1 = sanitizeTitle(query)
        val s2 = sanitizeTitle(target)

        if (s1.isEmpty() || s2.isEmpty()) return 0.0
        if (s1 == s2) return 1.0
        if (s2.contains(s1) || s1.contains(s2)) return 0.90

        val bigrams1 = s1.windowed(2, 1, false).toSet()
        val bigrams2 = s2.windowed(2, 1, false).toSet()

        val intersection = bigrams1.intersect(bigrams2).size
        val total = bigrams1.size + bigrams2.size
        return if (total > 0) (2.0 * intersection) / total else 0.0
    }

    /**
     * 3-Gate Deterministic Validation:
     * Gate 1: Title Similarity >= 65%
     * Gate 2: Delta Year <= 1 (if both years present)
     * Gate 3: Type Match (Movie vs TV Series)
     *
     * Returns match confidence score (0 to 100). Scores >= 65 pass.
     */
    fun validateCandidate(
        queryTitle: String,
        targetTitle: String,
        targetYear: Int? = null,
        isTvExpected: Boolean = false,
        queryImdbId: String? = null,
        targetImdbId: String? = null
    ): Int {
        // Golden Gate: IMDb ID Match
        if (!queryImdbId.isNullOrBlank() && !targetImdbId.isNullOrBlank()) {
            val qImdb = queryImdbId.trim().lowercase()
            val tImdb = targetImdbId.trim().lowercase()
            if (qImdb == tImdb) return 100
        }

        // Gate 1: Title Similarity
        val similarity = calculateTitleSimilarity(queryTitle, targetTitle)
        var score = (similarity * 100).toInt()

        // Gate 2: Year Delta
        val candidateYear = extractYear(targetTitle)
        if (targetYear != null && candidateYear != null) {
            val delta = abs(targetYear - candidateYear)
            if (delta == 0) {
                score = (score + 10).coerceAtMost(100)
            } else if (delta == 1) {
                // acceptable
            } else if (delta > 2) {
                // Likely a remake or different movie
                score -= 30
            }
        }

        // Gate 3: Type Check
        val lowerTarget = targetTitle.lowercase()
        val isTargetSeries = lowerTarget.contains("season") ||
                             lowerTarget.contains("s0") ||
                             lowerTarget.contains("series") ||
                             lowerTarget.contains("episodes") ||
                             lowerTarget.contains("complete")

        if (isTvExpected && !isTargetSeries) {
            score -= 20
        } else if (!isTvExpected && isTargetSeries) {
            score -= 25
        }

        return score.coerceIn(0, 100)
    }
}
