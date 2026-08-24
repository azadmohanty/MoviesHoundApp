import { ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { extractRipFormat, extractAudioTracks, extractVideoCodec } from './MediaTagExtractor';

const DEFAULT_MOVIESMOD_DOMAIN = 'https://moviesmod.zone';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface SeriesEpisodeItem {
  episodeNumber: number;
  episodeTitle: string;
  targetUrl: string;
}

/**
 * Base64 helper for decoding url= parameters on MoviesMod buttons
 */
function base64Decode(str: string): string {
  try {
    if (typeof atob === 'function') {
      return atob(str);
    }
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch (e) {
    return str;
  }
}

/**
 * Helper to parse form landing data for 2-step unblocked bypass
 */
function getFormActionAndData(html: string): { action: string | null; inputs: Record<string, string> } {
  const actionMatch = html.match(/<form[^>]*id="landing"[^>]*action="([^"]+)"/i) || html.match(/<form[^>]*action="([^"]+)"/i);
  const action = actionMatch ? actionMatch[1] : null;

  const inputs: Record<string, string> = {};
  const inputRegex = /<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    inputs[match[1]] = match[2];
  }
  return { action, inputs };
}

/**
 * Pass 2 Unblocked Bypass Engine (2-step POST + skToken cookie handshake)
 */
export async function bypassUnblocked(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const host = new URL(url).origin;
    const step1Res = await fetch(url, { signal, headers: { 'User-Agent': UA } });
    const step1Text = await step1Res.text();
    const form1 = getFormActionAndData(step1Text);
    if (!form1.action) return url;

    const body1 = new URLSearchParams(form1.inputs).toString();
    const step2Res = await fetch(form1.action, {
      method: 'POST',
      signal,
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': url,
      },
      body: body1,
    });
    const step2Text = await step2Res.text();
    const form2 = getFormActionAndData(step2Text);
    if (!form2.action) return url;

    const body2 = new URLSearchParams(form2.inputs).toString();
    const step3Res = await fetch(form2.action, {
      method: 'POST',
      signal,
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': form1.action,
      },
      body: body2,
    });
    const step3Text = await step3Res.text();

    const skMatch = step3Text.match(/\?go=([^\s"'`]+)/i);
    if (!skMatch) return url;

    const skToken = skMatch[1];
    const wpHttp2 = form2.inputs['_wp_http2'] || '';

    const goUrl = `${host}?go=${skToken}`;
    const step4Res = await fetch(goUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Cookie': `${skToken}=${wpHttp2}`,
        'Referer': form2.action,
      },
    });
    const step4Text = await step4Res.text();

    const metaRefresh = step4Text.match(/meta[^>]+http-equiv="refresh"[^>]+content="[^"]*url=([^"]+)"/i) ||
                        step4Text.match(/window\.location\.replace\(["']([^"']+)["']\)/i);
    
    return metaRefresh ? metaRefresh[1] : url;
  } catch (err) {
    return url;
  }
}

/**
 * 100% Empirical DOM Parser for MoviesMod main article page.
 */
