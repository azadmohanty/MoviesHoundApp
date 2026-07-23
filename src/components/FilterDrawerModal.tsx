import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Modal,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar
} from 'react-native';

export interface SwiparrFilters {
  mediaType: 'movie' | 'tv' | 'both';
  genres: string[];
  excludedGenres: string[];
  ottProviders: string[];
  minYear: number;
  maxYear: number;
  minRating: number;
  sortBy: 'Popularity' | 'Top Rated' | 'Release Date' | 'Trending';
}

export const DEFAULT_SWIPARR_FILTERS: SwiparrFilters = {
  mediaType: 'both',
  genres: [],
  excludedGenres: [],
  ottProviders: ['Netflix', 'Prime Video', 'Disney+', 'Apple TV+'],
  minYear: 1990,
  maxYear: 2026,
  minRating: 6.0,
  sortBy: 'Trending',
};

const GENRES_LIST = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'
];

const OTT_LIST = [
  'Netflix', 'Prime Video', 'Disney+', 'Apple TV+', 'HBO Max', 'Hulu', 'Others'
];

type FilterDrawerModalProps = {
  visible: boolean;
  filters: SwiparrFilters;
  onClose: () => void;
  onApply: (newFilters: SwiparrFilters) => void;
};

export const FilterDrawerModal: React.FC<FilterDrawerModalProps> = ({
  visible,
  filters,
  onClose,
  onApply,
}) => {
  const [localFilters, setLocalFilters] = useState<SwiparrFilters>(filters);

  const toggleGenre = (genre: string) => {
    setLocalFilters(prev => {
      const exists = prev.genres.includes(genre);
      return {
        ...prev,
        genres: exists ? prev.genres.filter(g => g !== genre) : [...prev.genres, genre],
      };
    });
  };

  const toggleOtt = (ott: string) => {
    setLocalFilters(prev => {
      const exists = prev.ottProviders.includes(ott);
      return {
        ...prev,
        ottProviders: exists ? prev.ottProviders.filter(o => o !== ott) : [...prev.ottProviders, ott],
      };
    });
  };

  const handleReset = () => {
    setLocalFilters(DEFAULT_SWIPARR_FILTERS);
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ADVANCED DISCOVERY FILTERS</Text>
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetTxt}>RESET</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 1. Content Type Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CONTENT TYPE</Text>
            <View style={styles.row}>
              {(['both', 'movie', 'tv'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.pill,
                    localFilters.mediaType === type && styles.pillActive
                  ]}
                  onPress={() => setLocalFilters({ ...localFilters, mediaType: type })}
                >
                  <Text style={[
                    styles.pillTxt,
                    localFilters.mediaType === type && styles.pillTxtActive
                  ]}>
                    {type === 'both' ? '🎬 ALL MEDIA' : type === 'movie' ? '🍿 MOVIES ONLY' : '📺 TV SERIES'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 2. Major OTT Streaming Platforms */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>STREAMING PLATFORMS (OTT)</Text>
            <View style={styles.grid}>
              {OTT_LIST.map(ott => {
                const active = localFilters.ottProviders.includes(ott);
                return (
                  <TouchableOpacity
                    key={ott}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleOtt(ott)}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                      {active ? '✓ ' : ''}{ott}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 3. Include Genres */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>GENRES (INCLUDE)</Text>
            <View style={styles.grid}>
              {GENRES_LIST.map(g => {
                const active = localFilters.genres.includes(g);
                return (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleGenre(g)}
                  >
                    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                      {active ? '✓ ' : ''}{g}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 4. Minimum TMDB Rating */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MINIMUM RATING: {localFilters.minRating.toFixed(1)} ★</Text>
            <View style={styles.row}>
              {[5.0, 6.0, 7.0, 8.0, 8.5].map(r => (
                <TouchableOpacity
                  key={`rating-${r}`}
                  style={[
                    styles.pill,
                    localFilters.minRating === r && styles.pillActive
                  ]}
                  onPress={() => setLocalFilters({ ...localFilters, minRating: r })}
                >
                  <Text style={[
                    styles.pillTxt,
                    localFilters.minRating === r && styles.pillTxtActive
                  ]}>
                    ★ {r.toFixed(1)}+
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 5. Sort By */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SORT RESULTS BY</Text>
            <View style={styles.grid}>
              {(['Trending', 'Popularity', 'Top Rated', 'Release Date'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.chip,
                    localFilters.sortBy === s && styles.chipActive
                  ]}
                  onPress={() => setLocalFilters({ ...localFilters, sortBy: s })}
                >
                  <Text style={[
                    styles.chipTxt,
                    localFilters.sortBy === s && styles.chipTxtActive
                  ]}>
                    {s.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Apply Button Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
            <Text style={styles.applyTxt}>APPLY FILTERS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtn: {
    padding: 8,
  },
  closeTxt: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  headerTitle: {
    fontFamily: 'Ndot57',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  resetBtn: {
    padding: 8,
  },
  resetTxt: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#FF2D55',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'Ndot57',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
  },
  pillTxt: {
    fontFamily: 'NType82Mono',
    fontSize: 10,
    color: '#FFFFFF',
  },
  pillTxtActive: {
    color: '#0A0A0C',
    fontWeight: 'bold',
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  chipActive: {
    backgroundColor: 'rgba(255, 45, 85, 0.2)',
    borderColor: '#FF2D55',
  },
  chipTxt: {
    fontFamily: 'LetteraMono',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  chipTxtActive: {
    color: '#FF2D55',
    fontWeight: 'bold',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#0A0A0C',
  },
  applyBtn: {
    backgroundColor: '#FF2D55',
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
  },
  applyTxt: {
    fontFamily: 'Ndot57',
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
