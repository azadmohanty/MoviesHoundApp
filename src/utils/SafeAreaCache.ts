import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar, Platform } from 'react-native';

const SAFE_AREA_TOP_KEY = '@device_status_bar_height';

// Synchronous memory buffer initialized with hardware fallback
let cachedTopInset: number = Platform.OS === 'android'
  ? Math.max(StatusBar.currentHeight || 36, 36)
  : 44;

/**
 * Initialize the safe area cache synchronously from memory, then update from disk.
 */
export async function initSafeAreaCache(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SAFE_AREA_TOP_KEY);
    if (raw) {
      const val = parseInt(raw, 10);
      if (!isNaN(val) && val > 0) {
        cachedTopInset = val;
      }
    }
  } catch (e) {
    console.warn('[SafeAreaCache] Error reading cached top inset:', e);
  }
  return cachedTopInset;
}

/**
 * Instantly get the cached device status bar top inset (< 1ms execution).
 */
export function getDeviceTopInset(): number {
  return cachedTopInset;
}

/**
 * Update and permanently persist the physical device status bar height.
 */
export async function updateDeviceTopInset(height: number): Promise<void> {
  if (height <= 0 || height === cachedTopInset) return;

  cachedTopInset = height;
  try {
    await AsyncStorage.setItem(SAFE_AREA_TOP_KEY, height.toString());
  } catch (e) {
    console.warn('[SafeAreaCache] Error persisting top inset:', e);
  }
}
