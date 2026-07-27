import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDBMediaItem } from './tmdb';
import { toggleListItem, STORAGE_KEYS, getList } from './DatabaseStorage';

export interface TasteProfile {
  genreWeights: Record<number, number>;
  mediaTypeWeight: { movie: number; tv: number };
  keywordWeights?: Record<number, number>;
  likedIds: number[];
  lovedIds: number[];
  dislikedIds: number[];
  playbackStats: Record<number, { durationMinutes: number; percentCompleted: number }>;
  lastUpdatedTimestamp?: number;
}

const TASTE_KEY = '@user_taste_profile';

export async function getPersistedLikedItems(): Promise<TMDBMediaItem[]> {
  try {
    const list = await getList(STORAGE_KEYS.LIKED);
    return list.map(i => ({
      id: i.id,
      title: i.title,
      posterUrl: i.posterUrl,
      mediaType: (i.mediaType === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
      rating: i.rating || 0,
      releaseDate: i.releaseDate || '',
      overview: '',
      backdropUrl: '',
      voteCount: 0,
      voteCountFormatted: '0'
    }));
  } catch {
    return [];
  }
}

export async function savePersistedLikedItems(items: TMDBMediaItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LIKED, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to persist liked items:', err);
  }
}

const INITIAL_PROFILE: TasteProfile = {
  genreWeights: {},
  mediaTypeWeight: { movie: 0, tv: 0 },
  keywordWeights: {},
  likedIds: [],
  lovedIds: [],
  dislikedIds: [],
  playbackStats: {},
  lastUpdatedTimestamp: Date.now(),
};

export async function getTasteProfile(): Promise<TasteProfile> {
  try {
    const raw = await AsyncStorage.getItem(TASTE_KEY);
    if (!raw) return INITIAL_PROFILE;
    const parsed: TasteProfile = JSON.parse(raw);
    return {
      genreWeights: parsed.genreWeights || {},
      mediaTypeWeight: parsed.mediaTypeWeight || { movie: 0, tv: 0 },
      keywordWeights: parsed.keywordWeights || {},
      likedIds: parsed.likedIds || [],
      lovedIds: parsed.lovedIds || [],
      dislikedIds: parsed.dislikedIds || [],
      playbackStats: parsed.playbackStats || {},
      lastUpdatedTimestamp: parsed.lastUpdatedTimestamp || Date.now(),
    };
  } catch {
    return INITIAL_PROFILE;
  }
}

