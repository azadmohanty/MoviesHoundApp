export type MovieBoxStream = {
  url: string;
  resolution: number;
  qualityLabel: string;
  language?: string;
  availableLanguages?: string[];
};

// Helper: Normalize title by removing tags like [Hindi], S1-S4, (2024)
const normalizeTitle = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, '') // remove [Hindi], (2024)
    .replace(/\bs\d+(-\s*s?\d+)?\b/gi, '') // remove S1-S4, S2
    .replace(/[^a-z0-9\s]/gi, '') // remove special punctuation
    .replace(/\s+/g, ' ')
    .trim();
};

// Helper: Strict title similarity scoring
const checkTitleRelevance = (query: string, candidate: string): boolean => {
  const normQuery = normalizeTitle(query);
  const normCandidate = normalizeTitle(candidate);

  if (normQuery === normCandidate) return true;
  if (normCandidate.includes(normQuery) || normQuery.includes(normCandidate)) return true;

  const queryWords = normQuery.split(' ').filter(w => w.length > 2);
  const candidateWords = normCandidate.split(' ').filter(w => w.length > 2);

  if (queryWords.length === 0) return false;

  // The first main word of the query MUST be present in candidate (prevents "Bhooth Bangla" -> "Baahubali 2 Bangla")
  const firstWord = queryWords[0];
  if (!normCandidate.includes(firstWord)) {
    return false;
  }

  // Count matching words
  const matches = queryWords.filter(qw => candidateWords.some(cw => cw.includes(qw) || qw.includes(cw)));
  const matchRatio = matches.length / queryWords.length;

  return matchRatio >= 0.65;
};

