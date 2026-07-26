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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDeviceTopInset } from '../utils/SafeAreaCache';
import { triggerLightHaptic, triggerSelectionHaptic, triggerSuccessHaptic } from '../utils/HapticsHelper';
import { resolveAllDomains } from '../utils/resolver';
import { resolveFzMoviesStream } from '../utils/fzmoviesResolver';
import { sanitizeSearchQuery } from '../utils/FuzzyMatcher';
import { getStorageString } from '../utils/DatabaseStorage';

// Shared models & site resolvers
import { ScrapedQualityOption, ResolvedStreamResult } from '../utils/resolverTypes';
import {
  getVegaMoviesQualityOptions,
  resolveVegaMoviesLocker,
  fetchVegaMoviesEpisodes,
  resolveVegaMoviesUnlockedPage,
  SeriesEpisodeItem,
} from '../utils/vegamoviesResolver';
import {
  getRogMoviesQualityOptions,
  resolveRogMoviesLocker,
  fetchRogMoviesEpisodes,
  resolveRogMoviesUnlockedPage,
} from '../utils/rogmoviesResolver';
import {
  getMoviesModQualityOptions,
  resolveMoviesModLocker,
  fetchMoviesModEpisodes,
} from '../utils/moviesmodResolver';
import {
  getTopMoviesQualityOptions,
  resolveTopMoviesLocker,
  fetchTopMoviesEpisodes,
} from '../utils/topmoviesResolver';
import { searchBollyflix, parseBollyflixArticle, resolveBollyflixLocker } from '../utils/bollyflixResolver';
import { HARDCODED_FALLBACKS } from '../utils/resolver';

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
  vegamovies: '#FFE500', // Yellow (VegaMovies / RogMovies twin family)
  rogmovies: '#FFE500',  // Yellow (VegaMovies / RogMovies twin family)
  moviesmod: '#00E5FF',  // Cyan (MoviesMod / TopMovies twin family)
  topmovies: '#00E5FF',  // Cyan (MoviesMod / TopMovies twin family)
  fzmovies: '#00FF66',   // Matrix Green
  bollyflix: '#FF0055',  // Neon Magenta
};

function getProviderColor(siteKey?: string): string {
  if (!siteKey) return '#FFE500';
  return PROVIDER_COLORS[siteKey.toLowerCase()] || '#FFE500';
}

