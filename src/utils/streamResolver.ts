import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveMovieBoxStream } from './movieboxResolver';
import { resolveTorrentioStream } from './torrentioResolver';

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
    // Torrentio / AutoEmbed (Dynamically resolved)
    return `torrentio://${tmdbId}`;
  }
  if (serverIndex === 3) {
    // SuperEmbed Simple Player (Native multi-server iframe: Blogger, Streamtape, etc.)
    return mediaType === 'tv'
      ? `${cleanSuper}/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
      : `${cleanSuper}/?video_id=${tmdbId}&tmdb=1`;
  }
  if (serverIndex === 4) {
    // SuperEmbed VIP Directstream
    return mediaType === 'tv'
      ? `${cleanSuper}/directstream.php?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
      : `${cleanSuper}/directstream.php?video_id=${tmdbId}&tmdb=1`;
  }
  if (serverIndex === 5) {
    // Vidsrc CC / AnyEmbed Embedded Player
    return mediaType === 'tv'
      ? `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
  }
  return '';
};

export const resolveStreamUrl = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv' | 'anime',
  title: string = '',
  season: number = 1,
  episode: number = 1,
  serverIndex: number = 1
): Promise<StreamResult | null> => {
  try {
    // Server 1: MovieBox Direct MP4
    if (serverIndex === 1 && title) {
      const mbStream = await resolveMovieBoxStream(title, mediaType === 'tv' ? 'tv' : 'movie', season, episode);
      if (mbStream) {
        return {
          streamUrl: mbStream.url,
          sourceName: mbStream.qualityLabel || 'Server 1 (MovieBox MP4)',
          isDirectStream: true
        };
      }
    }

    // Server 2: Torrentio HLS Stream
    if (serverIndex === 2) {
      const torStream = await resolveTorrentioStream(tmdbId, mediaType === 'tv' ? 'tv' : 'movie', season, episode);
      if (torStream) {
        return {
          streamUrl: torStream.url,
          sourceName: torStream.qualityLabel || 'Server 2 (Torrentio HLS)',
          isDirectStream: true
        };
      }
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
