/**
 * SwipeScreen.tsx — MOVIE TINDER
 *
 * Clean-room rewrite of the swipe deck.
 *
 * KEY ARCHITECTURAL DECISION:
 * SwipeCard is a self-contained component with its own PanResponder
 * and Animated.ValueXY. The parent only tracks currentIndex.
 * When currentIndex changes, React unmounts the old SwipeCard (via key prop)
 * and mounts a fresh one — no shared animation state, no stuck cards.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDeviceTopInset } from '../utils/SafeAreaCache';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getTrendingMovies,
  discoverMediaWithFilters,
  TMDBMediaItem,
} from '../utils/tmdb';
import {
  getTasteProfile,
  recordUserAction,
  rankItemsByTaste,
  getPersistedLikedItems,
  savePersistedLikedItems,
} from '../utils/TasteEngine';
import SwipeCard, { SwipeDirection } from '../components/SwipeCard';
import { SwiparrDetailSheet } from '../components/SwiparrDetailSheet';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { FilterDrawerModal, FilterOptions } from '../components/FilterDrawerModal';
import { SkeletonCard } from '../components/SkeletonCard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Back Card: purely visual, no gesture ─────────────────────────────────────
const BackCard: React.FC<{ card: TMDBMediaItem }> = ({ card }) => (
  <View style={styles.backCardContainer}>
    <Image source={{ uri: card.posterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    <View style={styles.backCardDim} />
  </View>
);

interface SwipeScreenProps {
  onNavigateToDownloader?: (query: string, mediaType?: string, imdbId?: string, year?: string) => void;
}

export default function SwipeScreen({ onNavigateToDownloader }: SwipeScreenProps = {}) {
  const insets                             = useSafeAreaInsets();
  const [cards, setCards]                   = useState<TMDBMediaItem[]>([]);
  const [currentIndex, setCurrentIndex]     = useState(0);
  const [swipedHistory, setSwipedHistory]   = useState<number[]>([]);
  const [likedList, setLikedList]           = useState<TMDBMediaItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [detailItem, setDetailItem]         = useState<TMDBMediaItem | null>(null);
  const [activeFilters, setActiveFilters]   = useState<FilterOptions | null>(null);
  const [activeTab, setActiveTab]           = useState<'deck' | 'likes'>('deck');
  const [filterVisible, setFilterVisible]   = useState(false);
  const [playerVisible, setPlayerVisible]   = useState(false);
  const [streamItem, setStreamItem]         = useState<TMDBMediaItem | null>(null);

  // Heart explosion overlay
  const [showHeart, setShowHeart]           = useState(false);
  const heartScale                          = useRef(new Animated.Value(0)).current;

  // ─── Load cards ──────────────────────────────────────────────────────
  const loadCards = useCallback(async (filters?: FilterOptions | null) => {
    setLoading(true);
    setCurrentIndex(0);
    setSwipedHistory([]);
    try {
      const f = filters !== undefined ? filters : activeFilters;
      const raw = f ? await discoverMediaWithFilters(f) : await getTrendingMovies();
      const profile = await getTasteProfile();
      setCards(rankItemsByTaste(raw, profile));
    } catch (e) {
      console.error('SwipeScreen: loadCards failed', e);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    loadCards();
    // Load persisted liked list from AsyncStorage on app restore
    getPersistedLikedItems().then(persisted => {
      if (persisted && persisted.length > 0) {
        setLikedList(persisted);
      }
    });
  }, []);

  // ─── Derived card refs ────────────────────────────────────────────────
  const currentCard = cards[currentIndex];
  const nextCard    = cards[currentIndex + 1];

  // ─── Swipe handlers ───────────────────────────────────────────────────
  const handleSwipe = useCallback((direction: SwipeDirection) => {
    const card = cards[currentIndex];
    if (!card) return;

    recordUserAction(card, direction === 'right' ? 'liked' : 'disliked');

    if (direction === 'right') {
      setLikedList(prev => {
        const next = prev.some(i => i.id === card.id) ? prev : [card, ...prev];
        savePersistedLikedItems(next);
        return next;
      });
    }

    setSwipedHistory(prev => [...prev, currentIndex]);
    setCurrentIndex(prev => prev + 1);
  }, [cards, currentIndex]);

  // ─── Rewind ───────────────────────────────────────────────────────────
  const handleRewind = useCallback(() => {
    if (swipedHistory.length === 0) return;
    const lastIndex = swipedHistory[swipedHistory.length - 1];
    setSwipedHistory(prev => prev.slice(0, -1));
    setCurrentIndex(lastIndex);
  }, [swipedHistory]);

  // ─── Love / Heart (triggered by button OR double-tap) ─────────────────
  const triggerLove = useCallback(() => {
    const card = cards[currentIndex];
    if (!card) return;

    recordUserAction(card, 'loved');
    setLikedList(prev => {
      const next = prev.some(i => i.id === card.id) ? prev : [card, ...prev];
      savePersistedLikedItems(next);
      return next;
    });

    // Heart explosion animation
    setShowHeart(true);
    heartScale.setValue(0.2);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, friction: 3, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      setShowHeart(false);
      // Advance the deck after heart animation
      setSwipedHistory(prev => [...prev, currentIndex]);
      setCurrentIndex(prev => prev + 1);
    });
  }, [cards, currentIndex, heartScale]);

  // ─── Guide dialog ─────────────────────────────────────────────────────
  const showGuide = () => {
    Alert.alert(
      '🎬 MOVIE TINDER',
      '👉  Swipe Right  →  LIKE\n' +
      '👈  Swipe Left   →  DISLIKE\n' +
      '💖  Double-Tap or ♥ Button  →  LOVE\n' +
      '↩  Rewind button  →  Undo last swipe\n' +
      '🎛  Filter button  →  Filter by language, year, genre, rating\n\n' +
      'HoloGram learns your taste in real-time!'
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────
  const deckFinished = !loading && currentIndex >= cards.length && cards.length > 0;

  return (
    <View style={[styles.container, { paddingTop: getDeviceTopInset() }]}>
      {/* Dynamic Ambient Poster Blur Backdrop Tint */}
      {currentCard && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Image
            source={{ uri: currentCard.posterUrl || currentCard.backdropUrl }}
            style={styles.backdrop}
            blurRadius={22}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(10,10,14,0.15)', 'rgba(10,10,14,0.48)', 'rgba(10,10,14,0.94)']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
      )}

      {/* ── Header ── */}
      <View style={styles.header}>
        {/* Brand row */}
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>MOVIE TINDER</Text>
          <TouchableOpacity style={styles.infoBtn} onPress={showGuide}>
            <Ionicons name="help-circle-outline" size={16} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

        {/* Tab toggle */}
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'deck' && styles.tabPillActive]}
            onPress={() => setActiveTab('deck')}
          >
            <Ionicons
              name="layers-outline"
              size={16}
              color={activeTab === 'deck' ? '#FFF' : 'rgba(255,255,255,0.35)'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'likes' && styles.tabPillActive]}
            onPress={() => setActiveTab('likes')}
          >
            <Ionicons
              name="heart-outline"
              size={16}
              color={activeTab === 'likes' ? '#FFF' : 'rgba(255,255,255,0.35)'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Filter HUD */}
      {activeFilters && (
        <View style={styles.hud}>
          <Text style={styles.hudText}>
            {activeFilters.mediaType.toUpperCase()} • {activeFilters.selectedLanguage.toUpperCase()} • ★{activeFilters.minRating.toFixed(1)}+ {activeFilters.selectedYear ? `• ${activeFilters.selectedYear}` : ''}
          </Text>
        </View>
      )}

      {/* ── Content ── */}
      {activeTab === 'likes' ? (
        /* ── Liked list ── */
        <View style={styles.flex1pad}>
          <Text style={styles.likesHeader}>SAVED & LIKED ({likedList.length})</Text>
          {likedList.length === 0 ? (
            <View style={styles.emptyCenter}>
              <Ionicons name="heart-dislike-outline" size={48} color="rgba(255,255,255,0.25)" />
              <Text style={styles.emptyTitle}>No Liked Movies Yet</Text>
              <Text style={styles.emptySub}>Swipe right or tap ♥ to save movies here.</Text>
            </View>
          ) : (
            <FlatList
              data={likedList}
              keyExtractor={item => `liked-${item.id}`}
              numColumns={3}
              contentContainerStyle={{ paddingBottom: 40 }}
              columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.likeCard}
                  onPress={() => setDetailItem(item)}
                >
                  <Image source={{ uri: item.posterUrl }} style={styles.likePoster} />
                  <Text style={styles.likeTitle} numberOfLines={1}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        /* ── Deck ── */
        <View style={styles.deckArea}>
          {loading ? (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <SkeletonCard width={SCREEN_WIDTH - 32} height={SCREEN_HEIGHT * 0.62} borderRadius={16} />
            </View>
          ) : deckFinished ? (
            <View style={styles.emptyCenter}>
              <Ionicons name="sparkles-outline" size={52} color="#FF2D55" />
              <Text style={styles.emptyTitle}>Deck Finished!</Text>
              <Text style={styles.emptySub}>You've seen everything. Reload for more.</Text>
              <TouchableOpacity style={styles.reloadBtn} onPress={() => loadCards()}>
                <Text style={styles.reloadText}>RELOAD DECK</Text>
              </TouchableOpacity>
            </View>
          ) : !currentCard ? (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <SkeletonCard width={SCREEN_WIDTH - 32} height={SCREEN_HEIGHT * 0.62} borderRadius={16} />
            </View>
          ) : (
            <View style={styles.cardStack}>

              {/* ── Back card (static, visual only) ── */}
              {nextCard && (
                <View style={styles.backCardWrapper}>
                  <BackCard card={nextCard} />
                </View>
              )}

              {/* ── Front card ── */}
              <SwipeCard
                key={`swipe-card-${currentCard.id}`}
                card={currentCard}
                onSwipe={handleSwipe}
                onPress={() => setDetailItem(currentCard)}
                onDoubleTap={triggerLove}
              />

              {/* Heart explosion overlay */}
              {showHeart && (
                <Animated.View
                  style={[styles.heartOverlay, { transform: [{ scale: heartScale }] }]}
                  pointerEvents="none"
                >
                  <Ionicons name="heart" size={110} color="#FF2D55" />
                </Animated.View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Sleek Glass Bottom Controls Bar (Rewind | Heart | Filter) ── */}
      {activeTab === 'deck' && currentIndex < cards.length && !loading && (
        <View style={styles.controlsRow}>
          {/* Rewind */}
          <TouchableOpacity
            style={[styles.ctrlSmall, swipedHistory.length === 0 && styles.ctrlDisabled]}
            onPress={handleRewind}
            disabled={swipedHistory.length === 0}
          >
            <Ionicons
              name="play-back"
              size={22}
              color={swipedHistory.length > 0 ? '#FFF' : 'rgba(255,255,255,0.25)'}
            />
          </TouchableOpacity>

          {/* Glowing White Heart */}
          <TouchableOpacity style={[styles.ctrlLarge, styles.ctrlHeart]} onPress={triggerLove}>
            <Ionicons name="heart" size={32} color="#0A0A0C" />
          </TouchableOpacity>

          {/* Filter */}
          <TouchableOpacity style={styles.ctrlSmall} onPress={() => setFilterVisible(true)}>
            <Ionicons name="options-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Modals ── */}
      <FilterDrawerModal
        visible={filterVisible}
        initialFilters={activeFilters || undefined}
        onClose={() => setFilterVisible(false)}
        onApplyFilters={(filters) => {
          setActiveFilters(filters);
          loadCards(filters);
        }}
      />

      <SwiparrDetailSheet
        visible={detailItem !== null}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onSeeMorePress={(item) => {
          setStreamItem(item);
          setPlayerVisible(true);
        }}
      />

      {streamItem && (
        <VideoPlayerModal
          visible={playerVisible}
          videoUrl={null}
          title={streamItem.title}
          mediaItem={streamItem}
          onClose={() => setPlayerVisible(false)}
          onDownloadPress={() => {
            setPlayerVisible(false);
            if (onNavigateToDownloader && streamItem) {
              onNavigateToDownloader(
                streamItem.title,
                streamItem.mediaType || 'movie',
                '',
                streamItem.releaseDate ? streamItem.releaseDate.split('-')[0] : undefined
              );
            }
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  flex1pad: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    paddingVertical: 10,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },
  brandText: {
    fontFamily: 'Ndot57',
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  infoBtn: {
    paddingLeft: 2,
  },
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabPill: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tabPillActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2A2A32',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // ── HUD ──
  hud: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: 'rgba(255,45,85,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,45,85,0.18)',
  },
  hudText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FF2D55',
    letterSpacing: 1,
  },

  // ── Deck area ──
  deckArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardStack: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_HEIGHT * 0.62,
    position: 'relative',
  },

  // ── Back card ──
  backCardWrapper: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    overflow: 'hidden',
    transform: [{ scale: 0.94 }, { translateY: 14 }],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  backCardContainer: {
    flex: 1,
    backgroundColor: '#121216',
  },
  backCardDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,14,0.38)',
  },

  // ── Heart overlay ──
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  // ── Bottom controls ──
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    paddingVertical: 14,
    paddingBottom: 22,
  },
  ctrlSmall: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ctrlDisabled: {
    opacity: 0.3,
  },
  ctrlLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctrlHeart: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },

  // ── Liked list ──
  likesHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  likeCard: {
    flex: 1,
    height: 162,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#141418',
  },
  likePoster: {
    width: '100%',
    height: 132,
  },
  likeTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  // ── Empty states ──
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  emptySub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  reloadBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 8,
  },
  reloadText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 1.2,
  },
});
