import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { TMDBMediaItem, getMediaCredits, CastMember } from '../utils/tmdb';

const { width } = Dimensions.get('window');

interface SwiparrDetailSheetProps {
  visible: boolean;
  item: TMDBMediaItem | null;
  onClose: () => void;
  onSeeMorePress: (item: TMDBMediaItem) => void;
}

export const SwiparrDetailSheet: React.FC<SwiparrDetailSheetProps> = ({
  visible,
  item,
  onClose,
  onSeeMorePress,
}) => {
  const [castList, setCastList] = useState<CastMember[]>([]);
  const [loadingCast, setLoadingCast] = useState(false);
  const [autoPlayTrailer, setAutoPlayTrailer] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible && item) {
      // Fetch Cast
      setLoadingCast(true);
      getMediaCredits(item.id, item.mediaType)
        .then((cast) => setCastList(cast))
        .catch(() => setCastList([]))
        .finally(() => setLoadingCast(false));

      // 3-Second Trailer Auto-Play Timer
      setAutoPlayTrailer(false);
      timerRef.current = setTimeout(() => {
        setAutoPlayTrailer(true);
      }, 3000);
    } else {
      setAutoPlayTrailer(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, item]);

  if (!item) return null;

  const trailerUrl = `https://www.youtube.com/embed?q=${encodeURIComponent(item.title + ' trailer')}&autoplay=1&controls=1`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheetContainer}>
          <SafeAreaView style={styles.safeArea}>
            {/* Drag Handle */}
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollBody}>
              {/* Backdrop / Auto-Play Trailer Box */}
              <View style={styles.mediaContainer}>
                {autoPlayTrailer ? (
                  <WebView
                    source={{ uri: trailerUrl }}
                    style={styles.trailerWebView}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                  />
                ) : (
                  <View style={styles.posterBackdropWrapper}>
                    <Image
                      source={{ uri: item.backdropUrl || item.posterUrl }}
                      style={styles.backdropImage}
                    />
                    <View style={styles.autoPlayBadge}>
                      <Ionicons name="play-circle" size={14} color="#FFE500" />
                      <Text style={styles.autoPlayText}>TRAILER AUTOPLAYS IN 3S</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Detail Content Header */}
              <View style={styles.contentPadding}>
                {/* Genre Pills */}
                <View style={styles.genreRow}>
                  <View style={styles.genrePill}>
                    <Text style={styles.genreText}>{item.mediaType.toUpperCase()}</Text>
                  </View>
                  <View style={styles.genrePill}>
                    <Text style={styles.genreText}>POPULARITY {Math.round(item.voteCount / 100)}</Text>
                  </View>
                </View>

                {/* Title & Metadata */}
                <Text style={styles.titleText}>{item.title}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaItem}>
                    {item.releaseDate ? item.releaseDate.slice(0, 4) : '2026'}
                  </Text>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.metaItem}>★ {item.rating.toFixed(1)}</Text>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.metaItem}>{item.voteCountFormatted} VOTES</Text>
                </View>

                {/* Tagline */}
                <Text style={styles.taglineText}>
                  "Defy expectations with every discovery."
                </Text>

                {/* See More Primary Button */}
                <TouchableOpacity
                  style={styles.seeMoreBtn}
                  onPress={() => {
                    onClose();
                    onSeeMorePress(item);
                  }}
                >
                  <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.seeMoreText}>↗ SEE MORE & STREAM NOW</Text>
                </TouchableOpacity>

                {/* Director & Language Row */}
                <View style={styles.infoRow}>
                  <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>TYPE</Text>
                    <Text style={styles.infoVal}>
                      {item.mediaType === 'movie' ? 'Feature Film' : 'TV Series'}
                    </Text>
                  </View>
                  <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>LANGUAGE</Text>
                    <Text style={styles.infoVal}>English / Multi</Text>
                  </View>
                </View>

                {/* Synopsis */}
                <Text style={styles.sectionHeader}>SYNOPSIS</Text>
                <Text style={styles.synopsisText}>
                  {item.overview || 'No synopsis overview available.'}
                </Text>

                {/* Cast Avatars */}
                <Text style={styles.sectionHeader}>CAST & CREW</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castRow}>
                  {castList.map((person) => (
                    <View key={person.id} style={styles.castAvatarCard}>
                      <Image source={{ uri: person.profileUrl }} style={styles.avatarImg} />
                      <Text style={styles.castName} numberOfLines={1}>
                        {person.name}
                      </Text>
                      <Text style={styles.castRole} numberOfLines={1}>
                        {person.character}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#0F0F13',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  safeArea: {
    paddingBottom: 10,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  scrollBody: {
    flexGrow: 0,
  },
  mediaContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#000000',
  },
  trailerWebView: {
    width: '100%',
    height: '100%',
  },
  posterBackdropWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  autoPlayBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#FFE500',
  },
  autoPlayText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FFE500',
    letterSpacing: 0.5,
  },
  contentPadding: {
    padding: 20,
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  genrePill: {
    backgroundColor: 'rgba(255, 45, 85, 0.15)',
    borderWidth: 1,
    borderColor: '#FF2D55',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  genreText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FF2D55',
    letterSpacing: 0.5,
  },
  titleText: {
    fontFamily: 'Ndot57',
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  metaItem: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  metaDot: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  taglineText: {
    fontFamily: 'LetteraMono',
    fontStyle: 'italic',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 16,
  },
  seeMoreBtn: {
    flexDirection: 'row',
    backgroundColor: '#FF2D55',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  seeMoreText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 2,
  },
  infoVal: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: '#FFFFFF',
  },
  sectionHeader: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 8,
  },
  synopsisText: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 17,
    marginBottom: 16,
  },
  castRow: {
    flexDirection: 'row',
  },
  castAvatarCard: {
    width: 70,
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E1E24',
    marginBottom: 4,
  },
  castName: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  castRole: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
});
