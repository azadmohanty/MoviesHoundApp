import React, { useState, useEffect } from 'react';
import { Image } from 'expo-image';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveAllDomains } from '../utils/resolver';
import {
  exportCombinedBackup,
  importCombinedBackup,
  exportSingleList,
  restoreBackupFromJSON,
  createBackupPayload,
} from '../utils/DatabaseBackup';
import { getDeviceTopInset } from '../utils/SafeAreaCache';
import { triggerLightHaptic, triggerSelectionHaptic, triggerSuccessHaptic } from '../utils/HapticsHelper';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import {
  getList,
  STORAGE_KEYS,
  subscribeStorageChanges,
  runLegacyMigrationIfNeeded,
  setStorageString,
  getStorageString,
} from '../utils/DatabaseStorage';

const { width } = Dimensions.get('window');
// Math for 3 equal columns: screen width minus 32px padding minus 2 * 12px gap = width - 56
const GRID_ITEM_WIDTH = Math.floor((width - 56) / 3);

interface MeScreenProps {
  onNavigateToDownloader?: (query: string, mediaType?: string, imdbId?: string, year?: string) => void;
}

export default function MeScreen({ onNavigateToDownloader }: MeScreenProps = {}) {
  // 3 Primary Streamlined Tabs (Concept 1: Letterboxd Media Hub)
  const [activeMainTab, setActiveMainTab] = useState<'library' | 'history' | 'system'>('library');
  
  // Library List Filter
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'watchLater' | 'watched' | 'liked' | 'loved' | 'disliked'>('all');

  // User Custom Display Name
  const [userName, setUserName] = useState('CHIEF');
  const [isEditingName, setIsEditingName] = useState(false);

  // User Lists State
  const [watchLater, setWatchLater] = useState<any[]>([]);
  const [watched, setWatched] = useState<any[]>([]);
  const [liked, setLiked] = useState<any[]>([]);
  const [loved, setLoved] = useState<any[]>([]);
  const [disliked, setDisliked] = useState<any[]>([]);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);

  // History Sub-Tab & Additional History States
  const [historySubTab, setHistorySubTab] = useState<'watch' | 'search' | 'download'>('watch');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<any[]>([]);

  // Settings & Theme states
  const [accentColor, setAccentColor] = useState('#FF2D55');
  const [tmdbKey, setTmdbKey] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [customApi, setCustomApi] = useState('');

  // Engine Provider Control & Preferences
  const [disabledProviders, setDisabledProviders] = useState<string[]>([]);
  const [defaultQuality, setDefaultQuality] = useState<'480p' | '720p' | '1080p' | '4K'>('720p');
  const [scraperTimeoutMs, setScraperTimeoutMs] = useState<number>(6000);

  // Diagnostics & Scrapers Health
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});
  const [pingStatus, setPingStatus] = useState<
    Record<string, { status: 'idle' | 'checking' | 'ok' | 'error'; latency?: number }>
  >({});

  // Fallback Restore JSON Modal
  const [fallbackModalVisible, setFallbackModalVisible] = useState(false);
  const [jsonText, setJsonText] = useState('');

  // Video Stream Player Modal
  const [playerVisible, setPlayerVisible] = useState(false);
  const [activeMediaItem, setActiveMediaItem] = useState<any>(null);

  useEffect(() => {
    runLegacyMigrationIfNeeded().then(() => {
      loadAllUserData();
    });
    fetchDomains();

    // Real-time PubSub Listener for Cross-Screen Sync
    const unsubscribe = subscribeStorageChanges(() => {
      loadAllUserData();
    });
    return () => unsubscribe();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'GOOD MORNING';
    if (hour < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  };

  const fetchDomains = async () => {
    try {
      const domains = await resolveAllDomains(() => {});
      setResolvedDomains(domains);
    } catch (e) {
      console.warn('Failed to resolve mirror domains for diagnostics:', e);
    }
  };

  const loadAllUserData = async () => {
    try {
      const [
        wl,
        wt,
        lk,
        lv,
        dl,
        hi,
        sh,
        dh,
        key,
        proxy,
        api,
        accent,
        storedName,
        disabledJson,
        defQual,
        timeoutStr,
      ] = await Promise.all([
        getList(STORAGE_KEYS.WATCHLIST),
        getList(STORAGE_KEYS.WATCHED),
        getList(STORAGE_KEYS.LIKED),
        getList(STORAGE_KEYS.LOVED),
        getList(STORAGE_KEYS.DISLIKED),
        getList(STORAGE_KEYS.HISTORY),
        getList(STORAGE_KEYS.RECENT_SEARCHES),
        getList(STORAGE_KEYS.DOWNLOAD_HISTORY),
        getStorageString(STORAGE_KEYS.TMDB_KEY),
        getStorageString(STORAGE_KEYS.PROXY_ENABLED),
        getStorageString(STORAGE_KEYS.PROXY_API),
        getStorageString(STORAGE_KEYS.ACCENT_COLOR, '#FF2D55'),
        getStorageString('@user_display_name', 'CHIEF'),
        getStorageString('@disabled_providers', '[]'),
        getStorageString('@default_quality', '720p'),
        getStorageString('@scraper_timeout', '6000'),
      ]);

      setWatchLater(wl);
      setWatched(wt);
      setLiked(lk);
      setLoved(lv);
      setDisliked(dl);
      setWatchHistory(hi);
      setSearchHistory(sh.map((item: any) => typeof item === 'string' ? item : item.title || String(item)));
      setDownloadHistory(dh);

      if (key) setTmdbKey(key);
      setProxyEnabled(proxy === 'true');
      if (api) setCustomApi(api);
      if (accent) setAccentColor(accent);
      if (storedName) setUserName(storedName);
      if (disabledJson) {
        try { setDisabledProviders(JSON.parse(disabledJson)); } catch (e) {}
      }
      if (defQual) setDefaultQuality(defQual as any);
      if (timeoutStr) setScraperTimeoutMs(parseInt(timeoutStr, 10) || 6000);
    } catch (e) {
      console.error('Failed to load user settings/lists:', e);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      await setStorageString(key, value);
      if (key === STORAGE_KEYS.TMDB_KEY) setTmdbKey(value);
      if (key === STORAGE_KEYS.PROXY_ENABLED) setProxyEnabled(value === 'true');
      if (key === STORAGE_KEYS.ACCENT_COLOR) setAccentColor(value);
      if (key === '@user_display_name') setUserName(value);
    } catch (e) {
      Alert.alert('Save Error', 'Could not save setting.');
    }
  };

  const runPingCheck = async (siteKey: string, url: string) => {
    setPingStatus((prev) => ({
      ...prev,
      [siteKey]: { status: 'checking' },
    }));

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      setPingStatus((prev) => ({
        ...prev,
        [siteKey]: { status: 'ok', latency },
      }));
    } catch (err) {
      setPingStatus((prev) => ({
        ...prev,
        [siteKey]: { status: 'error' },
      }));
    }
  };

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.HISTORY);
      setWatchHistory([]);
      Alert.alert('History Cleared', 'Your watch history has been reset.');
    } catch (e) {
      Alert.alert('Error', 'Failed to clear watch history.');
    }
  };

  const clearSearchHistory = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES);
      setSearchHistory([]);
      Alert.alert('Search History Cleared', 'Your recent search history has been reset.');
    } catch (e) {
      Alert.alert('Error', 'Failed to clear search history.');
    }
  };

  const clearDownloadHistory = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.DOWNLOAD_HISTORY);
      setDownloadHistory([]);
      Alert.alert('Download History Cleared', 'Your download link history has been reset.');
    } catch (e) {
      Alert.alert('Error', 'Failed to clear download history.');
    }
  };

  const handleExportBackup = async () => {
    const res = await exportCombinedBackup();
    if (res.message === 'NATIVE_SHARING_UNAVAILABLE') {
      const payload = await createBackupPayload();
      setJsonText(JSON.stringify(payload, null, 2));
      setFallbackModalVisible(true);
    } else if (res.message) {
      Alert.alert(res.success ? 'Export Ready' : 'Export Failed', res.message);
    }
  };

  const handleImportBackup = async () => {
    const res = await importCombinedBackup();
    if (res.message === 'NATIVE_PICKER_UNAVAILABLE') {
      setFallbackModalVisible(true);
    } else {
      Alert.alert(res.success ? 'Import Complete' : 'Import Status', res.message);
      if (res.success) {
        loadAllUserData();
      }
    }
  };

  const handleRestoreFromText = async () => {
    try {
      const parsed = JSON.parse(jsonText);
      const res = await restoreBackupFromJSON(parsed);
      Alert.alert(res.success ? 'Success' : 'Restore Error', res.message);
      if (res.success) {
        setFallbackModalVisible(false);
        setJsonText('');
        loadAllUserData();
      }
    } catch (e) {
      Alert.alert('Invalid JSON', 'Please paste a valid HoloGram backup JSON structure.');
    }
  };

  // Compute filtered items for My Library tab
  const getFilteredLibraryItems = () => {
    if (libraryFilter === 'watchLater') return watchLater;
    if (libraryFilter === 'watched') return watched;
    if (libraryFilter === 'liked') return liked;
    if (libraryFilter === 'loved') return loved;
    if (libraryFilter === 'disliked') return disliked;

    // 'all' -> combine unique items across all lists
    const map = new Map<number, any>();
    [...loved, ...liked, ...watchLater, ...watched].forEach((item) => {
      if (item && item.id && !map.has(item.id)) {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  };

  // Helper to determine sentiment badge for grid items
  const getItemBadge = (itemId: number) => {
    if (loved.some(i => i.id === itemId)) return { icon: 'heart', color: '#FF2D55' };
    if (liked.some(i => i.id === itemId)) return { icon: 'thumb-up', color: '#FFE500', isMaterial: true };
    if (watched.some(i => i.id === itemId)) return { icon: 'checkmark-circle', color: '#00FF88' };
    if (watchLater.some(i => i.id === itemId)) return { icon: 'bookmark', color: '#FF2D55' };
    return null;
  };

  const totalMediaItems = new Set([
    ...watchLater.map(i => i.id),
    ...watched.map(i => i.id),
    ...liked.map(i => i.id),
    ...loved.map(i => i.id),
  ]).size;

  const currentDisplayList = getFilteredLibraryItems();

  return (
    <View style={[styles.container, { paddingTop: getDeviceTopInset() }]}>
      {/* Header: User Greeting & Name (No Circular Image) */}
      <View style={styles.profileHeader}>
        <View style={styles.profileMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.greetingText}>{getGreeting()}, </Text>
            {isEditingName ? (
              <TextInput
                style={styles.userNameInput}
                value={userName}
                onChangeText={setUserName}
                onBlur={() => {
                  setIsEditingName(false);
                  updateSetting('@user_display_name', userName || 'CHIEF');
                }}
                onSubmitEditing={() => {
                  setIsEditingName(false);
                  updateSetting('@user_display_name', userName || 'CHIEF');
                }}
                autoFocus={true}
              />
            ) : (
              <TouchableOpacity onPress={() => setIsEditingName(true)} style={styles.nameBtn} activeOpacity={0.7}>
                <Text style={styles.userName}>{(userName || 'CHIEF').toUpperCase()}</Text>
                <Ionicons name="pencil-sharp" size={12} color="rgba(255,255,255,0.4)" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.userSub}>PREMIUM DISCOVERY SUITE</Text>
          
          {/* Taste & Hub Count Badges */}
          <View style={styles.tasteBarRow}>
            <View style={[styles.tasteBadge, { borderColor: accentColor }]}>
              <Text style={[styles.tasteBadgeText, { color: accentColor }]}>
                {totalMediaItems} TITLES IN HUB
              </Text>
            </View>
            <View style={styles.tasteBadge}>
              <Text style={styles.tasteBadgeText}>
                {loved.length} LOVED • {liked.length} LIKED
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Streamlined 3 Primary Tabs (Concept 1 Layout) */}
      <View style={styles.primaryTabsRow}>
        <TouchableOpacity
          style={[styles.primaryTab, activeMainTab === 'library' && styles.primaryTabActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setActiveMainTab('library');
          }}
        >
          <Text style={[styles.primaryTabText, activeMainTab === 'library' && { color: accentColor }]}>
            MY LIBRARY ({totalMediaItems})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryTab, activeMainTab === 'history' && styles.primaryTabActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setActiveMainTab('history');
          }}
        >
          <Text style={[styles.primaryTabText, activeMainTab === 'history' && { color: accentColor }]}>
            HISTORY ({watchHistory.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryTab, activeMainTab === 'system' && styles.primaryTabActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setActiveMainTab('system');
          }}
        >
          <Text style={[styles.primaryTabText, activeMainTab === 'system' && { color: accentColor }]}>
            SETTINGS
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* TAB 1: MY LIBRARY (Fixed 3x2 Filter Grid & 3-Column Movie Poster Grid) */}
        {/* ========================================================================= */}
        {activeMainTab === 'library' && (
          <View style={styles.tabSection}>
            {/* Fixed 3 x 2 Category Filter Grid (No Scrolling, Clean Icons) */}
            <View style={styles.filterGridContainer}>
              <View style={styles.filterGridRow}>
                <TouchableOpacity
                  style={[styles.filterGridCapsule, libraryFilter === 'all' && styles.filterCapsuleActive]}
                  onPress={() => setLibraryFilter('all')}
                >
                  <Ionicons name="grid-outline" size={13} color={libraryFilter === 'all' ? '#0A0A0C' : 'rgba(255,255,255,0.7)'} />
                  <Text style={[styles.filterGridText, libraryFilter === 'all' && { color: '#0A0A0C' }]}>
                    ALL ({totalMediaItems})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterGridCapsule, libraryFilter === 'watchLater' && styles.filterCapsuleActive]}
                  onPress={() => setLibraryFilter('watchLater')}
                >
                  <Ionicons name="bookmark-outline" size={13} color={libraryFilter === 'watchLater' ? '#0A0A0C' : '#FF2D55'} />
                  <Text style={[styles.filterGridText, libraryFilter === 'watchLater' && { color: '#0A0A0C' }]}>
                    SAVED ({watchLater.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterGridCapsule, libraryFilter === 'watched' && styles.filterCapsuleActive]}
                  onPress={() => setLibraryFilter('watched')}
                >
                  <Ionicons name="checkmark-circle-outline" size={13} color={libraryFilter === 'watched' ? '#0A0A0C' : '#00FF88'} />
                  <Text style={[styles.filterGridText, libraryFilter === 'watched' && { color: '#0A0A0C' }]}>
                    WATCHED ({watched.length})
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.filterGridRow}>
                <TouchableOpacity
                  style={[styles.filterGridCapsule, libraryFilter === 'loved' && styles.filterCapsuleActive]}
                  onPress={() => setLibraryFilter('loved')}
                >
                  <Ionicons name="heart-outline" size={13} color={libraryFilter === 'loved' ? '#0A0A0C' : '#FF2D55'} />
                  <Text style={[styles.filterGridText, libraryFilter === 'loved' && { color: '#0A0A0C' }]}>
                    LOVED ({loved.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterGridCapsule, libraryFilter === 'liked' && styles.filterCapsuleActive]}
                  onPress={() => setLibraryFilter('liked')}
                >
                  <MaterialCommunityIcons name="thumb-up-outline" size={13} color={libraryFilter === 'liked' ? '#0A0A0C' : '#FFE500'} />
                  <Text style={[styles.filterGridText, libraryFilter === 'liked' && { color: '#0A0A0C' }]}>
                    LIKED ({liked.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterGridCapsule, libraryFilter === 'disliked' && styles.filterCapsuleActive]}
                  onPress={() => setLibraryFilter('disliked')}
                >
                  <MaterialCommunityIcons name="thumb-down-outline" size={13} color={libraryFilter === 'disliked' ? '#0A0A0C' : '#FF3B30'} />
                  <Text style={[styles.filterGridText, libraryFilter === 'disliked' && { color: '#0A0A0C' }]}>
                    DISLIKED ({disliked.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List Header Actions */}
            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeaderTitle}>
                {libraryFilter === 'watchLater' ? 'SAVED WATCHLIST' : `${libraryFilter.toUpperCase()} CATALOG`}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const items = getFilteredLibraryItems();
                  exportSingleList(libraryFilter, libraryFilter, items);
                }}
              >
                <Text style={styles.exportListLink}>EXPORT LIST .JSON</Text>
              </TouchableOpacity>
            </View>

            {/* Perfect 3-Column Movie Poster Grid */}
            {currentDisplayList.length > 0 ? (
              <View style={styles.posterGrid}>
                {currentDisplayList.map((item) => {
                  const badge = getItemBadge(item.id);
                  return (
                    <TouchableOpacity
                      key={`grid-${item.id}`}
                      style={styles.gridCard}
                      onPress={() => {
                        setActiveMediaItem({
                          id: item.id,
                          title: item.title,
                          posterUrl: item.posterUrl,
                          mediaType: item.mediaType || 'movie',
                          rating: item.rating || 0,
                          releaseDate: item.releaseDate || '',
                        });
                        setPlayerVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Image
                        source={{
                          uri: item.posterUrl || 'https://via.placeholder.com/300x450/1E1E24/FFFFFF?text=NO+IMAGE',
                        }}
                        style={styles.gridPoster}
                      />
                      {/* Sentiment Corner Badge */}
                      {badge && (
                        <View style={styles.gridBadgeContainer}>
                          {badge.isMaterial ? (
                            <MaterialCommunityIcons name={badge.icon as any} size={13} color={badge.color} />
                          ) : (
                            <Ionicons name={badge.icon as any} size={13} color={badge.color} />
                          )}
                        </View>
                      )}
                      <Text style={styles.gridTitle} numberOfLines={1}>
                        {(item.title || '').toUpperCase()}
                      </Text>
                      <Text style={styles.gridMeta}>
                        {(item.mediaType || 'MOVIE').toUpperCase()} • ★ {item.rating ? Number(item.rating).toFixed(1) : 'N/A'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="folder-open-outline" size={44} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>NO TITLES IN THIS CATEGORY.</Text>
                <Text style={styles.emptySub}>Browse home discovery feeds or swipe cards to add media.</Text>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: HISTORY HUB (WATCH HISTORY, SEARCH HISTORY, DOWNLOAD HISTORY) */}
        {/* ========================================================================= */}
        {activeMainTab === 'history' && (
          <View style={styles.tabSection}>
            {/* 3 Sub-Tab Pills */}
            <View style={styles.filterGridContainer}>
              <View style={styles.filterGridRow}>
                <TouchableOpacity
                  style={[styles.filterGridCapsule, historySubTab === 'watch' && styles.filterCapsuleActive]}
                  onPress={() => setHistorySubTab('watch')}
                >
                  <Ionicons name="time-outline" size={13} color={historySubTab === 'watch' ? '#0A0A0C' : '#FF2D55'} />
                  <Text style={[styles.filterGridText, historySubTab === 'watch' && { color: '#0A0A0C' }]}>
                    WATCHED ({watchHistory.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterGridCapsule, historySubTab === 'search' && styles.filterCapsuleActive]}
                  onPress={() => setHistorySubTab('search')}
                >
                  <Ionicons name="search-outline" size={13} color={historySubTab === 'search' ? '#0A0A0C' : '#00E5FF'} />
                  <Text style={[styles.filterGridText, historySubTab === 'search' && { color: '#0A0A0C' }]}>
                    SEARCHES ({searchHistory.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterGridCapsule, historySubTab === 'download' && styles.filterCapsuleActive]}
                  onPress={() => setHistorySubTab('download')}
                >
                  <Ionicons name="download-outline" size={13} color={historySubTab === 'download' ? '#0A0A0C' : '#00FF88'} />
                  <Text style={[styles.filterGridText, historySubTab === 'download' && { color: '#0A0A0C' }]}>
                    DOWNLOADS ({downloadHistory.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* SUB-TAB 1: WATCH HISTORY */}
            {historySubTab === 'watch' && (
              <>
                <View style={styles.listHeaderRow}>
                  <Text style={styles.listHeaderTitle}>WATCH & PLAYHEAD HISTORY ({watchHistory.length})</Text>
                  {watchHistory.length > 0 && (
                    <TouchableOpacity onPress={clearHistory}>
                      <Text style={[styles.exportListLink, { color: '#FF2D55' }]}>CLEAR ALL HISTORY</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {watchHistory.length > 0 ? (
                  <View style={styles.historyList}>
                    {watchHistory.map((item, idx) => (
                      <TouchableOpacity
                        key={`hist-${item.id || idx}`}
                        style={styles.historyCard}
                        onPress={() => {
                          setActiveMediaItem({
                            id: item.id,
                            title: item.title,
                            posterUrl: item.posterUrl,
                            mediaType: item.mediaType || 'movie',
                            rating: item.rating || 0,
                            releaseDate: item.releaseDate || '',
                          });
                          setPlayerVisible(true);
                        }}
                      >
                        <Image source={{ uri: item.posterUrl }} style={styles.historyPoster} />
                        <View style={styles.historyInfo}>
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            {(item.title || '').toUpperCase()}
                          </Text>
                          <Text style={styles.historyMeta}>
                            {(item.mediaType || 'MOVIE').toUpperCase()} • WATCHED {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'RECENTLY'}
                          </Text>
                          {item.resumeTimecodeSeconds ? (
                            <Text style={styles.historyMeta}>
                              RESUME AT {Math.floor(item.resumeTimecodeSeconds / 60)}M {item.resumeTimecodeSeconds % 60}S
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="play-circle-outline" size={28} color={accentColor} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="time-outline" size={44} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyText}>NO RECENT PLAYBACK HISTORY.</Text>
                    <Text style={styles.emptySub}>Movies and TV shows you stream will appear here automatically.</Text>
                  </View>
                )}
              </>
            )}

            {/* SUB-TAB 2: SEARCH HISTORY */}
            {historySubTab === 'search' && (
              <>
                <View style={styles.listHeaderRow}>
                  <Text style={styles.listHeaderTitle}>RECENT SEARCH QUERIES ({searchHistory.length})</Text>
                  {searchHistory.length > 0 && (
                    <TouchableOpacity onPress={clearSearchHistory}>
                      <Text style={[styles.exportListLink, { color: '#FF2D55' }]}>CLEAR SEARCHES</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {searchHistory.length > 0 ? (
                  <View style={styles.historyList}>
                    {searchHistory.map((query, idx) => (
                      <TouchableOpacity
                        key={`search-query-${idx}`}
                        style={styles.historyCard}
                        onPress={() => {
                          if (onNavigateToDownloader) {
                            onNavigateToDownloader(query);
                          }
                        }}
                      >
                        <View style={styles.searchIconBox}>
                          <Ionicons name="search" size={18} color="#00E5FF" />
                        </View>
                        <View style={styles.historyInfo}>
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            "{query.toUpperCase()}"
                          </Text>
                          <Text style={styles.historyMeta}>TAP TO RE-SEARCH IN DOWNLOADER</Text>
                        </View>
                        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.4)" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={44} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyText}>NO RECENT SEARCH HISTORY.</Text>
                    <Text style={styles.emptySub}>Searches perform in the discovery or downloader tabs will show here.</Text>
                  </View>
                )}
              </>
            )}

            {/* SUB-TAB 3: DOWNLOAD HISTORY */}
            {historySubTab === 'download' && (
              <>
                <View style={styles.listHeaderRow}>
                  <Text style={styles.listHeaderTitle}>EXTRACTED DOWNLOAD LINKS ({downloadHistory.length})</Text>
                  {downloadHistory.length > 0 && (
                    <TouchableOpacity onPress={clearDownloadHistory}>
                      <Text style={[styles.exportListLink, { color: '#FF2D55' }]}>CLEAR DOWNLOAD HISTORY</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {downloadHistory.length > 0 ? (
                  <View style={styles.historyList}>
                    {downloadHistory.map((item, idx) => (
                      <View key={`dl-hist-${item.id || idx}`} style={styles.historyCard}>
                        {item.posterUrl ? (
                          <Image source={{ uri: item.posterUrl }} style={styles.historyPoster} />
                        ) : (
                          <View style={styles.searchIconBox}>
                            <Ionicons name="download" size={18} color="#00FF88" />
                          </View>
                        )}
                        <View style={styles.historyInfo}>
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            {(item.title || 'Downloaded File').toUpperCase()}
                          </Text>
                          <Text style={styles.historyMeta}>
                            {item.qualityLabel || '720p'} • {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'RECENT'}
                          </Text>
                        </View>
                        
                        {/* 1-Tap Open / Re-Download Link in Browser */}
                        <TouchableOpacity
                          style={{ padding: 6 }}
                          onPress={() => {
                            triggerSuccessHaptic();
                            Linking.openURL(item.downloadUrl).catch(() =>
                              Alert.alert('Error', 'Could not open download URL.')
                            );
                          }}
                        >
                          <Ionicons name="open-outline" size={22} color="#00FF88" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="download-outline" size={44} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyText}>NO DOWNLOAD HISTORY.</Text>
                    <Text style={styles.emptySub}>Streams resolved for download will be logged here for 1-tap re-opening.</Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SYSTEM & BACKUP */}
        {/* ========================================================================= */}
        {activeMainTab === 'system' && (
          <View style={styles.tabSection}>
            {/* Custom User Name Input in Settings */}
            <Text style={styles.sectionTitle}>USER DISPLAY NAME</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.textInput}
                value={userName}
                onChangeText={(val) => updateSetting('@user_display_name', val)}
                placeholder="Enter Your Name..."
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
            </View>

            <View style={styles.divider} />

            {/* Backup & Restore Action Banner */}
            <Text style={styles.sectionTitle}>DATABASE BACKUP & RESTORE</Text>
            <View style={styles.backupCard}>
              <Text style={styles.backupCardTitle}>OFFLINE JSON BACKUP ENGINE</Text>
              <Text style={styles.backupCardSub}>
                Export your complete database (Watchlist, Watched, Liked, Loved, Disliked & History) to a single portable `.json` document.
              </Text>
              <View style={styles.backupBtnRow}>
                <TouchableOpacity style={styles.exportBtn} onPress={handleExportBackup}>
                  <Text style={styles.exportBtnText}>↑ EXPORT BACKUP (.JSON)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.importBtn} onPress={handleImportBackup}>
                  <Text style={styles.importBtnText}>↓ RESTORE BACKUP (.JSON)</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            {/* System Diagnostics & Scrapers Health */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>SCRAPER ENGINE LATENCY & CONTROL</Text>
              <TouchableOpacity
                onPress={() => {
                  triggerSelectionHaptic();
                  const ALL_SCRAPER_ENGINES = [
                    { key: 'vegamovies', url: resolvedDomains.vegamovies || 'https://vegamovies.navy' },
                    { key: 'rogmovies', url: resolvedDomains.rogmovies || 'https://rogmovies.rest' },
                    { key: 'moviesmod', url: resolvedDomains.moviesmod || 'https://moviesmod.at' },
                    { key: 'topmovies', url: resolvedDomains.topmovies || 'https://moviesleech.asia' },
                    { key: 'fzmovies', url: 'https://fzmovies.net' },
                    { key: 'bollyflix', url: resolvedDomains.bollyflix || 'https://bollyflix.org' },
                    { key: 'moviebox', url: 'https://moviebox.live' },
                    { key: 'vidsrc', url: 'https://vidsrc2.ru' },
                    { key: 'tmdb', url: 'https://api.tmdb.org/3/configuration' },
                  ];
                  ALL_SCRAPER_ENGINES.forEach((eng) => runPingCheck(eng.key, eng.url));
                }}
              >
                <Text style={[styles.exportListLink, { color: accentColor }]}>⚡ PING ALL ENGINES</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.diagGrid}>
              {[
                { name: 'VegaMovies (Hollywood 1)', key: 'vegamovies', color: '#FFE500', url: resolvedDomains.vegamovies || 'https://vegamovies.navy' },
                { name: 'RogMovies (Bollywood 1)', key: 'rogmovies', color: '#FFE500', url: resolvedDomains.rogmovies || 'https://rogmovies.rest' },
                { name: 'MoviesMod (Hollywood 2)', key: 'moviesmod', color: '#00E5FF', url: resolvedDomains.moviesmod || 'https://moviesmod.at' },
                { name: 'TopMovies (Bollywood 2)', key: 'topmovies', color: '#00E5FF', url: resolvedDomains.topmovies || 'https://moviesleech.asia' },
                { name: 'FzMovies Engine', key: 'fzmovies', color: '#00FF66', url: 'https://fzmovies.net' },
                { name: 'BollyFlix Engine', key: 'bollyflix', color: '#FF0055', url: resolvedDomains.bollyflix || 'https://bollyflix.org' },
                { name: 'MovieBox Engine', key: 'moviebox', color: '#A855F7', url: 'https://moviebox.live' },
                { name: 'VidSrc Direct', key: 'vidsrc', color: '#3B82F6', url: 'https://vidsrc2.ru' },
                { name: 'TMDB API Gateway', key: 'tmdb', color: '#38EF7D', url: 'https://api.tmdb.org/3/configuration' },
              ].map((site) => {
                const ping = pingStatus[site.key];
                const isDisabled = disabledProviders.includes(site.key);
                return (
                  <View key={site.key} style={[styles.diagCard, isDisabled && { opacity: 0.5 }]}>
                    <View style={styles.diagHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.providerDot, { backgroundColor: site.color }]} />
                        <Text style={[styles.diagName, { color: isDisabled ? 'rgba(255,255,255,0.4)' : '#FFFFFF' }]}>
                          {site.name}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => runPingCheck(site.key, site.url)}>
                          <Ionicons name="refresh-circle-outline" size={20} color={site.color} />
                        </TouchableOpacity>
                        {site.key !== 'tmdb' && (
                          <Switch
                            value={!isDisabled}
                            onValueChange={async () => {
                              triggerSelectionHaptic();
                              const updated = isDisabled
                                ? disabledProviders.filter((k) => k !== site.key)
                                : [...disabledProviders, site.key];
                              setDisabledProviders(updated);
                              await setStorageString('@disabled_providers', JSON.stringify(updated));
                            }}
                            trackColor={{ false: '#1E1E24', true: `${site.color}80` }}
                            thumbColor={!isDisabled ? site.color : '#888'}
                          />
                        )}
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.diagStatus,
                        {
                          color: isDisabled
                            ? '#FF3B30'
                            : ping?.status === 'ok'
                            ? '#00FF88'
                            : ping?.status === 'error'
                            ? '#FF9900'
                            : 'rgba(255, 255, 255, 0.6)',
                        },
                      ]}
                    >
                      {isDisabled
                        ? 'DISABLED BY USER'
                        : !ping || ping.status === 'idle'
                        ? 'TAP REFRESH TO TEST'
                        : ping.status === 'checking'
                        ? 'TESTING LATENCY...'
                        : ping.status === 'ok'
                        ? `ONLINE (${ping.latency}ms)`
                        : 'OFFLINE / BLOCKED'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.divider} />

            {/* Default Quality & Timeout Preference */}
            <Text style={styles.sectionTitle}>DEFAULT DOWNLOAD QUALITY & TIMEOUT</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DEFAULT SCRAPE QUALITY TIER</Text>
              <View style={styles.accentRow}>
                {(['480p', '720p', '1080p', '4K'] as const).map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={[
                      styles.accentPill,
                      { borderColor: defaultQuality === q ? '#FFE500' : 'rgba(255,255,255,0.2)' },
                      defaultQuality === q && { backgroundColor: '#FFE500' },
                    ]}
                    onPress={() => {
                      triggerSelectionHaptic();
                      setDefaultQuality(q);
                      updateSetting('@default_quality', q);
                    }}
                  >
                    <Text style={[styles.accentPillText, defaultQuality === q ? { color: '#0A0A0C' } : { color: 'rgba(255,255,255,0.7)' }]}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>SCRAPER TIMEOUT LIMIT</Text>
              <View style={styles.accentRow}>
                {[
                  { label: '4s (FAST)', value: 4000 },
                  { label: '6s (BALANCED)', value: 6000 },
                  { label: '8s (DEEP)', value: 8000 },
                  { label: '10s (MAX)', value: 10000 },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      styles.accentPill,
                      { borderColor: scraperTimeoutMs === t.value ? accentColor : 'rgba(255,255,255,0.2)' },
                      scraperTimeoutMs === t.value && { backgroundColor: accentColor },
                    ]}
                    onPress={() => {
                      triggerSelectionHaptic();
                      setScraperTimeoutMs(t.value);
                      updateSetting('@scraper_timeout', String(t.value));
                    }}
                  >
                    <Text style={[styles.accentPillText, scraperTimeoutMs === t.value ? { color: '#0A0A0C' } : { color: 'rgba(255,255,255,0.7)' }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Theme & Accent Customization */}
            <Text style={styles.sectionTitle}>THEME & ACCENT COLOR</Text>
            <View style={styles.accentRow}>
              {['#FF2D55', '#00FF88', '#FFFFFF'].map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.accentPill,
                    { borderColor: color },
                    accentColor === color && { backgroundColor: color },
                  ]}
                  onPress={() => updateSetting(STORAGE_KEYS.ACCENT_COLOR, color)}
                >
                  <Text
                    style={[
                      styles.accentPillText,
                      accentColor === color ? { color: '#0A0A0C' } : { color },
                    ]}
                  >
                    {color === '#FF2D55' ? 'NEON RED' : color === '#00FF88' ? 'MATRIX GREEN' : 'NOTHING MONO'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            {/* TMDB Credentials */}
            <Text style={styles.sectionTitle}>TMDB API & PROXY CREDENTIALS</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TMDB API KEY (32-CHAR V3 KEY)</Text>
              <TextInput
                style={styles.textInput}
                value={tmdbKey}
                onChangeText={(val) => updateSetting(STORAGE_KEYS.TMDB_KEY, val)}
                placeholder="Enter API Key..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                secureTextEntry={true}
                autoCapitalize="none"
              />
            </View>

            {/* TMDB Proxy Toggle */}
            <View style={styles.switchGroup}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchLabel}>BYPASS INDIA ISP BLOCK</Text>
                <Text style={styles.switchSub}>Proxy TMDB requests to unblock Indian ISP filters</Text>
              </View>
              <Switch
                value={proxyEnabled}
                onValueChange={(val) =>
                  updateSetting(STORAGE_KEYS.PROXY_ENABLED, val ? 'true' : 'false')
                }
                trackColor={{ false: '#1E1E24', true: accentColor }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Video Player Modal */}
      {playerVisible && activeMediaItem && (
        <VideoPlayerModal
          visible={playerVisible}
          videoUrl={null}
          title={activeMediaItem.title}
          mediaItem={activeMediaItem}
          onClose={() => {
            setPlayerVisible(false);
            setActiveMediaItem(null);
          }}
          onDownloadPress={() => {
            setPlayerVisible(false);
            if (onNavigateToDownloader && activeMediaItem) {
              onNavigateToDownloader(
                activeMediaItem.title,
                activeMediaItem.mediaType || 'movie',
                '',
                activeMediaItem.releaseDate ? activeMediaItem.releaseDate.split('-')[0] : undefined
              );
            }
          }}
        />
      )}

      {/* Fallback JSON Text Restore Modal */}
      <Modal visible={fallbackModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>JSON RESTORE & BACKUP</Text>
              <TouchableOpacity onPress={() => setFallbackModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FF2D55" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Paste your HoloGram backup JSON payload below to restore your user database:
            </Text>
            <TextInput
              style={styles.jsonTextArea}
              multiline={true}
              value={jsonText}
              onChangeText={setJsonText}
              placeholder='{"version": 1, "userLists": {...}}'
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <TouchableOpacity style={styles.modalRestoreBtn} onPress={handleRestoreFromText}>
              <Text style={styles.modalRestoreBtnText}>CONFIRM RESTORE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  profileHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileMeta: {
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    fontFamily: 'Ndot57',
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.5,
  },
  nameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontFamily: 'Ndot57',
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  userNameInput: {
    fontFamily: 'Ndot57',
    fontSize: 15,
    color: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#FF2D55',
    paddingVertical: 0,
    minWidth: 80,
  },
  userSub: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1,
    marginTop: 2,
  },
  tasteBarRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tasteBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  tasteBadgeText: {
    fontFamily: 'Ndot57',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  primaryTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0A0A0C',
  },
  primaryTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF2D55',
  },
  primaryTabText: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  tabSection: {
    paddingTop: 16,
  },
  filterGridContainer: {
    gap: 8,
    marginBottom: 16,
  },
  filterGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterGridCapsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filterCapsuleActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  filterGridText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  listHeaderTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  exportListLink: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFE500',
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: GRID_ITEM_WIDTH,
    marginBottom: 12,
    position: 'relative',
  },
  gridPoster: {
    width: '100%',
    height: GRID_ITEM_WIDTH * 1.48,
    borderRadius: 6,
    backgroundColor: '#1E1E24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  gridBadgeContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(10, 10, 12, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  gridTitle: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFFFFF',
    marginTop: 6,
  },
  gridMeta: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 4,
    textAlign: 'center',
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  historyPoster: {
    width: 44,
    height: 66,
    borderRadius: 4,
    backgroundColor: '#1E1E24',
    marginRight: 12,
  },
  searchIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FFFFFF',
  },
  historyMeta: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 4,
  },
  historyProgressBg: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 1.5,
    marginTop: 6,
    overflow: 'hidden',
  },
  historyProgressFill: {
    height: '100%',
    backgroundColor: '#FF2D55',
  },
  sectionTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 10,
  },
  backupCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  backupCardTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FFE500',
  },
  backupCardSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    lineHeight: 14,
  },
  backupBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  exportBtn: {
    flex: 1,
    backgroundColor: '#FF2D55',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FFFFFF',
  },
  importBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  importBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  providerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  diagGrid: {
    gap: 10,
  },
  diagCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  diagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diagName: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
  },
  diagStatus: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 4,
  },
  accentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accentPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  accentPillText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  switchLabel: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
  },
  switchSub: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#141418',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Ndot57',
    fontSize: 13,
    color: '#FFFFFF',
  },
  modalSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    marginVertical: 10,
  },
  jsonTextArea: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#00FF88',
    fontFamily: 'NType82',
    fontSize: 11,
    height: 180,
    borderRadius: 6,
    padding: 10,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalRestoreBtn: {
    backgroundColor: '#FF2D55',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 14,
  },
  modalRestoreBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
  },
});
