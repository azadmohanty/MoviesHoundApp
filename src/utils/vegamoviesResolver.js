"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVegaMoviesArticle = parseVegaMoviesArticle;
exports.getVegaMoviesQualityOptions = getVegaMoviesQualityOptions;
exports.fetchVegaMoviesEpisodes = fetchVegaMoviesEpisodes;
exports.isStreamableVideoUrl = isStreamableVideoUrl;
exports.resolveVegaMoviesLocker = resolveVegaMoviesLocker;
exports.resolveVegaMovies480pStream = resolveVegaMovies480pStream;
var buffer_1 = require("buffer");
var FuzzyMatcher_1 = require("./FuzzyMatcher");
var MediaTagExtractor_1 = require("./MediaTagExtractor");
var BASE_DOMAIN = 'https://vegamovies.navy';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
/**
 * Safe base64 decode that works on both Node.js (Buffer) and React Native Hermes (no atob).
 * Tries double-decode first (atob(atob(x)) pattern used by VCloud), then single decode.
 */
function b64decode(str) {
    var _a, _b, _c;
    try {
        // React Native / Hermes — Buffer is available via the 'buffer' polyfill
        // @ts-ignore
        var decoded1 = buffer_1.Buffer.from(str, 'base64').toString('utf-8');
        // Try double decode (VCloud uses atob(atob(x)))
        try {
            // @ts-ignore
            var decoded2 = buffer_1.Buffer.from(decoded1, 'base64').toString('utf-8');
            if (decoded2.startsWith('http'))
                return decoded2;
        }
        catch (_) { }
        return decoded1;
    }
    catch (e) {
        // Absolute last resort: try global atob if available (browser/web)
        try {
            return (_c = (_b = (_a = globalThis).atob) === null || _b === void 0 ? void 0 : _b.call(_a, str)) !== null && _c !== void 0 ? _c : str;
        }
        catch (_) {
            return str;
        }
    }
}
/**
 * 100% Empirical DOM Parser for VegaMovies main article page.
 * Iterates through all <h3...>/<h5...> header blocks and extracts download links from the following section.
 */
