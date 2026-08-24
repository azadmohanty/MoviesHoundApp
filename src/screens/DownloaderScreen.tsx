import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceTopInset } from '../utils/SafeAreaCache';
import { triggerLightHaptic, triggerSelectionHaptic, triggerSuccessHaptic } from '../utils/HapticsHelper';
import { resolveAllDomains, HARDCODED_FALLBACKS } from '../utils/resolver';
import { resolveFzMoviesStream } from '../utils/fzmoviesResolver';
import { sanitizeSearchQuery } from '../utils/FuzzyMatcher';
import { getStorageString, saveDownloadItem } from '../utils/DatabaseStorage';

// Shared models & site resolvers
import { ScrapedQualityOption, ResolvedStreamResult, SearchArticleCard } from '../utils/resolverTypes';
import {
  getVegaMoviesQualityOptions,
  searchVegaMoviesRawCards,
  parseVegaMoviesArticle,
  resolveVegaMoviesLocker,
  fetchVegaMoviesEpisodes,
  resolveVegaMoviesUnlockedPage,
  SeriesEpisodeItem,
} from '../utils/vegamoviesResolver';
import {
  getMoviesModQualityOptions,
  searchMoviesModRawCards,
  parseMoviesModArticle,
  resolveMoviesModLocker,
  fetchMoviesModEpisodes,
} from '../utils/moviesmodResolver';
import {
  getRogMoviesQualityOptions,
  resolveRogMoviesLocker,
  fetchRogMoviesEpisodes,
  resolveRogMoviesUnlockedPage,
} from '../utils/rogmoviesResolver';
import {
  getTopMoviesQualityOptions,
  resolveTopMoviesLocker,
  fetchTopMoviesEpisodes,
} from '../utils/topmoviesResolver';
import { resolveBollyflixLocker } from '../utils/bollyflixResolver';

interface DownloaderScreenProps {
  initialSearchQuery?: string;
  initialImdbId?: string;
  initialYear?: string | number;
  initialMediaType?: string;
  initialIsBollywood?: boolean;
  searchTrigger?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PROVIDER_COLORS: Record<string, string> = {
  vegamovies: '#FFD700', // Gold
  rogmovies: '#FFD700',  // Gold
  moviesmod: '#00E5FF',  // Cyan
  topmovies: '#00E5FF',  // Cyan
  fzmovies: '#00FF66',   // Matrix Green
  bollyflix: '#FF2D55',  // Crimson
};

function getProviderColor(siteKey?: string): string {
  if (!siteKey) return '#FFD700';
  return PROVIDER_COLORS[siteKey.toLowerCase()] || '#FFD700';
}

interface CachedSearchResult {
  options: ScrapedQualityOption[];
  rawCards: SearchArticleCard[];
  providerStatus: Record<string, { count: number; status: 'loading' | 'done' | 'error' }>;
  timestamp: number;
}

const IN_MEMORY_CACHE = new Map<string, CachedSearchResult>();

export default function DownloaderScreen({
  initialSearchQuery = '',
  initialImdbId = '',
  initialYear,
  initialMediaType = 'movie',
  initialIsBollywood = false,
  searchTrigger = 0,
}: DownloaderScreenProps) {
  const [query, setQuery] = useState(initialSearchQuery);
  const [category, setCategory] = useState<'hollywood' | 'bollywood'>(initialIsBollywood ? 'bollywood' : 'hollywood');
  const [isSearching, setIsSearching] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);

  // Filter & Grouping States (480p, 720p default, 1080p, 2K, 4K)
  const [selectedQuality, setSelectedQuality] = useState<'480p' | '720p' | '1080p' | '2K' | '4K'>('720p');
  const [seriesMode, setSeriesMode] = useState<'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP'>('SINGLE_EPISODE');
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({});
  const [selectedSeriesProvider, setSelectedSeriesProvider] = useState<ScrapedQualityOption['siteKey'] | null>(null);

  // Parsed Stream Options & Raw Discovered Cards
  const [options, setOptions] = useState<ScrapedQualityOption[]>([]);
  const [rawCards, setRawCards] = useState<SearchArticleCard[]>([]);
  const [rawTrayExpanded, setRawTrayExpanded] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Live Scraper Status Pills
  const [providerStatus, setProviderStatus] = useState<Record<string, { count: number; status: 'loading' | 'done' | 'error' }>>({});

