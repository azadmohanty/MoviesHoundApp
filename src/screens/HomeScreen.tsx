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
  UIManager,
  Animated,
  Dimensions,
  InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceTopInset, updateDeviceTopInset, initSafeAreaCache } from '../utils/SafeAreaCache';
import { triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic, triggerSelectionHaptic } from '../utils/HapticsHelper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CategoryPill } from '../components/CategoryPill';
import { ResultCard } from '../components/ResultCard';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { SkeletonCard } from '../components/SkeletonCard';
import { FilterDrawerModal, FilterOptions } from '../components/FilterDrawerModal';
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
  fetchFromTMDB,
  discoverMediaByGenre,
  discoverMediaWithFilters,
  getSimilarMedia,
  TMDB_GENRES,
  searchTMDB
} from '../utils/tmdb';
import {
  getList,
  toggleListItem,
  STORAGE_KEYS,
  subscribeStorageChanges,
  runLegacyMigrationIfNeeded,
} from '../utils/DatabaseStorage';
import { getCachedFeed, saveCachedFeed } from '../utils/ContentCache';
import { getTasteProfile, rankItemsByTaste, computeItemMatchPercentage } from '../utils/TasteEngine';
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

interface HomeScreenProps {
  onNavigateToDownloader?: (
    query: string,
    mediaType?: string,
    imdbId?: string,
    year?: string,
    isBollywood?: boolean
  ) => void;
}

