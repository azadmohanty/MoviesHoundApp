export interface AniListAnimeItem {
  id: number;
  title: string;
  posterUrl: string;
  backdropUrl: string;
  releaseDate: string;
  overview: string;
  rating: number;
  genres?: string[];
  format?: string;
}

const ANILIST_URL = 'https://graphql.anilist.co';

const runAniListQuery = async (query: string, variables: Record<string, any> = {}): Promise<any> => {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`AniList API error: ${response.status}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message || 'GraphQL Error');
  }

  return json.data;
};

const mapAnimeItem = (media: any): AniListAnimeItem => {
  const title = media.title?.english || media.title?.romaji || 'Untitled';
  const releaseDate = media.startDate && media.startDate.year ? String(media.startDate.year) : 'N/A';
  return {
    id: media.id,
    title,
    posterUrl: media.coverImage?.extraLarge || media.coverImage?.large || 'https://via.placeholder.com/342x513?text=No+Cover',
    backdropUrl: media.bannerImage || 'https://via.placeholder.com/780x439?text=No+Banner',
    releaseDate,
    overview: media.description ? media.description.replace(/<[^>]*>/g, '') : '', // strip HTML tags
    rating: media.averageScore ? media.averageScore / 10 : 0, // AniList scores are out of 100, normalize to 10
    genres: media.genres || [],
    format: media.format || 'TV'
  };
};

export const getTrendingAnime = async (): Promise<AniListAnimeItem[]> => {
  const query = `
    query {
      Page(page: 1, perPage: 15) {
        media(sort: TRENDING_DESC, type: ANIME) {
          id
          title {
            english
            romaji
          }
          coverImage {
            extraLarge
            large
          }
          bannerImage
          startDate {
            year
          }
          averageScore
          description
          genres
          format
        }
      }
    }
  `;

  const data = await runAniListQuery(query);
  return (data.Page.media || []).map(mapAnimeItem);
};

export const getPopularAnime = async (): Promise<AniListAnimeItem[]> => {
  const query = `
    query {
      Page(page: 1, perPage: 15) {
        media(sort: POPULARITY_DESC, type: ANIME) {
          id
          title {
            english
            romaji
          }
          coverImage {
            extraLarge
            large
          }
          bannerImage
          startDate {
            year
          }
          averageScore
          description
          genres
          format
        }
      }
    }
  `;

  const data = await runAniListQuery(query);
  return (data.Page.media || []).map(mapAnimeItem);
};

/**
 * Enhanced Multi-Seed Personalized Anime Recommendations.
 * Queries recommendations for the top 3 recently clicked anime,
 * deduplicates candidates, filters out already watched IDs, and ranks by score & recency.
 */
export const getPersonalizedAnimeRecommendations = async (
  clickHistory: number[]
): Promise<AniListAnimeItem[]> => {
  if (!clickHistory || clickHistory.length === 0) {
    return getTrendingAnime();
  }

  const recentIds = clickHistory.slice(0, 3);
  const results: AniListAnimeItem[] = [];

  const query = `
    query($id: Int) {
      Media(id: $id) {
        recommendations(perPage: 6, sort: RATING_DESC) {
          nodes {
            mediaRecommendation {
              id
              title {
                english
                romaji
              }
              coverImage {
                extraLarge
                large
              }
              bannerImage
              startDate {
                year
              }
              averageScore
              description
              genres
              format
            }
          }
        }
      }
    }
  `;

  const fetchPromises = recentIds.map(async (animeId) => {
    try {
      const data = await runAniListQuery(query, { id: animeId });
      const nodes = data.Media?.recommendations?.nodes || [];
      const recommended = nodes
        .map((node: any) => node.mediaRecommendation)
        .filter((media: any) => media !== null)
        .map(mapAnimeItem);
      results.push(...recommended);
    } catch (e) {
      console.warn(`Failed to fetch anime recommendations for ID ${animeId}:`, e);
    }
  });

  await Promise.all(fetchPromises);

  if (results.length === 0) {
    return getTrendingAnime();
  }

  // Deduplicate and filter out already clicked anime
  const uniqueMap = new Map<number, AniListAnimeItem>();
  results.forEach((item) => {
    if (!clickHistory.includes(item.id) && !uniqueMap.has(item.id)) {
      uniqueMap.set(item.id, item);
    }
  });

  const ranked = Array.from(uniqueMap.values()).sort((a, b) => (b.rating || 0) - (a.rating || 0));

  return ranked.length > 0 ? ranked : getTrendingAnime();
};
