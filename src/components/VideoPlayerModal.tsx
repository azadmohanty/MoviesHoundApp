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
import { getStreamServerUrl, resolveStreamUrl } from '../utils/streamResolver';

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
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [castList, setCastList] = useState<CastMember[]>([]);
  const [similarList, setSimilarList] = useState<TMDBMediaItem[]>([]);
  const [tvDetails, setTvDetails] = useState<TVShowDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('Original');

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    console.log(entry);
    setDebugLogs(prev => [entry, ...prev.slice(0, 49)]);
  };

  const isDirectVideoFile = Boolean(
    activeUrl &&
    (activeUrl.includes('.m3u8') || activeUrl.includes('.mp4')) &&
    !activeUrl.startsWith('moviebox://') &&
    !activeUrl.startsWith('torrentio://')
  );

  const isWebViewUrl = Boolean(
    activeUrl &&
    (activeUrl.startsWith('http://') || activeUrl.startsWith('https://')) &&
    !isDirectVideoFile
  );

  const player = useVideoPlayer('', (playerInstance) => {
    playerInstance.loop = false;
  });

  // Feed new direct video URLs into the player instance whenever activeUrl changes
  useEffect(() => {
    if (
      activeUrl &&
      (activeUrl.includes('.mp4') || activeUrl.includes('.m3u8')) &&
      !activeUrl.startsWith('moviebox://') &&
      !activeUrl.startsWith('torrentio://')
    ) {
      try {
        player.replaceAsync({
          uri: activeUrl,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://fmoviesunblocked.net/'
          }
        }).then(() => {
          player.play();
        }).catch((e: any) => {
          console.warn('[VideoPlayer] player.replaceAsync error:', e);
        });
      } catch (e) {
        console.warn('[VideoPlayer] player.replaceAsync exception:', e);
      }
    }
  }, [activeUrl]);

  const handleClose = () => {
    try {
      player.pause();
    } catch (e) {}
    setActiveUrl(null);
    setLoadingStream(false);
    onClose();
  };

  useEffect(() => {
    setSelectedServer(1);
    setCurrentSeason(1);
    setCurrentEpisode(1);
    setShowTroubleshoot(false);
    setDebugLogs([]);
    setActiveUrl(null); // Don't auto-resolve on open; show poster first

    if (visible && mediaItem) {
      addLog(`Opened media: "${mediaItem.title || title}" (TMDB ID: ${mediaItem.id})`);
    }

    if (!visible) {
      try {
        player.pause();
      } catch (e) {}
      setActiveUrl(null);
      setLoadingStream(false);
    }
  }, [videoUrl, visible]);

  useEffect(() => {
    if (visible && mediaItem) {
      loadMediaExtras();
    }
  }, [visible, mediaItem]);

  const loadMediaExtras = async () => {
    if (!mediaItem) return;
    try {
      setLoadingDetails(true);
      const credits = await getMediaCredits(mediaItem.id, mediaItem.mediaType || 'movie');
      setCastList(credits);

      const similar = await getSimilarMedia(mediaItem.id, mediaItem.mediaType || 'movie');
      setSimilarList(similar);

      if (mediaItem.mediaType === 'tv') {
        const tv = await getTVShowDetails(mediaItem.id);
        setTvDetails(tv);
      }
    } catch (e: any) {
      addLog(`Error loading media extras: ${e.message}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  const updatePlayerUrl = async (serverIdx: number, season: number, episode: number, lang: string = selectedLanguage) => {
    setSelectedServer(serverIdx);
    setCurrentSeason(season);
    setCurrentEpisode(episode);
    setSelectedLanguage(lang);
    setActiveUrl(null);

    if (mediaItem) {
      addLog(`Switching to Server ${serverIdx} (Season ${season}, Ep ${episode}, Lang ${lang})`);
      if (serverIdx === 1 || serverIdx === 2) {
        setLoadingStream(true);
        addLog(`Resolving Server ${serverIdx} stream asynchronously...`);
        const res = await resolveStreamUrl(
          mediaItem.id,
          mediaItem.mediaType || 'movie',
          mediaItem.title || title || '',
          season,
          episode,
          serverIdx,
          lang
        );

        if (res && res.streamUrl && (res.streamUrl.startsWith('http://') || res.streamUrl.startsWith('https://'))) {
          addLog(`Server ${serverIdx} resolved successfully (${res.language || 'Original'}) -> ${res.streamUrl.substring(0, 60)}...`);
          setActiveUrl(res.streamUrl);
          if (res.availableLanguages && res.availableLanguages.length > 0) {
            setAvailableLanguages(res.availableLanguages);
          }
        } else {
          addLog(`Server ${serverIdx} resolution returned no direct link. Falling back to Server 3 (SuperEmbed Simple)...`);
          const fallbackUrl = getStreamServerUrl(3, mediaItem.id, mediaItem.mediaType || 'movie', season, episode, vidsrcBase);
          setActiveUrl(fallbackUrl);
        }
        setLoadingStream(false);
      } else {
        const newUrl = getStreamServerUrl(serverIdx, mediaItem.id, mediaItem.mediaType || 'movie', season, episode, vidsrcBase);
        addLog(`Server ${serverIdx} URL -> ${newUrl}`);
        setActiveUrl(newUrl);
      }
    }
  };

  // Safe CSS Ad-Blocker (Prevents removeChild Virtual DOM crashes)
  const blockAdsJS = `
    (function() {
      window.open = function() { return null; };
      window.alert = function() { return true; };
      window.confirm = function() { return true; };

      const injectCssAdBlocker = () => {
        if (document.getElementById('movieshound-adblock-styles')) return;
        const style = document.createElement('style');
        style.id = 'movieshound-adblock-styles';
        style.innerHTML = \`
          iframe[src*="ads"], iframe[src*="pop"], iframe[src*="doubleclick"],
          div[class*="ad-"], div[class*="ads-"], div[id*="pop-"], div[id*="ad-banner"],
          .popunder, .popup, #popunder, #popup {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
            visibility: hidden !important;
          }
        \`;
        if (document.head) document.head.appendChild(style);
      };

      injectCssAdBlocker();
      setInterval(injectCssAdBlocker, 500);
    })();
    true;
  `;

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
      <SafeAreaView style={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
          <TouchableOpacity onPress={() => setShowLogs(!showLogs)} style={styles.logButton}>
            <Text style={[styles.logButtonText, showLogs && { color: '#FFE500' }]}>
              {showLogs ? '⚡ HIDE LOGS' : '⚡ LOGS'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 16:9 YouTube-Style Top Player Container */}
        <View style={styles.topPlayerBox}>
          {loadingStream ? (
            <View style={styles.noPlayerBox}>
              <ActivityIndicator size="large" color="#FF2D55" />
              <Text style={[styles.noPlayerText, { marginTop: 10 }]}>RESOLVING FAST STREAM...</Text>
            </View>
          ) : activeUrl ? (
            isDirectVideoFile ? (
              <VideoView
                style={styles.fullPlayer}
                player={player}
                fullscreenOptions={{ enable: true }}
                allowsPictureInPicture
                startsPictureInPictureAutomatically
                showsTimecodes
              />
            ) : isWebViewUrl ? (
              <WebView
                key={activeUrl}
                source={{ uri: activeUrl }}
                style={styles.fullPlayer}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                injectedJavaScript={blockAdsJS}
                onShouldStartLoadWithRequest={(request) => {
                  const url = request.url;
                  // Allow initial load, inner player frames, and legitimate stream player domains
                  if (
                    url.startsWith('http://') ||
                    url.startsWith('https://')
                  ) {
                    if (
                      url.includes('multiembed') ||
                      url.includes('streamingnow') ||
                      url.includes('vidsrc') ||
                      url.includes('autoembed') ||
                      url.includes('anyembed') ||
                      url.includes('smashystream') ||
                      url.includes('hakunaymatata') ||
                      url.includes('embed') ||
                      url === activeUrl ||
                      request.isTopFrame === false
                    ) {
                      return true;
                    }
                  }
                  // Block external ad popups, intent:// URLs, and app store hijacks
                  addLog(`Blocked ad popup redirect -> ${url.substring(0, 50)}...`);
                  return false;
                }}
              />
            ) : (
              <View style={styles.noPlayerBox}>
                <Text style={styles.noPlayerText}>PREPARING STREAM...</Text>
              </View>
            )
          ) : (
            <View style={styles.posterPreviewContainer}>
              {(() => {
                const backdropUri = mediaItem?.backdropUrl
                  ? mediaItem.backdropUrl
                  : mediaItem?.backdropPath
                  ? mediaItem.backdropPath.startsWith('http')
                    ? mediaItem.backdropPath
                    : `https://image.tmdb.org/t/p/w780${mediaItem.backdropPath}`
                  : null;

                const posterUri = mediaItem?.posterUrl
                  ? mediaItem.posterUrl
                  : mediaItem?.posterPath
                  ? mediaItem.posterPath.startsWith('http')
                    ? mediaItem.posterPath
                    : `https://image.tmdb.org/t/p/w500${mediaItem.posterPath}`
                  : backdropUri;

                return (
                  <>
                    {/* Blurred 16:9 Ambient Backdrop */}
                    {backdropUri ? (
                      <Image
                        source={{ uri: backdropUri }}
                        style={styles.blurredBackdropImage}
                        blurRadius={20}
                        resizeMode="cover"
                      />
                    ) : null}
                    {/* Dark Tint Overlay */}
                    <View style={styles.posterOverlayGradient} />

                    {/* Floating 2:3 Sharp Poster Card */}
                    {posterUri ? (
                      <View style={styles.floatingPosterWrapper}>
                        <Image
                          source={{ uri: posterUri }}
                          style={styles.floatingPosterImage}
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View style={styles.noPlayerBox}>
                        <Text style={styles.noPlayerText}>READY TO STREAM</Text>
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          )}

          {/* On-Screen Live Debug Console Overlay */}
          {showLogs && (
            <View style={styles.debugOverlay}>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
                <Text style={styles.debugTitle}>--- LIVE STREAM DEBUG CONSOLE ---</Text>
                {debugLogs.map((logLine, idx) => (
                  <Text key={`log-${idx}`} style={styles.debugText}>{logLine}</Text>
                ))}
              </ScrollView>
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

              {/* Side-By-Side Primary Action Row: STREAM NOW & DOWNLOAD */}
              <View style={styles.primaryActionRow}>
                <TouchableOpacity
                  style={styles.streamActionButton}
                  onPress={() => updatePlayerUrl(selectedServer, currentSeason, currentEpisode)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.streamActionText}>▶ STREAM NOW</Text>
                </TouchableOpacity>

                {onDownloadPress && (
                  <TouchableOpacity
                    style={styles.downloadActionButton}
                    onPress={() => onDownloadPress(currentSeason)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.downloadActionText}>↓ DOWNLOAD</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.overviewText}>{mediaItem.overview || 'NO OVERVIEW AVAILABLE.'}</Text>

              {/* Multi-Server Selector Row */}
              <View style={styles.tvSection}>
                <Text style={styles.sectionHeading}>SELECT STREAMING SERVER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverScroll}>
                  {[1, 2, 3, 4].map((idx) => {
                    let label = `SERVER ${idx}`;
                    if (idx === 1) label = 'SERVER 1 (MOVIEBOX MP4)';
                    if (idx === 2) label = 'SERVER 2 (VIDSRC 2.RU)';
                    if (idx === 3) label = 'SERVER 3 (SUPEREMBED)';
                    if (idx === 4) label = 'SERVER 4 (ANYEMBED)';
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

              {/* Dynamic Audio Dub Selector for MovieBox */}
              {selectedServer === 1 && availableLanguages.length > 1 && (
                <View style={[styles.tvSection, { marginTop: 12 }]}>
                  <Text style={styles.sectionHeading}>SELECT AUDIO TRACK / DUB</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    {availableLanguages.map((lang) => (
                      <TouchableOpacity
                        key={`lang-${lang}`}
                        style={[
                          styles.serverPill,
                          selectedLanguage === lang && { backgroundColor: '#FF2D55', borderColor: '#FF2D55' }
                        ]}
                        onPress={() => updatePlayerUrl(1, currentSeason, currentEpisode, lang)}
                      >
                        <Text style={[
                          styles.serverPillText,
                          selectedLanguage === lang ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                        ]}>
                          🌐 {lang.toUpperCase()} AUDIO
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

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
  logButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  logButtonText: {
    color: '#00FF88',
    fontFamily: 'Ndot57',
    fontSize: 10,
    letterSpacing: 0.5,
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
    position: 'relative',
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
  debugOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 12, 0.92)',
    padding: 10,
    zIndex: 9999,
  },
  debugTitle: {
    color: '#FF2D55',
    fontFamily: 'Ndot57',
    fontSize: 11,
    marginBottom: 8,
    textAlign: 'center',
  },
  debugText: {
    color: '#00FF88',
    fontFamily: 'LetteraMono',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 4,
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
  posterPreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#0A0A0C',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  blurredBackdropImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.65,
  },
  posterOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 12, 0.45)',
  },
  floatingPosterWrapper: {
    height: '85%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  floatingPosterImage: {
    width: '100%',
    height: '100%',
  },
  streamNowOverlayButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF2D55',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  streamNowOverlayIcon: {
    color: '#FFFFFF',
    fontSize: 22,
    marginLeft: 3, // Optical centering for play triangle
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 12,
    width: '100%',
  },
  streamActionButton: {
    flex: 1,
    backgroundColor: '#FF2D55',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  streamActionText: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  downloadActionButton: {
    flex: 1,
    backgroundColor: '#FFE500',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#FFE500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  downloadActionText: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#0A0A0C',
    letterSpacing: 1.2,
  },
});
