import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDBMediaItem } from './tmdb';

export interface UserListsData {
  watchLater: TMDBMediaItem[];
  watched: TMDBMediaItem[];
  liked: TMDBMediaItem[];
  loved: TMDBMediaItem[];
  disliked: TMDBMediaItem[];
}

const LISTS_STORAGE_KEY = '@movieshound_user_5_lists';

export const DEFAULT_USER_LISTS: UserListsData = {
  watchLater: [],
  watched: [],
  liked: [],
  loved: [],
  disliked: [],
};

export const getUserLists = async (): Promise<UserListsData> => {
  try {
    const raw = await AsyncStorage.getItem(LISTS_STORAGE_KEY);
    if (!raw) return DEFAULT_USER_LISTS;
    const parsed = JSON.parse(raw);
    return {
      watchLater: parsed.watchLater || [],
      watched: parsed.watched || [],
      liked: parsed.liked || [],
      loved: parsed.loved || [],
      disliked: parsed.disliked || [],
    };
  } catch (e) {
    return DEFAULT_USER_LISTS;
  }
};

export const saveUserLists = async (lists: UserListsData): Promise<void> => {
  try {
    await AsyncStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists));
  } catch (e) {}
};

export const toggleItemInList = async (
  item: TMDBMediaItem,
  listType: 'watchLater' | 'watched' | 'liked' | 'loved' | 'disliked'
): Promise<UserListsData> => {
  const current = await getUserLists();
  const targetArray = [...current[listType]];
  const existingIdx = targetArray.findIndex(i => i.id === item.id);

  if (existingIdx >= 0) {
    // Remove if already in target list
    targetArray.splice(existingIdx, 1);
  } else {
    // Add to target list
    targetArray.unshift(item);
  }

  const updated: UserListsData = {
    ...current,
    [listType]: targetArray,
  };

  await saveUserLists(updated);
  return updated;
};
