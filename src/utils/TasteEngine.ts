import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDBMediaItem } from './tmdb';

export interface TasteProfile {
  genreWeights: Record<number, number>;
  mediaTypePreference: 'all' | 'movie' | 'tv';
  lovedIds: number[];
  likedIds: number[];
  dislikedIds: number[];
}

const TASTE_STORAGE_KEY = '@movieshound_taste_profile';

const DEFAULT_TASTE_PROFILE: TasteProfile = {
  genreWeights: {},
  mediaTypePreference: 'all',
  lovedIds: [],
  likedIds: [],
  dislikedIds: [],
};

export const getTasteProfile = async (): Promise<TasteProfile> => {
  try {
    const raw = await AsyncStorage.getItem(TASTE_STORAGE_KEY);
    if (!raw) return DEFAULT_TASTE_PROFILE;
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_TASTE_PROFILE;
  }
};

export const saveTasteProfile = async (profile: TasteProfile): Promise<void> => {
  try {
    await AsyncStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {}
};

export const updateTasteWithSwipe = async (
  item: TMDBMediaItem,
  action: 'loved' | 'liked' | 'disliked',
  genreIds: number[] = []
): Promise<TasteProfile> => {
  const profile = await getTasteProfile();
  const weightDelta = action === 'loved' ? 3.0 : action === 'liked' ? 1.0 : -2.0;

  // Track ID
  if (action === 'loved') {
    if (!profile.lovedIds.includes(item.id)) profile.lovedIds.push(item.id);
  } else if (action === 'liked') {
    if (!profile.likedIds.includes(item.id)) profile.likedIds.push(item.id);
  } else if (action === 'disliked') {
    if (!profile.dislikedIds.includes(item.id)) profile.dislikedIds.push(item.id);
  }

  // Update genre weights
  genreIds.forEach(gId => {
    profile.genreWeights[gId] = (profile.genreWeights[gId] || 0) + weightDelta;
  });

  await saveTasteProfile(profile);
  return profile;
};

// Rank upcoming deck items based on Taste Profile scores
export const rankDeckItemsByTaste = (items: TMDBMediaItem[], profile: TasteProfile): TMDBMediaItem[] => {
  const excludedIds = new Set([...profile.lovedIds, ...profile.likedIds, ...profile.dislikedIds]);
  const freshItems = items.filter(item => !excludedIds.has(item.id));

  return [...freshItems].sort((a, b) => {
    const aRating = a.rating || 0;
    const bRating = b.rating || 0;
    return bRating - aRating;
  });
};
