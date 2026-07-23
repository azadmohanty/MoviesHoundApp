import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveMovieBoxStream } from './movieboxResolver';
import { resolveTorrentioStream } from './torrentioResolver';

export type StreamResult = {
  streamUrl: string;
  sourceName: string;
  isDirectStream?: boolean;
  language?: string;
  availableLanguages?: string[];
};

export const getStreamServerUrl = (
  serverIndex: number,
  tmdbId: number,
  mediaType: 'movie' | 'tv' | 'anime',
  season: number = 1,
  episode: number = 1,
  vidsrcBase: string = 'https://vidsrc2.ru',
  superembedBase: string = 'https://multiembed.mov',
  vidsrctoBase: string = 'https://vidsrc.to',
  anyembedBase: string = 'https://anyembed.xyz'
): string => {
  const cleanBase = vidsrcBase.replace(/\/$/, '');
  const cleanSuper = superembedBase.replace(/\/$/, '');
  const cleanAny = anyembedBase.replace(/\/$/, '');
  
  if (serverIndex === 1) {
    // MovieBox Direct MP4 (Dynamically resolved)
    return `moviebox://${tmdbId}`;
  }
  if (serverIndex === 2) {
    // VidSrc 2.RU (Native VidSrc embed mirror)
    return mediaType === 'tv'
      ? `${cleanBase}/embed/tv/${tmdbId}/${season}/${episode}?color=FF2D55&autoplay=1`
      : `${cleanBase}/embed/movie/${tmdbId}?color=FF2D55&autoplay=1`;
  }
  if (serverIndex === 3) {
    // SuperEmbed Player (Native multi-server iframe)
    return mediaType === 'tv'
      ? `${cleanSuper}/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
      : `${cleanSuper}/?video_id=${tmdbId}&tmdb=1`;
  }
  if (serverIndex === 4) {
    // AnyEmbed (formerly SmashyStream)
    return mediaType === 'tv'
      ? `${cleanAny}/embed/tmdb-tv-${tmdbId}-${season}-${episode}`
      : `${cleanAny}/embed/tmdb-movie-${tmdbId}`;
  }
  return '';
};

export const resolveStreamUrl = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv' | 'anime',
  title: string = '',
  season: number = 1,
  episode: number = 1,
  serverIndex: number = 1,
  preferredLanguage: string = 'Original'
): Promise<StreamResult | null> => {
  try {
    // Server 1: MovieBox Direct MP4
    if (serverIndex === 1 && title) {
      const mbStream = await resolveMovieBoxStream(
        title,
        mediaType === 'tv' ? 'tv' : 'movie',
        season,
        episode,
        preferredLanguage
      );
      if (mbStream) {
        return {
          streamUrl: mbStream.url,
          sourceName: mbStream.qualityLabel || 'Server 1 (MovieBox MP4)',
          isDirectStream: true,
          language: mbStream.language,
          availableLanguages: mbStream.availableLanguages
        };
      }
    }

    // Server 2: VidSrc 2.RU Direct Player
    if (serverIndex === 2) {
      const vidsrcUrl = mediaType === 'tv'
        ? `https://vidsrc2.ru/embed/tv/${tmdbId}/${season}/${episode}?color=FF2D55&autoplay=1`
        : `https://vidsrc2.ru/embed/movie/${tmdbId}?color=FF2D55&autoplay=1`;
      return {
        streamUrl: vidsrcUrl,
        sourceName: 'Server 2 (VidSrc 2.RU)',
        isDirectStream: false
      };
    }

    // Embed Fallbacks (Servers 3, 4, 5)
    const domainsRaw = await AsyncStorage.getItem('@movieshound_domains_cache');
    let vidsrcBase = 'https://vidsrc2.ru';
    let superembedBase = 'https://multiembed.mov';
    let vidsrctoBase = 'https://vidsrc.to';
    let anyembedBase = 'https://anyembed.xyz';

    if (domainsRaw) {
      const parsed = JSON.parse(domainsRaw);
      if (parsed.domains) {
        if (parsed.domains.vidsrc) vidsrcBase = parsed.domains.vidsrc;
        if (parsed.domains.superembed) superembedBase = parsed.domains.superembed;
        if (parsed.domains.vidsrcto) vidsrctoBase = parsed.domains.vidsrcto;
        if (parsed.domains.anyembed) anyembedBase = parsed.domains.anyembed;
      }
    }

    const targetUrl = getStreamServerUrl(
      serverIndex,
      tmdbId,
      mediaType,
      season,
      episode,
      vidsrcBase,
      superembedBase,
      vidsrctoBase,
      anyembedBase
    );

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
