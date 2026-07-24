import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from './DatabaseStorage';

export type CachedFeedPayload<T> = {
  timestamp: number;
  data: T;
};

/**
 * Retrieves a cached catalog feed from AsyncStorage
 */
export async function getCachedFeed<T>(feedName: string): Promise<T | null> {
  try {
    const cacheKey = `${STORAGE_KEYS.FEED_CACHE}_${feedName}`;
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return null;
    const payload: CachedFeedPayload<T> = JSON.parse(raw);
    return payload.data;
  } catch (e) {
    console.warn(`[ContentCache] Error reading feed "${feedName}":`, e);
    return null;
  }
}

/**
 * Saves a catalog feed payload to AsyncStorage with timestamp metadata
 */
export async function saveCachedFeed<T>(feedName: string, data: T): Promise<void> {
  try {
    const cacheKey = `${STORAGE_KEYS.FEED_CACHE}_${feedName}`;
    const payload: CachedFeedPayload<T> = {
      timestamp: Date.now(),
      data,
    };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (e) {
    console.warn(`[ContentCache] Error saving feed "${feedName}":`, e);
  }
}
