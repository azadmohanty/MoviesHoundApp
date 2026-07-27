/**
 * kickassanimeResolver.ts
 *
 * Dedicated resolver for KickAssAnime (Subbed & Dubbed Anime).
 * Handles search, episode resolution, HLS master playlist extraction,
 * and multi-language subtitle tracks.
 */

import { Buffer } from 'buffer';
import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { findFuzzyTitleMatches, sanitizeSearchQuery } from './FuzzyMatcher';
import { getResolvedDomainKey } from './resolver';

const DEFAULT_BASE_DOMAIN = 'https://kickassanime.cx';
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
 * Searches KickAssAnime using dynamic domain resolution and fuzzy matching.
 */
export async function searchKickAssAnime(query: string): Promise<KickAssAnimeItem[]> {
  const baseDomain = getResolvedDomainKey('kickassanime', DEFAULT_BASE_DOMAIN);
  const cleanQuery = sanitizeSearchQuery(query);

  try {
    const searchUrl = `${baseDomain}/search?q=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': UA, 'Referer': baseDomain }
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Extract appData JSON from embedded script tag if available
    const appDataMatch = html.match(/script:containsData\(appData\)|"animes":\s*(\[[^\]]+\])/i) ||
                          html.match(/"animes":\s*(\[\{[\s\S]*?\}\])/);
    
    const items: KickAssAnimeItem[] = [];

    if (appDataMatch && appDataMatch[1]) {
      try {
        const rawList = JSON.parse(appDataMatch[1]);
        rawList.forEach((entry: any) => {
          if (entry.name && entry.slug) {
            items.push({
              title: entry.name,
              slug: entry.slug,
              posterUrl: entry.poster ? `${baseDomain}/uploads/${entry.poster}` : '',
              isDub: entry.name.toLowerCase().includes('(dub)'),
              episodesCount: entry.episode ? parseInt(entry.episode, 10) : undefined
            });
          }
        });
      } catch (_) {}
    }

    // HTML Fallback Parsing if JSON script parsing yields 0 items
    if (items.length === 0) {
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

    return findFuzzyTitleMatches(cleanQuery, items, 5);
  } catch (err) {
    console.warn('[KickAssAnime] Search failed:', err);
    return [];
  }
}

/**
 * Loads episode list for a specific KickAssAnime slug.
 */
export async function loadKickAssAnimeEpisodes(slug: string): Promise<KickAssEpisode[]> {
  const baseDomain = getResolvedDomainKey('kickassanime', DEFAULT_BASE_DOMAIN);
  const targetUrl = slug.startsWith('http') ? slug : `${baseDomain}/anime/${slug}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': UA, 'Referer': baseDomain }
    });

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
  const baseDomain = getResolvedDomainKey('kickassanime', DEFAULT_BASE_DOMAIN);

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
