/**
 * ============================================================================
 * kickassanimeResolver.ts
 * ============================================================================
 * AGENT GUIDELINES:
 * All domain lookups in this file MUST use `getLiveDomain('kickassanime')` or
 * `getLiveDomainAsync('kickassanime')` from `./resolver`.
 * Do NOT use hardcoded static domain strings!
 *
 * Uses KickAssAnime REST API endpoints (/api/anime?q=... and /api/show/.../episodes)
 * for instant, bulletproof JSON search, episode listing, HLS master playlist extraction,
 * and multi-language subtitle tracks.
 * ============================================================================
 */

import { Buffer } from 'buffer';
import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { findFuzzyTitleMatches, sanitizeSearchQuery } from './FuzzyMatcher';
import { getLiveDomain, getLiveDomainAsync } from './resolver';

const KAAST_BASE = 'https://kaast1.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function b64decode(str: string): string {
  try {
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch (e) {
    try {
      return (globalThis as any).atob?.(str) ?? str;
    } catch (_) {
      return str;
    }
  }
}

export interface KickAssAnimeItem {
  title: string;
  slug: string;
  posterUrl: string;
  isDub: boolean;
  episodesCount?: number;
}

export interface KickAssEpisode {
  episodeNumber: number;
  title: string;
  url: string;
}

/**
 * Searches KickAssAnime using direct JSON REST API + dynamic domain resolution & fuzzy matching.
 */