function parseVegaMoviesArticle(html, articleUrl) {
    var options = [];
    var h1Match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    var mainTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
    var headerRegex = /<h[35][^>]*>([\s\S]*?)<\/h[35]>([\s\S]*?)(?=<h[1-5]|$)/gi;
    var matches = __spreadArray([], __read(html.matchAll(headerRegex)), false);
    matches.forEach(function (match) {
        var headerText = match[1].replace(/<[^>]+>/g, '').trim();
        var sectionHtml = match[2];
        if (!/480p|720p|1080p|2160p|4K/i.test(headerText))
            return;
        var qualityLabel = '720p';
        if (headerText.includes('480p'))
            qualityLabel = '480p';
        else if (headerText.includes('1080p'))
            qualityLabel = '1080p';
        else if (/2160p|4K/i.test(headerText))
            qualityLabel = '4K';
        var fullTagContext = "".concat(headerText, " ").concat(mainTitle);
        var codec = (0, MediaTagExtractor_1.extractVideoCodec)(headerText);
        var ripFormat = (0, MediaTagExtractor_1.extractRipFormat)(fullTagContext);
        var audioTracks = (0, MediaTagExtractor_1.extractAudioTracks)(fullTagContext);
        var sizeMatch = headerText.match(/\[([\d.]+\s*(?:GB|MB)(?:\/E)?)]/i);
        var fileSize = sizeMatch ? sizeMatch[1] : 'N/A';
        var baseSeasonMatch = headerText.match(/\b(?:Season|S)\s*0*(\d+)\b/i) ||
            mainTitle.match(/\b(?:Season|S)\s*0*(\d+)\b/i);
        var isSeriesArticle = /\b(?:season|s0\d|series|episodes|complete)\b/i.test(headerText) || /\b(?:season|s0\d|series|episodes|complete)\b/i.test(mainTitle);
        var links = __spreadArray([], __read(sectionHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)), false);
        links.forEach(function (l) {
            var href = l[1];
            var linkText = l[2].replace(/<[^>]+>/g, '').trim();
            if (!href.includes('nexdrive') && !href.includes('vcloud') && !href.includes('fastdl') && !href.includes('gdflix') && !href.includes('dwd-button'))
                return;
            var linkSeasonMatch = linkText.match(/\b(?:Season|S)\s*0*(\d+)\b/i);
            var seasonMatch = linkSeasonMatch || baseSeasonMatch;
            var seasonNumber = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
            var isBatch = /\b(?:batch|zip)\b/i.test(linkText);
            var isEpisode = /\b(?:episode|ep\s*\d+|e\d{2}|single)\b/i.test(linkText);
            var contentType = 'MOVIE';
            if (isBatch) {
                contentType = 'SEASON_BATCH_ZIP';
            }
            else if (isSeriesArticle || isEpisode) {
                contentType = 'SINGLE_EPISODE';
            }
            var linkSizeMatch = linkText.match(/\[([\d.]+\s*(?:GB|MB))]/i);
            var optionFileSize = linkSizeMatch ? linkSizeMatch[1] : fileSize;
            var priorityScore = 5;
            if (isBatch) {
                priorityScore = 90; // Demote Zip/Batch packs below single episode links!
            }
            else if (/v-cloud|vcloud/i.test(linkText) || /vcloud/i.test(href)) {
                priorityScore = 1; // Highest priority for single episode V-Cloud links!
            }
            else if (/g-direct|fastdl/i.test(linkText) || /fastdl/i.test(href)) {
                priorityScore = 3;
            }
            options.push({
                id: "vega-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 6)),
                siteKey: 'vegamovies',
                siteDisplayName: 'VEGAMOVIES',
                qualityLabel: qualityLabel,
                ripFormat: ripFormat,
                codec: codec,
                fileSize: optionFileSize,
                audioTracks: audioTracks,
                contentType: contentType,
                episodeName: linkText,
                seasonNumber: seasonNumber,
                targetUrl: href,
                priorityScore: priorityScore,
            });
        });
    });
    options.sort(function (a, b) { return (a.priorityScore || 5) - (b.priorityScore || 5); });
    return options;
}
/**
 * Automated Multi-Page Search & Smart Verification Pipeline for VegaMovies.
 * Includes Exact Year Priority ranking & Media Type filtering.
 */
