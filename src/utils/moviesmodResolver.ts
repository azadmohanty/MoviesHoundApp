import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence } from './FuzzyMatcher';

const BASE_DOMAIN = 'https://moviesmod.at';

/**
 * Searches MoviesMod search endpoint for candidate post cards.
 */
export async function searchMoviesMod(
  query: string,
  queryYear?: string | number,
  signal?: AbortSignal
): Promise<SearchArticleCard[]> {
  const cards: SearchArticleCard[] = [];
  const searchUrl = `${BASE_DOMAIN}/?s=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(searchUrl, {
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    const html = await res.text();

    const articleMatches = html.matchAll(/<article[\s\S]{0,500}?href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi);
    let count = 0;
    for (const match of articleMatches) {
      let href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();

      if (href.includes('/category/') || href.includes('/tag/') || href.includes('/movies/') || href.includes('/page/')) continue;

      if (href && text && text.length > 5) {
        const score = calculateMatchConfidence(query, text, queryYear);
        cards.push({
          id: `mod-search-${count++}`,
          title: text,
          permalink: href,
          siteKey: 'moviesmod',
          siteDisplayName: 'MOVIESMOD',
          confidenceScore: score,
        });
      }
    }
  } catch (e: any) {
    // Timeout or network error handled silently by caller
  }

  return cards;
}

/**
 * Parses main article page HTML from MoviesMod into structured ScrapedQualityOptions.
 */
export function parseMoviesModArticle(html: string, articleUrl: string): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];
  const blocks = html.split(/<h[2-4]/gi);

  blocks.forEach((block, idx) => {
    if (idx === 0) return;
    const headerMatch = block.match(/^[^>]*>([\s\S]*?)<\/h[2-4]>/i);
    const headerText = headerMatch ? headerMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    if (!headerText || (!headerText.includes('Download') && !headerText.includes('480p') && !headerText.includes('720p'))) return;

    let qualityLabel: '480p' | '720p' | '1080p' | '4K' = '720p';
    if (headerText.includes('480p')) qualityLabel = '480p';
    else if (headerText.includes('1080p')) qualityLabel = '1080p';
    else if (headerText.includes('4K')) qualityLabel = '4K';

    const codec = /10bit|hevc/i.test(headerText) ? 'HEVC 10Bit' : 'H.264';
    const ripFormat = /imax|bluray/i.test(headerText) ? 'BluRay IMAX' : 'WEBRip';

    const sizeMatch = headerText.match(/\[([\d\.]+\s*(?:GB|MB))\]/i);
    const fileSize = sizeMatch ? sizeMatch[1] : '1.4 GB';

    const seasonMatch = headerText.match(/Season\s*(\d+)/i);
    const seasonNumber = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;

    const linkMatches = block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of linkMatches) {
      let href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();

      if (href.startsWith('/')) href = BASE_DOMAIN + href;

      if (text.includes('Download') || href.includes('links.modpro')) {
        options.push({
          id: `mod-${options.length}`,
          siteKey: 'moviesmod',
          siteDisplayName: 'MOVIESMOD',
          qualityLabel,
          ripFormat,
          codec,
          fileSize,
          audioTracks: 'Hindi-English Dual',
          contentType: 'MOVIE',
          seasonNumber,
          targetUrl: href,
          priorityScore: 2,
        });
      }
    }
  });

  return options;
}

/**
 * Resolves Pass 2 MoviesMod deep locker URL (Base64 parameter & Driveseed).
 */
export async function resolveMoviesModLocker(
  targetUrl: string,
  qualityLabel: string = '720p'
): Promise<ResolvedStreamResult> {
  try {
    if (targetUrl.includes('url=')) {
      const b64 = targetUrl.split('url=')[1].split('&')[0];
      try {
        const decoded = atob(b64);
        if (decoded.includes('http')) {
          return {
            success: true,
            streamUrl: decoded,
            providerName: 'MOVIESMOD [BASE64]',
            qualityLabel,
          };
        }
      } catch (e) {}
    }

    const res = await fetch(targetUrl);
    const html = await res.text();

    const linkMatch = html.match(/href="([^"]*(?:drive|gdflix|fastdl|download)[^"]*)"/i);
    if (linkMatch) {
      return {
        success: true,
        streamUrl: linkMatch[1],
        providerName: 'MOVIESMOD [DRIVESEED]',
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
