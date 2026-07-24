import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SearchResult, parseHTML } from '../utils/parser';
import { resolveAllDomains } from '../utils/resolver';

interface DownloaderScreenProps {
  initialSearchQuery?: string;
}

type SearchTask = {
  siteKey: string;
  searchUrl: string;
};

export default function DownloaderScreen({ initialSearchQuery = '' }: DownloaderScreenProps) {
  const [query, setQuery] = useState(initialSearchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeTaskIndex, setActiveTaskIndex] = useState<number>(-1);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialSearchQuery) {
      setQuery(initialSearchQuery);
      handleStartScrape(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  const addLog = (msg: string) => {
    setStatusLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const handleStartScrape = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    setIsSearching(true);
    setResults([]);
    setStatusLog([]);
    addLog(`Initiating multi-source scrape for: "${q}"`);

    try {
      addLog('Resolving mirror domain manifests...');
      const domains = await resolveAllDomains((msg) => addLog(msg));
      setResolvedDomains(domains);

      const taskList: SearchTask[] = [
        {
          siteKey: 'bollyflix',
          searchUrl: `${domains.bollyflix || 'https://bollyflix.com'}/?s=${encodeURIComponent(q)}`,
        },
        {
          siteKey: 'vegamovies',
          searchUrl: `${domains.vegamovies || 'https://vegamovies.net'}/?s=${encodeURIComponent(q)}`,
        },
        {
          siteKey: 'moviesmod',
          searchUrl: `${domains.moviesmod || 'https://moviesmod.com'}/?s=${encodeURIComponent(q)}`,
        },
      ];

      setTasks(taskList);
      setActiveTaskIndex(0);
      addLog(`Created ${taskList.length} scraping worker threads`);
    } catch (err: any) {
      addLog(`ERR: Failed to initialize scrapers - ${err.message}`);
      setIsSearching(false);
    }
  };

  const handleScraperHTML = (siteKey: string, html: string) => {
    addLog(`Processing raw DOM payload from worker: [${siteKey.toUpperCase()}]`);
    const domain = resolvedDomains[siteKey] || '';
    const parsed = parseHTML(html, siteKey, 'All', domain);
    addLog(`Worker [${siteKey.toUpperCase()}] extracted ${parsed.length} direct stream candidates`);

    setResults((prev) => [...prev, ...parsed]);

    if (activeTaskIndex + 1 < tasks.length) {
      setActiveTaskIndex((prev) => prev + 1);
    } else {
      setActiveTaskIndex(-1);
      setIsSearching(false);
      addLog('Scraper execution completed cleanly.');
    }
  };

  const handleOpenLink = (url: string) => {
    if (url) {
      Linking.openURL(url).catch((err) =>
        addLog(`ERR: Could not open link - ${err.message}`)
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="download-outline" size={20} color="#FFE500" />
          <Text style={styles.headerTitle}>DOWNLOADER TERMINAL</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>MULTISOURCE SCRAPER</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchSection}>
        <View style={styles.inputWrapper}>
          <Ionicons name="search-outline" size={18} color="rgba(255, 255, 255, 0.4)" />
          <TextInput
            style={styles.input}
            placeholder="Search movies/shows to scrape links..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => handleStartScrape()}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.4)" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.scrapeButton}
          onPress={() => handleStartScrape()}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Text style={styles.scrapeBtnText}>SCRAPE</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false}>
        {/* Scraper Status Box */}
        <View style={styles.terminalBox}>
          <View style={styles.terminalHeader}>
            <Ionicons name="terminal-outline" size={14} color="#00E5FF" />
            <Text style={styles.terminalTitle}>LIVE WORKER LOGS</Text>
          </View>
          <View style={styles.terminalBody}>
            {statusLog.length === 0 ? (
              <Text style={styles.logPlaceholder}>
                Terminal ready. Enter search query above or trigger download options from player.
              </Text>
            ) : (
              statusLog.map((log, idx) => (
                <Text key={idx} style={styles.logText}>
                  {log}
                </Text>
              ))
            )}
          </View>
        </View>

        {/* Results List */}
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>
            FOUND CANDIDATES ({results.length})
          </Text>
        </View>

        {results.length === 0 && !isSearching ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cloud-download-outline" size={48} color="rgba(255, 255, 255, 0.15)" />
            <Text style={styles.emptyText}>No direct file download links extracted yet</Text>
          </View>
        ) : (
          results.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.resultCard}
              onPress={() => handleOpenLink(item.link)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.sourceTag}>
                  <Text style={styles.sourceTagText}>{item.siteName?.toUpperCase() || 'WEB'}</Text>
                </View>
              </View>

              {item.category ? (
                <View style={styles.qualityChip}>
                  <Text style={styles.qualityText}>{item.category}</Text>
                </View>
              ) : null}

              <View style={styles.cardFooter}>
                <Ionicons name="open-outline" size={14} color="#FFE500" />
                <Text style={styles.urlText} numberOfLines={1}>
                  {item.link}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  badge: {
    backgroundColor: 'rgba(255, 229, 0, 0.12)',
    borderWidth: 1,
    borderColor: '#FFE500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FFE500',
    letterSpacing: 1,
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161C',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 42,
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: '#FFFFFF',
  },
  scrapeButton: {
    backgroundColor: '#FFE500',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  scrapeBtnText: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#000000',
    letterSpacing: 1,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  terminalBox: {
    backgroundColor: '#050507',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 229, 255, 0.1)',
  },
  terminalTitle: {
    fontFamily: 'Ndot55',
    fontSize: 10,
    color: '#00E5FF',
    letterSpacing: 1,
  },
  terminalBody: {
    padding: 12,
    maxHeight: 140,
  },
  logPlaceholder: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  logText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: '#00E5FF',
    lineHeight: 16,
  },
  resultsHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  resultCard: {
    backgroundColor: '#16161C',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 16,
  },
  sourceTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sourceTagText: {
    fontFamily: 'LetteraMono',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  qualityChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 229, 0, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  qualityText: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FFE500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  urlText: {
    flex: 1,
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: '#FFE500',
  },
});
