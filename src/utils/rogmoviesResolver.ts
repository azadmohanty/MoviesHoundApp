import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence } from './FuzzyMatcher';
import { extractRipFormat, extractAudioTracks, extractVideoCodec } from './MediaTagExtractor';

const DEFAULT_ROG_DOMAIN = 'https://rogmovies.rest';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
        id: `rog-${options.length}`,
        siteKey: 'rogmovies',
        siteDisplayName: siteDisplayName,
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
  const searchQuery = `${queryTitle} ${targetYear || ''}`.trim();
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
 * Fetches episode list for RogMovies series.
 */
export async function fetchRogMoviesEpisodes(
  nexdriveUrl: string,
  baseDomain: string = DEFAULT_ROG_DOMAIN,
  signal?: AbortSignal
): Promise<SeriesEpisodeItem[]> {
  try {
    const res = await fetch(nexdriveUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Referer': (baseDomain || DEFAULT_ROG_DOMAIN) + '/',
      },
    });
    const html = await res.text();

    const episodes: SeriesEpisodeItem[] = [];
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
 * Resolves Pass 2 RogMovies locker URL.
 */
export async function resolveRogMoviesLocker(
  targetUrl: string,
  qualityLabel: string = '720p',
  baseDomain: string = DEFAULT_ROG_DOMAIN
): Promise<ResolvedStreamResult> {
  try {
    const domain = baseDomain || DEFAULT_ROG_DOMAIN;
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': domain + '/' },
    });
    const html = await res.text();

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
              providerName: 'ROGMOVIES [V-CLOUD]',
              qualityLabel,
            };
          }
        } catch (e) {}
      }
    }

    const driveMatch = html.match(/href="([^"]*(?:gdrive|gdflix|drive|direct)[^"]*)"/i);
    if (driveMatch) {
      return {
        success: true,
        streamUrl: driveMatch[1],
        providerName: 'ROGMOVIES [G-DRIVE FAILOVER]',
        qualityLabel,
      };
    }

    return {
      success: true,
      streamUrl: targetUrl,
      providerName: 'ROGMOVIES DIRECT',
      qualityLabel,
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
