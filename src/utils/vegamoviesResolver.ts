import { Buffer } from 'buffer';
import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { aiClassifyPost, aiClassifyLink, aiExtractEpisodesFromPortal } from '../services/aiParserService';
import { getLiveDomain } from './resolver';

/**
 * Dynamic domain lookup for VegaMovies with multi-mirror failover
 */
export const getVegaBaseDomain = (): string => getLiveDomain('vegamovies');
const BASE_DOMAIN = getLiveDomain('vegamovies');
const VEGA_MIRRORS = [
  'https://new2.vegamovies.futbol',
  'https://vegamovies.im',
  'https://vegamovies.navy',
  'https://vegamovies.yt',
  'https://1vegamovies.cc',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function b64decode(str: string): string {
  try {
    // @ts-ignore
    const decoded1 = Buffer.from(str, 'base64').toString('utf-8');
    try {
      // @ts-ignore
      const decoded2 = Buffer.from(decoded1, 'base64').toString('utf-8');
      if (decoded2.startsWith('http')) return decoded2;
    } catch (_) {}
    return decoded1;
  } catch (e) {
    try { return (globalThis as any).atob?.(str) ?? str; } catch (_) { return str; }
  }
}

export interface SeriesEpisodeItem {
  episodeNumber: number;
  episodeTitle: string;
  targetUrl: string;
}

/**
 * Helper to fetch search hits across JSON and HTML endpoints with mirror failover
 */
async function fetchVegaSearchHits(
  searchQuery: string,
  preferredDomain: string,
  signal?: AbortSignal
): Promise<{ hits: any[]; domain: string }> {
  const domainsToTry = [
    preferredDomain,
    ...VEGA_MIRRORS.filter((d) => d !== preferredDomain),
  ];

  for (const domain of domainsToTry) {
    try {
      const searchUrl = `${domain}/search.php?q=${encodeURIComponent(searchQuery)}&page=1`;
      const res = await fetch(searchUrl, { signal, headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' } });
      if (!res.ok) continue;

      const text = await res.text();
      let hits: any[] = [];

      // 1. Try JSON parsing
      try {
        const json = JSON.parse(text);
        if (json.hits && json.hits.length > 0) {
          return { hits: json.hits, domain };
        }
      } catch (_) {}

      // 2. Try HTML Article scraping if not JSON
      const matches = [...text.matchAll(/<article[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (matches.length > 0) {
        hits = matches.map((m) => ({
          document: {
            permalink: m[1],
            post_title: m[2].replace(/<[^>]+>/g, '').trim(),
          },
        }));
        return { hits, domain };
      }

      // 3. Fallback: Parse h2/h3/h5 headers with permalinks
      const titleMatches = [...text.matchAll(/<h[2345][^>]*class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (titleMatches.length > 0) {
        hits = titleMatches.map((m) => ({
          document: {
            permalink: m[1],
            post_title: m[2].replace(/<[^>]+>/g, '').trim(),
          },
        }));
        return { hits, domain };
      }
    } catch (_) {}
  }

  return { hits: [], domain: preferredDomain };
}

/**
 * Raw Search Cards Provider for the Raw Discovered Posts Explorer
 */
export async function searchVegaMoviesRawCards(
  queryTitle: string,
  baseDomain: string = BASE_DOMAIN,
  signal?: AbortSignal
): Promise<SearchArticleCard[]> {
  const cleanQ = sanitizeSearchQuery(queryTitle);
  const { hits, domain } = await fetchVegaSearchHits(cleanQ, baseDomain, signal);

  return hits.map((hit: any, i: number) => {
    const doc = hit.document || {};
    const postTitle = doc.post_title || '';
    const permalink = (doc.permalink || '').startsWith('http') ? doc.permalink : `${domain}${doc.permalink}`;
    const postMeta = aiClassifyPost(postTitle);

    return {
      id: `vega-card-${i}-${Date.now()}`,
      title: postTitle,
      permalink,
      posterUrl: doc.post_thumbnail,
      siteKey: 'vegamovies',
      siteDisplayName: 'VEGAMOVIES',
      confidenceScore: parseFloat(postMeta.confidence) * 100,
      seasonTags: postMeta.seasons,
      audioTracks: postMeta.audioTracks.join(', '),
    };
  });
}

/**
 * Pure Model Parser for VegaMovies article page.
 */
export function parseVegaMoviesArticle(html: string, articleUrl: string): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];

  const h1Match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mainTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';

  const headerRegex = /<h[35][^>]*>([\s\S]*?)<\/h[35]>([\s\S]*?)(?=<h[1-5]|$)/gi;
  const matches = [...html.matchAll(headerRegex)];

  matches.forEach((match) => {
    const headerText = match[1].replace(/<[^>]+>/g, '').trim();
    const sectionHtml = match[2];

    const links = [...sectionHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    links.forEach((l) => {
      let href = l[1];
      const linkText = l[2].replace(/<[^>]+>/g, '').trim();

      if (!href.includes('nexdrive') && !href.includes('vcloud') && !href.includes('fastdl') && !href.includes('gdflix') && !href.includes('dwd-button') && !href.includes('url=')) {
        return;
      }

      if (href.includes('url=')) {
        try {
          const b64 = href.split('url=')[1].split('&')[0];
          href = b64decode(b64);
        } catch (e) {}
      }

      // Pure Model Classification
      const meta = aiClassifyLink(`${mainTitle} ${headerText}`, linkText, href);

      let priorityScore = 5;
      if (meta.isBatch) {
        priorityScore = 90;
      } else if (meta.locker === 'VCloud' || /vcloud|v-cloud/i.test(href)) {
        priorityScore = 1;
      } else if (meta.locker === 'FastDL' || /fastdl|g-direct/i.test(href)) {
        priorityScore = 3;
      }

      options.push({
        id: `vega-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        siteKey: 'vegamovies',
        siteDisplayName: 'VEGAMOVIES',
        qualityLabel: meta.qualityLabel,
        ripFormat: meta.ripFormat,
        codec: meta.codec,
        fileSize: meta.fileSize,
        audioTracks: meta.audioTracks,
        contentType: meta.contentType,
        episodeName: linkText,
        seasonNumber: meta.seasonNumber,
        targetUrl: href,
        priorityScore,
      });
    });
  });

  options.sort((a, b) => (a.priorityScore || 5) - (b.priorityScore || 5));
  return options;
}

/**
 * Automated Multi-Page Search & Smart Verification Pipeline for VegaMovies.
 */
export async function getVegaMoviesQualityOptions(
  queryTitle: string,
  targetYear?: string | number,
  targetImdbId?: string,
  mediaType: string = 'movie',
  baseDomain: string = BASE_DOMAIN,
  siteDisplayName: string = 'VEGAMOVIES',
  signal?: AbortSignal,
  onLog?: (msg: string) => void,
  seasonNum?: number
): Promise<ScrapedQualityOption[]> {
  const searchQuery = sanitizeSearchQuery(queryTitle);
  const isTvTarget = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';

  if (onLog) onLog(`${siteDisplayName}: Searching "${searchQuery}" on ${baseDomain}...`);

  const { hits, domain: activeDomain } = await fetchVegaSearchHits(searchQuery, baseDomain, signal);

  if (!hits || hits.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 hits found for "${searchQuery}".`);
    return [];
  }

  if (onLog) onLog(`${siteDisplayName}: ${hits.length} raw search hits retrieved from ${activeDomain}. Model classifying...`);

  const cleanTargetImdb = targetImdbId ? targetImdbId.trim().toLowerCase().match(/tt\d{7,8}/)?.[0] : undefined;

  // Pre-filter & Rank Candidate Hits with Model Classification
  let candidateHits = hits.filter((hit: any) => {
    const postTitle = hit.document?.post_title || '';
    const docImdb = hit.document?.imdb_id?.toString().toLowerCase().match(/tt\d{7,8}/)?.[0];

    if (cleanTargetImdb && docImdb && cleanTargetImdb === docImdb) {
      if (onLog) onLog(`${siteDisplayName}: 🌟 100% Golden Search JSON IMDb Match (${cleanTargetImdb})`);
      return true;
    }

    const postMeta = aiClassifyPost(postTitle);
    const score = calculateMatchConfidence(queryTitle, postMeta.cleanTitle || postTitle, targetYear);
    if (score < 40) return false;

    if (isTvTarget && postMeta.mediaType !== 'TV_SERIES') return false;
    if (!isTvTarget && postMeta.mediaType === 'TV_SERIES') return false;

    return true;
  });

  // Season Matching Ranker
  if (isTvTarget && seasonNum && seasonNum > 0 && candidateHits.length > 0) {
    candidateHits.sort((a: any, b: any) => {
      const metaA = aiClassifyPost(a.document?.post_title || '');
      const metaB = aiClassifyPost(b.document?.post_title || '');

      const scoreA = metaA.seasons.includes(seasonNum) ? 2 : metaA.isMultiSeason ? 1 : 0;
      const scoreB = metaB.seasons.includes(seasonNum) ? 2 : metaB.isMultiSeason ? 1 : 0;

      return scoreB - scoreA;
    });
  }

  if (candidateHits.length === 0) candidateHits = hits;

  const topHits = candidateHits.slice(0, 3);
  if (onLog) onLog(`${siteDisplayName}: Fetching ${topHits.length} verified candidate articles...`);

  const results = await Promise.allSettled(
    topHits.map(async (hit: any) => {
      let permalink = hit.document?.permalink || '';
      if (!permalink.startsWith('http')) permalink = `${activeDomain}${permalink}`;

      const res = await fetch(permalink, { signal, headers: { 'User-Agent': UA } });
      const html = await res.text();
      return parseVegaMoviesArticle(html, permalink);
    })
  );

  const allOptions: ScrapedQualityOption[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      allOptions.push(...res.value);
    }
  });

  const dedupMap = new Map<string, ScrapedQualityOption>();
  allOptions.forEach((o) => dedupMap.set(o.targetUrl, o));
  const finalOptions = Array.from(dedupMap.values()).sort((a, b) => a.priorityScore - b.priorityScore);

  if (onLog) onLog(`${siteDisplayName}: Extracted ${finalOptions.length} quality options.`);
  return finalOptions;
}

/**
 * 2-Tier Episode Discovery Engine for Web Series.
 */
export async function fetchVegaMoviesEpisodes(portalUrl: string): Promise<SeriesEpisodeItem[]> {
  try {
    const res = await fetch(portalUrl, {
      headers: { 'User-Agent': UA, 'Referer': BASE_DOMAIN + '/' },
    });
    const html = await res.text();

    const extracted = aiExtractEpisodesFromPortal(html);
    if (extracted.length > 0) {
      return extracted;
    }

    const links = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const fallbackEpisodes: SeriesEpisodeItem[] = [];

    links.forEach((l) => {
      const href = l[1];
      const text = l[2].replace(/<[^>]+>/g, '').trim();
      if (!href.startsWith('http')) return;

      if (href.includes('vcloud') || href.includes('v-cloud') || href.includes('drive') || href.includes('watch')) {
        const epMatch = text.match(/(?:Episode|Ep|E)\s*0*(\d+)/i) || href.match(/(?:episode|ep|e)0*(\d+)/i);
        const epNum = epMatch ? parseInt(epMatch[1], 10) : fallbackEpisodes.length + 1;
        fallbackEpisodes.push({
          episodeNumber: epNum,
          episodeTitle: `Episode ${epNum}`,
          targetUrl: href,
        });
      }
    });

    return fallbackEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (e: any) {
    return [];
  }
}

export function isStreamableVideoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

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
 * Resolves Pass 2 VegaMovies deep locker URL (VCloud double-atob + G-Drive failover).
 */
export async function resolveVegaMoviesLocker(
  targetUrl: string,
  qualityLabel: string = '720p'
): Promise<ResolvedStreamResult> {
  try {
    if (targetUrl.includes('vcloud') || targetUrl.includes('v-cloud')) {
      const directUrl = await resolveVcloudDirectStream(targetUrl, qualityLabel);
      if (directUrl) {
        return {
          success: true,
          streamUrl: directUrl,
          providerName: 'VEGAMOVIES [VCLOUD DIRECT]',
          qualityLabel,
        };
      }
    }

    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': BASE_DOMAIN + '/' },
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
              providerName: `VEGAMOVIES [${candidate.text.toUpperCase()}]`,
              qualityLabel,
            };
          }
        }
      } catch (e) {}
    }

    return {
      success: false,
      providerName: 'VEGAMOVIES',
      qualityLabel,
      message: 'No direct streamable video link found',
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

export async function resolveVegaMoviesUnlockedPage(targetUrl: string): Promise<string> {
  try {
    if (targetUrl.includes('vcloud') || targetUrl.includes('v-cloud')) {
      return await decodeVcloudTokenPage(targetUrl);
    }

    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': BASE_DOMAIN + '/' },
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

async function resolveVcloudDirectStream(vcloudUrl: string, qualityLabel: string = '480p'): Promise<string | null> {
  try {
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

    for (const c of candidates) {
      if (isStreamableVideoUrl(c.href)) {
        return c.href;
      }
    }
  } catch (e) {
    console.warn('[VCloud Direct Resolver Error]', e);
  }
  return null;
}

/**
 * Dedicated Stream Resolver for Server 1 in Video Player Modal.
 */
export async function resolveVegaMovies480pStream(
  queryTitle: string,
  targetYear?: number | string,
  imdbId?: string,
  mediaType: string = 'movie',
  seasonNum: number = 1,
  episodeNum: number = 1,
  baseDomain: string = BASE_DOMAIN
): Promise<{ url: string; qualityLabel: string } | null> {
  try {
    const isTv = mediaType === 'tv' || mediaType === 'series' || mediaType === 'show';
    const options = await getVegaMoviesQualityOptions(
      queryTitle,
      targetYear,
      imdbId,
      mediaType,
      baseDomain,
      'VEGAMOVIES',
      undefined,
      undefined,
      seasonNum
    );

    if (!options || options.length === 0) return null;

    const candidateLockers = options.filter(
      (o) =>
        o.contentType !== 'SEASON_BATCH_ZIP' &&
        !/\b(?:batch|zip|pack)\b/i.test(o.targetUrl) &&
        !/\b(?:batch|zip|pack)\b/i.test(o.episodeName || '')
    );

    const pool = candidateLockers.length > 0 ? candidateLockers : options;
    if (pool.length === 0) return null;

    let epTargetVcloud: string | null = null;
    let selectedQualityLabel = '480p';

    if (isTv) {
      const sortedPool = [...pool].sort((a, b) => {
        const order: Record<string, number> = { '480p': 1, '720p': 2, '1080p': 3, '2k': 4, '4k': 5 };
        const qA = order[(a.qualityLabel || '').toLowerCase()] || 99;
        const qB = order[(b.qualityLabel || '').toLowerCase()] || 99;
        return qA - qB;
      });

      for (const locker of sortedPool) {
        try {
          const episodes = await fetchVegaMoviesEpisodes(locker.targetUrl);
          const singleEpisodes = episodes.filter(
            (e) => !/\b(?:batch|zip_file|pack_file)\b/i.test(e.episodeTitle)
          );

          if (singleEpisodes.length > 0) {
            const matchedEp = singleEpisodes.find((e) => e.episodeNumber === episodeNum) || singleEpisodes[0];
            if (matchedEp && matchedEp.targetUrl) {
              epTargetVcloud = matchedEp.targetUrl;
              selectedQualityLabel = locker.qualityLabel || '720p';
              break;
            }
          }
        } catch (e: any) {}
      }
    } else {
      const option480p = pool.find((o) => o.qualityLabel === '480p') ||
                         pool.find((o) => o.qualityLabel === '720p') ||
                         pool[0];
      const resolved = await resolveVegaMoviesLocker(option480p.targetUrl, option480p.qualityLabel || '480p');
      if (resolved && resolved.success && isStreamableVideoUrl(resolved.streamUrl)) {
        return {
          url: resolved.streamUrl || '',
          qualityLabel: `VEGAMOVIES (${resolved.providerName || 'VCLOUD'})`,
        };
      }
      return null;
    }

    if (!epTargetVcloud) return null;

    const directUrl = await resolveVcloudDirectStream(epTargetVcloud, selectedQualityLabel);
    if (directUrl) {
      return {
        url: directUrl,
        qualityLabel: `VEGAMOVIES ${selectedQualityLabel.toUpperCase()} (VCLOUD DIRECT)`,
      };
    }
  } catch (e: any) {}
  return null;
}