export function parseMoviesModArticle(
  html: string,
  articleUrl: string,
  siteDisplayName: string = 'MOVIESMOD'
): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];

  const h1Match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mainTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';

  const headerRegex = /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>([\s\S]*?)(?=<h[1-5]|$)/gi;
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

    const baseSizeMatch = headerText.match(/\[([\d.]+\s*(?:GB|MB)(?:\/E)?)]/i);
    const baseFileSize = baseSizeMatch ? baseSizeMatch[1] : 'N/A';

    const baseSeasonMatch = headerText.match(/\b(?:Season|S)\s*0*(\d+)\b/i) ||
                            mainTitle.match(/\b(?:Season|S)\s*0*(\d+)\b/i);
    const isSeriesArticle = /\b(?:season|s0\d|series|episodes|complete)\b/i.test(headerText) || /\b(?:season|s0\d|series|episodes|complete)\b/i.test(mainTitle);

    const buttonRegex = /<a[^>]+class="[^"]*(?:maxbutton-download-links|maxbutton-episode-links|maxbutton-g-drive|maxbutton-af-download|maxbutton-1|maxbutton-5)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [...sectionHtml.matchAll(buttonRegex)];

    links.forEach((l) => {
      let rawHref = l[1];
      const linkText = l[2].replace(/<[^>]+>/g, '').trim();

      let targetUrl = rawHref;
      if (rawHref.includes('url=')) {
        const b64 = rawHref.split('url=')[1].split('&')[0];
        targetUrl = base64Decode(b64);
      }

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
      const optionFileSize = linkSizeMatch ? linkSizeMatch[1] : baseFileSize;

      options.push({
        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        siteKey: 'moviesmod',
        siteDisplayName,
        qualityLabel,
        ripFormat,
        codec,
        fileSize: optionFileSize,
        audioTracks,
        contentType,
        episodeName: isEpisode ? linkText : undefined,
        seasonNumber,
        targetUrl,
        priorityScore: 1,
      });
    });
  });

  return options;
}

/**
 * Automated Multi-Page Search & Smart Verification Pipeline for MoviesMod.
 */
