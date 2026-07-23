import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TMDBMediaItem, getTrendingMovies, getTrendingTVShows } from '../utils/tmdb';
import { updateTasteWithSwipe, rankDeckItemsByTaste } from '../utils/TasteEngine';
import { toggleItemInList, getUserLists, UserListsData } from '../utils/userListsStorage';
import { FilterDrawerModal, SwiparrFilters, DEFAULT_SWIPARR_FILTERS } from '../components/FilterDrawerModal';
import { VideoPlayerModal } from '../components/VideoPlayerModal';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = 0.25 * width;

export const MovieTinderScreen: React.FC = () => {
  const [deck, setDeck] = useState<TMDBMediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userLists, setUserLists] = useState<UserListsData>({
    watchLater: [],
    watched: [],
    liked: [],
    loved: [],
    disliked: [],
  });

  // Selected item modal
  const [selectedMedia, setSelectedMedia] = useState<TMDBMediaItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Filters modal
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<SwiparrFilters>(DEFAULT_SWIPARR_FILTERS);

  // Double-tap heart animation
  const [heartAnimVisible, setHeartAnimVisible] = useState(false);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<number>(0);

  // Animation values for swiping
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp'
  });

  const currentCard = deck[currentIndex];

  useEffect(() => {
    loadDeckData();
    loadUserLists();
  }, []);

  const loadUserLists = async () => {
    const lists = await getUserLists();
    setUserLists(lists);
  };

  const loadDeckData = async () => {
    try {
      setLoading(true);
      const trending = await getTrendingMovies();
      const tvShows = await getTrendingTVShows();
      const combined = [...trending, ...tvShows];

      // De-duplicate
      const uniqueMap = new Map<number, TMDBMediaItem>();
      combined.forEach(item => uniqueMap.set(item.id, item));
      const uniqueList = Array.from(uniqueMap.values());

      setDeck(uniqueList);
      setCurrentIndex(0);
    } catch (e) {
      console.warn('Error loading Tinder deck:', e);
    } finally {
      setLoading(false);
    }
  };

  const triggerHeartAnimation = () => {
    setHeartAnimVisible(true);
    heartScale.setValue(0.5);
    heartOpacity.setValue(1);

    Animated.parallel([
      Animated.spring(heartScale, {
        toValue: 1.3,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(heartOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      })
    ]).start(() => setHeartAnimVisible(false));
  };

  const handleCardTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double Tap ➡️ Loved
      triggerHeartAnimation();
      handleSwipeAction('loved');
    } else {
      // Single Tap ➡️ Open Details Modal
      if (currentCard) {
        setSelectedMedia(currentCard);
        setModalVisible(true);
      }
    }
    lastTapRef.current = now;
  };

  const handleSwipeAction = async (action: 'loved' | 'liked' | 'disliked') => {
    if (!currentCard) return;

    if (action === 'loved') {
      await toggleItemInList(currentCard, 'loved');
      await updateTasteWithSwipe(currentCard, 'loved');
    } else if (action === 'liked') {
      await toggleItemInList(currentCard, 'liked');
      await updateTasteWithSwipe(currentCard, 'liked');
    } else {
      await toggleItemInList(currentCard, 'disliked');
      await updateTasteWithSwipe(currentCard, 'disliked');
    }

    loadUserLists();
    advanceDeck();
  };

  const advanceDeck = () => {
    position.setValue({ x: 0, y: 0 });
    setCurrentIndex(prev => prev + 1);
  };

  const rewindDeck = () => {
    if (currentIndex > 0) {
      position.setValue({ x: 0, y: 0 });
      setCurrentIndex(prev => prev - 1);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        position.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          Animated.spring(position, {
            toValue: { x: width + 100, y: gestureState.dy },
            useNativeDriver: false
          }).start(() => handleSwipeAction('liked'));
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.spring(position, {
            toValue: { x: -width - 100, y: gestureState.dy },
            useNativeDriver: false
          }).start(() => handleSwipeAction('disliked'));
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 4,
            useNativeDriver: false
          }).start();
        }
      }
    })
  ).current;

  const backdropUri = currentCard?.backdropUrl || currentCard?.posterUrl;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Dynamic Ambient Background */}
      {backdropUri ? (
        <Image
          source={{ uri: backdropUri }}
          style={styles.ambientBackground}
          blurRadius={25}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.ambientDarkOverlay} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MOVIE TINDER</Text>
        <TouchableOpacity onPress={() => setFilterVisible(true)} style={styles.filterBtn}>
          <Text style={styles.filterBtnTxt}>🎛 FILTERS</Text>
        </TouchableOpacity>
      </View>

      {/* Deck Area */}
      <View style={styles.deckContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#FF2D55" />
        ) : currentCard && currentIndex < deck.length ? (
          <Animated.View
            style={[
              styles.card,
              {
                transform: [
                  { translateX: position.x },
                  { translateY: position.y },
                  { rotate }
                ]
              }
            ]}
            {...panResponder.panHandlers}
          >
            <TouchableOpacity activeOpacity={0.95} onPress={handleCardTap} style={styles.cardTouch}>
              <Image
                source={{ uri: currentCard.posterUrl || currentCard.backdropUrl }}
                style={styles.posterImage}
                resizeMode="cover"
              />

              {/* Heart Burst Overlay */}
              {heartAnimVisible && (
                <Animated.View
                  style={[
                    styles.heartBurst,
                    {
                      transform: [{ scale: heartScale }],
                      opacity: heartOpacity,
                    }
                  ]}
                >
                  <Text style={styles.heartIcon}>💖</Text>
                </Animated.View>
              )}

              {/* Card Meta Gradient */}
              <View style={styles.cardGradient}>
                <Text style={styles.cardTitle} numberOfLines={1}>{currentCard.title}</Text>
                <View style={styles.cardMetaRow}>
                  <Text style={styles.cardRating}>★ {currentCard.rating ? currentCard.rating.toFixed(1) : 'N/A'}</Text>
                  <Text style={styles.cardDot}>•</Text>
                  <Text style={styles.cardYear}>{currentCard.releaseDate ? currentCard.releaseDate.substring(0, 4) : ''}</Text>
                  <Text style={styles.cardDot}>•</Text>
                  <Text style={styles.cardType}>{(currentCard.mediaType || 'movie').toUpperCase()}</Text>
                </View>
                <Text style={styles.cardOverview} numberOfLines={2}>{currentCard.overview}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>ALL CARDS SWIPED!</Text>
            <TouchableOpacity style={styles.reloadBtn} onPress={loadDeckData}>
              <Text style={styles.reloadBtnTxt}>RELOAD DECK</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Floating Control Bar */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlCircle} onPress={rewindDeck}>
          <Text style={styles.controlIcon}>⏮</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlCircle, styles.dislikeCircle]} onPress={() => handleSwipeAction('disliked')}>
          <Text style={[styles.controlIcon, { color: '#FF2D55' }]}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlCircle, styles.lovedCircle]} onPress={() => handleSwipeAction('loved')}>
          <Text style={styles.controlIcon}>💖</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.controlCircle, styles.likeCircle]} onPress={() => handleSwipeAction('liked')}>
          <Text style={[styles.controlIcon, { color: '#4CD964' }]}>👍</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <FilterDrawerModal
        visible={filterVisible}
        filters={filters}
        onClose={() => setFilterVisible(false)}
        onApply={(newFilters) => setFilters(newFilters)}
      />

      {/* Video / Detail Modal */}
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
  ambientBackground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  ambientDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 12, 0.45)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: 'Ndot57',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  filterBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  filterBtnTxt: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#FFFFFF',
  },
  deckContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: width - 40,
    height: height * 0.62,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: '#141418',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  cardTouch: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  heartBurst: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  heartIcon: {
    fontSize: 80,
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 10, 12, 0.85)',
    padding: 16,
  },
  cardTitle: {
    fontFamily: 'Ndot57',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardRating: {
    fontFamily: 'NType82Mono',
    fontSize: 11,
    color: '#FFE500',
  },
  cardDot: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  cardYear: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  cardType: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#FF2D55',
  },
  cardOverview: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 14,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 16,
  },
  controlCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dislikeCircle: {
    borderColor: 'rgba(255, 45, 85, 0.5)',
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
  },
  lovedCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
    elevation: 8,
  },
  likeCircle: {
    borderColor: 'rgba(76, 217, 100, 0.5)',
    backgroundColor: 'rgba(76, 217, 100, 0.1)',
  },
  controlIcon: {
    fontSize: 22,
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
  },
  reloadBtn: {
    backgroundColor: '#FF2D55',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  reloadBtnTxt: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
  },
});