function getVegaMoviesQualityOptions(queryTitle_1, targetYear_1, targetImdbId_1) {
    return __awaiter(this, arguments, void 0, function (queryTitle, targetYear, targetImdbId, mediaType, baseDomain, siteDisplayName, signal, onLog) {
        var searchQuery, searchUrl, hits, res, text, json, e_1, numTargetYear, isTvTarget, candidateHits, exactYearHits, topHits, pagePromises, pageResults, allOptions, optionMap, uniqueOptions;
        var _this = this;
        if (mediaType === void 0) { mediaType = 'movie'; }
        if (baseDomain === void 0) { baseDomain = 'https://vegamovies.navy'; }
        if (siteDisplayName === void 0) { siteDisplayName = 'VEGAMOVIES'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    searchQuery = (0, FuzzyMatcher_1.sanitizeSearchQuery)(queryTitle);
                    searchUrl = "".concat(baseDomain, "/search.php?q=").concat(encodeURIComponent(searchQuery), "&page=1");
                    if (onLog)
                        onLog("".concat(siteDisplayName, ": Searching \"").concat(searchQuery, "\" on ").concat(baseDomain, "..."));
                    hits = [];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch(searchUrl, { signal: signal, headers: { 'User-Agent': UA } })];
                case 2:
                    res = _a.sent();
                    return [4 /*yield*/, res.text()];
                case 3:
                    text = _a.sent();
                    json = JSON.parse(text);
                    hits = json.hits || [];
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    if (onLog)
                        onLog("VegaMovies search error: ".concat(e_1.message));
                    return [2 /*return*/, []];
                case 5:
                    if (hits.length === 0) {
                        if (onLog)
                            onLog('VegaMovies: 0 search hits returned');
                        return [2 /*return*/, []];
                    }
                    if (onLog)
                        onLog("VegaMovies: ".concat(hits.length, " raw search hits found. Pre-filtering..."));
                    numTargetYear = targetYear ? parseInt(String(targetYear), 10) : undefined;
                    isTvTarget = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';
                    candidateHits = hits.filter(function (hit) {
                        var _a;
                        var postTitle = ((_a = hit.document) === null || _a === void 0 ? void 0 : _a.post_title) || '';
                        var score = (0, FuzzyMatcher_1.calculateMatchConfidence)(queryTitle, postTitle, targetYear);
                        if (score < 50)
                            return false;
                        var isTvPost = /season|s0\d|series|episodes|complete/i.test(postTitle);
                        if (isTvTarget && !isTvPost)
                            return false; // Reject movies when user wanted TV series
                        if (!isTvTarget && isTvPost)
                            return false; // Reject TV series when user wanted movie
                        return true;
                    });
                    // Step 2: Exact Year Priority Rule
                    if (numTargetYear && candidateHits.length > 0) {
                        exactYearHits = candidateHits.filter(function (hit) {
                            var _a;
                            var postTitle = ((_a = hit.document) === null || _a === void 0 ? void 0 : _a.post_title) || '';
                            var postYearMatch = postTitle.match(/\b(19\d\d|20\d\d)\b/);
                            if (postYearMatch) {
                                return parseInt(postYearMatch[1], 10) === numTargetYear;
                            }
                            return false;
                        });
                        if (exactYearHits.length > 0) {
                            if (onLog)
                                onLog("VegaMovies: Exact year match (".concat(numTargetYear, ") found! Using exact hits."));
                            candidateHits = exactYearHits;
                        }
                        else {
                            // Fallback: year tolerance (± 1)
                            candidateHits = candidateHits.filter(function (hit) {
                                var _a;
                                var postTitle = ((_a = hit.document) === null || _a === void 0 ? void 0 : _a.post_title) || '';
                                var postYearMatch = postTitle.match(/\b(19\d\d|20\d\d)\b/);
                                if (postYearMatch) {
                                    var postYear = parseInt(postYearMatch[1], 10);
                                    return Math.abs(postYear - numTargetYear) <= 1;
                                }
                                return true;
                            });
                        }
                    }
                    if (candidateHits.length === 0) {
                        if (onLog)
                            onLog('VegaMovies: 0 candidates passed year & media-type filter');
                        return [2 /*return*/, []];
                    }
                    topHits = candidateHits.slice(0, 3);
                    if (onLog)
                        onLog("VegaMovies: Parallel fetching ".concat(topHits.length, " verified candidate pages..."));
                    pagePromises = topHits.map(function (hit) { return __awaiter(_this, void 0, void 0, function () {
                        var permalink, res, html, cleanImdb, foundImdbMatches, hasExactImdb, e_2;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    permalink = ((_a = hit.document) === null || _a === void 0 ? void 0 : _a.permalink) || '';
                                    if (permalink.startsWith('/'))
                                        permalink = BASE_DOMAIN + permalink;
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 4, , 5]);
                                    return [4 /*yield*/, fetch(permalink, { signal: signal, headers: { 'User-Agent': UA } })];
                                case 2:
                                    res = _b.sent();
                                    return [4 /*yield*/, res.text()];
                                case 3:
                                    html = _b.sent();
                                    // 3-Tier Verification Engine: IMDb text check
                                    if (targetImdbId) {
                                        cleanImdb = targetImdbId.trim().toLowerCase();
                                        foundImdbMatches = __spreadArray([], __read(html.matchAll(/tt\d{7,8}/gi)), false).map(function (m) { return m[0].toLowerCase(); });
                                        if (foundImdbMatches.length > 0) {
                                            hasExactImdb = foundImdbMatches.includes(cleanImdb);
                                            if (!hasExactImdb) {
                                                if (onLog)
                                                    onLog("VegaMovies: Rejecting page (IMDb ID mismatch: ".concat(foundImdbMatches[0], ")"));
                                                return [2 /*return*/, []];
                                            }
                                            else {
                                                if (onLog)
                                                    onLog("VegaMovies: \uD83C\uDF1F 100% Golden IMDb Match confirmed (".concat(cleanImdb, ")"));
                                            }
                                        }
                                    }
                                    return [2 /*return*/, parseVegaMoviesArticle(html, permalink)];
                                case 4:
                                    e_2 = _b.sent();
                                    return [2 /*return*/, []];
                                case 5: return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, Promise.allSettled(pagePromises)];
                case 6:
                    pageResults = _a.sent();
                    allOptions = [];
                    pageResults.forEach(function (res) {
                        if (res.status === 'fulfilled') {
                            allOptions.push.apply(allOptions, __spreadArray([], __read(res.value), false));
                        }
                    });
                    optionMap = new Map();
                    allOptions.forEach(function (o) { return optionMap.set(o.targetUrl, o); });
                    uniqueOptions = Array.from(optionMap.values()).sort(function (a, b) { return a.priorityScore - b.priorityScore; });
                    if (onLog)
                        onLog("VegaMovies: \uD83C\uDF89 ".concat(uniqueOptions.length, " quality options extracted across matching pages!"));
                    return [2 /*return*/, uniqueOptions];
            }
        });
    });
}
/**
 * Fetches individual episode items for a Web Series from NexDrive intermediate page.
 */