export async function getMoviesModQualityOptions(
  queryTitle: string,
  targetYear?: string | number,
  targetImdbId?: string,
  mediaType: string = 'movie',
  baseDomain: string = DEFAULT_MOVIESMOD_DOMAIN,
  siteDisplayName: string = 'MOVIESMOD',
  signal?: AbortSignal,
  onLog?: (msg: string) => void
): Promise<ScrapedQualityOption[]> {
  const searchQuery = sanitizeSearchQuery(queryTitle);
  const searchUrl = `${baseDomain}/search/${encodeURIComponent(searchQuery)}/page/1`;

  if (onLog) onLog(`${siteDisplayName}: Searching "${searchQuery}" on ${baseDomain}...`);

  let articles: { title: string; url: string; poster?: string }[] = [];
  try {
    const res = await fetch(searchUrl, { signal, headers: { 'User-Agent': UA } });
    const html = await res.text();

    const articleRegex = /<article[\s\S]*?>([\s\S]*?)<\/article>/gi;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      const content = match[1];
      const titleMatch = /title="([^"]+)"/i.exec(content);
      const hrefMatch = /href="([^"]+)"/i.exec(content);
      const imgMatch = /(?:data-src|src)="([^"]+)"/i.exec(content);

      if (titleMatch && hrefMatch) {
        articles.push({
          title: titleMatch[1].replace(/^Download\s+/i, '').trim(),
          url: hrefMatch[1],
          poster: imgMatch ? imgMatch[1] : undefined,
        });
      }
    }
  } catch (e: any) {
    if (onLog) onLog(`${siteDisplayName} search error: ${e.message}`);
    return [];
  }

  if (articles.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 search hits returned`);
    return [];
  }

  if (onLog) onLog(`${siteDisplayName}: ${articles.length} raw search hits found. Pre-filtering...`);

  const numTargetYear = targetYear ? parseInt(String(targetYear), 10) : undefined;
  const isTvTarget = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';

  // Pre-filter candidate hits by title match & media type
  let candidateHits = articles.filter((art) => {
    const score = calculateMatchConfidence(queryTitle, art.title, targetYear);
    if (score < 50) return false;

    const isTvPost = /season|s0\d|s\d|series|episodes|complete/i.test(art.title);
    if (isTvTarget && !isTvPost) return false;
    if (!isTvTarget && isTvPost) return false;

    return true;
  });

  // Exact Year Priority Rule
  if (numTargetYear && candidateHits.length > 0) {
    const exactYearHits = candidateHits.filter((art) => {
      const postYearMatch = art.title.match(/\b(19\d\d|20\d\d)\b/);
      return postYearMatch ? parseInt(postYearMatch[1], 10) === numTargetYear : false;
    });

    if (exactYearHits.length > 0) {
      if (onLog) onLog(`${siteDisplayName}: Exact year match (${numTargetYear}) found! Using exact hits.`);
      candidateHits = exactYearHits;
    } else {
      candidateHits = candidateHits.filter((art) => {
        const postYearMatch = art.title.match(/\b(19\d\d|20\d\d)\b/);
        if (postYearMatch) {
          return Math.abs(parseInt(postYearMatch[1], 10) - numTargetYear) <= 1;
        }
        return true;
      });
    }
  }

  if (candidateHits.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 candidates passed year & media-type filter`);
    return [];
  }

  const topHits = candidateHits.slice(0, 3);
  if (onLog) onLog(`${siteDisplayName}: Parallel fetching ${topHits.length} verified candidate pages...`);

  const pagePromises = topHits.map(async (art) => {
    try {
      const res = await fetch(art.url, { signal, headers: { 'User-Agent': UA } });
      const html = await res.text();

      // 3-Tier Golden IMDb Verification
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

      return parseMoviesModArticle(html, art.url, siteDisplayName);
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
  if (onLog) onLog(`${siteDisplayName}: 🎉 ${uniqueOptions.length} quality options extracted across matching pages!`);

  return uniqueOptions;
}

/**
 * Fetches individual episode items for a Web Series from MoviesMod episode locker page.
 */
export async function fetchMoviesModEpisodes(
  lockerUrl: string,
  signal?: AbortSignal
): Promise<SeriesEpisodeItem[]> {
  try {
    const res = await fetch(lockerUrl, {
      signal,
      headers: {
        'User-Agent': UA,
      },
    });
    const html = await res.text();

    const episodes: SeriesEpisodeItem[] = [];
    const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    links.forEach((l) => {
      const href = l[1];
      const text = l[2].replace(/<[^>]+>/g, '').trim();

      if (
        href.includes('unblocked') ||
        href.includes('gdrive') ||
        href.includes('driveseed') ||
        href.includes('driveleech') ||
        href.includes('fastdl')
      ) {
        const epMatch = text.match(/(?:Episode|Ep|E)\s*(\d+)/i) || href.match(/(?:episode|ep|e)(\d+)/i);
        const epNum = epMatch ? parseInt(epMatch[1], 10) : episodes.length + 1;

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
 * Resolves Pass 2 MoviesMod deep locker URL to direct stream download link.
 */
export async function resolveMoviesModLocker(
  targetUrl: string,
  qualityLabel: string = '720p',
  signal?: AbortSignal
): Promise<ResolvedStreamResult> {
  try {
    let currentUrl = targetUrl;

    // 1. If targetUrl is an unblocked cloud link directly, run bypass
    if (currentUrl.includes('unblocked')) {
      const bypassed = await bypassUnblocked(currentUrl, signal);
      if (bypassed && bypassed.startsWith('http')) {
        return {
          success: true,
          streamUrl: bypassed,
          providerName: 'MOVIESMOD [DRIVESEED]',
          qualityLabel,
        };
      }
    }

    // 2. Fetch locker page if targetUrl is intermediate modpro/locker page
    const res = await fetch(currentUrl, {
      signal,
      headers: { 'User-Agent': UA },
    });
    const html = await res.text();

    const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const candidateLink = links.find((l) => {
      const href = l[1];
      return href.includes('unblocked') || href.includes('driveseed') || href.includes('driveleech') || href.includes('gdrive') || href.includes('fastdl');
    });

    if (candidateLink) {
      let candidateUrl = candidateLink[1];
      if (candidateUrl.includes('unblocked')) {
        candidateUrl = await bypassUnblocked(candidateUrl, signal);
      }

      return {
        success: true,
        streamUrl: candidateUrl,
        providerName: 'MOVIESMOD [STREAM]',
        qualityLabel,
      };
    }

    return {
      success: true,
      streamUrl: targetUrl,
      providerName: 'MOVIESMOD DIRECT',
      qualityLabel,
    };
  } catch (err: any) {
    return {
      success: false,
      providerName: 'MOVIESMOD',
      qualityLabel,
      message: `MoviesMod resolution error: ${err.message}`,
    };
  }
}
