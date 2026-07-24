import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, getList, setStorageString, flushMemoryBufferAndNotify } from './DatabaseStorage';

export interface UserListsState {
  watchLater: any[];
  watched: any[];
  liked: any[];
  loved: any[];
  disliked: any[];
  watchHistory: any[];
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  userLists: {
    watchLater: any[];
    watched: any[];
    liked: any[];
    loved: any[];
    disliked: any[];
  };
  watchHistory: any[];
  searchHistory: string[];
  settings: {
    preferredLanguage?: string;
    selectedServer?: number;
    tmdbApiKey?: string;
    proxyEnabled?: boolean;
    customApiDomain?: string;
    customImgDomain?: string;
    accentColor?: string;
  };
}

const BACKUP_VERSION = '1.0.0';

export async function createBackupPayload(): Promise<BackupPayload> {
  const [
    watchLater,
    watched,
    liked,
    loved,
    disliked,
    watchHistory,
    searchHistoryStr,
    tmdbKey,
    proxyEnabled,
    customApi,
    customImg,
    accentColor,
    prefLang,
    selServer
  ] = await Promise.all([
    getList(STORAGE_KEYS.WATCHLIST),
    getList(STORAGE_KEYS.WATCHED),
    getList(STORAGE_KEYS.LIKED),
    getList(STORAGE_KEYS.LOVED),
    getList(STORAGE_KEYS.DISLIKED),
    getList(STORAGE_KEYS.HISTORY),
    AsyncStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES),
    AsyncStorage.getItem(STORAGE_KEYS.TMDB_KEY),
    AsyncStorage.getItem(STORAGE_KEYS.PROXY_ENABLED),
    AsyncStorage.getItem(STORAGE_KEYS.PROXY_API),
    AsyncStorage.getItem(STORAGE_KEYS.PROXY_IMAGE),
    AsyncStorage.getItem(STORAGE_KEYS.ACCENT_COLOR),
    AsyncStorage.getItem('@preferred_language'),
    AsyncStorage.getItem('@selected_server'),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    userLists: {
      watchLater,
      watched,
      liked,
      loved,
      disliked,
    },
    watchHistory,
    searchHistory: searchHistoryStr ? JSON.parse(searchHistoryStr) : [],
    settings: {
      preferredLanguage: prefLang || 'Original',
      selectedServer: selServer ? parseInt(selServer, 10) : 1,
      tmdbApiKey: tmdbKey || '',
      proxyEnabled: proxyEnabled === 'true',
      customApiDomain: customApi || '',
      customImgDomain: customImg || '',
      accentColor: accentColor || '#FF2D55',
    },
  };
}

export async function exportCombinedBackup(): Promise<{ success: boolean; message: string }> {
  try {
    let Sharing: any = null;
    try {
      Sharing = require('expo-sharing');
    } catch {
      return { success: false, message: 'NATIVE_SHARING_UNAVAILABLE' };
    }

    const payload = await createBackupPayload();
    const jsonString = JSON.stringify(payload, null, 2);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, message: 'Sharing is not available on this device.' };
    }

    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
    await Sharing.shareAsync(uri, {
      dialogTitle: 'Export HoloGram Backup',
      mimeType: 'application/json',
      UTI: 'public.json',
    });

    return { success: true, message: 'Backup exported successfully!' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Export failed.' };
  }
}

export async function exportSingleList(listKey: string, listName: string, data: any[]): Promise<{ success: boolean; message: string }> {
  try {
    let Sharing: any = null;
    try {
      Sharing = require('expo-sharing');
    } catch {
      return { success: false, message: 'NATIVE_SHARING_UNAVAILABLE' };
    }

    const jsonString = JSON.stringify({
      listName,
      exportedAt: new Date().toISOString(),
      count: data.length,
      items: data,
    }, null, 2);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, message: 'Sharing is not available on this device.' };
    }

    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
    await Sharing.shareAsync(uri, {
      dialogTitle: `Export ${listName}`,
      mimeType: 'application/json',
      UTI: 'public.json',
    });

    return { success: true, message: `${listName} exported successfully!` };
  } catch (error: any) {
    return { success: false, message: error.message || 'Export failed.' };
  }
}

export async function restoreBackupFromJSON(data: BackupPayload): Promise<{ success: boolean; message: string }> {
  try {
    if (!data.version || !data.userLists) {
      return { success: false, message: 'Invalid backup JSON schema format.' };
    }

    if (data.userLists.watchLater) {
      await AsyncStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(data.userLists.watchLater));
    }
    if (data.userLists.watched) {
      await AsyncStorage.setItem(STORAGE_KEYS.WATCHED, JSON.stringify(data.userLists.watched));
    }
    if (data.userLists.liked) {
      await AsyncStorage.setItem(STORAGE_KEYS.LIKED, JSON.stringify(data.userLists.liked));
    }
    if (data.userLists.loved) {
      await AsyncStorage.setItem(STORAGE_KEYS.LOVED, JSON.stringify(data.userLists.loved));
    }
    if (data.userLists.disliked) {
      await AsyncStorage.setItem(STORAGE_KEYS.DISLIKED, JSON.stringify(data.userLists.disliked));
    }
    if (data.watchHistory) {
      await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(data.watchHistory));
    }
    if (data.searchHistory) {
      await AsyncStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(data.searchHistory));
    }
    if (data.settings) {
      if (data.settings.tmdbApiKey !== undefined) {
        await setStorageString(STORAGE_KEYS.TMDB_KEY, data.settings.tmdbApiKey);
      }
      if (data.settings.proxyEnabled !== undefined) {
        await setStorageString(STORAGE_KEYS.PROXY_ENABLED, String(data.settings.proxyEnabled));
      }
      if (data.settings.accentColor !== undefined) {
        await setStorageString(STORAGE_KEYS.ACCENT_COLOR, data.settings.accentColor);
      }
    }

    // Flush memory buffer and notify all subscribers (MeScreen & HomeScreen update immediately)
    flushMemoryBufferAndNotify();

    return { success: true, message: 'Backup restored successfully! All lists & settings updated.' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Restore failed.' };
  }
}

export async function importCombinedBackup(): Promise<{ success: boolean; message: string }> {
  try {
    let DocumentPicker: any = null;
    try {
      DocumentPicker = require('expo-document-picker');
    } catch {
      return { success: false, message: 'NATIVE_PICKER_UNAVAILABLE' };
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, message: 'Import cancelled' };
    }

    const file = result.assets[0];
    const response = await fetch(file.uri);
    const content = await response.text();
    const data: BackupPayload = JSON.parse(content);

    return restoreBackupFromJSON(data);
  } catch (error: any) {
    return { success: false, message: error.message || 'Native import error.' };
  }
}