export default function DownloaderScreen({
  initialSearchQuery = '',
  initialImdbId = '',
  initialYear,
  initialMediaType = 'movie',
  initialIsBollywood = false,
  searchTrigger = 0,
}: DownloaderScreenProps) {
  const [query, setQuery] = useState(initialSearchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(false);

  // Filter & Grouping States
  const [selectedQuality, setSelectedQuality] = useState<'480p' | '720p' | '1080p' | '4K'>('720p');
  const [seriesMode, setSeriesMode] = useState<'SINGLE_EPISODE' | 'SEASON_BATCH_ZIP'>('SINGLE_EPISODE');
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({});
  const [selectedSeriesProvider, setSelectedSeriesProvider] = useState<ScrapedQualityOption['siteKey'] | null>(null);

  // Unified Extracted Options List
  const [options, setOptions] = useState<ScrapedQualityOption[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Web Series Episode Sub-Scraper State
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesList, setEpisodesList] = useState<SeriesEpisodeItem[]>([]);
  const [selectedEpUrl, setSelectedEpUrl] = useState<string | null>(null);

  const prevTriggerRef = useRef(0);

  // React to new queries pushed from HomeScreen via searchTrigger
  useEffect(() => {
    if (searchTrigger > 0 && searchTrigger !== prevTriggerRef.current && initialSearchQuery) {
      prevTriggerRef.current = searchTrigger;
      setQuery(initialSearchQuery);
      handleStartScrape(initialSearchQuery);
    }
  }, [searchTrigger]);

  // Initial mount auto-search & default quality preference load
  useEffect(() => {
    getStorageString('@default_quality', '720p').then((q) => {
      if (q && ['480p', '720p', '1080p', '4K'].includes(q)) {
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
    setEpisodesList([]);
    setStatusLog([]);
  };

  const handleStartScrape = async (overrideQuery?: string) => {
    const activeQ = overrideQuery || query;
    const cleanQ = sanitizeSearchQuery(activeQ);
    if (!cleanQ) {
      Alert.alert('Search Required', 'Please enter a title to search.');
      return;
    }

    triggerLightHaptic();
    setIsSearching(true);
    resetState();
    addLog(`Searching options for "${cleanQ}"...`);

    if (cleanQ.toLowerCase() === 'silo') {
      addLog('Hardcoded demo fallback triggered');
      fetch('https://raw.githubusercontent.com/azadmohanty/MoviesHoundApp/main/demo_silo.json')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setOptions(data);
            addLog(`Loaded ${data.length} fallback options.`);
          }
        })
        .catch(() => {});
    }

    try {
      const [disabledJson, timeoutStr] = await Promise.all([
        getStorageString('@disabled_providers', '[]'),
        getStorageString('@scraper_timeout', '6000'),
      ]);

      let disabledList: string[] = [];
      try { disabledList = JSON.parse(disabledJson || '[]'); } catch (e) {}
      const timeoutMs = parseInt(timeoutStr || '6000', 10) || 6000;

      // FzMovies direct MP4 fast lane
      if (initialMediaType === 'movie' && !disabledList.includes('fzmovies')) {
        resolveFzMoviesStream(cleanQ)
          .then((fzRes) => {
            if (fzRes && fzRes.url) {
              addLog('FzMovies: direct MP4 URL found');
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

      if (initialIsBollywood) {
        const rogDomain = liveDomains.rogmovies || HARDCODED_FALLBACKS.rogmovies;
        const topDomain = liveDomains.topmovies || 'https://moviesleech.asia';

        if (!disabledList.includes('rogmovies')) {
          addLog(`Executing RogMovies (Bollywood) search on ${rogDomain}...`);
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
            )
          );
        }

        if (!disabledList.includes('topmovies')) {
          addLog(`Executing TopMovies (Bollywood) search on ${topDomain}...`);
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
            )
          );
        }
      } else {
        const vegaDomain = liveDomains.vegamovies || HARDCODED_FALLBACKS.vegamovies;
        const moviesModDomain = liveDomains.moviesmod || 'https://moviesmod.at';

        if (!disabledList.includes('vegamovies')) {
          addLog(`Executing VegaMovies (Hollywood) search on ${vegaDomain}...`);
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
            )
          );
        }

        if (!disabledList.includes('moviesmod')) {
          addLog(`Executing MoviesMod (Hollywood) search on ${moviesModDomain}...`);
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
            )
          );
        }
      }

      const results = await Promise.allSettled(scraperPromises);

      const allExtractedOptions: ScrapedQualityOption[] = [];
      results.forEach((res) => {
        if (res.status === 'fulfilled') {
          allExtractedOptions.push(...res.value);
        }
      });

      const optionMap = new Map<string, ScrapedQualityOption>();
      allExtractedOptions.forEach((o) => optionMap.set(o.targetUrl, o));
      const sortedOptions = Array.from(optionMap.values()).sort((a, b) => a.priorityScore - b.priorityScore);

      setOptions(sortedOptions);
      addLog(`Total quality options available: ${sortedOptions.length}`);
    } catch (err: any) {
      addLog(`Scrape Error: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const isSeries = options.some((o) => o.contentType !== 'MOVIE');
  const availableSeasons = Array.from(new Set(options.map((o) => o.seasonNumber || 1))).sort((a, b) => a - b);

  // Auto-sync selectedSeason state to first available season if not present
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

  // Extract available series providers for current season & quality
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

  // Auto-fetch episodes when series mode is SINGLE_EPISODE
  useEffect(() => {
    if (isSeries && seriesMode === 'SINGLE_EPISODE' && activeSeriesOption) {
      setEpisodesLoading(true);
      addLog(`Fetching episode list for Season ${selectedSeason} (${selectedQuality}) via ${activeSeriesOption.siteDisplayName}...`);

      let epFetcher = fetchVegaMoviesEpisodes;
      if (activeSeriesOption.siteKey === 'rogmovies') epFetcher = fetchRogMoviesEpisodes;
      else if (activeSeriesOption.siteKey === 'moviesmod') epFetcher = fetchMoviesModEpisodes;
      else if (activeSeriesOption.siteKey === 'topmovies') epFetcher = fetchTopMoviesEpisodes;

      epFetcher(activeSeriesOption.targetUrl)
        .then((epList) => {
          setEpisodesList(epList);
          addLog(`Extracted ${epList.length} episodes`);
        })
        .finally(() => setEpisodesLoading(false));
    }
  }, [isSeries, seriesMode, selectedSeason, selectedQuality, activeSeriesOption?.targetUrl]);

  const handleDownload = async (item: ScrapedQualityOption, action: 'download' | 'copy', customUrl?: string) => {
    triggerSelectionHaptic();

    const targetUrl = customUrl || item.targetUrl;

    if (item.siteKey === 'fzmovies' || item.siteKey === 'moviebox') {
      if (action === 'download') {
        Linking.openURL(targetUrl).catch(() => Alert.alert('Error', 'Could not open download URL.'));
      } else {
        Alert.alert('Download Link', targetUrl);
      }
      return;
    }

    if (item.siteKey === 'vegamovies' || item.siteKey === 'rogmovies' || targetUrl.includes('vcloud') || targetUrl.includes('v-cloud')) {
      setResolvingId(item.id);
      addLog(`Unlocking VCloud server page for ${item.siteDisplayName}...`);
      const unlockedUrl = item.siteKey === 'rogmovies'
        ? await resolveRogMoviesUnlockedPage(targetUrl)
        : await resolveVegaMoviesUnlockedPage(targetUrl);
      setResolvingId(null);
      if (action === 'download') {
        triggerSuccessHaptic();
        addLog('Unlocked VCloud page ready');
        Linking.openURL(unlockedUrl).catch(() => Alert.alert('Error', 'Could not open download URL.'));
      } else {
        Alert.alert('Unlocked VCloud Server Link', unlockedUrl);
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
      if (action === 'download') {
        Linking.openURL(res.streamUrl).catch(() => Alert.alert('Error', 'Could not open download URL.'));
      } else {
        Alert.alert('Direct Download Link', res.streamUrl);
      }
    } else {
      addLog(`Failed: ${res.message || 'Locker offline'}`);
      Alert.alert('Resolution Failed', res.message || 'Could not extract download URL. Locker may be offline.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: getDeviceTopInset() }]}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="download-outline" size={18} color="#FFE500" />
          <Text style={styles.headerTitle}>DOWNLOADER TERMINAL</Text>
        </View>
        {isSearching && <ActivityIndicator size="small" color="#FFE500" />}
      </View>

      {/* ── SEARCH BAR ── */}
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.35)" />
          <TextInput
            style={styles.input}
            placeholder="Movie or series title..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => handleStartScrape()}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); resetState(); }}>
              <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.scrapeBtn}
          onPress={() => handleStartScrape()}
          disabled={isSearching}
        >
          <Text style={styles.scrapeBtnText}>SCRAPE</Text>
        </TouchableOpacity>
      </View>

      {/* ── QUALITY PILLS (always visible) ── */}
      <View style={styles.qualityRow}>
        {(['480p', '720p', '1080p', '4K'] as const).map((q) => (
          <TouchableOpacity
            key={q}
            style={[styles.qualityPill, selectedQuality === q && styles.qualityPillActive]}
            onPress={() => { triggerSelectionHaptic(); setSelectedQuality(q); }}
          >
            <Text style={[styles.qualityPillText, selectedQuality === q && styles.qualityPillTextActive]}>
              {q}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── SERIES MODE TOGGLE (only if series) ── */}
      {isSeries && (
        <View style={styles.seriesRow}>
          {availableSeasons.length > 0 && availableSeasons.map((sn) => (
            <TouchableOpacity
              key={`s${sn}`}
              style={[styles.modePill, selectedSeason === sn && styles.modePillActive]}
              onPress={() => { triggerSelectionHaptic(); setSelectedSeason(sn); }}
            >
              <Text style={[styles.modePillText, selectedSeason === sn && styles.modePillTextActive]}>
                S{sn}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.divider} />
          {(['SINGLE_EPISODE', 'SEASON_BATCH_ZIP'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.modePill, seriesMode === mode && styles.modePillActive]}
              onPress={() => { triggerSelectionHaptic(); setSeriesMode(mode); }}
            >
              <Text style={[styles.modePillText, seriesMode === mode && styles.modePillTextActive]}>
                {mode === 'SINGLE_EPISODE' ? 'EPISODES' : 'BATCH ZIP'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── MAIN SCROLL AREA ── */}
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
                {activeSeriesOption ? `  ·  ${activeSeriesOption.siteDisplayName}` : ''}
              </Text>
            </View>

            {/* Provider Switcher Pills if > 1 provider offers series links */}
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
                        { borderColor: pColor },
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
              <ActivityIndicator size="small" color={getProviderColor(activeSeriesProvider || 'vegamovies')} style={{ marginVertical: 20 }} />
            ) : episodesList.length === 0 ? (
              <Text style={styles.emptySubText}>No episodes found for this season</Text>
            ) : (
              <View style={styles.epGrid}>
                {episodesList.map((ep) => (
                  <TouchableOpacity
                    key={`ep-${ep.episodeNumber}`}
                    style={[styles.epButton, { borderColor: `${getProviderColor(activeSeriesProvider || 'vegamovies')}40` }]}
                    onPress={() => {
                      if (activeSeriesOption) {
                        handleDownload(activeSeriesOption, 'download', ep.targetUrl);
                      }
                    }}
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
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={36} color="rgba(255,255,255,0.12)" />
              <Text style={styles.emptyText}>No {selectedQuality} options found</Text>
              <Text style={styles.emptySubText}>Try a different quality tier above</Text>
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
                    {/* Group Header Bar */}
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
                        <View style={[styles.countBadge, { backgroundColor: `${pColor}20`, borderColor: `${pColor}50` }]}>
                          <Text style={[styles.countBadgeText, { color: pColor }]}>
                            {groupItems.length} {groupItems.length === 1 ? 'OPTION' : 'OPTIONS'}
                          </Text>
                        </View>
                      </View>
                      {isCollapsible && (
                        <View style={styles.groupHeaderRight}>
                          <Text style={[styles.collapseHintText, { color: pColor }]}>
                            {isCollapsed ? 'EXPAND' : 'COLLAPSE'}
                          </Text>
                          <Ionicons
                            name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                            size={14}
                            color={pColor}
                          />
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Cards (rendered if not collapsed) */}
                    {!isCollapsed && groupItems.map((item) => {
                      const isResolving = resolvingId === item.id;
                      return (
                        <View key={item.id} style={[styles.providerCard, { borderLeftColor: pColor }]}>
                          {/* Top Row: provider name + file size */}
                          <View style={styles.cardTopRow}>
                            <Text style={styles.providerName}>⚡ {item.siteDisplayName}</Text>
                            <Text style={[styles.fileSize, { color: pColor }]}>{item.fileSize}</Text>
                          </View>

                          {/* Metadata: dot-separated single line */}
                          <Text style={styles.metaLine}>
                            {[item.ripFormat, item.codec, item.audioTracks].filter(Boolean).join('  ·  ')}
                          </Text>

                          {/* Action Buttons */}
                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={[styles.dlBtn, { backgroundColor: pColor }]}
                              onPress={() => handleDownload(item, 'download')}
                              disabled={isResolving}
                            >
                              {isResolving ? (
                                <ActivityIndicator size="small" color="#0A0A0C" />
                              ) : (
                                <Text style={styles.dlBtnText}>📥  DOWNLOAD</Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.copyBtn, { borderColor: `${pColor}50` }]}
                              onPress={() => handleDownload(item, 'copy')}
                              disabled={isResolving}
                            >
                              <Text style={[styles.copyBtnText, { color: pColor }]}>🔗  COPY LINK</Text>
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

        {/* Initial Empty State */}
        {!isSearching && options.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-download-outline" size={44} color="rgba(255,255,255,0.1)" />
            <Text style={styles.emptyText}>Downloader Terminal Ready</Text>
            <Text style={styles.emptySubText}>Enter a title above and tap SCRAPE</Text>
          </View>
        )}

        {/* ── SCRAPER LOGS (always at bottom, collapsible) ── */}
        {statusLog.length > 0 && (
          <View style={styles.logBox}>
            <TouchableOpacity
              style={styles.logHeader}
              onPress={() => setLogsExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={styles.logHeaderLeft}>
                <Ionicons name="terminal-outline" size={12} color="rgba(0,229,255,0.7)" />
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'Ndot57',
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'NType82Mono',
    fontSize: 12,
    padding: 0,
  },
  scrapeBtn: {
    backgroundColor: '#FFE500',
    paddingHorizontal: 16,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  scrapeBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#0A0A0C',
  },

  // Quality Pills
  qualityRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  qualityPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'transparent',
  },
  qualityPillActive: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  qualityPillText: {
    fontFamily: 'NType82Mono',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  qualityPillTextActive: {
    color: '#0A0A0C',
  },

  // Series Mode Row
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 4,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modePillActive: {
    borderColor: '#FFE500',
    backgroundColor: 'rgba(255,229,0,0.08)',
  },
  modePillText: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
  },
  modePillTextActive: {
    color: '#FFE500',
  },

  // Episode Grid Section
  episodeSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    marginBottom: 10,
  },
  providerSwitcherRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  provPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  provPillText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    fontWeight: '600',
  },
  epGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  epButton: {
    width: (SCREEN_WIDTH - 56) / 3,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  epBtnText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
  },

  // Provider Groups & Accordions
  providerGroupWrap: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupTitle: {
    fontFamily: 'Ndot57',
    fontSize: 13,
    letterSpacing: 1,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  countBadgeText: {
    fontFamily: 'NType82Mono',
    fontSize: 8,
    fontWeight: '600',
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapseHintText: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    letterSpacing: 0.5,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },

  // Provider cards
  providerCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  providerName: {
    fontFamily: 'NType82Mono',
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fileSize: {
    fontFamily: 'NType82Mono',
    fontSize: 12,
    color: '#FFE500',
  },
  metaLine: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dlBtn: {
    flex: 2,
    backgroundColor: '#FFE500',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dlBtnText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#0A0A0C',
    fontWeight: '600',
  },
  copyBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  copyBtnText: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyText: {
    fontFamily: 'NType82Mono',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  emptySubText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.18)',
  },

  // Section label
  sectionLabel: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
    letterSpacing: 0.5,
  },

  // Logs
  logBox: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logTitle: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(0,229,255,0.7)',
    letterSpacing: 1,
  },
  logLine: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(0,255,136,0.7)',
    lineHeight: 14,
  },
});
