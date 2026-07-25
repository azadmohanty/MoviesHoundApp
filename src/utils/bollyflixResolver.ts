import { SearchArticleCard, ScrapedQualityOption, ResolvedStreamResult } from './resolverTypes';
import { calculateMatchConfidence } from './FuzzyMatcher';
import { extractRipFormat, extractAudioTracks, extractVideoCodec } from './MediaTagExtractor';

const BASE_DOMAIN = 'https://bollyflix.at';

/**
 * Searches Bollyflix search endpoint for candidate post cards.
 */
export async function searchBollyflix(
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
      const text = match[2].replace(/<[^>]+>/g, '').trim();
      if (text && text.length > 5) {
        const score = calculateMatchConfidence(query, text, queryYear);
        cards.push({
          id: `bolly-search-${count++}`,
          title: text,
          permalink: match[1],
          siteKey: 'bollyflix',
          siteDisplayName: 'BOLLYFLIX',
          confidenceScore: score,
        });
      }
    }
    if (cards.length > 0) return cards;
  } catch (e: any) {
    // Timeout or network error handled silently by caller
  }

  return cards;
}

/**
 * Parses main article page HTML from Bollyflix into structured ScrapedQualityOptions.
 */
export function parseBollyflixArticle(html: string, articleUrl: string): ScrapedQualityOption[] {
  const options: ScrapedQualityOption[] = [];
  const h1Match = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const mainTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';

  const blocks = html.split(/<h[2-4]/gi);

  blocks.forEach((block, idx) => {
    if (idx === 0) return;
    const headerMatch = block.match(/^[^>]*>([\s\S]*?)<\/h[2-4]>/i);
    const headerText = headerMatch ? headerMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    if (!headerText) return;

    let qualityLabel: '480p' | '720p' | '1080p' | '4K' = '720p';
    if (headerText.includes('480p')) qualityLabel = '480p';
    else if (headerText.includes('1080p')) qualityLabel = '1080p';
    else if (headerText.includes('2160p') || headerText.includes('4K')) qualityLabel = '4K';

    const fullTagContext = `${headerText} ${mainTitle}`;
    const codec = extractVideoCodec(headerText);
    const ripFormat = extractRipFormat(fullTagContext);
    const audioTracks = extractAudioTracks(fullTagContext);

    const sizeMatch = headerText.match(/\[([\d\.]+\s*(?:GB|MB))\]/i);
    const fileSize = sizeMatch ? sizeMatch[1] : '1.3 GB';

    const seasonMatch = headerText.match(/Season\s*(\d+)/i);
    const seasonNumber = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;

    const linkMatches = block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of linkMatches) {
      let href = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();

      if (href.startsWith('/')) href = BASE_DOMAIN + href;

      if (href.includes('fastdlserver') || href.includes('linksmod') || text.includes('Google Drive') || text.includes('Download')) {
        options.push({
          id: `bolly-${options.length}`,
          siteKey: 'bollyflix',
          siteDisplayName: 'BOLLYFLIX',
          qualityLabel,
          ripFormat,
          codec,
          fileSize,
          audioTracks: 'Hindi DD5.1 Dual',
          contentType: 'MOVIE',
          seasonNumber,
          targetUrl: href,
          priorityScore: 3,
        });
      }
    }
  });

  return options;
}

/**
 * Resolves Pass 2 Bollyflix deep locker URL (FastDL 302 Location Redirect).
 */
export async function resolveBollyflixLocker(
  targetUrl: string,
  qualityLabel: string = '720p'
): Promise<ResolvedStreamResult> {
  try {
    if (targetUrl.includes('fastdlserver')) {
      const res = await fetch(targetUrl, { redirect: 'manual' });
      const location = res.headers.get('location');
      if (location) {
        return {
          success: true,
          streamUrl: location,
          providerName: 'BOLLYFLIX [FASTDL]',
          qualityLabel,
        };
      }
    }

    return {
      success: true,
      streamUrl: targetUrl,
      providerName: 'BOLLYFLIX DIRECT',
      qualityLabel,
    };
  } catch (err: any) {
    return {
      success: false,
      providerName: 'BOLLYFLIX',
      qualityLabel,
      message: `Bollyflix resolution error: ${err.message}`,
    };
  }
}
