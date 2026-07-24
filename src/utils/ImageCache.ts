import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IMAGE_CACHE_INDEX = '@image_cache_lru_index';
const MAX_CACHE_ENTRIES = 150; // Keep disk footprint optimized

interface CacheEntry {
  url: string;
  timestamp: number;
}

export async function prefetchImage(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const success = await Image.prefetch(url);
    if (success) {
      await updateLRUIndex(url);
    }
    return success;
  } catch (err) {
    return false;
  }
}

async function updateLRUIndex(url: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(IMAGE_CACHE_INDEX);
    let index: CacheEntry[] = raw ? JSON.parse(raw) : [];

    // Filter existing entry
    index = index.filter((e) => e.url !== url);
    index.unshift({ url, timestamp: Date.now() });

    // Evict oldest if exceeding max entries
    if (index.length > MAX_CACHE_ENTRIES) {
      index = index.slice(0, MAX_CACHE_ENTRIES);
    }

    await AsyncStorage.setItem(IMAGE_CACHE_INDEX, JSON.stringify(index));
  } catch (e) {
    // Ignore LRU index write errors
  }
}

export async function getCachedImagesCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(IMAGE_CACHE_INDEX);
    if (!raw) return 0;
    const index: CacheEntry[] = JSON.parse(raw);
    return index.length;
  } catch {
    return 0;
  }
}
