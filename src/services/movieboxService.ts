/**
 * 🎬 MovieBox REST API Service for HoloGram
 * Pure JSON REST client for MovieBox's official H5 BFF cluster (h5-api.aoneroom.com)
 */

const API_BASE = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
const DEFAULT_GATEWAY = 'https://netfilm.world';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'Referer': 'https://moviebox.ph/',
  'Origin': 'https://moviebox.ph',
  'X-Client-Info': '{"timezone":"Asia/Dhaka"}',
  'X-Request-Lang': 'en',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

export interface MovieBoxDub {
  subject_id: string;
  language_name: string;
  is_original: boolean;
}

export interface MovieBoxSubject {
  title: string;
  poster_url: string;
  slug: string;
  subject_id: string;
  badge?: string;
  rating?: number | string;
  year?: string;
  genre?: string;
  description?: string;
}

export interface MovieBoxSection {
  section: string;
  count: number;
  items: MovieBoxSubject[];
}

export interface MovieBoxStreamSource {
  resolution: string;
  format: string;
  url: string;
  size?: number;
  duration?: number;
  codec?: string;
}

export interface MovieBoxCaption {
  language: string;
  name: string;
  url: string;
  format: string;
}

export interface MovieBoxEpisode {
  episodeNumber: number;
  title: string;
  duration?: number;
  poster_url?: string;
}

export interface MovieBoxSeason {
  seasonNumber: number;
  episodes: MovieBoxEpisode[];
}

export interface MovieBoxDetail {
  title: string;
  subject_id: string;
  slug: string;
  poster_url: string;
  backdrop_url?: string;
  rating?: number | string;
  release_date?: string;
  overview?: string;
  genres?: string[];
  dubs: MovieBoxDub[];
  seasons: MovieBoxSeason[];
  is_series: boolean;
  total_episodes?: number;
}

class MovieBoxService {
  private bearerToken: string | null = null;
  private playerDomain: string = DEFAULT_GATEWAY;

