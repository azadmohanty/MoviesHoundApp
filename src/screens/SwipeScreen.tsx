import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
} from '../utils/TasteEngine';
import { SwiparrDetailSheet } from '../components/SwiparrDetailSheet';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { FilterDrawerModal, FilterOptions } from '../components/FilterDrawerModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 0.2 * SCREEN_WIDTH;
const SWIPE_VELOCITY = 0.3;

export default function SwipeScreen() {
  const [cards, setCards] = useState<TMDBMediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [swipedHistory, setSwipedHistory] = useState<number[]>([]);
  const [likedList, setLikedList] = useState<TMDBMediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailItem, setDetailItem] = useState<TMDBMediaItem | null>(null);

  // Active filters state
  const [activeFilters, setActiveFilters] = useState<FilterOptions | null>(null);

  // Mode: 'deck' or 'likes'
  const [activeTabMode, setActiveTabMode] = useState<'deck' | 'likes'>('deck');

  // Filter Drawer
  const [filterVisible, setFilterVisible] = useState<boolean>(false);

  // Heart Explosion Animation
  const [showHeartExplosion, setShowHeartExplosion] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;

  // Stream Player Modal
  const [playerVisible, setPlayerVisible] = useState(false);
  const [streamItem, setStreamItem] = useState<TMDBMediaItem | null>(null);

  // Card Swipe Gesture Animation Values (Locked Horizontal Swipe)
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const lastTapRef = useRef<number>(0);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async (filters?: FilterOptions) => {
    setLoading(true);
    setCurrentIndex(0);
    setSwipedHistory([]);
    position.setValue({ x: 0, y: 0 });
    try {
      let items: TMDBMediaItem[] = [];
      const currentFilter = filters !== undefined ? filters : activeFilters;
      if (currentFilter) {
        items = await discoverMediaWithFilters(currentFilter);
      } else {
        items = await getTrendingMovies();
      }
      const profile = await getTasteProfile();
      const ranked = rankItemsByTaste(items, profile);
      setCards(ranked);
    } catch (err) {
      console.error('Failed to load swipe deck:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentCard = cards[currentIndex];
  const nextCardItem = cards[currentIndex + 1];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // STRICT HORIZONTAL GESTURE: Only trigger if X displacement > Y displacement
        return (
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderMove: (_, gestureState) => {
        // LOCK Y MOVEMENT SO POSTERS ARE ONLY SWIPABLE HORIZONTALLY
        position.setValue({ x: gestureState.dx, y: 0 });
      },
      onPanResponderRelease: (_, gestureState) => {
        const isSwipeRight =
          gestureState.dx > SWIPE_THRESHOLD ||
          (gestureState.dx > 15 && gestureState.vx > SWIPE_VELOCITY);
        const isSwipeLeft =
          gestureState.dx < -SWIPE_THRESHOLD ||
          (gestureState.dx < -15 && gestureState.vx < -SWIPE_VELOCITY);

        if (isSwipeRight) {
          swipeRight();
        } else if (isSwipeLeft) {
          swipeLeft();
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 50,
      useNativeDriver: false,
    }).start();
  };

  const swipeRight = () => {
    if (!currentCard || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    recordUserAction(currentCard, 'liked');

    if (!likedList.some((i) => i.id === currentCard.id)) {
      setLikedList((prev) => [currentCard, ...prev]);
    }

    Animated.timing(position, {
      toValue: { x: SCREEN_WIDTH * 1.4, y: 0 },
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      // RESET POSITION SINK & INCREMENT INDEX
      position.setValue({ x: 0, y: 0 });
      setSwipedHistory((prev) => [...prev, currentIndex]);
      setCurrentIndex((prev) => prev + 1);
      isAnimatingRef.current = false;
    });
  };

  const swipeLeft = () => {
    if (!currentCard || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    recordUserAction(currentCard, 'disliked');

    Animated.timing(position, {
      toValue: { x: -SCREEN_WIDTH * 1.4, y: 0 },
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      // RESET POSITION SINK & INCREMENT INDEX
      position.setValue({ x: 0, y: 0 });
      setSwipedHistory((prev) => [...prev, currentIndex]);
      setCurrentIndex((prev) => prev + 1);
      isAnimatingRef.current = false;
    });
  };

  const handleRewind = () => {
    if (swipedHistory.length === 0 || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const lastIndex = swipedHistory[swipedHistory.length - 1];
    setSwipedHistory((prev) => prev.slice(0, prev.length - 1));

    position.setValue({ x: -SCREEN_WIDTH * 1.2, y: 0 });
    setCurrentIndex(lastIndex);

    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 7,
      tension: 45,
      useNativeDriver: false,
    }).start(() => {
      isAnimatingRef.current = false;
    });
  };

  const triggerLoved = () => {
    if (!currentCard || isAnimatingRef.current) return;
    recordUserAction(currentCard, 'loved');

    if (!likedList.some((i) => i.id === currentCard.id)) {
      setLikedList((prev) => [currentCard, ...prev]);
    }

    setShowHeartExplosion(true);
    heartScale.setValue(0.2);
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.3,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowHeartExplosion(false);
      position.setValue({ x: 0, y: 0 });
      setSwipedHistory((prev) => [...prev, currentIndex]);
      setCurrentIndex((prev) => prev + 1);
    });
  };

  const handleCardPress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      triggerLoved();
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= DOUBLE_TAP_DELAY) {
          if (currentCard) setDetailItem(currentCard);
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  const showGuideInfo = () => {
    Alert.alert(
      '🎬 MOVIE TINDER GUIDE',
      '• Swipe Right 👉 to LIKE a movie.\n' +
      '• Swipe Left 👈 to DISLIKE a movie.\n' +
      '• Double Tap 💖 or press Heart to LOVE a movie.\n' +
      '• Tap Filter (🎛️) at the bottom to filter by Language, Year, Anime, or Rating.\n\n' +
      'HoloGram learns your taste in real-time and personalizes your deck!'
    );
  };

  // Rotation Interpolation
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-16deg', '0deg', '16deg'],
    extrapolate: 'clamp',
  });

  // Stamp Opacity Interpolations
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH / 4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 4, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Back Card Scale Interpolation (Expands as front card swipes away)
  const backCardScale = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: [1.0, 0.94, 1.0],
    extrapolate: 'clamp',
  });

  const renderCardContent = (item: TMDBMediaItem) => (
    <View style={styles.cardInner}>
      <Image
        source={{ uri: item.posterUrl }}
        style={styles.posterImage}
        resizeMode="cover"
      />

      {/* Gradient Content Overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(10,10,14,0.65)', '#0A0A0E']}
        style={styles.cardGradient}
      >
        <Text style={styles.cardTitle}>{item.title}</Text>

        <View style={styles.pillRow}>
          <View style={styles.pillBadge}>
            <Text style={styles.pillText}>
              {item.mediaType === 'tv' ? 'TV Series' : 'Adventure'}
            </Text>
          </View>
          <View style={styles.pillBadgeMuted}>
            <Text style={styles.pillTextMuted}>
              {item.releaseDate ? item.releaseDate.slice(0, 4) : '2026'}
            </Text>
          </View>
          <View style={styles.pillBadgeMuted}>
            <Ionicons name="star" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.pillTextMuted}>
              {item.rating.toFixed(1)}
            </Text>
          </View>
        </View>

        <Text style={styles.cardOverview} numberOfLines={3}>
          {item.overview || 'Tap card to view Swiparr detail sheet.'}
        </Text>
      </LinearGradient>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Dynamic Ambient Blur Backdrop Tint */}
      {currentCard && (
        <Image
          source={{ uri: currentCard.backdropUrl || currentCard.posterUrl }}
          style={styles.ambientBackdrop}
          blurRadius={50}
        />
      )}

      {/* Top Header matching reference screenshot & Nothing OS branding */}
      <View style={styles.header}>
        {/* Title Bar with Info Guide Button */}
        <View style={styles.brandTitleRow}>
          <Ionicons name="flame" size={18} color="#FF2D55" />
          <Text style={styles.brandTitleText}>MOVIE TINDER</Text>
          <TouchableOpacity style={styles.infoBtn} onPress={showGuideInfo}>
            <Ionicons name="help-circle-outline" size={16} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {/* Centered Toggle Pill (Deck vs Liked Matches) */}
        <View style={styles.topToggleContainer}>
          <TouchableOpacity
            style={[
              styles.topTogglePill,
              activeTabMode === 'deck' && styles.topTogglePillActive,
            ]}
            onPress={() => setActiveTabMode('deck')}
          >
            <Ionicons
              name="layers-outline"
              size={16}
              color={activeTabMode === 'deck' ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topTogglePill,
              activeTabMode === 'likes' && styles.topTogglePillActive,
            ]}
            onPress={() => setActiveTabMode('likes')}
          >
            <Ionicons
              name="heart-outline"
              size={16}
              color={activeTabMode === 'likes' ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
            />
          </TouchableOpacity>
        </View>

        {/* H Avatar Badge */}
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarText}>H</Text>
        </View>
      </View>

      {/* Active Filter HUD Bar */}
      {activeFilters && (
        <View style={styles.hudContainer}>
          <Text style={styles.hudText}>
            FILTER: [ {activeFilters.mediaType.toUpperCase()} • {activeFilters.selectedLanguage.toUpperCase()} • ★{activeFilters.minRating.toFixed(1)}+ ]
          </Text>
        </View>
      )}

      {/* MAIN VIEW: DECK vs LIKES */}
      {activeTabMode === 'likes' ? (
        <View style={styles.likesContainer}>
          <Text style={styles.likesHeaderTitle}>SAVED & LIKED MATCHES ({likedList.length})</Text>
          {likedList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-dislike-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyTitle}>No Liked Movies Yet</Text>
              <Text style={styles.emptySub}>Swipe right or tap heart on movies to save them here.</Text>
            </View>
          ) : (
            <FlatList
              data={likedList}
              keyExtractor={(item) => `liked-${item.id}`}
              numColumns={3}
              contentContainerStyle={{ paddingBottom: 40 }}
              columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.likeCardItem}
                  onPress={() => setDetailItem(item)}
                >
                  <Image source={{ uri: item.posterUrl }} style={styles.likePoster} />
                  <Text style={styles.likeTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        /* CARD DECK VIEW */
        <View style={styles.deckArea}>
          {loading ? (
            <ActivityIndicator size="large" color="#FF2D55" />
          ) : currentIndex >= cards.length ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="sparkles-outline" size={48} color="#FF2D55" />
              <Text style={styles.emptyTitle}>Deck Finished!</Text>
              <Text style={styles.emptySub}>Reloading recommendations...</Text>
              <TouchableOpacity style={styles.reloadDeckBtn} onPress={() => loadCards()}>
                <Text style={styles.reloadDeckText}>RELOAD TINDER DECK</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cardStack}>
              {/* NEXT BACK CARD IN STACK */}
              {nextCardItem && (
                <Animated.View
                  key={`back-card-${nextCardItem.id}`}
                  style={[
                    styles.card,
                    styles.backCard,
                    { transform: [{ scale: backCardScale }, { translateY: 16 }] },
                  ]}
                >
                  {renderCardContent(nextCardItem)}
                </Animated.View>
              )}

              {/* FRONT TOP CARD IN STACK (Keyed by ID to prevent unmount/stuck issues) */}
              <Animated.View
                key={`front-card-${currentCard.id}`}
                {...panResponder.panHandlers}
                style={[
                  styles.card,
                  styles.frontCard,
                  {
                    transform: [
                      { translateX: position.x },
                      { rotate },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.95}
                  style={{ flex: 1 }}
                  onPress={handleCardPress}
                >
                  {renderCardContent(currentCard)}

                  {/* LIKE Stamp Overlay */}
                  <Animated.View
                    style={[styles.stampContainer, styles.likeStamp, { opacity: likeOpacity }]}
                    pointerEvents="none"
                  >
                    <Text style={styles.likeStampText}>LIKE</Text>
                  </Animated.View>

                  {/* NOPE Stamp Overlay */}
                  <Animated.View
                    style={[styles.stampContainer, styles.nopeStamp, { opacity: nopeOpacity }]}
                    pointerEvents="none"
                  >
                    <Text style={styles.nopeStampText}>NOPE</Text>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>

              {/* TikTok-Style 💖 Heart Explosion Overlay */}
              {showHeartExplosion && (
                <Animated.View
                  style={[
                    styles.heartOverlay,
                    { transform: [{ scale: heartScale }] },
                  ]}
                  pointerEvents="none"
                >
                  <Ionicons name="heart" size={100} color="#FF2D55" />
                </Animated.View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Swiparr 3-Button Deck Controls Bar (Rewind, Heart, Filter) */}
      {activeTabMode === 'deck' && currentIndex < cards.length && (
        <View style={styles.deckControlsBar}>
          {/* Button 1: REWIND / UNDO */}
          <TouchableOpacity
            style={[
              styles.controlBtnSmall,
              swipedHistory.length === 0 && styles.controlBtnDisabled,
            ]}
            onPress={handleRewind}
            disabled={swipedHistory.length === 0}
          >
            <Ionicons
              name="refresh-circle-outline"
              size={24}
              color={swipedHistory.length > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.2)'}
            />
          </TouchableOpacity>

          {/* Button 2: HEART / LOVE (Solid White Pill Button) */}
          <TouchableOpacity
            style={[styles.controlBtnLarge, styles.likeBtnSolid]}
            onPress={triggerLoved}
          >
            <Ionicons name="heart" size={34} color="#0A0A0C" />
          </TouchableOpacity>

          {/* Button 3: FILTER / SETTINGS (Opens Filter Drawer) */}
          <TouchableOpacity
            style={styles.controlBtnSmall}
            onPress={() => setFilterVisible(true)}
          >
            <Ionicons name="options-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Drawer Sheet */}
      <FilterDrawerModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        onApplyFilters={(filters) => {
          setActiveFilters(filters);
          loadCards(filters);
        }}
      />

      {/* Slide-Up Swiparr Detail Sheet */}
      <SwiparrDetailSheet
        visible={detailItem !== null}
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onSeeMorePress={(item) => {
          setStreamItem(item);
          setPlayerVisible(true);
        }}
      />

      {/* Video Stream Player Modal */}
      {streamItem && (
        <VideoPlayerModal
          visible={playerVisible}
          videoUrl={null}
          title={streamItem.title}
          mediaItem={streamItem}
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
  ambientBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    position: 'relative',
    zIndex: 10,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  brandTitleText: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  infoBtn: {
    padding: 2,
    marginLeft: 2,
  },
  topToggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  topTogglePill: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
  },
  topTogglePillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  avatarBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2A2A32',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarText: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  hudContainer: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 45, 85, 0.2)',
  },
  hudText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FF2D55',
    letterSpacing: 1,
  },
  deckArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  likesContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  likesHeaderTitle: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    marginBottom: 16,
  },
  likeCardItem: {
    flex: 1,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#141418',
  },
  likePoster: {
    width: '100%',
    height: 130,
  },
  likeTitle: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  emptySub: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  reloadDeckBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  reloadDeckText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  cardStack: {
    width: SCREEN_WIDTH - 36,
    height: SCREEN_HEIGHT * 0.61,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#121216',
    position: 'absolute',
  },
  backCard: {
    opacity: 0.75,
  },
  frontCard: {
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  cardInner: {
    flex: 1,
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  stampContainer: {
    position: 'absolute',
    top: 32,
    zIndex: 100,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  likeStamp: {
    left: 28,
    borderColor: '#34C759',
    transform: [{ rotate: '-12deg' }],
  },
  likeStampText: {
    fontFamily: 'System',
    fontSize: 24,
    color: '#34C759',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  nopeStamp: {
    right: 28,
    borderColor: '#FF3B30',
    transform: [{ rotate: '12deg' }],
  },
  nopeStampText: {
    fontFamily: 'System',
    fontSize: 24,
    color: '#FF3B30',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingBottom: 24,
    paddingTop: 60,
  },
  cardTitle: {
    fontFamily: 'System',
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pillBadge: {
    backgroundColor: 'rgba(255, 45, 85, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pillText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pillBadgeMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pillTextMuted: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  cardOverview: {
    fontFamily: 'System',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 18,
  },
  heartOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  // Swiparr 3-Button Deck Controls Bar (Rewind, Heart, Filter)
  deckControlsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 14,
    paddingBottom: 20,
  },
  controlBtnSmall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  controlBtnDisabled: {
    opacity: 0.4,
  },
  controlBtnLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  likeBtnSolid: {
    backgroundColor: '#FFFFFF',
  },
});
