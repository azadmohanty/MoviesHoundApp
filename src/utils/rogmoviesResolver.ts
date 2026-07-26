import { Buffer } from 'buffer';
import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { extractRipFormat, extractAudioTracks, extractVideoCodec } from './MediaTagExtractor';

const DEFAULT_ROG_DOMAIN = 'https://rogmovies.rest';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Safe base64 decode that works on both Node.js (Buffer) and React Native Hermes (no atob).
 * Tries double-decode first (atob(atob(x)) pattern used by VCloud), then single decode.
 */
function b64decode(str: string): string {
  try {
    // React Native / Hermes — Buffer is available via the 'buffer' polyfill
    // @ts-ignore
    const decoded1 = Buffer.from(str, 'base64').toString('utf-8');
    // Try double decode (VCloud uses atob(atob(x)))
    try {
      // @ts-ignore
      const decoded2 = Buffer.from(decoded1, 'base64').toString('utf-8');
      if (decoded2.startsWith('http')) return decoded2;
    } catch (_) {}
    return decoded1;
  } catch (e) {
    // Absolute last resort: try global atob if available (browser/web)
    try { return (globalThis as any).atob?.(str) ?? str; } catch (_) { return str; }
  }
}

export interface SeriesEpisodeItem {
  episodeNumber: number;
  episodeTitle: string;
  targetUrl: string;
}

/**
 * 100% Empirical DOM Parser for RogMovies main article page.
 * Identical structure to VegaMovies, tailored for Indian/Bollywood content.
 */