export default function HomeScreen({ onNavigateToDownloader }: HomeScreenProps = {}) {
  // Swiparr Filter Drawer State
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  // Navigation & Sub-Tab State
  const [currentTab, setCurrentTab] = useState<'home' | 'explore' | 'me'>('home');
  const [subTab, setSubTab] = useState<'for_you' | 'explore'>('for_you');
  const [activeFilters, setActiveFilters] = useState<FilterOptions | null>(null);

  const insets = useSafeAreaInsets();
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);

  const { width: screenWidth } = Dimensions.get('window');
  const cardWidth = Math.floor((screenWidth - 48) / 3);
  const cardHeight = Math.floor(cardWidth * 1.5);

  const activeFilterCount = activeFilters
    ? (activeFilters.mediaType !== 'both' ? 1 : 0) +
      (activeFilters.selectedLanguage !== 'all' ? 1 : 0) +
      (activeFilters.selectedYear !== 'all' ? 1 : 0) +
      (activeFilters.selectedOtts?.length || 0) +
      (activeFilters.selectedGenres?.length || 0) +
      (activeFilters.minRating > 0 ? 1 : 0) +
      (activeFilters.sortBy !== 'popularity.desc' ? 1 : 0)
    : 0;

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
  const [explorePage, setExplorePage] = useState(1);
  const [exploreLoadingMore, setExploreLoadingMore] = useState(false);
  const [hasMoreExplore, setHasMoreExplore] = useState(true);
  const exploreCacheRef = useRef<Record<string, TMDBMediaItem[]>>({});
  const [tasteProfileState, setTasteProfileState] = useState<any>(null);
  const [becauseYouLovedRow, setBecauseYouLovedRow] = useState<TMDBMediaItem[]>([]);
  const [becauseYouLovedTitle, setBecauseYouLovedTitle] = useState<string>('');

  // Search Core States
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'hollywood' | 'bollywood' | 'anime'>('all');
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [searchSuggestions, setSearchSuggestions] = useState<TMDBMediaItem[]>([]);
  const [tmdbSearchResults, setTmdbSearchResults] = useState<TMDBMediaItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const saveSearchTerm = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    try {
      const updated = [trimmed, ...recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 10);
      setRecentSearches(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed saving search term:', e);
    }
  };

  const removeRecentSearchTerm = async (term: string) => {
    try {
      const updated = recentSearches.filter(t => t.toLowerCase() !== term.toLowerCase());
      await AsyncStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(updated));
      setRecentSearches(updated);
    } catch (e) {
      console.warn('Failed removing search term:', e);
    }
  };

  const clearAllRecentSearches = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES);
      setRecentSearches([]);
    } catch (e) {
      console.warn('Failed clearing search history:', e);
    }
  };
  const [searchMode, setSearchMode] = useState<'movies' | 'downloads'>('movies');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const heroScrollRef = useRef<ScrollView>(null);
  const [currentBackdrop, setCurrentBackdrop] = useState<string | null>(null);
  const [nextBackdrop, setNextBackdrop] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [exploreFilterVisible, setExploreFilterVisible] = useState(false);
  const toggleAnim = useRef(new Animated.Value(0)).current;

  // Isolated Scraper Terminal States
  const [scraperVisible, setScraperVisible] = useState(false);
  const [scraperQuery, setScraperQuery] = useState('');
  const [scraperResults, setScraperResults] = useState<SearchResult[]>([]);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperStatus, setScraperStatus] = useState('');
  const [scraperTasks, setScraperTasks] = useState<SearchTask[]>([]);
  const [scraperMediaType, setScraperMediaType] = useState<'movie' | 'tv' | 'anime'>('movie');
  const [scraperTmdbId, setScraperTmdbId] = useState<number | undefined>(undefined);

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
    runLegacyMigrationIfNeeded().then(() => {
      loadSettingsAndHistory();
    });
    loadDomains();

    // Subscribe to storage changes for real-time cross-screen sync
    const unsubscribe = subscribeStorageChanges(() => {
      loadSettingsAndHistory();
    });
    return () => unsubscribe();
  }, []);

  const loadSettingsAndHistory = async () => {
    try {
      let keyStr = await AsyncStorage.getItem(STORAGE_KEYS.TMDB_KEY);
      if (!keyStr || keyStr.trim() === '') {
        keyStr = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';
      }
      const proxy = await AsyncStorage.getItem(STORAGE_KEYS.PROXY_ENABLED) === 'true';
      const api = await AsyncStorage.getItem(STORAGE_KEYS.PROXY_API) || '';
      const img = await AsyncStorage.getItem(STORAGE_KEYS.PROXY_IMAGE) || '';
      const accent = await AsyncStorage.getItem(STORAGE_KEYS.ACCENT_COLOR) || '#FF2D55';

      setTmdbKey(keyStr || '');
      setProxyEnabled(proxy);
      setCustomApi(api);
      setCustomImage(img);
      setAccentColor(accent);

      const wl = await getList(STORAGE_KEYS.WATCHLIST);
      setWatchlist(wl);

      const wt = await getList(STORAGE_KEYS.WATCHED);
      setWatchedList(wt.map(i => ({ id: i.id, type: i.mediaType })));

      const histTMDBRaw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
      if (histTMDBRaw) setClickHistoryTMDB(JSON.parse(histTMDBRaw));

      const recentRaw = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
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
    if (trendingHollywood.length === 0 || isSearchActive || subTab !== 'for_you' || isUserInteracting) return;

    const interval = setInterval(() => {
      setHeroIndex(prevIndex => {
        const nextIndex = (prevIndex + 1) % Math.min(trendingHollywood.length, 5);
        if (heroScrollRef.current) {
          heroScrollRef.current.scrollTo({ x: nextIndex * screenWidth, animated: true });
        }
        return nextIndex;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [trendingHollywood, screenWidth, isSearchActive, subTab, isUserInteracting]);

  useEffect(() => {
    if (trendingHollywood.length > 0 && trendingHollywood[heroIndex]) {
      const activeItem = trendingHollywood[heroIndex];
      setHeroMedia(activeItem);
      const newUrl = activeItem.backdropUrl || activeItem.posterUrl;
      if (newUrl) {
        if (!currentBackdrop) {
          setCurrentBackdrop(newUrl);
        } else if (newUrl !== currentBackdrop && newUrl !== nextBackdrop) {
          setNextBackdrop(newUrl);
          fadeAnim.setValue(0);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            setCurrentBackdrop(newUrl);
          });
        }
      }
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
      // 1. Stale-While-Revalidate: Load cached feeds instantly if available (< 50ms startup)
      const [cachedForYou, cachedHollywood, cachedTV, cachedBolly, cachedAnime] = await Promise.all([
        getCachedFeed<any[]>('forYou'),
        getCachedFeed<any[]>('trendingHollywood'),
        getCachedFeed<any[]>('trendingTV'),
        getCachedFeed<any[]>('bollywood'),
        getCachedFeed<any[]>('trendingAnime'),
      ]);

      if (cachedHollywood || cachedForYou) {
        if (cachedForYou) setForYouFeed(cachedForYou);
        if (cachedHollywood) setTrendingHollywood(cachedHollywood);
        if (cachedTV) setTrendingTV(cachedTV);
        if (cachedBolly) setBollywoodHits(cachedBolly);
        if (cachedAnime) setTrendingAnime(cachedAnime);
        if (cachedForYou && cachedForYou.length > 0) setHeroMedia(cachedForYou[0]);
        setFeedsLoading(false); // Hide skeletons instantly!
      } else {
        setFeedsLoading(true);
      }

      // 2. Fetch fresh data in background
      const config = await getTMDBConfig();
      const profile = await getTasteProfile();
      setTasteProfileState(profile);

      const animeTrends = await getTrendingAnime();
      setTrendingAnime(animeTrends);
      saveCachedFeed('trendingAnime', animeTrends);

      if (config.apiKey) {
        try {
          const hollywood = await getTrendingMovies();
          setTrendingHollywood(hollywood);
          saveCachedFeed('trendingHollywood', hollywood);

          const tvShows = await getTrendingTVShows();
          setTrendingTV(tvShows);
          saveCachedFeed('trendingTV', tvShows);

          const bollywood = await getBollywoodMovies();
          setBollywoodHits(bollywood);
          saveCachedFeed('bollywood', bollywood);

          const rankedTMDB = rankItemsByTaste([...hollywood, ...tvShows, ...bollywood], profile);
          setForYouFeed(rankedTMDB);
          saveCachedFeed('forYou', rankedTMDB);

          // Seed "Because You Loved" Carousel if user has loved items
          if (profile.lovedIds && profile.lovedIds.length > 0) {
            const lastLovedId = profile.lovedIds[profile.lovedIds.length - 1];
            try {
              const similar = await getSimilarMedia(lastLovedId, 'movie');
              if (similar && similar.length > 0) {
                setBecauseYouLovedRow(similar);
                const lovedItemMatch = [...hollywood, ...tvShows, ...bollywood].find(i => i.id === lastLovedId);
                setBecauseYouLovedTitle(lovedItemMatch ? lovedItemMatch.title : 'Recent Favorite');
              }
            } catch (e) {
              console.warn('Failed loading because you loved recommendations:', e);
            }
          }

          if (rankedTMDB.length > 0) {
            setHeroMedia(rankedTMDB[0]);
          } else if (hollywood.length > 0) {
            setHeroMedia(hollywood[0]);
          }
        } catch (tmdbErr) {
          console.warn('Failed to fetch TMDB feeds:', tmdbErr);
          const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);
          setForYouFeed(personalAnime);
          saveCachedFeed('forYou', personalAnime);
        }
      } else {
        const personalAnime = await getPersonalizedAnimeRecommendations(clickHistoryAnime);
        setForYouFeed(personalAnime);
        saveCachedFeed('forYou', personalAnime);
      }
    } catch (e) {
      console.warn('Error loading recommendations feeds:', e);
    } finally {
      setFeedsLoading(false);
    }
  };

  const loadExploreData = async (filtersToUse?: FilterOptions | null, pageToLoad: number = 1) => {
    try {
      if (pageToLoad === 1) {
        setExploreLoading(true);
        setExplorePage(1);
        setHasMoreExplore(true);
      } else {
        setExploreLoadingMore(true);
      }

      const f = filtersToUse !== undefined ? filtersToUse : activeFilters;
      const cacheKey = JSON.stringify({ f, exploreType, selectedGenre, selectedYear, selectedRating, page: pageToLoad });

      let items: TMDBMediaItem[] = [];

      if (exploreCacheRef.current[cacheKey]) {
        items = exploreCacheRef.current[cacheKey];
      } else {
        if (f) {
          items = await discoverMediaWithFilters(f, pageToLoad);
        } else {
          let genreId = TMDB_GENRES[selectedGenre];
          if (exploreType === 'tv') {
            if (selectedGenre === 'Action' || selectedGenre === 'Adventure') genreId = 10759;
            else if (selectedGenre === 'SciFi') genreId = 10765;
            else if (selectedGenre === 'Horror' || selectedGenre === 'Thriller') genreId = 9648;
          }
          let numericYear: number | undefined = undefined;
          if (selectedYear !== 'ALL YEARS') {
            const parsed = parseInt(selectedYear, 10);
            if (!isNaN(parsed)) numericYear = parsed;
          }
          items = await discoverMediaByGenre(genreId, pageToLoad, numericYear, 'popularity.desc', exploreType);
          if (selectedRating > 0) {
            items = items.filter(i => i.rating >= selectedRating);
          }
        }
        exploreCacheRef.current[cacheKey] = items;
      }

      if (items.length < 20) {
        setHasMoreExplore(false);
      }

      if (pageToLoad === 1) {
        setExploreMedia(items);
      } else {
        setExploreMedia(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newItems = items.filter(i => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
      setExplorePage(pageToLoad);
    } catch (e) {
      console.warn('Failed loading explore data:', e);
    } finally {
      setExploreLoading(false);
      setExploreLoadingMore(false);
    }
  };

  // Watchlist Actions
  const toggleWatchlist = async (item: any) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      await toggleListItem(STORAGE_KEYS.WATCHLIST, {
        id: item.id,
        title: item.title,
        posterUrl: item.posterUrl,
        mediaType: item.mediaType || 'movie',
        rating: item.rating,
        releaseDate: item.releaseDate
      });
      const updated = await getList(STORAGE_KEYS.WATCHLIST);
      setWatchlist(updated);
    } catch (e) {
      console.warn('Failed to toggle watchlist:', e);
    }
  };

  // Watched Status Actions
  const toggleWatched = async (id: number, type: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      await toggleListItem(STORAGE_KEYS.WATCHED, {
        id,
        title: 'Watched Item',
        posterUrl: '',
        mediaType: (type as 'movie' | 'tv' | 'anime') || 'movie'
      });
      const updated = await getList(STORAGE_KEYS.WATCHED);
      setWatchedList(updated.map(i => ({ id: i.id, type: i.mediaType })));
    } catch (e) {
      console.warn('Failed to toggle watched:', e);
    }
  };

  // Click Tracking Actions (Silently updates history without triggering full page refresh)
  const trackMediaClick = async (id: number, mediaType: 'movie' | 'tv' | 'anime') => {
    try {
      if (mediaType === 'anime') {
        let history = [id, ...clickHistoryAnime.filter(x => x !== id)].slice(0, 10);
        await AsyncStorage.setItem('@history_clicks_anilist', JSON.stringify(history));
        setClickHistoryAnime(history);
      } else {
        const entry = { id, type: mediaType };
        let history = [entry, ...clickHistoryTMDB.filter(x => x.id !== id)].slice(0, 10);
        await AsyncStorage.setItem('@history_clicks_tmdb', JSON.stringify(history));
        setClickHistoryTMDB(history);
      }
    } catch (e) {
      console.warn('Failed to track click:', e);
    }
  };

  // Stream Trigger Action (Instantly Launches Details & Stream Player Modal)
  const handleWatchStream = (item: any) => {
    if (!item) return;
    const mediaType = item.mediaType || (item.rating && item.rating > 10 ? 'anime' : 'movie');
    const fullItem = {
      ...item,
      mediaType
    };
    setActiveMediaItem(fullItem);
    setActiveStreamTitle(item.title || '');
    setActiveStreamUrl(null);
    setPlayerVisible(true);
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
      if (key === STORAGE_KEYS.TMDB_KEY) setTmdbKey(value);
      else if (key === STORAGE_KEYS.PROXY_ENABLED) setProxyEnabled(value === 'true');
      else if (key === STORAGE_KEYS.PROXY_API) setCustomApi(value);
      else if (key === STORAGE_KEYS.PROXY_IMAGE) setCustomImage(value);
      else if (key === STORAGE_KEYS.ACCENT_COLOR) setAccentColor(value);
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
    await AsyncStorage.removeItem('@history_clicks_tmdb');
    await AsyncStorage.removeItem('@history_clicks_anilist');
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
    setIsSearchActive(true);
    setLoading(true);
    setStatusMessage('Searching titles...');

    // Save recent search using STORAGE_KEYS.RECENT_SEARCHES
    saveSearchTerm(trimmedQuery);

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
    tmdbId?: number,
    seasonNum: number = 1
  ) => {
    setScraperVisible(true);
    setScraperMediaType(mediaType);
    setScraperTmdbId(tmdbId);
    setScraperQuery(title);
    setScraperResults([]);
    resultsCountRef.current = 0;
    setScraperLoading(true);
    setScraperStatus('Bypassing security...');

    // Smart Query Mapping:
    // If it's a TV show, append "S0X" (e.g. "S01") to match target season index page
    let searchQuery = title;
    if (mediaType === 'tv') {
      const formattedSeason = seasonNum < 10 ? `S0${seasonNum}` : `S${seasonNum}`;
      searchQuery = `${title} ${formattedSeason}`;
    }

    // Try to resolve IMDb ID first for exact matches on movies
    if (mediaType === 'movie' && tmdbId) {
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

    setScraperTasks(tasks);

    // Fallback timer: if 0 links after 6 seconds, search other sites to find dubbed dual-audio
    setTimeout(() => {
      if (searchId.current === currentId && resultsCountRef.current === 0) {
        setScraperStatus('Searching fallback sources...');
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
        setScraperTasks(prev => [...prev, ...fallbackTasks]);
      }
    }, 6000);

    // Stop loading after 12 seconds max (Safety Timeout)
    setTimeout(() => {
      if (searchId.current === currentId) {
        setScraperLoading(false);
        setScraperStatus('');
        if (resultsCountRef.current === 0) {
          setScraperStatus('NO DOWNLOAD LINKS RESOLVED. ATTEMPT OTHER SITES.');
        }
      }
    }, 12000);
  };

  const handleSearchSubmitWithIMDb = async (
    title: string, 
    type: 'movie' | 'tv' | 'anime', 
    tmdbId?: number,
    releaseDate?: string,
    originCountry?: string[],
    originalLanguage?: string
  ) => {
    triggerLightHaptic();
    let imdbId = '';
    let fetchedOriginCountry = originCountry;
    let fetchedOriginalLang = originalLanguage;

    if (tmdbId) {
      try {
        imdbId = (await getIMDbId(tmdbId, type === 'anime' ? 'movie' : type)) || '';
        if ((!fetchedOriginCountry || fetchedOriginCountry.length === 0) && !fetchedOriginalLang) {
          const details = await fetchFromTMDB(`/${type === 'anime' ? 'movie' : type}/${tmdbId}`);
          if (details) {
            fetchedOriginCountry = details.origin_country || (details.production_countries ? details.production_countries.map((c: any) => c.iso_3166_1) : []);
            fetchedOriginalLang = details.original_language;
          }
        }
      } catch (e) {}
    }

    const INDIAN_LANGUAGES = ['hi', 'ta', 'te', 'ml', 'kn', 'mr', 'pa', 'bn', 'gu', 'or', 'as'];
    const year = releaseDate ? releaseDate.split('-')[0] : undefined;
    const isBollywood = Boolean(
      (fetchedOriginCountry && fetchedOriginCountry.includes('IN')) ||
      (fetchedOriginalLang && INDIAN_LANGUAGES.includes(fetchedOriginalLang))
    );

    if (onNavigateToDownloader) {
      onNavigateToDownloader(title, type, imdbId, year, isBollywood);
    }
  };

  const handleToggleExploreType = (type: 'movie' | 'tv') => {
    setExploreType(type);
    Animated.timing(toggleAnim, {
      toValue: type === 'movie' ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  const handleWebViewMessage = (siteKey: string, html: string) => {
    const domainKey = siteKey.toLowerCase();
    const baseUrl = resolvedDomains[domainKey] || '';
    const parsedResults = parseHTML(html, siteKey, category, baseUrl);
    setScraperResults(prev => {
      const combined = [...prev, ...parsedResults];
      const unique = new Map<string, SearchResult>();
      combined.forEach(item => unique.set(item.link, item));
      const finalResults = Array.from(unique.values());
      resultsCountRef.current = finalResults.length;
      return finalResults;
    });
    setScraperLoading(false);
    setScraperStatus('');
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
      <View key={`${type}-${item.id}`} style={[styles.feedCard, { width: cardWidth }]}>
        <View style={[styles.posterWrapper, { width: cardWidth, height: cardHeight }]}>
          <TouchableOpacity
            onPress={() => {
              trackMediaClick(item.id, type);
              handleWatchStream({ ...item, mediaType: type, suggestedCategory });
            }}
            activeOpacity={0.8}
          >
            <Image source={{ uri: item.posterUrl }} style={[styles.feedPoster, { width: cardWidth, height: cardHeight }]} />
          </TouchableOpacity>
          
          {/* Bookmark Glass Circle Button (Top Right) */}
          <TouchableOpacity
            style={styles.feedCardBookmark}
            onPress={() => toggleWatchlist({ id: item.id, title: item.title, posterUrl: item.posterUrl, mediaType: type })}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={13}
              color={isSaved ? accentColor : "#FFFFFF"}
            />
          </TouchableOpacity>

          {/* Watched Status Indicator (Top Left) */}
          {isWatched && (
            <View style={styles.watchedBadge}>
              <Ionicons name="checkmark-sharp" size={11} color="#0A0A0C" />
            </View>
          )}

          {/* Download Twin Glass Circle Button (Bottom Left) */}
          <TouchableOpacity
            style={styles.feedCardDownload}
            onPress={() => {
              trackMediaClick(item.id, type);
              handleSearchSubmitWithIMDb(item.title, type, item.id, item.releaseDate, item.originCountry, item.originalLanguage);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={13} color="#FFE500" />
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

  const leftOffset = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 106],
  });

  return (
    <View style={[styles.container, { paddingTop: getDeviceTopInset() }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Dual-Layer Animated Cross-Fade Ambient Backdrop (Swipe Screen Style) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {currentBackdrop && (
          <Image
            source={{ uri: currentBackdrop }}
            style={{ width: '100%', height: '100%', opacity: 0.85 }}
            blurRadius={28}
            resizeMode="cover"
          />
        )}
        {nextBackdrop && (
          <Animated.Image
            source={{ uri: nextBackdrop }}
            style={{ width: '100%', height: '100%', position: 'absolute', opacity: fadeAnim }}
            blurRadius={28}
            resizeMode="cover"
          />
        )}
        <LinearGradient
          colors={['rgba(15, 12, 24, 0.1)', 'rgba(12, 10, 18, 0.35)', 'rgba(10, 10, 14, 0.65)']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* Row 1 Header: HOLOGRAM Logo (Left) + Search Icon (Right) */}
      <View style={styles.headerRow}>
        <Text style={styles.brandTitle}>HOLOGRAM</Text>

        <TouchableOpacity
          style={styles.headerSearchBtn}
          onPress={() => {
            triggerLightHaptic();
            setIsSearchOverlayOpen(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Row 2: Full-Width Centered Glass Sub-Tab Capsule */}
      <View style={styles.glassSubTabCapsuleRow}>
        <TouchableOpacity
          style={[styles.glassSubTabBtn, subTab === 'for_you' && styles.glassSubTabBtnActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setSubTab('for_you');
          }}
        >
          <Text style={[styles.glassSubTabText, subTab === 'for_you' && styles.glassSubTabTextActive]}>
            FOR YOU
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.glassSubTabBtn, subTab === 'explore' && styles.glassSubTabBtnActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setSubTab('explore');
            if (exploreMedia.length === 0) loadExploreData();
          }}
        >
          <Text style={[styles.glassSubTabText, subTab === 'explore' && styles.glassSubTabTextActive]}>
            EXPLORE
          </Text>
        </TouchableOpacity>
      </View>

      {/* YouTube-Style Search Overlay Modal / Drawer */}
      {isSearchOverlayOpen && (
        <View style={styles.searchOverlayContainer}>
          {/* Search Header Bar */}
          <View style={styles.searchOverlayHeader}>
            <TouchableOpacity
              style={styles.searchOverlayBackBtn}
              onPress={() => {
                setIsSearchOverlayOpen(false);
                setQuery('');
                setShowSuggestions(false);
                setIsSearchActive(false);
              }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <TextInput
              style={styles.searchOverlayInput}
              placeholder="SEARCH MOVIES, SHOWS, ANIME..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (text.trim() === '') {
                  setSearchSuggestions([]);
                  setShowSuggestions(false);
                  setIsSearchActive(false);
                }
              }}
              onSubmitEditing={() => {
                handleSearchSubmit();
                setIsSearchOverlayOpen(false);
              }}
              autoFocus={true}
              autoCorrect={false}
              returnKeyType="search"
            />

            {query.length > 0 && (
              <TouchableOpacity
                style={styles.searchOverlayClearBtn}
                onPress={() => {
                  setQuery('');
                  setSearchSuggestions([]);
                  setShowSuggestions(false);
                  setIsSearchActive(false);
                }}
              >
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>

          {/* Search Content Body */}
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {/* When Query is Empty: Render YouTube-Style Recent Search History */}
            {query.trim() === '' ? (
              <View style={styles.recentHistorySection}>
                <View style={styles.recentHistoryHeader}>
                  <Text style={styles.recentHistoryTitle}>RECENT SEARCHES</Text>
                  {recentSearches.length > 0 && (
                    <TouchableOpacity onPress={clearAllRecentSearches}>
                      <Text style={styles.clearAllHistoryText}>CLEAR ALL</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {recentSearches.length > 0 ? (
                  recentSearches.map((term, idx) => (
                    <View key={`recent-row-${idx}`} style={styles.recentHistoryRow}>
                      <TouchableOpacity
                        style={styles.recentHistoryTextContainer}
                        onPress={() => {
                          setQuery(term);
                          handleSearchSubmit(term);
                          setIsSearchOverlayOpen(false);
                        }}
                      >
                        <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.recentHistoryItemText}>{term.toUpperCase()}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.removeHistoryItemBtn}
                        onPress={() => removeRecentSearchTerm(term)}
                      >
                        <Ionicons name="close" size={16} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyHistoryText}>NO RECENT SEARCH HISTORY</Text>
                )}
              </View>
            ) : (
              /* When Query Has Text: Render Autocomplete Suggestions */
              <View style={styles.suggestionsList}>
                {searchSuggestions.map((item) => (
                  <TouchableOpacity
                    key={`sugg-${item.id}`}
                    style={styles.suggestionRow}
                    onPress={() => {
                      setQuery(item.title);
                      saveSearchTerm(item.title);
                      setIsSearchOverlayOpen(false);
                      handleWatchStream(item);
                    }}
                  >
                    <Ionicons name="search" size={16} color="#FF2D55" style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionTitleText} numberOfLines={1}>
                        {item.title.toUpperCase()}
                      </Text>
                      <Text style={styles.suggestionSubText}>
                        {item.releaseDate ? item.releaseDate.split('-')[0] : 'N/A'} • {item.mediaType?.toUpperCase()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* MAIN CONTENT AREA */}
      <View style={{ flex: 1 }}>
        {isSearchActive ? (
          <FlatList
            data={tmdbSearchResults}
            keyExtractor={(item) => `search-tmdb-${item.id}`}
            numColumns={3}
            contentContainerStyle={styles.exploreGrid}
            columnWrapperStyle={styles.exploreGridRow}
            renderItem={({ item }) => renderFeedCard(item, item.mediaType || 'movie', 'all')}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>NO CATALOG RESULTS FOUND</Text>
                </View>
              ) : null
            }
          />
        ) : subTab === 'for_you' ? (
          /* SUBTAB 1: FOR YOU (No Floating Filter Pill) */
          <ScrollView contentContainerStyle={styles.scrollFeedsContent} showsVerticalScrollIndicator={false}>
            {/* Apple TV+ Full-Bleed 16:9 Swipeable Hero Spotlight Carousel */}
            {feedsLoading || trendingHollywood.length === 0 ? (
              <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <SkeletonCard width={screenWidth - 40} height={220} borderRadius={12} />
              </View>
            ) : (
              <View style={styles.heroWrapperContainer}>
                <ScrollView
                  ref={heroScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScrollBeginDrag={() => setIsUserInteracting(true)}
                  onScrollEndDrag={() => setIsUserInteracting(false)}
                  onScroll={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                    if (idx !== heroIndex && idx >= 0 && idx < 5 && trendingHollywood[idx]) {
                      setHeroIndex(idx);
                      setHeroMedia(trendingHollywood[idx]);
                    }
                  }}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                    if (idx >= 0 && idx < 5 && trendingHollywood[idx]) {
                      setHeroIndex(idx);
                      setHeroMedia(trendingHollywood[idx]);
                    }
                  }}
                  style={{ width: screenWidth, height: 220 }}
                >
                  {trendingHollywood.slice(0, 5).map((item, idx) => {
                    const isSaved = watchlist.some(i => i.id === item.id);
                    return (
                      <TouchableOpacity
                        key={`hero-slide-${item.id}-${idx}`}
                        style={{ width: screenWidth, height: 220, position: 'relative' }}
                        onPress={() => handleWatchStream(item)}
                        activeOpacity={0.9}
                      >
                        <Image source={{ uri: item.backdropUrl || item.posterUrl }} style={styles.heroImage} />
                        <LinearGradient
                          colors={['transparent', 'rgba(10,10,14,0.3)', 'rgba(10,10,14,0.6)']}
                          style={styles.heroGradient}
                        />
                        <View style={styles.heroContent}>
                          <Text style={styles.heroTag}>SPOTLIGHT #{idx + 1} PICK</Text>
                          <Text style={styles.heroTitle}>{item.title.toUpperCase()}</Text>
                          <Text style={styles.heroSub}>
                            ★ {item.rating ? item.rating.toFixed(1) : '8.5'} • {item.releaseDate || '2026'}
                          </Text>
                          <View style={styles.heroActionRow}>
                            <TouchableOpacity
                              style={[styles.heroPlayButton, { backgroundColor: accentColor }]}
                              onPress={() => handleWatchStream(item)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.heroPlayText}>▶ STREAM NOW</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.heroBookmarkBtn}
                              onPress={() => toggleWatchlist({ id: item.id, title: item.title, posterUrl: item.posterUrl, mediaType: item.mediaType || 'movie' })}
                              activeOpacity={0.8}
                            >
                              <Ionicons
                                name={isSaved ? "bookmark" : "bookmark-outline"}
                                size={18}
                                color="#FFF"
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Continue Watching Rail (Shows if history exists) */}
            {clickHistoryTMDB.length > 0 && (
              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>CONTINUE WATCHING</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {forYouFeed.slice(0, 8).map(item => {
                    const type = 'mediaType' in item ? item.mediaType : 'movie';
                    return renderFeedCard(item, type as any, 'all');
                  })}
                </ScrollView>
              </View>
            )}

            {/* Personalized Recommendation Feed */}
            <View style={styles.feedLane}>
              <Text style={styles.laneTitle}>BASED ON YOUR SWIPES & TASTE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                {feedsLoading || forYouFeed.length === 0 ? (
                  [1, 2, 3, 4].map(idx => (
                    <SkeletonCard key={`skel-foryou-${idx}`} width={cardWidth} height={cardHeight} borderRadius={4} />
                  ))
                ) : (
                  forYouFeed.map(item => {
                    const type = 'rating' in item && item.rating > 10 ? 'anime' : ('mediaType' in item ? item.mediaType : 'movie');
                    return renderFeedCard(item, type, 'all');
                  })
                )}
              </ScrollView>
            </View>

            {/* Seeded Recommendation Carousel: BECAUSE YOU LOVED [TITLE] */}
            {becauseYouLovedRow.length > 0 && (
              <View style={styles.feedLane}>
                <Text style={styles.laneTitle}>BECAUSE YOU LOVED: {becauseYouLovedTitle.toUpperCase()}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                  {becauseYouLovedRow.map(item => renderFeedCard(item, item.mediaType || 'movie', 'all'))}
                </ScrollView>
              </View>
            )}

            {/* Trending Hollywood Movies */}
            <View style={styles.feedLane}>
              <Text style={styles.laneTitle}>TRENDING HOLLYWOOD MOVIES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                {feedsLoading || trendingHollywood.length === 0 ? (
                  [1, 2, 3, 4].map(idx => (
                    <SkeletonCard key={`skel-holly-${idx}`} width={cardWidth} height={cardHeight} borderRadius={4} />
                  ))
                ) : (
                  trendingHollywood.map(item => renderFeedCard(item, 'movie', 'hollywood'))
                )}
              </ScrollView>
            </View>

            {/* Trending TV Series */}
            <View style={styles.feedLane}>
              <Text style={styles.laneTitle}>TRENDING TV SHOWS & SERIES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                {feedsLoading || trendingTV.length === 0 ? (
                  [1, 2, 3, 4].map(idx => (
                    <SkeletonCard key={`skel-tv-${idx}`} width={cardWidth} height={cardHeight} borderRadius={4} />
                  ))
                ) : (
                  trendingTV.map(item => renderFeedCard(item, 'tv', 'hollywood'))
                )}
              </ScrollView>
            </View>

            {/* Bollywood Hits */}
            <View style={styles.feedLane}>
              <Text style={styles.laneTitle}>BOLLYWOOD HIGHLIGHTS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                {feedsLoading || bollywoodHits.length === 0 ? (
                  [1, 2, 3, 4].map(idx => (
                    <SkeletonCard key={`skel-bolly-${idx}`} width={cardWidth} height={cardHeight} borderRadius={4} />
                  ))
                ) : (
                  bollywoodHits.map(item => renderFeedCard(item, 'movie', 'bollywood'))
                )}
              </ScrollView>
            </View>

            {/* AniList Anime */}
            <View style={styles.feedLane}>
              <Text style={styles.laneTitle}>TRENDING ANIME</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.laneScroll}>
                {feedsLoading || trendingAnime.length === 0 ? (
                  [1, 2, 3, 4].map(idx => (
                    <SkeletonCard key={`skel-anime-${idx}`} width={cardWidth} height={cardHeight} borderRadius={4} />
                  ))
                ) : (
                  trendingAnime.map(item => renderFeedCard(item, 'anime', 'anime'))
                )}
              </ScrollView>
            </View>
          </ScrollView>
        ) : (
          /* SUBTAB 2: EXPLORE (With Floating Filter Pill Exclusively) */
          <View style={{ flex: 1 }}>
            {/* Quick Category & Preset Chips Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exploreChipsRow}>
              {[
                { label: 'ALL', filter: { mediaType: 'both', selectedLanguage: 'all', selectedYear: 'all', selectedOtts: [], selectedGenres: [], minRating: 0, sortBy: 'popularity.desc' } },
                { label: 'MOVIES', filter: { mediaType: 'movie', selectedLanguage: 'all', selectedYear: 'all', selectedOtts: [], selectedGenres: [], minRating: 0, sortBy: 'popularity.desc' } },
                { label: 'SERIES', filter: { mediaType: 'tv', selectedLanguage: 'all', selectedYear: 'all', selectedOtts: [], selectedGenres: [], minRating: 0, sortBy: 'popularity.desc' } },
                { label: 'ANIME', filter: { mediaType: 'anime', selectedLanguage: 'ja', selectedYear: 'all', selectedOtts: [], selectedGenres: [16], minRating: 0, sortBy: 'popularity.desc' } },
                { label: 'BOLLYWOOD', filter: { mediaType: 'both', selectedLanguage: 'hi', selectedYear: 'all', selectedOtts: [], selectedGenres: [], minRating: 0, sortBy: 'popularity.desc' } },
                { label: '★ 8.0+ TOP RATED', filter: { mediaType: 'both', selectedLanguage: 'all', selectedYear: 'all', selectedOtts: [], selectedGenres: [], minRating: 8.0, sortBy: 'vote_average.desc' } },
                { label: '2026 LATEST', filter: { mediaType: 'both', selectedLanguage: 'all', selectedYear: '2026', selectedOtts: [], selectedGenres: [], minRating: 0, sortBy: 'popularity.desc' } },
              ].map((chip, idx) => {
                const isActive = activeFilters && activeFilters.mediaType === chip.filter.mediaType && activeFilters.selectedLanguage === chip.filter.selectedLanguage && activeFilters.minRating === chip.filter.minRating;
                return (
                  <TouchableOpacity
                    key={`preset-${idx}`}
                    style={[styles.presetChip, isActive && styles.presetChipActive]}
                    onPress={() => {
                      const f = chip.filter as FilterOptions;
                      setActiveFilters(f);
                      loadExploreData(f, 1);
                    }}
                  >
                    <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Active Filter HUD Bar */}
            {activeFilters && (
              <View style={styles.activeFilterHud}>
                <Text style={styles.activeFilterHudText}>
                  ACTIVE: {activeFilters.mediaType.toUpperCase()} • {activeFilters.selectedLanguage.toUpperCase()} {activeFilters.minRating > 0 ? `• ★ ${activeFilters.minRating}+` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setActiveFilters(null);
                    loadExploreData(null, 1);
                  }}
                >
                  <Text style={styles.hudClearText}>CLEAR</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 3-Column Explore Grid with 50-Item Auto-Pagination Safeguard */}
            {exploreLoading || exploreMedia.length === 0 ? (
              <View style={styles.exploreGrid}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <View key={`skel-exp-${idx}`} style={{ marginBottom: 16 }}>
                      <SkeletonCard width={cardWidth} height={cardHeight} borderRadius={4} />
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <FlatList
                data={exploreMedia}
                keyExtractor={(item) => `explore-${item.id}`}
                numColumns={3}
                contentContainerStyle={styles.exploreGrid}
                columnWrapperStyle={styles.exploreGridRow}
                renderItem={({ item }) => renderFeedCard(item, item.mediaType || 'movie', 'all')}
                onEndReachedThreshold={0.5}
                onEndReached={() => {
                  // Anti-exploitation cap: auto-paginate up to 50 items (2-3 pages)
                  if (exploreMedia.length < 50 && hasMoreExplore && !exploreLoadingMore && !exploreLoading) {
                    loadExploreData(activeFilters, explorePage + 1);
                  }
                }}
                ListFooterComponent={
                  exploreLoadingMore ? (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color="#FF2D55" />
                    </View>
                  ) : exploreMedia.length >= 50 && hasMoreExplore ? (
                    <TouchableOpacity
                      style={{
                        marginVertical: 20,
                        paddingVertical: 14,
                        marginHorizontal: 16,
                        backgroundColor: '#1E1E24',
                        borderRadius: 8,
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 45, 85, 0.3)',
                      }}
                      onPress={() => loadExploreData(activeFilters, explorePage + 1)}
                    >
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#FF2D55', letterSpacing: 1 }}>
                        LOAD MORE RESULTS (PAGE {explorePage + 1})
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>NO CONTENT MATCHES CURRENT FILTERS</Text>
                  </View>
                }
              />
            )}
          </View>
        )}
      </View>

      {/* Floating Dynamic Island Filter Pill (Rendered EXCLUSIVELY on EXPLORE Sub-Tab) */}
      {subTab === 'explore' && (
        <TouchableOpacity
          style={[styles.floatingFilterPill, { bottom: 16 + insets.bottom }]}
          onPress={() => setFilterDrawerVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="options-outline" size={16} color="#FF2D55" />
          <Text style={styles.floatingFilterText}>
            FILTER & DISCOVER {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Filter Drawer Modal */}
      <FilterDrawerModal
        visible={filterDrawerVisible}
        initialFilters={activeFilters || undefined}
        onClose={() => setFilterDrawerVisible(false)}
        onApplyFilters={(filters) => {
          setActiveFilters(filters);
          setSubTab('explore');
          loadExploreData(filters);
        }}
      />

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
        onDownloadPress={(seasonNum) => {
          if (activeMediaItem) {
            setPlayerVisible(false);
            handleSearchSubmitWithIMDb(activeMediaItem.title, activeMediaItem.mediaType || 'movie', activeMediaItem.id, activeMediaItem.releaseDate, activeMediaItem.originCountry, activeMediaItem.originalLanguage);
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
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
  glassSubTabCapsuleRow: {
    marginHorizontal: 16,
    marginVertical: 6,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  glassSubTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 20,
  },
  glassSubTabBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
  },
  glassSubTabText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
  },
  glassSubTabTextActive: {
    color: '#FFFFFF',
  },
  exploreChipsRow: {
    height: 52,
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'center',
  },
  presetChip: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  presetChipText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  headerSearchBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0A0C',
    zIndex: 9999,
    paddingTop: 45,
  },
  searchOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchOverlayBackBtn: {
    padding: 6,
    marginRight: 8,
  },
  searchOverlayInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontFamily: 'LetteraMono',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchOverlayClearBtn: {
    padding: 8,
    marginLeft: 4,
  },
  recentHistorySection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  recentHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recentHistoryTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1.5,
  },
  clearAllHistoryText: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FF2D55',
    letterSpacing: 1,
  },
  recentHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  recentHistoryTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  recentHistoryItemText: {
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: '#FFFFFF',
  },
  removeHistoryItemBtn: {
    padding: 6,
  },
  emptyHistoryText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 20,
  },
  suggestionsList: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  suggestionTitleText: {
    fontFamily: 'Ndot57',
    fontSize: 13,
    color: '#FFFFFF',
  },
  suggestionSubText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
  },
  floatingFilterPill: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(18, 18, 24, 0.94)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FF2D55',
    elevation: 12,
    zIndex: 9999,
  },
  floatingFilterText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  heroBookmarkBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  activeFilterHud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 45, 85, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.2)',
  },
  activeFilterHudText: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FF2D55',
    letterSpacing: 1,
  },
  hudClearText: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
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
    paddingBottom: 90,
  },
  exploreGrid: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 90,
  },
  exploreGridRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heroWrapperContainer: {
    position: 'relative',
    width: '100%',
    height: 230,
    marginBottom: 10,
  },
  heroDotPagination: {
    position: 'absolute',
    bottom: 4,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 20,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  heroDotActive: {
    width: 16,
    backgroundColor: '#FF2D55',
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
    top: 6,
    right: 6,
    backgroundColor: 'rgba(10, 10, 14, 0.82)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  watchedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
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
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(10, 10, 14, 0.82)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
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
  toggleOuterContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  animatedToggleContainer: {
    width: 220,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
  },
  animatedToggleSlider: {
    position: 'absolute',
    width: 108,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FF2D55',
    top: 3,
  },
  animatedToggleButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  animatedToggleText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    letterSpacing: 1.5,
  },
  toggleTextActive: {
    color: '#0A0A0C',
  },
  toggleTextInactive: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  filterFAB: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 12, 0.9)',
    borderWidth: 1,
    borderColor: '#FF2D55',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  filterFABText: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  bottomSheetContent: {
    backgroundColor: '#0A0A0C',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    maxHeight: '75%',
    paddingBottom: 24,
  },
  bottomSheetHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  bottomSheetTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  bottomSheetClose: {
    fontSize: 18,
    color: '#FF2D55',
    fontFamily: 'Ndot57',
  },
  bottomSheetScroll: {
    paddingHorizontal: 20,
  },
  bottomSheetSubHeading: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: 1,
  },
  bottomSheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bottomSheetPill: {
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  bottomSheetPillActive: {
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
  },
  bottomSheetPillText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 0.5,
  },
  bottomSheetPillTextActive: {
    color: '#0A0A0C',
    fontWeight: 'bold',
  },
  applyButton: {
    backgroundColor: '#FF2D55',
    marginHorizontal: 20,
    marginTop: 15,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 4,
  },
  applyButtonText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#0A0A0C',
    letterSpacing: 1.5,
  },
  scraperModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  scraperModalContent: {
    backgroundColor: '#0A0A0C',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    height: '85%',
  },
  scraperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  scraperModalTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FF2D55',
    letterSpacing: 1.5,
  },
  scraperSubtitle: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  scraperCloseButton: {
    paddingHorizontal: 8,
  },
  scraperCloseText: {
    fontSize: 20,
    color: '#FF2D55',
    fontFamily: 'Ndot57',
  },
  scraperSearchBox: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    gap: 10,
  },
  scraperInput: {
    flex: 1,
    height: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    paddingHorizontal: 12,
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#FFFFFF',
  },
  scraperSearchButton: {
    backgroundColor: '#FFE500',
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scraperSearchButtonText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#0A0A0C',
    letterSpacing: 1,
  },
  scraperStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  scraperStatusText: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  scraperSourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sourceTaskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sourceTaskBadgeText: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  scraperEmptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  scraperEmptyText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.5,
  },
  bypassScraperButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFE500',
    backgroundColor: 'rgba(255, 229, 0, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  bypassScraperButtonText: {
    fontFamily: 'Ndot57',
    fontSize: 9,
    color: '#FFE500',
    letterSpacing: 1.5,
  },
  hiddenContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  }
});
