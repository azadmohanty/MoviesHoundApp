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
  BackHandler,
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
  vegamovies: '#FFE500', // Yellow
  rogmovies: '#FFE500',  // Yellow
  moviesmod: '#00E5FF',  // Cyan
  topmovies: '#00E5FF',  // Cyan
  fzmovies: '#00FF66',   // Matrix Green
  bollyflix: '#FF0055',  // Neon Magenta
};

function getProviderColor(siteKey?: string): string {
  if (!siteKey) return '#FFE500';
  return PROVIDER_COLORS[siteKey.toLowerCase()] || '#FFE500';
}

interface CachedSearchResult {
  rawCards: SearchArticleCard[];
  options: ScrapedQualityOption[];
  activeCard: SearchArticleCard | null;
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

  // 2-Layer State
  const [rawCards, setRawCards] = useState<SearchArticleCard[]>([]);
  const [activeArticle, setActiveArticle] = useState<SearchArticleCard | null>(null);
  const [options, setOptions] = useState<ScrapedQualityOption[]>([]);

  // Quality & Series Filter State
  const [selectedQuality, setSelectedQuality] = useState<'480p' | '720p' | '1080p' | '2K' | '4K'>('720p');
  const [seriesMode, setSeriesMode] = useState<'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP'>('SINGLE_EPISODE');
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Web Series Episode State
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesList, setEpisodesList] = useState<SeriesEpisodeItem[]>([]);

  const prevTriggerRef = useRef(0);

  // ───────────────────────────────────────────────────────────────────────────
  // ANDROID HARDWARE BACK BUTTON (LIFO BACK STACK)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onBackPress = () => {
      // 1. If in Layer 2 (Viewing specific post links) -> Return to Layer 1 (Discovered Posts)
      if (activeArticle) {
        triggerSelectionHaptic();
        setActiveArticle(null);
        return true;
      }
      // 2. If in Layer 1 with active search results -> Clear search
      if (rawCards.length > 0) {
        triggerSelectionHaptic();
        resetState();
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [activeArticle, rawCards]);

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
    setRawCards([]);
    setActiveArticle(null);
    setOptions([]);
    setEpisodesList([]);
    setStatusLog([]);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // LAYER 1: DISCOVER CANDIDATE POSTS
  // ───────────────────────────────────────────────────────────────────────────
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

    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 15) {
      setRawCards(cached.rawCards);
      setOptions(cached.options);
      setActiveArticle(cached.activeCard);
      addLog(`Loaded cached results for "${cleanQ}" (0ms).`);
      return;
    }

    triggerLightHaptic();
    setIsSearching(true);
    resetState();
    addLog(`Searching ${activeCat.toUpperCase()} for "${cleanQ}"...`);

    try {
      const [disabledJson, timeoutStr] = await Promise.all([
        getStorageString('@disabled_providers', '[]'),
        getStorageString('@scraper_timeout', '7000'),
      ]);

      let disabledList: string[] = [];
      try { disabledList = JSON.parse(disabledJson || '[]'); } catch (e) {}
      const timeoutMs = parseInt(timeoutStr || '7000', 10) || 7000;

      const liveDomains = await resolveAllDomains((msg) => addLog(msg));

      const createController = () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), timeoutMs);
        return controller.signal;
      };

      const rawPromises: Promise<SearchArticleCard[]>[] = [];

      if (activeCat === 'hollywood') {
        const vegaDomain = liveDomains.vegamovies || HARDCODED_FALLBACKS.vegamovies;
        const moviesModDomain = liveDomains.moviesmod || 'https://moviesmod.zone';

        if (!disabledList.includes('vegamovies')) {
          rawPromises.push(searchVegaMoviesRawCards(cleanQ, vegaDomain, createController()));
        }
        if (!disabledList.includes('moviesmod')) {
          rawPromises.push(searchMoviesModRawCards(cleanQ, moviesModDomain, createController()));
        }
      }

      const results = await Promise.allSettled(rawPromises);
      const allCards: SearchArticleCard[] = [];

      results.forEach((res) => {
        if (res.status === 'fulfilled') allCards.push(...res.value);
      });

      // Sort by confidence score
      allCards.sort((a, b) => b.confidenceScore - a.confidenceScore);
      setRawCards(allCards);
      addLog(`Discovered ${allCards.length} matching posts across providers.`);

      // ───────────────────────────────────────────────────────────────────────
      // GOLDEN HIT FAST-PATH: If 100% Golden IMDb Match or High Confidence -> Auto-Expand Layer 2!
      // ───────────────────────────────────────────────────────────────────────
      if (allCards.length > 0) {
        const cleanImdb = initialImdbId ? initialImdbId.trim().toLowerCase().match(/tt\d{7,8}/)?.[0] : null;
        let goldenHit: SearchArticleCard | null = null;

        if (cleanImdb) {
          goldenHit = allCards.find((c) => c.title.toLowerCase().includes(cleanImdb)) || null;
        }
        if (!goldenHit && allCards[0].confidenceScore >= 85) {
          goldenHit = allCards[0];
        }

        if (goldenHit) {
          addLog(`Golden Match: Auto-opening "${goldenHit.title.slice(0, 50)}..."`);
          handleSelectArticle(goldenHit, allCards);
          return;
        }
      }

      IN_MEMORY_CACHE.set(cacheKey, {
        rawCards: allCards,
        options: [],
        activeCard: null,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      addLog(`Search Error: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // LAYER 2: PARSE SELECTED ARTICLE
  // ───────────────────────────────────────────────────────────────────────────
  const handleSelectArticle = async (card: SearchArticleCard, existingCards?: SearchArticleCard[]) => {
    triggerSelectionHaptic();
    setIsSearching(true);
    setActiveArticle(card);
    setOptions([]);
    setEpisodesList([]);
    addLog(`Ingesting: "${card.title}" (${card.siteDisplayName})...`);

    try {
      const res = await fetch(card.permalink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = await res.text();

      let parsed: ScrapedQualityOption[] = [];
      if (card.siteKey === 'vegamovies') {
        parsed = parseVegaMoviesArticle(html, card.permalink);
      } else if (card.siteKey === 'moviesmod') {
        parsed = parseMoviesModArticle(html, card.permalink, 'MOVIESMOD');
      }

      if (parsed.length > 0) {
        triggerSuccessHaptic();
        setOptions(parsed);
        addLog(`Extracted ${parsed.length} options from article.`);

        const cleanQ = sanitizeSearchQuery(query);
        if (cleanQ) {
          IN_MEMORY_CACHE.set(`${category}:${cleanQ.toLowerCase()}`, {
            rawCards: existingCards || rawCards,
            options: parsed,
            activeCard: card,
            timestamp: Date.now(),
          });
        }
      } else {
        Alert.alert('No Links Found', 'Could not find active download sections on this specific post.');
      }
    } catch (e: any) {
      addLog(`Article Ingest Error: ${e.message}`);
      Alert.alert('Ingest Error', e.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Check if article is series
  const isSeries = options.some((o) => o.contentType === 'SINGLE_EPISODE' || o.contentType === 'SEASON_BATCH_ZIP');
  
  // Clean available seasons (1 to 99)
  const availableSeasons = Array.from(
    new Set(options.map((o) => o.seasonNumber || 1).filter((s) => s >= 1 && s <= 99))
  ).sort((a, b) => a - b);

  useEffect(() => {
    if (availableSeasons.length > 0 && !availableSeasons.includes(selectedSeason)) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [options, availableSeasons]);

  // Robust case-insensitive quality matching
  const filteredOptions = options.filter((opt) => {
    const optQ = (opt.qualityLabel || '').toLowerCase();
    const selQ = selectedQuality.toLowerCase();
    if (optQ !== selQ) return false;

    if (!isSeries || opt.contentType === 'MOVIE') return true;
    if (opt.seasonNumber !== selectedSeason) return false;
    return opt.contentType === seriesMode;
  });

  const activeSeriesOption = options.find((opt) => {
    const optQ = (opt.qualityLabel || '').toLowerCase();
    const selQ = selectedQuality.toLowerCase();
    return optQ === selQ && opt.contentType === 'SINGLE_EPISODE' && opt.seasonNumber === selectedSeason;
  }) || options.find((opt) => opt.contentType === 'SINGLE_EPISODE' && opt.seasonNumber === selectedSeason) || filteredOptions[0];

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

    if (item.siteKey === 'vegamovies' || item.siteKey === 'rogmovies' || targetUrl.includes('vcloud') || targetUrl.includes('v-cloud') || targetUrl.includes('nexdrive')) {
      setResolvingId(item.id);
      addLog(`Unlocking server page for ${item.siteDisplayName}...`);
      const unlockedUrl = item.siteKey === 'rogmovies'
        ? await resolveRogMoviesUnlockedPage(targetUrl)
        : await resolveVegaMoviesUnlockedPage(targetUrl);
      setResolvingId(null);

      if (action === 'download' || action === 'stream') {
        triggerSuccessHaptic();
        addLog('Unlocked page ready');
        saveDownloadItem({
          id: item.id || unlockedUrl,
          title: activeArticle?.title || query || 'Downloaded File',
          posterUrl: activeArticle?.posterUrl || '',
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
    addLog(`Resolving download link for ${item.siteDisplayName}...`);

    let res: ResolvedStreamResult = {
      success: false,
      providerName: item.siteDisplayName,
      qualityLabel: item.qualityLabel,
    };

    if (item.siteKey === 'moviesmod') res = await resolveMoviesModLocker(targetUrl, item.qualityLabel);
    else if (item.siteKey === 'topmovies') res = await resolveTopMoviesLocker(targetUrl, item.qualityLabel);
    else if (item.siteKey === 'bollyflix') res = await resolveBollyflixLocker(targetUrl, item.qualityLabel);

    setResolvingId(null);

    if (res.success && res.streamUrl) {
      triggerSuccessHaptic();
      addLog(`Resolved: ${res.providerName}`);
      if (action === 'download' || action === 'stream') {
        saveDownloadItem({
          id: item.id || res.streamUrl,
          title: activeArticle?.title || query || 'Downloaded File',
          posterUrl: activeArticle?.posterUrl || '',
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
          <Ionicons name="download-outline" size={16} color="#FFE500" />
          <Text style={styles.headerTitle}>DOWNLOADER TERMINAL</Text>
        </View>
        {isSearching && <ActivityIndicator size="small" color="#FFE500" />}
      </View>

      {/* ── SEGMENTED CATEGORY TABS ── */}
      <View style={styles.categoryRow}>
        <TouchableOpacity
          style={[styles.categoryBtn, category === 'hollywood' && styles.categoryBtnActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setCategory('hollywood');
            if (query) handleStartScrape(query, 'hollywood');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.categoryBtnText, category === 'hollywood' && styles.categoryBtnTextActive]}>
            HOLLYWOOD
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.categoryBtn, category === 'bollywood' && styles.categoryBtnActive]}
          onPress={() => {
            triggerSelectionHaptic();
            setCategory('bollywood');
            if (query) handleStartScrape(query, 'bollywood');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.categoryBtnText, category === 'bollywood' && styles.categoryBtnTextActive]}>
            BOLLYWOOD
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── SEARCH BAR ── */}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={15} color="rgba(255,255,255,0.4)" />
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
              <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.scrapeBtn}
          onPress={() => handleStartScrape()}
          disabled={isSearching}
          activeOpacity={0.8}
        >
          <Text style={styles.scrapeBtnText}>SEARCH</Text>
        </TouchableOpacity>
      </View>

      {/* ── MAIN SCROLL AREA ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ────────────────────────────────────────────────────────────────── */}
        {/* LAYER 1: DISCOVERED POSTS FEED (When No Article Selected)         */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {!activeArticle && rawCards.length > 0 && (
          <View style={styles.cardsFeedSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>DISCOVERED POSTS ({rawCards.length})</Text>
            </View>

            {rawCards.map((card) => {
              const pColor = getProviderColor(card.siteKey);
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.articleCard, { borderLeftColor: pColor }]}
                  onPress={() => handleSelectArticle(card)}
                  activeOpacity={0.7}
                >
                  {card.posterUrl ? (
                    <Image source={{ uri: card.posterUrl }} style={styles.cardPoster} resizeMode="cover" />
                  ) : (
                    <View style={[styles.cardPosterFallback, { borderColor: `${pColor}40` }]}>
                      <Ionicons name="film-outline" size={18} color={pColor} />
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardTagRow}>
                      <View style={[styles.siteTag, { backgroundColor: `${pColor}15`, borderColor: `${pColor}50` }]}>
                        <Text style={[styles.siteTagText, { color: pColor }]}>{card.siteDisplayName}</Text>
                      </View>
                      {card.seasonTags && card.seasonTags.length > 0 && (
                        <View style={styles.seasonTag}>
                          <Text style={styles.seasonTagText}>
                            {card.seasonTags.length > 1 ? `S${card.seasonTags[0]}-${card.seasonTags[card.seasonTags.length - 1]}` : `S${card.seasonTags[0]}`}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
                    <View style={styles.cardBottomAction}>
                      <Text style={[styles.tapHintText, { color: pColor }]}>VIEW DOWNLOAD OPTIONS →</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* LAYER 2: QUALITY & EPISODE TERMINAL (When Article is Active)     */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {activeArticle && (
          <View style={styles.detailConsole}>
            {/* Back to Results Return Pill */}
            {rawCards.length > 0 && (
              <TouchableOpacity
                style={styles.backToResultsBtn}
                onPress={() => {
                  triggerSelectionHaptic();
                  setActiveArticle(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={13} color="#00E5FF" />
                <Text style={styles.backToResultsText}>
                  ALL RESULTS ({rawCards.length})
                </Text>
              </TouchableOpacity>
            )}

            {/* Active Post Summary Banner */}
            <View style={[styles.activeBanner, { borderLeftColor: getProviderColor(activeArticle.siteKey) }]}>
              <Text style={styles.activeBannerSite}>{activeArticle.siteDisplayName}</Text>
              <Text style={styles.activeBannerTitle} numberOfLines={2}>{activeArticle.title}</Text>
            </View>

            {/* Quality Filter Pills */}
            <View style={styles.qualityRow}>
              {(['480p', '720p', '1080p', '2K', '4K'] as const).map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.qualityPill, selectedQuality.toLowerCase() === q.toLowerCase() && styles.qualityPillActive]}
                  onPress={() => { triggerSelectionHaptic(); setSelectedQuality(q); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.qualityPillText, selectedQuality.toLowerCase() === q.toLowerCase() && styles.qualityPillTextActive]}>
                    {q}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Series Mode & Season Controls */}
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

            {/* 3-Column Episode Grid */}
            {isSeries && seriesMode === 'SINGLE_EPISODE' && (
              <View style={styles.episodeSection}>
                <Text style={styles.sectionLabel}>
                  SEASON {selectedSeason} EPISODES · {selectedQuality.toUpperCase()}
                </Text>

                {episodesLoading ? (
                  <ActivityIndicator size="small" color={getProviderColor(activeArticle.siteKey)} style={{ marginVertical: 20 }} />
                ) : episodesList.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptySubText}>No episodes parsed for this quality tier.</Text>
                  </View>
                ) : (
                  <View style={styles.epGrid}>
                    {episodesList.map((ep) => (
                      <TouchableOpacity
                        key={`ep-${ep.episodeNumber}`}
                        style={[styles.epButton, { borderColor: `${getProviderColor(activeArticle.siteKey)}40` }]}
                        onPress={() => {
                          if (activeSeriesOption) {
                            handleDownload(activeSeriesOption, 'download', ep.targetUrl);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.epBtnText, { color: getProviderColor(activeArticle.siteKey) }]}>
                          EP {ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Movie & Batch Zip Option Cards */}
            {(!isSeries || seriesMode === 'SEASON_BATCH_ZIP') && (
              filteredOptions.length === 0 && !isSearching ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No {selectedQuality} options found</Text>
                  <Text style={styles.emptySubText}>Try a different quality tier above</Text>
                </View>
              ) : (
                filteredOptions.map((item) => {
                  const pColor = getProviderColor(item.siteKey);
                  const isResolving = resolvingId === item.id;
                  return (
                    <View key={item.id} style={[styles.providerCard, { borderLeftColor: pColor }]}>
                      <View style={styles.cardTopRow}>
                        <Text style={styles.providerName}>{item.siteDisplayName}</Text>
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
                            <Text style={styles.dlBtnText}>DOWNLOAD</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.copyBtn, { borderColor: `${pColor}40` }]}
                          onPress={() => handleDownload(item, 'copy')}
                          disabled={isResolving}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.copyBtnText, { color: pColor }]}>COPY LINK</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )
            )}
          </View>
        )}

        {/* Initial Empty State */}
        {!isSearching && rawCards.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-download-outline" size={36} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyStateTitle}>Downloader Terminal Ready</Text>
            <Text style={styles.emptyStateSub}>Search any title above to extract download options</Text>
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
    backgroundColor: '#0A0A0C',
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
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  categoryBtnActive: {
    borderColor: '#FFE500',
    backgroundColor: '#FFE500',
  },
  categoryBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  categoryBtnTextActive: {
    color: '#0A0A0C',
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
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
    backgroundColor: '#FFE500',
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrapeBtnText: {
    color: '#0A0A0C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 40,
  },
  cardsFeedSection: {
    gap: 8,
  },
  sectionHeaderRow: {
    marginBottom: 6,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  articleCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#121216',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPoster: {
    width: 50,
    height: 75,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cardPosterFallback: {
    width: 50,
    height: 75,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cardTagRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  siteTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  siteTagText: {
    fontSize: 8,
    fontWeight: '800',
  },
  seasonTag: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  seasonTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginVertical: 4,
  },
  cardBottomAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  detailConsole: {
    gap: 10,
  },
  backToResultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderColor: 'rgba(0,229,255,0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 4,
  },
  backToResultsText: {
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeBanner: {
    backgroundColor: '#121216',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  activeBannerSite: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  activeBannerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 6,
  },
  qualityPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  qualityPillActive: {
    borderColor: '#FFE500',
    backgroundColor: '#FFE500',
  },
  qualityPillText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
  },
  qualityPillTextActive: {
    color: '#0A0A0C',
    fontWeight: '800',
  },
  seriesRow: {
    flexDirection: 'row',
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
    borderRadius: 5,
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
    borderRadius: 5,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modeToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
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
  episodeSection: {
    gap: 8,
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
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  epBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  providerCard: {
    backgroundColor: '#121216',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    color: '#0A0A0C',
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
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 6,
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
    backgroundColor: '#08080A',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
