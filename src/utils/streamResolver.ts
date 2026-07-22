import AsyncStorage from '@react-native-async-storage/async-storage';

export type StreamResult = {
  streamUrl: string;
  sourceName: string;
  isDirectStream?: boolean;
};

export const getStreamServerUrl = (
  serverIndex: number,
  tmdbId: number,
  mediaType: 'movie' | 'tv' | 'anime',
  season: number = 1,
  episode: number = 1,
  vidsrcBase: string = 'https://vidsrc2.ru'
): string => {
  const cleanBase = vidsrcBase.replace(/\/$/, '');
  
  if (serverIndex === 1) {
    return mediaType === 'tv'
      ? `${cleanBase}/embed/tv/${tmdbId}/${season}/${episode}?color=FF2D55&autoplay=1`
      : `${cleanBase}/embed/movie/${tmdbId}?color=FF2D55&autoplay=1`;
  }
  if (serverIndex === 2) {
    return mediaType === 'tv'
      ? `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.to/embed/movie/${tmdbId}`;
  }
  if (serverIndex === 3) {
    return mediaType === 'tv'
      ? `https://vidsrc.xyz/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.xyz/embed/movie/${tmdbId}`;
  }
  if (serverIndex === 4) {
    return mediaType === 'tv'
      ? `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
      : `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`;
  }
  if (serverIndex === 5) {
    return mediaType === 'tv'
      ? `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${season}&episode=${episode}`
      : `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}`;
  }
  if (serverIndex === 6) {
    return mediaType === 'tv'
      ? `https://vsrc.su/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vsrc.su/embed/movie/${tmdbId}`;
  }
  return '';
};

export const resolveStreamUrl = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv' | 'anime',
  season: number = 1,
  episode: number = 1,
  serverIndex: number = 1
): Promise<StreamResult | null> => {
  try {
    const domainsRaw = await AsyncStorage.getItem('@movieshound_domains_cache');
    let vidsrcBase = 'https://vidsrc2.ru';
    if (domainsRaw) {
      const parsed = JSON.parse(domainsRaw);
      if (parsed.domains && parsed.domains.vidsrc) {
        vidsrcBase = parsed.domains.vidsrc.replace(/\/$/, '');
      }
    }

    const targetUrl = getStreamServerUrl(serverIndex, tmdbId, mediaType, season, episode, vidsrcBase);

    return {
      streamUrl: targetUrl,
      sourceName: `Server ${serverIndex}`,
      isDirectStream: false
    };
  } catch (error) {
    console.warn('Error resolving stream URL:', error);
    return null;
  }
};
