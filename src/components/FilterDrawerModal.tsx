import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface FilterOptions {
  mediaType: 'movie' | 'tv' | 'anime' | 'both';
  selectedLanguage: string;
  selectedYear: string;
  selectedOtts: string[];
  selectedGenres: number[];
  minRating: number;
  sortBy: string;
}

interface FilterDrawerModalProps {
  visible: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterOptions) => void;
  initialFilters?: FilterOptions;
}

const GENRE_LIST = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
];

const LANGUAGE_LIST = [
  { id: 'all', name: 'All Languages' },
  { id: 'en', name: 'English' },
  { id: 'hi', name: 'Hindi' },
  { id: 'ja', name: 'Japanese' },
  { id: 'ko', name: 'Korean' },
  { id: 'es', name: 'Spanish' },
  { id: 'fr', name: 'French' },
];

const YEAR_LIST = ['all', '2026', '2025', '2024', '2023', '2020s', '2010s'];

const RATING_STEPS = [0, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

const OTT_LIST = [
  { id: 'netflix', name: 'Netflix' },
  { id: 'prime', name: 'Prime Video' },
  { id: 'disney', name: 'Disney+' },
  { id: 'apple', name: 'Apple TV+' },
  { id: 'hbo', name: 'HBO Max' },
  { id: 'hulu', name: 'Hulu' },
];

const SORT_OPTIONS = [
  { label: 'Popularity', value: 'popularity.desc' },
  { label: 'Rating', value: 'vote_average.desc' },
  { label: 'Release Date', value: 'primary_release_date.desc' },
];

export const FilterDrawerModal: React.FC<FilterDrawerModalProps> = ({
  visible,
  onClose,
  onApplyFilters,
  initialFilters,
}) => {
  const [mediaType, setMediaType] = useState<'movie' | 'tv' | 'anime' | 'both'>(
    initialFilters?.mediaType || 'both'
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    initialFilters?.selectedLanguage || 'all'
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    initialFilters?.selectedYear || 'all'
  );
  const [selectedOtts, setSelectedOtts] = useState<string[]>(
    initialFilters?.selectedOtts || []
  );
  const [selectedGenres, setSelectedGenres] = useState<number[]>(
    initialFilters?.selectedGenres || []
  );
  const [minRating, setMinRating] = useState<number>(
    initialFilters?.minRating || 0
  );
  const [sortBy, setSortBy] = useState<string>(
    initialFilters?.sortBy || 'popularity.desc'
  );

  const toggleOtt = (id: string) => {
    if (selectedOtts.includes(id)) {
      setSelectedOtts(selectedOtts.filter((item) => item !== id));
    } else {
      setSelectedOtts([...selectedOtts, id]);
    }
  };

  const toggleGenre = (id: number) => {
    if (selectedGenres.includes(id)) {
      setSelectedGenres(selectedGenres.filter((item) => item !== id));
    } else {
      setSelectedGenres([...selectedGenres, id]);
    }
  };

  const handleReset = () => {
    setMediaType('both');
    setSelectedLanguage('all');
    setSelectedYear('all');
    setSelectedOtts([]);
    setSelectedGenres([]);
    setMinRating(0);
    setSortBy('popularity.desc');
  };

  const handleApply = () => {
    onApplyFilters({
      mediaType,
      selectedLanguage,
      selectedYear,
      selectedOtts,
      selectedGenres,
      minRating,
      sortBy,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={styles.drawer}>
          <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Ionicons name="options-outline" size={20} color="#FF2D55" />
                <Text style={styles.titleText}>SWIPARR DISCOVERY FILTER</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Type Selector */}
              <Text style={styles.sectionTitle}>CONTENT TYPE</Text>
              <View style={styles.wrapRow}>
                {(['both', 'movie', 'tv', 'anime'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.chip,
                      mediaType === type && styles.chipActive,
                    ]}
                    onPress={() => setMediaType(type)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        mediaType === type && styles.chipTextActive,
                      ]}
                    >
                      {type === 'both' ? 'ALL' : type === 'movie' ? 'MOVIES' : type === 'tv' ? 'SERIES' : 'ANIME ⛩️'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Language Selector */}
              <Text style={styles.sectionTitle}>AUDIO / SUBTITLE LANGUAGE</Text>
              <View style={styles.wrapRow}>
                {LANGUAGE_LIST.map((lang) => (
                  <TouchableOpacity
                    key={lang.id}
                    style={[
                      styles.chip,
                      selectedLanguage === lang.id && styles.chipActive,
                    ]}
                    onPress={() => setSelectedLanguage(lang.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedLanguage === lang.id && styles.chipTextActive,
                      ]}
                    >
                      {lang.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Release Year Filter */}
              <Text style={styles.sectionTitle}>RELEASE YEAR</Text>
              <View style={styles.wrapRow}>
                {YEAR_LIST.map((yr) => (
                  <TouchableOpacity
                    key={yr}
                    style={[
                      styles.chip,
                      selectedYear === yr && styles.chipActive,
                    ]}
                    onPress={() => setSelectedYear(yr)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedYear === yr && styles.chipTextActive,
                      ]}
                    >
                      {yr === 'all' ? 'ALL YEARS' : yr}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Genres */}
              <Text style={styles.sectionTitle}>GENRES</Text>
              <View style={styles.wrapRow}>
                {GENRE_LIST.map((genre) => {
                  const active = selectedGenres.includes(genre.id);
                  return (
                    <TouchableOpacity
                      key={genre.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleGenre(genre.id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {genre.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Min Rating with 0.5 Increments */}
              <Text style={styles.sectionTitle}>MINIMUM RATING (0.5 STEPS)</Text>
              <View style={styles.wrapRow}>
                {RATING_STEPS.map((rating) => (
                  <TouchableOpacity
                    key={rating}
                    style={[
                      styles.chip,
                      minRating === rating && styles.chipActive,
                    ]}
                    onPress={() => setMinRating(rating)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        minRating === rating && styles.chipTextActive,
                      ]}
                    >
                      {rating === 0 ? 'ANY ★' : `★ ${rating.toFixed(1)}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Sort By */}
              <Text style={styles.sectionTitle}>SORT BY</Text>
              <View style={styles.row}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.typeChip,
                      sortBy === opt.value && styles.typeChipActive,
                    ]}
                    onPress={() => setSortBy(opt.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        sortBy === opt.value && styles.chipTextActive,
                      ]}
                    >
                      {opt.label.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Major OTTs / Platforms (Moved to completely bottom) */}
              <Text style={styles.sectionTitle}>STREAMING PLATFORMS / OTTs</Text>
              <View style={[styles.wrapRow, { marginBottom: 24 }]}>
                {OTT_LIST.map((ott) => {
                  const active = selectedOtts.includes(ott.id);
                  return (
                    <TouchableOpacity
                      key={ott.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleOtt(ott.id)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {ott.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Actions */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetText}>RESET</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
                <Text style={styles.applyText}>APPLY FILTERS</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  drawer: {
    backgroundColor: '#0F0F13',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  safeArea: {
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sectionTitle: {
    fontFamily: 'System',
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#1E1E24',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  typeChipActive: {
    backgroundColor: 'rgba(255, 45, 85, 0.15)',
    borderColor: '#FF2D55',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1E1E24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  chipActive: {
    backgroundColor: 'rgba(255, 45, 85, 0.15)',
    borderColor: '#FF2D55',
  },
  chipText: {
    fontFamily: 'System',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  chipTextActive: {
    color: '#FF2D55',
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 10,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#1E1E24',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  resetText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  applyButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
  },
  applyText: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
