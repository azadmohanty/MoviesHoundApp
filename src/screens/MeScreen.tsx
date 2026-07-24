import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveAllDomains } from '../utils/resolver';
import {
  exportCombinedBackup,
  importCombinedBackup,
  exportSingleList,
  restoreBackupFromJSON,
  createBackupPayload,
} from '../utils/DatabaseBackup';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import {
  getList,
  STORAGE_KEYS,
  subscribeStorageChanges,
  runLegacyMigrationIfNeeded,
  setStorageString,
  getStorageString,
  clearVolatileCache,
} from '../utils/DatabaseStorage';

export default function MeScreen() {
  const [activeSubTab, setActiveSubTab] = useState<
    'lists' | 'history' | 'settings' | 'backup'
  >('lists');
  const [selectedListTab, setSelectedListTab] = useState<
    'watchLater' | 'watched' | 'liked' | 'loved' | 'disliked'
  >('watchLater');

  // Lists state
  const [watchLater, setWatchLater] = useState<any[]>([]);
  const [watched, setWatched] = useState<any[]>([]);
  const [liked, setLiked] = useState<any[]>([]);
  const [loved, setLoved] = useState<any[]>([]);
  const [disliked, setDisliked] = useState<any[]>([]);
  const [watchHistory, setWatchHistory] = useState<any[]>([]);

  // Settings & Theme states
  const [accentColor, setAccentColor] = useState('#FF2D55');
  const [tmdbKey, setTmdbKey] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [customApi, setCustomApi] = useState('');
  const [showDnsGuide, setShowDnsGuide] = useState(false);

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
        key,
        proxy,
        api,
        accent,
      ] = await Promise.all([
        getList(STORAGE_KEYS.WATCHLIST),
        getList(STORAGE_KEYS.WATCHED),
        getList(STORAGE_KEYS.LIKED),
        getList(STORAGE_KEYS.LOVED),
        getList(STORAGE_KEYS.DISLIKED),
        getList(STORAGE_KEYS.HISTORY),
        getStorageString(STORAGE_KEYS.TMDB_KEY),
        getStorageString(STORAGE_KEYS.PROXY_ENABLED),
        getStorageString(STORAGE_KEYS.PROXY_API),
        getStorageString(STORAGE_KEYS.ACCENT_COLOR, '#FF2D55'),
      ]);

      setWatchLater(wl);
      setWatched(wt);
      setLiked(lk);
      setLoved(lv);
      setDisliked(dl);
      setWatchHistory(hi);

      if (key) setTmdbKey(key);
      setProxyEnabled(proxy === 'true');
      if (api) setCustomApi(api);
      if (accent) setAccentColor(accent);
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
      await AsyncStorage.removeItem('@watch_history');
      await AsyncStorage.removeItem('@search_history');
      setWatchHistory([]);
      Alert.alert('History Cleared', 'Your local click & watch history has been reset.');
    } catch (e) {
      Alert.alert('Error', 'Failed to clear history.');
    }
  };

  const handleRemoveFromList = async (item: any) => {
    const cur = getCurrentList();
    const filtered = cur.data.filter((i: any) => i.id !== item.id);

    let storageKey = '@watchlist';
    if (selectedListTab === 'watched') storageKey = '@watched_list';
    if (selectedListTab === 'liked') storageKey = '@liked_list';
    if (selectedListTab === 'loved') storageKey = '@loved_list';
    if (selectedListTab === 'disliked') storageKey = '@disliked_list';

    await AsyncStorage.setItem(storageKey, JSON.stringify(filtered));
    loadAllUserData();
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
    if (!jsonText.trim()) return;
    try {
      const parsed = JSON.parse(jsonText);
      const res = await restoreBackupFromJSON(parsed);
      Alert.alert(res.success ? 'Success' : 'Error', res.message);
      if (res.success) {
        setFallbackModalVisible(false);
        setJsonText('');
        loadAllUserData();
      }
    } catch (e: any) {
      Alert.alert('Invalid JSON', 'Could not parse JSON payload.');
    }
  };

  const getCurrentList = () => {
    switch (selectedListTab) {
      case 'watchLater':
        return { name: 'Watch Later', data: watchLater };
      case 'watched':
        return { name: 'Watched', data: watched };
      case 'liked':
        return { name: 'Liked', data: liked };
      case 'loved':
        return { name: 'Loved', data: loved };
      case 'disliked':
        return { name: 'Disliked', data: disliked };
    }
  };

  const handleExportCurrentList = () => {
    const cur = getCurrentList();
    exportSingleList(selectedListTab, cur.name, cur.data);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: accentColor }]}>
            <Text style={styles.avatarText}>H</Text>
          </View>
          <View>
            <Text style={styles.profileName}>HoloGram Member</Text>
            <Text style={[styles.profileRole, { color: accentColor }]}>
              PREMIUM DISCOVERY SUITE
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Counter Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{watched.length}</Text>
          <Text style={styles.statLabel}>WATCHED</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{watchLater.length}</Text>
          <Text style={styles.statLabel}>WATCHLIST</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{loved.length}</Text>
          <Text style={styles.statLabel}>LOVED</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{liked.length}</Text>
          <Text style={styles.statLabel}>LIKED</Text>
        </View>
      </View>

      {/* Main Sub Navigation Bar */}
      <View style={styles.subNavBar}>
        {(['lists', 'history', 'settings', 'backup'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.subNavTab,
              activeSubTab === tab && { borderBottomColor: accentColor, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveSubTab(tab)}
          >
            <Text
              style={[
                styles.subNavText,
                activeSubTab === tab && { color: accentColor, fontWeight: 'bold' },
              ]}
            >
              {tab === 'settings' ? 'SETTINGS & HEALTH' : tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* SUBTAB 1: 5-LIST MANAGER */}
        {activeSubTab === 'lists' && (
          <View style={styles.sectionContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
              {(['watchLater', 'watched', 'liked', 'loved', 'disliked'] as const).map(
                (lKey) => (
                  <TouchableOpacity
                    key={lKey}
                    style={[
                      styles.listPill,
                      selectedListTab === lKey && {
                        backgroundColor: 'rgba(255, 45, 85, 0.15)',
                        borderColor: accentColor,
                      },
                    ]}
                    onPress={() => setSelectedListTab(lKey)}
                  >
                    <Text
                      style={[
                        styles.listPillText,
                        selectedListTab === lKey && { color: accentColor, fontWeight: 'bold' },
                      ]}
                    >
                      {lKey === 'watchLater'
                        ? '🕒 WATCH LATER'
                        : lKey === 'watched'
                        ? '✓ WATCHED'
                        : lKey === 'liked'
                        ? '👍 LIKED'
                        : lKey === 'loved'
                        ? '💖 LOVED'
                        : '👎 DISLIKED'}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </ScrollView>

            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>
                {getCurrentList().name.toUpperCase()} ({getCurrentList().data.length})
              </Text>
              <TouchableOpacity onPress={handleExportCurrentList}>
                <Text style={styles.actionLinkText}>EXPORT LIST .JSON</Text>
              </TouchableOpacity>
            </View>

            {getCurrentList().data.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="folder-open-outline" size={36} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>No items added to {getCurrentList().name} yet.</Text>
              </View>
            ) : (
              getCurrentList().data.map((item: any, idx: number) => (
                <View key={idx} style={styles.listItemCard}>
                  <TouchableOpacity
                    style={styles.listItemLeft}
                    onPress={() => {
                      setActiveMediaItem(item);
                      setPlayerVisible(true);
                    }}
                  >
                    <Image
                      source={{ uri: item.posterUrl || item.poster_path }}
                      style={styles.itemPoster}
                    />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title || item.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {item.mediaType?.toUpperCase() || 'MOVIE'} • ★ {item.rating || 'N/A'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemoveFromList(item)}
                  >
                    <Text style={styles.removeBtnText}>REMOVE</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* SUBTAB 2: WATCH HISTORY & DATA MANAGEMENT */}
        {activeSubTab === 'history' && (
          <View style={styles.sectionContainer}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.sectionTitle}>
                WATCH HISTORY TIMELINE ({watchHistory.length})
              </Text>
              {watchHistory.length > 0 && (
                <TouchableOpacity onPress={clearHistory}>
                  <Text style={[styles.actionLinkText, { color: '#FF3B30' }]}>CLEAR HISTORY</Text>
                </TouchableOpacity>
              )}
            </View>

            {watchHistory.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="time-outline" size={36} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>No watch history logged yet.</Text>
              </View>
            ) : (
              watchHistory.map((hItem: any, idx: number) => (
                <View key={idx} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {hItem.item?.title || 'Unknown Video'}
                    </Text>
                    <Text style={styles.historyTime}>
                      {hItem.lastWatchedAt ? new Date(hItem.lastWatchedAt).toLocaleDateString() : ''}
                    </Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${hItem.progressPercent || 0}%`,
                          backgroundColor: accentColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressPercentText, { color: accentColor }]}>
                    {Math.round(hItem.progressPercent || 0)}% COMPLETED
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* SUBTAB 3: SETTINGS & SCRAPER HEALTH DIAGNOSTICS */}
        {activeSubTab === 'settings' && (
          <View style={styles.sectionContainer}>
            {/* Theme Customization */}
            <Text style={styles.sectionTitle}>THEME ACCENT COLOR</Text>
            <View style={styles.accentRow}>
              {(['#FF2D55', '#00FF88', '#FFFFFF'] as const).map((color) => (
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
                    {color === '#FF2D55' ? 'RED' : color === '#00FF88' ? 'GREEN' : 'MONO'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            {/* TMDB Credentials */}
            <Text style={styles.sectionTitle}>TMDB CREDENTIALS</Text>
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
              <View>
                <Text style={styles.switchLabel}>BYPASS INDIA ISP BLOCK</Text>
                <Text style={styles.switchSub}>Proxy TMDB requests to unblock connections</Text>
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

            <View style={styles.divider} />

            {/* Diagnostics & Scrapers Health */}
            <Text style={styles.sectionTitle}>DIAGNOSTICS & SCRAPERS HEALTH</Text>
            <View style={styles.diagnosticsContainer}>
              {Object.entries(resolvedDomains).map(([key, domain]) => (
                <View key={key} style={styles.diagnosticRow}>
                  <View style={styles.diagnosticDetails}>
                    <Text style={styles.diagnosticName}>{key.toUpperCase()}</Text>
                    <Text style={styles.diagnosticUrl} numberOfLines={1}>
                      {domain}
                    </Text>
                  </View>
                  <View style={styles.diagnosticActions}>
                    {pingStatus[key]?.status === 'checking' && (
                      <ActivityIndicator size="small" color={accentColor} style={{ marginRight: 6 }} />
                    )}
                    {pingStatus[key]?.status === 'ok' && (
                      <Text style={styles.pingSuccess}>{pingStatus[key].latency}ms</Text>
                    )}
                    {pingStatus[key]?.status === 'error' && (
                      <Text style={styles.pingError}>DEAD</Text>
                    )}
                    <TouchableOpacity
                      style={[styles.pingButton, { borderColor: accentColor }]}
                      onPress={() => runPingCheck(key, domain)}
                    >
                      <Text style={[styles.pingButtonText, { color: accentColor }]}>PING</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            {/* DNS Troubleshooting Guide */}
            <TouchableOpacity
              style={styles.dnsToggle}
              onPress={() => setShowDnsGuide(!showDnsGuide)}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color="#00E5FF" />
              <Text style={styles.dnsToggleText}>
                {showDnsGuide ? 'HIDE DNS TROUBLESHOOTER' : 'SHOW CLOUD DNS & UNBLOCKING GUIDE'}
              </Text>
            </TouchableOpacity>

            {showDnsGuide && (
              <View style={styles.dnsBox}>
                <Text style={styles.dnsTitle}>Cloudflare / AdGuard DNS Guide:</Text>
                <Text style={styles.dnsText}>
                  1. Open Phone Settings ➡️ Network & Internet ➡️ Private DNS.{'\n'}
                  2. Select Private DNS provider hostname.{'\n'}
                  3. Enter: `one.one.one.one` (Cloudflare) or `dns.adguard.com`.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* SUBTAB 4: JSON DATABASE BACKUP */}
        {activeSubTab === 'backup' && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>OFFLINE JSON DATABASE BACKUP</Text>
            <Text style={styles.backupSub}>
              Export all your lists, watch history, settings, and search history into a single
              portable `.json` file, or restore a saved backup.
            </Text>

            <View style={styles.backupBtnRow}>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExportBackup}>
                <Ionicons name="share-outline" size={18} color="#000000" />
                <Text style={styles.exportBtnText}>EXPORT BACKUP (.JSON)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.importBtn} onPress={handleImportBackup}>
                <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                <Text style={styles.importBtnText}>RESTORE BACKUP</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fallback JSON Text Modal */}
      <Modal
        visible={fallbackModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFallbackModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>PASTE BACKUP JSON PAYLOAD</Text>
              <TouchableOpacity onPress={() => setFallbackModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalJsonInput}
              multiline={true}
              placeholder="Paste JSON string here..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={jsonText}
              onChangeText={setJsonText}
            />
            <TouchableOpacity style={styles.modalRestoreBtn} onPress={handleRestoreFromText}>
              <Text style={styles.modalRestoreBtnText}>RESTORE FROM TEXT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stream Video Player Modal */}
      {activeMediaItem && (
        <VideoPlayerModal
          visible={playerVisible}
          videoUrl={null}
          title={activeMediaItem.title || activeMediaItem.name}
          mediaItem={activeMediaItem}
          onClose={() => setPlayerVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'Ndot57',
    fontSize: 20,
    color: '#FFFFFF',
  },
  profileName: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  profileRole: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    letterSpacing: 1,
  },
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 12,
    backgroundColor: '#121216',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: 'Ndot57',
    fontSize: 16,
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: '60%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignSelf: 'center',
  },
  subNavBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  subNavTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  subNavText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionContainer: {
    gap: 14,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
  },
  pillRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  listPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1E1E24',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  listPillText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLinkText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FFE500',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  emptyText: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  listItemCard: {
    flexDirection: 'row',
    backgroundColor: '#16161C',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  itemPoster: {
    width: 40,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#1E1E24',
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: '#FFFFFF',
  },
  itemMeta: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  removeBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  removeBtnText: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: '#FF3B30',
  },
  historyCard: {
    backgroundColor: '#16161C',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: '#FFFFFF',
    flex: 1,
  },
  historyTime: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
  },
  progressPercentText: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
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
    fontFamily: 'LetteraMono',
    fontSize: 10,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 10,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  textInput: {
    backgroundColor: '#16161C',
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 40,
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16161C',
    padding: 12,
    borderRadius: 8,
  },
  switchLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: '#FFFFFF',
  },
  switchSub: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  diagnosticsContainer: {
    gap: 8,
  },
  diagnosticRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16161C',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  diagnosticDetails: {
    flex: 1,
  },
  diagnosticName: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#FFFFFF',
  },
  diagnosticUrl: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  diagnosticActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pingSuccess: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#34C759',
  },
  pingError: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#FF3B30',
  },
  pingButton: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pingButtonText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
  },
  dnsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  dnsToggleText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#00E5FF',
  },
  dnsBox: {
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  dnsTitle: {
    fontFamily: 'Ndot55',
    fontSize: 10,
    color: '#00E5FF',
    marginBottom: 4,
  },
  dnsText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 16,
  },
  backupSub: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 16,
  },
  backupBtnRow: {
    gap: 12,
    marginTop: 10,
  },
  exportBtn: {
    flexDirection: 'row',
    backgroundColor: '#FFE500',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  exportBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#000000',
    letterSpacing: 1,
  },
  importBtn: {
    flexDirection: 'row',
    backgroundColor: '#1E1E24',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  importBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalBox: {
    backgroundColor: '#141418',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FFFFFF',
  },
  modalCloseText: {
    color: '#FF2D55',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalJsonInput: {
    backgroundColor: '#0A0A0C',
    borderRadius: 6,
    height: 160,
    padding: 10,
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#FFFFFF',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  modalRestoreBtn: {
    backgroundColor: '#FF2D55',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalRestoreBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
  },
});
