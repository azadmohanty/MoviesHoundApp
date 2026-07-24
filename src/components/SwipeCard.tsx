/**
 * SwipeCard.tsx
 *
 * ARCHITECTURE: Each card owns its own Animated.ValueXY + PanResponder.
 * When the parent increments currentIndex, React unmounts this component
 * entirely (via key prop), taking the stale position with it.
 * The new card mounts fresh with position = { x: 0, y: 0 }.
 *
 * This is the ONLY reliable way to prevent the "stuck card" bug with PanResponder.
 */

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TMDBMediaItem } from '../utils/tmdb';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.22;
const SWIPE_VELOCITY = 0.25;
const FLY_OUT_DISTANCE = SCREEN_WIDTH * 1.5;

export type SwipeDirection = 'left' | 'right';

interface SwipeCardProps {
  card: TMDBMediaItem;
  onSwipe: (direction: SwipeDirection) => void;
  onPress: () => void;
  onDoubleTap: () => void;
}

const SwipeCard: React.FC<SwipeCardProps> = ({
  card,
  onSwipe,
  onPress,
  onDoubleTap,
}) => {
  // ─── Each card instance has its own fresh position ───────────────────
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isAnimating = useRef(false);
  const lastTapRef = useRef<number>(0);

  const flyOut = useCallback(
    (direction: SwipeDirection) => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      const toX = direction === 'right' ? FLY_OUT_DISTANCE : -FLY_OUT_DISTANCE;

      Animated.timing(position, {
        toValue: { x: toX, y: 0 },
        duration: 220,
        useNativeDriver: true, // ← native driver safe because we only translate
      }).start(() => {
        // Notify parent AFTER card has flown off screen.
        // Parent increments index → this component unmounts → fresh card mounts.
        onSwipe(direction);
      });
    },
    [position, onSwipe]
  );

  const resetPosition = useCallback(() => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [position]);

  // ─── PanResponder lives inside the component — fresh per card ────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        // Only intercept clearly horizontal gestures
        return (
          !isAnimating.current &&
          Math.abs(g.dx) > 6 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.3
        );
      },
      onPanResponderGrant: () => {
        position.setOffset({ x: (position.x as any)._value, y: 0 });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, g) => {
        position.setValue({ x: g.dx, y: 0 });
      },
      onPanResponderRelease: (_, g) => {
        position.flattenOffset();

        const dx = (position.x as any)._value;
        const swiped =
          Math.abs(dx) > SWIPE_THRESHOLD ||
          (Math.abs(dx) > 20 && Math.abs(g.vx) > SWIPE_VELOCITY);

        if (swiped) {
          flyOut(dx > 0 ? 'right' : 'left');
        } else {
          resetPosition();
        }
      },
      onPanResponderTerminate: () => {
        position.flattenOffset();
        resetPosition();
      },
    })
  ).current;

  // ─── Derived animated styles ──────────────────────────────────────────
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-14deg', '0deg', '14deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SCREEN_WIDTH / 5],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 5, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // ─── Tap handler (single vs double) ──────────────────────────────────
  const handlePress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      lastTapRef.current = 0;
      onDoubleTap();
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= DOUBLE_TAP_DELAY) {
          onPress();
        }
      }, DOUBLE_TAP_DELAY);
    }
  }, [onPress, onDoubleTap]);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.card,
        {
          transform: [
            { translateX: position.x },
            { rotate },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.97}
        style={{ flex: 1 }}
        onPress={handlePress}
        delayPressIn={0}
      >
        {/* Poster */}
        <Image
          source={{ uri: card.posterUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* Gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(10,10,14,0.55)', '#0A0A0E']}
          style={styles.gradient}
        >
          <Text style={styles.title}>{card.title}</Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {card.mediaType === 'tv' ? 'TV Series' : 'Movie'}
              </Text>
            </View>
            <View style={styles.pillMuted}>
              <Text style={styles.pillMutedText}>
                {card.releaseDate ? card.releaseDate.slice(0, 4) : '—'}
              </Text>
            </View>
            <View style={styles.pillMuted}>
              <Ionicons name="star" size={10} color="#FFF" style={{ marginRight: 3 }} />
              <Text style={styles.pillMutedText}>{card.rating.toFixed(1)}</Text>
            </View>
          </View>

          <Text style={styles.overview} numberOfLines={3}>
            {card.overview || 'Tap for more details.'}
          </Text>
        </LinearGradient>

        {/* LIKE stamp */}
        <Animated.View
          style={[styles.stamp, styles.likeStamp, { opacity: likeOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.likeText}>LIKE</Text>
        </Animated.View>

        {/* NOPE stamp */}
        <Animated.View
          style={[styles.stamp, styles.nopeStamp, { opacity: nopeOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.nopeText}>NOPE</Text>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Expose flyOut for external button presses (Heart / Rewind) ───────
export type SwipeCardHandle = {
  flyOut: (direction: SwipeDirection) => void;
};

export default SwipeCard;

// ─── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#121216',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 80,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pill: {
    backgroundColor: 'rgba(255,45,85,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  pillMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillMutedText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '500',
  },
  overview: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 17,
  },
  stamp: {
    position: 'absolute',
    top: 36,
    zIndex: 100,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  likeStamp: {
    left: 24,
    borderColor: '#34C759',
    transform: [{ rotate: '-12deg' }],
  },
  likeText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#34C759',
    letterSpacing: 2,
  },
  nopeStamp: {
    right: 24,
    borderColor: '#FF3B30',
    transform: [{ rotate: '12deg' }],
  },
  nopeText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FF3B30',
    letterSpacing: 2,
  },
});
