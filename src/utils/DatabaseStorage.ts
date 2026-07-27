import AsyncStorage from '@react-native-async-storage/async-storage';

export type UserMediaItem = {
  id: number;
  title: string;
  posterUrl: string;
  mediaType: 'movie' | 'tv' | 'anime';
  rating?: number;
  releaseDate?: string;
  timestamp?: number;
  resumeTimecodeSeconds?: number;
  durationSeconds?: number;
};

export const STORAGE_KEYS = {
  WATCHLIST: '@watchlist',
  WATCHED: '@watched_list',
  LIKED: '@liked_list',
  LOVED: '@loved_list',
  DISLIKED: '@disliked_list',
  HISTORY: '@watch_history',
  DOWNLOAD_HISTORY: '@download_history',
  RECENT_SEARCHES: '@recent_searches',
  FEED_CACHE: '@cached_feeds',
  TMDB_KEY: '@tmdb_api_key',
  PROXY_ENABLED: '@tmdb_proxy_enabled',
  PROXY_API: '@tmdb_proxy_api',
  PROXY_IMAGE: '@tmdb_proxy_image',
  ACCENT_COLOR: '@accent_color',
};

// Event listener set for real-time cross-screen sync
type StorageListener = (key: string, data: any) => void;
const listeners = new Set<StorageListener>();
const memoryBuffer: Record<string, any> = {};

export function subscribeStorageChanges(listener: StorageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(key: string, data: any) {
  listeners.forEach(fn => {
    try {
      fn(key, data);
    } catch (e) {
      console.warn('[DatabaseStorage] Listener callback error:', e);
    }
  });
}

/**
 * Flushes in-memory storage buffer and notifies all listeners to refresh UI
 */
export function flushMemoryBufferAndNotify(): void {
  Object.keys(memoryBuffer).forEach(k => delete memoryBuffer[k]);
  notifyListeners('@all', null);
}

/**
 * Legacy Key Auto-Migration
 * Safely migrates old `@movieshound_*` and legacy keys to clean brand-agnostic keys.
 */
export async function runLegacyMigrationIfNeeded(): Promise<void> {
  try {
    const isMigrated = await AsyncStorage.getItem('@storage_migrated_v2');
    if (isMigrated === 'true') return;

    console.log('[DatabaseStorage] Starting legacy storage key migration...');

    // Helper to migrate single key if source exists and target is empty
    const migrateKey = async (oldKeys: string[], targetKey: string) => {
      const existingTarget = await AsyncStorage.getItem(targetKey);
      if (existingTarget) return; // Target already populated

      for (const oldKey of oldKeys) {
        const oldData = await AsyncStorage.getItem(oldKey);
        if (oldData) {
          await AsyncStorage.setItem(targetKey, oldData);
          console.log(`[DatabaseStorage] Migrated ${oldKey} -> ${targetKey}`);
          break;
        }
      }
    };

    await migrateKey(['@movieshound_watchlist'], STORAGE_KEYS.WATCHLIST);
    await migrateKey(['@movieshound_watched_list'], STORAGE_KEYS.WATCHED);
    await migrateKey(['@movieshound_taste_likes'], STORAGE_KEYS.LIKED);
    await migrateKey(['@movieshound_recent_searches'], STORAGE_KEYS.RECENT_SEARCHES);
    await migrateKey(['@movieshound_tmdb_key'], STORAGE_KEYS.TMDB_KEY);
    await migrateKey(['@movieshound_accent_color'], STORAGE_KEYS.ACCENT_COLOR);

    await AsyncStorage.setItem('@storage_migrated_v2', 'true');
    console.log('[DatabaseStorage] Legacy key migration completed successfully.');
  } catch (e) {
    console.warn('[DatabaseStorage] Migration warning:', e);
  }
}

/**
 * Sanitizes input media item objects to prevent invalid properties
 */
function sanitizeItem(item: UserMediaItem): UserMediaItem {
  return {
    id: Number(item.id),
    title: item.title || 'Untitled',
    posterUrl: item.posterUrl || '',
    mediaType: item.mediaType || 'movie',
    rating: item.rating ? Number(item.rating) : undefined,
    releaseDate: item.releaseDate || '',
    timestamp: item.timestamp || Date.now(),
    resumeTimecodeSeconds: item.resumeTimecodeSeconds,
    durationSeconds: item.durationSeconds,
  };
}

/**
 * Retrieves a user list with Memory Write-Through Buffer
 */
export async function getList(key: string): Promise<UserMediaItem[]> {
  if (memoryBuffer[key]) {
    return memoryBuffer[key];
  }
  try {
    const raw = await AsyncStorage.getItem(key);
    const data: UserMediaItem[] = raw ? JSON.parse(raw) : [];
    memoryBuffer[key] = data;
    return data;
  } catch {
    return [];
  }
}

/**
 * Checks if an item exists in a list
 */
export async function isInList(key: string, id: number, mediaType: string = 'movie'): Promise<boolean> {
  const current = await getList(key);
  return current.some(i => i.id === id && i.mediaType === mediaType);
}

/**
 * Toggles an item in a list (Add if missing, Remove if present) with Mutual Exclusion & Memory Buffer
 */
export async function toggleListItem(key: string, item: UserMediaItem): Promise<boolean> {
  const current = await getList(key);
  const cleanItem = sanitizeItem(item);

  const exists = current.some(i => i.id === cleanItem.id && i.mediaType === cleanItem.mediaType);
  const updated = exists
    ? current.filter(i => !(i.id === cleanItem.id && i.mediaType === cleanItem.mediaType))
    : [{ ...cleanItem, timestamp: Date.now() }, ...current];

  // Update memory buffer instantly (< 1ms UI reactivity)
  memoryBuffer[key] = updated;
  notifyListeners(key, updated);

  // Persist to disk asynchronously
  AsyncStorage.setItem(key, JSON.stringify(updated)).catch(e =>
    console.warn('[DatabaseStorage] Disk write error:', e)
  );

  // Mutual Exclusion Rule: If adding to LIKED or LOVED, auto-remove from DISLIKED (and vice-versa)
  if (!exists) {
    if (key === STORAGE_KEYS.LIKED || key === STORAGE_KEYS.LOVED) {
      await removeFromList(STORAGE_KEYS.DISLIKED, cleanItem.id, cleanItem.mediaType);
    } else if (key === STORAGE_KEYS.DISLIKED) {
      await removeFromList(STORAGE_KEYS.LIKED, cleanItem.id, cleanItem.mediaType);
      await removeFromList(STORAGE_KEYS.LOVED, cleanItem.id, cleanItem.mediaType);
    }
  }

  return !exists;
}

/**
 * Removes an item from a specific list
 */
export async function removeFromList(key: string, id: number, mediaType: string = 'movie'): Promise<void> {
  const current = await getList(key);
  const updated = current.filter(i => !(i.id === id && i.mediaType === mediaType));

  if (updated.length !== current.length) {
    memoryBuffer[key] = updated;
    notifyListeners(key, updated);
    AsyncStorage.setItem(key, JSON.stringify(updated)).catch(e =>
      console.warn('[DatabaseStorage] Disk remove error:', e)
    );
  }
}

/**
 * Saves video playback progress and timecodes to watch history
 */
export async function savePlaybackProgress(
  item: UserMediaItem,
  resumeTimecodeSeconds: number,
  durationSeconds: number
): Promise<void> {
  const current = await getList(STORAGE_KEYS.HISTORY);
  const cleanItem = sanitizeItem(item);
  cleanItem.resumeTimecodeSeconds = Math.round(resumeTimecodeSeconds);
  cleanItem.durationSeconds = Math.round(durationSeconds);

  const filtered = current.filter(i => !(i.id === cleanItem.id && i.mediaType === cleanItem.mediaType));
  const updated = [cleanItem, ...filtered].slice(0, 30); // Keep top 30 history entries

  memoryBuffer[STORAGE_KEYS.HISTORY] = updated;
  notifyListeners(STORAGE_KEYS.HISTORY, updated);
  AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated)).catch(e =>
    console.warn('[DatabaseStorage] History write error:', e)
  );
}