function fetchVegaMoviesEpisodes(nexdriveUrl, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var res, html, episodes_1, sections, links, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch(nexdriveUrl, {
                            signal: signal,
                            headers: {
                                'User-Agent': UA,
                                'Referer': BASE_DOMAIN + '/',
                            },
                        })];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.text()];
                case 2:
                    html = _a.sent();
                    episodes_1 = [];
                    sections = html.split(/(?=<h[345][^>]*>|(?:\b(?:Episodes?|Ep|E)\b\s*:?\s*\d+))/i);
                    sections.forEach(function (sec) {
                        var epMatch = sec.match(/(?:Episodes?|Ep|E)\s*:?\s*0*(\d+)/i);
                        var epNum = epMatch ? parseInt(epMatch[1], 10) : null;
                        if (!epNum)
                            return;
                        var links = __spreadArray([], __read(sec.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)), false);
                        var vcloudLink = null;
                        var fallbackLink = null;
                        links.forEach(function (l) {
                            var href = l[1];
                            var text = l[2].replace(/<[^>]+>/g, '').trim();
                            if (!href.startsWith('http'))
                                return;
                            if (href.includes('vcloud') || href.includes('v-cloud')) {
                                vcloudLink = href;
                            }
                            else if (href.includes('fastdl') || href.includes('g-direct') || href.includes('gofile')) {
                                if (!fallbackLink)
                                    fallbackLink = href;
                            }
                        });
                        var chosenLink = vcloudLink || fallbackLink;
                        if (chosenLink) {
                            if (!episodes_1.some(function (e) { return e.episodeNumber === epNum; })) {
                                episodes_1.push({
                                    episodeNumber: epNum,
                                    episodeTitle: "Episode ".concat(epNum),
                                    targetUrl: chosenLink,
                                });
                            }
                        }
                    });
                    // Fallback: If section-based parsing yields 0 items, parse flat links
                    if (episodes_1.length === 0) {
                        links = __spreadArray([], __read(html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)), false);
                        links.forEach(function (l) {
                            var href = l[1];
                            var text = l[2].replace(/<[^>]+>/g, '').trim();
                            if (!href.startsWith('http'))
                                return;
                            if (href.includes('vcloud') || href.includes('v-cloud')) {
                                var epMatch = text.match(/(?:Episode|Ep|E)\s*(\d+)/i) || href.match(/(?:episode|ep|e)(\d+)/i);
                                var epNum = epMatch ? parseInt(epMatch[1], 10) : episodes_1.length + 1;
                                episodes_1.push({
                                    episodeNumber: epNum,
                                    episodeTitle: "Episode ".concat(epNum),
                                    targetUrl: href,
                                });
                            }
                        });
                    }
                    return [2 /*return*/, episodes_1.sort(function (a, b) { return a.episodeNumber - b.episodeNumber; })];
                case 3:
                    e_3 = _a.sent();
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function isStreamableVideoUrl(url) {
    if (!url || typeof url !== 'string')
        return false;
    if (!url.startsWith('http://') && !url.startsWith('https://'))
        return false;
    // Reject web page URLs
    if (url.includes('vcloud.zip') ||
        url.includes('v-cloud') ||
        url.includes('fastdl.zip') ||
        url.includes('nexdrive') ||
        url.includes('embed.php') ||
        url.includes('hubcloud') ||
        url.includes('pixeldrain.dev') ||
        url.includes('filebee.xyz')) {
        return false;
    }
    // Accept direct video streams
    return (url.includes('.mkv') ||
        url.includes('.mp4') ||
        url.includes('.m3u8') ||
        url.includes('r2.cloudflarestorage.com') ||
        url.includes('r2.dev') ||
        url.includes('.webm') ||
        url.includes('.ts') ||
        url.includes('hakunaymatata.com'));
}
/**
 * Resolves Pass 2 VegaMovies deep locker URL (VCloud double-atob + G-Drive failover).
 */