export function parseRogMoviesArticle(
  html: string,
  articleUrl: string,
  siteDisplayName: string = 'ROGMOVIES'
): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];

  const h1Match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mainTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';

  const headerRegex = /<h[35][^>]*>([\s\S]*?)<\/h[35]>([\s\S]*?)(?=<h[1-5]|$)/gi;
  const matches = [...html.matchAll(headerRegex)];

  matches.forEach((match) => {
    const headerText = match[1].replace(/<[^>]+>/g, '').trim();
    const sectionHtml = match[2];

    if (!/480p|720p|1080p|2160p|4K/i.test(headerText)) return;

    let qualityLabel: '480p' | '720p' | '1080p' | '4K' = '720p';
    if (headerText.includes('480p')) qualityLabel = '480p';
    else if (headerText.includes('1080p')) qualityLabel = '1080p';
    else if (/2160p|4K/i.test(headerText)) qualityLabel = '4K';

    const fullTagContext = `${headerText} ${mainTitle}`;
    const codec = extractVideoCodec(headerText);
    const ripFormat = extractRipFormat(fullTagContext);
    const audioTracks = extractAudioTracks(fullTagContext);

    const sizeMatch = headerText.match(/\[([\d.]+\s*(?:GB|MB)(?:\/E)?)]/i);
    const fileSize = sizeMatch ? sizeMatch[1] : 'N/A';

    const baseSeasonMatch = headerText.match(/\b(?:Season|S)\s*0*(\d+)\b/i) ||
                            mainTitle.match(/\b(?:Season|S)\s*0*(\d+)\b/i);
    const isSeriesArticle = /\b(?:season|s0\d|series|episodes|complete)\b/i.test(headerText) || /\b(?:season|s0\d|series|episodes|complete)\b/i.test(mainTitle);

    const links = [...sectionHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    links.forEach((l) => {
      const href = l[1];
      const linkText = l[2].replace(/<[^>]+>/g, '').trim();

      if (!href.includes('nexdrive') && !href.includes('vcloud') && !href.includes('fastdl') && !href.includes('gdflix') && !href.includes('dwd-button')) return;

      const linkSeasonMatch = linkText.match(/\b(?:Season|S)\s*0*(\d+)\b/i);
      const seasonMatch = linkSeasonMatch || baseSeasonMatch;
      const seasonNumber = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;

      const isBatch = /\b(?:batch|zip)\b/i.test(linkText);
      const isEpisode = /\b(?:episode|ep\s*\d+|e\d{2}|single)\b/i.test(linkText);

      let contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP' = 'MOVIE';
      if (isBatch) {
        contentType = 'SEASON_BATCH_ZIP';
      } else if (isSeriesArticle || isEpisode) {
        contentType = 'SINGLE_EPISODE';
      }

      const linkSizeMatch = linkText.match(/\[([\d.]+\s*(?:GB|MB))]/i);
      const optionFileSize = linkSizeMatch ? linkSizeMatch[1] : fileSize;

      let priorityScore = 5;
      if (isBatch) {
        priorityScore = 90; // Demote Zip/Batch packs below single episode links!
      } else if (/v-cloud|vcloud/i.test(linkText) || /vcloud/i.test(href)) {
        priorityScore = 1; // Highest priority for single episode V-Cloud links!
      } else if (/g-direct|fastdl/i.test(linkText) || /fastdl/i.test(href)) {
        priorityScore = 3;
      }

      options.push({
        id: `rog-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        siteKey: 'rogmovies',
        siteDisplayName: siteDisplayName,
        qualityLabel,
        ripFormat,
        codec,
        fileSize: optionFileSize,
        audioTracks,
        contentType,
        episodeName: isEpisode ? linkText : undefined,
        seasonNumber,
        targetUrl: href,
        priorityScore,
      });
    });
  });

  options.sort((a, b) => (a.priorityScore || 5) - (b.priorityScore || 5));
  return options;
}

/**
 * Automated Search & Verification Pipeline for RogMovies (Indian/Bollywood Content).
 */
export async function getRogMoviesQualityOptions(
  queryTitle: string,
  targetYear?: string | number,
  targetImdbId?: string,
  mediaType: string = 'movie',
  baseDomain: string = DEFAULT_ROG_DOMAIN,
  siteDisplayName: string = 'ROGMOVIES',
  signal?: AbortSignal,
  onLog?: (msg: string) => void
): Promise<ScrapedQualityOption[]> {
  const searchQuery = sanitizeSearchQuery(queryTitle);
  const domain = baseDomain || DEFAULT_ROG_DOMAIN;
  const searchUrl = `${domain}/search.php?q=${encodeURIComponent(searchQuery)}&page=1`;

  if (onLog) onLog(`${siteDisplayName}: Searching "${searchQuery}" on ${domain}...`);

  let hits: any[] = [];
  try {
    const res = await fetch(searchUrl, { signal, headers: { 'User-Agent': UA } });
    const text = await res.text();
    const json = JSON.parse(text);
    hits = json.hits || [];
  } catch (e: any) {
    if (onLog) onLog(`${siteDisplayName} search error: ${e.message}`);
    return [];
  }

  if (hits.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 search hits returned`);
    return [];
  }

  if (onLog) onLog(`${siteDisplayName}: ${hits.length} raw search hits found. Pre-filtering...`);

  const numTargetYear = targetYear ? parseInt(String(targetYear), 10) : undefined;
  const isTvTarget = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';

  let candidateHits = hits.filter((hit: any) => {
    const postTitle = hit.document?.post_title || '';
    const score = calculateMatchConfidence(queryTitle, postTitle, targetYear);
    if (score < 50) return false;

    const isTvPost = /season|s0\d|series|episodes|complete/i.test(postTitle);
    if (isTvTarget && !isTvPost) return false;
    if (!isTvTarget && isTvPost) return false;

    return true;
  });

  if (numTargetYear && candidateHits.length > 0) {
    const exactYearHits = candidateHits.filter((hit: any) => {
      const postTitle = hit.document?.post_title || '';
      const postYearMatch = postTitle.match(/\b(19\d\d|20\d\d)\b/);
      if (postYearMatch) {
        return parseInt(postYearMatch[1], 10) === numTargetYear;
      }
      return false;
    });

    if (exactYearHits.length > 0) {
      if (onLog) onLog(`${siteDisplayName}: Exact year match (${numTargetYear}) found!`);
      candidateHits = exactYearHits;
    } else {
      candidateHits = candidateHits.filter((hit: any) => {
        const postTitle = hit.document?.post_title || '';
        const postYearMatch = postTitle.match(/\b(19\d\d|20\d\d)\b/);
        if (postYearMatch) {
          const postYear = parseInt(postYearMatch[1], 10);
          return Math.abs(postYear - numTargetYear) <= 1;
        }
        return true;
      });
    }
  }

  if (candidateHits.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 candidates passed pre-filter`);
    return [];
  }

  const topHits = candidateHits.slice(0, 3);
  if (onLog) onLog(`${siteDisplayName}: Parallel fetching ${topHits.length} verified pages...`);

  const pagePromises = topHits.map(async (hit: any) => {
    let permalink = hit.document?.permalink || '';
    if (permalink.startsWith('/')) permalink = domain + permalink;

    try {
      const res = await fetch(permalink, { signal, headers: { 'User-Agent': UA } });
      const html = await res.text();

      if (targetImdbId) {
        const cleanImdb = targetImdbId.trim().toLowerCase();
        const foundImdbMatches = [...html.matchAll(/tt\d{7,8}/gi)].map((m) => m[0].toLowerCase());

        if (foundImdbMatches.length > 0) {
          const hasExactImdb = foundImdbMatches.includes(cleanImdb);
          if (!hasExactImdb) {
            if (onLog) onLog(`${siteDisplayName}: Rejecting page (IMDb ID mismatch: ${foundImdbMatches[0]})`);
            return [];
          } else {
            if (onLog) onLog(`${siteDisplayName}: 🌟 100% Golden IMDb Match confirmed (${cleanImdb})`);
          }
        }
      }

      return parseRogMoviesArticle(html, permalink, siteDisplayName);
    } catch (e: any) {
      return [];
    }
  });

  const pageResults = await Promise.allSettled(pagePromises);
  const allOptions: ScrapedQualityOption[] = [];

  pageResults.forEach((res) => {
    if (res.status === 'fulfilled') {
      allOptions.push(...res.value);
    }
  });

  const optionMap = new Map<string, ScrapedQualityOption>();
  allOptions.forEach((o) => optionMap.set(o.targetUrl, o));

  const uniqueOptions = Array.from(optionMap.values()).sort((a, b) => a.priorityScore - b.priorityScore);
  if (onLog) onLog(`${siteDisplayName}: 🎉 ${uniqueOptions.length} quality options extracted!`);

  return uniqueOptions;
}

/**
 * Section-Based Episode Parser for RogMovies series.
 * Parses <h4>-:Episodes: X:-</h4> header blocks to extract direct VCloud / locker links per episode.
 */
export async function fetchRogMoviesEpisodes(
  nexdriveUrl: string,
  signal?: AbortSignal
): Promise<SeriesEpisodeItem[]> {
  try {
    const res = await fetch(nexdriveUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Referer': DEFAULT_ROG_DOMAIN + '/',
      },
    });
    const html = await res.text();

    const episodes: SeriesEpisodeItem[] = [];

    // Split HTML by episode section headers (<h4>-:Episodes: 1:-</h4> or <h3>/<h4> Episode X)
    const sections = html.split(/(?=<h[345][^>]*>|(?:\b(?:Episodes?|Ep|E)\b\s*:?\s*\d+))/i);

    sections.forEach((sec) => {
      const epMatch = sec.match(/(?:Episodes?|Ep|E)\s*:?\s*0*(\d+)/i);
      const epNum = epMatch ? parseInt(epMatch[1], 10) : null;

      if (!epNum) return;

      const links = [...sec.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

      let vcloudLink: string | null = null;
      let fallbackLink: string | null = null;

      links.forEach((l) => {
        const href = l[1];
        const text = l[2].replace(/<[^>]+>/g, '').trim();

        if (!href.startsWith('http')) return;

        if (href.includes('vcloud') || href.includes('v-cloud')) {
          vcloudLink = href;
        } else if (href.includes('fastdl') || href.includes('g-direct') || href.includes('gofile')) {
          if (!fallbackLink) fallbackLink = href;
        }
      });

      const chosenLink = vcloudLink || fallbackLink;
      if (chosenLink) {
        if (!episodes.some((e) => e.episodeNumber === epNum)) {
          episodes.push({
            episodeNumber: epNum,
            episodeTitle: `Episode ${epNum}`,
            targetUrl: chosenLink,
          });
        }
      }
    });

    // Fallback: If section-based parsing yields 0 items, parse flat links
    if (episodes.length === 0) {
      const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      links.forEach((l) => {
        const href = l[1];
        const text = l[2].replace(/<[^>]+>/g, '').trim();
        if (!href.startsWith('http')) return;

        if (href.includes('vcloud') || href.includes('v-cloud')) {
          const epMatch = text.match(/(?:Episode|Ep|E)\s*(\d+)/i) || href.match(/(?:episode|ep|e)(\d+)/i);
          const epNum = epMatch ? parseInt(epMatch[1], 10) : episodes.length + 1;
          episodes.push({
            episodeNumber: epNum,
            episodeTitle: `Episode ${epNum}`,
            targetUrl: href,
          });
        }
      });
    }

    return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (e: any) {
    return [];
  }
}

export function isStreamableVideoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  // Reject web page URLs
  if (
    url.includes('vcloud.zip') ||
    url.includes('v-cloud') ||
    url.includes('fastdl.zip') ||
    url.includes('nexdrive') ||
    url.includes('embed.php') ||
    url.includes('hubcloud') ||
    url.includes('pixeldrain.dev') ||
    url.includes('filebee.xyz')
  ) {
    return false;
  }

  // Accept direct video streams
  return (
    url.includes('.mkv') ||
    url.includes('.mp4') ||
    url.includes('.m3u8') ||
    url.includes('r2.cloudflarestorage.com') ||
    url.includes('r2.dev') ||
    url.includes('googleusercontent.com') ||
    url.includes('.webm') ||
    url.includes('.ts') ||
    url.includes('hakunaymatata.com')
  );
}

/**
 * Helper to decode raw vcloud URL into unlocked tokenized page URL.
 */
async function decodeVcloudTokenPage(vcloudUrl: string): Promise<string> {
  try {
    const vres = await fetch(vcloudUrl, { headers: { 'User-Agent': UA } });
    const vhtml = await vres.text();
    const atobMatch = vhtml.match(/atob\(atob\(['"]([^'"]+)['"]\)\)/i) || vhtml.match(/atob\(['"]([^'"]+)['"]\)/i);
    if (atobMatch) {
      const decoded = b64decode(atobMatch[1]);
      if (decoded && decoded.startsWith('http')) {
        return decoded;
      }
    }
  } catch (e) {}
  return vcloudUrl;
}

/**
 * Takes a NexDrive or VCloud URL, decodes the token, and returns the UNLOCKED VCloud server choice page URL (?token=...).
 * Used for Downloader screen so users land straight on the server list with 0 countdown timer!
 */
export async function resolveRogMoviesUnlockedPage(targetUrl: string): Promise<string> {
  try {
    if (targetUrl.includes('vcloud') || targetUrl.includes('v-cloud')) {
      return await decodeVcloudTokenPage(targetUrl);
    }

    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': DEFAULT_ROG_DOMAIN + '/' },
    });
    const html = await res.text();

    const lockerLinks = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const l of lockerLinks) {
      let href = l[1];
      if (href.includes('url=')) {
        try {
          const b64 = href.split('url=')[1].split('&')[0];
          href = b64decode(b64);
        } catch (e) {}
      }
      if (href.includes('vcloud') || href.includes('v-cloud')) {
        return await decodeVcloudTokenPage(href);
      }
    }
  } catch (e) {}
  return targetUrl;
}

/**
 * Dedicated VCloud Token Page Resolver for RogMovies.
 * Receives a vcloud.zip/... URL, decodes the atob(atob(...)) token, and extracts
 * the direct Cloudflare R2 .mkv stream URL from the FSLv2 download button.
 */
async function resolveVcloudDirectStream(vcloudUrl: string, qualityLabel: string = '480p'): Promise<string | null> {
  try {
    // Step 1: Fetch the VCloud token page
    const vres = await fetch(vcloudUrl, { headers: { 'User-Agent': UA } });
    const vhtml = await vres.text();

    // Step 2: Decode atob(atob('...')) to get the tokenized server page URL
    const atobMatch = vhtml.match(/atob\(atob\(['"]([^'"]+)['"]\)\)/i) || vhtml.match(/atob\(['"]([^'"]+)['"]\)/i);
    let targetServerPage = vcloudUrl;

    if (atobMatch) {
      const decoded = b64decode(atobMatch[1]);
      if (decoded && decoded.startsWith('http')) {
        targetServerPage = decoded;
      }
    }

    // Step 3: Fetch the tokenized server page and extract FSLv2 / R2 direct stream button
    const sRes = await fetch(targetServerPage, { headers: { 'User-Agent': UA } });
    const sHtml = await sRes.text();

    const buttonRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const candidates: Array<{ text: string; href: string; priority: number }> = [];

    while ((match = buttonRegex.exec(sHtml)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();

      if (href && href.startsWith('http')) {
        let priority = 99;
        if (/fslv2/i.test(text)) priority = 1;
        else if (/fsl\b/i.test(text)) priority = 2;
        else if (/server\s*:?\s*1\b/i.test(text)) priority = 3;
        else if (/r2\.cloudflarestorage\.com|r2\.dev|\.mkv/i.test(href)) priority = 4;

        if (priority < 99) {
          candidates.push({ text, href, priority });
        }
      }
    }

    candidates.sort((a, b) => a.priority - b.priority);

    for (const c of candidates) {
      if (isStreamableVideoUrl(c.href)) {
        return c.href;
      }
    }
  } catch (e) {
    console.warn('[RogMovies VCloud Direct Resolver Error]', e);
  }
  return null;
}

/**
 * Resolves Pass 2 RogMovies locker URL (VCloud double-atob + G-Drive failover).
 */
export async function resolveRogMoviesLocker(
  targetUrl: string,
  qualityLabel: string = '720p',
  baseDomain: string = DEFAULT_ROG_DOMAIN
): Promise<ResolvedStreamResult> {
  try {
    // Direct VCloud URL handling (e.g. from Downloader episode buttons)
    if (targetUrl.includes('vcloud') || targetUrl.includes('v-cloud')) {
      const directUrl = await resolveVcloudDirectStream(targetUrl, qualityLabel);
      if (directUrl) {
        return {
          success: true,
          streamUrl: directUrl,
          providerName: 'ROGMOVIES [VCLOUD DIRECT]',
          qualityLabel,
        };
      }
    }

    const domain = baseDomain || DEFAULT_ROG_DOMAIN;
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': domain + '/' },
    });
    const html = await res.text();

    const lockerLinks = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const candidateLockers: Array<{ text: string; href: string; priority: number }> = [];

    lockerLinks.forEach((l) => {
      let href = l[1];
      const text = l[2].replace(/<[^>]+>/g, '').trim();

      if (href.includes('url=')) {
        try {
          const b64 = href.split('url=')[1].split('&')[0];
          href = b64decode(b64);
        } catch (e) {}
      }

      if (href.includes('vcloud') || href.includes('v-cloud') || href.includes('fastdl') || href.includes('nexdrive')) {
        let priority = 99;
        if (/v-cloud|vcloud/i.test(text) || /vcloud/i.test(href)) priority = 1;
        else if (/g-direct|fastdl/i.test(text) || /fastdl/i.test(href)) priority = 2;
        else priority = 3;

        candidateLockers.push({ text, href, priority });
      }
    });

    candidateLockers.sort((a, b) => a.priority - b.priority);

    for (const locker of candidateLockers) {
      try {
        let vcloudUrl = locker.href;
        const vres = await fetch(vcloudUrl, { headers: { 'User-Agent': UA } });
        const vhtml = await vres.text();

        const atobMatch = vhtml.match(/atob\(atob\(['"]([^'"]+)['"]\)\)/i) || vhtml.match(/atob\(['"]([^'"]+)['"]\)/i);
        let targetServerPage = vcloudUrl;

        if (atobMatch) {
          const decoded = b64decode(atobMatch[1]);
          if (decoded && decoded.startsWith('http')) {
            targetServerPage = decoded;
          }
        }

        const sRes = await fetch(targetServerPage, { headers: { 'User-Agent': UA } });
        const sHtml = await sRes.text();

        const buttonRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const candidates: Array<{ text: string; href: string; priority: number }> = [];

        while ((match = buttonRegex.exec(sHtml)) !== null) {
          const href = match[1];
          const text = match[2].replace(/<[^>]+>/g, '').trim();

          if (href && href.startsWith('http')) {
            let priority = 99;
            if (/fslv2/i.test(text)) priority = 1;
            else if (/fsl\b/i.test(text)) priority = 2;
            else if (/server\s*:?\s*1\b/i.test(text)) priority = 3;
            else if (/r2\.cloudflarestorage\.com|r2\.dev|\.mkv/i.test(href)) priority = 4;

            if (priority < 99) {
              candidates.push({ text, href, priority });
            }
          }
        }

        candidates.sort((a, b) => a.priority - b.priority);

        for (const candidate of candidates) {
          if (isStreamableVideoUrl(candidate.href)) {
            return {
              success: true,
              streamUrl: candidate.href,
              providerName: `ROGMOVIES [${candidate.text.toUpperCase()}]`,
              qualityLabel,
            };
          }
        }
      } catch (e) {}
    }

    return {
      success: false,
      providerName: 'ROGMOVIES',
      qualityLabel,
      message: 'No direct streamable video link found',
    };
  } catch (err: any) {
    return {
      success: false,
      providerName: 'ROGMOVIES',
      qualityLabel,
      message: `RogMovies resolution error: ${err.message}`,
    };
  }
}

/**
 * Dedicated Stream Resolver for Server 1 in Video Player Modal (Bollywood / RogMovies).
 * Resolves RogMovies 480P/720P/1080P VCloud Cloudflare R2 direct MKV stream URL.
 */
export async function resolveRogMovies480pStream(
  queryTitle: string,
  targetYear?: number | string,
  imdbId?: string,
  mediaType: string = 'movie',
  seasonNum: number = 1,
  episodeNum: number = 1,
  baseDomain: string = DEFAULT_ROG_DOMAIN
): Promise<{ url: string; qualityLabel: string } | null> {
  try {
    console.log(`[RogMoviesStream] Searching "${queryTitle}" on ${baseDomain} (Season ${seasonNum}, Ep ${episodeNum})...`);
    const isTv = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';
    const options = await getRogMoviesQualityOptions(
      queryTitle,
      targetYear,
      imdbId,
      mediaType,
      baseDomain,
      'ROGMOVIES'
    );

    console.log(`[RogMoviesStream] getRogMoviesQualityOptions returned ${options?.length || 0} options`);
    if (!options || options.length === 0) return null;

    // Filter out Batch/Zip packs
    const candidateLockers = options.filter(
      (o) =>
        o.contentType !== 'SEASON_BATCH_ZIP' &&
        !/\b(?:batch|zip|pack)\b/i.test(o.targetUrl) &&
        !/\b(?:batch|zip|pack)\b/i.test(o.episodeName || '')
    );

    const pool = candidateLockers.length > 0 ? candidateLockers : options;
    console.log(`[RogMoviesStream] Pool size: ${pool.length}`);
    if (pool.length === 0) return null;

    let epTargetVcloud: string | null = null;
    let selectedQualityLabel = '480p';

    if (isTv) {
      // Sort lockers so 480p comes first if available, followed by 720p then 1080p
      const sortedPool = [...pool].sort((a, b) => {
        const order: Record<string, number> = { '480p': 1, '720p': 2, '1080p': 3, '4k': 4 };
        const qA = order[(a.qualityLabel || '').toLowerCase()] || 99;
        const qB = order[(b.qualityLabel || '').toLowerCase()] || 99;
        return qA - qB;
      });

      // Iterate through candidate NexDrive lockers to extract per-episode VCloud URLs
      for (const locker of sortedPool) {
        try {
          console.log(`[RogMoviesStream] Checking locker: ${locker.targetUrl} (${locker.qualityLabel})`);
          const episodes = await fetchRogMoviesEpisodes(locker.targetUrl);
          console.log(`[RogMoviesStream] Locker returned ${episodes.length} episodes`);
          const singleEpisodes = episodes.filter(
            (e) => !/\b(?:batch|zip_file|pack_file)\b/i.test(e.episodeTitle)
          );

          if (singleEpisodes.length > 0) {
            const matchedEp = singleEpisodes.find((e) => e.episodeNumber === episodeNum) || singleEpisodes[0];
            if (matchedEp && matchedEp.targetUrl) {
              console.log(`[RogMoviesStream] Matched Ep ${episodeNum}: ${matchedEp.targetUrl}`);
              epTargetVcloud = matchedEp.targetUrl;
              selectedQualityLabel = locker.qualityLabel || '720p';
              break;
            }
          }
        } catch (e: any) {
          console.log(`[RogMoviesStream] Locker error: ${e.message}`);
        }
      }
    } else {
      const option480p = pool.find((o) => o.qualityLabel === '480p') ||
                         pool.find((o) => o.qualityLabel === '720p') ||
                         pool[0];
      const resolved = await resolveRogMoviesLocker(option480p.targetUrl, option480p.qualityLabel || '480p', baseDomain);
      if (resolved && resolved.success && isStreamableVideoUrl(resolved.streamUrl)) {
        return {
          url: resolved.streamUrl || '',
          qualityLabel: `ROGMOVIES (${resolved.providerName || 'VCLOUD'})`,
        };
      }
      return null;
    }

    console.log(`[RogMoviesStream] epTargetVcloud: ${epTargetVcloud}`);
    if (!epTargetVcloud) return null;

    // Pass 2: epTargetVcloud is a direct vcloud.zip/... URL — use the dedicated resolver
    const directUrl = await resolveVcloudDirectStream(epTargetVcloud, selectedQualityLabel);
    console.log(`[RogMoviesStream] directUrl resolved: ${directUrl}`);

    if (directUrl) {
      return {
        url: directUrl,
        qualityLabel: `ROGMOVIES ${selectedQualityLabel.toUpperCase()} (VCLOUD DIRECT)`,
      };
    }
  } catch (e: any) {
    console.warn('[RogMovies Stream Resolver Error]', e);
  }

  return null;
}