/**
 * Saves a download record to DOWNLOAD_HISTORY
 */
export async function saveDownloadItem(item: {
  id: number | string;
  title: string;
  posterUrl: string;
  mediaType?: string;
  qualityLabel?: string;
  downloadUrl: string;
}): Promise<void> {
  const current = await getList(STORAGE_KEYS.DOWNLOAD_HISTORY);
  const newItem = {
    id: item.id,
    title: item.title || 'Untitled',
    posterUrl: item.posterUrl || '',
    mediaType: (item.mediaType || 'movie') as any,
    qualityLabel: item.qualityLabel || '720p',
    downloadUrl: item.downloadUrl,
    timestamp: Date.now(),
  };

  const filtered = current.filter(i => !(i.id === newItem.id && (i as any).downloadUrl === newItem.downloadUrl));
  const updated = [newItem as any, ...filtered].slice(0, 50);

  memoryBuffer[STORAGE_KEYS.DOWNLOAD_HISTORY] = updated;
  notifyListeners(STORAGE_KEYS.DOWNLOAD_HISTORY, updated);
  AsyncStorage.setItem(STORAGE_KEYS.DOWNLOAD_HISTORY, JSON.stringify(updated)).catch(e =>
    console.warn('[DatabaseStorage] Download history save error:', e)
  );
}

/**
 * Saves a string value to AsyncStorage with memory buffer caching
 */
export async function setStorageString(key: string, value: string): Promise<void> {
  memoryBuffer[key] = value;
  notifyListeners(key, value);
  await AsyncStorage.setItem(key, value);
}

/**
 * Reads a string value from AsyncStorage with memory buffer caching
 */
export async function getStorageString(key: string, defaultValue: string = ''): Promise<string> {
  if (memoryBuffer[key] !== undefined) return memoryBuffer[key];
  try {
    const raw = await AsyncStorage.getItem(key);
    const val = raw !== null ? raw : defaultValue;
    memoryBuffer[key] = val;
    return val;
  } catch {
    return defaultValue;
  }
}

/**
 * Clears volatile feed and temporary cache items without touching user lists
 */
export async function clearVolatileCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const feedCacheKeys = allKeys.filter(k => k.startsWith(STORAGE_KEYS.FEED_CACHE));
    await AsyncStorage.multiRemove(feedCacheKeys);
    feedCacheKeys.forEach(k => delete memoryBuffer[k]);
    console.log('[DatabaseStorage] Volatile feed cache cleared cleanly.');
  } catch (e) {
    console.warn('[DatabaseStorage] Error clearing volatile cache:', e);
  }
}
