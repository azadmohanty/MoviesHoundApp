import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { aiClassifyPost, aiClassifyLink, aiExtractEpisodesFromPortal } from '../services/aiParserService';

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
 * Raw Search Cards Provider for the Raw Discovered Posts Explorer
 */
export async function searchMoviesModRawCards(
  queryTitle: string,
  baseDomain: string = DEFAULT_MOVIESMOD_DOMAIN,
  signal?: AbortSignal
): Promise<SearchArticleCard[]> {
  const searchQuery = sanitizeSearchQuery(queryTitle);
  const searchUrl = `${baseDomain}/search/${encodeURIComponent(searchQuery)}/page/1`;

  try {
    const res = await fetch(searchUrl, { signal, headers: { 'User-Agent': UA } });
    const html = await res.text();

    const articleRegex = /<article[\s\S]*?>([\s\S]*?)<\/article>/gi;
    const cards: SearchArticleCard[] = [];
    let match;
    let idx = 0;

    while ((match = articleRegex.exec(html)) !== null) {
      const content = match[1];
      const titleMatch = /title="([^"]+)"/i.exec(content);
      const hrefMatch = /href="([^"]+)"/i.exec(content);
      const imgMatch = /(?:data-src|src)="([^"]+)"/i.exec(content);

      if (titleMatch && hrefMatch) {
        const postTitle = titleMatch[1].replace(/^Download\s+/i, '').trim();
        const postMeta = aiClassifyPost(postTitle);

        cards.push({
          id: `mod-card-${idx++}-${Date.now()}`,
          title: postTitle,
          permalink: hrefMatch[1],
          posterUrl: imgMatch ? imgMatch[1] : undefined,
          siteKey: 'moviesmod',
          siteDisplayName: 'MOVIESMOD',
          confidenceScore: parseFloat(postMeta.confidence) * 100,
          seasonTags: postMeta.seasons,
          audioTracks: postMeta.audioTracks.join(', '),
        });
      }
    }

    return cards;
  } catch (e) {
    return [];
  }
}

/**
 * Model-Driven DOM Parser for MoviesMod main article page.
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

      // Pure Model Classification
      const meta = aiClassifyLink(`${mainTitle} ${headerText}`, linkText, targetUrl);

      options.push({
        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        siteKey: 'moviesmod',
        siteDisplayName,
        qualityLabel: meta.qualityLabel,
        ripFormat: meta.ripFormat,
        codec: meta.codec,
        fileSize: meta.fileSize,
        audioTracks: meta.audioTracks,
        contentType: meta.contentType,
        episodeName: meta.episodeNumber ? `Episode ${meta.episodeNumber}` : undefined,
        seasonNumber: meta.seasonNumber,
        targetUrl,
        priorityScore: 2,
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

  if (onLog) onLog(`${siteDisplayName}: ${articles.length} raw search hits found. Model classifying...`);

  const isTvTarget = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';

  // Pre-filter candidate hits by AI title classification & media type
  let candidateHits = articles.filter((art) => {
    const postMeta = aiClassifyPost(art.title);
    const score = calculateMatchConfidence(queryTitle, postMeta.cleanTitle || art.title, targetYear);
    if (score < 40) return false;

    if (isTvTarget && postMeta.mediaType !== 'TV_SERIES') return false;
    if (!isTvTarget && postMeta.mediaType === 'TV_SERIES') return false;

    return true;
  });

  if (candidateHits.length === 0) candidateHits = articles;

  const topHits = candidateHits.slice(0, 3);
  if (onLog) onLog(`${siteDisplayName}: Parallel fetching ${topHits.length} verified candidate pages...`);

  const pagePromises = topHits.map(async (art) => {
    try {
      const res = await fetch(art.url, { signal, headers: { 'User-Agent': UA } });
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

    const extracted = aiExtractEpisodesFromPortal(html);
    if (extracted.length > 0) {
      return extracted;
    }

    const buttonRegex = /<a[^>]+class="[^"]*(?:maxbutton-download-links|maxbutton-episode-links|maxbutton-1|maxbutton-5)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const episodes: SeriesEpisodeItem[] = [];
    let match;

    while ((match = buttonRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();

      const epMatch = text.match(/(?:Episode|Ep|E)\s*(\d+)/i);
      const epNum = epMatch ? parseInt(epMatch[1], 10) : episodes.length + 1;

      episodes.push({
        episodeNumber: epNum,
        episodeTitle: `Episode ${epNum}`,
        targetUrl: href,
      });
    }

    return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (err) {
    return [];
  }
}

/**
 * Resolves Pass 2 MoviesMod final download / streaming locker.
 */
export async function resolveMoviesModLocker(
  targetUrl: string,
  qualityLabel: string = '720p',
  signal?: AbortSignal
): Promise<ResolvedStreamResult> {
  try {
    let currentUrl = targetUrl;
    if (currentUrl.includes('unblocked') || currentUrl.includes('?go=')) {
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
      message: `MoviesMod resolution error: ${err.message}`,
    };
  }
}
