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
  Linking
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import { CategoryPill } from '../components/CategoryPill';
import { ResultCard } from '../components/ResultCard';
import { SearchResult, parseHTML } from '../utils/parser';
import { resolveAllDomains } from '../utils/resolver';

type SearchTask = {
  siteKey: string;
  searchUrl: string;
};

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'hollywood' | 'bollywood' | 'anime'>('all');
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [searchTasks, setSearchTasks] = useState<SearchTask[]>([]);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const searchId = useRef(0);

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    const domains = await resolveAllDomains(setStatusMessage);
    setResolvedDomains(domains);
    loadTrending(domains);
  };

  const loadTrending = (domains: Record<string, string>) => {
    const defaultTrending: SearchResult[] = [
      { title: "Peaky Blinders Season 1-6 [Hindi + English]", link: `${domains.vegamovies || 'https://vegamovies.navy'}/download-peaky-blinders-season-1-6-hindi-org-480p-720p-1080p-bluray/`, siteName: "Vegamovies", category: "hollywood" },
      { title: "Oppenheimer (2023) [Hindi + English] 4K", link: `${domains.moviesmod || 'https://moviesmod.at'}/download-oppenheimer-2023-hindi-english/`, siteName: "MoviesMod", category: "hollywood" },
      { title: "Demon Slayer: Kimetsu no Yaiba - Hashira Training Arc", link: `${domains.gokuhd || 'https://gokuhd.com'}/demon-slayer-hashira-training/`, siteName: "GokuHD", category: "anime" },
      { title: "Jawan (2023) [Hindi] Bluray", link: `${domains.topmovies || 'https://moviesleech.asia'}/jawan-2023-hindi-download/`, siteName: "TopMovies", category: "bollywood" }
    ];
    setTrending(defaultTrending);
  };

  const handleSearchSubmit = () => {
    if (!query.trim()) return;
    searchId.current += 1;
    const currentId = searchId.current;

    setResults([]);
    setLoading(true);
    setStatusMessage('Bypassing security...');

    const tasks: SearchTask[] = [];

    if (category === 'all' || category === 'hollywood') {
      if (resolvedDomains.vegamovies) {
        tasks.push({
          siteKey: 'Vegamovies',
          searchUrl: `${resolvedDomains.vegamovies}/search.html?q=${encodeURIComponent(query)}`
        });
      }
      if (resolvedDomains.moviesmod) {
        tasks.push({
          siteKey: 'MoviesMod',
          searchUrl: `${resolvedDomains.moviesmod}/?s=${encodeURIComponent(query)}`
        });
      }
    }

    if (category === 'all' || category === 'bollywood') {
      if (resolvedDomains.rogmovies) {
        tasks.push({
          siteKey: 'RogMovies',
          searchUrl: `${resolvedDomains.rogmovies}/?s=${encodeURIComponent(query)}`
        });
      }
      if (resolvedDomains.topmovies) {
        tasks.push({
          siteKey: 'TopMovies',
          searchUrl: `${resolvedDomains.topmovies}/?s=${encodeURIComponent(query)}`
        });
      }
    }

    if (category === 'all' || category === 'anime') {
      if (resolvedDomains.gokuhd) {
        tasks.push({
          siteKey: 'GokuHD',
          searchUrl: `${resolvedDomains.gokuhd}/?s=${encodeURIComponent(query)}`
        });
      }
      if (resolvedDomains.animeflix) {
        tasks.push({
          siteKey: 'Animeflix',
          searchUrl: `${resolvedDomains.animeflix}/?s=${encodeURIComponent(query)}`
        });
      }
    }

    setSearchTasks(tasks);

    setTimeout(() => {
      if (searchId.current === currentId) {
        setLoading(false);
        setStatusMessage('');
      }
    }, 15000);
  };

  const handleWebViewMessage = (siteKey: string, html: string) => {
    const parsedResults = parseHTML(html, siteKey, category);
    setResults(prev => {
      const combined = [...prev, ...parsedResults];
      const unique = new Map<string, SearchResult>();
      combined.forEach(item => unique.set(item.link, item));
      return Array.from(unique.values());
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
      
      {/* Brand Header */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>MOVIESHOUND</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, Object.keys(resolvedDomains).length > 0 ? styles.dotGreen : styles.dotRed]} />
          <Text style={styles.brandSubtitle}>
            {Object.keys(resolvedDomains).length > 0 ? 'SYNCED' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Search Input Container */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="SEARCH MULTIPLE SITES..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearchSubmit}
          autoCorrect={false}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearchSubmit}>
          <Text style={styles.searchButtonText}>GO</Text>
        </TouchableOpacity>
      </View>

      {/* Category Selection Row */}
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

      {/* Loading & Status Indications */}
      {statusMessage ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{statusMessage.toUpperCase()}</Text>
        </View>
      ) : null}

      {loading && <ActivityIndicator size="small" color="#FF0000" style={styles.spinner} />}

      {/* Results Grid / List */}
      <FlatList
        data={results.length > 0 ? results : trending}
        keyExtractor={(item) => item.link}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          results.length === 0 ? (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>TRENDING SELECTION</Text>
            </View>
          ) : null
        }
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
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  dotGreen: {
    backgroundColor: '#00FF88',
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
  searchContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 0,
    backgroundColor: 'rgba(255,255,255,0.02)',
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
    color: '#FF2D55',
    letterSpacing: 1.5,
  },
  spinner: {
    marginVertical: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5,
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
  hiddenContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  }
});
