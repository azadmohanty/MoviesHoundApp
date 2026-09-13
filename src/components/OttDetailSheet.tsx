import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  movieboxService,
  MovieBoxDetail,
  MovieBoxStreamSource,
  MovieBoxCaption,
  MovieBoxEpisode,
} from '../services/movieboxService';
import { OttVideoPlayerModal } from './OttVideoPlayerModal';
import { triggerLightHaptic, triggerSelectionHaptic } from '../utils/HapticsHelper';

const { width, height } = Dimensions.get('window');

export interface OttDetailSheetProps {
  visible: boolean;
  slug: string;
  onClose: () => void;
}

export const OttDetailSheet: React.FC<OttDetailSheetProps> = ({ visible, slug, onClose }) => {
  const [detail, setDetail] = useState<MovieBoxDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [selectedDubSubjectId, setSelectedDubSubjectId] = useState<string | null>(null);

  // Player States
  const [isPlayerOpen, setIsPlayerOpen] = useState<boolean>(false);
  const [loadingStreams, setLoadingStreams] = useState<boolean>(false);
  const [streamSources, setStreamSources] = useState<MovieBoxStreamSource[]>([]);
  const [captions, setCaptions] = useState<MovieBoxCaption[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && slug) {
      loadDetails();
    } else {
      setDetail(null);
      setSelectedSeason(1);
      setSelectedEpisode(1);
      setSelectedDubSubjectId(null);
    }
  }, [visible, slug]);

  const loadDetails = async () => {
    setLoading(true);
    const data = await movieboxService.getDetail(slug);
    setDetail(data);
    if (data?.seasons && data.seasons.length > 0) {
      setSelectedSeason(data.seasons[0].seasonNumber);
    }
    if (data?.subject_id) {
      setSelectedDubSubjectId(data.subject_id);
    }
    setLoading(false);
  };

  const handlePlay = async (se: number = 1, ep: number = 1) => {
    if (!detail) return;
    triggerLightHaptic();
    setSelectedSeason(se);
    setSelectedEpisode(ep);
    setLoadingStreams(true);
    setIsPlayerOpen(true);

    const targetSubjectId = selectedDubSubjectId || detail.subject_id;

    try {
      const streamRes = await movieboxService.getStreamSources(targetSubjectId, detail.slug, se, ep);
      setStreamSources(streamRes.sources);

      const capRes = await movieboxService.getCaptions(targetSubjectId, detail.slug, se, ep);
      setCaptions(capRes);
    } catch (e) {
      console.warn('[OttDetailSheet] Stream launch error:', e);
    } finally {
      setLoadingStreams(false);
    }
  };

  const currentSeasonData = detail?.seasons.find((s) => s.seasonNumber === selectedSeason) || detail?.seasons[0];
  const currentEpisodes: MovieBoxEpisode[] = currentSeasonData?.episodes || [];

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" hardwareAccelerated transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00e5ff" />
            <Text style={styles.loadingText}>Loading Title Details...</Text>
          </View>
        ) : detail ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Top Backdrop Header */}
            <View style={styles.backdropContainer}>
              <Image
                source={{ uri: detail.backdrop_url || detail.poster_url }}
                style={styles.backdropImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(7, 8, 12, 0.7)', '#07080c']}
                style={styles.backdropGradient}
              />

              {/* Floating Top Back Button */}
              <TouchableOpacity
                style={[styles.floatingBackBtn, { top: Math.max(insets.top + 10, 20) }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Main Info Section */}
            <View style={styles.infoSection}>
              <Text style={styles.title}>{detail.title}</Text>

              {/* Metadata Badges */}
              <View style={styles.metaRow}>
                {detail.rating ? (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={13} color="#ffb703" />
                    <Text style={styles.ratingText}>{detail.rating}</Text>
                  </View>
                ) : null}

                {detail.release_date ? (
                  <Text style={styles.metaYear}>{detail.release_date.substring(0, 4)}</Text>
                ) : null}

                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {detail.is_series ? 'TV Series' : 'Movie'}
                  </Text>
                </View>

                {detail.genres && detail.genres.length > 0 ? (
                  <Text style={styles.genreText} numberOfLines={1}>
                    • {detail.genres.slice(0, 2).join(', ')}
                  </Text>
                ) : null}
              </View>

              {/* Primary Action: Big Glowing Play Button */}
              <TouchableOpacity
                style={styles.mainPlayBtn}
                onPress={() => handlePlay(selectedSeason, selectedEpisode)}
                activeOpacity={0.85}
              >
                <Ionicons name="play" size={22} color="#000" />
                <Text style={styles.mainPlayBtnText}>
                  {detail.is_series
                    ? `PLAY SEASON ${selectedSeason} • EPISODE ${selectedEpisode}`
                    : 'WATCH NOW (1080P HD)'}
                </Text>
              </TouchableOpacity>

              {/* Language Dub Selector (if multiple dubs exist) */}
              {detail.dubs && detail.dubs.length > 1 ? (
                <View style={styles.dubsContainer}>
                  <Text style={styles.sectionHeading}>AUDIO LANGUAGE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dubsBar}>
                    {detail.dubs.map((d) => {
                      const isSelected = selectedDubSubjectId === d.subject_id;
                      return (
                        <TouchableOpacity
                          key={d.subject_id}
                          style={[styles.dubPill, isSelected && styles.dubPillActive]}
                          onPress={() => {
                            triggerSelectionHaptic();
                            setSelectedDubSubjectId(d.subject_id);
                          }}
                        >
                          <Ionicons
                            name="volume-high-outline"
                            size={14}
                            color={isSelected ? '#000' : '#888'}
                          />
                          <Text style={[styles.dubPillText, isSelected && styles.dubPillTextActive]}>
                            {d.language_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {/* Overview / Storyline */}
              {detail.overview ? (
                <View style={styles.synopsisContainer}>
                  <Text style={styles.sectionHeading}>STORYLINE</Text>
                  <Text style={styles.overviewText}>{detail.overview}</Text>
                </View>
              ) : null}

              {/* Series Seasons & 3-Column Episode Grid */}
              {detail.is_series && detail.seasons.length > 0 ? (
                <View style={styles.episodesSection}>
                  <View style={styles.episodesHeaderRow}>
                    <Text style={styles.sectionHeading}>EPISODES</Text>
                    <Text style={styles.epCountText}>{currentEpisodes.length} Available</Text>
                  </View>

                  {/* Season Switcher Pills */}
                  {detail.seasons.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonBar}>
                      {detail.seasons.map((s) => (
                        <TouchableOpacity
                          key={s.seasonNumber}
                          style={[
                            styles.seasonPill,
                            selectedSeason === s.seasonNumber && styles.seasonPillActive,
                          ]}
                          onPress={() => {
                            triggerSelectionHaptic();
                            setSelectedSeason(s.seasonNumber);
                          }}
                        >
                          <Text
                            style={[
                              styles.seasonPillText,
                              selectedSeason === s.seasonNumber && styles.seasonPillTextActive,
                            ]}
                          >
                            Season {s.seasonNumber}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {/* 3-Column Modern Episode Buttons */}
                  <View style={styles.episodeGrid}>
                    {currentEpisodes.map((ep) => (
                      <TouchableOpacity
                        key={ep.episodeNumber}
                        style={[
                          styles.episodeCard,
                          selectedEpisode === ep.episodeNumber && styles.episodeCardActive,
                        ]}
                        onPress={() => handlePlay(selectedSeason, ep.episodeNumber)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={selectedEpisode === ep.episodeNumber ? 'play-circle' : 'play-circle-outline'}
                          size={22}
                          color={selectedEpisode === ep.episodeNumber ? '#00e5ff' : '#666'}
                        />
                        <Text
                          style={[
                            styles.episodeNumberText,
                            selectedEpisode === ep.episodeNumber && { color: '#00e5ff', fontWeight: '800' },
                          ]}
                        >
                          EP {ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Failed to load title details.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onClose}>
              <Text style={styles.retryBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Video Player Modal */}
        {detail && (
          <OttVideoPlayerModal
            visible={isPlayerOpen}
            title={detail.title}
            subjectId={selectedDubSubjectId || detail.subject_id}
            detailPath={detail.slug}
            seasonNum={selectedSeason}
            episodeNum={selectedEpisode}
            sources={streamSources}
            captions={captions}
            episodes={currentEpisodes}
            onClose={() => setIsPlayerOpen(false)}
            onEpisodeChange={(newSeason, newEp) => handlePlay(newSeason, newEp)}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080c',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#161724',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#00e5ff',
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  backdropContainer: {
    width: '100%',
    height: height * 0.44,
    position: 'relative',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },
  backdropGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
  },
  floatingBackBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  infoSection: {
    paddingHorizontal: 20,
    marginTop: -20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 32,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 183, 3, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  ratingText: {
    color: '#ffb703',
    fontSize: 13,
    fontWeight: '800',
  },
  metaYear: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  typeBadge: {
    backgroundColor: '#161724',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#24263a',
  },
  typeBadgeText: {
    color: '#00e5ff',
    fontSize: 11,
    fontWeight: '700',
  },
  genreText: {
    color: '#666',
    fontSize: 12,
    flex: 1,
  },
  mainPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00e5ff',
    paddingVertical: 14,
    borderRadius: 14,
    marginVertical: 16,
    gap: 8,
    shadowColor: '#00e5ff',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  mainPlayBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dubsContainer: {
    marginVertical: 10,
  },
  dubsBar: {
    flexDirection: 'row',
    marginTop: 8,
  },
  dubPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#12131e',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#202234',
    gap: 6,
  },
  dubPillActive: {
    backgroundColor: '#00e5ff',
    borderColor: '#00e5ff',
  },
  dubPillText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
  },
  dubPillTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  synopsisContainer: {
    marginVertical: 12,
  },
  sectionHeading: {
    color: '#666',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  overviewText: {
    color: '#bbb',
    fontSize: 14,
    lineHeight: 22,
  },
  episodesSection: {
    marginTop: 20,
  },
  episodesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  epCountText: {
    color: '#666',
    fontSize: 12,
  },
  seasonBar: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  seasonPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#12131e',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#202234',
  },
  seasonPillActive: {
    backgroundColor: '#00e5ff',
    borderColor: '#00e5ff',
  },
  seasonPillText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '700',
  },
  seasonPillTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  episodeCard: {
    width: (width - 60) / 3,
    backgroundColor: '#11121c',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e2030',
    gap: 6,
  },
  episodeCardActive: {
    borderColor: '#00e5ff',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  episodeNumberText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '700',
  },
});
