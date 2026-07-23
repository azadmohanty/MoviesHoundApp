import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput
} from 'react-native';
import { getUserLists, UserListsData } from '../utils/userListsStorage';
import { exportDatabaseToJson, importDatabaseFromJson } from '../utils/DatabaseBackup';
import { TMDBMediaItem } from '../utils/tmdb';
import { VideoPlayerModal } from '../components/VideoPlayerModal';

export const MeScreen: React.FC = () => {
  const [userLists, setUserLists] = useState<UserListsData>({
    watchLater: [],
    watched: [],
    liked: [],
    loved: [],
    disliked: [],
  });
  const [activeTab, setActiveTab] = useState<keyof UserListsData>('loved');
  const [selectedMedia, setSelectedMedia] = useState<TMDBMediaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // Import Modal State
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    const data = await getUserLists();
    setUserLists(data);
  };

  const handleExport = async () => {
    setBackingUp(true);
    const res = await exportDatabaseToJson();
    setBackingUp(false);
  };

  const handleImportSubmit = async () => {
    if (!importJsonText.trim()) return;
    setBackingUp(true);
    const res = await importDatabaseFromJson(importJsonText);
    setBackingUp(false);

    if (res.success) {
      Alert.alert('Import Successful!', res.message || 'Database restored.');
      setImportModalVisible(false);
      setImportJsonText('');
      loadLists();
    } else {
      Alert.alert('Import Failed', res.error || 'Invalid JSON format.');
    }
  };

  const currentListItems = userLists[activeTab] || [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>USER PROFILE & DATABASE</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: '#FF2D55' }]}>{userLists.loved.length}</Text>
            <Text style={styles.statLabel}>💖 LOVED</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: '#4CD964' }]}>{userLists.liked.length}</Text>
            <Text style={styles.statLabel}>👍 LIKED</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: '#FFE500' }]}>{userLists.watchLater.length}</Text>
            <Text style={styles.statLabel}>📌 WATCH LATER</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={[styles.statNum, { color: '#007AFF' }]}>{userLists.watched.length}</Text>
            <Text style={styles.statLabel}>✅ WATCHED</Text>
          </View>
        </View>

        {/* Database Backup & Restore Box */}
        <View style={styles.backupBox}>
          <Text style={styles.backupTitle}>📦 LOCAL DATABASE BACKUP & RESTORE</Text>
          <Text style={styles.backupSub}>
            Export your 5 lists, settings, and taste profile to a clean JSON file, or restore on a fresh install.
          </Text>

          {backingUp ? (
            <ActivityIndicator size="small" color="#FF2D55" style={{ marginVertical: 10 }} />
          ) : (
            <View style={styles.backupBtnRow}>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                <Text style={styles.exportBtnTxt}>📤 EXPORT JSON</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.importBtn} onPress={() => setImportModalVisible(true)}>
                <Text style={styles.importBtnTxt}>📥 IMPORT JSON</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Import JSON Modal */}
        <Modal visible={importModalVisible} transparent animationType="fade" onRequestClose={() => setImportModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#141418', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' }}>
              <Text style={{ fontFamily: 'Ndot57', fontSize: 13, color: '#FFFFFF', marginBottom: 8 }}>📥 RESTORE JSON DATABASE</Text>
              <Text style={{ fontFamily: 'LetteraMono', fontSize: 10, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 12 }}>
                Paste your exported MoviesHound JSON backup text below to restore your 5 lists and settings:
              </Text>

              <TextInput
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 8,
                  padding: 12,
                  color: '#FFFFFF',
                  fontFamily: 'LetteraMono',
                  fontSize: 10,
                  height: 120,
                  textAlignVertical: 'top',
                  marginBottom: 16
                }}
                multiline
                placeholder="Paste backup JSON string here..."
                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                value={importJsonText}
                onChangeText={setImportJsonText}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, alignItems: 'center' }}
                  onPress={() => setImportModalVisible(false)}
                >
                  <Text style={{ fontFamily: 'Ndot57', fontSize: 10, color: '#FFFFFF' }}>CANCEL</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, backgroundColor: '#FF2D55', borderRadius: 6, alignItems: 'center' }}
                  onPress={handleImportSubmit}
                >
                  <Text style={{ fontFamily: 'Ndot57', fontSize: 10, color: '#FFFFFF' }}>RESTORE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 5-List Selector Row */}
        <Text style={styles.sectionHeading}>YOUR SAVED LISTS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listTabScroll}>
          {([
            { id: 'loved', label: '💖 LOVED' },
            { id: 'liked', label: '👍 LIKED' },
            { id: 'watchLater', label: '📌 WATCH LATER' },
            { id: 'watched', label: '✅ WATCHED' },
            { id: 'disliked', label: '👎 DISLIKED' },
          ] as const).map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.listTabPill, activeTab === tab.id && styles.listTabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.listTabTxt, activeTab === tab.id && styles.listTabTxtActive]}>
                {tab.label} ({userLists[tab.id]?.length || 0})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Items Grid */}
        <View style={styles.itemsGrid}>
          {currentListItems.length > 0 ? (
            currentListItems.map(item => (
              <TouchableOpacity
                key={`me-item-${item.id}`}
                style={styles.mediaCard}
                onPress={() => {
                  setSelectedMedia(item);
                  setModalVisible(true);
                }}
              >
                <Image
                  source={{ uri: item.posterUrl || item.backdropUrl }}
                  style={styles.mediaPoster}
                  resizeMode="cover"
                />
                <Text style={styles.mediaTitle} numberOfLines={1}>{item.title}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTxt}>NO ITEMS IN THIS LIST YET.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Stream / Detail Modal */}
      <VideoPlayerModal
        visible={modalVisible}
        videoUrl={selectedMedia ? selectedMedia.posterUrl : null}
        title={selectedMedia ? selectedMedia.title : ''}
        mediaItem={selectedMedia}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNum: {
    fontFamily: 'Ndot57',
    fontSize: 16,
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: 'NType82Mono',
    fontSize: 7,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  backupBox: {
    backgroundColor: 'rgba(255, 45, 85, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.2)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  backupTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FF2D55',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  backupSub: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 14,
    marginBottom: 12,
  },
  backupBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exportBtn: {
    flex: 1,
    backgroundColor: '#FF2D55',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportBtnTxt: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFFFFF',
  },
  importBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  importBtnTxt: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFFFFF',
  },
  sectionHeading: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  listTabScroll: {
    gap: 8,
    marginBottom: 16,
  },
  listTabPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  listTabActive: {
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
  },
  listTabTxt: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  listTabTxtActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 30,
  },
  mediaCard: {
    width: '31%',
    marginBottom: 8,
  },
  mediaPoster: {
    width: '100%',
    height: 140,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 4,
  },
  mediaTitle: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: '#FFFFFF',
  },
  emptyBox: {
    width: '100%',
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyTxt: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
  },
});
