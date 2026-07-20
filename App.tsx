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
  Dimensions
} from 'react-native';
import { useFonts } from 'expo-font';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as htmlparser2 from 'htmlparser2';

const { width } = Dimensions.get('window');

// Redirection Hubs
const ROTATORS = {
  vegamovies: "https://vglist.top/?re=vegamovies",
  rogmovies: "https://vglist.top/?re=rogmovies",
  anime: "https://vglist.top/?re=anime",
  hollywood: "https://modlist.in/?type=hollywood",
  bollywood: "https://modlist.in/?type=bollywood",
  animeflix: "https://modlist.in/?type=animeflix"
};

type SearchResult = {
  title: string;
  link: string;
  siteName: string;
  category: string;
};

type SearchTask = {
  siteKey: string;
  searchUrl: string;
};

export default function App() {
  // Load Nothing OS custom fonts
  const [fontsLoaded] = useFonts({
    'Ndot55': require('./assets/fonts/Ndot55-Regular.otf'),
    'Ndot57': require('./assets/fonts/Ndot57-Regular.otf'),
    'NType82Mono': require('./assets/fonts/NType82Mono-Regular.otf'),
    'LetteraMono': require('./assets/fonts/LetteraMonoLL-Regular.otf'),
  });

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'hollywood' | 'bollywood' | 'anime'>('all');
  const [resolvedDomains, setResolvedDomains] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [searchTasks, setSearchTasks] = useState<SearchTask[]>([]);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const searchId = useRef(0);

  // Load latest domains on startup
  useEffect(() => {
    resolveAllDomains();
  }, []);

  const extractDomainFromHtml = (html: string): string | null => {
    const refreshMatch = html.match(/url=(https?:\/\/[^"'\s>]+)/i);
    if (refreshMatch) return refreshMatch[1];

    const redirectMatch = html.match(/Redirecting to\s+(https?:\/\/[^"'\s<]+)/i);
    if (redirectMatch) return redirectMatch[1];

    return null;
  };

  const resolveAllDomains = async () => {
    setStatusMessage('Syncing latest links...');
    const domains: Record<string, string> = {};
    const promises = Object.entries(ROTATORS).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        const html = await response.text();
        let finalUrl = extractDomainFromHtml(html);

        if (finalUrl) {
          if (finalUrl.endsWith('/')) finalUrl = finalUrl.slice(0, -1);
          domains[key] = finalUrl;
          console.log(`Resolved ${key} -> ${finalUrl}`);
        } else {
          throw new Error('No redirect URL found in HTML');
        }
      } catch (error) {
        console.error(`Failed to resolve ${key}:`, error);
        // Fallbacks
        if (key === 'vegamovies') domains[key] = 'https://vegamovies.navy';
        else if (key === 'hollywood') domains[key] = 'https://moviesmod.at';
        else if (key === 'bollywood') domains[key] = 'https://moviesleech.asia';
        else if (key === 'animeflix') domains[key] = 'https://animeflix.dad';
        else domains[key] = url;
      }
    });

    await Promise.all(promises);
    setResolvedDomains(domains);
    setStatusMessage('');
    loadTrending(domains);
  };

  // Dynamic Trending items based on resolved domains
  const loadTrending = (domains: Record<string, string>) => {
    const defaultTrending: SearchResult[] = [
      { title: "Peaky Blinders Season 1-6 [Hindi + English]", link: `${domains.vegamovies || 'https://vegamovies.navy'}/download-peaky-blinders-season-1-6-hindi-org-480p-720p-1080p-bluray/`, siteName: "Vegamovies", category: "hollywood" },
      { title: "Oppenheimer (2023) [Hindi + English] 4K", link: `${domains.hollywood || 'https://moviesmod.at'}/download-oppenheimer-2023-hindi-english/`, siteName: "MoviesMod", category: "hollywood" },
      { title: "Demon Slayer: Kimetsu no Yaiba - Hashira Training Arc", link: `${domains.anime || 'https://vglist.top/?re=anime'}/demon-slayer-hashira-training/`, siteName: "Anime", category: "anime" },
      { title: "Jawan (2023) [Hindi] Bluray", link: `${domains.bollywood || 'https://moviesleech.asia'}/jawan-2023-hindi-download/`, siteName: "MoviesLeech", category: "bollywood" }
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

    // Select active search tasks based on category filter
    const tasks: SearchTask[] = [];

    if (category === 'all' || category === 'hollywood') {
      if (resolvedDomains.vegamovies) {
        tasks.push({
          siteKey: 'Vegamovies',
          searchUrl: `${resolvedDomains.vegamovies}/search.html?q=${encodeURIComponent(query)}`
        });
      }
      if (resolvedDomains.hollywood) {
        tasks.push({
          siteKey: 'MoviesMod',
          searchUrl: `${resolvedDomains.hollywood}/?s=${encodeURIComponent(query)}`
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
      if (resolvedDomains.bollywood) {
        tasks.push({
          siteKey: 'MoviesLeech',
          searchUrl: `${resolvedDomains.bollywood}/?s=${encodeURIComponent(query)}`
        });
      }
    }

    if (category === 'all' || category === 'anime') {
      if (resolvedDomains.anime) {
        tasks.push({
          siteKey: 'AnimeList',
          searchUrl: `${resolvedDomains.anime}/?s=${encodeURIComponent(query)}`
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

    // Timeout loading if takes too long
    setTimeout(() => {
      if (searchId.current === currentId) {
        setLoading(false);
        setStatusMessage('');
      }
    }, 15000);
  };

  // Parser to extract titles and links from HTML
  const parseHTML = (html: string, siteKey: string): SearchResult[] => {
    const extracted: SearchResult[] = [];
    let currentTag = '';
    let currentHref = '';
    let textContent = '';
    let insideHeading = false;

    const parser = new htmlparser2.Parser({
      onopentag(name, attribs) {
        currentTag = name;
        if (name === 'h2' || name === 'h3' || name === 'h1') {
          insideHeading = true;
        }
        if (name === 'a' && attribs.href) {
          currentHref = attribs.href;
        }
      },
      ontext(text) {
        if (currentHref && text.trim().length > 0) {
          textContent += text;
        }
      },
      onclosetag(name) {
        if (name === 'h2' || name === 'h3' || name === 'h1') {
          insideHeading = false;
        }
        if (name === 'a') {
          const cleanText = textContent.trim();
          const cleanHref = currentHref.trim();

          // Standard filter to exclude category/page/tag links
          const isInvalid = 
            cleanHref.includes('/category/') ||
            cleanHref.includes('/tag/') ||
            cleanHref.includes('/page/') ||
            cleanHref.includes('/dmca/') ||
            cleanHref.includes('/contact-') ||
            cleanHref.includes('/privacy-policy/') ||
            cleanHref === '#' ||
            cleanHref.startsWith('javascript:');

          if (cleanHref && cleanText.length > 5 && !isInvalid) {
            // Keep if inside a heading tag or is matching typical title patterns
            if (insideHeading || cleanText.toLowerCase().includes('download') || cleanText.toLowerCase().includes('season')) {
              extracted.push({
                title: cleanText.replace(/\s+/g, ' '),
                link: cleanHref,
                siteName: siteKey,
                category: category
              });
            }
          }
          currentHref = '';
          textContent = '';
        }
      }
    });

    parser.write(html);
    parser.end();

    // Deduplicate items based on link
    const uniqueMap = new Map<string, SearchResult>();
    extracted.forEach(item => uniqueMap.set(item.link, item));
    return Array.from(uniqueMap.values());
  };

  const handleWebViewMessage = (siteKey: string, html: string) => {
    const parsedResults = parseHTML(html, siteKey);
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
        enableDefaultShare: true,
        toolbarColor: '#0A0A0C',
        secondaryToolbarColor: '#0A0A0C',
      });
    } catch {
      Linking.openURL(url);
    }
  };

  if (!fontsLoaded) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="small" color="#FF0000" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
      
      {/* Nothing OS Dot-Matrix Brand Header */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>MOVIESHOUND</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, Object.keys(resolvedDomains).length > 0 ? styles.dotGreen : styles.dotRed]} />
          <Text style={styles.brandSubtitle}>
            {Object.keys(resolvedDomains).length > 0 ? 'SYNCED' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Spacious Search Bar Input */}
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

      {/* Retro-industrial Pills for Categories */}
      <View style={styles.categoryRow}>
        {(['all', 'hollywood', 'bollywood', 'anime'] as const).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryPill, category === cat && styles.categoryPillActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
              {cat.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Status Bar / Loaders */}
      {statusMessage ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{statusMessage.toUpperCase()}</Text>
        </View>
      ) : null}

      {loading && <ActivityIndicator size="small" color="#FF0000" style={styles.spinner} />}

      {/* Main Content Grid */}
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
          <TouchableOpacity style={styles.card} onPress={() => openLink(item.link)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardBadge}>{item.siteName.toUpperCase()}</Text>
              <Text style={styles.arrowIcon}>↗</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>NO RESULTS FOUND</Text>
            </View>
          ) : null
        }
      />

      {/* Hidden WebViews for Parallel Client-Side Web Scraping */}
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
  center: {
    justifyContent: 'center',
    alignItems: 'center',
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
  categoryPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
  },
  categoryPillActive: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  categoryText: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  categoryTextActive: {
    color: '#0A0A0C',
    fontWeight: 'bold',
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
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardBadge: {
    fontFamily: 'LetteraMono',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  arrowIcon: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  cardTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 18,
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