  // Web Series Episode Sub-Scraper State
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesList, setEpisodesList] = useState<SeriesEpisodeItem[]>([]);

  const prevTriggerRef = useRef(0);

  useEffect(() => {
    if (searchTrigger > 0 && searchTrigger !== prevTriggerRef.current && initialSearchQuery) {
      prevTriggerRef.current = searchTrigger;
      setQuery(initialSearchQuery);
      handleStartScrape(initialSearchQuery);
    }
  }, [searchTrigger]);

  useEffect(() => {
    getStorageString('@default_quality', '720p').then((q) => {
      if (q && ['480p', '720p', '1080p', '2K', '4K'].includes(q)) {
        setSelectedQuality(q as any);
      }
    });

    if (initialSearchQuery && searchTrigger === 0) {
      setQuery(initialSearchQuery);
      handleStartScrape(initialSearchQuery);
    }
  }, []);

  const addLog = (msg: string) => {
    setStatusLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const resetState = () => {
    setOptions([]);
    setRawCards([]);
    setEpisodesList([]);
    setStatusLog([]);
    setProviderStatus({});
    setRawTrayExpanded(false);
  };

  const handleStartScrape = async (overrideQuery?: string, overrideCategory?: 'hollywood' | 'bollywood') => {
    const activeQ = overrideQuery || query;
    const activeCat = overrideCategory || category;
    const cleanQ = sanitizeSearchQuery(activeQ);
    if (!cleanQ) {
      Alert.alert('Search Required', 'Please enter a title to search.');
      return;
    }

    const cacheKey = `${activeCat}:${cleanQ.toLowerCase()}`;
    const cached = IN_MEMORY_CACHE.get(cacheKey);

    // 0ms In-Memory Cache Check
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 15) {
      setOptions(cached.options);
      setRawCards(cached.rawCards);
      setProviderStatus(cached.providerStatus);
      addLog(`Loaded cached results for "${cleanQ}" (0ms).`);
      if (cached.options.length === 0 && cached.rawCards.length > 0) {
        setRawTrayExpanded(true);
      }
      return;
    }

    triggerLightHaptic();
    setIsSearching(true);
    resetState();
    addLog(`Starting AI scraper for "${cleanQ}" [${activeCat.toUpperCase()}]...`);

    try {
      const [disabledJson, timeoutStr] = await Promise.all([
        getStorageString('@disabled_providers', '[]'),
        getStorageString('@scraper_timeout', '7000'),
      ]);

      let disabledList: string[] = [];
      try { disabledList = JSON.parse(disabledJson || '[]'); } catch (e) {}
      const timeoutMs = parseInt(timeoutStr || '7000', 10) || 7000;

      // FzMovies direct MP4 fast lane (Hollywood Movies)
      if (activeCat === 'hollywood' && initialMediaType === 'movie' && !disabledList.includes('fzmovies')) {
        resolveFzMoviesStream(cleanQ)
          .then((fzRes) => {
            if (fzRes && fzRes.url) {
              addLog('FzMovies: Direct MP4 found');
              setOptions((prev) => [
                {
                  id: `fz-${Date.now()}`,
                  siteKey: 'fzmovies',
                  siteDisplayName: 'FZMOVIES',
                  qualityLabel: '480p',
                  ripFormat: 'MP4 FAST LANE',
                  codec: 'H.264',
                  fileSize: '350 MB',
                  audioTracks: 'English / Dual',
                  contentType: 'MOVIE',
                  seasonNumber: 1,
                  targetUrl: fzRes.url,
                  priorityScore: 0,
                },
                ...prev,
              ]);
            }
          })
          .catch(() => {});
      }

      addLog('Resolving live provider domains...');
      const liveDomains = await resolveAllDomains((msg) => addLog(msg));

      const createController = () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
      };

      const scraperPromises: Promise<ScrapedQualityOption[]>[] = [];
      const rawCardPromises: Promise<SearchArticleCard[]>[] = [];
      const currentStatus: Record<string, { count: number; status: 'loading' | 'done' | 'error' }> = {};

      if (activeCat === 'hollywood') {
        const vegaDomain = liveDomains.vegamovies || HARDCODED_FALLBACKS.vegamovies;
        const moviesModDomain = liveDomains.moviesmod || 'https://moviesmod.zone';

        // 1. VegaMovies (Hollywood)
        if (!disabledList.includes('vegamovies')) {
          currentStatus.vegamovies = { count: 0, status: 'loading' };
          setProviderStatus({ ...currentStatus });

          scraperPromises.push(
            getVegaMoviesQualityOptions(
              cleanQ,
              initialYear,
              initialImdbId,
              initialMediaType,
              vegaDomain,
              'VEGAMOVIES',
              createController(),
              (msg) => addLog(msg)
            ).then((res) => {
              currentStatus.vegamovies = { count: res.length, status: res.length > 0 ? 'done' : 'error' };
              setProviderStatus({ ...currentStatus });
              return res;
            })
          );

          rawCardPromises.push(
            searchVegaMoviesRawCards(cleanQ, vegaDomain, createController())
          );
        }

        // 2. MoviesMod (Hollywood)
        if (!disabledList.includes('moviesmod')) {
          currentStatus.moviesmod = { count: 0, status: 'loading' };
          setProviderStatus({ ...currentStatus });

          scraperPromises.push(
            getMoviesModQualityOptions(
              cleanQ,
              initialYear,
              initialImdbId,
              initialMediaType,
              moviesModDomain,
              'MOVIESMOD',
              createController(),
              (msg) => addLog(msg)
            ).then((res) => {
              currentStatus.moviesmod = { count: res.length, status: res.length > 0 ? 'done' : 'error' };
              setProviderStatus({ ...currentStatus });
              return res;
            })
          );

          rawCardPromises.push(
            searchMoviesModRawCards(cleanQ, moviesModDomain, createController())
          );
        }
      } else {
        // Bollywood Section (RogMovies + TopMovies)
        const rogDomain = liveDomains.rogmovies || HARDCODED_FALLBACKS.rogmovies;
        const topDomain = liveDomains.topmovies || 'https://moviesleech.asia';

        if (!disabledList.includes('rogmovies')) {
          currentStatus.rogmovies = { count: 0, status: 'loading' };
          setProviderStatus({ ...currentStatus });

          scraperPromises.push(
            getRogMoviesQualityOptions(
              cleanQ,
              initialYear,
              initialImdbId,
              initialMediaType,
              rogDomain,
              'ROGMOVIES',
              createController(),
              (msg) => addLog(msg)
            ).then((res) => {
              currentStatus.rogmovies = { count: res.length, status: res.length > 0 ? 'done' : 'error' };
              setProviderStatus({ ...currentStatus });
              return res;
            })
          );
        }

        if (!disabledList.includes('topmovies')) {
          currentStatus.topmovies = { count: 0, status: 'loading' };
          setProviderStatus({ ...currentStatus });

          scraperPromises.push(
            getTopMoviesQualityOptions(
              cleanQ,
              initialYear,
              initialImdbId,
              initialMediaType,
              topDomain,
              'TOPMOVIES',
              createController(),
              (msg) => addLog(msg)
            ).then((res) => {
              currentStatus.topmovies = { count: res.length, status: res.length > 0 ? 'done' : 'error' };
              setProviderStatus({ ...currentStatus });
              return res;
            })
          );
        }
      }

      const [scraperResults, rawResults] = await Promise.all([
        Promise.allSettled(scraperPromises),
        Promise.allSettled(rawCardPromises),
      ]);

      const allExtractedOptions: ScrapedQualityOption[] = [];
      scraperResults.forEach((res) => {
        if (res.status === 'fulfilled') {
          allExtractedOptions.push(...res.value);
        }
      });

      const allRawCards: SearchArticleCard[] = [];
      rawResults.forEach((res) => {
        if (res.status === 'fulfilled') {
          allRawCards.push(...res.value);
        }
      });

      const optionMap = new Map<string, ScrapedQualityOption>();
      allExtractedOptions.forEach((o) => optionMap.set(o.targetUrl, o));
      const sortedOptions = Array.from(optionMap.values()).sort((a, b) => a.priorityScore - b.priorityScore);

      setOptions(sortedOptions);
      setRawCards(allRawCards);

      if (sortedOptions.length === 0 && allRawCards.length > 0) {
        setRawTrayExpanded(true);
        addLog(`Discovered ${allRawCards.length} raw posts. Tap any post below to scrape.`);
      }

      IN_MEMORY_CACHE.set(cacheKey, {
        options: sortedOptions,
        rawCards: allRawCards,
        providerStatus: currentStatus,
        timestamp: Date.now(),
      });

      addLog(`Done: ${sortedOptions.length} stream options | ${allRawCards.length} raw posts.`);
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleManualScrapeArticle = async (card: SearchArticleCard) => {
    triggerSelectionHaptic();
    setIsSearching(true);
    addLog(`Scraping selected post: "${card.title}" (${card.siteDisplayName})...`);

    try {
      let articleUrl = card.permalink;
      const res = await fetch(articleUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const html = await res.text();

      let parsed: ScrapedQualityOption[] = [];
      if (card.siteKey === 'vegamovies') {
        parsed = parseVegaMoviesArticle(html, articleUrl);
      } else if (card.siteKey === 'moviesmod') {
        parsed = parseMoviesModArticle(html, articleUrl, 'MOVIESMOD');
      }

      if (parsed.length > 0) {
        triggerSuccessHaptic();
        setOptions(parsed);
        setRawTrayExpanded(false);
        addLog(`🎉 Extracted ${parsed.length} options from selected post!`);
      } else {
        Alert.alert('No Links Found', 'Could not find active download sections on this post.');
      }
    } catch (e: any) {
      addLog(`Manual Scrape Error: ${e.message}`);
      Alert.alert('Scrape Error', e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const isSeries = options.some((o) => o.contentType !== 'MOVIE');
  const availableSeasons = Array.from(new Set(options.map((o) => o.seasonNumber || 1))).sort((a, b) => a - b);

  useEffect(() => {
    if (availableSeasons.length > 0 && !availableSeasons.includes(selectedSeason)) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [options, availableSeasons]);

  const filteredOptions = options.filter((opt) => {
    if (opt.qualityLabel !== selectedQuality) return false;
    if (opt.contentType === 'MOVIE') return true;
    if (opt.seasonNumber !== selectedSeason) return false;
    return opt.contentType === seriesMode;
  });

  const availableSeriesProviders = Array.from(
    new Set(
      options
        .filter((opt) => opt.qualityLabel === selectedQuality && opt.contentType === 'SINGLE_EPISODE' && opt.seasonNumber === selectedSeason)
        .map((opt) => opt.siteKey)
    )
  );

  const activeSeriesProvider = (selectedSeriesProvider && availableSeriesProviders.includes(selectedSeriesProvider))
    ? selectedSeriesProvider
    : availableSeriesProviders[0] || null;

  const activeSeriesOption = options.find(
    (opt) => opt.qualityLabel === selectedQuality && opt.contentType === 'SINGLE_EPISODE' && opt.seasonNumber === selectedSeason && opt.siteKey === activeSeriesProvider
  ) || filteredOptions[0];

  useEffect(() => {
    if (isSeries && seriesMode === 'SINGLE_EPISODE' && activeSeriesOption) {
      setEpisodesLoading(true);
      addLog(`Fetching Season ${selectedSeason} Episodes via ${activeSeriesOption.siteDisplayName}...`);

      let epFetcher = fetchVegaMoviesEpisodes;
      if (activeSeriesOption.siteKey === 'rogmovies') epFetcher = fetchRogMoviesEpisodes;
      else if (activeSeriesOption.siteKey === 'moviesmod') epFetcher = fetchMoviesModEpisodes;
      else if (activeSeriesOption.siteKey === 'topmovies') epFetcher = fetchTopMoviesEpisodes;

      epFetcher(activeSeriesOption.targetUrl)
        .then((epList) => {
          setEpisodesList(epList);
          addLog(`Extracted ${epList.length} episodes.`);
        })
        .finally(() => setEpisodesLoading(false));
    }
  }, [isSeries, seriesMode, selectedSeason, selectedQuality, activeSeriesOption?.targetUrl]);

  const handleDownload = async (item: ScrapedQualityOption, action: 'download' | 'copy' | 'stream', customUrl?: string) => {
    triggerSelectionHaptic();
    const targetUrl = customUrl || item.targetUrl;

    if (item.siteKey === 'fzmovies' || item.siteKey === 'moviebox') {
      if (action === 'download' || action === 'stream') {
        saveDownloadItem({
          id: item.id || targetUrl,
          title: query || 'Downloaded File',
          posterUrl: '',
          mediaType: isSeries ? 'tv' : 'movie',
          qualityLabel: `${item.qualityLabel} • ${item.siteDisplayName}`,
          downloadUrl: targetUrl,
        }).catch(() => {});
        Linking.openURL(targetUrl).catch(() => Alert.alert('Error', 'Could not open download URL.'));
      } else {
        Alert.alert('Download Link', targetUrl);
      }
      return;
    }

    if (item.siteKey === 'vegamovies' || item.siteKey === 'rogmovies' || targetUrl.includes('vcloud') || targetUrl.includes('v-cloud')) {
      setResolvingId(item.id);
      addLog(`Unlocking VCloud page for ${item.siteDisplayName}...`);
      const unlockedUrl = item.siteKey === 'rogmovies'
        ? await resolveRogMoviesUnlockedPage(targetUrl)
        : await resolveVegaMoviesUnlockedPage(targetUrl);
      setResolvingId(null);

      if (action === 'download' || action === 'stream') {
        triggerSuccessHaptic();
        addLog('Unlocked page ready');
        saveDownloadItem({
          id: item.id || unlockedUrl,
          title: query || 'Downloaded File',
          posterUrl: '',
          mediaType: isSeries ? 'tv' : 'movie',
          qualityLabel: `${item.qualityLabel} • ${item.siteDisplayName}`,
          downloadUrl: unlockedUrl,
        }).catch(() => {});
        Linking.openURL(unlockedUrl).catch(() => Alert.alert('Error', 'Could not open download URL.'));
      } else {
        Alert.alert('Unlocked Server Link', unlockedUrl);
      }
      return;
    }

    setResolvingId(item.id);
    addLog(`Resolving Pass 2 for ${item.siteDisplayName}...`);

    let res: ResolvedStreamResult = {
      success: false,
      providerName: item.siteDisplayName,
      qualityLabel: item.qualityLabel,
    };

    if (item.siteKey === 'topmovies') res = await resolveTopMoviesLocker(targetUrl, item.qualityLabel);
    else if (item.siteKey === 'moviesmod') res = await resolveMoviesModLocker(targetUrl, item.qualityLabel);
    else if (item.siteKey === 'bollyflix') res = await resolveBollyflixLocker(targetUrl, item.qualityLabel);

    setResolvingId(null);

    if (res.success && res.streamUrl) {
      triggerSuccessHaptic();
      addLog(`Resolved: ${res.providerName}`);
      if (action === 'download' || action === 'stream') {
        saveDownloadItem({
          id: item.id || res.streamUrl,
          title: query || 'Downloaded File',
          posterUrl: '',
          mediaType: isSeries ? 'tv' : 'movie',
          qualityLabel: `${item.qualityLabel} • ${res.providerName}`,
          downloadUrl: res.streamUrl,
        }).catch(() => {});
        Linking.openURL(res.streamUrl).catch(() => Alert.alert('Error', 'Could not open download URL.'));
      } else {
        Alert.alert('Direct Link', res.streamUrl);
      }
    } else {
      addLog(`Failed: ${res.message || 'Locker offline'}`);
      Alert.alert('Resolution Failed', res.message || 'Could not extract download URL.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: getDeviceTopInset() }]}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="download" size={15} color="#FFD700" />
          </View>
          <Text style={styles.headerTitle}>DOWNLOADER TERMINAL</Text>
        </View>
        {isSearching && <ActivityIndicator size="small" color="#FFD700" />}
      </View>

      {/* ── SEGMENTED CATEGORY TABS (Sleek Glassmorphic) ── */}
      <View style={styles.categoryWrap}>
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, category === 'hollywood' && styles.segmentBtnActive]}
            onPress={() => {
              triggerSelectionHaptic();
              setCategory('hollywood');
              if (query) handleStartScrape(query, 'hollywood');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="film-outline" size={13} color={category === 'hollywood' ? '#0A0B0E' : 'rgba(255,255,255,0.6)'} />
            <Text style={[styles.segmentBtnText, category === 'hollywood' && styles.segmentBtnTextActive]}>
              HOLLYWOOD
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, category === 'bollywood' && styles.segmentBtnActive]}
            onPress={() => {
              triggerSelectionHaptic();
              setCategory('bollywood');
              if (query) handleStartScrape(query, 'bollywood');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles-outline" size={13} color={category === 'bollywood' ? '#0A0B0E' : 'rgba(255,255,255,0.6)'} />
            <Text style={[styles.segmentBtnText, category === 'bollywood' && styles.segmentBtnTextActive]}>
              BOLLYWOOD
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SEARCH BAR ── */}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.input}
            placeholder="Search movie or series title..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => handleStartScrape()}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); resetState(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.scrapeBtn}
          onPress={() => handleStartScrape()}
          disabled={isSearching}
          activeOpacity={0.8}
        >
          <Text style={styles.scrapeBtnText}>SCRAPE</Text>
        </TouchableOpacity>
      </View>

      {/* ── PROVIDER TELEMETRY STATUS PILLS ── */}
      {Object.keys(providerStatus).length > 0 && (
        <View style={styles.statusPillsRow}>
          {Object.entries(providerStatus).map(([pKey, pState]) => {
            const pColor = getProviderColor(pKey);
            return (
              <View key={pKey} style={[styles.statusPill, { borderColor: `${pColor}40` }]}>
                <View style={[styles.statusPillDot, { backgroundColor: pColor }]} />
                <Text style={[styles.statusPillText, { color: pColor }]}>
                  {pKey.toUpperCase()} {pState.status === 'loading' ? '⏳' : `(${pState.count})`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── QUALITY FILTER PILLS (480p, 720p, 1080p, 2K, 4K) ── */}
      <View style={styles.qualityRow}>
        {(['480p', '720p', '1080p', '2K', '4K'] as const).map((q) => (
          <TouchableOpacity
            key={q}
            style={[styles.qualityPill, selectedQuality === q && styles.qualityPillActive]}
            onPress={() => { triggerSelectionHaptic(); setSelectedQuality(q); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.qualityPillText, selectedQuality === q && styles.qualityPillTextActive]}>
              {q === '720p' ? '⭐ 720p' : q}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── SERIES MODE & SEASON CONTROLS ── */}
      {isSeries && (
        <View style={styles.seriesRow}>
          <View style={styles.seasonList}>
            {availableSeasons.map((sn) => (
              <TouchableOpacity
                key={`s${sn}`}
                style={[styles.seasonChip, selectedSeason === sn && styles.seasonChipActive]}
                onPress={() => { triggerSelectionHaptic(); setSelectedSeason(sn); }}
              >
                <Text style={[styles.seasonChipText, selectedSeason === sn && styles.seasonChipTextActive]}>
                  S{sn < 10 ? `0${sn}` : sn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modeToggleWrap}>
            {(['SINGLE_EPISODE', 'SEASON_BATCH_ZIP'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.modeToggleBtn, seriesMode === mode && styles.modeToggleBtnActive]}
                onPress={() => { triggerSelectionHaptic(); setSeriesMode(mode); }}
              >
                <Text style={[styles.modeToggleText, seriesMode === mode && styles.modeToggleTextActive]}>
                  {mode === 'SINGLE_EPISODE' ? 'EPISODES' : 'BATCH ZIP'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── MAIN CONTENT SCROLL ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Web Series 3-Column Episode Grid */}
        {isSeries && seriesMode === 'SINGLE_EPISODE' && (
          <View style={styles.episodeSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>
                SEASON {selectedSeason} EPISODES  ·  {selectedQuality.toUpperCase()}
              </Text>
            </View>

            {availableSeriesProviders.length > 1 && (
              <View style={styles.providerSwitcherRow}>
                {availableSeriesProviders.map((sk) => {
                  const provOpt = options.find((o) => o.siteKey === sk);
                  const pColor = getProviderColor(sk);
                  const isActive = activeSeriesProvider === sk;
                  return (
                    <TouchableOpacity
                      key={`prov-pill-${sk}`}
                      style={[
                        styles.provPill,
                        { borderColor: `${pColor}60` },
                        isActive && { backgroundColor: pColor },
                      ]}
                      onPress={() => {
                        triggerSelectionHaptic();
                        setSelectedSeriesProvider(sk);
                      }}
                    >
                      <Text style={[styles.provPillText, isActive ? { color: '#0A0A0C' } : { color: pColor }]}>
                        ⚡ {provOpt?.siteDisplayName || sk.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {episodesLoading ? (
              <ActivityIndicator size="small" color={getProviderColor(activeSeriesProvider || 'vegamovies')} style={{ marginVertical: 24 }} />
            ) : episodesList.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="film-outline" size={24} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptySubText}>No episodes parsed for this quality. Try another provider or quality tier.</Text>
              </View>
            ) : (
              <View style={styles.epGrid}>
                {episodesList.map((ep) => (
                  <TouchableOpacity
                    key={`ep-${ep.episodeNumber}`}
                    style={[styles.epButton, { borderColor: `${getProviderColor(activeSeriesProvider || 'vegamovies')}35` }]}
                    onPress={() => {
                      if (activeSeriesOption) {
                        handleDownload(activeSeriesOption, 'download', ep.targetUrl);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.epBtnText, { color: getProviderColor(activeSeriesProvider || 'vegamovies') }]}>
                      EP {ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Season Batch Zip Cards & Movie Cards */}
        {(!isSeries || seriesMode === 'SEASON_BATCH_ZIP') && (
          filteredOptions.length === 0 && !isSearching && options.length > 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="search-outline" size={28} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No {selectedQuality} options found</Text>
              <Text style={styles.emptySubText}>Select a different quality above</Text>
            </View>
          ) : (
            (() => {
              const groupedMap: Record<string, ScrapedQualityOption[]> = {};
              filteredOptions.forEach((opt) => {
                if (!groupedMap[opt.siteKey]) groupedMap[opt.siteKey] = [];
                groupedMap[opt.siteKey].push(opt);
              });

              return Object.entries(groupedMap).map(([siteKey, groupItems]) => {
                const pColor = getProviderColor(siteKey);
                const displayName = groupItems[0]?.siteDisplayName || siteKey.toUpperCase();
                const isCollapsible = groupItems.length > 3;
                const isCollapsed = isCollapsible && (collapsedProviders[siteKey] !== false);

                return (
                  <View key={`group-${siteKey}`} style={styles.providerGroupWrap}>
                    <TouchableOpacity
                      style={[styles.groupHeader, { borderLeftColor: pColor }]}
                      onPress={() => {
                        if (isCollapsible) {
                          triggerSelectionHaptic();
                          setCollapsedProviders((prev) => ({ ...prev, [siteKey]: !prev[siteKey] }));
                        }
                      }}
                      activeOpacity={isCollapsible ? 0.7 : 1.0}
                    >
                      <View style={styles.groupHeaderLeft}>
                        <View style={[styles.providerDot, { backgroundColor: pColor }]} />
                        <Text style={[styles.groupTitle, { color: pColor }]}>
                          {displayName}
                        </Text>
                        <View style={[styles.countBadge, { backgroundColor: `${pColor}15`, borderColor: `${pColor}40` }]}>
                          <Text style={[styles.countBadgeText, { color: pColor }]}>
                            {groupItems.length} {groupItems.length === 1 ? 'OPTION' : 'OPTIONS'}
                          </Text>
                        </View>
                      </View>
                      {isCollapsible && (
                        <Ionicons
                          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                          size={14}
                          color="rgba(255,255,255,0.4)"
                        />
                      )}
                    </TouchableOpacity>

                    {!isCollapsed && groupItems.map((item) => {
                      const isResolving = resolvingId === item.id;
                      return (
                        <View key={item.id} style={[styles.providerCard, { borderLeftColor: pColor }]}>
                          <View style={styles.cardTopRow}>
                            <Text style={styles.providerName}>⚡ {item.siteDisplayName}</Text>
                            <Text style={[styles.fileSize, { color: pColor }]}>{item.fileSize}</Text>
                          </View>

                          <Text style={styles.metaLine}>
                            {[item.ripFormat, item.codec, item.audioTracks].filter(Boolean).join('  ·  ')}
                          </Text>

                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={[styles.dlBtn, { backgroundColor: pColor }]}
                              onPress={() => handleDownload(item, 'download')}
                              disabled={isResolving}
                              activeOpacity={0.8}
                            >
                              {isResolving ? (
                                <ActivityIndicator size="small" color="#0A0A0C" />
                              ) : (
                                <Text style={styles.dlBtnText}>📥  DOWNLOAD</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.copyBtn, { borderColor: `${pColor}40` }]}
                              onPress={() => handleDownload(item, 'copy')}
                              disabled={isResolving}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.copyBtnText, { color: pColor }]}>🔗  COPY</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              });
            })()
          )
        )}

        {/* ── SMART RAW POSTS EXPLORER (MANUAL OVERRIDE TRAY) ── */}
        {rawCards.length > 0 && (
          <View style={styles.rawExplorerContainer}>
            <TouchableOpacity
              style={styles.rawExplorerHeader}
              onPress={() => {
                triggerSelectionHaptic();
                setRawTrayExpanded((v) => !v);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.rawHeaderLeft}>
                <Ionicons name="sparkles" size={14} color="#00E5FF" />
                <Text style={styles.rawExplorerTitle}>
                  DISCOVERED POSTS ({rawCards.length})
                </Text>
              </View>
              <View style={styles.rawHeaderRight}>
                <Text style={styles.rawToggleText}>{rawTrayExpanded ? 'COLLAPSE' : 'SHOW ALL'}</Text>
                <Ionicons
                  name={rawTrayExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#00E5FF"
                />
              </View>
            </TouchableOpacity>

            {rawTrayExpanded && (
              <View style={styles.rawCardsList}>
                {rawCards.map((card) => {
                  const pColor = getProviderColor(card.siteKey);
                  return (
                    <View key={card.id} style={styles.rawCard}>
                      {card.posterUrl ? (
                        <Image source={{ uri: card.posterUrl }} style={styles.rawPoster} resizeMode="cover" />
                      ) : (
                        <View style={[styles.rawPosterFallback, { borderColor: `${pColor}30` }]}>
                          <Ionicons name="film-outline" size={18} color={pColor} />
                        </View>
                      )}
                      <View style={styles.rawCardDetails}>
                        <View style={styles.rawCardBadgeRow}>
                          <View style={[styles.rawSiteBadge, { backgroundColor: `${pColor}15`, borderColor: `${pColor}50` }]}>
                            <Text style={[styles.rawSiteBadgeText, { color: pColor }]}>{card.siteDisplayName}</Text>
                          </View>
                          {card.seasonTags && card.seasonTags.length > 0 && (
                            <View style={styles.rawSeasonBadge}>
                              <Text style={styles.rawSeasonBadgeText}>
                                {card.seasonTags.length > 1 ? `S${card.seasonTags[0]}-${card.seasonTags[card.seasonTags.length - 1]}` : `S${card.seasonTags[0]}`}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.rawCardTitle} numberOfLines={2}>{card.title}</Text>
                        <TouchableOpacity
                          style={[styles.rawScrapeBtn, { backgroundColor: pColor }]}
                          onPress={() => handleManualScrapeArticle(card)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.rawScrapeBtnText}>⚡ SCRAPE THIS POST</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Empty State */}
        {!isSearching && options.length === 0 && rawCards.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="cloud-download-outline" size={32} color="rgba(255,255,255,0.2)" />
            </View>
            <Text style={styles.emptyStateTitle}>Terminal Ready</Text>
            <Text style={styles.emptyStateSub}>Search any title above to extract direct links</Text>
          </View>
        )}

        {/* Scraper Logs */}
        {statusLog.length > 0 && (
          <View style={styles.logBox}>
            <TouchableOpacity
              style={styles.logHeader}
              onPress={() => setLogsExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={styles.logHeaderLeft}>
                <Ionicons name="terminal-outline" size={12} color="#00E5FF" />
                <Text style={styles.logTitle}>SCRAPER LOGS</Text>
              </View>
              <Ionicons
                name={logsExpanded ? 'chevron-up' : 'chevron-down'}
                size={12}
                color="rgba(255,255,255,0.3)"
              />
            </TouchableOpacity>
            {logsExpanded ? (
              statusLog.map((line, i) => (
                <Text key={i} style={styles.logLine}>{line}</Text>
              ))
            ) : (
              statusLog.slice(0, 3).map((line, i) => (
                <Text key={i} style={styles.logLine}>{line}</Text>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,215,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  categoryWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#FFD700',
  },
  segmentBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  segmentBtnTextActive: {
    color: '#0A0B0E',
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    paddingVertical: 8,
  },
  scrapeBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrapeBtnText: {
    color: '#0A0B0E',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  statusPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  qualityRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
  },
  qualityPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  qualityPillActive: {
    borderColor: '#FFD700',
    backgroundColor: '#FFD700',
  },
  qualityPillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
  },
  qualityPillTextActive: {
    color: '#0A0B0E',
    fontWeight: '800',
  },
  seriesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seasonList: {
    flexDirection: 'row',
    gap: 5,
  },
  seasonChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  seasonChipActive: {
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0,229,255,0.15)',
  },
  seasonChipText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
  },
  seasonChipTextActive: {
    color: '#00E5FF',
    fontWeight: '800',
  },
  modeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modeToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  modeToggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  modeToggleText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
  },
  modeToggleTextActive: {
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 40,
  },
  episodeSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    marginBottom: 8,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  providerSwitcherRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  provPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  provPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  epGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  epButton: {
    width: (SCREEN_WIDTH - 32 - 12) / 3,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  epBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  providerGroupWrap: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginBottom: 6,
    borderRadius: 4,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  providerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  countBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 8,
    fontWeight: '700',
  },
  providerCard: {
    backgroundColor: '#0F1116',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  providerName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  fileSize: {
    fontSize: 12,
    fontWeight: '800',
  },
  metaLine: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dlBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  dlBtnText: {
    color: '#0A0B0E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  copyBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  copyBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rawExplorerContainer: {
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    backgroundColor: '#0A0E14',
    overflow: 'hidden',
  },
  rawExplorerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  rawHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rawExplorerTitle: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  rawHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rawToggleText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
  },
  rawCardsList: {
    padding: 10,
    gap: 8,
  },
  rawCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#0F141D',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rawPoster: {
    width: 44,
    height: 66,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rawPosterFallback: {
    width: 44,
    height: 66,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  rawCardDetails: {
    flex: 1,
    justifyContent: 'space-between',
  },
  rawCardBadgeRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    marginBottom: 2,
  },
  rawSiteBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  rawSiteBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  rawSeasonBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rawSeasonBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  rawCardTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginBottom: 4,
  },
  rawScrapeBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  rawScrapeBtnText: {
    color: '#0A0B0E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 6,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyStateTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyStateSub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptySubText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  logBox: {
    marginTop: 16,
    backgroundColor: '#050608',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  logTitle: {
    color: '#00E5FF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  logLine: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontFamily: 'monospace',
    lineHeight: 13,
  },
});
