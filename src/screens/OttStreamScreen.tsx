import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  movieboxService,
  MovieBoxSubject,
  MovieBoxSection,
} from '../services/movieboxService';
import { OttDetailSheet } from '../components/OttDetailSheet';
import { triggerLightHaptic, triggerSelectionHaptic } from '../utils/HapticsHelper';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 44) / 2;

type CategoryTab = 'trending' | 'movies' | 'series' | 'anime';

export default function OttStreamScreen() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<{ title: string; slug: string; subject_id: string }[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<MovieBoxSubject[]>([]);

  // Category Feed States
  const [activeTab, setActiveTab] = useState<CategoryTab>('trending');
  const [bannerItems, setBannerItems] = useState<MovieBoxSubject[]>([]);
  const [feedItems, setFeedItems] = useState<MovieBoxSubject[]>([]);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Selected Detail Modal
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  // Initial Load
  useEffect(() => {
    loadCategoryFeed(activeTab, 1, true);
  }, [activeTab]);

  const loadCategoryFeed = async (tab: CategoryTab, pageNum: number = 1, isInitial: boolean = false) => {
    if (isInitial) setLoading(true);

    try {
      if (tab === 'trending') {
        // Load homepage feed
        const sections = await movieboxService.getHomeFeed();
        const banners = sections.find((s) => s.section.toLowerCase().includes('banner'))?.items || [];
        setBannerItems(banners);

        const allSubjects: MovieBoxSubject[] = [];
        for (const s of sections) {
          if (!s.section.toLowerCase().includes('banner')) {
            allSubjects.push(...s.items);
          }
        }
        setFeedItems(allSubjects);
      } else {
        // TabId mapping: 2 = Movies, 5 = TV Series, 8 = Anime
        const tabId = tab === 'movies' ? 2 : tab === 'series' ? 5 : 8;
        const items = await movieboxService.getCategorySubjects(tabId, pageNum);
        if (pageNum === 1) {
          setFeedItems(items);
        } else {
          setFeedItems((prev) => [...prev, ...items]);
        }
      }
    } catch (e) {
      console.warn('[OttStreamScreen] Failed to load category feed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadCategoryFeed(activeTab, 1, false);
  };

  const handleLoadMore = () => {
    if (activeTab !== 'trending' && !loadingMore && feedItems.length > 0) {
      setLoadingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      loadCategoryFeed(activeTab, nextPage, false);
    }
  };

  // Search logic with live suggestions
  const handleQueryChange = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length > 1) {
      const suggs = await movieboxService.getSuggestions(text);
      setSuggestions(suggs);
    } else {
      setSuggestions([]);
    }
  };

  const handleExecuteSearch = async (queryToSearch?: string) => {
    const q = queryToSearch || searchQuery;
    if (!q.trim()) return;

    triggerLightHaptic();
    setIsSearching(true);
    setSuggestions([]);
    setLoading(true);

    try {
      const results = await movieboxService.search(q);
      setSearchResults(results);
    } catch (e) {
      console.warn('[OttStreamScreen] Search failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setIsSearching(false);
    setSearchResults([]);
  };

  const handleSelectCard = (slug: string) => {
    triggerLightHaptic();
    setSelectedSlug(slug);
  };

  const renderSubjectCard = ({ item }: { item: MovieBoxSubject }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleSelectCard(item.slug)}
      activeOpacity={0.75}
    >
      <View style={styles.posterWrapper}>
        {item.poster_url ? (
          <Image source={{ uri: item.poster_url }} style={styles.cardPoster} resizeMode="cover" />
        ) : (
          <View style={[styles.cardPoster, styles.posterFallback]}>
            <Ionicons name="film-outline" size={28} color="#555" />
          </View>
        )}

        {/* Top Badges: Rating & Corner Label */}
        <View style={styles.badgeTopRow}>
          {item.rating ? (
            <View style={styles.starBadge}>
              <Ionicons name="star" size={10} color="#ffb703" />
              <Text style={styles.starBadgeText}>{item.rating}</Text>
            </View>
          ) : null}

          {item.badge ? (
            <View style={styles.cornerBadge}>
              <Text style={styles.cornerBadgeText} numberOfLines={1}>
                {item.badge}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Overlay Play Icon on Hover/Touch */}
        <View style={styles.playOverlay}>
          <Ionicons name="play" size={16} color="#000" />
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title}
      </Text>
      {item.year ? <Text style={styles.cardYear}>{item.year}</Text> : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <MaterialCommunityIcons name="lightning-bolt" size={22} color="#00e5ff" />
          <Text style={styles.brandTitle}>OTT STREAM</Text>
          <View style={styles.proTag}>
            <Text style={styles.proTagText}>FAST 1080P</Text>
          </View>
        </View>

        {/* Live Search Input Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#888" style={{ marginLeft: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Movies, Series, Anime..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={handleQueryChange}
            onSubmitEditing={() => handleExecuteSearch()}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearSearchBtn} onPress={handleClearSearch}>
              <Ionicons name="close-circle" size={18} color="#888" />
            </TouchableOpacity>
          )}
        </View>

        {/* Autocomplete Suggestions Dropdown */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
            {suggestions.map((s, idx) => (
              <TouchableOpacity
                key={`${s.slug || s.title}-${idx}`}
                style={styles.suggestionItem}
                onPress={() => {
                  setSearchQuery(s.title);
                  handleExecuteSearch(s.title);
                }}
              >
                <Ionicons name="search-outline" size={14} color="#888" />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {s.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Category Pills Bar (Hidden when searching) */}
      {!isSearching && (
        <View style={styles.categoryBarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryBar}>
            <TouchableOpacity
              style={[styles.categoryChip, activeTab === 'trending' && styles.categoryChipActive]}
              onPress={() => {
                triggerSelectionHaptic();
                setActiveTab('trending');
              }}
            >
              <Ionicons
                name="flame"
                size={14}
                color={activeTab === 'trending' ? '#000' : '#888'}
              />
              <Text
                style={[styles.categoryChipText, activeTab === 'trending' && styles.categoryChipTextActive]}
              >
                Trending
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryChip, activeTab === 'movies' && styles.categoryChipActive]}
              onPress={() => {
                triggerSelectionHaptic();
                setActiveTab('movies');
              }}
            >
              <Ionicons
                name="film"
                size={14}
                color={activeTab === 'movies' ? '#000' : '#888'}
              />
              <Text
                style={[styles.categoryChipText, activeTab === 'movies' && styles.categoryChipTextActive]}
              >
                Movies
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryChip, activeTab === 'series' && styles.categoryChipActive]}
              onPress={() => {
                triggerSelectionHaptic();
                setActiveTab('series');
              }}
            >
              <Ionicons
                name="tv"
                size={14}
                color={activeTab === 'series' ? '#000' : '#888'}
              />
              <Text
                style={[styles.categoryChipText, activeTab === 'series' && styles.categoryChipTextActive]}
              >
                TV Series
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryChip, activeTab === 'anime' && styles.categoryChipActive]}
              onPress={() => {
                triggerSelectionHaptic();
                setActiveTab('anime');
              }}
            >
              <Ionicons
                name="sparkles"
                size={14}
                color={activeTab === 'anime' ? '#000' : '#888'}
              />
              <Text
                style={[styles.categoryChipText, activeTab === 'anime' && styles.categoryChipTextActive]}
              >
                Anime
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Main Content Grid */}
      {loading && !refreshing ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color="#00e5ff" />
          <Text style={styles.loadingSubText}>Connecting to MovieBox Stream Gateway...</Text>
        </View>
      ) : (
        <FlatList
          data={isSearching ? searchResults : feedItems}
          keyExtractor={(item, index) => `${item.slug || item.subject_id || item.title || 'item'}-${index}`}
          renderItem={renderSubjectCard}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#00e5ff"
              colors={['#00e5ff']}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color="#00e5ff" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={48} color="#444" />
              <Text style={styles.emptyStateText}>
                {isSearching ? 'No titles found for this query.' : 'No titles available.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Detail & Episode Modal */}
      {selectedSlug && (
        <OttDetailSheet
          visible={!!selectedSlug}
          slug={selectedSlug}
          onClose={() => setSelectedSlug(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080c',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#07080c',
    zIndex: 20,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  brandTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  proTag: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00e5ff',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  proTagText: {
    color: '#00e5ff',
    fontSize: 10,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13141f',
    borderRadius: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#222433',
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    paddingHorizontal: 10,
  },
  clearSearchBtn: {
    padding: 8,
  },
  suggestionsBox: {
    position: 'absolute',
    top: 92,
    left: 16,
    right: 16,
    backgroundColor: '#161724',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292b3d',
    zIndex: 50,
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2130',
    gap: 8,
  },
  suggestionText: {
    color: '#ddd',
    fontSize: 13,
    flex: 1,
  },
  categoryBarContainer: {
    height: 44,
    backgroundColor: '#07080c',
  },
  categoryBar: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#13141f',
    borderWidth: 1,
    borderColor: '#222433',
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#00e5ff',
    borderColor: '#00e5ff',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: '#000',
  },
  loadingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingSubText: {
    color: '#666',
    fontSize: 13,
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  card: {
    width: CARD_WIDTH,
  },
  posterWrapper: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#13141f',
    borderWidth: 1,
    borderColor: '#1f2030',
    position: 'relative',
  },
  cardPoster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTopRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  starBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  starBadgeText: {
    color: '#ffb703',
    fontSize: 10,
    fontWeight: '800',
  },
  cornerBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.85)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 70,
  },
  cornerBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '800',
  },
  playOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#00e5ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00e5ff',
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  cardTitle: {
    color: '#eee',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  cardYear: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    color: '#666',
    fontSize: 14,
    marginTop: 12,
  },
});