export async function saveTasteProfile(profile: TasteProfile): Promise<void> {
  try {
    profile.lastUpdatedTimestamp = Date.now();
    await AsyncStorage.setItem(TASTE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save taste profile:', err);
  }
}

/**
 * Calculates exponential time decay factor based on days passed.
 * Half-life of 30 days (decay lambda = 0.95^days).
 */
export function calculateTimeDecayFactor(lastUpdatedTimestamp?: number): number {
  if (!lastUpdatedTimestamp) return 1.0;
  const days = Math.max(0, (Date.now() - lastUpdatedTimestamp) / (1000 * 60 * 60 * 24));
  return Math.pow(0.95, days);
}

/**
 * Record explicit user swipe/action:
 * 'loved' (+2.0), 'liked' (+1.0), 'disliked' (-2.0)
 */
export async function recordUserAction(
  item: TMDBMediaItem,
  action: 'loved' | 'liked' | 'disliked',
  genreIds: number[] = []
): Promise<void> {
  const profile = await getTasteProfile();
  const weightDelta = action === 'loved' ? 2.0 : action === 'liked' ? 1.0 : -2.0;

  // Update Media Type preference
  if (item.mediaType === 'movie') {
    profile.mediaTypeWeight.movie = (profile.mediaTypeWeight.movie || 0) + weightDelta * 0.25;
  } else {
    profile.mediaTypeWeight.tv = (profile.mediaTypeWeight.tv || 0) + weightDelta * 0.25;
  }

  // Update Genre weights
  genreIds.forEach((gId) => {
    const current = profile.genreWeights[gId] || 0;
    profile.genreWeights[gId] = current + weightDelta;
  });

  // Track ID in profile lists
  if (action === 'loved') {
    if (!profile.lovedIds.includes(item.id)) profile.lovedIds.push(item.id);
    profile.likedIds = profile.likedIds.filter(id => id !== item.id);
    profile.dislikedIds = profile.dislikedIds.filter(id => id !== item.id);
  } else if (action === 'liked') {
    if (!profile.likedIds.includes(item.id)) profile.likedIds.push(item.id);
    profile.lovedIds = profile.lovedIds.filter(id => id !== item.id);
    profile.dislikedIds = profile.dislikedIds.filter(id => id !== item.id);
  } else if (action === 'disliked') {
    if (!profile.dislikedIds.includes(item.id)) profile.dislikedIds.push(item.id);
    profile.lovedIds = profile.lovedIds.filter(id => id !== item.id);
    profile.likedIds = profile.likedIds.filter(id => id !== item.id);
  }

  // Sync directly into DatabaseStorage user lists
  const storageItem = {
    id: item.id,
    title: item.title,
    posterUrl: item.posterUrl,
    mediaType: item.mediaType || 'movie',
    rating: item.rating,
    releaseDate: item.releaseDate
  };

  if (action === 'loved') {
    await toggleListItem(STORAGE_KEYS.LOVED, storageItem);
  } else if (action === 'liked') {
    await toggleListItem(STORAGE_KEYS.LIKED, storageItem);
  } else if (action === 'disliked') {
    await toggleListItem(STORAGE_KEYS.DISLIKED, storageItem);
  }

  await saveTasteProfile(profile);
}

/**
 * Record implicit video playback behavior
 */
export async function recordPlaybackDuration(
  item: TMDBMediaItem,
  durationMinutes: number,
  percentCompleted: number,
  genreIds: number[] = []
): Promise<void> {
  const profile = await getTasteProfile();

  let boost = 0;
  if (percentCompleted >= 85) {
    boost = 2.0;
  } else if (percentCompleted >= 50) {
    boost = 1.0;
  } else if (durationMinutes >= 5) {
    boost = 0.5;
  } else if (durationMinutes < 1 && percentCompleted < 10) {
    boost = -0.5;
  }

  if (boost !== 0 && genreIds.length > 0) {
    genreIds.forEach((gId) => {
      const current = profile.genreWeights[gId] || 0;
      profile.genreWeights[gId] = current + boost;
    });
  }

  profile.playbackStats[item.id] = { durationMinutes, percentCompleted };
  await saveTasteProfile(profile);
}

/**
 * Computes Cosine Similarity between user taste vector and candidate item feature vector.
 */
export function computeCosineSimilarity(
  userVector: Record<string, number>,
  itemVector: Record<string, number>
): number {
  let dotProduct = 0;
  let userNormSq = 0;
  let itemNormSq = 0;

  for (const key in userVector) {
    const uVal = userVector[key];
    userNormSq += uVal * uVal;
    if (key in itemVector) {
      dotProduct += uVal * itemVector[key];
    }
  }

  for (const key in itemVector) {
    const iVal = itemVector[key];
    itemNormSq += iVal * iVal;
  }

  if (userNormSq === 0 || itemNormSq === 0) return 0;
  return dotProduct / (Math.sqrt(userNormSq) * Math.sqrt(itemNormSq));
}

/**
 * Computes a Cosine Similarity match score (0-100%) for a specific item.
 */
export function computeItemMatchPercentage(
  item: TMDBMediaItem,
  profile: TasteProfile,
  genreIds: number[] = []
): number {
  if (profile.dislikedIds.includes(item.id)) return 0;

  const decay = calculateTimeDecayFactor(profile.lastUpdatedTimestamp);

  // User Sparse Vector
  const userVec: Record<string, number> = {};
  for (const gId in profile.genreWeights) {
    userVec[`g_${gId}`] = (profile.genreWeights[gId] || 0) * decay;
  }
  userVec['type_movie'] = (profile.mediaTypeWeight.movie || 0) * decay;
  userVec['type_tv'] = (profile.mediaTypeWeight.tv || 0) * decay;

  // Item Sparse Vector
  const itemVec: Record<string, number> = {};
  genreIds.forEach(gId => {
    itemVec[`g_${gId}`] = 1.0;
  });
  if (item.mediaType === 'movie') {
    itemVec['type_movie'] = 1.0;
  } else {
    itemVec['type_tv'] = 1.0;
  }

  const cosineSim = computeCosineSimilarity(userVec, itemVec);

  // If user profile is blank/new, return fallback match based on TMDB rating
  if (cosineSim === 0) {
    return Math.min(99, Math.max(60, Math.round((item.rating || 7.0) * 10)));
  }

  // Scale cosine similarity (-1.0 to 1.0) into a 50% - 99% match score
  const matchPct = Math.round(((cosineSim + 1) / 2) * 45 + 50);
  return Math.min(99, Math.max(50, matchPct));
}

/**
 * Ranks items based on Cosine Similarity + Quality Multiplier + Time Decay + Soft Serendipity Noise.
 */
export function rankItemsByTaste(
  items: TMDBMediaItem[],
  profile: TasteProfile,
  getItemGenres: (item: TMDBMediaItem) => number[] = () => []
): TMDBMediaItem[] {
  const decay = calculateTimeDecayFactor(profile.lastUpdatedTimestamp);

  // Build User Sparse Vector
  const userVec: Record<string, number> = {};
  for (const gId in profile.genreWeights) {
    userVec[`g_${gId}`] = (profile.genreWeights[gId] || 0) * decay;
  }
  userVec['type_movie'] = (profile.mediaTypeWeight.movie || 0) * decay;
  userVec['type_tv'] = (profile.mediaTypeWeight.tv || 0) * decay;

  const hasUserProfile = Object.keys(userVec).some(k => Math.abs(userVec[k]) > 0.05);

  return [...items].sort((a, b) => {
    // Hard filter out disliked items
    const aDisliked = profile.dislikedIds.includes(a.id);
    const bDisliked = profile.dislikedIds.includes(b.id);
    if (aDisliked && !bDisliked) return 1;
    if (!aDisliked && bDisliked) return -1;

    // Loved items boost
    const aLoved = profile.lovedIds.includes(a.id) ? 0.3 : 0;
    const bLoved = profile.lovedIds.includes(b.id) ? 0.3 : 0;

    let scoreA = 0;
    let scoreB = 0;

    if (hasUserProfile) {
      // Build Item A Sparse Vector
      const genresA = getItemGenres(a);
      const itemVecA: Record<string, number> = {};
      genresA.forEach(gId => (itemVecA[`g_${gId}`] = 1.0));
      itemVecA[a.mediaType === 'movie' ? 'type_movie' : 'type_tv'] = 1.0;

      // Build Item B Sparse Vector
      const genresB = getItemGenres(b);
      const itemVecB: Record<string, number> = {};
      genresB.forEach(gId => (itemVecB[`g_${gId}`] = 1.0));
      itemVecB[b.mediaType === 'movie' ? 'type_movie' : 'type_tv'] = 1.0;

      const simA = computeCosineSimilarity(userVec, itemVecA);
      const simB = computeCosineSimilarity(userVec, itemVecB);

      // Score formula: CosineSim (0.7) + Quality (0.2) + Loved Bonus (0.1)
      const qualityA = (a.rating || 0) / 10;
      const qualityB = (b.rating || 0) / 10;

      scoreA = simA * 0.7 + qualityA * 0.2 + aLoved;
      scoreB = simB * 0.7 + qualityB * 0.2 + bLoved;
    } else {
      // Default quality + popularity score for fresh profiles
      scoreA = (a.rating || 0) + Math.log10((a.voteCount || 1) + 1);
      scoreB = (b.rating || 0) + Math.log10((b.voteCount || 1) + 1);
    }

    return scoreB - scoreA;
  });
}
