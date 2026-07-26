"use strict";
/**
 * FuzzyMatcher.ts
 *
 * Normalizes movie & web series titles and calculates match confidence scores
 * to resolve search ambiguity between TMDB queries and provider post titles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTitleTokens = normalizeTitleTokens;
exports.calculateMatchConfidence = calculateMatchConfidence;
exports.sanitizeSearchQuery = sanitizeSearchQuery;
var NOISE_WORDS = [
    'download',
    'dual',
    'audio',
    'hindi',
    'english',
    'dubbed',
    'movie',
    'series',
    'season',
    'web-dl',
    'webdl',
    'bluray',
    'hdrip',
    'brrip',
    '480p',
    '720p',
    '1080p',
    '2160p',
    '4k',
    'hevc',
    '10bit',
    'x264',
    'x265',
    'esub',
    'msubs',
];
/**
 * Normalizes a raw string by removing special characters and noise words.
 */
function normalizeTitleTokens(rawTitle) {
    if (!rawTitle)
        return [];
    var clean = rawTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    var words = clean.split(' ');
    return words.filter(function (w) { return w.length > 0 && !NOISE_WORDS.includes(w); });
}
/**
 * Calculates a match confidence score (0 - 100%) between a query title and target post title.
 */
function calculateMatchConfidence(queryTitle, targetTitle, queryYear, targetImdbId, queryImdbId) {
    // 1. Direct IMDb ID Match (100% confidence)
    if (queryImdbId && targetImdbId && queryImdbId.trim() === targetImdbId.trim()) {
        return 100;
    }
    var queryTokens = normalizeTitleTokens(queryTitle);
    var targetTokens = normalizeTitleTokens(targetTitle);
    if (queryTokens.length === 0 || targetTokens.length === 0)
        return 0;
    // Count matching tokens
    var matchedCount = 0;
    queryTokens.forEach(function (token) {
        if (targetTokens.includes(token)) {
            matchedCount++;
        }
    });
    var score = Math.round((matchedCount / queryTokens.length) * 100);
    // If primary token matches and target has IMDb validation, ensure it passes threshold for golden check
    var primaryToken = queryTokens[0];
    if (primaryToken && targetTokens.includes(primaryToken)) {
        score = Math.max(score, 70);
    }
    // 2. Year Matching Boost / Penalty
    if (queryYear) {
        var yrStr = queryYear.toString();
        if (targetTitle.includes(yrStr)) {
            score = Math.min(100, score + 15);
        }
        else if (/\b(19|20)\d{2}\b/.test(targetTitle)) {
            // Different year penalty
            score = Math.max(0, score - 20);
        }
    }
    return Math.min(100, Math.max(0, score));
}
/**
 * Sanitizes a title string for site search queries (extracts core title, removes year, colons, special punctuation).
 */
function sanitizeSearchQuery(query) {
    if (!query)
        return '';
    var clean = query;
    // If title has a colon, dash, or pipe subtitle separator (e.g. "Dhurandhar: The Revenge"),
    // extract primary core title part ("Dhurandhar") for maximum site search engine hits!
    if (/[:\-\—|]/.test(clean)) {
        var primaryPart = clean.split(/[:\-\—|]/)[0].trim();
        if (primaryPart.length >= 3) {
            clean = primaryPart;
        }
    }
    return clean
        .replace(/\b(19|20)\d{2}\b/g, '') // Remove year numbers
        .replace(/[^a-zA-Z0-9\s]/g, ' ') // Replace special chars with space
        .replace(/\s+/g, ' ')
        .trim();
}
