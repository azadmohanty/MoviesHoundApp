import AsyncStorage from '@react-native-async-storage/async-storage';

export type StreamResult = {
  streamUrl: string;
  sourceName: string;
};

export const resolveStreamUrl = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv' | 'anime',
  season: number = 1,
  episode: number = 1
): Promise<StreamResult | null> => {
  try {
    // 1. Check cached domains for vidsrc base URL
    const domainsRaw = await AsyncStorage.getItem('@movieshound_domains_cache');
    let vidsrcBase = 'https://vidsrc.sbs';
    if (domainsRaw) {
      const parsed = JSON.parse(domainsRaw);
      if (parsed.domains && parsed.domains.vidsrc) {
        vidsrcBase = parsed.domains.vidsrc.replace(/\/$/, '');
      }
    }

    // 2. Build target stream URL
    let targetUrl = '';
    if (mediaType === 'movie') {
      targetUrl = `${vidsrcBase}/embed/movie/${tmdbId}`;
    } else if (mediaType === 'tv') {
      targetUrl = `${vidsrcBase}/embed/tv/${tmdbId}/${season}/${episode}`;
    } else {
      // For anime, fallback to vidsrc movie/tv embed
      targetUrl = `${vidsrcBase}/embed/movie/${tmdbId}`;
    }

    return {
      streamUrl: targetUrl,
      sourceName: 'VidSrc Direct Stream'
    };
  } catch (error) {
    console.warn('Error resolving stream URL:', error);
    return null;
  }
};
