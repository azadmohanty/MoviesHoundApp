import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  Text,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Animated,
  PanResponder,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { MovieBoxStreamSource, MovieBoxCaption, MovieBoxEpisode } from '../services/movieboxService';
import { savePlaybackProgress } from '../utils/DatabaseStorage';
import { triggerLightHaptic, triggerMediumHaptic, triggerSelectionHaptic } from '../utils/HapticsHelper';

const { width, height } = Dimensions.get('window');

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

export interface OttVideoPlayerModalProps {
  visible: boolean;
  title: string;
  subjectId: string;
  detailPath: string;
  seasonNum?: number;
  episodeNum?: number;
  sources: MovieBoxStreamSource[];
  captions?: MovieBoxCaption[];
  episodes?: MovieBoxEpisode[];
  onClose: () => void;
  onEpisodeChange?: (season: number, episode: number) => void;
}

export const OttVideoPlayerModal: React.FC<OttVideoPlayerModalProps> = ({
  visible,
  title,
  subjectId,
  detailPath,
  seasonNum = 1,
  episodeNum = 1,
  sources,
  captions = [],
  episodes = [],
  onClose,
  onEpisodeChange,
}) => {
  const [selectedQualityIndex, setSelectedQualityIndex] = useState<number>(0);
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState<number>(-1); // -1 = Off
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showQualitySheet, setShowQualitySheet] = useState<boolean>(false);
  const [showCaptionSheet, setShowCaptionSheet] = useState<boolean>(false);
  const [showEpisodeSheet, setShowEpisodeSheet] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<WebView | null>(null);

  const activeSource = sources[selectedQualityIndex] || sources[0];

  useEffect(() => {
    // Default to highest resolution available (usually first in array e.g. 1080p)
    if (sources && sources.length > 0) {
      setSelectedQualityIndex(0);
    }
  }, [sources]);

  useEffect(() => {
    const handleBack = () => {
      if (visible) {
        onClose();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [visible, onClose]);

  const resetControlsTimer = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4500);
  };

  const handleToggleControls = () => {
    triggerSelectionHaptic();
    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimer();
    }
  };

  const handlePlayPause = () => {
    triggerLightHaptic();
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.playerVideo) {
          if (${nextState}) { window.playerVideo.play(); } else { window.playerVideo.pause(); }
        }
        true;
      `);
    }
    resetControlsTimer();
  };

  const handleSeek = (deltaSec: number) => {
    triggerMediumHaptic();
    const newTime = Math.max(0, Math.min(currentTime + deltaSec, duration));
    setCurrentTime(newTime);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.playerVideo) {
          window.playerVideo.currentTime = ${newTime};
        }
        true;
      `);
    }
    resetControlsTimer();
  };

  const handleSelectQuality = (index: number) => {
    triggerLightHaptic();
    setSelectedQualityIndex(index);
    setShowQualitySheet(false);
    setIsLoading(true);
    resetControlsTimer();
  };

  const handleSelectCaption = (index: number) => {
    triggerLightHaptic();
    setSelectedCaptionIndex(index);
    setShowCaptionSheet(false);
    const cap = captions[index];
    if (webViewRef.current) {
      if (index === -1 || !cap) {
        webViewRef.current.injectJavaScript(`
          if (window.disableSubtitles) { window.disableSubtitles(); }
          true;
        `);
      } else {
        webViewRef.current.injectJavaScript(`
          if (window.loadSubtitleTrack) { window.loadSubtitleTrack("${cap.url}", "${cap.language}"); }
          true;
        `);
      }
    }
    resetControlsTimer();
  };

  const handleSelectEpisode = (epNum: number) => {
    triggerLightHaptic();
    setShowEpisodeSheet(false);
    if (onEpisodeChange) {
      onEpisodeChange(seasonNum, epNum);
    }
  };

  // Build the self-contained HTML5 Player with custom HLS/MP4 rendering and canvas subtitles
  const generatePlayerHtml = () => {
    if (!activeSource?.url) {
      return `<!DOCTYPE html><html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;"><h3>No Stream Available</h3></body></html>`;
    }

    const currentCap = selectedCaptionIndex >= 0 ? captions[selectedCaptionIndex] : null;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    ::cue {
      background: rgba(0, 0, 0, 0.75);
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 1.15rem;
      font-weight: 600;
      text-shadow: 0 1px 4px #000;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <video id="vid" playsinline webkit-playsinline></video>
  <script>
    const video = document.getElementById('vid');
    window.playerVideo = video;
    const streamUrl = "${activeSource.url}";
    const isHls = streamUrl.includes('.m3u8');

    function sendEvent(type, data = {}) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
      }
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: function(xhr) {
          xhr.setRequestHeader('Referer', 'https://netfilm.world/');
        }
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        video.play();
        sendEvent('ready');
      });
    } else {
      video.src = streamUrl;
      video.play();
    }

    video.addEventListener('timeupdate', () => {
      sendEvent('timeupdate', { currentTime: video.currentTime, duration: video.duration });
    });

    video.addEventListener('playing', () => {
      sendEvent('playing');
    });

    video.addEventListener('waiting', () => {
      sendEvent('waiting');
    });

    video.addEventListener('ended', () => {
      sendEvent('ended');
    });

    window.loadSubtitleTrack = function(url, lang) {
      window.disableSubtitles();
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = lang || 'English';
      track.srclang = lang || 'en';
      track.src = url;
      track.default = true;
      video.appendChild(track);
      track.mode = 'showing';
    };

    window.disableSubtitles = function() {
      const oldTracks = video.querySelectorAll('track');
      oldTracks.forEach(t => t.remove());
    };

    ${currentCap ? `window.loadSubtitleTrack("${currentCap.url}", "${currentCap.language}");` : ''}
  </script>
