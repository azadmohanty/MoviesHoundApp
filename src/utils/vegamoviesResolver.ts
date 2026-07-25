import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence } from './FuzzyMatcher';

const BASE_DOMAIN = 'https://vegamovies.navy';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface SeriesEpisodeItem {
  episodeNumber: number;
  episodeTitle: string;
  targetUrl: string;
}

/**
 * 100% Empirical DOM Parser for VegaMovies main article page.
 * Iterates through all <h3...>/<h5...> header blocks and extracts download links from the following section.
 */
export function parseVegaMoviesArticle(html: string, articleUrl: string): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];

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

    const isHevc = /hevc|10bit|x265/i.test(headerText);
    const codec = isHevc ? 'HEVC 10Bit' : 'H.264';
    const isImax = /imax/i.test(headerText);
    const isBluray = /bluray/i.test(headerText);
    const ripFormat = isImax ? 'BluRay IMAX' : isBluray ? 'BluRay' : /web-?dl/i.test(headerText) ? 'WEB-DL' : 'WEBRip';

    const sizeMatch = headerText.match(/\[([\d.]+\s*(?:GB|MB)(?:\/E)?)]/i);
    const fileSize = sizeMatch ? sizeMatch[1] : 'N/A';

    const audioMatch = headerText.match(/hindi[^|\]]*|dual audio|org(?:inal)?/i);
    const audioTracks = audioMatch ? 'Hindi + English' : 'English';

    const h1Match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const mainTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
    const seasonMatch = headerText.match(/Season\s*(\d+)/i) || mainTitle.match(/Season\s*(\d+)/i);
    const seasonNumber = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;
    const isSeriesArticle = /season|s0\d|episodes|series/i.test(headerText) || /season|s0\d|episodes|series/i.test(mainTitle);

    const links = [...sectionHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    links.forEach((l) => {
      const href = l[1];
      const linkText = l[2].replace(/<[^>]+>/g, '').trim();

      if (!href.includes('nexdrive') && !href.includes('vcloud') && !href.includes('fastdl') && !href.includes('gdflix') && !href.includes('dwd-button')) return;

      const isBatch = /batch|zip/i.test(linkText);
      const isEpisode = /episode|ep\s*\d+|e\d{2}|v-cloud|g-direct|instant|resumable|single/i.test(linkText);
      
      let contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP' = 'MOVIE';
      if (isBatch) {
        contentType = 'SEASON_BATCH_ZIP';
      } else if (isSeriesArticle || isEpisode) {
        contentType = 'SINGLE_EPISODE';
      }

      options.push({
        id: `vega-${options.length}`,
        siteKey: 'vegamovies',
        siteDisplayName: 'VEGAMOVIES',
        qualityLabel,
        ripFormat,
        codec,
        fileSize,
        audioTracks,
        contentType,
        episodeName: isEpisode ? linkText : undefined,
        seasonNumber,
        targetUrl: href,
        priorityScore: 1,
      });
    });
  });

  return options;
}

/**
 * Automated Multi-Page Search & Smart Verification Pipeline for VegaMovies.
 * Includes Exact Year Priority ranking & Media Type filtering.
 */
