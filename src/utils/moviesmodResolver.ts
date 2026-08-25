import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { getLiveDomain } from './resolver';

export const getMoviesModBaseDomain = (): string => getLiveDomain('moviesmod');
const DEFAULT_MOVIESMOD_DOMAIN = getLiveDomain('moviesmod');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function cleanText(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeQuality(q?: string): '480p' | '720p' | '1080p' | '2K' | '4K' {
  if (!q) return '720p';
  const clean = q.trim().toLowerCase();
  if (clean.includes('4k') || clean.includes('2160')) return '4K';
  if (clean.includes('2k') || clean.includes('1440')) return '2K';
  if (clean.includes('1080')) return '1080p';
  if (clean.includes('720')) return '720p';
  if (clean.includes('480')) return '480p';
  return '720p';
}

export interface SeriesEpisodeItem {
  episodeNumber: number;
  episodeTitle: string;
  targetUrl: string;
}

export function extractImdbId(html: string): string | null {
  if (!html) return null;
  const linkMatch = html.match(/imdb\.com\/title\/(tt\d{7,8})/i);
  if (linkMatch) return linkMatch[1].toLowerCase();
  const textMatch = html.match(/IMDb(?:\s*Rating)?\s*:?[^<]*\b(tt\d{7,8})\b/i) || html.match(/\[imdb[^\]]*\]\s*(tt\d{7,8})/i);
  if (textMatch) return textMatch[1].toLowerCase();
  const rawMatch = html.match(/\b(tt\d{7,8})\b/i);
  if (rawMatch) return rawMatch[1].toLowerCase();
  return null;
}

/**
 * Raw Search Cards Provider for Layer 1 Discovered Posts Feed
 */
export async function searchMoviesModRawCards(
  queryTitle: string,
  baseDomain: string = DEFAULT_MOVIESMOD_DOMAIN,
  signal?: AbortSignal
): Promise<SearchArticleCard[]> {
  const cleanQ = sanitizeSearchQuery(queryTitle);
  const searchUrl = `${baseDomain}/?s=${encodeURIComponent(cleanQ)}`;

  try {
    const res = await fetch(searchUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const cards: SearchArticleCard[] = [];

    const articleMatches = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)];
    articleMatches.forEach((am, i) => {
      const artHtml = am[1];
      const linkMatch = artHtml.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const titleMatch = artHtml.match(/<h[23][^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                         artHtml.match(/title="([^"]+)"/i);
      const imgMatch = artHtml.match(/<img[^>]+src="([^"]+)"/i);

      if (linkMatch) {
        const href = linkMatch[1];
        const titleText = cleanText(
          (titleMatch && titleMatch[2]) ||
          (titleMatch && titleMatch[1]) ||
          linkMatch[2]
        );

        if (href && href.startsWith('http') && !href.includes('/category/') && !href.includes('/tag/') && !href.includes('/page/')) {
          const sMatch = titleText.match(/\b(?:Season|S)\s*0*(\d{1,2})\b/i);
          const seasonTags = sMatch ? [parseInt(sMatch[1], 10)] : undefined;
          const audioMatch = titleText.match(/\{([^}]+)\}/i) || titleText.match(/\(([^)]+Audio[^)]*)\)/i);
          const audioTracks = audioMatch ? audioMatch[1].trim() : undefined;

          cards.push({
            id: `mmod-card-${i}-${Date.now()}`,
            title: titleText,
            permalink: href,
            posterUrl: imgMatch ? imgMatch[1] : undefined,
            siteKey: 'moviesmod',
            siteDisplayName: 'MOVIESMOD',
            confidenceScore: calculateMatchConfidence(queryTitle, titleText),
            seasonTags,
            audioTracks,
          });
        }
      }
    });

    return cards;
  } catch (e) {
    return [];
  }
}

/**
 * 100% Robust MoviesMod Article Parser
 */
