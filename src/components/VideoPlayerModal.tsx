import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  Text,
  StatusBar,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMediaCredits, getSimilarMedia, getTVShowDetails, CastMember, TMDBMediaItem, TVShowDetails } from '../utils/tmdb';
import { getStreamServerUrl } from '../utils/streamResolver';

const { width } = Dimensions.get('window');

type VideoPlayerModalProps = {
  visible: boolean;
  videoUrl: string | null;
  title: string;
  mediaItem?: any;
  onClose: () => void;
  onDownloadPress?: (seasonNum: number) => void;
  onSelectArtist?: (personId: number, personName: string) => void;
  onSelectSimilarMedia?: (item: TMDBMediaItem) => void;
  isWatched?: boolean;
  onToggleWatched?: () => void;
  isSavedWatchlist?: boolean;
  onToggleWatchlist?: () => void;
};

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  visible,
  videoUrl,
  title,
  mediaItem,
  onClose,
  onDownloadPress,
  onSelectArtist,
  onSelectSimilarMedia,
  isWatched,
  onToggleWatched,
  isSavedWatchlist,
  onToggleWatchlist
}) => {
  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [selectedServer, setSelectedServer] = useState(1);
  const [vidsrcBase, setVidsrcBase] = useState('https://vidsrc.sbs');
  const [activeUrl, setActiveUrl] = useState<string | null>(videoUrl);
  const [castList, setCastList] = useState<CastMember[]>([]);
  const [similarList, setSimilarList] = useState<TMDBMediaItem[]>([]);
  const [tvDetails, setTvDetails] = useState<TVShowDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const isDirectVideoFile = activeUrl?.includes('.m3u8') || activeUrl?.includes('.mp4');

  const player = useVideoPlayer(isDirectVideoFile ? activeUrl || '' : '', (playerInstance) => {
    playerInstance.loop = false;
    if (isDirectVideoFile) {
      playerInstance.play();
    }
  });

  useEffect(() => {
    setActiveUrl(videoUrl);
    setSelectedServer(1);
    setCurrentSeason(1);
    setCurrentEpisode(1);
    setShowTroubleshoot(false);
  }, [videoUrl]);

  useEffect(() => {
    if (visible && mediaItem) {
      loadMediaExtras();
    }
  }, [visible, mediaItem]);

  const loadMediaExtras = async () => {
    if (!mediaItem) return;
    try {
      setLoadingDetails(true);
      
      // Load domains cache
      const domainsRaw = await AsyncStorage.getItem('@movieshound_domains_cache');
      if (domainsRaw) {
        const parsed = JSON.parse(domainsRaw);
        if (parsed.domains && parsed.domains.vidsrc) {
          setVidsrcBase(parsed.domains.vidsrc.replace(/\/$/, ''));
        }
      }

      const credits = await getMediaCredits(mediaItem.id, mediaItem.mediaType || 'movie');
      setCastList(credits);

      const similar = await getSimilarMedia(mediaItem.id, mediaItem.mediaType || 'movie');
      setSimilarList(similar);

      if (mediaItem.mediaType === 'tv') {
        const tv = await getTVShowDetails(mediaItem.id);
        setTvDetails(tv);
      }
    } catch (e) {
      console.warn('Error loading media extras:', e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const updatePlayerUrl = (serverIdx: number, season: number, episode: number) => {
    setSelectedServer(serverIdx);
    setCurrentSeason(season);
    setCurrentEpisode(episode);
    if (mediaItem) {
      const newUrl = getStreamServerUrl(serverIdx, mediaItem.id, mediaItem.mediaType || 'movie', season, episode, vidsrcBase);
      setActiveUrl(newUrl);
    }
  };

  const blockAdsJS = `
    (function() {
      // 1. Overwrite popups
      window.open = function() { return null; };
      window.alert = function() { return true; };
      window.confirm = function() { return true; };

      // 2. Hide and remove dynamic overlay banners and popup containers
      const clearOverlayAds = () => {
        const allDivs = document.getElementsByTagName('div');
        for (let i = 0; i < allDivs.length; i++) {
          const div = allDivs[i];
          const style = window.getComputedStyle(div);
          const zIndex = parseInt(style.zIndex);
          
          if (zIndex > 99 && !div.id.includes('player') && !div.className.includes('jwplayer')) {
            div.style.display = 'none';
            div.remove();
          }
        }
        
        // Remove rogue iframes
        const allIframes = document.getElementsByTagName('iframe');
        for (let i = 0; i < allIframes.length; i++) {
          const iframe = allIframes[i];
          if (iframe.id !== 'player_iframe' && !iframe.src.includes('vidsrc')) {
            iframe.style.display = 'none';
            iframe.remove();
          }
        }
      };

      clearOverlayAds();
      setInterval(clearOverlayAds, 150);

      // 3. Block click-hijacks
      document.body.addEventListener('click', (e) => {
        if (e.target && (e.target.tagName === 'A' || e.target.closest('a'))) {
          const link = e.target.closest('a');
          if (link && link.target === '_blank') {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }, true);
    })();
    true;
  `;

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
      <SafeAreaView style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
          <View style={styles.placeholder} />
        </View>

        {/* 16:9 YouTube-Style Top Player Container */}
        <View style={styles.topPlayerBox}>
          {activeUrl ? (
            isDirectVideoFile ? (
              <VideoView
                style={styles.fullPlayer}
                player={player}
                fullscreenOptions={{ enable: true }}
                allowsPictureInPicture
                startsPictureInPictureAutomatically
                showsTimecodes
              />
            ) : (
              <WebView
                key={activeUrl}
                source={{ uri: activeUrl }}
                style={styles.fullPlayer}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                injectedJavaScript={blockAdsJS}
              />
            )
          ) : (
            <View style={styles.noPlayerBox}>
              <Text style={styles.noPlayerText}>STREAM LOADING...</Text>
            </View>
          )}
        </View>

        {/* Scrollable Details Below Video Player */}
        <ScrollView contentContainerStyle={styles.scrollDetailsContent} showsVerticalScrollIndicator={false}>
          {mediaItem && (
            <>
              <Text style={styles.mediaTitle}>{mediaItem.title.toUpperCase()}</Text>

              {/* Rating, Review Count, Year & Action Row */}
              <View style={styles.metaRow}>
                <Text style={styles.ratingText}>
                  ★ {mediaItem.rating ? mediaItem.rating.toFixed(1) : 'N/A'}
                </Text>
                {mediaItem.voteCountFormatted && (
                  <Text style={styles.reviewCountText}>({mediaItem.voteCountFormatted} REVIEWS)</Text>
                )}
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.metaSubText}>{mediaItem.releaseDate}</Text>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.metaSubText}>{(mediaItem.mediaType || 'movie').toUpperCase()}</Text>
              </View>

              {/* Action Buttons Row: Watched & Watchlist */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionPill, isWatched && styles.actionPillActive]}
                  onPress={onToggleWatched}
                >
                  <Text style={[styles.actionPillText, isWatched && { color: '#0A0A0C' }]}>
                    {isWatched ? '✓ WATCHED' : '+ MARK WATCHED'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionPill, isSavedWatchlist && styles.actionPillSaved]}
                  onPress={onToggleWatchlist}
                >
                  <Text style={[styles.actionPillText, isSavedWatchlist && { color: '#FF2D55' }]}>
                    {isSavedWatchlist ? '★ WATCHLIST' : '+ WATCHLIST'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Enlarged Full-Width Download Button */}
              {onDownloadPress && (
                <TouchableOpacity style={styles.largeDownloadButton} onPress={() => onDownloadPress(currentSeason)}>
                  <Text style={styles.largeDownloadButtonText}>↓ DOWNLOAD OPTIONS</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.overviewText}>{mediaItem.overview || 'NO OVERVIEW AVAILABLE.'}</Text>

              {/* Multi-Server Selector Row */}
              <View style={styles.tvSection}>
                <Text style={styles.sectionHeading}>SELECT STREAMING SERVER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverScroll}>
                  {[1, 2, 3, 4, 5].map((idx) => {
                    let label = `SERVER ${idx}`;
                    if (idx === 1) label = 'SERVER 1 (SUPER VIP)';
                    if (idx === 2) label = 'SERVER 2 (SUPER SIMPLE)';
                    if (idx === 3) label = 'SERVER 3 (VIDSRC 2.RU)';
                    if (idx === 4) label = 'SERVER 4 (VIDSRC TO)';
                    if (idx === 5) label = 'SERVER 5 (ANYEMBED)';
                    return (
                      <TouchableOpacity
                        key={`server-${idx}`}
                        style={[
                          styles.serverPill,
                          selectedServer === idx && { backgroundColor: '#FF2D55', borderColor: '#FF2D55' }
                        ]}
                        onPress={() => updatePlayerUrl(idx, currentSeason, currentEpisode)}
                      >
                        <Text style={[
                          styles.serverPillText,
                          selectedServer === idx ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                        ]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Troubleshooting & Unblocking Guide Panel */}
              <View style={styles.troubleContainer}>
                <TouchableOpacity 
                  style={styles.troubleHeader} 
                  onPress={() => setShowTroubleshoot(!showTroubleshoot)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.troubleHeaderText}>
                    {showTroubleshoot ? '✕ CLOSE UNBLOCKING GUIDE' : '⚡ STREAM BLOCKED? TAP TO UNBLOCK'}
                  </Text>
                </TouchableOpacity>

                {showTroubleshoot && (
                  <View style={styles.troubleContent}>
                    <Text style={styles.troubleSubheading}>METHOD 1: DYNAMIC CLOUD DNS (RECOMMENDED - NO VPN)</Text>
                    <Text style={styles.troubleText}>
                      To unblock all servers and double your speed without a slow VPN:{"\n"}
                      1. Open Phone Settings ➡️ Network & Internet ➡️ Private DNS.{"\n"}
                      2. Choose Hostname and enter:{"\n"}
                      <Text style={{ color: '#FFE500', fontWeight: 'bold' }}>1dot1dot1dot1.cloudflare-dns.com</Text>{"\n"}
                      3. Save and reload the stream.
                    </Text>

                    <Text style={[styles.troubleSubheading, { marginTop: 12 }]}>METHOD 2: USE A VPN</Text>
                    <Text style={styles.troubleText}>
                      If DNS changes don't work, turn on any free VPN (e.g., ProtonVPN) set to USA/Singapore.
                    </Text>

                    <Text style={[styles.troubleSubheading, { marginTop: 12 }]}>METHOD 3: CLOUDFLARE CAPTCHA CHECK</Text>
                    <Text style={styles.troubleText}>
                      SuperEmbed servers (Server 1 & 2) might show a Cloudflare check page. Simply tap the checkbox inside the player to begin playback.
                    </Text>
                  </View>
                )}
              </View>

              {/* TV Series Season & Episode Picker */}
              {mediaItem.mediaType === 'tv' && tvDetails && (
                <View style={styles.tvSection}>
                  <Text style={styles.sectionHeading}>SEASONS & EPISODES</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonScroll}>
                    {Array.from({ length: tvDetails.numberOfSeasons }, (_, i) => i + 1).map((seasonNum) => (
                      <TouchableOpacity
                        key={`season-${seasonNum}`}
                        style={[
                          styles.seasonPill,
                          currentSeason === seasonNum && { backgroundColor: '#FF2D55', borderColor: '#FF2D55' }
                        ]}
                        onPress={() => updatePlayerUrl(selectedServer, seasonNum, 1)}
                      >
                        <Text style={[
                          styles.seasonPillText,
                          currentSeason === seasonNum ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                        ]}>
                          SEASON {seasonNum}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={styles.subHeading}>EPISODES (SEASON {currentSeason})</Text>
                  <View style={styles.episodeGrid}>
                    {Array.from({ length: tvDetails.seasons.find(s => s.seasonNumber === currentSeason)?.episodeCount || 12 }, (_, i) => i + 1).map((epNum) => (
                      <TouchableOpacity
                        key={`ep-${epNum}`}
                        style={[
                          styles.episodeBox,
                          currentEpisode === epNum && { backgroundColor: '#FF2D55', borderColor: '#FF2D55' }
                        ]}
                        onPress={() => updatePlayerUrl(selectedServer, currentSeason, epNum)}
                      >
                        <Text style={[
                          styles.episodeText,
                          currentEpisode === epNum ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                        ]}>
                          EP {epNum}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Lead Cast & Key Crew Avatars */}
              <View style={styles.extraSection}>
                <Text style={styles.sectionHeading}>CAST & CREW</Text>
                {loadingDetails ? (
                  <ActivityIndicator size="small" color="#FF2D55" style={{ marginVertical: 12 }} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castScroll}>
                    {castList.map((person) => (
                      <TouchableOpacity
                        key={`cast-${person.id}`}
                        style={styles.castCard}
                        onPress={() => onSelectArtist && onSelectArtist(person.id, person.name)}
                      >
                        <Image source={{ uri: person.profileUrl }} style={styles.avatarImage} />
                        <Text style={styles.castName} numberOfLines={1}>{person.name}</Text>
                        <Text style={styles.castRole} numberOfLines={1}>{person.character}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* More Like This Recommendation Carousel */}
              {similarList.length > 0 && (
                <View style={styles.extraSection}>
                  <Text style={styles.sectionHeading}>MORE LIKE THIS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarScroll}>
                    {similarList.map((item) => (
                      <TouchableOpacity
                        key={`similar-${item.id}`}
                        style={styles.similarCard}
                        onPress={() => onSelectSimilarMedia && onSelectSimilarMedia(item)}
                      >
                        <Image source={{ uri: item.posterUrl }} style={styles.similarPoster} />
                        <Text style={styles.similarTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>
                        <Text style={styles.similarSub}>★ {item.rating.toFixed(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  topHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0A0A0C',
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#FF2D55',
    fontSize: 22,
    fontFamily: 'Ndot57',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontFamily: 'Ndot57',
    fontSize: 12,
    letterSpacing: 1,
  },
  placeholder: {
    width: 36,
  },
  topPlayerBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullPlayer: {
    width: '100%',
    height: '100%',
  },
  noPlayerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noPlayerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'LetteraMono',
    fontSize: 11,
    letterSpacing: 1,
  },
  scrollDetailsContent: {
    padding: 16,
    paddingBottom: 40,
  },
  mediaTitle: {
    fontFamily: 'Ndot57',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 1,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 10,
  },
  ratingText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FF2D55',
  },
  reviewCountText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  bulletDot: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 10,
  },
  metaSubText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  actionPillActive: {
    backgroundColor: '#00FF88',
    borderColor: '#00FF88',
  },
  actionPillSaved: {
    borderColor: '#FF2D55',
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
  },
  actionPillText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  largeDownloadButton: {
    width: '100%',
    height: 46,
    backgroundColor: '#FFE500',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  largeDownloadButtonText: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#0A0A0C',
    letterSpacing: 1.5,
    fontWeight: 'bold',
  },
  overviewText: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 17,
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  tvSection: {
    marginTop: 10,
    marginBottom: 20,
  },
  sectionHeading: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  subHeading: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  seasonScroll: {
    gap: 8,
  },
  seasonPill: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  seasonPillText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    letterSpacing: 1,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  episodeBox: {
    width: 60,
    height: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  episodeText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
  },
  serverScroll: {
    gap: 8,
  },
  serverPill: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  serverPillText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  extraSection: {
    marginTop: 16,
  },
  castScroll: {
    gap: 12,
  },
  castCard: {
    width: 70,
    alignItems: 'center',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 6,
  },
  castName: {
    fontFamily: 'NType82Mono',
    fontSize: 8,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  castRole: {
    fontFamily: 'LetteraMono',
    fontSize: 7,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  similarScroll: {
    gap: 10,
  },
  similarCard: {
    width: 90,
  },
  similarPoster: {
    width: 90,
    height: 135,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  similarTitle: {
    fontFamily: 'NType82Mono',
    fontSize: 8,
    color: '#FFFFFF',
    marginTop: 4,
  },
  similarSub: {
    fontFamily: 'Ndot57',
    fontSize: 7,
    color: '#FF2D55',
  },
  troubleContainer: {
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  troubleHeader: {
    backgroundColor: 'rgba(255, 45, 85, 0.06)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  troubleHeaderText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FF2D55',
    letterSpacing: 1.2,
  },
  troubleContent: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderTopWidth: 0.5,
    borderColor: 'rgba(255, 45, 85, 0.2)',
  },
  troubleSubheading: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: '#FF2D55',
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  troubleText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 14,
    letterSpacing: 0.2,
  },
});
