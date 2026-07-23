import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserLists, saveUserLists, UserListsData } from './userListsStorage';
import { getTasteProfile, saveTasteProfile, TasteProfile } from './TasteEngine';

export interface DatabaseBackupSchema {
  version: string;
  exportedAt: string;
  userLists: UserListsData;
  tasteProfile: TasteProfile;
  settings: Record<string, any>;
}

export const exportDatabaseToJson = async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  try {
    const userLists = await getUserLists();
    const tasteProfile = await getTasteProfile();

    // Collect user settings
    const preferredServer = await AsyncStorage.getItem('@movieshound_selected_server') || '1';
    const preferredLanguage = await AsyncStorage.getItem('@movieshound_preferred_lang') || 'Original';
    const tmdbApiKey = await AsyncStorage.getItem('@movieshound_tmdb_key') || '';

    const backupData: DatabaseBackupSchema = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      userLists,
      tasteProfile,
      settings: {
        preferredServer,
        preferredLanguage,
        tmdbApiKey,
      },
    };

    const fileName = `movieshound_backup_${new Date().toISOString().slice(0, 10)}.json`;
    const docDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const filePath = `${docDir}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(backupData, null, 2));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Export MoviesHound Database Backup',
        UTI: 'public.json',
      });
    }

    return { success: true, filePath };
  } catch (e: any) {
    return { success: false, error: e.message || 'Export failed' };
  }
};

export const importDatabaseFromJson = async (jsonString: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const parsed: DatabaseBackupSchema = JSON.parse(jsonString);

    if (!parsed.userLists || !parsed.version) {
      return { success: false, error: 'Invalid MoviesHound JSON backup format.' };
    }

    // Restore 5 Lists
    if (parsed.userLists) {
      await saveUserLists(parsed.userLists);
    }

    // Restore Taste Profile
    if (parsed.tasteProfile) {
      await saveTasteProfile(parsed.tasteProfile);
    }

    // Restore Settings
    if (parsed.settings) {
      if (parsed.settings.preferredServer) {
        await AsyncStorage.setItem('@movieshound_selected_server', String(parsed.settings.preferredServer));
      }
      if (parsed.settings.preferredLanguage) {
        await AsyncStorage.setItem('@movieshound_preferred_lang', String(parsed.settings.preferredLanguage));
      }
      if (parsed.settings.tmdbApiKey !== undefined) {
        await AsyncStorage.setItem('@movieshound_tmdb_key', String(parsed.settings.tmdbApiKey));
      }
    }

    return { success: true, message: 'Database & Settings successfully imported!' };
  } catch (e: any) {
    return { success: false, error: e.message || 'Import failed. File is not valid JSON.' };
  }
};
