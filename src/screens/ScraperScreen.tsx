import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator
} from 'react-native';
import { parseHTML, SearchResult } from '../utils/parser';

export const ScraperScreen: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'vegamovies' | 'bollyflix' | 'moviesmod'>('all');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);

    try {
      const sites = [
        { name: 'VegaMovies', domain: 'vegamovies.im' },
        { name: 'BollyFlix', domain: 'bollyflix.biz' },
        { name: 'MoviesMod', domain: 'moviesmod.biz' }
      ];

      const allPromises = sites.map(async (site) => {
        try {
          const res = await fetch(`https://${site.domain}/?s=${encodeURIComponent(query)}`);
          if (res.ok) {
            const html = await res.text();
            const items = parseHTML(html, site.name, 'movie', `https://${site.domain}`);
            return items;
          }
        } catch (e) {}
        return [];
      });

      const resArrays = await Promise.all(allPromises);
      const combined = resArrays.flat();
      setResults(combined);
    } catch (e) {
      console.warn('Scraper search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = results.filter(r => {
    if (activeTab === 'all') return true;
    return r.siteName.toLowerCase().includes(activeTab.toLowerCase());
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ SCRAPER & DOWNLOAD TERMINAL</Text>
      </View>

      {/* Search Input Box */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="SEARCH FAST SCRAPERS (E.G. AVATAR)..."
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnTxt}>SEARCH</Text>
        </TouchableOpacity>
      </View>

      {/* Source Filter Tabs */}
      <View style={styles.tabRow}>
        {(['all', 'vegamovies', 'bollyflix', 'moviesmod'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabPill, activeTab === tab && styles.tabPillActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Results List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={styles.loadingTxt}>SCRAPING FAST SERVERS...</Text>
        </View>
      ) : (
        <ScrollView style={styles.resultsList} contentContainerStyle={{ paddingBottom: 24 }}>
          {filteredResults.length > 0 ? (
            filteredResults.map((item, idx) => (
              <View key={`scraper-res-${idx}`} style={styles.resCard}>
                <View style={styles.resHeader}>
                  <Text style={styles.resSource}>{(item.siteName || 'SCRAPER').toUpperCase()}</Text>
                  <Text style={styles.resQuality}>FAST MIRROR</Text>
                </View>
                <Text style={styles.resTitle}>{item.title}</Text>
                
                <TouchableOpacity style={styles.linkBtn}>
                  <Text style={styles.linkBtnTxt}>↓ GET DOWNLOAD / STREAM LINK</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.centerBox}>
              <Text style={styles.emptyTxt}>
                {query ? 'NO DIRECT SCRAPER LINKS FOUND.' : 'ENTER MOVIE OR SHOW TITLE ABOVE TO SCRAPE.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontFamily: 'Ndot57',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  searchBox: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'LetteraMono',
    fontSize: 11,
    color: '#FFFFFF',
  },
  searchBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchBtnTxt: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: '#FFFFFF',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tabPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  tabPillActive: {
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
  },
  tabTxt: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  tabTxtActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingTxt: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 12,
  },
  emptyTxt: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  resultsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  resCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  resHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  resSource: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FF2D55',
  },
  resQuality: {
    fontFamily: 'NType82Mono',
    fontSize: 9,
    color: '#FFE500',
  },
  resTitle: {
    fontFamily: 'LetteraMono',
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  resSub: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 10,
  },
  linkBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  linkBtnTxt: {
    fontFamily: 'Ndot57',
    fontSize: 10,
    color: '#FFFFFF',
  },
});
