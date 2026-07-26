/**
 * FzMovies Direct 480p MP4 Scraper Engine
 * Resolves direct CDN .mp4 stream links with IMDb cross-verification and max-connections mirror selection.
 */

export type FzMoviesStreamResult = {
  url: string;
  qualityLabel: string;
  connections: number;
};

class FzMoviesResolver {
  private baseUrl = 'https://www.fzm.pw';
  private cookieJar: Record<string, string> = {};

  private updateCookies(setCookieHeader: string | string[] | null | undefined) {
    if (!setCookieHeader) return;
    const cookiesArr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookiesArr.forEach(c => {
      const parts = c.split(';')[0].split('=');
      if (parts.length >= 2) {
        this.cookieJar[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    });
  }

  private getCookieString(): string {
    return Object.keys(this.cookieJar).map(k => `${k}=${this.cookieJar[k]}`).join('; ');
  }

  private async request(
    url: string,
    method: string = 'GET',
    postData: string | null = null,
    customHeaders: Record<string, string> = {},
    redirectCount: number = 0
  ): Promise<{ statusCode: number; body: string }> {
    if (redirectCount > 5) {
      throw new Error(`[FzMovies] Too many redirects for ${url}`);
    }

    const cookieStr = this.getCookieString();
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...customHeaders
    };

    if (cookieStr) {
      headers['Cookie'] = cookieStr;
    }

    if (postData) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const byteLen = typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(postData).length
        : encodeURIComponent(postData).replace(/%[0-9A-F]{2}/g, 'a').length;
      headers['Content-Length'] = String(byteLen);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: postData ? postData : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Robust header lookup for cookies across platform fetch implementations
      const setCookie = res.headers.get('set-cookie') || res.headers.get('Set-Cookie');
      if (setCookie) {
        this.updateCookies(setCookie);
      }

      // Handle 301 / 302 / 307 / 308 redirects automatically
      if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
        const redirectLocation = res.headers.get('location') || res.headers.get('Location');
        if (redirectLocation) {
          const targetUrl = new URL(redirectLocation, url).toString();
          console.log(`[FzMovies] Following redirect (${res.status}): ${url} -> ${targetUrl}`);
          return this.request(targetUrl, 'GET', null, customHeaders, redirectCount + 1);
        }
      }

      const body = await res.text();
      return {
        statusCode: res.status,
        body
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`[FzMovies] HTTP Request failed for ${url}: ${err.message}`);
    }
  }

  public async resolveMovieStream(
    title: string,
    year?: string,
    imdbId?: string,
    mediaType: 'movie' | 'tv' | 'anime' = 'movie'
  ): Promise<FzMoviesStreamResult | null> {
    try {
      console.log(`[FzMovies Resolver] Initiating search for: "${title}" (Type: ${mediaType}, Year: ${year || 'N/A'}, IMDb: ${imdbId || 'N/A'})`);

      // FzMovies hosted content is strictly movies
      if (mediaType !== 'movie') {
        console.log(`[FzMovies] Skipping TV series request for "${title}" (movies only).`);
        return null;
      }

      // Step 0: Initialize Session Cookie
      await this.request(this.baseUrl);

      // Step 1: POST Search to csearch.php
      const cleanTitle = title.trim();
      const postData = `searchname=${encodeURIComponent(cleanTitle)}&searchby=Name&category=All&Search=Search`;
      const searchRes = await this.request(`${this.baseUrl}/csearch.php`, 'POST', postData, {
        'Referer': `${this.baseUrl}/`
      });

      // Parse movie detail page links
      const movieLinkRegex = /href=['"](movie-[^'"]+\.htm)['"]/gi;
      let match: RegExpExecArray | null;
      const candidatePaths: string[] = [];
      while ((match = movieLinkRegex.exec(searchRes.body)) !== null) {
        if (!candidatePaths.includes(match[1])) {
          candidatePaths.push(match[1]);
        }
      }

      console.log(`[FzMovies Step 1] Found ${candidatePaths.length} candidates for "${title}"`);

      if (candidatePaths.length === 0) {
        console.warn(`[FzMovies] 0 movie search results found for "${title}"`);
        return null;
      }

      // Step 2: Disambiguate multi-results & cross-verify IMDb ID if available
      let selectedPath = candidatePaths[0];

      if (candidatePaths.length > 1 || imdbId) {
        let bestMatchPath = selectedPath;
        let highestConfidence = 0;

        for (const candidate of candidatePaths) {
          try {
            const detailUrl = `${this.baseUrl}/${candidate}`;
            const candidateRes = await this.request(detailUrl, 'GET', null, {
              'Referer': `${this.baseUrl}/csearch.php`
            });

            let confidence = 0;

            // IMDb ID cross-verification check
            if (imdbId && (candidateRes.body.includes(imdbId) || candidateRes.body.toLowerCase().includes(`imdb.com/title/${imdbId.toLowerCase()}`))) {
              confidence += 100;
            }

            // Clean title string match
            const normalizedCandidate = candidate.toLowerCase().replace(/%20/g, ' ');
            const normalizedTarget = cleanTitle.toLowerCase();
            if (normalizedCandidate.includes(normalizedTarget)) {
              confidence += 10;
            }

            // Year match if provided
            if (year && candidateRes.body.includes(year)) {
              confidence += 5;
            }

            if (confidence > highestConfidence) {
              highestConfidence = confidence;
              bestMatchPath = candidate;
            }
          } catch (e) {
            // Ignore individual detail fetch errors during candidate evaluation
          }
        }

        selectedPath = bestMatchPath;
      }

      const detailUrl = `${this.baseUrl}/${selectedPath}`;

      // Step 3: Fetch Selected Movie Details
      const detailRes = await this.request(detailUrl, 'GET', null, {
        'Referer': `${this.baseUrl}/csearch.php`
      });

      // Parse quality options
      const blockRegex = /<a[^>]+href=['"](download1\.php\?downloadoptionskey=[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
      let blockMatch: RegExpExecArray | null;
      const qualityOptions: { link: string; label: string }[] = [];
      while ((blockMatch = blockRegex.exec(detailRes.body)) !== null) {
        const link = blockMatch[1];
        const label = blockMatch[2].replace(/<[^>]+>/g, '').trim();
        qualityOptions.push({ link, label });
      }

      if (qualityOptions.length === 0) {
        console.warn(`[FzMovies] No quality options found on detail page: ${detailUrl}`);
        return null;
      }

      // Prioritize 480p MP4 > MP4 > any
      const selectedOption = qualityOptions.find(o => o.label.toLowerCase().includes('480p') && o.label.toLowerCase().includes('mp4'))
        || qualityOptions.find(o => o.label.toLowerCase().includes('mp4'))
        || qualityOptions[0];

      // Step 4: Fetch Quality Gate (download1.php)
      const optUrl = `${this.baseUrl}/${selectedOption.link}`;
      const optRes = await this.request(optUrl, 'GET', null, {
        'Referer': detailUrl
      });

      const dlKeyRegex = /href=['"](download\.php\?downloadkey=[^'"]+)['"]/gi;
      const dlGateLinks: string[] = [];
      while ((match = dlKeyRegex.exec(optRes.body)) !== null) {
        dlGateLinks.push(match[1]);
      }

      if (dlGateLinks.length === 0) {
        console.warn(`[FzMovies] Download key expired or missing in options response.`);
        return null;
      }

      // Step 5: Fetch Download Gate (download.php) & Extract Direct MP4 links
      const dlGateUrl = `${this.baseUrl}/${dlGateLinks[0]}`;
      const dlGateRes = await this.request(dlGateUrl, 'GET', null, {
        'Referer': optUrl
      });

      const directLinks: { connections: number; streamUrl: string }[] = [];
      const itemRegex = /<dcounter>\((\d+)\s*connections\)<\/dcounter>[\s\S]*?<input[^>]+value=['"](https?:[^'"]+\.mp4[^'"]*)['"]/gi;
      let itemMatch: RegExpExecArray | null;
      while ((itemMatch = itemRegex.exec(dlGateRes.body)) !== null) {
        const connections = parseInt(itemMatch[1], 10);
        const streamUrl = itemMatch[2];
        directLinks.push({ connections, streamUrl });
      }

      // Fallback input extraction if dcounter markup differs
      if (directLinks.length === 0) {
        const inputRegex = /<input[^>]+value=['"](https?:[^'"]+\.mp4[^'"]*)['"]/gi;
        let inputMatch: RegExpExecArray | null;
        while ((inputMatch = inputRegex.exec(dlGateRes.body)) !== null) {
          directLinks.push({ connections: 0, streamUrl: inputMatch[1] });
        }
      }

      if (directLinks.length === 0) {
        console.warn(`[FzMovies] Failed to extract direct .mp4 CDN URLs from gate page.`);
        return null;
      }

      // Sort descending by connection capacity
      directLinks.sort((a, b) => b.connections - a.connections);
      const topLink = directLinks[0];
      console.log(`[FzMovies Success] Direct stream resolved (${topLink.connections} conn) -> ${topLink.streamUrl.substring(0, 60)}...`);

      return {
        url: topLink.streamUrl,
        qualityLabel: `FAST 480P MP4 (${topLink.connections} conn)`,
        connections: topLink.connections
      };
    } catch (err: any) {
      console.warn(`[FzMovies] Error resolving stream: ${err.message}`);
      return null;
    }
  }
}

export const resolveFzMoviesStream = async (
  title: string,
  year?: string,
  imdbId?: string,
  mediaType: 'movie' | 'tv' | 'anime' = 'movie'
): Promise<FzMoviesStreamResult | null> => {
  // Web Series Guard: FzMovies stores movies ONLY, return null for TV series
  if (mediaType === 'tv' || mediaType === 'anime') {
    return null;
  }
  const resolver = new FzMoviesResolver();
  return resolver.resolveMovieStream(title, year, imdbId, mediaType);
};
