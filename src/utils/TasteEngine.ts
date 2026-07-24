import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDBMediaItem } from './tmdb';

export interface TasteProfile {
  genreWeights: Record<number, number>;
  mediaTypeWeight: { movie: number; tv: number };
  likedIds: number[];
  lovedIds: number[];
  dislikedIds: number[];
  playbackStats: Record<number, { durationMinutes: number; percentCompleted: number }>;
}

const TASTE_KEY = '@user_taste_profile';
const PERSISTED_LIKES_KEY = '@movie_tinder_liked_items';

export async function getPersistedLikedItems(): Promise<TMDBMediaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PERSISTED_LIKES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function savePersistedLikedItems(items: TMDBMediaItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PERSISTED_LIKES_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to persist liked items:', err);
  }
}

const INITIAL_PROFILE: TasteProfile = {
  genreWeights: {},
  mediaTypeWeight: { movie: 0, tv: 0 },
  likedIds: [],
  lovedIds: [],
  dislikedIds: [],
  playbackStats: {},
};

export async function getTasteProfile(): Promise<TasteProfile> {
  try {
    const raw = await AsyncStorage.getItem(TASTE_KEY);
    if (!raw) return INITIAL_PROFILE;
    return JSON.parse(raw);
  } catch {
    return INITIAL_PROFILE;
  }
}

export async function saveTasteProfile(profile: TasteProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(TASTE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save taste profile:', err);
  }
}

/**
 * Record explicit user swipe/action:
 * 'loved' (+1.5), 'liked' (+0.5), 'disliked' (-0.5)
 */
export async function recordUserAction(
  item: TMDBMediaItem,
  action: 'loved' | 'liked' | 'disliked',
  genreIds: number[] = []
): Promise<void> {
  const profile = await getTasteProfile();

  const weightDelta = action === 'loved' ? 1.5 : action === 'liked' ? 0.5 : -0.5;

  // Update Media Type preference
  if (item.mediaType === 'movie') {
    profile.mediaTypeWeight.movie += weightDelta * 0.2;
  } else {
    profile.mediaTypeWeight.tv += weightDelta * 0.2;
  }

  // Update Genre weights
  genreIds.forEach((gId) => {
    const current = profile.genreWeights[gId] || 0;
    profile.genreWeights[gId] = current + weightDelta;
  });

  // Track ID in lists
  if (action === 'loved' && !profile.lovedIds.includes(item.id)) {
    profile.lovedIds.push(item.id);
  } else if (action === 'liked' && !profile.likedIds.includes(item.id)) {
    profile.likedIds.push(item.id);
  } else if (action === 'disliked' && !profile.dislikedIds.includes(item.id)) {
    profile.dislikedIds.push(item.id);
  }

  // Persist full item for offline recovery
  if (action === 'loved' || action === 'liked') {
    const existingLikes = await getPersistedLikedItems();
    if (!existingLikes.some(i => i.id === item.id)) {
      await savePersistedLikedItems([item, ...existingLikes]);
    }
  }

  await saveTasteProfile(profile);
}

/**
 * Record implicit video playback behavior:
 * - 5 to 10 mins: +0.5 interest boost
 * - >75% completion: +1.5 completion boost
 * - <1 min: -0.2 early drop-off penalty
 */
export async function recordPlaybackDuration(
  item: TMDBMediaItem,
  durationMinutes: number,
  percentCompleted: number,
  genreIds: number[] = []
): Promise<void> {
  const profile = await getTasteProfile();

  let boost = 0;
  if (percentCompleted >= 75) {
    boost = 1.5;
  } else if (durationMinutes >= 5) {
    boost = 0.5;
  } else if (durationMinutes < 1 && percentCompleted < 10) {
    boost = -0.2;
  }

  if (boost !== 0) {
    genreIds.forEach((gId) => {
      const current = profile.genreWeights[gId] || 0;
      profile.genreWeights[gId] = current + boost;
    });
  }

  profile.playbackStats[item.id] = { durationMinutes, percentCompleted };
  await saveTasteProfile(profile);
}

/**
 * Ranks items based on the user's taste profile
 */
export function rankItemsByTaste(
  items: TMDBMediaItem[],
  profile: TasteProfile,
  getItemGenres: (item: TMDBMediaItem) => number[] = () => []
): TMDBMediaItem[] {
  return [...items].sort((a, b) => {
    // Filter out disliked items
    if (profile.dislikedIds.includes(a.id)) return 1;
    if (profile.dislikedIds.includes(b.id)) return -1;

    let scoreA = 0;
    let scoreB = 0;

    const genresA = getItemGenres(a);
    const genresB = getItemGenres(b);

    genresA.forEach((g) => (scoreA += profile.genreWeights[g] || 0));
    genresB.forEach((g) => (scoreB += profile.genreWeights[g] || 0));

    scoreA += (profile.mediaTypeWeight[a.mediaType] || 0);
    scoreB += (profile.mediaTypeWeight[b.mediaType] || 0);

    return scoreB - scoreA;
  });
}