export async function getVegaMoviesQualityOptions(
  queryTitle: string,
  targetYear?: string | number,
  targetImdbId?: string,
  mediaType: string = 'movie',
  signal?: AbortSignal,
  onLog?: (msg: string) => void
): Promise<ScrapedQualityOption[]> {
  const searchQuery = `${queryTitle} ${targetYear || ''}`.trim();
  const searchUrl = `${BASE_DOMAIN}/search.php?q=${encodeURIComponent(searchQuery)}&page=1`;

  if (onLog) onLog(`VegaMovies: Searching "${searchQuery}"...`);

  let hits: any[] = [];
  try {
    const res = await fetch(searchUrl, { signal, headers: { 'User-Agent': UA } });
    const text = await res.text();
    const json = JSON.parse(text);
    hits = json.hits || [];
  } catch (e: any) {
    if (onLog) onLog(`VegaMovies search error: ${e.message}`);
    return [];
  }

  if (hits.length === 0) {
    if (onLog) onLog('VegaMovies: 0 search hits returned');
    return [];
  }

  if (onLog) onLog(`VegaMovies: ${hits.length} raw search hits found. Pre-filtering...`);

  const numTargetYear = targetYear ? parseInt(String(targetYear), 10) : undefined;
  const isTvTarget = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';

  // Step 1: Pre-filter by media type & title score
  let candidateHits = hits.filter((hit: any) => {
    const postTitle = hit.document?.post_title || '';
    const score = calculateMatchConfidence(queryTitle, postTitle, targetYear);
    if (score < 50) return false;

    const isTvPost = /season|s0\d|series|episodes|complete/i.test(postTitle);
    if (isTvTarget && !isTvPost) return false; // Reject movies when user wanted TV series
    if (!isTvTarget && isTvPost) return false; // Reject TV series when user wanted movie

    return true;
  });

  // Step 2: Exact Year Priority Rule
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
      if (onLog) onLog(`VegaMovies: Exact year match (${numTargetYear}) found! Using exact hits.`);
      candidateHits = exactYearHits;
    } else {
      // Fallback: year tolerance (± 1)
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
    if (onLog) onLog('VegaMovies: 0 candidates passed year & media-type filter');
    return [];
  }

  const topHits = candidateHits.slice(0, 3);
  if (onLog) onLog(`VegaMovies: Parallel fetching ${topHits.length} verified candidate pages...`);

  const pagePromises = topHits.map(async (hit: any) => {
    let permalink = hit.document?.permalink || '';
    if (permalink.startsWith('/')) permalink = BASE_DOMAIN + permalink;

    try {
      const res = await fetch(permalink, { signal, headers: { 'User-Agent': UA } });
      const html = await res.text();

      // 3-Tier Verification Engine: IMDb text check
      if (targetImdbId) {
        const cleanImdb = targetImdbId.trim().toLowerCase();
        const foundImdbMatches = [...html.matchAll(/tt\d{7,8}/gi)].map((m) => m[0].toLowerCase());

        if (foundImdbMatches.length > 0) {
          const hasExactImdb = foundImdbMatches.includes(cleanImdb);
          if (!hasExactImdb) {
            if (onLog) onLog(`VegaMovies: Rejecting page (IMDb ID mismatch: ${foundImdbMatches[0]})`);
            return [];
          } else {
            if (onLog) onLog(`VegaMovies: 🌟 100% Golden IMDb Match confirmed (${cleanImdb})`);
          }
        }
      }

      return parseVegaMoviesArticle(html, permalink);
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
  if (onLog) onLog(`VegaMovies: 🎉 ${uniqueOptions.length} quality options extracted across matching pages!`);

  return uniqueOptions;
}

/**
 * Fetches individual episode items for a Web Series from NexDrive intermediate page.
 */
export async function fetchVegaMoviesEpisodes(
  nexdriveUrl: string,
  signal?: AbortSignal
): Promise<SeriesEpisodeItem[]> {
  try {
    const res = await fetch(nexdriveUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Referer': BASE_DOMAIN + '/',
      },
    });
    const html = await res.text();

    const episodes: SeriesEpisodeItem[] = [];

    // Extract all episode links (Episode 01, Episode 02, etc. or VCloud episode anchors)
    const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    links.forEach((l) => {
      const href = l[1];
      const text = l[2].replace(/<[^>]+>/g, '').trim();

      if (!href.startsWith('http')) return;

      const epMatch = text.match(/(?:Episode|Ep|E)\s*(\d+)/i) || href.match(/(?:episode|ep|e)(\d+)/i);
      const epNum = epMatch ? parseInt(epMatch[1], 10) : episodes.length + 1;

      if (text.includes('Episode') || text.includes('Ep') || href.includes('vcloud') || href.includes('gofile') || href.includes('megaup')) {
        episodes.push({
          episodeNumber: epNum,
          episodeTitle: text || `Episode ${epNum}`,
          targetUrl: href,
        });
      }
    });

    episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    return episodes;
  } catch (e: any) {
    return [];
  }
}

/**
 * Resolves Pass 2 VegaMovies deep locker URL (VCloud double-atob + G-Drive failover).
 */
export async function resolveVegaMoviesLocker(
  targetUrl: string,
  qualityLabel: string = '720p'
): Promise<ResolvedStreamResult> {
  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': BASE_DOMAIN + '/' },
    });
    const html = await res.text();

    // 1. Primary Locker: VCloud Token Decrypter
    const vcloudMatch = html.match(/href="([^"]*vcloud[^"]*)"/i);
    if (vcloudMatch) {
      const vcloudUrl = vcloudMatch[1];
      const vres = await fetch(vcloudUrl, { headers: { 'User-Agent': UA } });
      const vhtml = await vres.text();

      const atobMatch = vhtml.match(/atob\(atob\('([^']+)'\)\)/i) || vhtml.match(/atob\('([^']+)'\)/i);
      if (atobMatch) {
        let token = atobMatch[1];
        try {
          let decoded = atob(token);
          if (!decoded.includes('http')) {
            decoded = atob(decoded);
          }
          if (decoded.includes('http')) {
            return {
              success: true,
              streamUrl: decoded,
              providerName: 'VEGAMOVIES [V-CLOUD]',
              qualityLabel,
            };
          }
        } catch (e) {}
      }
    }

    // 2. Failover Locker: G-Drive / Direct Mirror
    const driveMatch = html.match(/href="([^"]*(?:gdrive|gdflix|drive|direct)[^"]*)"/i);
    if (driveMatch) {
      return {
        success: true,
        streamUrl: driveMatch[1],
        providerName: 'VEGAMOVIES [G-DRIVE FAILOVER]',
        qualityLabel,
      };
    }

    return {
      success: true,
      streamUrl: targetUrl,
      providerName: 'VEGAMOVIES DIRECT',
      qualityLabel,
    };
  } catch (err: any) {
    return {
      success: false,
      providerName: 'VEGAMOVIES',
      qualityLabel,
      message: `VegaMovies resolution error: ${err.message}`,
    };
  }
}
