export interface AniListAnimeItem {
  id: number;
  title: string;
  posterUrl: string;
  backdropUrl: string;
  releaseDate: string;
  overview: string;
  rating: number;
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
  const title = media.title.english || media.title.romaji || 'Untitled';
  const releaseDate = media.startDate && media.startDate.year ? String(media.startDate.year) : 'N/A';
  return {
    id: media.id,
    title,
    posterUrl: media.coverImage.extraLarge || media.coverImage.large || 'https://via.placeholder.com/342x513?text=No+Cover',
    backdropUrl: media.bannerImage || 'https://via.placeholder.com/780x439?text=No+Banner',
    releaseDate,
    overview: media.description ? media.description.replace(/<[^>]*>/g, '') : '', // strip HTML tags
    rating: media.averageScore ? media.averageScore / 10 : 0 // AniList scores are out of 100, normalize to 10
  };
};

export const getTrendingAnime = async (): Promise<AniListAnimeItem[]> => {
  const query = `
    query {
      Page(page: 1, perPage: 10) {
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
      Page(page: 1, perPage: 10) {
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
        }
      }
    }
  `;

  const data = await runAniListQuery(query);
  return (data.Page.media || []).map(mapAnimeItem);
};

export const getPersonalizedAnimeRecommendations = async (
  clickHistory: number[]
): Promise<AniListAnimeItem[]> => {
  if (!clickHistory || clickHistory.length === 0) {
    return getTrendingAnime();
  }

  // Get recommendations based on the last clicked anime ID
  const recentAnimeId = clickHistory[0];
  const query = `
    query($id: Int) {
      Media(id: $id) {
        recommendations(limit: 6, sort: RATING_DESC) {
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
            }
          }
        }
      }
    }
  `;

  try {
    const data = await runAniListQuery(query, { id: recentAnimeId });
    const nodes = data.Media?.recommendations?.nodes || [];
    const recommended = nodes
      .map((node: any) => node.mediaRecommendation)
      .filter((media: any) => media !== null)
      .map(mapAnimeItem);

    if (recommended.length > 0) {
      return recommended;
    }
  } catch (e) {
    console.warn('Failed to fetch anime recommendations:', e);
  }

  return getTrendingAnime();
};
