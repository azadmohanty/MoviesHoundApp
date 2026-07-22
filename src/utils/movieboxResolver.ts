export type MovieBoxStream = {
  url: string;
  resolution: number;
  qualityLabel: string;
  language?: string;
};

export const resolveMovieBoxStream = async (
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  season: number = 1,
  episode: number = 1
): Promise<MovieBoxStream | null> => {
  const HOST = 'h5-api.aoneroom.com';
  const BASE_URL = `https://${HOST}`;

  try {
    // 1. Fetch Auth Token
    const pkgRes = await fetch(`${BASE_URL}/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    });

    const xUser = pkgRes.headers.get('x-user');
    if (!xUser) return null;

    const tokenObj = JSON.parse(xUser);
    const token = tokenObj.token;
    if (!token) return null;

    const headers: Record<string, string> = {
      'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept': 'application/json',
      'Referer': BASE_URL,
      'Host': HOST,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
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
    const items = searchData.data?.data?.items || searchData.data?.items || [];
    if (!items || items.length === 0) return null;

    const subjectId = items[0].subjectId;
    const matchedTitle = items[0].title || cleanTitle;

    // 3. Resolve Detail Path
    const detailRes = await fetch(`https://h5.aoneroom.com/wefeed-h5-bff/web/post/list/subject?id=${subjectId}`);
    const detailData = await detailRes.json();
    const detailPath = detailData.data?.items?.[0]?.subject?.detailPath || '';

    // 4. Fetch Direct MP4 Streams
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
    if (!downloads || downloads.length === 0) return null;

    // Sort downloads by resolution descending (1080p > 720p > 480p)
    downloads.sort((a: any, b: any) => (b.resolution || 0) - (a.resolution || 0));
    const bestStream = downloads[0];

    return {
      url: bestStream.url,
      resolution: bestStream.resolution || 720,
      qualityLabel: `MovieBox ${bestStream.resolution || 720}p MP4`,
      language: matchedTitle.includes('[Hindi]') ? 'Hindi' : 'Original'
    };
  } catch (e) {
    console.warn('Error resolving MovieBox stream:', e);
    return null;
  }
};
