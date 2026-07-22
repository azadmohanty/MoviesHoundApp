import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TMDBMediaItem {
  id: number;
  title: string;
  posterUrl: string;
  backdropUrl: string;
  releaseDate: string;
  overview: string;
  mediaType: 'movie' | 'tv';
  rating: number;
}

export interface TMDBConfig {
  apiKey: string | null;
  apiBase: string;
  imageBase: string;
}

export const getTMDBConfig = async (): Promise<TMDBConfig> => {
  let apiKey = await AsyncStorage.getItem('@movieshound_tmdb_key');
  if (!apiKey || apiKey.trim() === '') {
    apiKey = process.env.EXPO_PUBLIC_TMDB_API_KEY || ''; // Load from local .env fallback
  }
  const proxyEnabled = await AsyncStorage.getItem('@movieshound_tmdb_proxy_enabled') === 'true';
  const customApi = await AsyncStorage.getItem('@movieshound_tmdb_proxy_api');
  const customImage = await AsyncStorage.getItem('@movieshound_tmdb_proxy_image');

  // If proxy is enabled, we map the base url. We ensure wmdb proxy has /3 appended if it doesn't.
  let apiBase = proxyEnabled ? (customApi || 'https://tmdb-api.wmdb.tv') : 'https://api.tmdb.org/3';
  if (proxyEnabled && !customApi) {
    // wmdb.tv requires /3 for standard v3 endpoints, so let's append it
    apiBase = 'https://tmdb-api.wmdb.tv/3';
  }

  const imageBase = proxyEnabled ? (customImage || 'https://images.tmdb.one/t/p') : 'https://image.tmdb.org/t/p';

  return { apiKey, apiBase, imageBase };
};

// Helper for fetch calls
const fetchFromTMDB = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const config = await getTMDBConfig();
  if (!config.apiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const urlParams = new URLSearchParams({
    language: 'en-US',
    ...params
  });

  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  let url = '';

  // If the key is long (Access Token JWT format), pass it as Bearer header.
  // This bypasses India ISP DPI blocks on the "api_key=" query parameter.
  if (config.apiKey.length > 50) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
    url = `${config.apiBase}${endpoint}?${urlParams.toString()}`;
  } else {
    // Fallback to query parameter v3 key (which will block in India, but works elsewhere)
    urlParams.append('api_key', config.apiKey);
    url = `${config.apiBase}${endpoint}?${urlParams.toString()}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status}`);
  }
  return response.json();
};

const mapMediaItem = (item: any, mediaType: 'movie' | 'tv', imageBase: string): TMDBMediaItem => {
  const title = item.title || item.name || 'Untitled';
  const releaseDate = item.release_date || item.first_air_date || 'N/A';
  return {
    id: item.id,
    title,
    posterUrl: item.poster_path ? `${imageBase}/w342${item.poster_path}` : 'https://via.placeholder.com/342x513?text=No+Poster',
    backdropUrl: item.backdrop_path ? `${imageBase}/w780${item.backdrop_path}` : 'https://via.placeholder.com/780x439?text=No+Image',
    releaseDate,
    overview: item.overview || '',
    mediaType,
    rating: item.vote_average || 0
  };
};

export const getTrendingMovies = async (): Promise<TMDBMediaItem[]> => {
  const config = await getTMDBConfig();
  const data = await fetchFromTMDB('/trending/movie/day');
  return (data.results || []).map((item: any) => mapMediaItem(item, 'movie', config.imageBase));
};

export const getTrendingTVShows = async (): Promise<TMDBMediaItem[]> => {
  const config = await getTMDBConfig();
  const data = await fetchFromTMDB('/trending/tv/day');
  return (data.results || []).map((item: any) => mapMediaItem(item, 'tv', config.imageBase));
};

export const getBollywoodMovies = async (): Promise<TMDBMediaItem[]> => {
  const config = await getTMDBConfig();
  const data = await fetchFromTMDB('/discover/movie', {
    with_original_language: 'hi',
    sort_by: 'popularity.desc',
    region: 'IN'
  });
  return (data.results || []).map((item: any) => mapMediaItem(item, 'movie', config.imageBase));
};

export const getPersonalizedTMDBRecommendations = async (
  clickHistory: { id: number; type: 'movie' | 'tv' }[]
): Promise<TMDBMediaItem[]> => {
  const config = await getTMDBConfig();
  
  // If there's no watch history, fall back to trending movies
  if (!clickHistory || clickHistory.length === 0) {
    return getTrendingMovies();
  }

  // Get recommendations for the last 2 clicked items
  const recentHistory = clickHistory.slice(0, 2);
  const results: TMDBMediaItem[] = [];

  const promises = recentHistory.map(async (historyItem) => {
    try {
      const endpoint = `/${historyItem.type}/${historyItem.id}/recommendations`;
      const data = await fetchFromTMDB(endpoint);
      const mapped = (data.results || [])
        .slice(0, 5)
        .map((item: any) => mapMediaItem(item, historyItem.type, config.imageBase));
      results.push(...mapped);
    } catch (e) {
      console.warn(`Error loading recommendations for ${historyItem.type} ${historyItem.id}:`, e);
    }
  });

  await Promise.all(promises);

  // If recommendations fetch failed or returned nothing, load trending
  if (results.length === 0) {
    return getTrendingMovies();
  }

  // Remove duplicates
  const unique = new Map<number, TMDBMediaItem>();
  results.forEach(item => unique.set(item.id, item));
  return Array.from(unique.values());
};

export const getIMDbId = async (id: number, mediaType: 'movie' | 'tv'): Promise<string | null> => {
  try {
    const data = await fetchFromTMDB(`/${mediaType}/${id}/external_ids`);
    return data.imdb_id || null;
  } catch (e) {
    console.warn(`Failed to fetch IMDb ID for ${mediaType} ${id}:`, e);
    return null;
  }
};

export const TMDB_GENRES: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Drama: 18,
  Horror: 27,
  Romance: 10749,
  SciFi: 878,
  Thriller: 53,
};

export const discoverMediaByGenre = async (
  genreId?: number,
  page: number = 1,
  year?: number,
  sortBy: string = 'popularity.desc'
): Promise<TMDBMediaItem[]> => {
  const config = await getTMDBConfig();
  let endpoint = `/discover/movie?sort_by=${sortBy}&page=${page}`;
  if (genreId) {
    endpoint += `&with_genres=${genreId}`;
  }
  if (year) {
    endpoint += `&primary_release_year=${year}`;
  }
  const data = await fetchFromTMDB(endpoint);
  return (data.results || []).map((item: any) => mapMediaItem(item, 'movie', config.imageBase));
};