export const resolveMovieBoxStream = async (
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  season: number = 1,
  episode: number = 1,
  preferredLanguage: string = 'Original'
): Promise<MovieBoxStream | null> => {
  const HOST = 'h5-api.aoneroom.com';
  const BASE_URL = `https://${HOST}`;

  try {
    console.log(`[MovieBox Resolver] Initiating search for: "${title}" (Type: ${mediaType} S${season}E${episode}, PrefLang: ${preferredLanguage})`);

    // 1. Fetch Auth Token
    const pkgRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    let token = '';

    try {
      let xUser = '';
      if (pkgRes.headers && typeof pkgRes.headers.get === 'function') {
        xUser = pkgRes.headers.get('x-user') || pkgRes.headers.get('X-User') || '';
      }
      if (!xUser && (pkgRes.headers as any)?.map) {
        xUser = (pkgRes.headers as any).map['x-user'] || (pkgRes.headers as any).map['X-User'] || '';
      }

      if (xUser) {
        const tokenObj = typeof xUser === 'string' ? JSON.parse(xUser) : xUser;
        token = tokenObj.token || tokenObj.Token || '';
      }
    } catch (e) {}

    if (!token) {
      try {
        let cookieHeader = '';
        if (pkgRes.headers && typeof pkgRes.headers.get === 'function') {
          cookieHeader = pkgRes.headers.get('set-cookie') || pkgRes.headers.get('Set-Cookie') || '';
        }
        const match = cookieHeader.match(/token=([^;]+)/);
        if (match) token = match[1];
      } catch (e) {}
    }

    if (!token) {
      token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjM2NzAxNzY4NzYwNTM1NDg3OTIsImF0cCI6MywiZXh0IjoiMTc4NDc3NjQ2MiIsImV4cCI6MTc5MjU1MjQ2MiwiaWF0IjoxNzg0Nzc2MTYyfQ.wGXn0qL0KGc8OuQIKGXITgWpDagZpLhF5iEoH6BhxQw';
    }

    const headers: Record<string, string> = {
      'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const subjectType = mediaType === 'tv' ? 2 : 1;
    const cleanTitle = title.replace(/\s*\(\d{4}\)$/, '').trim();

    // 2. Search Subject
    const searchRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/subject/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        keyword: cleanTitle,
        page: 1,
        perPage: 10,
        subjectType
      })
    });

    const searchData = await searchRes.json();
    const items: any[] = searchData.data?.data?.items || searchData.data?.items || [];
    console.log(`[MovieBox Step 2] Items found: ${items.length} for "${cleanTitle}"`);

    if (!items || items.length === 0) return null;

    // Filter relevant candidates strictly
    const relevantCandidates = items.filter(item => item.title && checkTitleRelevance(cleanTitle, item.title));

    if (relevantCandidates.length === 0) {
      console.warn(`[MovieBox] 0 strictly relevant candidates found for: "${cleanTitle}"`);
      return null;
    }

    // Collect available languages across candidates
    const availableLangs = new Set<string>(['Original']);
    relevantCandidates.forEach(cand => {
      if (cand.title.toLowerCase().includes('[hindi]') || cand.title.toLowerCase().includes('hindi')) {
        availableLangs.add('Hindi');
      }
    });

    // Rank candidates by preferred language & TV season match
    const seasonTag = `s${season}`;
    const sortedCandidates = [...relevantCandidates].sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();

      // Language score
      const aLangMatch = preferredLanguage === 'Hindi' ? aTitle.includes('hindi') : !aTitle.includes('hindi');
      const bLangMatch = preferredLanguage === 'Hindi' ? bTitle.includes('hindi') : !bTitle.includes('hindi');
      if (aLangMatch && !bLangMatch) return -1;
      if (!aLangMatch && bLangMatch) return 1;

      // TV Season match score
      if (mediaType === 'tv') {
        const aSeasonMatch = aTitle.includes(seasonTag);
        const bSeasonMatch = bTitle.includes(seasonTag);
        if (aSeasonMatch && !bSeasonMatch) return -1;
        if (!aSeasonMatch && bSeasonMatch) return 1;
      }

      return 0;
    });

    // Loop through sorted candidates to find first working stream link
    for (let i = 0; i < Math.min(sortedCandidates.length, 5); i++) {
      const candidate = sortedCandidates[i];
      const subjectId = candidate.subjectId;
      const candidateTitle = candidate.title || cleanTitle;

      console.log(`[MovieBox Checking Candidate #${i + 1}]: "${candidateTitle}" (ID: ${subjectId})`);

      // 3. Resolve Detail Path
      const detailRes = await fetch(`https://h5.aoneroom.com/wefeed-h5-bff/web/post/list/subject?id=${subjectId}`);
      const detailData = await detailRes.json();
      const detailPath = detailData.data?.items?.[0]?.subject?.detailPath || '';

      // 4. Fetch Downloads with required FMovies Referer & Origin
      const params = mediaType === 'tv' ? `subjectId=${subjectId}&se=${season}&ep=${episode}` : `subjectId=${subjectId}`;
      const downloadHeaders: Record<string, string> = {
        ...headers,
        'Referer': `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail`,
        'Origin': 'https://fmoviesunblocked.net'
      };

      const dlRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/subject/download?${params}`, {
        headers: downloadHeaders
      });

      const dlData = await dlRes.json();
      const downloads = dlData.data?.data?.downloads || dlData.data?.downloads || [];

      if (downloads && downloads.length > 0) {
        downloads.sort((a: any, b: any) => (b.resolution || 0) - (a.resolution || 0));
        const bestStream = downloads[0];
        const currentLang = candidateTitle.toLowerCase().includes('hindi') ? 'Hindi' : 'Original';

        console.log(`[MovieBox SUCCESS] Matched candidate #${i + 1} "${candidateTitle}" (${currentLang}) -> Stream URL: ${bestStream.url.substring(0, 60)}...`);

        return {
          url: bestStream.url,
          resolution: bestStream.resolution || 720,
          qualityLabel: `MovieBox ${bestStream.resolution || 720}p MP4 (${currentLang.toUpperCase()})`,
          language: currentLang,
          availableLanguages: Array.from(availableLangs)
        };
      }
    }

    console.warn(`[MovieBox] 0 stream links found across search candidates for: "${cleanTitle}"`);
    return null;
  } catch (e: any) {
    console.error('[MovieBox Error Exception Trace]:', e.message || e);
    return null;
  }
};
