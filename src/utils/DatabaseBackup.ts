import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserListsState {
  watchLater: any[];
  watched: any[];
  liked: any[];
  loved: any[];
  disliked: any[];
  watchHistory: {
    item: any;
    progressPercent: number;
    lastWatchedAt: string;
  }[];
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
    watchLaterStr,
    watchedStr,
    likedStr,
    lovedStr,
    dislikedStr,
    historyStr,
    searchHistoryStr,
    tmdbKey,
    proxyEnabled,
    customApi,
    customImg,
    accentColor,
    prefLang,
    selServer
  ] = await Promise.all([
    AsyncStorage.getItem('@watchlist'),
    AsyncStorage.getItem('@watched_list'),
    AsyncStorage.getItem('@liked_list'),
    AsyncStorage.getItem('@loved_list'),
    AsyncStorage.getItem('@disliked_list'),
    AsyncStorage.getItem('@watch_history'),
    AsyncStorage.getItem('@search_history'),
    AsyncStorage.getItem('@movieshound_tmdb_key'),
    AsyncStorage.getItem('@movieshound_tmdb_proxy_enabled'),
    AsyncStorage.getItem('@movieshound_tmdb_proxy_api'),
    AsyncStorage.getItem('@movieshound_tmdb_proxy_image'),
    AsyncStorage.getItem('@movieshound_accent_color'),
    AsyncStorage.getItem('@preferred_language'),
    AsyncStorage.getItem('@selected_server'),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    userLists: {
      watchLater: watchLaterStr ? JSON.parse(watchLaterStr) : [],
      watched: watchedStr ? JSON.parse(watchedStr) : [],
      liked: likedStr ? JSON.parse(likedStr) : [],
      loved: lovedStr ? JSON.parse(lovedStr) : [],
      disliked: dislikedStr ? JSON.parse(dislikedStr) : [],
    },
    watchHistory: historyStr ? JSON.parse(historyStr) : [],
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
      await AsyncStorage.setItem('@watchlist', JSON.stringify(data.userLists.watchLater));
    }
    if (data.userLists.watched) {
      await AsyncStorage.setItem('@watched_list', JSON.stringify(data.userLists.watched));
    }
    if (data.userLists.liked) {
      await AsyncStorage.setItem('@liked_list', JSON.stringify(data.userLists.liked));
    }
    if (data.userLists.loved) {
      await AsyncStorage.setItem('@loved_list', JSON.stringify(data.userLists.loved));
    }
    if (data.userLists.disliked) {
      await AsyncStorage.setItem('@disliked_list', JSON.stringify(data.userLists.disliked));
    }
    if (data.watchHistory) {
      await AsyncStorage.setItem('@watch_history', JSON.stringify(data.watchHistory));
    }
    if (data.searchHistory) {
      await AsyncStorage.setItem('@search_history', JSON.stringify(data.searchHistory));
    }
    if (data.settings) {
      if (data.settings.tmdbApiKey !== undefined) {
        await AsyncStorage.setItem('@movieshound_tmdb_key', data.settings.tmdbApiKey);
      }
      if (data.settings.proxyEnabled !== undefined) {
        await AsyncStorage.setItem('@movieshound_tmdb_proxy_enabled', String(data.settings.proxyEnabled));
      }
      if (data.settings.accentColor !== undefined) {
        await AsyncStorage.setItem('@movieshound_accent_color', data.settings.accentColor);
      }
    }

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
