import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Linking,
  Image,
  ScrollView,
  Switch,
  Modal
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryPill } from '../components/CategoryPill';
import { ResultCard } from '../components/ResultCard';
import { SearchResult, parseHTML } from '../utils/parser';
import { resolveAllDomains } from '../utils/resolver';
import {
  getTrendingMovies,
  getTrendingTVShows,
  getBollywoodMovies,
  getPersonalizedTMDBRecommendations,
  TMDBMediaItem,
  getTMDBConfig,
  getIMDbId
} from '../utils/tmdb';
import {
  getTrendingAnime,
  getPopularAnime,
  getPersonalizedAnimeRecommendations,
  AniListAnimeItem
} from '../utils/anilist';

type SearchTask = {
  siteKey: string;
  searchUrl: string;
};

type WatchlistItem = {
  id: number;
  title: string;
  posterUrl: string;
  mediaType: 'movie' | 'tv' | 'anime';
};

export default function HomeScreen() {
  // Navigation & Tab State
  const [currentTab, setCurrentTab] = useState<'home' | 'me'>('home');

  // Theme Accent State
  const [accentColor, setAccentColor] = useState('#FF2D55'); // Default: Nothing Red

  // Bottom Sheet Details State
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Settings & Credentials States
  const [tmdbKey, setTmdbKey] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [customApi, setCustomApi] = useState('');
  const [customImage, setCustomImage] = useState('');

  // Watchlist & History States
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [clickHistoryTMDB, setClickHistoryTMDB] = useState<{ id: number; type: 'movie' | 'tv' }[]>([]);
  const [clickHistoryAnime, setClickHistoryAnime] = useState<number[]>([]);

  // Diagnostics States
  const [pingStatus, setPingStatus] = useState<Record<string, { status: 'idle' | 'checking' | 'ok' | 'error'; latency?: number }>>({});

  // Recommendation Feeds States
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [forYouFeed, setForYouFeed] = useState<(TMDBMediaItem | AniListAnimeItem)[]>([]);
  const [trendingHollywood, setTrendingHollywood] = useState<TMDBMediaItem[]>([]);
  const [bollywoodHits, setBollywoodHits] = useState<TMDBMediaItem[]>([]);
  const [trendingAnime, setTrendingAnime] = useState<AniListAnimeItem[]>([]);

  // Search Core States
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'hollywood' | 'bollywood' | 'anime'>('all');
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [searchTasks, setSearchTasks] = useState<SearchTask[]>([]);
  const searchId = useRef(0);
  const resultsCountRef = useRef(0);

  // Initialize
  useEffect(() => {
    loadSettings();
    loadDomains();
  }, []);

  const loadSettings = async () => {
    try {
      let key = await AsyncStorage.getItem('@movieshound_tmdb_key') || '';
      if (!key || key.trim() === '') {
        key = process.env.EXPO_PUBLIC_TMDB_API_KEY || ''; // Load from local .env fallback
      }
      const proxy = await AsyncStorage.getItem('@movieshound_tmdb_proxy_enabled') === 'true';
      const api = await AsyncStorage.getItem('@movieshound_tmdb_proxy_api') || '';
      const img = await AsyncStorage.getItem('@movieshound_tmdb_proxy_image') || '';
      const accent = await AsyncStorage.getItem('@movieshound_accent_color') || '#FF2D55';
      
      setTmdbKey(key);
      setProxyEnabled(proxy);
      setCustomApi(api);
      setCustomImage(img);
      setAccentColor(accent);

      const listRaw = await AsyncStorage.getItem('@movieshound_watchlist');
      if (listRaw) setWatchlist(JSON.parse(listRaw));

      const histTMDBRaw = await AsyncStorage.getItem('@movieshound_history_clicks_tmdb');
      if (histTMDBRaw) setClickHistoryTMDB(JSON.parse(histTMDBRaw));

      const histAnimeRaw = await AsyncStorage.getItem('@movieshound_history_clicks_anilist');
      if (histAnimeRaw) setClickHistoryAnime(JSON.parse(histAnimeRaw));
    } catch (e) {
      console.warn('Failed to load settings from storage:', e);
    }
  };

  // Whenever TMDB credentials/settings or history load/change, trigger feed update
  useEffect(() => {
    loadFeeds();
  }, [tmdbKey, proxyEnabled, customApi, customImage]);

  const loadDomains = async (force: boolean = false) => {
    const domains = await resolveAllDomains(setStatusMessage, force);
    setResolvedDomains(domains);
  };

  const loadFeeds = async () => {
    try {
      setFeedsLoading(true);
      const config = await getTMDBConfig();
      
      // Load Anime trends (always works, no API key needed)
      const animeTrends = await getTrendingAnime();
      setTrendingAnime(animeTrends);

      // Load TMDB items if API Key is configured
      if (config.apiKey) {
        try {
          const hollywood = await getTrendingMovies();
          setTrendingHollywood(hollywood);

          const bollywood = await getBollywoodMovies();
          setBollywoodHits(bollywood);

          // Get personalized feeds
          const personalTMDB = await getPersonalizedTMDBRecommendations(clickHistoryTMDB);
          const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);

          // Interleave recommendations for a combined "For You" list
          const combined: (TMDBMediaItem | AniListAnimeItem)[] = [];
          const maxLen = Math.max(personalTMDB.length, personalAnime.length);
          for (let i = 0; i < maxLen; i++) {
            if (personalTMDB[i]) combined.push(personalTMDB[i]);
            if (personalAnime[i]) combined.push(personalAnime[i]);
          }
          setForYouFeed(combined);
        } catch (tmdbErr) {
          console.warn('Failed to fetch TMDB feeds (could be bad key or proxy block):', tmdbErr);
          // Default For You to Anime if TMDB fails
          const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);
          setForYouFeed(personalAnime);
        }
      } else {
        // No TMDB Key, recommendation feed shows only anime
        const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);
        setForYouFeed(personalAnime);
      }
    } catch (e) {
      console.warn('Error loading recommendations feeds:', e);
    } finally {
      setFeedsLoading(false);
    }
  };

  // Watchlist Actions
  const toggleWatchlist = async (item: WatchlistItem) => {
    try {
      let list = [...watchlist];
      const exists = list.some(i => i.id === item.id && i.mediaType === item.mediaType);
      if (exists) {
        list = list.filter(i => !(i.id === item.id && i.mediaType === item.mediaType));
      } else {
        list.push(item);
      }
      await AsyncStorage.setItem('@movieshound_watchlist', JSON.stringify(list));
      setWatchlist(list);
    } catch (e) {
      console.warn('Failed to toggle watchlist:', e);
    }
  };

  // Click Tracking Actions
  const trackMediaClick = async (id: number, mediaType: 'movie' | 'tv' | 'anime') => {
    try {
      if (mediaType === 'anime') {
        let history = [id, ...clickHistoryAnime.filter(x => x !== id)].slice(0, 10);
        await AsyncStorage.setItem('@movieshound_history_clicks_anilist', JSON.stringify(history));
        setClickHistoryAnime(history);
      } else {
        const entry = { id, type: mediaType };
        let history = [entry, ...clickHistoryTMDB.filter(x => x.id !== id)].slice(0, 10);
        await AsyncStorage.setItem('@movieshound_history_clicks_tmdb', JSON.stringify(history));
        setClickHistoryTMDB(history);
      }
      loadFeeds();
    } catch (e) {
      console.warn('Failed to track click:', e);
    }
  };

  // Save Settings to Storage
  const updateSetting = async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
      if (key === '@movieshound_tmdb_key') setTmdbKey(value);
      else if (key === '@movieshound_tmdb_proxy_enabled') setProxyEnabled(value === 'true');
      else if (key === '@movieshound_tmdb_proxy_api') setCustomApi(value);
      else if (key === '@movieshound_tmdb_proxy_image') setCustomImage(value);
      else if (key === '@movieshound_accent_color') {
        setAccentColor(value);
      }
    } catch (e) {
      console.warn('Failed saving setting:', e);
    }
  };

  // Ping Diagnostics
  const runPingCheck = async (key: string, url: string) => {
    setPingStatus(prev => ({ ...prev, [key]: { status: 'checking' } }));
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000); // 5s timeout

      await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(id);
      
      const latency = Date.now() - startTime;
      setPingStatus(prev => ({ ...prev, [key]: { status: 'ok', latency } }));
    } catch (e) {
      setPingStatus(prev => ({ ...prev, [key]: { status: 'error' } }));
    }
  };

  // Clear History Utility
  const clearHistory = async () => {
    await AsyncStorage.removeItem('@movieshound_history_clicks_tmdb');
    await AsyncStorage.removeItem('@movieshound_history_clicks_anilist');
    setClickHistoryTMDB([]);
    setClickHistoryAnime([]);
    loadFeeds();
  };

  // Core Search Submit Action (Handles optional fallback retries)
  const handleSearchSubmit = (
    searchQuery: string = query, 
    searchCategory: typeof category = category,
    fallbackTitle?: string
  ) => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;
    
    // Switch to Home tab
    setCurrentTab('home');

    searchId.current += 1;
    const currentId = searchId.current;

    setResults([]);
    resultsCountRef.current = 0;
    setLoading(true);
    setStatusMessage('Bypassing security...');

    const tasks: SearchTask[] = [];

    if (searchCategory === 'all' || searchCategory === 'hollywood') {
      if (resolvedDomains.vegamovies) {
        tasks.push({
          siteKey: 'Vegamovies',
          searchUrl: `${resolvedDomains.vegamovies}/search.html?q=${encodeURIComponent(trimmedQuery)}`
        });
      }
      if (resolvedDomains.moviesmod) {
        tasks.push({
          siteKey: 'MoviesMod',
          searchUrl: `${resolvedDomains.moviesmod}/?s=${encodeURIComponent(trimmedQuery)}`
        });
      }
    }

    if (searchCategory === 'all' || searchCategory === 'bollywood') {
      if (resolvedDomains.rogmovies) {
        tasks.push({
          siteKey: 'RogMovies',
          searchUrl: `${resolvedDomains.rogmovies}/?s=${encodeURIComponent(trimmedQuery)}`
        });
      }
      if (resolvedDomains.topmovies) {
        tasks.push({
          siteKey: 'TopMovies',
          searchUrl: `${resolvedDomains.topmovies}/?s=${encodeURIComponent(trimmedQuery)}`
        });
      }
    }

    if (searchCategory === 'all' || searchCategory === 'anime') {
      if (resolvedDomains.gokuhd) {
        tasks.push({
          siteKey: 'GokuHD',
          searchUrl: `${resolvedDomains.gokuhd}/?s=${encodeURIComponent(trimmedQuery)}`
        });
      }
      if (resolvedDomains.animeflix) {
        tasks.push({
          siteKey: 'Animeflix',
          searchUrl: `${resolvedDomains.animeflix}/?s=${encodeURIComponent(trimmedQuery)}`
        });
      }
    }

    setSearchTasks(tasks);

    setTimeout(() => {
      if (searchId.current === currentId) {
        setLoading(false);
        setStatusMessage('');
        
        if (resultsCountRef.current === 0) {
          // If we did a search using IMDb ID (starts with tt) and it failed, fallback to Text Title search
          if (trimmedQuery.startsWith('tt') && fallbackTitle) {
            console.log(`IMDb ID search empty. Retrying with text title: ${fallbackTitle}`);
            setStatusMessage('IMDB EMPTY. RETRYING BY TITLE...');
            handleSearchSubmit(fallbackTitle, searchCategory);
          } else {
            console.log('Search timed out with 0 results. Triggering domain refresh...');
            setStatusMessage('SEARCH FAILED. REFRESHING DOMAINS...');
            loadDomains(true);
          }
        }
      }
    }, 15000);
  };

  // High-accuracy search triggering (Fetches IMDb ID first)
  const handleSearchSubmitWithIMDb = async (
    title: string, 
    type: 'movie' | 'tv' | 'anime', 
    tmdbId?: number
  ) => {
    setCurrentTab('home');
    setQuery(title);
    
    // Auto-select active category
    let targetCat: typeof category = 'all';
    if (type === 'anime') {
      targetCat = 'anime';
      setCategory('anime');
    } else if (type === 'movie') {
      targetCat = 'hollywood';
      setCategory('hollywood');
    } else {
      setCategory('all');
    }

    if (type !== 'anime' && tmdbId) {
      setLoading(true);
      setStatusMessage('Fetching IMDb ID for accuracy...');
      try {
        const imdbId = await getIMDbId(tmdbId, type);
        if (imdbId) {
          console.log(`Found IMDb ID: ${imdbId} for title: ${title}. Running targeted search.`);
          handleSearchSubmit(imdbId, targetCat, title);
          return;
        }
      } catch (err) {
        console.warn('Error fetching IMDb ID:', err);
      }
    }

    // Default Fallback
    handleSearchSubmit(title, targetCat);
  };

  const handleWebViewMessage = (siteKey: string, html: string) => {
    const parsedResults = parseHTML(html, siteKey, category);
    setResults(prev => {
      const combined = [...prev, ...parsedResults];
      const unique = new Map<string, SearchResult>();
      combined.forEach(item => unique.set(item.link, item));
      const finalResults = Array.from(unique.values());
      resultsCountRef.current = finalResults.length;
      return finalResults;
    });
    setLoading(false);
    setStatusMessage('');
  };

  const openLink = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        showTitle: true,
        toolbarColor: '#0A0A0C',
        secondaryToolbarColor: '#0A0A0C',
      });
    } catch {
      Linking.openURL(url);
    }
  };

  // Horizontal Feed Card Builder
  const renderFeedCard = (item: any, type: 'movie' | 'tv' | 'anime') => {
    const isSaved = watchlist.some(i => i.id === item.id && i.mediaType === type);
    return (
      <View key={`${type}-${item.id}`} style={styles.feedCard}>
        {/* Tapping the poster opens the custom details bottom sheet */}
        <TouchableOpacity
          onPress={() => {
            trackMediaClick(item.id, type);
            setSelectedMedia({ ...item, mediaType: type });
            setSheetVisible(true);
          }}
          activeOpacity={0.8}
        >
          <Image source={{ uri: item.posterUrl }} style={styles.feedPoster} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.feedCardBookmark}
          onPress={() => toggleWatchlist({ id: item.id, title: item.title, posterUrl: item.posterUrl, mediaType: type })}
        >
          <Text style={[styles.bookmarkStar, isSaved && { color: accentColor }]}>
            {isSaved ? '★' : '☆'}
          </Text>
        </TouchableOpacity>

        {/* Direct Search overlay on card */}
        <TouchableOpacity
          style={styles.feedCardDownload}
          onPress={() => {
            trackMediaClick(item.id, type);
            handleSearchSubmitWithIMDb(item.title, type, item.id);
          }}
        >
          <Text style={[styles.downloadArrow, { color: accentColor }]}>
            ↓
          </Text>
        </TouchableOpacity>

        <Text style={styles.feedCardTitle} numberOfLines={1}>
          {item.title.toUpperCase()}
        </Text>
        <Text style={styles.feedCardSubtitle}>
          {item.releaseDate} • {item.rating ? `${item.rating.toFixed(1)} ★` : 'N/A'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>MOVIESHOUND</Text>
        <TouchableOpacity onPress={() => loadDomains(true)} style={styles.statusRow}>
          <View style={[styles.statusDot, Object.keys(resolvedDomains).length > 0 ? { backgroundColor: accentColor } : styles.dotRed]} />
          <Text style={styles.brandSubtitle}>
            {Object.keys(resolvedDomains).length > 0 ? 'SYNCED' : 'OFFLINE'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {currentTab === 'home' ? (
        <View style={styles.tabContent}>
          {/* Search Input Box */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="SEARCH MULTIPLE SITES..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => handleSearchSubmit()}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity style={styles.clearSearchInput} onPress={() => { setQuery(''); setResults([]); }}>
                <Text style={styles.clearSearchInputText}>×</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.searchButton} onPress={() => handleSearchSubmit()}>
              <Text style={styles.searchButtonText}>GO</Text>
            </TouchableOpacity>
          </View>

          {/* Category Select Pills */}
          <View style={styles.categoryRow}>
            {(['all', 'hollywood', 'bollywood', 'anime'] as const).map((cat) => (
              <CategoryPill
                key={cat}
                title={cat}
                isActive={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </View>

          {/* Status Indicators */}
          {statusMessage ? (
            <View style={styles.statusBox}>
              <Text style={[styles.statusText, { color: accentColor }]}>{statusMessage.toUpperCase()}</Text>
            </View>
          ) : null}

          {loading && <ActivityIndicator size="small" color={accentColor} style={styles.spinner} />}

          {/* Dynamic Feed Display */}
          {query.trim().length > 0 || results.length > 0 ? (
            /* Search Results View */
            <FlatList
              data={results}
              keyExtractor={(item) => item.link}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <ResultCard item={item} onPress={() => openLink(item.link)} />
              )}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>NO RESULTS FOUND</Text>
                  </View>
                ) : null
              }
            />
          ) : (
            /* Recommendations Mode */
            <ScrollView contentContainerStyle={styles.scrollFeedsContent} showsVerticalScrollIndicator={false}>
              {feedsLoading && (
                <ActivityIndicator size="small" color={accentColor} style={styles.feedSpinner} />
              )}

              {/* Personal Recommendation Lane */}
              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>FOR YOU (PERSONALIZED)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {forYouFeed.length > 0 ? (
                    forYouFeed.map(item => {
                      const type = 'rating' in item && item.rating > 10 ? 'anime' : ('mediaType' in item ? item.mediaType : 'movie');
                      return renderFeedCard(item, type);
                    })
                  ) : (
                    <Text style={styles.laneEmptyText}>
                      NO HISTORY YET. WATCH OR SEARCH ITEMS TO POPULATE.
                    </Text>
                  )}
                </ScrollView>
              </View>

              {/* Hollywood Trends */}
              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>TRENDING HOLLYWOOD</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {tmdbKey ? (
                    trendingHollywood.map(item => renderFeedCard(item, 'movie'))
                  ) : (
                    <Text style={styles.laneEmptyText}>ADD TMDB KEY IN SETTINGS TO LOAD MOVIE LANES.</Text>
                  )}
                </ScrollView>
              </View>

              {/* Bollywood Selection */}
              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>BOLLYWOOD HIGHLIGHTS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {tmdbKey ? (
                    bollywoodHits.map(item => renderFeedCard(item, 'movie'))
                  ) : (
                    <Text style={styles.laneEmptyText}>ADD TMDB KEY IN SETTINGS TO LOAD MOVIE LANES.</Text>
                  )}
                </ScrollView>
              </View>

              {/* Anime Trends */}
              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>TRENDING ANIME</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {trendingAnime.map(item => renderFeedCard(item, 'anime'))}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      ) : (
        /* Settings Tab (Me tab) */
        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>MY WATCHLIST</Text>
          {watchlist.length > 0 ? (
            <View style={styles.watchlistGrid}>
              {watchlist.map(item => (
                <View key={`${item.mediaType}-${item.id}`} style={styles.watchlistItem}>
                  <TouchableOpacity
                    onPress={() => {
                      handleSearchSubmitWithIMDb(item.title, item.mediaType, item.id);
                    }}
                  >
                    <Image source={{ uri: item.posterUrl }} style={styles.watchlistPoster} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.watchlistRemove} 
                    onPress={() => toggleWatchlist(item)}
                  >
                    <Text style={styles.watchlistRemoveText}>REMOVE</Text>
                  </TouchableOpacity>
                  <Text style={styles.watchlistTitle} numberOfLines={1}>
                    {item.title.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptySettingsText}>WATCHLIST IS EMPTY</Text>
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>THEME CUSTOMIZATION</Text>
          <View style={styles.accentContainer}>
            <Text style={styles.accentLabel}>ACCENT COLOR</Text>
            <View style={styles.accentRow}>
              {(['#FF2D55', '#00FF88', '#FFFFFF'] as const).map(color => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.accentPill, 
                    { borderColor: color }, 
                    accentColor === color && { backgroundColor: color }
                  ]}
                  onPress={() => updateSetting('@movieshound_accent_color', color)}
                >
                  <Text style={[
                    styles.accentPillText, 
                    accentColor === color ? { color: '#0A0A0C' } : { color }
                  ]}>
                    {color === '#FF2D55' ? 'RED' : color === '#00FF88' ? 'GREEN' : 'MONO'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>TMDB CREDENTIALS</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>TMDB API KEY (ACCESS TOKEN)</Text>
            <TextInput
              style={styles.settingsInput}
              value={tmdbKey}
              onChangeText={val => updateSetting('@movieshound_tmdb_key', val)}
              placeholder="ENTER API KEY"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={true}
            />
          </View>

          <View style={styles.switchGroup}>
            <View>
              <Text style={styles.switchLabel}>BYPASS INDIA ISP BLOCK</Text>
              <Text style={styles.switchDesc}>Proxy TMDB requests to unblock connections</Text>
            </View>
            <Switch
              value={proxyEnabled}
              onValueChange={val => updateSetting('@movieshound_tmdb_proxy_enabled', val ? 'true' : 'false')}
              trackColor={{ false: '#1A1A1C', true: accentColor }}
              thumbColor="#FFFFFF"
            />
          </View>

          {proxyEnabled && (
            <View style={styles.proxyFields}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CUSTOM API PROXY URL</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={customApi}
                  onChangeText={val => updateSetting('@movieshound_tmdb_proxy_api', val)}
                  placeholder="https://tmdb-api.wmdb.tv"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CUSTOM IMAGE PROXY URL</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={customImage}
                  onChangeText={val => updateSetting('@movieshound_tmdb_proxy_image', val)}
                  placeholder="https://images.tmdb.one/t/p"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>DIAGNOSTICS & SCRAPERS HEALTH</Text>
          <View style={styles.diagnosticsContainer}>
            {Object.entries(resolvedDomains).map(([key, domain]) => (
              <View key={key} style={styles.diagnosticRow}>
                <View style={styles.diagnosticDetails}>
                  <Text style={styles.diagnosticName}>{key.toUpperCase()}</Text>
                  <Text style={styles.diagnosticUrl} numberOfLines={1}>{domain}</Text>
                </View>
                <View style={styles.diagnosticActions}>
                  {pingStatus[key]?.status === 'checking' && (
                    <ActivityIndicator size="small" color={accentColor} style={styles.pingSpinner} />
                  )}
                  {pingStatus[key]?.status === 'ok' && (
                    <Text style={styles.pingSuccess}>{pingStatus[key].latency}ms</Text>
                  )}
                  {pingStatus[key]?.status === 'error' && (
                    <Text style={styles.pingError}>DEAD</Text>
                  )}
                  <TouchableOpacity 
                    style={styles.pingButton} 
                    onPress={() => runPingCheck(key, domain)}
                  >
                    <Text style={styles.pingButtonText}>PING</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>DATA MANAGEMENT</Text>
          <View style={styles.accentContainer}>
            {(clickHistoryTMDB.length > 0 || clickHistoryAnime.length > 0) ? (
              <TouchableOpacity style={styles.clearHistoryButton} onPress={clearHistory}>
                <Text style={styles.clearHistoryButtonText}>CLEAR LOCAL CLICK HISTORY</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.emptySettingsText}>NO CLICK HISTORY SAVED</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Custom Bottom Tab Bar (Nothing OS design) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            if (currentTab === 'home') {
              // Tapping HOME tab again resets active search state to reveal recommendations
              setQuery('');
              setResults([]);
              setCategory('all');
            } else {
              setCurrentTab('home');
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, currentTab === 'home' ? { color: accentColor } : styles.tabInactive]}>
            HOME
          </Text>
          {currentTab === 'home' && <View style={[styles.activeTabDot, { backgroundColor: accentColor }]} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('me')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, currentTab === 'me' ? { color: accentColor } : styles.tabInactive]}>
            ME
          </Text>
          {currentTab === 'me' && <View style={[styles.activeTabDot, { backgroundColor: accentColor }]} />}
        </TouchableOpacity>
      </View>

      {/* Nothing OS Styled Details Bottom Sheet Modal */}
      <Modal
        visible={sheetVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSheetVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalBackdrop} 
          activeOpacity={1} 
          onPress={() => setSheetVisible(false)}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity activeOpacity={1} style={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <View style={styles.dragHandle} />
                <TouchableOpacity onPress={() => setSheetVisible(false)} style={styles.closeSheetButton}>
                  <Text style={styles.closeSheetText}>×</Text>
                </TouchableOpacity>
              </View>

              {selectedMedia && (
                <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                  {selectedMedia.backdropUrl && (
                    <Image source={{ uri: selectedMedia.backdropUrl }} style={styles.sheetBackdrop} resizeMode="cover" />
                  )}
                  
                  <Text style={styles.sheetTitle}>{selectedMedia.title.toUpperCase()}</Text>
                  
                  <View style={styles.sheetMetaRow}>
                    <Text style={[styles.sheetMetaText, { color: accentColor }]}>
                      {selectedMedia.rating ? `${selectedMedia.rating.toFixed(1)} ★` : 'N/A'}
                    </Text>
                    <Text style={styles.sheetMetaText}>•</Text>
                    <Text style={styles.sheetMetaText}>{selectedMedia.releaseDate}</Text>
                    <Text style={styles.sheetMetaText}>•</Text>
                    <Text style={styles.sheetMetaText}>{selectedMedia.mediaType.toUpperCase()}</Text>
                  </View>

                  <Text style={styles.sheetOverview}>
                    {selectedMedia.overview || 'NO DESCRIPTION AVAILABLE.'}
                  </Text>

                  <TouchableOpacity
                    style={[styles.sheetSearchButton, { backgroundColor: accentColor }]}
                    onPress={() => {
                      setSheetVisible(false);
                      handleSearchSubmitWithIMDb(
                        selectedMedia.title, 
                        selectedMedia.mediaType, 
                        selectedMedia.id
                      );
                    }}
                  >
                    <Text style={styles.sheetSearchButtonText}>FIND DOWNLOAD LINKS</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invisible scraper WebViews */}
      <View style={styles.hiddenContainer}>
        {searchTasks.map((task) => (
          <WebView
            key={task.siteKey}
            source={{ uri: task.searchUrl }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={(event) => handleWebViewMessage(task.siteKey, event.nativeEvent.data)}
            injectedJavaScript={`
              const checkLoaded = setInterval(() => {
                if (document.body && !document.getElementById('challenge-running')) {
                  clearInterval(checkLoaded);
                  window.ReactNativeWebView.postMessage(document.documentElement.outerHTML);
                }
              }, 500);
              true;
            `}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 45, // Pushed down to clear the status bar / notch area
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#0A0A0C'
  },
  brandTitle: {
    fontFamily: 'Ndot57',
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  dotRed: {
    backgroundColor: '#FF2D55',
  },
  brandSubtitle: {
    fontFamily: 'Ndot55',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1,
  },
  tabContent: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 0,
    backgroundColor: 'rgba(255,255,255,0.02)',
    alignItems: 'center'
  },
  searchInput: {
    flex: 1,
    height: 50,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontFamily: 'LetteraMono',
    fontSize: 13,
    letterSpacing: 1,
  },
  clearSearchInput: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: 50
  },
  clearSearchInputText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 22,
    fontFamily: 'LetteraMono'
  },
  searchButton: {
    width: 60,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Ndot57',
    fontSize: 14,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
  },
  statusBox: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  statusText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  spinner: {
    marginVertical: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  emptyContainer: {
    marginTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'NType82Mono',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 1.5,
  },
  scrollFeedsContent: {
    paddingBottom: 30,
  },
  feedSpinner: {
    marginTop: 20,
  },
  feedLane: {
    marginTop: 20,
  },
  laneTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  laneScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  laneEmptyText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1,
    marginVertical: 20,
    width: 250,
  },
  feedCard: {
    width: 110,
    position: 'relative',
  },
  feedPoster: {
    width: 110,
    height: 165,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  feedCardBookmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(10,10,12,0.8)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 10
  },
  feedCardDownload: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(10,10,12,0.8)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 10
  },
  downloadArrow: {
    fontSize: 11,
    fontFamily: 'LetteraMono',
    lineHeight: 12,
    fontWeight: 'bold'
  },
  bookmarkStar: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 12,
  },
  feedCardTitle: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#FFFFFF',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  feedCardSubtitle: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  settingsContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  emptySettingsText: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  watchlistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  watchlistItem: {
    width: '31%',
    position: 'relative',
    marginBottom: 12,
  },
  watchlistPoster: {
    width: '100%',
    aspectRatio: 2/3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  watchlistRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 45, 85, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 0,
  },
  watchlistRemoveText: {
    fontFamily: 'NType82Mono',
    fontSize: 7,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  watchlistTitle: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: '#FFFFFF',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 24,
  },
  accentContainer: {
    marginBottom: 8,
  },
  accentLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 12,
  },
  accentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  accentPill: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 0,
    minWidth: 70,
    alignItems: 'center',
  },
  accentPillText: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  settingsInput: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontFamily: 'LetteraMono',
    fontSize: 12,
    letterSpacing: 1,
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  switchLabel: {
    fontFamily: 'NType82Mono',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  switchDesc: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  proxyFields: {
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  diagnosticsContainer: {
    gap: 12,
  },
  diagnosticRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  diagnosticDetails: {
    flex: 1,
    marginRight: 12,
  },
  diagnosticName: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  diagnosticUrl: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
  diagnosticActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pingSpinner: {
    marginRight: 4,
  },
  pingSuccess: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#00FF88',
    letterSpacing: 0.5,
  },
  pingError: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FF2D55',
    letterSpacing: 0.5,
  },
  pingButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
  },
  pingButtonText: {
    fontFamily: 'NType82Mono',
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  clearHistoryButton: {
    borderWidth: 1,
    borderColor: '#FF2D55',
    paddingVertical: 10,
    alignItems: 'center',
  },
  clearHistoryButtonText: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FF2D55',
    letterSpacing: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0A0A0C',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '40%',
    height: '100%',
    position: 'relative',
  },
  tabLabel: {
    fontFamily: 'Ndot57',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  tabInactive: {
    color: 'rgba(255,255,255,0.3)',
  },
  activeTabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '75%',
    backgroundColor: '#0A0A0C',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  sheetContent: {
    width: '100%',
    paddingBottom: 24,
  },
  sheetHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  closeSheetButton: {
    position: 'absolute',
    right: 16,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeSheetText: {
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'LetteraMono',
  },
  sheetScroll: {
    padding: 20,
  },
  sheetBackdrop: {
    width: '100%',
    height: 180,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  sheetTitle: {
    fontFamily: 'Ndot57',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: 1,
    lineHeight: 26,
  },
  sheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
  },
  sheetMetaText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
  },
  sheetOverview: {
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
    letterSpacing: 0.5,
    marginBottom: 24,
  },
  sheetSearchButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
  sheetSearchButtonText: {
    fontFamily: 'Ndot57',
    fontSize: 13,
    color: '#0A0A0C',
    letterSpacing: 1.5,
  },
  hiddenContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  }
});