function resolveVegaMoviesLocker(targetUrl_1) {
    return __awaiter(this, arguments, void 0, function (targetUrl, qualityLabel) {
        var res, html, lockerLinks, candidateLockers_2, candidateLockers_1, candidateLockers_1_1, locker, vcloudUrl, vres, vhtml, atobMatch, targetServerPage, decoded, sRes, sHtml, buttonRegex, match, candidates, href, text, priority, candidates_1, candidates_1_1, candidate, e_4, e_5_1, err_1;
        var e_5, _a, e_6, _b;
        if (qualityLabel === void 0) { qualityLabel = '720p'; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 16, , 17]);
                    return [4 /*yield*/, fetch(targetUrl, {
                            headers: { 'User-Agent': UA, 'Referer': BASE_DOMAIN + '/' },
                        })];
                case 1:
                    res = _c.sent();
                    return [4 /*yield*/, res.text()];
                case 2:
                    html = _c.sent();
                    lockerLinks = __spreadArray([], __read(html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)), false);
                    candidateLockers_2 = [];
                    lockerLinks.forEach(function (l) {
                        var href = l[1];
                        var text = l[2].replace(/<[^>]+>/g, '').trim();
                        if (href.includes('url=')) {
                            try {
                                var b64 = href.split('url=')[1].split('&')[0];
                                href = b64decode(b64);
                            }
                            catch (e) { }
                        }
                        if (href.includes('vcloud') || href.includes('v-cloud') || href.includes('fastdl') || href.includes('nexdrive')) {
                            var priority = 99;
                            if (/v-cloud|vcloud/i.test(text) || /vcloud/i.test(href))
                                priority = 1;
                            else if (/g-direct|fastdl/i.test(text) || /fastdl/i.test(href))
                                priority = 2;
                            else
                                priority = 3;
                            candidateLockers_2.push({ text: text, href: href, priority: priority });
                        }
                    });
                    candidateLockers_2.sort(function (a, b) { return a.priority - b.priority; });
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 13, 14, 15]);
                    candidateLockers_1 = __values(candidateLockers_2), candidateLockers_1_1 = candidateLockers_1.next();
                    _c.label = 4;
                case 4:
                    if (!!candidateLockers_1_1.done) return [3 /*break*/, 12];
                    locker = candidateLockers_1_1.value;
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 10, , 11]);
                    vcloudUrl = locker.href;
                    return [4 /*yield*/, fetch(vcloudUrl, { headers: { 'User-Agent': UA } })];
                case 6:
                    vres = _c.sent();
                    return [4 /*yield*/, vres.text()];
                case 7:
                    vhtml = _c.sent();
                    atobMatch = vhtml.match(/atob\(atob\(['"]([^'"]+)['"]\)\)/i) || vhtml.match(/atob\(['"]([^'"]+)['"]\)/i);
                    targetServerPage = vcloudUrl;
                    if (atobMatch) {
                        decoded = b64decode(atobMatch[1]);
                        if (decoded && decoded.startsWith('http')) {
                            targetServerPage = decoded;
                        }
                    }
                    return [4 /*yield*/, fetch(targetServerPage, { headers: { 'User-Agent': UA } })];
                case 8:
                    sRes = _c.sent();
                    return [4 /*yield*/, sRes.text()];
                case 9:
                    sHtml = _c.sent();
                    buttonRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                    match = void 0;
                    candidates = [];
                    while ((match = buttonRegex.exec(sHtml)) !== null) {
                        href = match[1];
                        text = match[2].replace(/<[^>]+>/g, '').trim();
                        if (href && href.startsWith('http')) {
                            priority = 99;
                            if (/fslv2/i.test(text))
                                priority = 1;
                            else if (/fsl\b/i.test(text))
                                priority = 2;
                            else if (/server\s*:?\s*1\b/i.test(text))
                                priority = 3;
                            else if (/r2\.cloudflarestorage\.com|r2\.dev|\.mkv/i.test(href))
                                priority = 4;
                            if (priority < 99) {
                                candidates.push({ text: text, href: href, priority: priority });
                            }
                        }
                    }
                    candidates.sort(function (a, b) { return a.priority - b.priority; });
                    try {
                        for (candidates_1 = (e_6 = void 0, __values(candidates)), candidates_1_1 = candidates_1.next(); !candidates_1_1.done; candidates_1_1 = candidates_1.next()) {
                            candidate = candidates_1_1.value;
                            if (isStreamableVideoUrl(candidate.href)) {
                                return [2 /*return*/, {
                                        success: true,
                                        streamUrl: candidate.href,
                                        providerName: "VEGAMOVIES [".concat(candidate.text.toUpperCase(), "]"),
                                        qualityLabel: qualityLabel,
                                    }];
                            }
                        }
                    }
                    catch (e_6_1) { e_6 = { error: e_6_1 }; }
                    finally {
                        try {
                            if (candidates_1_1 && !candidates_1_1.done && (_b = candidates_1.return)) _b.call(candidates_1);
                        }
                        finally { if (e_6) throw e_6.error; }
                    }
                    return [3 /*break*/, 11];
                case 10:
                    e_4 = _c.sent();
                    return [3 /*break*/, 11];
                case 11:
                    candidateLockers_1_1 = candidateLockers_1.next();
                    return [3 /*break*/, 4];
                case 12: return [3 /*break*/, 15];
                case 13:
                    e_5_1 = _c.sent();
                    e_5 = { error: e_5_1 };
                    return [3 /*break*/, 15];
                case 14:
                    try {
                        if (candidateLockers_1_1 && !candidateLockers_1_1.done && (_a = candidateLockers_1.return)) _a.call(candidateLockers_1);
                    }
                    finally { if (e_5) throw e_5.error; }
                    return [7 /*endfinally*/];
                case 15: return [2 /*return*/, {
                        success: false,
                        providerName: 'VEGAMOVIES',
                        qualityLabel: qualityLabel,
                        message: 'No direct streamable video link found',
                    }];
                case 16:
                    err_1 = _c.sent();
                    return [2 /*return*/, {
                            success: false,
                            providerName: 'VEGAMOVIES',
                            qualityLabel: qualityLabel,
                            message: "VegaMovies resolution error: ".concat(err_1.message),
                        }];
                case 17: return [2 /*return*/];
            }
        });
    });
}
/**
 * Dedicated VCloud Token Page Resolver.
 * Receives a vcloud.zip/... URL, decodes the atob(atob(...)) token, and extracts
 * the direct Cloudflare R2 .mkv stream URL from the FSLv2 download button.
 * This is the CORRECT entry point when you already have a VCloud URL.
 */