  /**
   * Acquire or refresh guest JWT token from /home x-user header
   */
  async getGuestToken(forceRefresh: boolean = false): Promise<string> {
    if (this.bearerToken && !forceRefresh) {
      return this.bearerToken;
    }

    try {
      const response = await fetch(`${API_BASE}/home?host=moviebox.ph`, {
        method: 'GET',
        headers: DEFAULT_HEADERS,
      });

      const xUser = response.headers.get('x-user') || response.headers.get('X-User');
      if (xUser) {
        try {
          const parsed = JSON.parse(xUser);
          if (parsed?.token) {
            this.bearerToken = parsed.token;
            return this.bearerToken;
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('[MovieBoxService] Error acquiring guest token:', e);
    }

    return this.bearerToken || '';
  }

  private async request<T>(path: string, method: string = 'GET', body?: any, retry: boolean = true): Promise<T | null> {
    const token = await this.getGuestToken();
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const resJson = await response.json();

      if (resJson?.code === 400 && resJson?.message?.includes('token') && retry) {
        this.bearerToken = null;
        await this.getGuestToken(true);
        return this.request<T>(path, method, body, false);
      }

      if (!response.ok) {
        console.warn(`[MovieBoxService] HTTP ${response.status} for ${path}:`, resJson?.message);
        return null;
      }

      return resJson as T;
    } catch (e) {
      console.warn(`[MovieBoxService] Request failed for ${path}:`, e);
      return null;
    }
  }

  /**
   * Fetch Dynamic Streaming Player Domain
   */
  async getPlayerDomain(): Promise<string> {
    try {
      const res = await this.request<{ data: string }>('/media-player/get-domain');
      if (res?.data) {
        this.playerDomain = res.data.replace(/\/+$/, '');
      }
    } catch {
      // fallback
    }
    return this.playerDomain;
  }

  /**
   * 🏠 Get Homepage Sections & Featured Banners
   */
  async getHomeFeed(): Promise<MovieBoxSection[]> {
    const res = await this.request<any>('/home?host=moviebox.ph');
    if (!res?.data?.operatingList) return [];

    const sections: MovieBoxSection[] = [];
    for (const op of res.data.operatingList) {
      const opType = op.type;
      const title = op.title || 'Featured';

      if (opType === 'BANNER') {
        const items: MovieBoxSubject[] = (op.banner?.items || [])
          .filter((it: any) => it?.title && !it.title.includes('Communities'))
          .map((it: any) => ({
            title: it.title || it.subject?.title || 'Unknown',
            poster_url: it.image?.url || it.subject?.cover?.url || '',
            slug: it.detailPath || it.subject?.detailPath || '',
            subject_id: String(it.subject?.subjectId || ''),
            badge: it.subject?.corner || '',
          }))
          .filter((it: MovieBoxSubject) => it.slug && it.slug.length > 0);
        if (items.length > 0) {
          sections.push({ section: 'Featured Banners', count: items.length, items });
        }
      } else if (['SUBJECTS_MOVIE', 'SUBJECTS_TV', 'SUBJECTS_ANIMATION'].includes(opType)) {
        const items: MovieBoxSubject[] = (op.subjects || [])
          .map((sub: any) => ({
            title: sub.title || 'Unknown',
            poster_url: sub.cover?.url || '',
            slug: sub.detailPath || '',
            subject_id: String(sub.subjectId || ''),
            badge: sub.corner || '',
            rating: sub.imdbRatingValue,
            year: sub.releaseDate ? sub.releaseDate.substring(0, 4) : undefined,
          }))
          .filter((it: MovieBoxSubject) => it.slug && it.slug.length > 0);
        if (items.length > 0) {
          sections.push({ section: title, count: items.length, items });
        }
      }
    }

    return sections;
  }

  /**
   * 📱 Get Filtered Category Subjects (Movies, TV, Anime)
   */
  async getCategorySubjects(tabId: number, page: number = 1, sort: string = 'RECOMMEND'): Promise<MovieBoxSubject[]> {
    const res = await this.request<any>('/subject/filter', 'POST', {
      tabId,
      filter: { sort, genre: 'ALL', country: 'ALL', year: 'ALL', language: 'ALL' },
      page,
      perPage: 24,
    });

    const inner = res?.data || {};
    const rawItems = inner.items || inner.subjects || [];
    return rawItems
      .map((sub: any) => ({
        title: sub.title || 'Unknown',
        poster_url: sub.cover?.url || '',
        slug: sub.detailPath || '',
        subject_id: String(sub.subjectId || ''),
        badge: sub.corner || '',
        rating: sub.imdbRatingValue,
        year: sub.releaseDate ? sub.releaseDate.substring(0, 4) : undefined,
      }))
      .filter((it: MovieBoxSubject) => it.slug && it.slug.length > 0);
  }

  /**
   * 🔍 Search MovieBox Catalog
   */
  async search(query: string, page: number = 1): Promise<MovieBoxSubject[]> {
    if (!query.trim()) return [];

    const res = await this.request<any>('/subject/search', 'POST', {
      keyword: query.trim(),
      page,
      perPage: 20,
    });

    const inner = res?.data || {};
    const raw = inner.items || inner.list || [];
    return raw
      .map((sub: any) => ({
        title: sub.title || 'Unknown',
        poster_url: sub.cover?.url || '',
        slug: sub.detailPath || '',
        subject_id: String(sub.subjectId || ''),
        badge: sub.corner || '',
        rating: sub.imdbRatingValue,
        year: sub.releaseDate ? sub.releaseDate.substring(0, 4) : undefined,
      }))
      .filter((it: MovieBoxSubject) => it.slug && it.slug.length > 0);
  }

  /**
   * ⚡ Instant Autocomplete Suggestions
   */
  async getSuggestions(query: string): Promise<{ title: string; slug: string; subject_id: string }[]> {
    if (!query.trim()) return [];

    const res = await this.request<any>('/subject/search-suggest', 'POST', {
      keyword: query.trim(),
      perPage: 8,
    });

    const inner = res?.data || {};
    const raw = inner.items || inner.list || [];
    return raw
      .map((item: any) => {
        const sub = item.subject || {};
        return {
          title: sub.title || item.word || item.title || '',
          slug: sub.detailPath || item.detailPath || '',
          subject_id: String(sub.subjectId || item.subjectId || ''),
        };
      })
      .filter((s: { title: string; slug: string }) => s.title.length > 0 && s.slug.length > 0);
  }

  /**
   * 🗃️ Deep Metadata, Language Dubs & Season/Episode Trees
   */
  async getDetail(slug: string): Promise<MovieBoxDetail | null> {
    if (!slug) return null;

    const res = await this.request<any>(`/detail?detailPath=${encodeURIComponent(slug)}`);
    const data = res?.data;
    if (!data) return null;

    const sub = data.subject || data;
    const resource = data.resource || {};
    const rawSeasons = resource.seasons || data.seasons || [];

    // Parse language dubs list
    const rawDubs = sub.dubs || [];
    const dubs: MovieBoxDub[] = rawDubs.map((d: any) => ({
      subject_id: String(d.subjectId || ''),
      language_name: d.lanName || 'Original',
      is_original: !!d.original,
    }));

    const seasons: MovieBoxSeason[] = [];
    if (Array.isArray(rawSeasons) && rawSeasons.length > 0) {
      for (const s of rawSeasons) {
        const seasonNum = s.se || s.seasonNumber || 1;
        const maxEp = s.maxEp || s.episodes?.length || 1;
        const epList: MovieBoxEpisode[] = [];

        if (s.episodes && Array.isArray(s.episodes) && s.episodes.length > 0) {
          for (const ep of s.episodes) {
            epList.push({
              episodeNumber: ep.episodeNumber || ep.ep || 1,
              title: ep.title || `Episode ${ep.episodeNumber || ep.ep || 1}`,
              duration: ep.duration,
              poster_url: ep.cover?.url || sub.cover?.url || '',
            });
          }
        } else {
          for (let e = 1; e <= maxEp; e++) {
            epList.push({
              episodeNumber: e,
              title: `Episode ${e}`,
              poster_url: sub.cover?.url || '',
            });
          }
        }

        seasons.push({ seasonNumber: seasonNum, episodes: epList });
      }
    }

    const isSeries = sub.subjectType === 2 || seasons.length > 0 || (sub.season && sub.season > 0);

    return {
      title: sub.title || 'Unknown',
      subject_id: String(sub.subjectId || ''),
      slug: sub.detailPath || slug,
      poster_url: sub.cover?.url || '',
      backdrop_url: sub.stills && sub.stills.length > 0 ? sub.stills[0].url : sub.cover?.url || '',
      rating: sub.imdbRatingValue,
      release_date: sub.releaseDate,
      overview: sub.description || sub.summary || '',
      genres: sub.genre ? sub.genre.split(',').map((g: string) => g.trim()) : [],
      dubs,
      seasons,
      is_series: isSeries,
      total_episodes: seasons.reduce((acc, s) => acc + s.episodes.length, 0),
    };
  }

  /**
   * ▶️ Direct Stream URL Discovery (1080p, 720p, 480p MP4 & HLS)
   */
  async getStreamSources(
    subjectId: string,
    detailPath: string,
    se: number = 1,
    ep: number = 1
  ): Promise<{ sources: MovieBoxStreamSource[]; playerDomain: string; hasResource: boolean }> {
    const domain = await this.getPlayerDomain();
    const token = await this.getGuestToken();

    const playerReferer = `${domain}/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`;
    const playUrl = `${domain}/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${detailPath}`;

    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      Referer: playerReferer,
      'X-Client-Info': '{"timezone":"Asia/Dhaka"}',
      Authorization: `Bearer ${token}`,
    };

    try {
      const response = await fetch(playUrl, { method: 'GET', headers });
      if (!response.ok) {
        return { sources: [], playerDomain: domain, hasResource: false };
      }

      const res = await response.json();
      const playData = res?.data || {};
      const hasResource = playData.hasResource || false;
      const rawStreams = playData.streams || [];

      const sources: MovieBoxStreamSource[] = rawStreams.map((s: any) => ({
        resolution: s.resolutions ? `${s.resolutions}p` : 'HD',
        format: s.format || 'MP4',
        url: s.url,
        size: s.size,
        duration: s.duration,
        codec: s.codecName || 'h264',
      }));

      if (playData.hls && playData.hls.length > 0) {
        for (const h of playData.hls) {
          if (h.url) {
            sources.push({
              resolution: h.resolutions ? `${h.resolutions}p` : 'Auto HLS',
              format: 'HLS',
              url: h.url,
              codec: h.codecName,
            });
          }
        }
      }

      return { sources, playerDomain: domain, hasResource };
    } catch (e) {
      console.warn('[MovieBoxService] Stream resolution failed:', e);
      return { sources: [], playerDomain: domain, hasResource: false };
    }
  }

  /**
   * 💬 Subtitle Tracks Discovery
   */
  async getCaptions(subjectId: string, detailPath: string, se: number = 1, ep: number = 1): Promise<MovieBoxCaption[]> {
    const token = await this.getGuestToken();
    const capUrl = `${API_BASE}/subject/caption?format=MP4&id=0&subjectId=${subjectId}&detailPath=${detailPath}&se=${se}&ep=${ep}`;

    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${token}`,
    };

    try {
      const response = await fetch(capUrl, { method: 'GET', headers });
      if (!response.ok) return [];

      const data = await response.json();
      const inner = data?.data || {};
      const captions = inner.captions || (Array.isArray(inner) ? inner : []);

      return captions.map((c: any) => ({
        language: c.language || c.lang || 'en',
        name: c.name || c.language || 'English',
        url: c.url || '',
        format: c.format || 'vtt',
      }));
    } catch {
      return [];
    }
  }
}

export const movieboxService = new MovieBoxService();
