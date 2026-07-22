import { getImdbId } from './tmdb';

export type TorrentioStream = {
  url: string;
  qualityLabel: string;
  title?: string;
};

export const resolveTorrentioStream = async (
  tmdbId: number,
  mediaType: 'movie' | 'tv' = 'movie',
  season: number = 1,
  episode: number = 1
): Promise<TorrentioStream | null> => {
  try {
    const imdbId = await getImdbId(tmdbId, mediaType);
    if (!imdbId) return null;

    const endpoint = mediaType === 'tv'
      ? `https://torrentio.strem.fun/limit=4/stream/series/${imdbId}:${season}:${episode}.json`
      : `https://torrentio.strem.fun/limit=4/stream/movie/${imdbId}.json`;

    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const data = await res.json();
    const streams = data.streams || [];
    if (streams.length === 0) return null;

    const topStream = streams[0];
    let streamUrl = topStream.url;

    if (!streamUrl && topStream.infoHash) {
      streamUrl = `https://torrentio.strem.fun/stream/${topStream.infoHash}.m3u8`;
    }

    if (!streamUrl) return null;

    return {
      url: streamUrl,
      qualityLabel: topStream.name || 'Torrentio HLS',
      title: topStream.title || ''
    };
  } catch (e) {
    console.warn('Error resolving Torrentio stream:', e);
    return null;
  }
};