function resolveVcloudDirectStream(vcloudUrl_1) {
    return __awaiter(this, arguments, void 0, function (vcloudUrl, qualityLabel) {
        var vres, vhtml, atobMatch, targetServerPage, decoded, sRes, sHtml, buttonRegex, match, candidates, href, text, priority, candidates_2, candidates_2_1, c, e_7;
        var e_8, _a;
        if (qualityLabel === void 0) { qualityLabel = '480p'; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, fetch(vcloudUrl, { headers: { 'User-Agent': UA } })];
                case 1:
                    vres = _b.sent();
                    return [4 /*yield*/, vres.text()];
                case 2:
                    vhtml = _b.sent();
                    atobMatch = vhtml.match(/atob\(atob\(['"]([^'"]+)['"]\)\)/i) || vhtml.match(/atob\(['"]([^'"]+)['"]\)/i);
                    targetServerPage = vcloudUrl;
                    if (atobMatch) {
                        decoded = b64decode(atobMatch[1]);
                        if (decoded && decoded.startsWith('http')) {
                            targetServerPage = decoded;
                        }
                    }
                    return [4 /*yield*/, fetch(targetServerPage, { headers: { 'User-Agent': UA } })];
                case 3:
                    sRes = _b.sent();
                    return [4 /*yield*/, sRes.text()];
                case 4:
                    sHtml = _b.sent();
                    buttonRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                    match = void 0;
                    candidates = [];
                    while ((match = buttonRegex.exec(sHtml)) !== null) {
                        href = match[1];
                        text = match[2].replace(/<[^>]+>/g, '').trim();
                        if (href && href.startsWith('http')) {
                            priority = 99;
                            if (/fslv2/i.test(text))
                                priority = 1;
                            else if (/fsl\b/i.test(text))
                                priority = 2;
                            else if (/server\s*:?\s*1\b/i.test(text))
                                priority = 3;
                            else if (/r2\.cloudflarestorage\.com|r2\.dev|\.mkv/i.test(href))
                                priority = 4;
                            if (priority < 99) {
                                candidates.push({ text: text, href: href, priority: priority });
                            }
                        }
                    }
                    candidates.sort(function (a, b) { return a.priority - b.priority; });
                    try {
                        for (candidates_2 = __values(candidates), candidates_2_1 = candidates_2.next(); !candidates_2_1.done; candidates_2_1 = candidates_2.next()) {
                            c = candidates_2_1.value;
                            if (isStreamableVideoUrl(c.href)) {
                                return [2 /*return*/, c.href];
                            }
                        }
                    }
                    catch (e_8_1) { e_8 = { error: e_8_1 }; }
                    finally {
                        try {
                            if (candidates_2_1 && !candidates_2_1.done && (_a = candidates_2.return)) _a.call(candidates_2);
                        }
                        finally { if (e_8) throw e_8.error; }
                    }
                    return [3 /*break*/, 6];
                case 5:
                    e_7 = _b.sent();
                    console.warn('[VCloud Direct Resolver Error]', e_7);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/, null];
            }
        });
    });
}
/**
 * Dedicated Stream Resolver for Server 1 in Video Player Modal.
 * Resolves VegaMovies 480P/720P/1080P VCloud Cloudflare R2 direct MKV stream URL.
 */
