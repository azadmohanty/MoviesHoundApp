import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { getLiveDomain } from './resolver';
import { bypassUnblocked } from './moviesmodResolver';

export const getTopMoviesBaseDomain = (): string => getLiveDomain('topmovies');
const DEFAULT_TOPMOVIES_DOMAIN = getLiveDomain('topmovies');

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
 * Raw Search Cards Provider for TopMovies (Bollywood)
 */
export async function searchTopMoviesRawCards(
  queryTitle: string,
  baseDomain: string = DEFAULT_TOPMOVIES_DOMAIN,
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
            id: `top-card-${i}-${Date.now()}`,
            title: titleText,
            permalink: href,
            posterUrl: imgMatch ? imgMatch[1] : undefined,
            siteKey: 'topmovies',
            siteDisplayName: 'TOPMOVIES',
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
 * 100% Robust TopMovies Article Parser
 */
export function parseTopMoviesArticle(html: string, articleUrl: string = '', siteDisplayName: string = 'TOPMOVIES'): ScrapedQualityOption[] {
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
      if (!/modpro|leechpro|vcloud|fastdl|hubcloud|drive\.google|nexdrive|links/i.test(href) && !/download|episode|batch|zip/i.test(btnText)) return;

      const btnQuality = (btnText.match(/\b(2160p|4k|1080p|720p|480p|2k)\b/i) || [])[1];
      const qualityLabel = normalizeQuality(headerQuality || btnQuality || '720p');

      const isZip = /batch-zip|batch|zip/i.test(fullTag) || /batch|zip/i.test(btnText);
      
      let contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP' = 'MOVIE';
      if (isSeriesArticle) {
        contentType = isZip ? 'SEASON_BATCH_ZIP' : 'SINGLE_EPISODE';
      }

      let priorityScore = 5;
      if (isZip) priorityScore = 90;
      else if (/episode-links/i.test(fullTag) || /episodes\./i.test(href)) priorityScore = 1;
      else if (/download-links/i.test(fullTag)) priorityScore = 2;

      options.push({
        id: `top-${Math.random().toString(36).substr(2, 7)}`,
        siteKey: 'topmovies',
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
 * Automated Multi-Page Search & Smart Verification Pipeline for TopMovies
 */
export async function getTopMoviesQualityOptions(
  queryTitle: string,
  targetYear?: string | number,
  targetImdbId?: string,
  mediaType: string = 'movie',
  baseDomain: string = DEFAULT_TOPMOVIES_DOMAIN,
  siteDisplayName: string = 'TOPMOVIES',
  signal?: AbortSignal,
  onLog?: (msg: string) => void
): Promise<ScrapedQualityOption[]> {
  const searchQuery = sanitizeSearchQuery(queryTitle);
  if (onLog) onLog(`${siteDisplayName}: Searching "${searchQuery}"...`);

  const rawCards = await searchTopMoviesRawCards(queryTitle, baseDomain, signal);
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
      return parseTopMoviesArticle(articleHtml, card.permalink, siteDisplayName);
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
 * 2-Tier Episode Discovery Engine for TopMovies Web Series (modpro.blog / episodes hub)
 */
export async function fetchTopMoviesEpisodes(
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
        'Referer': DEFAULT_TOPMOVIES_DOMAIN + '/',
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

export async function resolveTopMoviesLocker(
  targetUrl: string,
  qualityLabel: string = '720p',
  signal?: AbortSignal
): Promise<ResolvedStreamResult> {
  try {
    let currentUrl = targetUrl;

    if (currentUrl.includes('modpro.blog') || currentUrl.includes('leechpro.blog')) {
      try {
        const res = await fetch(currentUrl, {
          signal,
          headers: { 'User-Agent': UA, 'Referer': DEFAULT_TOPMOVIES_DOMAIN + '/' },
        });
        if (res.ok) {
          const html = await res.text();
          const batchMatch = html.match(/<a[^>]+href="([^"]*cloud\.unblockedgames[^"]*)"[^>]*>[\s\S]*?Batch/i) ||
                             html.match(/<a[^>]+href="([^"]*cloud\.unblockedgames[^"]*)"[^>]*>/i) ||
                             html.match(/<a[^>]+href="([^"]*(?:fastdl|driveseed|driveleech|hubcloud)[^"]*)"[^>]*>/i);
          if (batchMatch) {
            currentUrl = batchMatch[1];
          }
        }
      } catch (_) {}
    }

    if (currentUrl.includes('unblocked') || currentUrl.includes('?go=')) {
      currentUrl = await bypassUnblocked(currentUrl, signal);
    }

    return {
      success: true,
      streamUrl: currentUrl,
      providerName: 'TOPMOVIES',
      qualityLabel,
    };
  } catch (err: any) {
    return {
      success: false,
      providerName: 'TOPMOVIES',
      qualityLabel,
      message: err.message || 'TopMovies resolution failed',
    };
  }
}