export function parseMoviesModArticle(html: string, articleUrl: string = '', siteDisplayName: string = 'MOVIESMOD'): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];
  const imdbId = extractImdbId(html);

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mainTitle = cleanText(h1Match ? h1Match[1] : '');

  // Strict Series vs Movie flag
  const isSeriesArticle = /\b(?:season|s0\d|series|episodes|complete)\b/i.test(mainTitle) ||
                          /\b(?:season|s0\d|series|episodes|complete)\b/i.test(articleUrl);

  // Restrict to thecontent / entry-content to exclude related posts and comments
  const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:thecontent|entry-content)[^"]*"[^>]*>([\s\S]*?)(?:<div class="related-posts"|<center|<div id="comments"|$)/i);
  const contentHtml = bodyMatch ? bodyMatch[1] : html;

  const sectionRegex = /<h([2345])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2345]|<hr|$)/gi;
  const sections = [...contentHtml.matchAll(sectionRegex)];

  sections.forEach((sec) => {
    const headerText = cleanText(sec[2]);
    const bodyHtml = sec[3];

    const links = [...bodyHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    if (links.length === 0) return;

    let headerQuality = (headerText.match(/\b(2160p|4k|1080p|720p|480p|2k)\b/i) || [])[1];
    if (!headerQuality) {
      const splitMatch = headerText.match(/\b(2160|1080|720|480)\s*p\b/i);
      if (splitMatch) headerQuality = splitMatch[1] + 'p';
    }

    let seasonNumber = 1;
    const sMatch = headerText.match(/\b(?:Season|S)\s*0*(\d{1,2})\b/i) || mainTitle.match(/\b(?:Season|S)\s*0*(\d{1,2})\b/i);
    if (sMatch) seasonNumber = parseInt(sMatch[1], 10);

    const codec = (headerText.match(/\b(10Bit|HEVC|x265|x264|AV1)\b/i) || [])[1] || 'x264';
    const ripFormat = (headerText.match(/\b(BluRay|WEB-DL|HDRip|WEBRip|HDTV)\b/i) || [])[1] || 'WEB-DL';
    const fileSize = (headerText.match(/\[([0-9.]+\s*(?:MB|GB))\]/i) || [])[1] || 'Unknown';
    const audioTracks = (headerText.match(/\{([^}]+)\}/i) || headerText.match(/\(([^)]+Audio[^)]*)\)/i) || [])[1] || 'Dual Audio';

    links.forEach((l) => {
      let href = l[1];
      const fullTag = l[0];
      const btnText = cleanText(l[2]);

      if (!href.startsWith('http') || href.includes('imdb.com') || href.includes('telegram') || href.includes('category') || href.includes('size')) return;
      if (!/modpro|vcloud|fastdl|hubcloud|drive\.google|nexdrive|links/i.test(href) && !/download|episode|batch|zip/i.test(btnText)) return;

      const btnQuality = (btnText.match(/\b(2160p|4k|1080p|720p|480p|2k)\b/i) || [])[1];
      const qualityLabel = normalizeQuality(headerQuality || btnQuality || '720p');

      const isZip = /batch-zip|batch|zip/i.test(fullTag) || /batch|zip/i.test(btnText);
      const isEpisodeHub = /episode-links|episode/i.test(fullTag) || /episode/i.test(btnText);
      
      let contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP' = 'MOVIE';
      if (isSeriesArticle) {
        contentType = isZip ? 'SEASON_BATCH_ZIP' : 'SINGLE_EPISODE';
      }

      let priorityScore = 5;
      if (isZip) priorityScore = 90;
      else if (/episode-links/i.test(fullTag) || /episodes\./i.test(href)) priorityScore = 1;
      else if (/download-links/i.test(fullTag)) priorityScore = 2;

      options.push({
        id: `mmod-${Math.random().toString(36).substr(2, 7)}`,
        siteKey: 'moviesmod',
        siteDisplayName,
        imdbId: imdbId || undefined,
        qualityLabel,
        ripFormat,
        codec,
        fileSize,
        audioTracks,
        contentType,
        episodeName: btnText,
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
 * Automated Multi-Page Search & Smart Verification Pipeline
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
  const searchUrl = `${baseDomain}/?s=${encodeURIComponent(searchQuery)}`;
  if (onLog) onLog(`${siteDisplayName}: Searching "${searchQuery}"...`);

  let html: string;
  try {
    const res = await fetch(searchUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Referer': baseDomain + '/',
      },
    });
    if (!res.ok) {
      if (onLog) onLog(`${siteDisplayName}: HTTP error ${res.status}`);
      return [];
    }
    html = await res.text();
  } catch (err: any) {
    if (onLog) onLog(`${siteDisplayName}: Search failed or timed out: ${err.message}`);
    return [];
  }

  const rawCards = await searchMoviesModRawCards(queryTitle, baseDomain, signal);
  if (rawCards.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 search hits found for "${searchQuery}".`);
    return [];
  }

  const cleanTargetImdb = targetImdbId ? targetImdbId.trim().toLowerCase().match(/tt\d{7,8}/)?.[0] : undefined;

  let candidates = rawCards.filter((card) => {
    const score = calculateMatchConfidence(queryTitle, card.title, targetYear);
    return score >= 35;
  });

  if (candidates.length === 0) candidates = rawCards;

  const topHits = candidates.slice(0, 3);
  if (onLog) onLog(`${siteDisplayName}: Fetching ${topHits.length} verified candidate pages...`);

  const results = await Promise.allSettled(
    topHits.map(async (card) => {
      const res = await fetch(card.permalink, { signal, headers: { 'User-Agent': UA } });
      const articleHtml = await res.text();
      return parseMoviesModArticle(articleHtml, card.permalink, siteDisplayName);
    })
  );

  const allOptions: ScrapedQualityOption[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') allOptions.push(...res.value);
  });

  const optionMap = new Map<string, ScrapedQualityOption>();
  allOptions.forEach((o) => optionMap.set(o.targetUrl, o));
  const uniqueOptions = Array.from(optionMap.values()).sort((a, b) => a.priorityScore - b.priorityScore);

  if (onLog) onLog(`${siteDisplayName}: Extracted ${uniqueOptions.length} quality options.`);
  return uniqueOptions;
}

/**
 * 2-Tier Episode Discovery Engine for MoviesMod Web Series (modpro.blog / episodes hub)
 */
export async function fetchMoviesModEpisodes(
  lockerUrl: string,
  signal?: AbortSignal
): Promise<SeriesEpisodeItem[]> {
  try {
    let activeUrl = lockerUrl;
    if (activeUrl.includes('unblocked') || activeUrl.includes('?go=')) {
      activeUrl = await bypassUnblocked(activeUrl, signal);
    }

    const res = await fetch(activeUrl, {
      signal,
      headers: {
        'User-Agent': UA,
        'Referer': DEFAULT_MOVIESMOD_DOMAIN + '/',
      },
    });
    const html = await res.text();

    const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const episodes: SeriesEpisodeItem[] = [];

    links.forEach((l) => {
      const href = l[1];
      const text = cleanText(l[2]);

      const epMatch = text.match(/^(?:Episode|Ep|E)\s*0*(\d{1,3})/i) || href.match(/(?:episode|ep|e)0*(\d{1,3})/i);
      if (epMatch && href.startsWith('http')) {
        const epNum = parseInt(epMatch[1], 10);
        episodes.push({
          episodeNumber: epNum,
          episodeTitle: `Episode ${epNum < 10 ? '0' + epNum : epNum}`,
          targetUrl: href,
        });
      }
    });

    return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (err) {
    return [];
  }
}

export async function resolveMoviesModLocker(
  targetUrl: string,
  qualityLabel: string = '720p',
  signal?: AbortSignal
): Promise<ResolvedStreamResult> {
  try {
    let currentUrl = targetUrl;
    if (currentUrl.includes('unblocked') || currentUrl.includes('?go=') || currentUrl.includes('modpro.blog')) {
      currentUrl = await bypassUnblocked(currentUrl, signal);
    }

    return {
      success: true,
      streamUrl: currentUrl,
      providerName: 'MOVIESMOD',
      qualityLabel,
    };
  } catch (err: any) {
    return {
      success: false,
      providerName: 'MOVIESMOD',
      qualityLabel,
      message: err.message || 'MoviesMod resolution failed',
    };
  }
}

/**
 * Exact port of CloudStream MoviesmodProvider.kt bypass algorithm.
 * Unpacks cloud.unblockedgames.world / modpro landing forms directly into DriveSeed / DriveLeech / FastDL links!
 */
export async function bypassUnblocked(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const host = new URL(url).origin;

    // Step 1: Initial GET
    const res1 = await fetch(url, {
      signal,
      headers: { 'User-Agent': UA, 'Referer': 'https://episodes.modpro.blog/' },
    });
    const html1 = await res1.text();

    const formUrl1 = (html1.match(/<form[^>]+id="landing"[^>]+action="([^"]+)"/i) || [])[1] || `${host}/`;
    const inputs1 = [...html1.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]+)"/gi)];
    const data1 = new URLSearchParams();
    inputs1.forEach((i) => data1.append(i[1], i[2]));

    // Step 2: First POST
    const res2 = await fetch(formUrl1, {
      method: 'POST',
      body: data1.toString(),
      signal,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': url },
    });
    const html2 = await res2.text();

    const formUrl2 = (html2.match(/<form[^>]+id="landing"[^>]+action="([^"]+)"/i) || [])[1] || `${host}/`;
    const inputs2 = [...html2.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]+)"/gi)];
    const data2 = new URLSearchParams();
    inputs2.forEach((i) => data2.append(i[1], i[2]));

    // Step 3: Second POST
    const res3 = await fetch(formUrl2, {
      method: 'POST',
      body: data2.toString(),
      signal,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': formUrl1 },
    });
    const html3 = await res3.text();

    // Step 4: Extract ?go= token
    const tokenMatch = html3.match(/\?go=([a-zA-Z0-9_-]+)/i);
    if (!tokenMatch) {
      const directLocker = html3.match(/href="(https?:\/\/[^"]*(?:driveseed|driveleech|hubcloud|fastdl)[^"]*)"/i);
      if (directLocker) return directLocker[1];
      return url;
    }

    const skToken = tokenMatch[1];
    const wpHttp2 = data2.get('_wp_http2') || data1.get('_wp_http2') || '';

    // Step 5: GET $host?go=$skToken with Cookie
    const res4 = await fetch(`${host}/?go=${skToken}`, {
      signal,
      headers: {
        'User-Agent': UA,
        'Referer': formUrl2,
        'Cookie': `${skToken}=${wpHttp2}`,
      },
    });
    const html4 = await res4.text();

    const refreshMatch = html4.match(/<meta[^>]+http-equiv="refresh"[^>]+content="[^"]*url=([^"]+)"/i);
    const driveUrl = refreshMatch ? refreshMatch[1] : null;

    if (!driveUrl) {
      const hrefMatch = html4.match(/href="(https?:\/\/[^"]*(?:driveseed|driveleech|hubcloud|fastdl)[^"]*)"/i);
      if (hrefMatch) return hrefMatch[1];
      return url;
    }

    // Step 6: Follow drive landing page
    const res5 = await fetch(driveUrl, { signal, headers: { 'User-Agent': UA } });
    const text5 = await res5.text();

    const replaceMatch = text5.match(/replace\(["']([^"']+)["']\)/i);
    if (replaceMatch && replaceMatch[1] !== '/404') {
      const finalPath = replaceMatch[1];
      if (finalPath.startsWith('http')) return finalPath;
      const driveOrigin = new URL(driveUrl).origin;
      return `${driveOrigin}${finalPath.startsWith('/') ? '' : '/'}${finalPath}`;
    }

    return driveUrl;
  } catch (e) {
    return url;
  }
}
