import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
  Animated,
  PanResponder,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { VideoView, useVideoPlayer } from 'expo-video';
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
try {
  ScreenOrientation = require('expo-screen-orientation');
} catch (e) {
  // Graceful fallback if native module is unlinked in Expo Go
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getMediaCredits, getSimilarMedia, getTVShowDetails, CastMember, TMDBMediaItem, TVShowDetails } from '../utils/tmdb';
import { getStreamServerUrl, resolveStreamUrl } from '../utils/streamResolver';
import { recordPlaybackDuration, recordUserAction } from '../utils/TasteEngine';
import { toggleListItem, isInList, STORAGE_KEYS, subscribeStorageChanges } from '../utils/DatabaseStorage';
import { triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic, triggerSelectionHaptic } from '../utils/HapticsHelper';

const { width } = Dimensions.get('window');

function formatSecToTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

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

  // Reaction States & Server Reveal State
  const [isSaved, setIsSaved] = useState(false);
  const [isWatchedState, setIsWatchedState] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoved, setIsLoved] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showServers, setShowServers] = useState(false);

  // YouTube-style Floating Mini Player & Gesture States: 'FULL' | 'MINI' | 'LANDSCAPE'
  const [playerMode, setPlayerMode] = useState<'FULL' | 'MINI' | 'LANDSCAPE'>('FULL');
  const [isPlayingState, setIsPlayingState] = useState(true);

  // In-Player Custom Control Overlay & YouTube Settings Sheet States
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showSettingsSheet, setShowSettingsSheet] = useState<boolean>(false);
  const [ccEnabled, setCcEnabled] = useState<boolean>(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('480p');
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlayingState) {
        setShowControls(false);
      }
    }, 3500);
  };

  const toggleControls = () => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    } else {
      resetControlsTimeout();
    }
  };

  const handleSelectSpeed = (speed: number) => {
    triggerSelectionHaptic();
    setPlaybackSpeed(speed);
    try {
      if (player) {
        player.playbackRate = speed;
      }
    } catch (e) {
      console.warn('[VideoPlayer] player.playbackRate error:', e);
    }
  };

  // WebView ref for audio stop injection on close
  const webviewRef = useRef<any>(null);

  // Floating Mini player Animated Position & PanResponder (YouTube PiP floating card style with edge snapping)
  const miniPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const miniSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        miniPan.extractOffset();
      },
      onPanResponderMove: Animated.event([null, { dx: miniPan.x, dy: miniPan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        miniPan.flattenOffset();
        const screenW = Dimensions.get('window').width;
        const screenH = Dimensions.get('window').height;

        // 1. Dragged DOWN past threshold or fast downward swipe → Slide off screen and Close!
        if (g.dy > 120 || (g.dy > 40 && g.vy > 0.5)) {
          triggerSelectionHaptic();
          Animated.timing(miniPan.y, {
            toValue: 500,
            duration: 220,
            useNativeDriver: false,
          }).start(() => {
            miniPan.setValue({ x: 0, y: 0 });
            handleClose();
          });
          return;
        }

        // 2. Minimal movement (Tap) → Expand back to FULL screen!
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          triggerSelectionHaptic();
          Animated.spring(miniPan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
          setPlayerMode('FULL');
          return;
        }

        // 3. YouTube Edge/Corner Snapping Physics:
        // Calculate nearest horizontal edge (Snap to Left or Right edge)
        const leftLimitX = -(screenW - 210 - 28); // 210 = card width, 28 = margin
        const snapX = g.dx < leftLimitX / 2 ? leftLimitX : 0;

        // Calculate vertical bounds (top edge vs bottom edge)
        const topLimitY = -(screenH - 118 - 140); // 118 = card height
        let snapY = g.dy;
        if (snapY < topLimitY) snapY = topLimitY;
        if (snapY > 0) snapY = 0;

        // Magnetic spring snapping animation to the screen edge
        Animated.spring(miniPan, {
          toValue: { x: snapX, y: snapY },
          friction: 7,
          tension: 40,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  // Full player swipe gesture: swipe DOWN → minimize to MINI popup
  const playerSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 20 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 30 && playerMode === 'FULL' && activeUrl) {
          // Swipe DOWN on full player → minimize to floating mini card!
          triggerSelectionHaptic();
          setPlayerMode('MINI');
        } else if (g.dy < -30 && playerMode === 'LANDSCAPE') {
          // Swipe UP in landscape → back to portrait full
          triggerSelectionHaptic();
          setPlayerMode('FULL');
        }
      },
    })
  ).current;

  // Native Device Orientation Lock (Rotates screen safely if native module exists)
  useEffect(() => {
    if (ScreenOrientation && ScreenOrientation.lockAsync) {
      if (visible && playerMode === 'LANDSCAPE') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
      } else {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    }

    return () => {
      if (ScreenOrientation && ScreenOrientation.lockAsync) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, [visible, playerMode]);

  // Double Back Press Confirmation to avoid accidental exit
  const [backPressCount, setBackPressCount] = useState<number>(0);
  const [showExitToast, setShowExitToast] = useState<boolean>(false);
  const backPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Android Hardware Back Button Interceptor
  useEffect(() => {
    const onBackPress = () => {
      if (!visible) return false;

      if (playerMode === 'LANDSCAPE') {
        triggerSelectionHaptic();
        setPlayerMode('FULL');
        return true;
      }

      if (playerMode === 'FULL' && activeUrl) {
        triggerLightHaptic();
        setPlayerMode('MINI');
        return true;
      }

      if (playerMode === 'MINI' || (playerMode === 'FULL' && !activeUrl)) {
        if (backPressCount === 0) {
          setBackPressCount(1);
          setShowExitToast(true);
          triggerLightHaptic();
          if (backPressTimer.current) clearTimeout(backPressTimer.current);
          backPressTimer.current = setTimeout(() => {
            setBackPressCount(0);
            setShowExitToast(false);
          }, 2000);
          return true;
        } else {
          if (backPressTimer.current) clearTimeout(backPressTimer.current);
          setBackPressCount(0);
          setShowExitToast(false);
          handleClose();
          return true;
        }
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [visible, playerMode, activeUrl, backPressCount]);

  // Multi-Heart Floating Particle Burst Animation State
  const [particles, setParticles] = useState<Array<{ id: number; animX: Animated.Value; animY: Animated.Value; opacity: Animated.Value; scale: Animated.Value }>>([]);

  const checkUserStates = async () => {
    if (!mediaItem) return;
    const mType = mediaItem.mediaType || 'movie';
    const [saved, watched, liked, loved, disliked] = await Promise.all([
      isInList(STORAGE_KEYS.WATCHLIST, mediaItem.id, mType),
      isInList(STORAGE_KEYS.WATCHED, mediaItem.id, mType),
      isInList(STORAGE_KEYS.LIKED, mediaItem.id, mType),
      isInList(STORAGE_KEYS.LOVED, mediaItem.id, mType),
      isInList(STORAGE_KEYS.DISLIKED, mediaItem.id, mType),
    ]);
    setIsSaved(saved);
    setIsWatchedState(watched);
    setIsLiked(liked);
    setIsLoved(loved);
    setIsDisliked(disliked);
  };

  useEffect(() => {
    if (visible && mediaItem) {
      checkUserStates();
    }
  }, [visible, mediaItem]);

  const triggerHeartBurst = () => {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      animX: new Animated.Value((Math.random() - 0.5) * 80),
      animY: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0.8 + Math.random() * 1.0),
    }));

    setParticles(prev => [...prev, ...newParticles]);

    newParticles.forEach((p) => {
      Animated.parallel([
        Animated.timing(p.animY, {
          toValue: -120 - Math.random() * 60,
          duration: 1400 + Math.random() * 600,
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 1400 + Math.random() * 600,
          useNativeDriver: true,
        }),
      ]).start();
    });

    setTimeout(() => {
      setParticles([]);
    }, 2200);
  };

  const handleToggleSaved = async () => {
    if (!mediaItem) return;
    triggerLightHaptic();
    await toggleListItem(STORAGE_KEYS.WATCHLIST, mediaItem);
    if (onToggleWatchlist) onToggleWatchlist();
    checkUserStates();
  };

  const handleToggleWatchedItem = async () => {
    if (!mediaItem) return;
    triggerMediumHaptic();
    await toggleListItem(STORAGE_KEYS.WATCHED, mediaItem);
    if (onToggleWatched) onToggleWatched();
    checkUserStates();
  };

  const handleToggleLike = async () => {
    if (!mediaItem) return;
    triggerLightHaptic();
    await toggleListItem(STORAGE_KEYS.LIKED, mediaItem);
    recordUserAction(mediaItem, 'liked');
    checkUserStates();
  };

  const handleToggleLove = async () => {
    if (!mediaItem) return;
    triggerSuccessHaptic();
    triggerHeartBurst();
    await toggleListItem(STORAGE_KEYS.LOVED, mediaItem);
    recordUserAction(mediaItem, 'loved');
    checkUserStates();
  };

  const handleToggleDislike = async () => {
    if (!mediaItem) return;
    triggerLightHaptic();
    await toggleListItem(STORAGE_KEYS.DISLIKED, mediaItem);
    recordUserAction(mediaItem, 'disliked');
    checkUserStates();
  };

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    console.log(entry);
    setDebugLogs(prev => [entry, ...prev.slice(0, 49)]);
  };

  const latestRequestId = useRef(0);

  const isDirectVideoFile = Boolean(
    activeUrl &&
    (
      activeUrl.includes('.mkv') ||
      activeUrl.includes('.mp4') ||
      activeUrl.includes('.m3u8') ||
      activeUrl.includes('r2.cloudflarestorage.com') ||
      activeUrl.includes('r2.dev') ||
      activeUrl.includes('googleusercontent.com') ||
      activeUrl.includes('.webm') ||
      activeUrl.includes('.ts') ||
      activeUrl.includes('hakunaymatata.com')
    ) &&
    !activeUrl.startsWith('moviebox://') &&
    !activeUrl.startsWith('vegamovies480p://') &&
    !activeUrl.startsWith('fast480p://') &&
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

  // Feed new direct video URLs into the native player instance whenever activeUrl changes
  useEffect(() => {
    if (isDirectVideoFile && activeUrl) {
      try {
        player.replaceAsync({
          uri: activeUrl,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://fmoviesunblocked.net/'
          }
        }).then(() => {
          player.play();
          setIsPlayingState(true);
        }).catch((e: any) => {
          console.warn('[VideoPlayer] player.replaceAsync error:', e);
        });
      } catch (e) {
        console.warn('[VideoPlayer] player.replaceAsync exception:', e);
      }
    }
  }, [activeUrl, isDirectVideoFile]);

  const handleClose = () => {
    // Stop expo-video player
    try { player.pause(); } catch (e) {}
    // Stop any WebView HTML5 audio/video elements to prevent audio leak
    try {
      if (webviewRef.current) {
        webviewRef.current.injectJavaScript(
          `document.querySelectorAll('video,audio').forEach(function(v){v.pause();v.src='';});true;`
        );
      }
    } catch (e) {}
    setActiveUrl(null);
    setLoadingStream(false);
    setPlayerMode('FULL');
    onClose();
  };

  const handleMinimize = () => {
    if (activeUrl) {
      triggerLightHaptic();
      setPlayerMode('MINI');
    } else {
      handleClose();
    }
  };

  useEffect(() => {
    setSelectedServer(1);
    setCurrentSeason(1);
    setCurrentEpisode(1);
    setShowTroubleshoot(false);
    setDebugLogs([]);
    setActiveUrl(null);
    setPlayerMode('FULL');

    if (visible && mediaItem) {
      addLog(`Opened media: "${mediaItem.title || title}" (TMDB ID: ${mediaItem.id})`);
    }

    if (!visible) {
      try {
        player.pause();
      } catch (e) {}
      setActiveUrl(null);
      setLoadingStream(false);
      setPlayerMode('FULL');
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

  const updatePlayerUrl = async (
    serverIdx: number,
    season: number,
    episode: number,
    lang: string = selectedLanguage,
    isFailoverStep: boolean = false
  ) => {
    // If this is a new manual selection or starting step, increment reqId to CANCEL all previous ongoing background tasks instantly!
    const reqId = isFailoverStep ? latestRequestId.current : ++latestRequestId.current;
    
    setSelectedServer(serverIdx);
    setCurrentSeason(season);
    setCurrentEpisode(episode);
    setSelectedLanguage(lang);
    setActiveUrl(null);

    if (mediaItem) {
      addLog(`[SERVER ${serverIdx}] Resolving stream (Season ${season}, Ep ${episode}, Lang ${lang})...`);
      
      if (serverIdx === 1 || serverIdx === 2 || serverIdx === 3) {
        setLoadingStream(true);
        const year = mediaItem.releaseDate
          ? String(mediaItem.releaseDate).substring(0, 4)
          : mediaItem.firstAirDate
          ? String(mediaItem.firstAirDate).substring(0, 4)
          : undefined;
        const imdbId = mediaItem.imdbId || undefined;
        
        const res = await resolveStreamUrl(
          mediaItem.id,
          mediaItem.mediaType || 'movie',
          mediaItem.title || title || '',
          season,
          episode,
          serverIdx,
          lang,
          year,
          imdbId
        );

        // Instant Cancellation: If user selected another server during resolution, discard result!
        if (reqId !== latestRequestId.current) {
          addLog(`[SERVER SWITCH] Discarded stale resolution result for Server ${serverIdx}`);
          return;
        }

        if (res && res.streamUrl && (res.streamUrl.startsWith('http://') || res.streamUrl.startsWith('https://'))) {
          addLog(`Server ${serverIdx} resolved successfully (${res.sourceName}) -> ${res.streamUrl.substring(0, 60)}...`);
          setActiveUrl(res.streamUrl);
          if (res.availableLanguages && res.availableLanguages.length > 0) {
            setAvailableLanguages(res.availableLanguages);
          }
          setLoadingStream(false);
        } else {
          // Sequential Failover: Server 1 -> Server 2 -> Server 3 -> Server 4 (VidSrc Embed)
          const nextServer = serverIdx + 1;
          if (nextServer <= 3) {
            addLog(`Server ${serverIdx} returned no direct link. Sequential failover to Server ${nextServer}...`);
            updatePlayerUrl(nextServer, season, episode, lang, true);
          } else {
            addLog(`Server ${serverIdx} returned no direct link. Final failover to Backup Server (Server 4)...`);
            setSelectedServer(4);
            const fallbackUrl = getStreamServerUrl(4, mediaItem.id, mediaItem.mediaType || 'movie', season, episode, vidsrcBase);
            setActiveUrl(fallbackUrl);
            setLoadingStream(false);
          }
        }
      } else {
        const newUrl = getStreamServerUrl(serverIdx, mediaItem.id, mediaItem.mediaType || 'movie', season, episode, vidsrcBase);
        addLog(`Server ${serverIdx} URL -> ${newUrl}`);
        setActiveUrl(newUrl);
        setLoadingStream(false);
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
        if (document.getElementById('hologram-adblock-styles')) return;
        const style = document.createElement('style');
        style.id = 'hologram-adblock-styles';
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
    <>
      <Modal
        visible={visible && playerMode !== 'MINI'}
        animationType="slide"
        transparent={false}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        onRequestClose={handleMinimize}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
        <SafeAreaView
          style={[styles.container, playerMode === 'LANDSCAPE' && styles.landscapeContainer]}
          edges={playerMode === 'LANDSCAPE' ? [] : ['top', 'bottom']}
        >
          {/* Player Container: 16:9 in portrait, full screen in landscape */}
          <View style={[styles.topPlayerBox, playerMode === 'LANDSCAPE' && styles.landscapePlayerBox]} {...playerSwipeResponder.panHandlers}>
          {loadingStream ? (
            <View style={styles.noPlayerBox}>
              <ActivityIndicator size="large" color="#FF2D55" />
              <Text style={[styles.noPlayerText, { marginTop: 10 }]}>RESOLVING FAST STREAM...</Text>
            </View>
          ) : activeUrl ? (
            isDirectVideoFile ? (
              <View style={{ flex: 1, position: 'relative' }}>
                <VideoView
                  style={styles.fullPlayer}
                  player={player}
                  fullscreenOptions={{ enable: true }}
                  allowsPictureInPicture
                  startsPictureInPictureAutomatically
                  nativeControls={false}
                />
                
                {/* 100% YouTube Screenshot 3 Clean Overlay */}
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.cleanPlayerOverlay}
                  onPress={toggleControls}
                >
                  {showControls && (
                    <View style={styles.cleanControlsContainer}>
                      {/* Top Control Bar: Back Arrow on Left, Gear & Fullscreen on Right */}
                      <View style={styles.cleanTopControls}>
                        <TouchableOpacity
                          style={styles.cleanIconBtn}
                          onPress={() => {
                            triggerSelectionHaptic();
                            handleMinimize();
                          }}
                        >
                          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                        </TouchableOpacity>

                        <View style={styles.cleanTopRightGroup}>
                          {/* Gear Settings Button */}
                          <TouchableOpacity
                            style={styles.cleanIconBtn}
                            onPress={() => {
                              triggerLightHaptic();
                              setShowSettingsSheet(true);
                            }}
                          >
                            <Ionicons name="settings-sharp" size={18} color="#FFFFFF" />
                          </TouchableOpacity>

                          {/* Fullscreen / Rotate Button */}
                          <TouchableOpacity
                            style={styles.cleanIconBtn}
                            onPress={() => {
                              triggerSelectionHaptic();
                              setPlayerMode((prev) => (prev === 'LANDSCAPE' ? 'FULL' : 'LANDSCAPE'));
                            }}
                          >
                            <Ionicons name={playerMode === 'LANDSCAPE' ? 'contract-outline' : 'scan-outline'} size={18} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Center Control Group: 3 Clean Translucent Dark Circles (↺10  ⏯  ↻10) */}
                      <View style={styles.cleanCenterControls}>
                        {/* Seek Rewind 10s */}
                        <TouchableOpacity
                          style={styles.cleanCircleBtnSecondary}
                          onPress={() => {
                            triggerLightHaptic();
                            resetControlsTimeout();
                            try {
                              if (player) player.currentTime = Math.max(0, (player.currentTime || 0) - 10);
                            } catch (e) {}
                          }}
                        >
                          <MaterialCommunityIcons name="rewind-10" size={24} color="#FFFFFF" />
                        </TouchableOpacity>

                        {/* Main Play / Pause Circle */}
                        <TouchableOpacity
                          style={styles.cleanCircleBtnPrimary}
                          onPress={() => {
                            triggerSelectionHaptic();
                            resetControlsTimeout();
                            if (isPlayingState) {
                              try { player.pause(); } catch (e) {}
                              setIsPlayingState(false);
                            } else {
                              try { player.play(); } catch (e) {}
                              setIsPlayingState(true);
                            }
                          }}
                        >
                          <Ionicons
                            name={isPlayingState ? 'pause' : 'play'}
                            size={28}
                            color="#FFFFFF"
                            style={!isPlayingState ? { marginLeft: 3 } : undefined}
                          />
                        </TouchableOpacity>

                        {/* Seek Fast-Forward 10s */}
                        <TouchableOpacity
                          style={styles.cleanCircleBtnSecondary}
                          onPress={() => {
                            triggerLightHaptic();
                            resetControlsTimeout();
                            try {
                              if (player) player.currentTime = Math.min(player.duration || 0, (player.currentTime || 0) + 10);
                            } catch (e) {}
                          }}
                        >
                          <MaterialCommunityIcons name="fast-forward-10" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>

                      {/* Bottom Control Bar: Timestamps, Interactive Scrubber Bar & CC Toggle */}
                      <View style={styles.cleanBottomControls}>
                        <Text style={styles.cleanTimeText}>
                          {formatSecToTime(player?.currentTime || 0)}
                        </Text>
                        
                        {/* Interactive Scrubber Bar */}
                        <TouchableOpacity
                          activeOpacity={1}
                          style={styles.cleanScrubberContainer}
                          onPress={(evt) => {
                            const { locationX } = evt.nativeEvent;
                            const containerWidth = width - 130;
                            const duration = player?.duration || 0;
                            if (duration > 0 && containerWidth > 0) {
                              const seekRatio = Math.max(0, Math.min(1, locationX / containerWidth));
                              const targetTime = seekRatio * duration;
                              try {
                                if (player) player.currentTime = targetTime;
                              } catch (e) {}
                            }
                          }}
                        >
                          <View style={styles.cleanScrubberTrack}>
                            <View
                              style={[
                                styles.cleanScrubberFill,
                                {
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      ((player?.currentTime || 0) / (player?.duration || 1)) * 100
                                    )
                                  )}%`,
                                },
                              ]}
                            />
                            <View
                              style={[
                                styles.cleanScrubberThumb,
                                {
                                  left: `${Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      ((player?.currentTime || 0) / (player?.duration || 1)) * 100
                                    )
                                  )}%`,
                                },
                              ]}
                            />
                          </View>
                        </TouchableOpacity>

                        <Text style={styles.cleanTimeText}>
                          {formatSecToTime(player?.duration || 0)}
                        </Text>

                        {/* CC Toggle */}
                        <TouchableOpacity
                          style={[styles.cleanIconBtn, ccEnabled && { backgroundColor: 'rgba(255, 45, 85, 0.4)' }]}
                          onPress={() => {
                            triggerSelectionHaptic();
                            resetControlsTimeout();
                            setCcEnabled(!ccEnabled);
                          }}
                        >
                          <Ionicons name="chatbox-ellipses-outline" size={16} color={ccEnabled ? '#FF2D55' : '#FFFFFF'} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            ) : isWebViewUrl ? (
              <WebView
                ref={webviewRef}
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

        {/* Scrollable Details Below Video Player (Only rendered in Portrait mode) */}
        {playerMode !== 'LANDSCAPE' && (
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

              {/* 5-Item Circular Glassmorphic Reaction Bar (Clean Vector Icons, LOVE in Center) */}
              <View style={styles.glassCircleToolbar}>
                {/* 1. Bookmark / Watchlist */}
                <TouchableOpacity
                  style={[styles.glassCircleBtn, isSaved && styles.glassCircleSaved]}
                  onPress={handleToggleSaved}
                  activeOpacity={0.8}
                >
                  <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={20} color={isSaved ? "#FF2D55" : "rgba(255,255,255,0.7)"} />
                </TouchableOpacity>

                {/* 2. Watched */}
                <TouchableOpacity
                  style={[styles.glassCircleBtn, isWatchedState && styles.glassCircleWatched]}
                  onPress={handleToggleWatchedItem}
                  activeOpacity={0.8}
                >
                  <Ionicons name={isWatchedState ? "checkmark-circle" : "checkmark-circle-outline"} size={20} color={isWatchedState ? "#00FF88" : "rgba(255,255,255,0.7)"} />
                </TouchableOpacity>

                {/* 3. LOVE (DEAD CENTER) */}
                <TouchableOpacity
                  style={[styles.glassCircleBtn, styles.glassCircleCenter, isLoved && styles.glassCircleLoved]}
                  onPress={handleToggleLove}
                  activeOpacity={0.8}
                >
                  <Ionicons name={isLoved ? "heart" : "heart-outline"} size={24} color={isLoved ? "#FF2D55" : "#FF2D55"} />
                </TouchableOpacity>

                {/* 4. LIKE (YouTube-Style Thumb Up) */}
                <TouchableOpacity
                  style={[styles.glassCircleBtn, isLiked && styles.glassCircleLiked]}
                  onPress={handleToggleLike}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name={isLiked ? "thumb-up" : "thumb-up-outline"} size={22} color={isLiked ? "#FFE500" : "rgba(255,255,255,0.7)"} />
                </TouchableOpacity>

                {/* 5. DISLIKE (YouTube-Style Thumb Down) */}
                <TouchableOpacity
                  style={[styles.glassCircleBtn, isDisliked && styles.glassCircleDisliked]}
                  onPress={handleToggleDislike}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name={isDisliked ? "thumb-down" : "thumb-down-outline"} size={22} color={isDisliked ? "#FF3B30" : "rgba(255,255,255,0.7)"} />
                </TouchableOpacity>

                {/* Multi-Heart Particle Burst Overlay */}
                <View style={styles.particleContainer} pointerEvents="none">
                  {particles.map((p) => (
                    <Animated.View
                      key={p.id}
                      style={[
                        styles.particleHeart,
                        {
                          transform: [
                            { translateX: p.animX },
                            { translateY: p.animY },
                            { scale: p.scale },
                          ],
                          opacity: p.opacity,
                        },
                      ]}
                    >
                      <Ionicons name="heart" size={26} color="#FF2D55" />
                    </Animated.View>
                  ))}
                </View>
              </View>

              {/* Side-By-Side Primary Action Row: STREAM NOW & DOWNLOAD */}
              <View style={styles.primaryActionRow}>
                <TouchableOpacity
                  style={styles.streamActionButton}
                  onPress={() => {
                    setShowServers(true);
                    updatePlayerUrl(selectedServer, currentSeason, currentEpisode);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.streamActionText}>▶ STREAM NOW</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.downloadActionButton}
                  onPress={() => {
                    if (onDownloadPress) {
                      onDownloadPress(currentSeason);
                    } else {
                      addLog(`Download pressed for ${mediaItem?.title || title} (Season ${currentSeason})`);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.downloadActionText}>↓ DOWNLOAD</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.overviewText}>{mediaItem.overview || 'NO OVERVIEW AVAILABLE.'}</Text>

              {/* Multi-Server Selector Row (Reveals only after STREAM NOW click) */}
              {showServers && (
                <View style={styles.tvSection}>
                  <Text style={styles.sectionHeading}>SELECT STREAMING SERVER</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverScroll}>
                    {[
                      { id: 1, name: '⚡ SERVER 1 (VEGAMOVIES 480P)' },
                      { id: 2, name: '🎬 SERVER 2 (MOVIEBOX MP4)' },
                      { id: 3, name: '⚡ SERVER 3 (FZMOVIES 480P)' },
                      { id: 4, name: '🌐 SERVER 4 (VIDSRC 2.RU)' },
                      { id: 5, name: '🌐 SERVER 5 (SUPEREMBED)' },
                      { id: 6, name: '🌐 SERVER 6 (ANYEMBED)' },
                    ].map((srv) => (
                      <TouchableOpacity
                        key={`server-${srv.id}`}
                        style={[
                          styles.serverPill,
                          selectedServer === srv.id && { backgroundColor: '#FF2D55', borderColor: '#FF2D55' }
                        ]}
                        onPress={() => updatePlayerUrl(srv.id, currentSeason, currentEpisode)}
                      >
                        <Text style={[
                          styles.serverPillText,
                          selectedServer === srv.id ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                        ]}>
                          {srv.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Dynamic Audio Dub Selector for MovieBox */}
              {selectedServer === 2 && availableLanguages.length > 1 && (
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

              {/* Row 1: Director & Key Crew */}
              <View style={styles.extraSection}>
                <Text style={styles.sectionHeading}>DIRECTOR & CREW</Text>
                {loadingDetails ? (
                  <ActivityIndicator size="small" color="#FF2D55" style={{ marginVertical: 12 }} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castScroll}>
                    {castList
                      .filter(p => !p.character || p.character.toLowerCase().includes('director') || p.character.toLowerCase().includes('writer') || p.character.toLowerCase().includes('creator'))
                      .concat(castList.slice(0, 2))
                      .slice(0, 8)
                      .map((person, idx) => (
                        <TouchableOpacity
                          key={`crew-${person.id}-${idx}`}
                          style={styles.castCard}
                          onPress={() => onSelectArtist && onSelectArtist(person.id, person.name)}
                        >
                          <Image source={{ uri: person.profileUrl }} style={styles.avatarImage} />
                          <Text style={styles.castName} numberOfLines={1}>{person.name}</Text>
                          <Text style={styles.castRole} numberOfLines={1}>{person.character || 'DIRECTOR / CREW'}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                )}
              </View>

              {/* Row 2: Top Cast & Starring */}
              <View style={styles.extraSection}>
                <Text style={styles.sectionHeading}>TOP CAST & STARRING</Text>
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
                        <Text style={styles.castRole} numberOfLines={1}>{person.character || 'STARRING'}</Text>
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
        )}
      </SafeAreaView>
    </Modal>

    {/* YouTube-Style Floating PiP Card Mini Player */}
    {visible && playerMode === 'MINI' && activeUrl && (
      <Animated.View
        style={[
          styles.floatingMiniPlayerCard,
          {
            transform: [
              { translateX: miniPan.x },
              { translateY: miniPan.y }
            ]
          }
        ]}
        {...miniSwipeResponder.panHandlers}
      >
        <View style={styles.floatingVideoWrapper}>
          {isDirectVideoFile ? (
            <VideoView style={{ flex: 1 }} player={player} nativeControls={false} contentFit="cover" />
          ) : isWebViewUrl ? (
            <WebView
              key={`mini-${activeUrl}`}
              source={{ uri: activeUrl }}
              style={{ flex: 1 }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              injectedJavaScript={blockAdsJS}
            />
          ) : (
            <View style={styles.miniPlaceholderWrapper}>
              <Ionicons name="film-outline" size={28} color="#FF2D55" />
            </View>
          )}

          {/* Floating Control Overlay: Play/Pause Circular Button (Top-Left Corner), Close (X) Circular Button (Top-Right Corner) */}
          <View style={styles.floatingControlOverlay} pointerEvents="box-none">
            {/* Play / Pause Circular Button (Top-Left Corner) */}
            <TouchableOpacity
              style={styles.floatingPlayBtn}
              activeOpacity={0.8}
              onPress={() => {
                triggerSelectionHaptic();
                if (isPlayingState) {
                  try { player.pause(); } catch (e) {}
                  setIsPlayingState(false);
                } else {
                  try { player.play(); } catch (e) {}
                  setIsPlayingState(true);
                }
              }}
            >
              <Ionicons
                name={isPlayingState ? 'pause' : 'play'}
                size={16}
                color="#FFFFFF"
                style={!isPlayingState ? { marginLeft: 1 } : undefined}
              />
            </TouchableOpacity>

            {/* Exit (X) Circular Button (Top-Right Corner) */}
            <TouchableOpacity
              style={styles.floatingCloseBtn}
              activeOpacity={0.8}
              onPress={() => {
                triggerSelectionHaptic();
                handleClose();
              }}
            >
              <Ionicons name="close" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    )}

    {/* YouTube-Style Settings Bottom Sheet Modal */}
    <Modal
      visible={showSettingsSheet}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowSettingsSheet(false)}
    >
      <TouchableOpacity
        style={styles.settingsBackdrop}
        activeOpacity={1}
        onPress={() => setShowSettingsSheet(false)}
      >
        <TouchableOpacity style={styles.settingsSheetCard} activeOpacity={1}>
          {/* Sheet Handle Bar */}
          <View style={styles.sheetHandleBar} />

          <Text style={styles.sheetHeaderTitle}>PLAYBACK SETTINGS</Text>

          {/* 1. Quality Selection (480p / 720p Max) */}
          <View style={styles.sheetSection}>
            <View style={styles.sheetRowHeader}>
              <Ionicons name="options-outline" size={16} color="#FFE500" />
              <Text style={styles.sheetSectionTitle}>STREAM QUALITY (MAX 720P)</Text>
            </View>
            <View style={styles.sheetPillsRow}>
              {['480p', '720p'].map((q) => (
                <TouchableOpacity
                  key={`quality-${q}`}
                  style={[styles.sheetPill, selectedQuality === q && styles.sheetPillActive]}
                  onPress={() => {
                    triggerSelectionHaptic();
                    setSelectedQuality(q);
                  }}
                >
                  <Text style={[styles.sheetPillText, selectedQuality === q && styles.sheetPillTextActive]}>
                    {q === '480p' ? '480p (FAST MOBILE)' : '720p (HD MAX)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 2. Playback Speed */}
          <View style={styles.sheetSection}>
            <View style={styles.sheetRowHeader}>
              <Ionicons name="speedometer-outline" size={16} color="#00E5FF" />
              <Text style={styles.sheetSectionTitle}>PLAYBACK SPEED</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetPillsRow}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                <TouchableOpacity
                  key={`sheet-speed-${s}`}
                  style={[styles.sheetPill, playbackSpeed === s && styles.sheetPillActive]}
                  onPress={() => {
                    triggerSelectionHaptic();
                    setPlaybackSpeed(s);
                    try { if (player) player.playbackRate = s; } catch (e) {}
                  }}
                >
                  <Text style={[styles.sheetPillText, playbackSpeed === s && styles.sheetPillTextActive]}>
                    {s === 1.0 ? '1.0x Normal' : `${s}x`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* 3. Audio Track / Language Dubbing */}
          {availableLanguages.length > 0 && (
            <View style={styles.sheetSection}>
              <View style={styles.sheetRowHeader}>
                <Ionicons name="volume-high-outline" size={16} color="#00FF88" />
                <Text style={styles.sheetSectionTitle}>AUDIO DUB / LANGUAGE</Text>
              </View>
              <View style={styles.sheetPillsRow}>
                {availableLanguages.map((lang) => (
                  <TouchableOpacity
                    key={`sheet-audio-${lang}`}
                    style={[styles.sheetPill, selectedLanguage === lang && styles.sheetPillActive]}
                    onPress={() => {
                      triggerSelectionHaptic();
                      updatePlayerUrl(selectedServer, currentSeason, currentEpisode, lang);
                    }}
                  >
                    <Text style={[styles.sheetPillText, selectedLanguage === lang && styles.sheetPillTextActive]}>
                      🌐 {lang.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Done Button */}
          <TouchableOpacity
            style={styles.sheetDoneBtn}
            onPress={() => setShowSettingsSheet(false)}
          >
            <Text style={styles.sheetDoneText}>DONE</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* Double Back Exit Confirmation Toast */}
    {showExitToast && (
      <View style={styles.exitToastContainer}>
        <Text style={styles.exitToastText}>Press back again to exit video player</Text>
      </View>
    )}
    </>
  );
};

const styles = StyleSheet.create({
  // YouTube-Style Floating PiP Card Mini Player Styles
  floatingMiniPlayerCard: {
    position: 'absolute',
    bottom: 72,
    right: 14,
    width: 210,
    height: 118,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0A0A0C',
    elevation: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 99999,
  },
  floatingVideoWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  miniPlaceholderWrapper: {
    flex: 1,
    backgroundColor: '#121216',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingControlOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingPlayBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  floatingCloseBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  miniInfoBox: {
    flex: 1,
    justifyContent: 'center',
  },
  miniTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  miniSubTitle: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  miniControlBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitToastContainer: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF2D55',
    zIndex: 999999,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
  },
  exitToastText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  landscapeContainer: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 0,
    margin: 0,
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
    overflow: 'hidden',
    position: 'relative',
  },
  landscapePlayerBox: {
    flex: 1,
    width: '100%',
    aspectRatio: undefined,
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
  },
  exitLandscapeBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 100000,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 12, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF2D55',
    gap: 6,
  },
  exitLandscapeText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  fullPlayer: {
    width: '100%',
    height: '100%',
  },
  inPlayerOverlayPills: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10001,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerControlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 12, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 5,
  },
  playerControlPillText: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  inPlayerPopoverMenu: {
    position: 'absolute',
    top: 44,
    right: 12,
    zIndex: 10002,
    backgroundColor: 'rgba(15, 15, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FF2D55',
    padding: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 12,
  },
  popoverHeaderTitle: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#8E8E93',
    marginBottom: 6,
    paddingHorizontal: 6,
    letterSpacing: 0.5,
  },
  popoverMenuItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  popoverMenuItemActive: {
    backgroundColor: '#FFE500',
  },
  popoverMenuItemText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
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
  // Screenshot 3 YouTube Clean Overlay Styles
  cleanPlayerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'space-between',
    zIndex: 10000,
  },
  cleanControlsContainer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  cleanTopControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  cleanTopRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cleanIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cleanCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  cleanCircleBtnPrimary: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  cleanCircleBtnSecondary: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cleanBottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
    gap: 6,
  },
  cleanTimeText: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cleanScrubberContainer: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cleanScrubberTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    position: 'relative',
    justifyContent: 'center',
  },
  cleanScrubberFill: {
    height: 3,
    backgroundColor: '#FF2D55',
    borderRadius: 1.5,
  },
  cleanScrubberThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF2D55',
    marginLeft: -6,
    top: -4.5,
    elevation: 4,
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
  glassCircleToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 14,
    width: '100%',
    paddingHorizontal: 8,
    position: 'relative',
  },
  glassCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassCircleCenter: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderColor: 'rgba(255, 45, 85, 0.35)',
    backgroundColor: 'rgba(255, 45, 85, 0.15)',
  },
  glassCircleSaved: {
    backgroundColor: 'rgba(255, 45, 85, 0.2)',
    borderColor: '#FF2D55',
  },
  glassCircleWatched: {
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderColor: '#00FF88',
  },
  glassCircleLiked: {
    backgroundColor: 'rgba(255, 229, 0, 0.2)',
    borderColor: '#FFE500',
  },
  glassCircleLoved: {
    backgroundColor: 'rgba(255, 45, 85, 0.3)',
    borderColor: '#FF2D55',
  },
  glassCircleDisliked: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    borderColor: '#FF3B30',
  },
  particleContainer: {
    position: 'absolute',
    top: -20,
    left: '50%',
    width: 100,
    height: 100,
    marginLeft: -50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particleHeart: {
    position: 'absolute',
  },
  // YouTube Settings Bottom Sheet Styles
  settingsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  settingsSheetCard: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 24,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderTitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  sheetSection: {
    marginBottom: 16,
  },
  sheetRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sheetSectionTitle: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sheetPillsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  sheetPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sheetPillActive: {
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
  },
  sheetPillText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  sheetPillTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sheetDoneBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  sheetDoneText: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
