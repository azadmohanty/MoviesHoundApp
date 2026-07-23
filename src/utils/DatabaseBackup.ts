import { Share } from 'react-native';
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

export const exportDatabaseToJson = async (): Promise<{ success: boolean; jsonString?: string; error?: string }> => {
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

    const jsonString = JSON.stringify(backupData, null, 2);

    await Share.share({
      title: 'MoviesHound Database Backup JSON',
      message: jsonString,
    });

    return { success: true, jsonString };
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