</body>
</html>`;
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'timeupdate') {
        setCurrentTime(data.currentTime || 0);
        if (data.duration && data.duration > 0) {
          setDuration(data.duration);
        }
        // Persist watch progress every 10s
        if (subjectId && Math.floor(data.currentTime) % 10 === 0) {
          savePlaybackProgress(subjectId, data.currentTime, data.duration || 0, `S${seasonNum} E${episodeNum}`);
        }
      } else if (data.type === 'playing' || data.type === 'ready') {
        setIsLoading(false);
        setIsPlaying(true);
      } else if (data.type === 'waiting') {
        setIsLoading(true);
      }
    } catch {
      // ignore message parse error
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" hardwareAccelerated transparent={false} onRequestClose={onClose}>
      <StatusBar hidden backgroundColor="#000" barStyle="light-content" />
      <View style={styles.container}>
        {/* The Native HTML5/HLS Video Player Engine */}
        <WebView
          ref={webViewRef}
          source={{ html: generatePlayerHtml(), baseUrl: 'https://netfilm.world' }}
          style={styles.webView}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleMessage}
          originWhitelist={['*']}
          mixedContentMode="always"
        />

        {/* Loading Spinner */}
        {isLoading && (
          <View style={styles.loaderOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#00e5ff" />
            <Text style={styles.loaderText}>Buffering {activeSource?.resolution || 'HD'} Stream...</Text>
          </View>
        )}

        {/* Touch Overlay to Toggle Controls */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleToggleControls} />

        {/* Custom Overlaid Player Controls */}
        {showControls && (
          <SafeAreaView style={styles.controlsOverlay} pointerEvents="box-none">
            {/* Top Bar: Title & Options */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </TouchableOpacity>

              <View style={styles.titleBox}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.subtitleText}>
                  {episodes.length > 0 ? `Season ${seasonNum} • Episode ${episodeNum}` : 'Feature Film'}
                </Text>
              </View>

              <View style={styles.topActions}>
                {/* Quality Switcher Button */}
                <TouchableOpacity style={styles.badgeBtn} onPress={() => setShowQualitySheet(true)}>
                  <MaterialCommunityIcons name="quality-high" size={18} color="#00e5ff" />
                  <Text style={styles.badgeText}>{activeSource?.resolution || '1080p'}</Text>
                </TouchableOpacity>

                {/* Subtitle Button */}
                {captions.length > 0 && (
                  <TouchableOpacity style={styles.iconBtn} onPress={() => setShowCaptionSheet(true)}>
                    <MaterialCommunityIcons
                      name={selectedCaptionIndex >= 0 ? 'closed-caption' : 'closed-caption-outline'}
                      size={24}
                      color={selectedCaptionIndex >= 0 ? '#00e5ff' : '#fff'}
                    />
                  </TouchableOpacity>
                )}

                {/* Episode Selector Button (for Series) */}
                {episodes.length > 1 && (
                  <TouchableOpacity style={styles.iconBtn} onPress={() => setShowEpisodeSheet(true)}>
                    <MaterialCommunityIcons name="playlist-play" size={26} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Center Controls: Skip -10s | Play/Pause | Skip +10s */}
            <View style={styles.centerControls} pointerEvents="box-none">
              <TouchableOpacity style={styles.seekBtn} onPress={() => handleSeek(-10)}>
                <MaterialCommunityIcons name="rewind-10" size={38} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.playPauseBtn} onPress={handlePlayPause}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={44} color="#000" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.seekBtn} onPress={() => handleSeek(10)}>
                <MaterialCommunityIcons name="fast-forward-10" size={38} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Bottom Bar: Timeline & Scrubber */}
            <View style={styles.bottomBar}>
              <Text style={styles.timeText}>{formatSecToTime(currentTime)}</Text>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.timeText}>{formatSecToTime(duration)}</Text>
            </View>
          </SafeAreaView>
        )}

        {/* Quality Selection Bottom Sheet */}
        {showQualitySheet && (
          <View style={styles.sheetOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowQualitySheet(false)} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>Stream Quality</Text>
              {sources.map((s, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.sheetItem, selectedQualityIndex === idx && styles.sheetItemActive]}
                  onPress={() => handleSelectQuality(idx)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons
                      name={selectedQualityIndex === idx ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      color={selectedQualityIndex === idx ? '#00e5ff' : '#888'}
                    />
                    <Text style={[styles.sheetItemText, selectedQualityIndex === idx && { color: '#00e5ff' }]}>
                      {s.resolution} ({s.format})
                    </Text>
                  </View>
                  {s.size ? (
                    <Text style={styles.sizeText}>{roundMb(s.size)} MB</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Subtitle Selection Bottom Sheet */}
        {showCaptionSheet && (
          <View style={styles.sheetOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowCaptionSheet(false)} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>Subtitles</Text>
              <TouchableOpacity
                style={[styles.sheetItem, selectedCaptionIndex === -1 && styles.sheetItemActive]}
                onPress={() => handleSelectCaption(-1)}
              >
                <Text style={[styles.sheetItemText, selectedCaptionIndex === -1 && { color: '#00e5ff' }]}>Off</Text>
              </TouchableOpacity>
              {captions.map((c, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.sheetItem, selectedCaptionIndex === idx && styles.sheetItemActive]}
                  onPress={() => handleSelectCaption(idx)}
                >
                  <Text style={[styles.sheetItemText, selectedCaptionIndex === idx && { color: '#00e5ff' }]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Episode Quick Switch Sheet */}
        {showEpisodeSheet && (
          <View style={styles.sheetOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowEpisodeSheet(false)} />
            <View style={[styles.sheetContent, { maxHeight: height * 0.6 }]}>
              <Text style={styles.sheetTitle}>Select Episode (Season {seasonNum})</Text>
              <ScrollView>
                {episodes.map((ep) => (
                  <TouchableOpacity
                    key={ep.episodeNumber}
                    style={[
                      styles.sheetItem,
                      episodeNum === ep.episodeNumber && styles.sheetItemActive,
                    ]}
                    onPress={() => handleSelectEpisode(ep.episodeNumber)}
                  >
                    <Text
                      style={[
                        styles.sheetItemText,
                        episodeNum === ep.episodeNumber && { color: '#00e5ff', fontWeight: 'bold' },
                      ]}
                    >
                      EP {ep.episodeNumber}: {ep.title}
                    </Text>
                    {episodeNum === ep.episodeNumber && (
                      <Ionicons name="play-circle" size={20} color="#00e5ff" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

function roundMb(bytes: number): string {
  try {
    return (bytes / (1024 * 1024)).toFixed(1);
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loaderText: {
    color: '#00e5ff',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconBtn: {
    padding: 8,
  },
  titleBox: {
    flex: 1,
    marginHorizontal: 10,
  },
  titleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitleText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00e5ff',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    color: '#00e5ff',
    fontSize: 12,
    fontWeight: '700',
  },
  centerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  seekBtn: {
    padding: 10,
  },
  playPauseBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00e5ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00e5ff',
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  progressBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00e5ff',
  },
  timeText: {
    color: '#ddd',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheetContent: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#222',
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c28',
  },
  sheetItemActive: {
    backgroundColor: 'rgba(0,229,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  sheetItemText: {
    color: '#eee',
    fontSize: 14,
    marginLeft: 10,
  },
  sizeText: {
    color: '#888',
    fontSize: 12,
  },
});
