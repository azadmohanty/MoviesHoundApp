import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Linking,
  Image,
  ScrollView,
  Switch,
  Modal,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CategoryPill } from '../components/CategoryPill';
import { ResultCard } from '../components/ResultCard';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { SearchResult, parseHTML } from '../utils/parser';
import { resolveAllDomains } from '../utils/resolver';
import { resolveStreamUrl } from '../utils/streamResolver';
import {
  getTrendingMovies,
  getTrendingTVShows,
  getBollywoodMovies,
  getPersonalizedTMDBRecommendations,
  getPersonCredits,
  TMDBMediaItem,
  getTMDBConfig,
  getIMDbId,
  discoverMediaByGenre,
  TMDB_GENRES,
  searchTMDB
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
  const [currentTab, setCurrentTab] = useState<'home' | 'explore' | 'me'>('home');

  // Theme Accent State
  const [accentColor, setAccentColor] = useState('#FF2D55'); // Default: Nothing Red

  // Native Video Player State
  const [playerVisible, setPlayerVisible] = useState(false);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);
  const [activeStreamTitle, setActiveStreamTitle] = useState('');
  const [activeMediaItem, setActiveMediaItem] = useState<any>(null);
  const [resolvingStream, setResolvingStream] = useState(false);

  // Artist Portfolio State
  const [artistModalVisible, setArtistModalVisible] = useState(false);
  const [artistName, setArtistName] = useState('');
  const [artistCredits, setArtistCredits] = useState<TMDBMediaItem[]>([]);
  const [loadingArtist, setLoadingArtist] = useState(false);

  // Settings & Credentials States
  const [tmdbKey, setTmdbKey] = useState('');
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [customApi, setCustomApi] = useState('');
  const [customImage, setCustomImage] = useState('');

  // Watchlist & History States
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchedList, setWatchedList] = useState<{ id: number; type: string }[]>([]);
  const [clickHistoryTMDB, setClickHistoryTMDB] = useState<{ id: number; type: 'movie' | 'tv' }[]>([]);
  const [clickHistoryAnime, setClickHistoryAnime] = useState<number[]>([]);

  // Diagnostics States
  const [pingStatus, setPingStatus] = useState<Record<string, { status: 'idle' | 'checking' | 'ok' | 'error'; latency?: number }>>({});

  // Recommendation Feeds States
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroMedia, setHeroMedia] = useState<TMDBMediaItem | null>(null);
  const [forYouFeed, setForYouFeed] = useState<(TMDBMediaItem | AniListAnimeItem)[]>([]);
  const [trendingHollywood, setTrendingHollywood] = useState<TMDBMediaItem[]>([]);
  const [trendingTV, setTrendingTV] = useState<TMDBMediaItem[]>([]);
  const [bollywoodHits, setBollywoodHits] = useState<TMDBMediaItem[]>([]);
  const [trendingAnime, setTrendingAnime] = useState<AniListAnimeItem[]>([]);

  // Explore Tab Discovery States (Expanded Granular Controls)
  const [exploreType, setExploreType] = useState<'movie' | 'tv'>('movie');
  const [selectedGenre, setSelectedGenre] = useState<string>('Action');
  const [selectedYear, setSelectedYear] = useState<string>('ALL YEARS');
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [exploreMedia, setExploreMedia] = useState<TMDBMediaItem[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);

  // Search Core States
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'hollywood' | 'bollywood' | 'anime'>('all');
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [searchSuggestions, setSearchSuggestions] = useState<TMDBMediaItem[]>([]);
  const [tmdbSearchResults, setTmdbSearchResults] = useState<TMDBMediaItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchMode, setSearchMode] = useState<'movies' | 'downloads'>('movies');
  const [downloadResults, setDownloadResults] = useState<SearchResult[]>([]);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [searchTasks, setSearchTasks] = useState<SearchTask[]>([]);
  const searchId = useRef(0);
  const resultsCountRef = useRef(0);

  // Year options list (Complete Freedom)
  const YEAR_OPTIONS = [
    'ALL YEARS', '2026', '2025', '2024', '2023', '2022', '2021', '2020',
    '2019', '2018', '2017', '2016', '2015', '2010s', '2000s', '1990s', '1980s'
  ];

  // Rating options list
  const RATING_OPTIONS = [
    { label: 'ALL RATINGS', value: 0 },
    { label: '9.0+ MASTERPIECES', value: 9.0 },
    { label: '8.5+', value: 8.5 },
    { label: '8.0+', value: 8.0 },
    { label: '7.5+', value: 7.5 },
    { label: '7.0+', value: 7.0 },
    { label: '6.5+', value: 6.5 },
    { label: '6.0+', value: 6.0 },
  ];

  // Initialize
  useEffect(() => {
    loadSettings();
    loadDomains();
  }, []);

  const loadSettings = async () => {
    try {
      let key = await AsyncStorage.getItem('@movieshound_tmdb_key') || '';
      if (!key || key.trim() === '') {
        key = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
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

      const watchedRaw = await AsyncStorage.getItem('@movieshound_watched_list');
      if (watchedRaw) setWatchedList(JSON.parse(watchedRaw));

      const histTMDBRaw = await AsyncStorage.getItem('@movieshound_history_clicks_tmdb');
      if (histTMDBRaw) setClickHistoryTMDB(JSON.parse(histTMDBRaw));

      const histAnimeRaw = await AsyncStorage.getItem('@movieshound_history_clicks_anilist');
      if (histAnimeRaw) setClickHistoryAnime(JSON.parse(histAnimeRaw));

      const recentRaw = await AsyncStorage.getItem('@movieshound_recent_searches');
      if (recentRaw) setRecentSearches(JSON.parse(recentRaw));
    } catch (e) {
      console.warn('Failed to load settings from storage:', e);
    }
  };

  useEffect(() => {
    loadFeeds();
  }, [tmdbKey, proxyEnabled, customApi, customImage]);

  useEffect(() => {
    if (currentTab === 'explore') {
      loadExploreData();
    }
  }, [currentTab, exploreType, selectedGenre, selectedYear, selectedRating]);

  useEffect(() => {
    if (trendingHollywood.length > 0) {
      const interval = setInterval(() => {
        setHeroIndex(prev => (prev + 1) % Math.min(trendingHollywood.length, 5));
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [trendingHollywood]);

  useEffect(() => {
    if (trendingHollywood.length > 0) {
      setHeroMedia(trendingHollywood[heroIndex]);
    }
  }, [heroIndex, trendingHollywood]);

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (query.trim().length > 1) {
        const sugg = await searchTMDB(query);
        setSearchSuggestions(sugg.slice(0, 5));
        setShowSuggestions(true);
      } else {
        setSearchSuggestions([]);
        setShowSuggestions(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const loadDomains = async (force: boolean = false) => {
    const domains = await resolveAllDomains(setStatusMessage, force);
    setResolvedDomains(domains);
  };

  const loadFeeds = async () => {
    try {
      setFeedsLoading(true);
      const config = await getTMDBConfig();
      
      const animeTrends = await getTrendingAnime();
      setTrendingAnime(animeTrends);

      if (config.apiKey) {
        try {
          const hollywood = await getTrendingMovies();
          setTrendingHollywood(hollywood);
          if (hollywood.length > 0) setHeroMedia(hollywood[0]);

          const tvShows = await getTrendingTVShows();
          setTrendingTV(tvShows);

          const bollywood = await getBollywoodMovies();
          setBollywoodHits(bollywood);

          const personalTMDB = await getPersonalizedTMDBRecommendations(clickHistoryTMDB);
          const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);

          const combined: (TMDBMediaItem | AniListAnimeItem)[] = [];
          const maxLen = Math.max(personalTMDB.length, personalAnime.length);
          for (let i = 0; i < maxLen; i++) {
            if (personalTMDB[i]) combined.push(personalTMDB[i]);
            if (personalAnime[i]) combined.push(personalAnime[i]);
          }
          setForYouFeed(combined);
        } catch (tmdbErr) {
          console.warn('Failed to fetch TMDB feeds:', tmdbErr);
          const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);
          setForYouFeed(personalAnime);
        }
      } else {
        const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);
        setForYouFeed(personalAnime);
      }
    } catch (e) {
      console.warn('Error loading recommendations feeds:', e);
    } finally {
      setFeedsLoading(false);
    }
  };

  const loadExploreData = async () => {
    try {
      setExploreLoading(true);
      const genreId = TMDB_GENRES[selectedGenre];
      let numericYear: number | undefined = undefined;
      if (selectedYear !== 'ALL YEARS') {
        const parsed = parseInt(selectedYear, 10);
        if (!isNaN(parsed)) numericYear = parsed;
      }
      const items = await discoverMediaByGenre(genreId, 1, numericYear);
      let filtered = items;
      if (selectedRating > 0) {
        filtered = filtered.filter(i => i.rating >= selectedRating);
      }
      setExploreMedia(filtered);
    } catch (e) {
      console.warn('Failed loading explore data:', e);
    } finally {
      setExploreLoading(false);
    }
  };

  // Watchlist Actions
  const toggleWatchlist = async (item: WatchlistItem) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  // Watched Status Actions
  const toggleWatched = async (id: number, type: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      let list = [...watchedList];
      const exists = list.some(i => i.id === id && i.type === type);
      if (exists) {
        list = list.filter(i => !(i.id === id && i.type === type));
      } else {
        list.push({ id, type });
      }
      await AsyncStorage.setItem('@movieshound_watched_list', JSON.stringify(list));
      setWatchedList(list);
    } catch (e) {
      console.warn('Failed to toggle watched:', e);
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

  // Stream Trigger Action (Launches YouTube-Style Player)
  const handleWatchStream = async (item: any) => {
    try {
      setResolvingStream(true);
      setStatusMessage('Resolving Stream URL...');
      const streamRes = await resolveStreamUrl(item.id, item.mediaType || 'movie');
      if (streamRes) {
        setActiveStreamUrl(streamRes.streamUrl);
        setActiveStreamTitle(item.title);
        setActiveMediaItem(item);
        setPlayerVisible(true);
      } else {
        setStatusMessage('Stream unavailable. Fallback to direct downloads.');
      }
    } catch (e) {
      console.warn('Error launching stream:', e);
    } finally {
      setResolvingStream(false);
      setStatusMessage('');
    }
  };

  // Artist Portfolio Action
  const handleOpenArtist = async (personId: number, personName: string) => {
    setArtistName(personName);
    setArtistModalVisible(true);
    setLoadingArtist(true);
    try {
      const credits = await getPersonCredits(personId);
      setArtistCredits(credits);
    } catch (e) {
      console.warn('Failed loading artist credits:', e);
    } finally {
      setLoadingArtist(false);
    }
  };

  // Save Settings
  const updateSetting = async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
      if (key === '@movieshound_tmdb_key') setTmdbKey(value);
      else if (key === '@movieshound_tmdb_proxy_enabled') setProxyEnabled(value === 'true');
      else if (key === '@movieshound_tmdb_proxy_api') setCustomApi(value);
      else if (key === '@movieshound_tmdb_proxy_image') setCustomImage(value);
      else if (key === '@movieshound_accent_color') setAccentColor(value);
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
      const id = setTimeout(() => controller.abort(), 5000);

      await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(id);
      
      const latency = Date.now() - startTime;
      setPingStatus(prev => ({ ...prev, [key]: { status: 'ok', latency } }));
    } catch (e) {
      setPingStatus(prev => ({ ...prev, [key]: { status: 'error' } }));
    }
  };

  const clearHistory = async () => {
    await AsyncStorage.removeItem('@movieshound_history_clicks_tmdb');
    await AsyncStorage.removeItem('@movieshound_history_clicks_anilist');
    setClickHistoryTMDB([]);
    setClickHistoryAnime([]);
    loadFeeds();
  };

  const handleSearchSubmit = async (
    searchQuery: string = query, 
    searchCategory: typeof category = category
  ) => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;
    
    setCurrentTab('home');
    setSearchMode('movies');
    setResults([]);
    setLoading(true);
    setStatusMessage('Searching titles...');

    // Save recent searches
    let updatedRecent = [trimmedQuery, ...recentSearches.filter(s => s !== trimmedQuery)].slice(0, 3);
    setRecentSearches(updatedRecent);
    await AsyncStorage.setItem('@movieshound_recent_searches', JSON.stringify(updatedRecent));

    try {
      const searchRes = await searchTMDB(trimmedQuery);
      setTmdbSearchResults(searchRes);
    } catch (e) {
      console.warn('Error searching TMDB:', e);
    } finally {
      setLoading(false);
      setStatusMessage('');
      setShowSuggestions(false);
    }
  };

  const runDownloadScraper = async (
    title: string,
    mediaType: 'movie' | 'tv' | 'anime',
    tmdbId?: number
  ) => {
    setSearchMode('downloads');
    setResults([]);
    resultsCountRef.current = 0;
    setLoading(true);
    setStatusMessage('Bypassing security...');

    let searchQuery = title;
    if (mediaType !== 'anime' && tmdbId) {
      try {
        const imdbId = await getIMDbId(tmdbId, mediaType);
        if (imdbId) {
          searchQuery = imdbId;
        }
      } catch (err) {
        console.warn('Error fetching IMDb ID:', err);
      }
    }

    // Resolve original language to target sites first (Smart Dubbing)
    let lang = 'en';
    if (tmdbId && mediaType !== 'anime') {
      try {
        const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${tmdbKey}`);
        const detailsData = await response.json();
        lang = detailsData.original_language || 'en';
      } catch (err) {
        console.warn('Error getting language details:', err);
      }
    }

    searchId.current += 1;
    const currentId = searchId.current;
    const tasks: SearchTask[] = [];

    // Target based on category / type / language
    if (mediaType === 'anime' || category === 'anime') {
      if (resolvedDomains.gokuhd) tasks.push({ siteKey: 'GokuHD', searchUrl: `${resolvedDomains.gokuhd}/?s=${encodeURIComponent(searchQuery)}` });
      if (resolvedDomains.animeflix) tasks.push({ siteKey: 'Animeflix', searchUrl: `${resolvedDomains.animeflix}/?s=${encodeURIComponent(searchQuery)}` });
    } else if (lang === 'hi' || category === 'bollywood') {
      if (resolvedDomains.rogmovies) tasks.push({ siteKey: 'RogMovies', searchUrl: `${resolvedDomains.rogmovies}/?s=${encodeURIComponent(searchQuery)}` });
      if (resolvedDomains.topmovies) tasks.push({ siteKey: 'TopMovies', searchUrl: `${resolvedDomains.topmovies}/?s=${encodeURIComponent(searchQuery)}` });
    } else {
      if (resolvedDomains.vegamovies) tasks.push({ siteKey: 'Vegamovies', searchUrl: `${resolvedDomains.vegamovies}/search.html?q=${encodeURIComponent(searchQuery)}` });
      if (resolvedDomains.moviesmod) tasks.push({ siteKey: 'MoviesMod', searchUrl: `${resolvedDomains.moviesmod}/?s=${encodeURIComponent(searchQuery)}` });
    }

    setSearchTasks(tasks);

    // Fallback timer: if 0 links after 6 seconds, search other sites to find dubbed dual-audio
    setTimeout(() => {
      if (searchId.current === currentId && resultsCountRef.current === 0) {
        setStatusMessage('Searching fallback sources...');
        const fallbackTasks: SearchTask[] = [];
        if (mediaType !== 'anime' && category !== 'anime') {
          if (lang === 'hi' || category === 'bollywood') {
            if (resolvedDomains.vegamovies) fallbackTasks.push({ siteKey: 'Vegamovies', searchUrl: `${resolvedDomains.vegamovies}/search.html?q=${encodeURIComponent(title)}` });
            if (resolvedDomains.moviesmod) fallbackTasks.push({ siteKey: 'MoviesMod', searchUrl: `${resolvedDomains.moviesmod}/?s=${encodeURIComponent(title)}` });
          } else {
            if (resolvedDomains.rogmovies) fallbackTasks.push({ siteKey: 'RogMovies', searchUrl: `${resolvedDomains.rogmovies}/?s=${encodeURIComponent(title)}` });
            if (resolvedDomains.topmovies) fallbackTasks.push({ siteKey: 'TopMovies', searchUrl: `${resolvedDomains.topmovies}/?s=${encodeURIComponent(title)}` });
          }
        }
        setSearchTasks(prev => [...prev, ...fallbackTasks]);
      }
    }, 6000);

    // Stop loading after 15 seconds max
    setTimeout(() => {
      if (searchId.current === currentId) {
        setLoading(false);
        setStatusMessage('');
        if (resultsCountRef.current === 0) {
          setStatusMessage('NO DOWNLOAD LINKS RESOLVED');
        }
      }
    }, 15000);
  };

  const handleSearchSubmitWithIMDb = async (
    title: string, 
    type: 'movie' | 'tv' | 'anime', 
    tmdbId?: number,
    suggestedCategory: typeof category = 'all'
  ) => {
    setCurrentTab('home');
    setQuery(title);
    setCategory(suggestedCategory);
    runDownloadScraper(title, type, tmdbId);
  };

  const handleWebViewMessage = (siteKey: string, html: string) => {
    const domainKey = siteKey.toLowerCase();
    const baseUrl = resolvedDomains[domainKey] || '';
    const parsedResults = parseHTML(html, siteKey, category, baseUrl);
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
      let targetUrl = url;
      if (targetUrl.startsWith('//')) {
        targetUrl = 'https:' + targetUrl;
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      await WebBrowser.openBrowserAsync(targetUrl, {
        showTitle: true,
        toolbarColor: '#0A0A0C',
        secondaryToolbarColor: '#0A0A0C',
      });
    } catch (e) {
      let targetUrl = url;
      if (targetUrl.startsWith('//')) {
        targetUrl = 'https:' + targetUrl;
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      Linking.openURL(targetUrl);
    }
  };

  const renderFeedCard = (item: any, type: 'movie' | 'tv' | 'anime', suggestedCategory: typeof category = 'all') => {
    const isSaved = watchlist.some(i => i.id === item.id && i.mediaType === type);
    const isWatched = watchedList.some(i => i.id === item.id && i.type === type);
    const voteFormatted = 'voteCountFormatted' in item ? item.voteCountFormatted : null;

    return (
      <View key={`${type}-${item.id}`} style={styles.feedCard}>
        <View style={styles.posterWrapper}>
          <TouchableOpacity
            onPress={() => {
              trackMediaClick(item.id, type);
              handleWatchStream({ ...item, mediaType: type, suggestedCategory });
            }}
            activeOpacity={0.8}
          >
            <Image source={{ uri: item.posterUrl }} style={styles.feedPoster} />
          </TouchableOpacity>
          
          {/* Watchlist Star Button (Top Right) */}
          <TouchableOpacity
            style={styles.feedCardBookmark}
            onPress={() => toggleWatchlist({ id: item.id, title: item.title, posterUrl: item.posterUrl, mediaType: type })}
          >
            <Text style={[styles.bookmarkStar, isSaved && { color: accentColor }]}>
              {isSaved ? '★' : '☆'}
            </Text>
          </TouchableOpacity>

          {/* Watched Status Indicator (Top Left) */}
          {isWatched && (
            <View style={styles.watchedBadge}>
              <Text style={styles.watchedCheck}>✓</Text>
            </View>
          )}

          {/* Download Yellow Badge (Bottom Left) */}
          <TouchableOpacity
            style={styles.feedCardDownload}
            onPress={() => {
              trackMediaClick(item.id, type);
              handleSearchSubmitWithIMDb(item.title, type, item.id, suggestedCategory);
            }}
          >
            <Text style={styles.downloadArrow}>↓</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.feedCardTitle} numberOfLines={1}>
          {item.title.toUpperCase()}
        </Text>
        <Text style={styles.feedCardSubtitle} numberOfLines={1}>
          {item.releaseDate} • {item.rating ? `★ ${item.rating.toFixed(1)}` : 'N/A'} {voteFormatted ? `(${voteFormatted})` : ''}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>HOLOGRAM</Text>
        <TouchableOpacity onPress={() => loadDomains(true)} style={styles.statusRow}>
          <View style={[styles.statusDot, Object.keys(resolvedDomains).length > 0 ? { backgroundColor: accentColor } : styles.dotRed]} />
          <Text style={styles.brandSubtitle}>
            {Object.keys(resolvedDomains).length > 0 ? 'SYNCED' : 'OFFLINE'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: HOME */}
      {currentTab === 'home' && (
        <View style={styles.tabContent}>
          <View style={{ zIndex: 1000 }}>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="SEARCH MOVIES & SERIES..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  if (text.trim() === '') {
                    setSearchSuggestions([]);
                    setShowSuggestions(false);
                    setTmdbSearchResults([]);
                    setResults([]);
                  }
                }}
                onSubmitEditing={() => handleSearchSubmit()}
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSearchInput}
                  onPress={() => {
                    setQuery('');
                    setSearchSuggestions([]);
                    setShowSuggestions(false);
                    setTmdbSearchResults([]);
                    setResults([]);
                  }}
                >
                  <Text style={styles.clearSearchInputText}>×</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.searchButton} onPress={() => handleSearchSubmit()}>
                <Text style={styles.searchButtonText}>GO</Text>
              </TouchableOpacity>
            </View>

            {/* Search Suggestions Dropdown */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {searchSuggestions.map((item) => (
                  <View key={`sugg-${item.id}`} style={styles.suggestionItem}>
                    <TouchableOpacity
                      style={styles.suggestionTitleBtn}
                      onPress={() => {
                        setQuery(item.title);
                        setShowSuggestions(false);
                        handleWatchStream(item);
                      }}
                    >
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {item.title.toUpperCase()} ({item.releaseDate ? item.releaseDate.split('-')[0] : 'N/A'})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.suggestionDownloadBtn}
                      onPress={() => {
                        setQuery(item.title);
                        setShowSuggestions(false);
                        runDownloadScraper(item.title, item.mediaType || 'movie', item.id);
                      }}
                    >
                      <Text style={[styles.suggestionDownloadIcon, { color: accentColor }]}>↓</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Recent Searches Row */}
            {recentSearches.length > 0 && query.length === 0 && (
              <View style={styles.recentSearchesContainer}>
                <Text style={styles.recentSearchesLabel}>RECENT:</Text>
                {recentSearches.map((term, idx) => (
                  <TouchableOpacity
                    key={`recent-${idx}`}
                    style={styles.recentSearchPill}
                    onPress={() => {
                      setQuery(term);
                      handleSearchSubmit(term);
                    }}
                  >
                    <Text style={styles.recentSearchPillText}>{term.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

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

          {statusMessage ? (
            <View style={styles.statusBox}>
              <Text style={[styles.statusText, { color: accentColor }]}>{statusMessage.toUpperCase()}</Text>
            </View>
          ) : null}

          {loading && <ActivityIndicator size="small" color={accentColor} style={styles.spinner} />}

          {searchMode === 'movies' && tmdbSearchResults.length > 0 ? (
            <FlatList
              data={tmdbSearchResults}
              keyExtractor={(item) => `search-tmdb-${item.id}`}
              numColumns={3}
              contentContainerStyle={styles.exploreGrid}
              columnWrapperStyle={styles.exploreGridRow}
              renderItem={({ item }) => renderFeedCard(item, item.mediaType || 'movie', 'all')}
            />
          ) : searchMode === 'downloads' && (results.length > 0 || loading) ? (
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
                    <Text style={styles.emptyText}>NO DOWNLOAD LINKS FOUND</Text>
                  </View>
                ) : null
              }
            />
          ) : query.trim().length > 0 && !loading && tmdbSearchResults.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>NO RESULTS FOUND</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollFeedsContent} showsVerticalScrollIndicator={false}>
              {/* Featured Hero Banner at Top of Home Feed */}
              {heroMedia && (
                <View style={styles.heroContainer}>
                  <Image source={{ uri: heroMedia.backdropUrl }} style={styles.heroImage} />
                  <LinearGradient
                    colors={['transparent', 'rgba(10,10,12,0.85)', '#0A0A0C']}
                    style={styles.heroGradient}
                  />
                  <View style={styles.heroContent}>
                    <Text style={styles.heroTag}>FEATURED #1 TRENDING</Text>
                    <Text style={styles.heroTitle}>{heroMedia.title.toUpperCase()}</Text>
                    <Text style={styles.heroSub}>
                      ★ {heroMedia.rating.toFixed(1)} ({heroMedia.voteCountFormatted} REVIEWS) • {heroMedia.releaseDate}
                    </Text>
                    <TouchableOpacity
                      style={[styles.heroPlayButton, { backgroundColor: accentColor }]}
                      onPress={() => handleWatchStream(heroMedia)}
                    >
                      <Text style={styles.heroPlayText}>▶ WATCH STREAM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {feedsLoading && (
                <ActivityIndicator size="small" color={accentColor} style={styles.feedSpinner} />
              )}

              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>FOR YOU (PERSONALIZED)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {forYouFeed.length > 0 ? (
                    forYouFeed.map(item => {
                      const type = 'rating' in item && item.rating > 10 ? 'anime' : ('mediaType' in item ? item.mediaType : 'movie');
                      return renderFeedCard(item, type, 'all');
                    })
                  ) : (
                    <Text style={styles.laneEmptyText}>NO HISTORY YET. WATCH OR SEARCH ITEMS TO POPULATE.</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>TRENDING HOLLYWOOD MOVIES</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {tmdbKey ? (
                    trendingHollywood.map(item => renderFeedCard(item, 'movie', 'hollywood'))
                  ) : (
                    <Text style={styles.laneEmptyText}>ADD TMDB KEY IN SETTINGS TO LOAD MOVIE LANES.</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>TRENDING WEB SERIES & TV SHOWS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {tmdbKey ? (
                    trendingTV.map(item => renderFeedCard(item, 'tv', 'hollywood'))
                  ) : (
                    <Text style={styles.laneEmptyText}>ADD TMDB KEY IN SETTINGS TO LOAD TV LANES.</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>BOLLYWOOD HIGHLIGHTS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {tmdbKey ? (
                    bollywoodHits.map(item => renderFeedCard(item, 'movie', 'bollywood'))
                  ) : (
                    <Text style={styles.laneEmptyText}>ADD TMDB KEY IN SETTINGS TO LOAD MOVIE LANES.</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>TRENDING ANIME</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {trendingAnime.map(item => renderFeedCard(item, 'anime', 'anime'))}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* TAB 2: EXPLORE (FULL-CONTROL FILTERS) */}
      {currentTab === 'explore' && (
        <View style={styles.tabContent}>
          <Text style={styles.sectionHeaderTitle}>EXPLORE & FILTER ENGINE</Text>

          {/* Media Type Toggle: Movies vs TV Shows */}
          <View style={styles.exploreTypeRow}>
            <TouchableOpacity
              style={[styles.typeToggle, exploreType === 'movie' && { backgroundColor: accentColor, borderColor: accentColor }]}
              onPress={() => setExploreType('movie')}
            >
              <Text style={[styles.typeToggleText, exploreType === 'movie' ? { color: '#0A0A0C' } : { color: '#FFFFFF' }]}>MOVIES</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeToggle, exploreType === 'tv' && { backgroundColor: accentColor, borderColor: accentColor }]}
              onPress={() => setExploreType('tv')}
            >
              <Text style={[styles.typeToggleText, exploreType === 'tv' ? { color: '#0A0A0C' } : { color: '#FFFFFF' }]}>TV SHOWS</Text>
            </TouchableOpacity>
          </View>

          {/* Genre Filters Horizontal Scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {Object.keys(TMDB_GENRES).map((genreName) => (
              <TouchableOpacity
                key={genreName}
                style={[
                  styles.filterPill,
                  selectedGenre === genreName && { backgroundColor: accentColor, borderColor: accentColor }
                ]}
                onPress={() => setSelectedGenre(genreName)}
              >
                <Text style={[
                  styles.filterPillText,
                  selectedGenre === genreName ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                ]}>
                  {genreName.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Granular Year Selector (Complete Freedom) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {YEAR_OPTIONS.map((yr) => (
              <TouchableOpacity
                key={yr}
                style={[
                  styles.filterPill,
                  selectedYear === yr && { backgroundColor: '#FFE500', borderColor: '#FFE500' }
                ]}
                onPress={() => setSelectedYear(yr)}
              >
                <Text style={[
                  styles.filterPillText,
                  selectedYear === yr ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                ]}>
                  {yr}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Granular Rating Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {RATING_OPTIONS.map((rat) => (
              <TouchableOpacity
                key={rat.label}
                style={[
                  styles.filterPill,
                  selectedRating === rat.value && { backgroundColor: '#00FF88', borderColor: '#00FF88' }
                ]}
                onPress={() => setSelectedRating(rat.value)}
              >
                <Text style={[
                  styles.filterPillText,
                  selectedRating === rat.value ? { color: '#0A0A0C' } : { color: '#FFFFFF' }
                ]}>
                  ★ {rat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {exploreLoading ? (
            <ActivityIndicator size="small" color={accentColor} style={styles.spinner} />
          ) : (
            <FlatList
              data={exploreMedia}
              keyExtractor={(item) => `explore-${item.id}`}
              numColumns={3}
              contentContainerStyle={styles.exploreGrid}
              columnWrapperStyle={styles.exploreGridRow}
              renderItem={({ item }) => renderFeedCard(item, exploreType, 'all')}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>NO TITLES MATCH THIS FILTER</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* TAB 3: ME (WATCHLIST & SETTINGS) */}
      {currentTab === 'me' && (
        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>MY WATCHLIST</Text>
          {watchlist.length > 0 ? (
            <View style={styles.watchlistGrid}>
              {watchlist.map(item => (
                <View key={`${item.mediaType}-${item.id}`} style={styles.watchlistItem}>
                  <TouchableOpacity onPress={() => handleSearchSubmitWithIMDb(item.title, item.mediaType, item.id)}>
                    <Image source={{ uri: item.posterUrl }} style={styles.watchlistPoster} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.watchlistRemove} onPress={() => toggleWatchlist(item)}>
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
                  <TouchableOpacity style={styles.pingButton} onPress={() => runPingCheck(key, domain)}>
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

      {/* YouTube-Style Bottom Navigation Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            if (currentTab === 'home') {
              setQuery('');
              setResults([]);
              setCategory('all');
            } else {
              setCurrentTab('home');
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={currentTab === 'home' ? 'home' : 'home-outline'}
            size={20}
            color={currentTab === 'home' ? accentColor : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.tabLabel, currentTab === 'home' ? { color: accentColor } : styles.tabInactive]}>
            HOME
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('explore')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={currentTab === 'explore' ? 'compass' : 'compass-outline'}
            size={20}
            color={currentTab === 'explore' ? accentColor : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.tabLabel, currentTab === 'explore' ? { color: accentColor } : styles.tabInactive]}>
            EXPLORE
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setCurrentTab('me')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={currentTab === 'me' ? 'person' : 'person-outline'}
            size={20}
            color={currentTab === 'me' ? accentColor : 'rgba(255,255,255,0.4)'}
          />
          <Text style={[styles.tabLabel, currentTab === 'me' ? { color: accentColor } : styles.tabInactive]}>
            ME
          </Text>
        </TouchableOpacity>
      </View>

      {/* YouTube-Style Player Modal Component */}
      <VideoPlayerModal
        visible={playerVisible}
        videoUrl={activeStreamUrl}
        title={activeStreamTitle}
        mediaItem={activeMediaItem}
        onClose={() => {
          setPlayerVisible(false);
          setActiveStreamUrl(null);
        }}
        onDownloadPress={() => {
          if (activeMediaItem) {
            setPlayerVisible(false);
            handleSearchSubmitWithIMDb(activeMediaItem.title, activeMediaItem.mediaType, activeMediaItem.id);
          }
        }}
        onSelectArtist={(id, name) => handleOpenArtist(id, name)}
        onSelectSimilarMedia={(item) => handleWatchStream(item)}
        isWatched={activeMediaItem ? watchedList.some(i => i.id === activeMediaItem.id && i.type === activeMediaItem.mediaType) : false}
        onToggleWatched={() => activeMediaItem && toggleWatched(activeMediaItem.id, activeMediaItem.mediaType || 'movie')}
        isSavedWatchlist={activeMediaItem ? watchlist.some(i => i.id === activeMediaItem.id && i.mediaType === activeMediaItem.mediaType) : false}
        onToggleWatchlist={() => activeMediaItem && toggleWatchlist({ id: activeMediaItem.id, title: activeMediaItem.title, posterUrl: activeMediaItem.posterUrl, mediaType: activeMediaItem.mediaType || 'movie' })}
      />

      {/* Artist Portfolio Sheet Modal */}
      <Modal
        visible={artistModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setArtistModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setArtistModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetHeaderTitle}>{artistName.toUpperCase()} • FILMOGRAPHY</Text>
              <TouchableOpacity onPress={() => setArtistModalVisible(false)} style={styles.closeSheetButton}>
                <Text style={styles.closeSheetText}>×</Text>
              </TouchableOpacity>
            </View>

            {loadingArtist ? (
              <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={artistCredits}
                keyExtractor={(item) => `artist-${item.id}`}
                numColumns={3}
                contentContainerStyle={{ padding: 16 }}
                columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 12 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ width: '31%' }}
                    onPress={() => {
                      setArtistModalVisible(false);
                      handleWatchStream(item);
                    }}
                  >
                    <Image source={{ uri: item.posterUrl }} style={{ width: '100%', aspectRatio: 2/3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Text style={{ fontFamily: 'NType82Mono', fontSize: 9, color: '#FFFFFF', marginTop: 4 }} numberOfLines={1}>
                      {item.title.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
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
            onShouldStartLoadWithRequest={(request) => {
              return request.url.startsWith('http://') || request.url.startsWith('https://');
            }}
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
    paddingTop: 45,
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
  suggestionsContainer: {
    marginHorizontal: 20,
    backgroundColor: '#16161A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'absolute',
    top: 66,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  suggestionTitleBtn: {
    flex: 1,
    marginRight: 12,
  },
  suggestionText: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: '#FFFFFF',
  },
  suggestionDownloadBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  suggestionDownloadIcon: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    fontWeight: 'bold',
  },
  recentSearchesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  recentSearchesLabel: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1,
    marginRight: 4,
  },
  recentSearchPill: {
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  recentSearchPillText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
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
  heroContainer: {
    position: 'relative',
    width: '100%',
    height: 220,
    marginBottom: 20,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroContent: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 12,
  },
  heroTag: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FF2D55',
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontFamily: 'Ndot57',
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 1,
    marginVertical: 4,
  },
  heroSub: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
  },
  heroPlayButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  heroPlayText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#0A0A0C',
    letterSpacing: 1,
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
  },
  posterWrapper: {
    position: 'relative',
    width: 110,
    height: 165,
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
  watchedBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#00FF88',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  watchedCheck: {
    fontSize: 11,
    color: '#0A0A0C',
    fontWeight: 'bold',
  },
  feedCardDownload: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#FFE500',
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  downloadArrow: {
    fontSize: 12,
    fontFamily: 'LetteraMono',
    fontWeight: 'bold',
    color: '#000000',
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
  sectionHeaderTitle: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  exploreTypeRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  typeToggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typeToggleText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    letterSpacing: 1,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  filterPillText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  exploreGrid: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  exploreGridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
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
    height: 60,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0A0A0C',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  tabLabel: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 4,
  },
  tabInactive: {
    color: 'rgba(255,255,255,0.4)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '80%',
    backgroundColor: '#0A0A0C',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  sheetHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetHeaderTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  closeSheetButton: {
    paddingHorizontal: 8,
  },
  closeSheetText: {
    fontSize: 24,
    color: '#FF2D55',
    fontFamily: 'Ndot57',
  },
  hiddenContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  }
});
