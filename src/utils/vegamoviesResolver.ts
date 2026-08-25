import { Buffer } from 'buffer';
import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence, sanitizeSearchQuery } from './FuzzyMatcher';
import { getLiveDomain } from './resolver';

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
  buttonText?: string;
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
 * 2-Hop Gateway Resolver to follow landing hubs (1vegamovies.cc -> new2.vegamovies.futbol)
 */
async function resolveActiveVegaDomain(preferredDomain: string): Promise<string> {
  try {
    const res = await fetch(preferredDomain, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const html = await res.text();
      const liveEngineMatch = html.match(/href="([^"]*vegamovies\.[a-z0-9]+[^"]*)"/i) ||
                             html.match(/href="([^"]+)"[^>]*>View Full Site/i);
      if (liveEngineMatch) {
        let liveUrl = liveEngineMatch[1].replace(/\/$/, '');
        if (liveUrl.startsWith('http')) return liveUrl;
      }
      return preferredDomain;
    }
  } catch (_) {}
  return VEGA_MIRRORS[0];
}

async function fetchVegaSearchHits(
  searchQuery: string,
  preferredDomain: string,
  signal?: AbortSignal
): Promise<{ hits: any[]; domain: string }> {
  const activeDomain = await resolveActiveVegaDomain(preferredDomain);
  const domainsToTry = [
    activeDomain,
    ...VEGA_MIRRORS.filter((d) => d !== activeDomain),
  ];

  for (const domain of domainsToTry) {
    try {
      const searchUrl = `${domain}/search.php?q=${encodeURIComponent(searchQuery)}&page=1`;
      const res = await fetch(searchUrl, { signal, headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json,*/*' } });
      if (!res.ok) continue;

      const text = await res.text();
      let hits: any[] = [];

      try {
        const json = JSON.parse(text);
        if (json.hits && json.hits.length > 0) {
          return { hits: json.hits, domain };
        }
      } catch (_) {}

      // HTML scraping fallback
      const matches = [...text.matchAll(/<article[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (matches.length > 0) {
        hits = matches.map((m) => ({
          document: {
            permalink: m[1],
            post_title: cleanText(m[2]),
          },
        }));
        return { hits, domain };
      }
    } catch (_) {}
  }

  return { hits: [], domain: preferredDomain };
}

/**
 * Raw Search Cards Provider for Layer 1 Discovered Posts Feed
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
    const postTitle = cleanText(doc.post_title || '');
    const permalink = (doc.permalink || '').startsWith('http') ? doc.permalink : `${domain}${doc.permalink}`;

    const sMatch = postTitle.match(/\b(?:Season|S)\s*0*(\d{1,2})\b/i);
    const seasonTags = sMatch ? [parseInt(sMatch[1], 10)] : undefined;
    const audioMatch = postTitle.match(/\{([^}]+)\}/i) || postTitle.match(/\[([A-Za-z0-9\s.+~-]+Audio|[A-Za-z0-9\s.+~-]+Hindi[^\]]*)\]/i);
    const audioTracks = audioMatch ? audioMatch[1].trim() : undefined;

    return {
      id: `vega-card-${i}-${Date.now()}`,
      title: postTitle,
      permalink,
      posterUrl: doc.post_thumbnail,
      siteKey: 'vegamovies',
      siteDisplayName: 'VEGAMOVIES',
      confidenceScore: calculateMatchConfidence(queryTitle, postTitle),
      seasonTags,
      audioTracks,
    };
  });
}

/**
 * 100% Robust VegaMovies Article Parser with Strict Movie vs Series Segregation
 */
export function parseVegaMoviesArticle(html: string, articleUrl: string = ''): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];
  const imdbId = extractImdbId(html);

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mainTitle = cleanText(h1Match ? h1Match[1] : '');

  // Strict Series vs Movie flag based on title & URL
  const isSeriesArticle = /\b(?:season|s0\d|series|episodes|complete)\b/i.test(mainTitle) ||
                          /\b(?:season|s0\d|series|episodes|complete)\b/i.test(articleUrl);

  // Restrict parsing to main body to exclude related posts and comments
  const bodyMatch = html.match(/<main[^>]*class="[^"]*page-body[^"]*"[^>]*>([\s\S]*?)<\/main>/i) ||
                    html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const contentHtml = bodyMatch ? bodyMatch[1] : html;

  const sectionRegex = /<h([2345])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[2345]|<hr|$)/gi;
  const sections = [...contentHtml.matchAll(sectionRegex)];

  sections.forEach((sec) => {
    const headerText = cleanText(sec[2]);
    const bodyHtml = sec[3];

    const links = [...bodyHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    if (links.length === 0) return;

    let headerQuality = (headerText.match(/\b(2160p|4k|1080p|720p|480p|2k)\b/i) || [])[1];
    
    // Strict Season Number parsing: only 1 or 2 digits!
    let seasonNumber = 1;
    const sMatch = headerText.match(/\b(?:Season|S)\s*0*(\d{1,2})\b/i) || mainTitle.match(/\b(?:Season|S)\s*0*(\d{1,2})\b/i);
    if (sMatch) seasonNumber = parseInt(sMatch[1], 10);

    const codec = (headerText.match(/\b(10Bit|HEVC|x265|H\.?265|x264|H\.?264|AV1)\b/i) || [])[1] || 'x264';
    const ripFormat = (headerText.match(/\b(BluRay|WEB-DL|HDRip|WEBRip|HDTV|DVDRip)\b/i) || [])[1] || 'WEB-DL';
    const audioTracks = (headerText.match(/\{([^}]+)\}/i) || headerText.match(/\[([A-Za-z0-9\s.+~-]+Audio|[A-Za-z0-9\s.+~-]+Hindi[^\]]*)\]/i) || [])[1] || 'Dual Audio';

    links.forEach((l) => {
      let href = l[1];
      const fullTag = l[0];
      const btnText = cleanText(l[2]);

      if (!href.startsWith('http') || href.includes('imdb.com') || href.includes('telegram')) return;

      if (href.includes('url=')) {
        try {
          const b64 = href.split('url=')[1].split('&')[0];
          href = b64decode(b64);
        } catch (_) {}
      }

      const btnQuality = (btnText.match(/\b(2160p|4k|1080p|720p|480p|2k)\b/i) || [])[1];
      const qualityLabel = normalizeQuality(headerQuality || btnQuality || '720p');

      const sizeMatch = btnText.match(/\[([0-9.]+\s*(?:MB|GB)(?:\/[Ee])?)\]/i) ||
                        headerText.match(/\[([0-9.]+\s*(?:MB|GB)(?:\/[Ee])?)\]/i) ||
                        headerText.match(/\[([0-9.]+\s*(?:MB|GB)(?:-Zip)?)\]/i);
      const fileSize = sizeMatch ? sizeMatch[1].trim() : 'Unknown';

      const isZip = /batch|zip|pack|bth-button/i.test(fullTag) || /batch|zip|pack/i.test(btnText) || /batch|zip/i.test(href);

      // Clean Movie vs Series assignment
      let contentType: 'MOVIE' | 'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP' = 'MOVIE';
      if (isSeriesArticle) {
        contentType = isZip ? 'SEASON_BATCH_ZIP' : 'SINGLE_EPISODE';
      }

      let priorityScore = 5;
      if (isZip) priorityScore = 90;
      else if (/vcloud|v-cloud/i.test(href) || /v-cloud/i.test(btnText)) priorityScore = 1;
      else if (/g-direct|fastdl/i.test(href) || /g-direct/i.test(btnText)) priorityScore = 2;

      options.push({
        id: `vega-${Math.random().toString(36).substr(2, 7)}`,
        siteKey: 'vegamovies',
        siteDisplayName: 'VEGAMOVIES',
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
 * Multi-Page Search & Smart Verification Pipeline
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
  if (onLog) onLog(`${siteDisplayName}: Searching "${searchQuery}"...`);

  const { hits, domain: activeDomain } = await fetchVegaSearchHits(searchQuery, baseDomain, signal);
  if (!hits || hits.length === 0) {
    if (onLog) onLog(`${siteDisplayName}: 0 hits found for "${searchQuery}".`);
    return [];
  }

  const cleanTargetImdb = targetImdbId ? targetImdbId.trim().toLowerCase().match(/tt\d{7,8}/)?.[0] : undefined;

  let candidateHits = hits.filter((hit: any) => {
    const postTitle = cleanText(hit.document?.post_title || '');
    const docImdb = hit.document?.imdb_id?.toString().toLowerCase().match(/tt\d{7,8}/)?.[0];

    if (cleanTargetImdb && docImdb && cleanTargetImdb === docImdb) {
      if (onLog) onLog(`${siteDisplayName}: 100% Golden IMDb Match confirmed (${cleanTargetImdb})`);
      return true;
    }

    const score = calculateMatchConfidence(queryTitle, postTitle, targetYear);
    return score >= 35;
  });

  if (candidateHits.length === 0) candidateHits = hits;

  const topHits = candidateHits.slice(0, 3);
  if (onLog) onLog(`${siteDisplayName}: Fetching ${topHits.length} verified candidate pages...`);

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
    if (res.status === 'fulfilled') allOptions.push(...res.value);
  });

  const dedupMap = new Map<string, ScrapedQualityOption>();
  allOptions.forEach((o) => dedupMap.set(o.targetUrl, o));
  const finalOptions = Array.from(dedupMap.values()).sort((a, b) => a.priorityScore - b.priorityScore);

  if (onLog) onLog(`${siteDisplayName}: Extracted ${finalOptions.length} quality options.`);
  return finalOptions;
}

/**
 * 2-Tier Episode Discovery Engine for VegaMovies (Handles NexDrive Section Headers + Direct Links)
 */
export async function fetchVegaMoviesEpisodes(portalUrl: string): Promise<SeriesEpisodeItem[]> {
  try {
    const res = await fetch(portalUrl, {
      headers: { 'User-Agent': UA, 'Referer': BASE_DOMAIN + '/' },
    });
    const html = await res.text();

    const episodes: SeriesEpisodeItem[] = [];

    // Pattern 1: NexDrive Section Headers (<h4>-:Episodes: 1:-</h4> or <h3>Episode 1</h3>)
    const sections = html.split(/(?=<h[2345][^>]*>)/i);
    sections.forEach((sec) => {
      const epHeaderMatch = sec.match(/<h[2345][^>]*>([\s\S]*?)<\/h[2345]>/i);
      if (!epHeaderMatch) return;
      const headerText = cleanText(epHeaderMatch[1]);
      const epMatch = headerText.match(/(?:Episodes?|Ep|E)\s*:?\s*0*(\d{1,3})/i);
      if (!epMatch) return;

      const epNum = parseInt(epMatch[1], 10);
      const links = [...sec.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      const candidateEpLinks: Array<{ href: string; btnText: string; priority: number }> = [];

      for (const l of links) {
        const href = l[1];
        const btnText = cleanText(l[2]);
        if (href.startsWith('http') && !href.includes('imdb') && !href.includes('telegram')) {
          let priority = 99;
          if (/v-cloud|vcloud/i.test(btnText) || /vcloud|v-cloud/i.test(href)) priority = 1; // Highest priority: V-Cloud!
          else if (/g-direct|fastdl/i.test(btnText) || /fastdl/i.test(href)) priority = 2;
          else if (/filepress|g-drive/i.test(btnText)) priority = 3;
          else priority = 4;

          candidateEpLinks.push({ href, btnText, priority });
        }
      }

      if (candidateEpLinks.length > 0) {
        candidateEpLinks.sort((a, b) => a.priority - b.priority);
        const topLink = candidateEpLinks[0];
        episodes.push({
          episodeNumber: epNum,
          episodeTitle: `Episode ${epNum < 10 ? '0' + epNum : epNum}`,
          targetUrl: topLink.href,
          buttonText: topLink.btnText,
        });
      }
    });

    // Pattern 2: Direct Anchor Episode links (<a href="...">Episode 1</a>)
    if (episodes.length === 0) {
      const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
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
    }

    return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (e: any) {
    return [];
  }
}

export function isStreamableVideoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  if (
    url.includes('vcloud.zip') ||
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
      const text = cleanText(l[2]);

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
          const text = cleanText(match[2]);

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
      const text = cleanText(match[2]);

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