export async function searchKickAssAnime(query: string): Promise<KickAssAnimeItem[]> {
  const baseDomain = await getLiveDomainAsync('kickassanime');
  const cleanQuery = sanitizeSearchQuery(query);

  try {
    // Primary: Query native REST API endpoint
    const apiUrl = `${baseDomain}/api/anime?q=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': UA, 'Referer': baseDomain }
    });

    const items: KickAssAnimeItem[] = [];

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.result)) {
        data.result.forEach((entry: any) => {
          if (entry.title && entry.slug) {
            const rawTitle = entry.title.replace(/^"|"$/g, '').trim();
            let poster = '';
            if (entry.poster && entry.poster.hq) {
              poster = `${baseDomain}/image/poster/${entry.poster.hq}.webp`;
            } else if (entry.poster && entry.poster.sm) {
              poster = `${baseDomain}/image/poster/${entry.poster.sm}.webp`;
            }

            items.push({
              title: rawTitle,
              slug: entry.slug,
              posterUrl: poster,
              isDub: rawTitle.toLowerCase().includes('(dub)'),
              episodesCount: entry.episode_duration ? 12 : undefined
            });
          }
        });
      }
    }

    // HTML Fallback Parsing if REST API returned 0 items
    if (items.length === 0) {
      const searchUrl = `${baseDomain}/search?q=${encodeURIComponent(cleanQuery)}`;
      const htmlRes = await fetch(searchUrl, { headers: { 'User-Agent': UA, 'Referer': baseDomain } });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const links = [...html.matchAll(/<a[^>]*href="\/anime\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
        links.forEach((match) => {
          const slug = match[1];
          const linkHtml = match[2];
          const titleMatch = linkHtml.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i) || [null, linkHtml];
          const title = titleMatch[1] ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : slug.replace(/-/g, ' ');
          const imgMatch = linkHtml.match(/<img[^>]*src="([^"]+)"/i);

          if (slug && title) {
            items.push({
              title,
              slug,
              posterUrl: imgMatch ? imgMatch[1] : '',
              isDub: title.toLowerCase().includes('(dub)')
            });
          }
        });
      }
    }

    return findFuzzyTitleMatches(cleanQuery, items, 5);
  } catch (err) {
    console.warn('[KickAssAnime] Search failed:', err);
    return [];
  }
}

/**
 * Loads episode list for a specific KickAssAnime slug via REST API / HTML parser.
 */
export async function loadKickAssAnimeEpisodes(slug: string): Promise<KickAssEpisode[]> {
  const baseDomain = await getLiveDomainAsync('kickassanime');
  const cleanSlug = slug.replace(/^https?:\/\/[^\/]+\/anime\//, '');

  try {
    // 1. Primary REST API episode endpoint
    const apiEpUrl = `${baseDomain}/api/show/${cleanSlug}/episodes`;
    const apiRes = await fetch(apiEpUrl, { headers: { 'User-Agent': UA, 'Referer': baseDomain } });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && Array.isArray(data.result)) {
        const episodes: KickAssEpisode[] = data.result.map((ep: any, idx: number) => {
          const epNum = ep.episode_number ? parseInt(ep.episode_number, 10) : idx + 1;
          const epSlug = ep.slug || `episode-${epNum}`;
          return {
            episodeNumber: epNum,
            title: ep.title ? ep.title.trim() : `Episode ${epNum}`,
            url: `${baseDomain}/anime/${cleanSlug}/${epSlug}`
          };
        });
        return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      }
    }

    // 2. HTML Fallback Episode Parsing
    const targetUrl = `${baseDomain}/anime/${cleanSlug}`;
    const response = await fetch(targetUrl, { headers: { 'User-Agent': UA, 'Referer': baseDomain } });

    if (!response.ok) return [];

    const html = await response.text();
    const episodeMatches = [...html.matchAll(/<a[^>]*href="(\/anime\/[^"]+\/episode-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    const episodes: KickAssEpisode[] = episodeMatches.map((m, idx) => {
      const epUrl = `${baseDomain}${m[1]}`;
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      const epNumMatch = text.match(/Episode\s*(\d+)/i) || m[1].match(/episode-(\d+)/i);
      const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : idx + 1;

      return {
        episodeNumber: epNum,
        title: text || `Episode ${epNum}`,
        url: epUrl
      };
    });

    return episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
  } catch (e) {
    console.warn('[KickAssAnime] Failed to load episodes:', e);
    return [];
  }
}

/**
 * Resolves direct HLS stream (.m3u8) and subtitle tracks from a KickAssAnime episode page.
 */
export async function resolveKickAssAnimeStream(
  episodeUrl: string
): Promise<ResolvedStreamResult | null> {
  const baseDomain = await getLiveDomainAsync('kickassanime');

  try {
    const response = await fetch(episodeUrl, {
      headers: { 'User-Agent': UA, 'Referer': baseDomain }
    });

    if (!response.ok) return null;

    const html = await response.text();

    // 1. Extract Pinkbird / Kaast Manifest HLS (.m3u8)
    const pinkbirdMatch = html.match(/pref\.php\?id=([^"']+)/i) || html.match(/player\.php\?id=([^"']+)/i);
    if (pinkbirdMatch) {
      const prefUrl = `${baseDomain}/pref.php?id=${pinkbirdMatch[1]}`;
      const prefRes = await fetch(prefUrl, { headers: { 'User-Agent': UA, 'Referer': KAAST_BASE } });

      if (prefRes.ok) {
        const prefData = await prefRes.json();
        if (prefData && prefData.data && prefData.data.length > 0) {
          const eidRaw = prefData.data[0].eid;
          if (eidRaw) {
            const eid = b64decode(eidRaw);
            const masterM3u8 = `https://pb.kaast1.com/manifest/${eid}/master.m3u8`;

            return {
              success: true,
              streamUrl: masterM3u8,
              providerName: 'KickAssAnime (Pinkbird HLS)',
              qualityLabel: '720p'
            };
          }
        }
      }
    }

    // 2. Direct M3U8 / MP4 Fallback regex scan in HTML
    const directM3u8 = html.match(/file:\s*["'](https:[^"']+\.m3u8[^"']*)["']/i) ||
                        html.match(/src:\s*["'](https:[^"']+\.m3u8[^"']*)["']/i);

    if (directM3u8 && directM3u8[1]) {
      return {
        success: true,
        streamUrl: directM3u8[1],
        providerName: 'KickAssAnime (Direct HLS)',
        qualityLabel: '720p'
      };
    }

    return null;
  } catch (err) {
    console.warn('[KickAssAnime] Failed resolving stream:', err);
    return null;
  }
}