function resolveVegaMovies480pStream(queryTitle_1, targetYear_1, imdbId_1) {
    return __awaiter(this, arguments, void 0, function (queryTitle, targetYear, imdbId, mediaType, seasonNum, episodeNum, baseDomain) {
        var isTv, options, candidateLockers, pool, epTargetVcloud, selectedQualityLabel, sortedPool, sortedPool_1, sortedPool_1_1, locker, episodes, singleEpisodes, matchedEp, e_9, e_10_1, option480p, resolved, directUrl, e_11;
        var e_10, _a;
        if (mediaType === void 0) { mediaType = 'movie'; }
        if (seasonNum === void 0) { seasonNum = 1; }
        if (episodeNum === void 0) { episodeNum = 1; }
        if (baseDomain === void 0) { baseDomain = BASE_DOMAIN; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 16, , 17]);
                    console.log("[VegaMoviesStream] Searching \"".concat(queryTitle, "\" on ").concat(baseDomain, " (Season ").concat(seasonNum, ", Ep ").concat(episodeNum, ")..."));
                    isTv = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';
                    return [4 /*yield*/, getVegaMoviesQualityOptions(queryTitle, targetYear, imdbId, mediaType, baseDomain, 'VEGAMOVIES')];
                case 1:
                    options = _b.sent();
                    console.log("[VegaMoviesStream] getVegaMoviesQualityOptions returned ".concat((options === null || options === void 0 ? void 0 : options.length) || 0, " options"));
                    if (!options || options.length === 0)
                        return [2 /*return*/, null];
                    candidateLockers = options.filter(function (o) {
                        return o.contentType !== 'SEASON_BATCH_ZIP' &&
                            !/\b(?:batch|zip|pack)\b/i.test(o.targetUrl) &&
                            !/\b(?:batch|zip|pack)\b/i.test(o.episodeName || '');
                    });
                    pool = candidateLockers.length > 0 ? candidateLockers : options;
                    console.log("[VegaMoviesStream] Pool size: ".concat(pool.length));
                    if (pool.length === 0)
                        return [2 /*return*/, null];
                    epTargetVcloud = null;
                    selectedQualityLabel = '480p';
                    if (!isTv) return [3 /*break*/, 12];
                    sortedPool = __spreadArray([], __read(pool), false).sort(function (a, b) {
                        var order = { '480p': 1, '720p': 2, '1080p': 3, '4k': 4 };
                        var qA = order[(a.qualityLabel || '').toLowerCase()] || 99;
                        var qB = order[(b.qualityLabel || '').toLowerCase()] || 99;
                        return qA - qB;
                    });
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 9, 10, 11]);
                    sortedPool_1 = __values(sortedPool), sortedPool_1_1 = sortedPool_1.next();
                    _b.label = 3;
                case 3:
                    if (!!sortedPool_1_1.done) return [3 /*break*/, 8];
                    locker = sortedPool_1_1.value;
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 6, , 7]);
                    console.log("[VegaMoviesStream] Checking locker: ".concat(locker.targetUrl, " (").concat(locker.qualityLabel, ")"));
                    return [4 /*yield*/, fetchVegaMoviesEpisodes(locker.targetUrl)];
                case 5:
                    episodes = _b.sent();
                    console.log("[VegaMoviesStream] Locker returned ".concat(episodes.length, " episodes"));
                    singleEpisodes = episodes.filter(function (e) { return !/\b(?:batch|zip|pack)\b/i.test(e.targetUrl) && !/\b(?:batch|zip|pack)\b/i.test(e.episodeTitle); });
                    if (singleEpisodes.length > 0) {
                        matchedEp = singleEpisodes.find(function (e) { return e.episodeNumber === episodeNum; }) || singleEpisodes[0];
                        if (matchedEp && matchedEp.targetUrl) {
                            console.log("[VegaMoviesStream] Matched Ep ".concat(episodeNum, ": ").concat(matchedEp.targetUrl));
                            epTargetVcloud = matchedEp.targetUrl;
                            selectedQualityLabel = locker.qualityLabel || '720p';
                            return [3 /*break*/, 8];
                        }
                    }
                    return [3 /*break*/, 7];
                case 6:
                    e_9 = _b.sent();
                    console.log("[VegaMoviesStream] Locker error: ".concat(e_9.message));
                    return [3 /*break*/, 7];
                case 7:
                    sortedPool_1_1 = sortedPool_1.next();
                    return [3 /*break*/, 3];
                case 8: return [3 /*break*/, 11];
                case 9:
                    e_10_1 = _b.sent();
                    e_10 = { error: e_10_1 };
                    return [3 /*break*/, 11];
                case 10:
                    try {
                        if (sortedPool_1_1 && !sortedPool_1_1.done && (_a = sortedPool_1.return)) _a.call(sortedPool_1);
                    }
                    finally { if (e_10) throw e_10.error; }
                    return [7 /*endfinally*/];
                case 11: return [3 /*break*/, 14];
                case 12:
                    option480p = pool.find(function (o) { return o.qualityLabel === '480p'; }) || pool[0];
                    return [4 /*yield*/, resolveVegaMoviesLocker(option480p.targetUrl, option480p.qualityLabel || '480p')];
                case 13:
                    resolved = _b.sent();
                    if (resolved && resolved.success && isStreamableVideoUrl(resolved.streamUrl)) {
                        return [2 /*return*/, {
                                url: resolved.streamUrl || '',
                                qualityLabel: "VEGAMOVIES (".concat(resolved.providerName || 'VCLOUD', ")"),
                            }];
                    }
                    return [2 /*return*/, null];
                case 14:
                    console.log("[VegaMoviesStream] epTargetVcloud: ".concat(epTargetVcloud));
                    if (!epTargetVcloud)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, resolveVcloudDirectStream(epTargetVcloud, selectedQualityLabel)];
                case 15:
                    directUrl = _b.sent();
                    console.log("[VegaMoviesStream] directUrl resolved: ".concat(directUrl));
                    if (directUrl) {
                        return [2 /*return*/, {
                                url: directUrl,
                                qualityLabel: "VEGAMOVIES ".concat(selectedQualityLabel.toUpperCase(), " (VCLOUD DIRECT)"),
                            }];
                    }
                    return [3 /*break*/, 17];
                case 16:
                    e_11 = _b.sent();
                    console.warn('[VegaMovies Stream Resolver Error]', e_11);
                    return [3 /*break*/, 17];
                case 17: return [2 /*return*/, null];
            }
        });
    });
}
